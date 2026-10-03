#!/usr/bin/env node
/**
 * Tasks in the running app (dev server): a Visual edit keeps every task line
 * as written, ticking in Visual and Preview writes the line, TASK blocks list
 * tasks in Preview, and the task menu edits one line.
 *
 * Needs `npm run dev` on NEXUS_URL (default http://127.0.0.1:8080/).
 * Optional: CHROME_PATH for a system Chrome.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import { chromium } from "playwright";

const URL = process.env.NEXUS_URL || "http://127.0.0.1:8080/";
const CHROME = process.env.CHROME_PATH;

const SAMPLE = [
  "---",
  "tags: [roundtrip]",
  "---",
  "# Round trip",
  "",
  "Intro",
  "",
  "- [ ] plain task 📅 2026-10-09",
  "- [/] in progress ⏫",
  "- [-] dropped ❌ 2026-09-30",
  "- [x] done ✅ 2026-10-01",
  "  - [ ] nested child [due:: 2026-10-12] [priority:: high]",
  "    - [x] grandchild",
  "- [ ] water 🔁 every week 📅 2026-10-09",
  "- [>] forwarded",
  "",
  "A list with plain bullets keeps its boxes as text:",
  "",
  "- a bullet",
  "- [ ] task in a mixed list",
  "- [/] doing in a mixed list",
  "",
  "Numbered:",
  "",
  "1. [ ] numbered task",
  "2. [x] numbered done",
  "",
  "Text with [owner:: Sam] and a [link](https://example.com) and [[Task Board]].",
  "",
  "| Write | Means |",
  "| --- | --- |",
  "| `- [ ]` | to do [[Task Board]] |",
  "",
].join("\n");

const browser = await chromium.launch({
  headless: true,
  executablePath: CHROME && fs.existsSync(CHROME) ? CHROME : undefined,
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
});
const pageErrors = [];

function changedLines(before, after) {
  const a = before.split("\n");
  const b = after.split("\n");
  return {
    added: b.filter((line) => !a.includes(line)),
    removed: a.filter((line) => !b.includes(line)),
  };
}

try {
  const page = await browser.newPage({ viewport: { width: 1400, height: 950 } });
  page.on("pageerror", (err) => pageErrors.push(String(err?.message || err)));
  await page.goto(URL, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Explore demo" }).click();
  await page.waitForFunction(() => window.__NEXUS_SCALE__?.findNoteId?.("Task Board"));
  // After hot updates the app loads the store as store.ts?t=…; import that same copy.
  await page.evaluate(() => {
    window.__appStore = async () => {
      const url = performance
        .getEntriesByType("resource")
        .map((entry) => entry.name)
        .find((name) => /\/src\/lib\/vault\/store\.ts(\?|$)/.test(name));
      return (await import(url ?? "/src/lib/vault/store.ts")).useVaultStore;
    };
  });

  const today = await page.evaluate(async () => (await import("/src/lib/tasks/dates.ts")).localToday());
  const body = (id) => page.evaluate(async (noteId) => (await window.__appStore()).getState().nodes[noteId]?.content, id);
  const reading = async (on) => {
    const now = await page.evaluate(async () => (await window.__appStore()).getState().readingView);
    if (now !== on) await page.evaluate(async () => (await window.__appStore()).getState().toggleReadingView());
    await page.waitForTimeout(700);
  };

  const id = await page.evaluate(async (md) => {
    const s = (await window.__appStore()).getState();
    const noteId = s.createNote(null, "Round Trip");
    s.updateNoteContent(noteId, md, { source: true });
    s.setActiveNote(noteId);
    return noteId;
  }, SAMPLE);
  await reading(false);
  await page.locator(".ProseMirror").first().waitFor();
  await page.waitForTimeout(600);

  // A Visual edit elsewhere leaves every task, field, and table cell as written.
  {
    await page.locator(".ProseMirror > p").filter({ hasText: /^Intro$/ }).click();
    await page.keyboard.press("End");
    await page.keyboard.type(" Z");
    await page.waitForTimeout(1500);
    const after = await body(id);
    const diff = changedLines(SAMPLE, after);
    assert.deepEqual(diff, { added: ["Intro Z"], removed: ["Intro"] }, `a Visual edit changed only the line typed in:\n${after}`);
  }

  // The editor shows a checkbox for every task in an all-task list, nested ones too.
  {
    const items = await page.locator(".ProseMirror li[data-type=taskItem]").evaluateAll((els) =>
      els.map((el) => ({ status: el.getAttribute("data-status"), checked: el.getAttribute("data-checked"), text: el.querySelector(":scope > div > p")?.textContent })),
    );
    assert.deepEqual(
      items.map((item) => item.text),
      ["plain task 📅 2026-10-09", "in progress ⏫", "dropped ❌ 2026-09-30", "done ✅ 2026-10-01", "nested child [due:: 2026-10-12] [priority:: high]", "grandchild", "water 🔁 every week 📅 2026-10-09", "forwarded"],
    );
    assert.equal(items[1].status, "/");
    assert.equal(items[2].status, "-");
    assert.equal(items[7].status, ">");
    assert.equal(items[3].checked, "true");
  }

  // Ticking in Visual adds the done date; a repeating task also gets its next copy.
  {
    const tick = async (text) => {
      const before = await body(id);
      await page.locator(".ProseMirror li[data-type=taskItem]").filter({ hasText: text }).first().locator(":scope > label input").click();
      await page.waitForTimeout(1200);
      return changedLines(before, await body(id));
    };
    assert.deepEqual(await tick("in progress"), { added: [`- [x] in progress ⏫ ✅ ${today}`], removed: ["- [/] in progress ⏫"] });
    const water = await tick("water");
    assert.deepEqual(water.removed, ["- [ ] water 🔁 every week 📅 2026-10-09"]);
    assert.deepEqual(water.added.sort(), [`- [ ] water 🔁 every week 📅 2026-10-16`, `- [x] water 🔁 every week 📅 2026-10-09 ✅ ${today}`].sort());
  }

  // Preview: the note's own boxes tick and write their line.
  {
    await reading(true);
    const wired = await page.locator(".nexus-source-preview .nexus-preview-task-box").count();
    const shown = await page.locator(".nexus-source-preview li input[type=checkbox]").count();
    assert.equal(wired, shown, "every checkbox in Preview can be ticked");
    const before = await body(id);
    await page.locator(".nexus-preview-task-box[aria-label^='Mark done: nested child']").click();
    await page.waitForTimeout(900);
    assert.deepEqual(changedLines(before, await body(id)), {
      added: [`  - [x] nested child [due:: 2026-10-12] [priority:: high] [completion:: ${today}]`],
      removed: ["  - [ ] nested child [due:: 2026-10-12] [priority:: high]"],
    });
    const mixed = await body(id);
    await page.locator(".nexus-preview-task-box[aria-label^='Mark done: task in a mixed list']").click();
    await page.waitForTimeout(900);
    assert.deepEqual(changedLines(mixed, await body(id)), {
      added: [`- [x] task in a mixed list ✅ ${today}`],
      removed: ["- [ ] task in a mixed list"],
    });
  }

  // Preview: TASK blocks list tasks, and ticking one writes its note.
  const board = await page.evaluate(() => window.__NEXUS_SCALE__.findNoteId("Task Board"));
  {
    await page.evaluate((noteId) => window.__NEXUS_SCALE__.setActiveNote(noteId), board);
    await reading(true);
    const block = page.locator(".nexus-source-preview [data-type='nexus-query']").first();
    await block.locator("[data-testid=task-item]").first().waitFor();
    assert.match(await block.locator(".nexus-query-head").innerText(), /\d+ tasks/);
    const before = await body(board);
    const row = block.locator("[data-testid=task-item]").filter({ hasText: "Send the launch notes" });
    await row.locator("[data-testid=tasks-complete]").click();
    await page.waitForTimeout(1000);
    const diff = changedLines(before, await body(board));
    assert.equal(diff.removed.length, 1);
    assert.match(diff.added[0], new RegExp(`^- \\[x\\] Send the launch notes .*✅ ${today}$`));
    assert.equal(await block.locator("[data-testid=task-item]").filter({ hasText: "Send the launch notes" }).count(), 0, "the block drops a task once it is done");
  }

  // Visual: right-click a task in a TASK block, pick Tomorrow; one line changes.
  {
    await reading(false);
    const row = page.locator("[data-testid=nexus-query-tasks] [data-testid=task-item]").filter({ hasText: "Learn the dialect" }).first();
    await row.scrollIntoViewIfNeeded();
    const before = await body(board);
    const box = await row.boundingBox();
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2, { button: "right" });
    await page.locator("[data-testid=task-due-tomorrow]").click();
    await page.waitForTimeout(900);
    const tomorrow = await page.evaluate(async (day) => (await import("/src/lib/tasks/extract.ts")).dayFromToday(day, 1), today);
    const was = before.split("\n").find((line) => line.includes("Learn the dialect"));
    assert.deepEqual(changedLines(before, await body(board)), {
      added: [was.replace(/\[due:: [\d-]+\]/, `[due:: ${tomorrow}]`)],
      removed: [was],
    });
  }
  const tomorrow = await page.evaluate(async (day) => (await import("/src/lib/tasks/extract.ts")).dayFromToday(day, 1), today);

  // A ```tasks block written for the Tasks plugin runs in Visual and Reading view; a bad line offers its fix.
  {
    const md = "# Old tasks\n\n```tasks\nnot done\ndue before tomorrow\nsort by due\n```\n\n```tasks\nnot done\ndew today\n```\n";
    const old = await page.evaluate(async (text) => {
      const s = (await window.__appStore()).getState();
      const noteId = s.createNote(null, "Old Tasks");
      s.updateNoteContent(noteId, text, { source: true });
      s.setActiveNote(noteId);
      return noteId;
    }, md);
    await reading(false);
    const blocks = page.locator(".ProseMirror [data-testid=nexus-query][data-lang=tasks]");
    await blocks.first().locator("[data-testid=task-item]").first().waitFor();
    const rows = await blocks.first().locator("[data-testid=tasks-row]").allInnerTexts();
    assert.ok(rows.some((text) => text.includes("Draft the onboarding checklist")), rows.join(" | "));
    assert.ok(!rows.some((text) => text.includes("Profile vault open")), "a task due later is not listed");
    const problem = blocks.nth(1).locator("[data-testid=tasks-block-problem]");
    assert.equal(await problem.getAttribute("data-line"), "2");
    assert.match(await problem.innerText(), /dew today[\s\S]*not a Tasks filter/);
    assert.equal(await blocks.nth(1).locator("[data-testid=task-item]").count(), 0, "a block with a bad line lists nothing");
    await problem.locator("[data-testid=tasks-block-rewrite]").click();
    await page.waitForTimeout(1200);
    assert.match(await body(old), /```tasks\nnot done\ndue today\n```/, "the fix writes the line in the note");
    await blocks.nth(1).locator("[data-testid=task-item]").first().waitFor();

    await reading(true);
    const shown = page.locator(".nexus-source-preview [data-type='nexus-query'][data-lang=tasks]");
    await shown.first().locator("[data-testid=task-item]").first().waitFor();
    assert.match(await shown.first().locator(".nexus-query-head").innerText(), /\d+ tasks? · tasks/);
    const readRows = await shown.first().locator("[data-testid=tasks-row]").allInnerTexts();
    assert.ok(readRows.some((text) => text.includes("Draft the onboarding checklist")), readRows.join(" | "));
    assert.equal(await page.locator(".nexus-source-preview pre code.language-tasks").count(), 0, "no ```tasks block is left as code");
  }

  // Reading view: right-click a row in a TASK block, pick Tomorrow; that task's line changes.
  {
    await page.evaluate((noteId) => window.__NEXUS_SCALE__.setActiveNote(noteId), board);
    await reading(true);
    const row = page.locator(".nexus-source-preview [data-type='nexus-query'] [data-testid=task-item]").filter({ hasText: "Profile vault open" }).first();
    await row.waitFor();
    await row.scrollIntoViewIfNeeded();
    const before = await body(board);
    const box = await row.locator("[data-testid=tasks-row]").boundingBox();
    await page.mouse.click(box.x + 30, box.y + box.height / 2, { button: "right" });
    await page.locator("[data-testid=task-menu-at] [data-testid=task-due-tomorrow]").click();
    await page.waitForTimeout(1000);
    const was = before.split("\n").find((line) => line.includes("Profile vault open"));
    assert.deepEqual(changedLines(before, await body(board)), {
      added: [was.replace(/📅 [\d-]+/, `📅 ${tomorrow}`)],
      removed: [was],
    });
  }

  // Reading view: right-click a task line of the note itself, set High priority; that line changes.
  {
    const before = await body(board);
    const li = page.locator(".nexus-source-preview > ul > li").filter({ hasText: "Review the agent conflict flow" }).first();
    await li.scrollIntoViewIfNeeded();
    const box = await li.boundingBox();
    await page.mouse.click(box.x + 80, box.y + 10, { button: "right" });
    await page.locator("[data-testid=task-menu-at] [data-testid=task-priority-high]").click();
    await page.waitForTimeout(1000);
    const diff = changedLines(before, await body(board));
    assert.equal(diff.removed.length, 1);
    assert.match(diff.removed[0], /Review the agent conflict flow .*🔼/);
    assert.equal(diff.added.length, 1);
    assert.match(diff.added[0], /^- \[ \] Review the agent conflict flow .*⏫/);
    assert.doesNotMatch(diff.added[0], /🔼/);
    // Right-click anywhere else in Reading view keeps the browser menu.
    const heading = await page.locator(".nexus-source-preview h1").first().boundingBox();
    await page.mouse.click(heading.x + 10, heading.y + 5, { button: "right" });
    await page.waitForTimeout(200);
    assert.equal(await page.locator("[data-testid=task-menu-at]").count(), 0);
  }

  assert.deepEqual(pageErrors, [], "no page errors");
  console.log("tasks browser: PASS");
} finally {
  await browser.close();
}
