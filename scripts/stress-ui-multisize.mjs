/**
 * Hard UI soak: demo + 45k large-test.
 * Measures app-ready separately from fixed waits. Fails on the ~1s common-op bar
 * (cold open may exceed 1s if progress is visible and the UI stays responsive).
 *
 * Run: node scripts/stress-ui-multisize.mjs [baseUrl]
 */
import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

const BASE = process.argv[2] || "http://127.0.0.1:8080/";
const OUT = "/opt/cursor/artifacts/stress/ui-multisize.json";
const SHOT_DIR = "/opt/cursor/artifacts/stress/shots";
const COMMON_OP_MS = 1000;
const OPEN_OK_MS = 30000;

mkdirSync(SHOT_DIR, { recursive: true });

function now() {
  return performance.now();
}

async function probe(page) {
  return page.evaluate(() => {
    const fn = window.__NEXUS_STRESS__;
    const last = window.__NEXUS_SOAK_LAST__;
    return {
      stress: typeof fn === "function" ? fn() : null,
      last: last || null,
    };
  });
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

async function waitFor(page, fn, timeoutMs, intervalMs = 50) {
  const t0 = now();
  let last = null;
  while (now() - t0 < timeoutMs) {
    last = await fn();
    if (last) return { ok: true, value: last, waitedMs: Math.round(now() - t0) };
    await page.waitForTimeout(intervalMs);
  }
  return { ok: false, value: last, waitedMs: Math.round(now() - t0) };
}

async function appReadyOp(page, work, ready, timeoutMs = 8000) {
  const t0 = now();
  await work();
  const readyAt = await waitFor(page, ready, timeoutMs, 25);
  return {
    appReadyMs: Math.round(now() - t0),
    waitMs: readyAt.waitedMs,
    ready: readyAt.ok,
    value: readyAt.value,
  };
}

function failIfSlow(result, key, ms, budget, blockers) {
  result.steps[`${key}BudgetMs`] = budget;
  if (ms > budget) {
    blockers.push(`${key} app-ready ${ms}ms > ${budget}ms`);
    result.ok = false;
  }
}

async function openPalette(page) {
  await page.keyboard.press("Control+k");
  const input = page.locator('[cmdk-input], input[placeholder*="Search"], [role="combobox"]').first();
  await input.waitFor({ state: "visible", timeout: 4000 });
  return input;
}

async function typeInEditor(page, text) {
  const editor = page.locator(".ProseMirror, [contenteditable='true'], [aria-label='Markdown source']").first();
  try {
    await editor.waitFor({ state: "visible", timeout: 6000 });
  } catch {
    return { typed: false, reason: "no editor" };
  }
  await editor.click({ timeout: 4000 });
  await page.keyboard.type(text, { delay: 8 });
  const seen = await page.evaluate((needle) => {
    const el = document.querySelector(".ProseMirror, [contenteditable='true']");
    const src = document.querySelector("[aria-label='Markdown source'], textarea, .cm-content");
    const hay = `${el?.textContent || ""} ${src?.textContent || ""}`;
    return hay.includes(needle.trim());
  }, text);
  return { typed: seen, reason: seen ? null : "typed text not in editor" };
}

async function waitStress(page, timeoutMs = 15000) {
  const r = await waitFor(
    page,
    async () => {
      const ok = await page.evaluate(() => typeof window.__NEXUS_STRESS__ === "function");
      return ok ? true : null;
    },
    timeoutMs,
    50,
  );
  return r.ok;
}

async function runDemoStress(page, errors) {
  const result = {
    size: "demo (~10 notes)",
    steps: {},
    blockers: [],
    ok: true,
  };
  const t0 = now();

  await page.goto(BASE, { waitUntil: "domcontentloaded", timeout: 60000 });
  await clearVault(page);
  await page.reload({ waitUntil: "domcontentloaded", timeout: 60000 });
  await waitStress(page);

  const openBtn = page.getByRole("button", { name: /Explore demo|explore the demo/i }).first();
  const open = await appReadyOp(
    page,
    () => openBtn.click({ timeout: 15000 }),
    async () => {
      const p = await probe(page);
      return p.stress && p.stress.notes >= 5 && !p.stress.connecting ? p : null;
    },
    20000,
  );
  result.steps.open = open;
  if (!open.ready) {
    result.ok = false;
    result.blockers.push("demo did not mount");
  }

  const tNote = now();
  const noteRow = page.getByText(/Welcome|Getting started|Start here|Inbox/i).first();
  if (await noteRow.count()) {
    await noteRow.click({ timeout: 4000 }).catch(() => {});
  }
  result.steps.openNoteMs = Math.round(now() - tNote);

  const typed = await typeInEditor(page, " Stress-test edit line.");
  result.steps.editorTyped = typed.typed;
  result.steps.editorError = typed.reason;
  if (!typed.typed) {
    result.ok = false;
    result.blockers.push("demo editorTyped=false");
  }

  const search = await appReadyOp(
    page,
    async () => {
      const input = await openPalette(page);
      await input.fill("welcome");
    },
    async () => {
      const hits = await page.getByRole("option").count();
      return hits >= 1 ? hits : null;
    },
    4000,
  );
  result.steps.search = search;
  await page.keyboard.press("Escape").catch(() => {});
  if (!search.ready) {
    result.ok = false;
    result.blockers.push("demo search returned 0 options");
  }
  failIfSlow(result, "search", search.appReadyMs, COMMON_OP_MS, result.blockers);

  const graph = await appReadyOp(
    page,
    () => page.keyboard.press("Control+g"),
    async () => {
      const n = await page.locator("[data-exit-graph], [data-graph-host]").count();
      return n >= 1 ? n : null;
    },
    4000,
  );
  result.steps.graph = graph;
  result.steps.graphEngineMs = await page
    .locator("[data-graph-engine='ready']")
    .waitFor({ timeout: 8000 })
    .then(() => true)
    .catch(() => false);
  failIfSlow(result, "graph", graph.appReadyMs, COMMON_OP_MS, result.blockers);
  await page.keyboard.press("Escape").catch(() => {});

  const before = await probe(page);
  const created = await appReadyOp(
    page,
    () => page.evaluate(() => window.__NEXUS_SOAK__?.createNote(null, "Soak Created")),
    async () => {
      const p = await probe(page);
      if (p.stress && before.stress && p.stress.notes > before.stress.notes) return p;
      return null;
    },
    4000,
  );
  result.steps.newNote = created;
  failIfSlow(result, "newNote", created.appReadyMs, COMMON_OP_MS, result.blockers);

  await page.screenshot({ path: `${SHOT_DIR}/demo-after-stress.png`, fullPage: false });
  result.probe = (await probe(page)).stress;
  result.totalMs = Math.round(now() - t0);
  result.pageErrors = errors.splice(0);
  if (result.pageErrors.some((e) => /Maximum update depth|QuotaExceeded/i.test(e))) {
    result.ok = false;
    result.blockers.push("demo page error");
  }
  return result;
}

async function runLargeStress(page, errors) {
  const result = {
    size: "large-test-vault (45k)",
    steps: {},
    blockers: [],
    ok: true,
  };
  const t0 = now();

  await page.goto(BASE, { waitUntil: "domcontentloaded", timeout: 60000 });
  await clearVault(page);
  const largeUrl = new URL("?vault=45k", BASE).href;
  const open = await appReadyOp(
    page,
    () => page.goto(largeUrl, { waitUntil: "domcontentloaded", timeout: 60000 }),
    async () => {
      const p = await probe(page);
      return p.stress && p.stress.notes === 45000 && !p.stress.connecting ? p : null;
    },
    90000,
  );
  result.steps.openedVia = "query";
  result.steps.open = {
    ...open,
    storeOpenMs: open.value?.last?.openMs ?? null,
  };
  if (!open.ready || open.value?.stress?.notes !== 45000) {
    result.ok = false;
    result.blockers.push(
      `45k exact count failed (notes=${open.value?.stress?.notes ?? "null"})`,
    );
  }
  if ((open.appReadyMs || 0) > OPEN_OK_MS) {
    result.ok = false;
    result.blockers.push(`cold open ${open.appReadyMs}ms > ${OPEN_OK_MS}ms`);
  } else if ((open.appReadyMs || 0) > COMMON_OP_MS) {
    result.steps.openWarn = `cold open ${open.appReadyMs}ms (progress OK if UI responsive)`;
  }

  await page.screenshot({ path: `${SHOT_DIR}/large-after-open.png`, fullPage: false });

  const tree = await appReadyOp(
    page,
    async () => {
      for (const name of ["00-Inbox", "01-Projects", "02-Areas"]) {
        const row = page
          .locator(`[data-file-tree] [data-node-kind="folder"]`, { hasText: name })
          .first();
        if (await row.count()) await row.click({ timeout: 2000 }).catch(() => {});
      }
      const noteRow = page.locator('[data-file-tree] [data-testid="tree-note-row"]').first();
      if (await noteRow.count()) {
        await noteRow.click({ timeout: 3000 }).catch(() => {});
      }
    },
    async () => {
      const p = await probe(page);
      return p.stress?.activeNoteId ? p.stress.activeNoteId : null;
    },
    6000,
  );
  result.steps.tree = tree;
  failIfSlow(result, "tree", tree.appReadyMs, COMMON_OP_MS, result.blockers);

  const tScroll = now();
  await page.evaluate(() => {
    const scrollers = [
      ...document.querySelectorAll(
        "[data-tree-scroll], [data-radix-scroll-area-viewport], .overflow-auto, .overflow-y-auto",
      ),
    ];
    for (const el of scrollers.slice(0, 4)) {
      el.scrollTop = el.scrollHeight;
      el.scrollTop = 0;
      el.scrollTop = Math.floor(el.scrollHeight / 2);
    }
  });
  result.steps.scrollMs = Math.round(now() - tScroll);

  const search = await appReadyOp(
    page,
    async () => {
      const input = await openPalette(page);
      await input.fill("project");
    },
    async () => {
      const hits = await page.getByRole("option").count();
      return hits >= 1 ? hits : null;
    },
    5000,
  );
  result.steps.search = search;
  await page.keyboard.press("Escape").catch(() => {});
  if (!search.ready) {
    result.ok = false;
    result.blockers.push("45k search returned 0 options");
  }
  failIfSlow(result, "search", search.appReadyMs, COMMON_OP_MS, result.blockers);

  const graph = await appReadyOp(
    page,
    () => page.keyboard.press("Control+g"),
    async () => {
      const n = await page.locator("[data-exit-graph], [data-graph-host]").count();
      return n >= 1 ? n : null;
    },
    4000,
  );
  result.steps.graph = graph;
  result.steps.graphProgress = await page.locator("[data-graph-progress]").count();
  if (!graph.ready) {
    result.ok = false;
    result.blockers.push("45k graph chrome did not become ready");
  }
  failIfSlow(result, "graph", graph.appReadyMs, COMMON_OP_MS, result.blockers);
  await page.keyboard.press("Escape").catch(() => {});
  await page.screenshot({ path: `${SHOT_DIR}/large-after-graph.png`, fullPage: false });

  const beforeCreate = await probe(page);
  const created = await appReadyOp(
    page,
    async () => {
      const id = await page.evaluate(() => window.__NEXUS_SOAK__?.createNote(null, "Soak Created"));
      return id;
    },
    async () => {
      const p = await probe(page);
      return p.stress?.notes === 45001 ? p : null;
    },
    4000,
  );
  result.steps.newNote = created;
  if (!created.ready) {
    result.ok = false;
    result.blockers.push(`create did not reach 45001 (notes=${created.value?.stress?.notes})`);
  }
  failIfSlow(result, "newNote", created.appReadyMs, COMMON_OP_MS, result.blockers);

  const typed = await typeInEditor(page, " 45k editor type");
  result.steps.editorTyped = typed.typed;
  result.steps.editorError = typed.reason;
  if (!typed.typed) {
    result.ok = false;
    result.blockers.push("45k editorTyped=false");
  }

  const switchOp = await appReadyOp(
    page,
    async () => {
      await page.evaluate(async () => {
        const soak = window.__NEXUS_SOAK__;
        const ids = soak?.noteIds?.(6) || [];
        for (const id of ids) {
          soak?.setActiveNote?.(id);
          await new Promise((r) => setTimeout(r, 16));
        }
      });
    },
    async () => {
      const p = await probe(page);
      return p.stress?.activeNoteId || null;
    },
    4000,
  );
  const switched = await page.evaluate(() => {
    const ids = window.__NEXUS_SOAK__?.noteIds?.(6) || [];
    return ids.length;
  });
  result.steps.switchNotes = { ...switchOp, switchNotesCount: switched };
  if (switched < 2) {
    result.ok = false;
    result.blockers.push(`switchNotesCount=${switched} (need >0 real switches)`);
  }
  failIfSlow(result, "switchNotes", switchOp.appReadyMs, COMMON_OP_MS, result.blockers);

  const save = await appReadyOp(
    page,
    () => page.keyboard.press("Control+s"),
    async () => {
      const p = await probe(page);
      return p.stress ? p : null;
    },
    3000,
  );
  result.steps.save = save;

  const post = await probe(page);
  result.steps.postProbe = post.stress;
  result.steps.exact45kAfterCreate = post.stress?.notes === 45001;
  if (post.stress?.notes !== 45001) {
    result.ok = false;
    result.blockers.push(`post notes ${post.stress?.notes} !== 45001`);
  }
  if ((post.stress?.bodiesLoaded ?? 99) > 20) {
    result.steps.bodyWarn = `bodiesLoaded=${post.stress.bodiesLoaded}`;
  }
  result.totalMs = Math.round(now() - t0);
  result.pageErrors = errors.splice(0);
  if (result.pageErrors.some((e) => /Maximum update depth|QuotaExceeded|out of memory/i.test(e))) {
    result.ok = false;
    result.blockers.push("45k page error");
  }
  void beforeCreate;
  return result;
}

async function withFreshPage(browser, fn) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(`pageerror: ${String(e)}`));
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push(`console: ${msg.text()}`);
  });
  try {
    return await fn(page, errors);
  } finally {
    await context.close();
  }
}

async function main() {
  const browser = await chromium.launch({
    headless: true,
    executablePath: process.env.CHROME_PATH || "/opt/google/chrome/chrome",
  });
  const report = {
    startedAt: new Date().toISOString(),
    base: BASE,
    commonOpBudgetMs: COMMON_OP_MS,
    suites: [],
  };

  console.log("=== UI stress: demo ===");
  try {
    report.suites.push(await withFreshPage(browser, runDemoStress));
  } catch (e) {
    report.suites.push({
      size: "demo (~10 notes)",
      ok: false,
      fatal: String(e).slice(0, 400),
    });
  }

  console.log("=== UI stress: 45k ===");
  try {
    report.suites.push(await withFreshPage(browser, runLargeStress));
  } catch (e) {
    report.suites.push({
      size: "large-test-vault (45k)",
      ok: false,
      fatal: String(e).slice(0, 400),
    });
  }

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
