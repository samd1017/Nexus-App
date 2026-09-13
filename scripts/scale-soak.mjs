/**
 * Playwright UI scale soak. Climbs sizes until a ship-blocker.
 *
 *   node scripts/scale-soak.mjs [baseUrl] [--sizes 10000,50000,100000]
 *
 * Blockers: op p95 > 1000ms (common ops), crash, data loss, broken search/Ask,
 * graph hang, failed reload remount.
 */
import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const BASE = process.argv.find((a) => a.startsWith("http")) || "http://127.0.0.1:8080/";
const sizesArg = process.argv.find((_, i, a) => a[i - 1] === "--sizes");
const SIZES = (sizesArg || "10000,50000,100000")
  .split(",")
  .map((s) => Number(s.trim()))
  .filter((n) => Number.isFinite(n) && n > 0);

const BLOCK_MS = 1000;
const OUT_DIR = "/opt/cursor/artifacts/stress";
mkdirSync(OUT_DIR, { recursive: true });

function pct(arr, p) {
  if (!arr.length) return null;
  const s = [...arr].sort((a, b) => a - b);
  const i = Math.min(s.length - 1, Math.floor(s.length * p));
  return Number(s[i].toFixed(1));
}

async function probe(page) {
  return page.evaluate(() => {
    const fn = window.__NEXUS_STRESS__;
    const last = window.__NEXUS_SOAK_LAST__;
    return { stress: typeof fn === "function" ? fn() : null, last: last || null };
  });
}

async function waitReady(page, notes, timeoutMs) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    const p = await probe(page);
    if (p.stress?.notes === notes && !p.stress.connecting) return p;
    const err = await page.locator("text=/Could not open soak/").count();
    if (err) throw new Error("UI reported soak open failure");
    await page.waitForTimeout(250);
  }
  throw new Error(`Timeout waiting for ${notes} notes`);
}

async function measure(fn, repeats = 8) {
  const samples = [];
  for (let i = 0; i < repeats; i++) {
    const t0 = performance.now();
    await fn();
    samples.push(performance.now() - t0);
  }
  return {
    n: samples.length,
    p50: pct(samples, 0.5),
    p95: pct(samples, 0.95),
    max: Number(Math.max(...samples).toFixed(1)),
    samples: samples.map((x) => Number(x.toFixed(1))),
  };
}

async function soakSize(browser, notes) {
  const result = {
    notes,
    ok: false,
    blockers: [],
    warns: [],
    steps: {},
  };
  const page = await browser.newPage();
  page.setDefaultTimeout(120000);
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  const openBudget = Math.min(180000, 8000 + notes * 4);

  try {
    await page.goto(new URL(`/?soak=${notes}`, BASE).href, {
      waitUntil: "domcontentloaded",
      timeout: openBudget,
    });
    const opened = await waitReady(page, notes, openBudget);
    result.steps.open = {
      openMs: opened.last?.openMs ?? null,
      indexMs: opened.last?.indexMs ?? null,
      notes: opened.stress?.notes,
      bodiesLoaded: opened.stress?.bodiesLoaded,
      archive: opened.stress?.bodyArchiveSize,
    };
    if ((opened.last?.openMs ?? 0) > 30000) {
      result.warns.push(`cold open ${opened.last.openMs}ms (progressive OK if <30s)`);
    }

    const noteIds = await page.evaluate(() => {
      const s = window.__NEXUS_STRESS__?.();
      return { active: s?.activeNoteId };
    });

    const ids = await page.evaluate(() => window.__NEXUS_SOAK__?.noteIds?.(8) || []);
    result.steps.switchNotesCount = ids.length;
    if (ids.length < 2) result.blockers.push("switchNotesCount=0");
    result.steps.switch = await measure(async () => {
      await page.evaluate((noteIds) => {
        const soak = window.__NEXUS_SOAK__;
        const next = noteIds[(Math.random() * noteIds.length) | 0];
        soak?.setActiveNote?.(next);
      }, ids);
      await page.waitForFunction(() => {
        const p = window.__NEXUS_STRESS__?.();
        return Boolean(p?.activeNoteId);
      });
    }, 6);
    if (result.steps.switch.p95 > BLOCK_MS) {
      result.blockers.push(`note switch p95 ${result.steps.switch.p95}ms`);
    }

    result.steps.search = await measure(async () => {
      await page.keyboard.press("Control+K");
      const input = page.locator("[cmdk-input], [role='combobox']").first();
      await input.waitFor({ state: "visible", timeout: 3000 });
      await input.fill("retrieval hub");
      await page.waitForFunction(() => document.querySelectorAll("[role='option']").length >= 1);
      await page.keyboard.press("Escape");
    }, 8);
    if (result.steps.search.p95 > BLOCK_MS) {
      result.blockers.push(`search p95 ${result.steps.search.p95}ms`);
    }

    const tAsk = performance.now();
    await page.keyboard.press("Control+K");
    await page.waitForTimeout(80);
    await page.keyboard.type("ask: how does retrieval work in this vault", { delay: 4 });
    await page.waitForTimeout(400);
    const askHits = await page.getByRole("option").count();
    const askLocal = await page.locator("text=/Ask your notes|local|citation/i").count();
    await page.keyboard.press("Escape");
    result.steps.askMs = Math.round(performance.now() - tAsk);
    result.steps.askHits = askHits;
    result.steps.askChrome = askLocal;
    if (askHits < 1) result.blockers.push("Ask returned no options");
    if (result.steps.askMs > BLOCK_MS) result.blockers.push(`Ask ${result.steps.askMs}ms`);

    const tGraph = performance.now();
    await page.keyboard.press("Control+G");
    await page.waitForSelector("canvas, [data-exit-graph]", { timeout: 8000 });
    const exits = await page.locator("[data-exit-graph], canvas").count();
    result.steps.graphMs = Math.round(performance.now() - tGraph);
    result.steps.graphExits = exits;
    if (exits < 1) result.blockers.push("graph did not enter fullscreen");
    if (result.steps.graphMs > BLOCK_MS) result.blockers.push(`graph open ${result.steps.graphMs}ms`);
    await page.keyboard.press("Escape");

    const tSplit = performance.now();
    await page.keyboard.press("Control+2");
    await page.waitForTimeout(200);
    const split = await page.evaluate(() => window.__NEXUS_STRESS__?.()?.workspaceSplit);
    result.steps.splitMs = Math.round(performance.now() - tSplit);
    result.steps.splitOn = Boolean(split);
    if (!split) result.blockers.push("dual-pane did not enable");
    if (result.steps.splitMs > BLOCK_MS) result.blockers.push(`split ${result.steps.splitMs}ms`);

    const tEdit = performance.now();
    const editor = page.locator(".ProseMirror, [contenteditable='true'], [aria-label='Markdown source']").first();
    result.steps.editorTyped = false;
    if (await editor.count()) {
      await editor.click({ force: true }).catch(() => {});
      await page.keyboard.type(" soak-edit", { delay: 8 });
      result.steps.editorTyped = await page.evaluate(() =>
        /soak-edit/.test(document.querySelector(".ProseMirror, [contenteditable='true']")?.textContent || ""),
      );
    }
    result.steps.editMs = Math.round(performance.now() - tEdit);
    if (!result.steps.editorTyped) result.blockers.push("editorTyped=false");

    const beforeCreate = await probe(page);
    const tNew = performance.now();
    await page.evaluate(() => window.__NEXUS_SOAK__?.createNote(null, "Soak Created"));
    await page.waitForFunction((n) => window.__NEXUS_STRESS__?.()?.notes === n + 1, notes);
    result.steps.newNoteMs = Math.round(performance.now() - tNew);
    if (result.steps.newNoteMs > BLOCK_MS) {
      result.blockers.push(`new note ${result.steps.newNoteMs}ms`);
    }
    void beforeCreate;

    const beforeReload = await probe(page);
    result.steps.preReload = {
      notes: beforeReload.stress?.notes,
      split: beforeReload.stress?.workspaceSplit,
      remount: beforeReload.stress?.scaleRemount?.kind ?? null,
    };
    await page.reload({ waitUntil: "domcontentloaded", timeout: openBudget });
    const after = await waitReady(page, notes, openBudget);
    result.steps.reloadMs = after.last?.openMs ?? null;
    result.steps.postReload = {
      notes: after.stress?.notes,
      split: after.stress?.workspaceSplit,
      remount: after.stress?.scaleRemount?.kind ?? null,
    };
    if (after.stress?.notes !== notes) {
      result.blockers.push(`reload lost vault (notes=${after.stress?.notes})`);
    }

    result.pageErrors = errors.slice(0, 8);
    if (errors.some((e) => /QuotaExceeded|out of memory|Maximum update depth/i.test(e))) {
      result.blockers.push("page error: " + errors[0]);
    }
    result.ok = result.blockers.length === 0;
  } catch (err) {
    result.ok = false;
    result.blockers.push(err instanceof Error ? err.message : String(err));
    result.pageErrors = errors.slice(0, 8);
  } finally {
    await page.close().catch(() => {});
  }
  return result;
}

const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.CHROME_PATH || "/opt/google/chrome/chrome",
});
const report = {
  when: new Date().toISOString(),
  base: BASE,
  blockMs: BLOCK_MS,
  sizes: SIZES,
  rows: [],
};
try {
  for (const n of SIZES) {
    console.log(`SOAK ${n}…`);
    const row = await soakSize(browser, n);
    report.rows.push(row);
    console.log(JSON.stringify({ notes: n, ok: row.ok, blockers: row.blockers, steps: row.steps }, null, 2));
    if (!row.ok) break;
  }
} finally {
  await browser.close();
}

report.largestGreen = [...report.rows].reverse().find((r) => r.ok)?.notes ?? 0;
report.verdict =
  report.largestGreen >= 100000
    ? "green_at_100k_plus"
    : report.largestGreen >= 50000
      ? "green_at_50k"
      : report.largestGreen >= 10000
        ? "green_at_10k_only"
        : "not_green";

writeFileSync(join(OUT_DIR, "scale-soak.json"), JSON.stringify(report, null, 2));
console.log("LARGEST_GREEN", report.largestGreen);
console.log("VERDICT", report.verdict);
if (report.rows.some((r) => !r.ok)) process.exitCode = 2;
