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

async function vaultProbe(page) {
  return page.evaluate(() => {
    const fn = window.__NEXUS_STRESS__;
    return typeof fn === "function" ? fn() : null;
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

  const openBtn = page.getByRole("button", { name: /Explore demo|explore the demo/i }).first();
  const tOpen = now();
  await openBtn.click({ timeout: 15000 });
  // Wait until welcome CTAs leave / vault chrome appears
  for (let i = 0; i < 30; i++) {
    await page.waitForTimeout(400);
    const text = await page.evaluate(() => document.body.innerText || "");
    if (!/Explore demo/i.test(text) || /Demo|in memory|Saved in session/i.test(text)) break;
  }
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
  result.probe = await vaultProbe(page);
  result.totalMs = Math.round(now() - t0);
  result.pageErrors = errors.splice(0);
  if (result.pageErrors.some((e) => /Maximum update depth|is not a function|QuotaExceeded/i.test(e))) {
    result.ok = false;
  }
  if (result.probe && result.probe.notes < 5) result.ok = false;
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

  // Prefer Welcome CTA; fall back to command palette (also DEV-gated)
  let openedVia = "welcome";
  const btn = page.getByRole("button", { name: /Open 45k test vault/i });
  const tOpen = now();
  if (await btn.count()) {
    await btn.click({ timeout: 15000 });
  } else {
    openedVia = "palette";
    const input = await openPalette(page);
    await input.fill("45k");
    await page.waitForTimeout(400);
    const item = page.getByText(/Open 45k test vault/i).first();
    if (!(await item.count())) {
      const buttons = await page.evaluate(() =>
        [...document.querySelectorAll("button")].map((b) =>
          (b.textContent || "").trim().replace(/\s+/g, " ")
        )
      );
      throw new Error(`45k entry not found. buttons=${JSON.stringify(buttons.slice(0, 20))}`);
    }
    await item.click({ timeout: 10000 });
  }
  result.steps.openedVia = openedVia;

  // Wait until loading finishes with a real 45k mount (not mid-open chrome)
  let ready = false;
  let sawLoading = false;
  for (let i = 0; i < 120; i++) {
    await page.waitForTimeout(1000);
    const snap = await page.evaluate(() => {
      const text = document.body.innerText || "";
      return {
        loading: /Loading 45k|Loading notes|Building folder|Building indexes|Indexing large/i.test(text),
        readyToast: /Large Test Vault ready/i.test(text),
        has45k: /45,?000/.test(text),
        failed: /Could not open large test vault/i.test(text),
      };
    });
    if (snap.loading) sawLoading = true;
    if (snap.failed) {
      result.steps.openFailed = true;
      break;
    }
    if (snap.has45k || snap.readyToast) {
      // Confirm store actually mounted ~45k (toast alone is not enough)
      const probe = await vaultProbe(page);
      result.steps.openProbe = probe;
      if (probe && probe.notes >= 40000) {
        ready = true;
        break;
      }
      if (snap.has45k && probe && probe.notes >= 40000) {
        ready = true;
        break;
      }
    }
  }
  result.steps.openMs = Math.round(now() - tOpen);
  result.steps.openReady = ready;
  result.steps.sawLoading = sawLoading;

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

  // Assert vault still reports ~45k after interactions (store probe, not toast text)
  const postProbe = await vaultProbe(page);
  result.steps.postProbe = postProbe;
  result.steps.postHas45k = !!(postProbe && postProbe.notes >= 40000);
  result.runtime = await collectRuntime(page);
  result.totalMs = Math.round(now() - t0);
  result.pageErrors = errors.splice(0);
  if (!ready || !result.steps.postHas45k) result.ok = false;
  if (result.pageErrors.some((e) => /Maximum update depth|is not a function|QuotaExceeded|out of memory/i.test(e))) {
    result.ok = false;
  }
  return result;
}

async function withFreshPage(browser, fn) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await context.clearCookies();
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
  const browser = await chromium.launch({ headless: true });

  const report = {
    startedAt: new Date().toISOString(),
    base: BASE,
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
