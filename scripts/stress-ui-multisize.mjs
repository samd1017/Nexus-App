/**
 * Hard UI stress across vault sizes: demo (small) + 45k large-test.
 * Exercises open, tree, search, editor, graph, new-note where available.
 *
 * Run: node scripts/stress-ui-multisize.mjs [baseUrl]
 * Writes JSON summary to stdout and /opt/cursor/artifacts/stress/ui-multisize.json
 */
import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

const BASE = process.argv[2] || "http://127.0.0.1:8080/";
const OUT = "/opt/cursor/artifacts/stress/ui-multisize.json";
const SHOT_DIR = "/opt/cursor/artifacts/stress/shots";

mkdirSync(SHOT_DIR, { recursive: true });

function now() {
  return performance.now();
}

async function clearVault(page) {
  await page.evaluate(() => {
    try {
      localStorage.removeItem("nexus-vault-v1");
      for (const k of Object.keys(localStorage)) {
        if (k.startsWith("nexus-")) localStorage.removeItem(k);
      }
    } catch {}
  });
}

async function collectRuntime(page) {
  return page.evaluate(() => {
    const text = document.body.innerText || "";
    const hasEditor =
      !!document.querySelector(".ProseMirror, [contenteditable='true'], textarea, .cm-editor");
    const hasGraph = !!document.querySelector("canvas, .graph-view, [data-testid='graph']");
    return {
      title: document.title,
      hasEditor,
      hasGraph,
      bodySnippet: text.replace(/\s+/g, " ").slice(0, 240),
      noteCountHint: (text.match(/45,?000/) || text.match(/\b(\d{1,2})\s+notes?\b/i) || [])[0] || null,
    };
  });
}

async function openPalette(page) {
  await page.keyboard.press("Control+k");
  await page.waitForTimeout(400);
  const input = page.locator('[cmdk-input], input[placeholder*="Search"], [role="combobox"]').first();
  return input;
}

async function runDemoStress(page, errors) {
  const result = {
    size: "demo (~10 notes)",
    steps: {},
    errors: [],
    ok: true,
  };
  const t0 = now();

  await page.goto(BASE, { waitUntil: "networkidle", timeout: 60000 });
  await clearVault(page);
  await page.reload({ waitUntil: "networkidle", timeout: 60000 });
  await page.waitForTimeout(800);

  const openBtn = page.getByRole("button", { name: /Try the demo vault|Open demo/i }).first();
  const tOpen = now();
  await openBtn.click({ timeout: 10000 });
  await page.waitForTimeout(2500);
  result.steps.openMs = Math.round(now() - tOpen);

  // Click a note in the tree if present
  const tNote = now();
  const noteRow = page.getByText(/Welcome|Getting started|Start here|Inbox/i).first();
  if (await noteRow.count()) {
    try {
      await noteRow.click({ timeout: 3000 });
      await page.waitForTimeout(800);
    } catch {}
  }
  result.steps.openNoteMs = Math.round(now() - tNote);

  // Type in editor
  const tEdit = now();
  const editor = page.locator(".ProseMirror, [contenteditable='true']").first();
  if (await editor.count()) {
    try {
      await editor.click({ timeout: 3000 });
      await page.keyboard.type(" Stress-test edit line.", { delay: 15 });
      await page.waitForTimeout(1200);
      result.steps.editorTyped = true;
    } catch (e) {
      result.steps.editorTyped = false;
      result.steps.editorError = String(e).slice(0, 120);
    }
  } else {
    result.steps.editorTyped = false;
  }
  result.steps.editMs = Math.round(now() - tEdit);

  // Search palette
  const tSearch = now();
  try {
    const input = await openPalette(page);
    if (await input.count()) {
      await input.fill("welcome");
      await page.waitForTimeout(600);
      result.steps.searchHits = true;
      await page.keyboard.press("Escape");
    } else {
      result.steps.searchHits = false;
    }
  } catch (e) {
    result.steps.searchHits = false;
    result.steps.searchError = String(e).slice(0, 120);
  }
  result.steps.searchMs = Math.round(now() - tSearch);

  // Graph
  const tGraph = now();
  const graphBtn = page.getByRole("button", { name: /^Graph$/i }).first();
  if (await graphBtn.count()) {
    try {
      await graphBtn.click({ timeout: 4000 });
      await page.waitForTimeout(2000);
      result.steps.graphOpened = true;
    } catch {
      result.steps.graphOpened = false;
    }
  } else {
    // Title bar / rail icon
    const alt = page.locator('[aria-label*="Graph" i], button:has-text("Graph")').first();
    if (await alt.count()) {
      try {
        await alt.click({ timeout: 3000 });
        await page.waitForTimeout(2000);
        result.steps.graphOpened = true;
      } catch {
        result.steps.graphOpened = false;
      }
    } else {
      result.steps.graphOpened = false;
    }
  }
  result.steps.graphMs = Math.round(now() - tGraph);

  // New note
  const tNew = now();
  try {
    await page.keyboard.press("Control+n");
    await page.waitForTimeout(1500);
    result.steps.newNoteMs = Math.round(now() - tNew);
    result.steps.newNote = true;
  } catch (e) {
    result.steps.newNote = false;
    result.steps.newNoteError = String(e).slice(0, 120);
  }

  await page.screenshot({ path: `${SHOT_DIR}/demo-after-stress.png`, fullPage: false });
  result.runtime = await collectRuntime(page);
  result.totalMs = Math.round(now() - t0);
  result.pageErrors = errors.splice(0);
  if (result.pageErrors.some((e) => /Maximum update depth|is not a function|QuotaExceeded/i.test(e))) {
    result.ok = false;
  }
  return result;
}

async function runLargeStress(page, errors) {
  const result = {
    size: "large-test-vault (45k)",
    steps: {},
    errors: [],
    ok: true,
  };
  const t0 = now();

  await page.goto(BASE, { waitUntil: "networkidle", timeout: 60000 });
  await clearVault(page);
  await page.reload({ waitUntil: "networkidle", timeout: 60000 });
  await page.waitForTimeout(800);

  const btn = page.getByRole("button", { name: /Open 45k test vault/i });
  const tOpen = now();
  await btn.click({ timeout: 10000 });

  // Wait until loading finishes or timeout
  let ready = false;
  for (let i = 0; i < 90; i++) {
    await page.waitForTimeout(1000);
    const text = await page.evaluate(() => document.body.innerText || "");
    if (/Large Test Vault ready|45,?000/i.test(text) && !/Loading 45k|Indexing large|Loading notes/i.test(text)) {
      // Prefer ready toast / stable UI
      if (!/Loading 45k|Loading notes…/i.test(text)) {
        ready = true;
        break;
      }
    }
    // Also accept editor/tree appearing with vault name
    if (/Large Test Vault/i.test(text) && !/Loading 45k|Loading notes…|Building folder/i.test(text)) {
      ready = true;
      break;
    }
  }
  result.steps.openMs = Math.round(now() - tOpen);
  result.steps.openReady = ready;

  await page.screenshot({ path: `${SHOT_DIR}/large-after-open.png`, fullPage: false });

  // Expand a few folders + open a note
  const tTree = now();
  for (const name of ["00-Inbox", "01-Projects", "02-Areas"]) {
    const row = page.getByText(name, { exact: true }).first();
    if (await row.count()) {
      try {
        await row.click({ timeout: 2000 });
        await page.waitForTimeout(400);
      } catch {}
    }
  }
  // Try open first visible .md-looking row
  const mdish = page.locator("text=/\\.md$/").first();
  if (await mdish.count()) {
    try {
      await mdish.click({ timeout: 3000 });
      await page.waitForTimeout(1500);
      result.steps.openedNoteFromTree = true;
    } catch {
      result.steps.openedNoteFromTree = false;
    }
  } else {
    result.steps.openedNoteFromTree = false;
  }
  result.steps.treeMs = Math.round(now() - tTree);

  // Rapid tree scroll (virtualization stress)
  const tScroll = now();
  await page.evaluate(() => {
    const scrollers = [...document.querySelectorAll("[data-radix-scroll-area-viewport], .overflow-auto, .overflow-y-auto")];
    for (const el of scrollers.slice(0, 4)) {
      el.scrollTop = el.scrollHeight;
      el.scrollTop = 0;
      el.scrollTop = Math.floor(el.scrollHeight / 2);
    }
  });
  await page.waitForTimeout(500);
  result.steps.scrollMs = Math.round(now() - tScroll);

  // Search
  const tSearch = now();
  try {
    const input = await openPalette(page);
    if (await input.count()) {
      const qStart = now();
      await input.fill("project");
      await page.waitForTimeout(1200);
      result.steps.searchQueryMs = Math.round(now() - qStart);
      result.steps.searchOk = true;
      await page.keyboard.press("Escape");
      await page.waitForTimeout(300);
    } else {
      result.steps.searchOk = false;
    }
  } catch (e) {
    result.steps.searchOk = false;
    result.steps.searchError = String(e).slice(0, 120);
  }
  result.steps.searchMs = Math.round(now() - tSearch);

  // Graph
  const tGraph = now();
  const graphBtn = page.getByRole("button", { name: /Graph/i }).first();
  if (await graphBtn.count()) {
    try {
      await graphBtn.click({ timeout: 4000 });
      await page.waitForTimeout(3500);
      result.steps.graphOpened = true;
    } catch {
      result.steps.graphOpened = false;
    }
  } else {
    result.steps.graphOpened = false;
  }
  result.steps.graphMs = Math.round(now() - tGraph);
  await page.screenshot({ path: `${SHOT_DIR}/large-after-graph.png`, fullPage: false });

  // New note under load
  const tNew = now();
  try {
    await page.keyboard.press("Control+n");
    await page.waitForTimeout(2500);
    result.steps.newNote = true;
  } catch {
    result.steps.newNote = false;
  }
  result.steps.newNoteMs = Math.round(now() - tNew);

  // Switch notes a few times if possible
  const tSwitch = now();
  const rows = page.locator("text=/\\.md$/");
  const count = Math.min(await rows.count(), 5);
  for (let i = 0; i < count; i++) {
    try {
      await rows.nth(i).click({ timeout: 2000 });
      await page.waitForTimeout(400);
    } catch {}
  }
  result.steps.switchNotesMs = Math.round(now() - tSwitch);
  result.steps.switchNotesCount = count;

  result.runtime = await collectRuntime(page);
  result.totalMs = Math.round(now() - t0);
  result.pageErrors = errors.splice(0);
  if (!ready) result.ok = false;
  if (result.pageErrors.some((e) => /Maximum update depth|is not a function|QuotaExceeded|out of memory/i.test(e))) {
    result.ok = false;
  }
  return result;
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on("pageerror", (e) => errors.push(`pageerror: ${String(e)}`));
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push(`console: ${msg.text()}`);
  });

  const report = {
    startedAt: new Date().toISOString(),
    base: BASE,
    suites: [],
  };

  console.log("=== UI stress: demo ===");
  report.suites.push(await runDemoStress(page, errors));

  console.log("=== UI stress: 45k ===");
  report.suites.push(await runLargeStress(page, errors));

  report.finishedAt = new Date().toISOString();
  report.pass = report.suites.every((s) => s.ok);

  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  console.log(report.pass ? "PASS ui-multisize" : "FAIL ui-multisize");

  await browser.close();
  process.exit(report.pass ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
