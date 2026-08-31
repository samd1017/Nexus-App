/**
 * Post-fix retest for COMPLETE-REGRADE-AFTER-FIXES.
 * Covers: Welcome fold (no 45k), demo edit/search/graph/shortcuts,
 * 45k open, tree note open, rename, search, graph panel-first, save chip, Ctrl+N.
 */
import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";

const BASE = process.argv[2] || "http://127.0.0.1:8080/";
const OUT_DIR = "/opt/cursor/artifacts";
const SHOT = `${OUT_DIR}/regrade3`;
const REPORT = `${OUT_DIR}/regrade3-retest.json`;

mkdirSync(SHOT, { recursive: true });

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

async function probe(page) {
  return page.evaluate(() => {
    const fn = window.__NEXUS_STRESS__;
    return typeof fn === "function" ? fn() : null;
  });
}

async function shot(page, name) {
  const path = `${SHOT}/${name}.png`;
  await page.screenshot({ path, fullPage: false });
  return path;
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(`pageerror: ${String(e)}`));
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push(`console: ${msg.text()}`);
  });

  const report = {
    startedAt: new Date().toISOString(),
    base: BASE,
    steps: {},
    ok: true,
  };

  // ——— Welcome fold ———
  await page.goto(BASE, { waitUntil: "networkidle", timeout: 60000 });
  await clearVault(page);
  await page.reload({ waitUntil: "networkidle", timeout: 60000 });
  await page.waitForTimeout(600);

  const fold = await page.evaluate(() => {
    const text = document.body.innerText || "";
    const foldH = window.innerHeight;
    const btn45 = [...document.querySelectorAll("button")].find((b) =>
      /Open 45k test vault/i.test(b.textContent || ""),
    );
    let btn45InFold = false;
    if (btn45) {
      const r = btn45.getBoundingClientRect();
      btn45InFold = r.top < foldH && r.bottom > 0;
    }
    return {
      hasExplore: /Explore demo/i.test(text),
      has45kButton: !!btn45,
      btn45InFold,
      hasNexus: /Nexus/i.test(text),
    };
  });
  report.steps.welcomeFold = fold;
  report.steps.welcomeFoldShot = await shot(page, "welcome_fold");
  if (!fold.hasExplore || fold.btn45InFold) {
    report.ok = false;
    report.steps.welcomeFoldFail = "45k still in first viewport or missing Explore";
  }

  // Scroll to find 45k below fold
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.waitForTimeout(300);
  report.steps.welcomeBelowFoldShot = await shot(page, "welcome_below_fold");

  // ——— Demo ———
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.getByRole("button", { name: /Explore demo/i }).first().click({ timeout: 15000 });
  for (let i = 0; i < 25; i++) {
    await page.waitForTimeout(300);
    const t = await page.evaluate(() => document.body.innerText || "");
    if (!/Explore demo/i.test(t) || /Demo|Saved in session|in memory/i.test(t)) break;
  }
  report.steps.demoShot = await shot(page, "demo_loaded");
  report.steps.demoProbe = await probe(page);

  // Edit
  const editor = page.locator(".ProseMirror, [contenteditable='true']").first();
  if (await editor.count()) {
    await editor.click({ timeout: 4000 });
    await page.keyboard.type(" Regrade polish line.", { delay: 12 });
    await page.waitForTimeout(900);
    report.steps.demoEdited = true;
  }

  // Visual ↔ Source
  const sourceBtn = page.getByRole("button", { name: /^Source$/i }).first();
  if (await sourceBtn.count()) {
    await sourceBtn.click({ timeout: 3000 }).catch(() => {});
    await page.waitForTimeout(400);
    const visualBtn = page.getByRole("button", { name: /^Visual$/i }).first();
    if (await visualBtn.count()) await visualBtn.click({ timeout: 3000 }).catch(() => {});
    report.steps.modeToggle = true;
  }

  // Ctrl+K search
  await page.keyboard.press("Control+k");
  await page.waitForTimeout(400);
  const input = page.locator('[cmdk-input], input[placeholder*="Search"], [role="combobox"]').first();
  await input.fill("hermes");
  await page.waitForTimeout(700);
  report.steps.searchHermesShot = await shot(page, "search_hermes");
  const hermes = page.getByText(/Hermes Compatibility|Hermes/i).first();
  if (await hermes.count()) {
    await hermes.click({ timeout: 3000 }).catch(() => {});
    await page.waitForTimeout(500);
  }
  // Ensure overlays closed
  await page.keyboard.press("Escape");
  await page.waitForTimeout(200);
  await page.keyboard.press("Escape");
  await page.waitForTimeout(200);

  // Graph panel-first (Ctrl+G is reliable; button may sit under overlays)
  await page.keyboard.press("Control+g");
  await page.waitForTimeout(1800);
  const graphMode = await page.evaluate(() => {
    const fn = window.__NEXUS_STRESS__;
    const p = typeof fn === "function" ? fn() : null;
    const canvas = document.querySelector("canvas");
    const w = canvas?.getBoundingClientRect?.().width ?? 0;
    return {
      probe: p,
      canvasWidth: w,
      fullscreenish: w > 900,
      graphMode: p?.graphMode || p?.settings?.graphMode || null,
    };
  });
  report.steps.graphPanel = graphMode;
  report.steps.graphShot = await shot(page, "graph_panel");
  if (graphMode.fullscreenish) {
    report.steps.graphWarn = "Graph canvas looks fullscreen-wide";
  }

  // Shortcuts
  await page.keyboard.press("?");
  await page.waitForTimeout(400);
  report.steps.shortcutsShot = await shot(page, "shortcuts");
  await page.keyboard.press("Escape");
  await page.waitForTimeout(200);

  // Close vault
  const vaultBtn = page.locator('button:has-text("Demo"), [aria-label*="Vault" i]').first();
  // Prefer menu
  const switcher = page.getByRole("button", { name: /Demo|vault/i }).first();
  if (await switcher.count()) {
    await switcher.click({ timeout: 3000 }).catch(() => {});
    await page.waitForTimeout(300);
    const close = page.getByRole("menuitem", { name: /Close/i }).or(page.getByText(/^Close$/i)).first();
    if (await close.count()) {
      await close.click({ timeout: 3000 }).catch(() => {});
      await page.waitForTimeout(800);
    }
  }
  report.steps.afterCloseShot = await shot(page, "after_close_welcome");

  // ——— 45k ———
  const btn45 = page.getByRole("button", { name: /Open 45k test vault/i }).first();
  const t45 = now();
  if (await btn45.count()) {
    await btn45.scrollIntoViewIfNeeded();
    await btn45.click({ timeout: 15000 });
  } else {
    await page.keyboard.press("Control+k");
    await page.waitForTimeout(300);
    await input.fill("45k");
    await page.waitForTimeout(400);
    await page.getByText(/Open 45k test vault/i).first().click({ timeout: 10000 });
  }

  let ready = false;
  for (let i = 0; i < 90; i++) {
    await page.waitForTimeout(1000);
    const p = await probe(page);
    if (p && p.notes >= 40000) {
      ready = true;
      report.steps.open45kProbe = p;
      break;
    }
    const failed = await page.evaluate(() =>
      /Could not open large test vault/i.test(document.body.innerText || ""),
    );
    if (failed) break;
  }
  report.steps.open45kMs = Math.round(now() - t45);
  report.steps.open45kReady = ready;
  report.steps.loaded45kShot = await shot(page, "45k_loaded");
  if (!ready) report.ok = false;

  // Dismiss first-run coach / toasts that intercept pointer events
  for (let i = 0; i < 3; i++) {
    const gotIt = page.getByRole("button", { name: /Got it|Dismiss|Close/i }).first();
    if (await gotIt.count()) {
      await gotIt.click({ timeout: 2000 }).catch(() => {});
      await page.waitForTimeout(200);
    }
    await page.keyboard.press("Escape");
    await page.waitForTimeout(150);
  }

  // Tree open — expand first folder then click note rows
  const folderRows = page.locator('[data-file-tree] [data-testid="tree-folder-row"]');
  const folderCount = Math.min(await folderRows.count(), 3);
  for (let i = 0; i < folderCount; i++) {
    try {
      await folderRows.nth(i).click({ timeout: 2500 });
      await page.waitForTimeout(350);
    } catch {}
  }
  // If still no notes visible, click folder by name
  for (const name of ["00-Inbox", "01-Projects", "02-Areas"]) {
    const row = page.locator(`[data-file-tree] [data-node-kind="folder"]`, { hasText: name }).first();
    if (await row.count()) {
      await row.click({ timeout: 2000 }).catch(() => {});
      await page.waitForTimeout(300);
    }
  }
  const treeOpens = [];
  const noteRows = page.locator('[data-file-tree] [data-testid="tree-note-row"]');
  let nCount = await noteRows.count();
  if (nCount === 0) {
    // Fallback: any note-kind row
    nCount = await page.locator('[data-file-tree] [data-node-kind="note"]').count();
  }
  const noteLoc = nCount
    ? page.locator('[data-file-tree] [data-testid="tree-note-row"], [data-file-tree] [data-node-kind="note"]')
    : null;
  const openCount = noteLoc ? Math.min(await noteLoc.count(), 5) : 0;
  report.steps.treeNoteRowCount = openCount;
  for (let i = 0; i < openCount; i++) {
    const row = noteLoc.nth(i);
    try {
      await row.scrollIntoViewIfNeeded();
      const before = await probe(page);
      await row.click({ timeout: 2500 });
      await page.waitForTimeout(700);
      const p = await probe(page);
      treeOpens.push({
        i,
        before: before?.activeNoteId || null,
        activeNoteId: p?.activeNoteId || null,
        ok: !!p?.activeNoteId,
        changed: before?.activeNoteId !== p?.activeNoteId,
      });
    } catch (e) {
      treeOpens.push({ i, ok: false, err: String(e).slice(0, 80) });
    }
  }
  report.steps.treeOpens = treeOpens;
  report.steps.treeOpenOk = treeOpens.filter((x) => x.ok).length;
  report.steps.treeOpenChanged = treeOpens.filter((x) => x.changed).length;
  report.steps.noteOpenShot = await shot(page, "45k_tree_note_open");
  if (openCount === 0 || treeOpens.every((x) => !x.ok)) {
    report.ok = false;
    report.steps.treeOpenFail = true;
  }

  // Rename via double-click on active tree row
  const activeRow = page.locator('[data-file-tree] [data-testid="tree-note-row"].is-active, [data-file-tree] .tree-item.is-active').first();
  const tRename = now();
  if (await activeRow.count()) {
    await activeRow.dblclick({ timeout: 3000 }).catch(() => {});
    await page.waitForTimeout(300);
    const renameInput = page.locator('[data-file-tree] input').first();
    if (await renameInput.count()) {
      await renameInput.fill("Regrade Rename Target");
      await renameInput.press("Enter");
      await page.waitForTimeout(500);
      report.steps.renameMs = Math.round(now() - tRename);
      report.steps.renameOk = true;
    } else {
      report.steps.renameOk = false;
    }
  } else {
    report.steps.renameOk = false;
  }
  report.steps.renameShot = await shot(page, "45k_rename");

  // Search Meeting
  await page.keyboard.press("Control+k");
  await page.waitForTimeout(400);
  const searchInput = page.locator('[cmdk-input], input[placeholder*="Search"], [role="combobox"]').first();
  await searchInput.fill("Meeting");
  await page.waitForTimeout(1000);
  report.steps.search45kShot = await shot(page, "45k_search_meeting");
  await page.keyboard.press("Enter");
  await page.waitForTimeout(1200);
  report.steps.searchOpenProbe = await probe(page);
  report.steps.hydratedShot = await shot(page, "45k_note_hydrated");

  // Graph panel on 45k
  await page.keyboard.press("Escape");
  await page.waitForTimeout(200);
  await page.keyboard.press("Control+g");
  await page.waitForTimeout(2500);
  report.steps.graph45kShot = await shot(page, "45k_graph_panel");
  // Exit fullscreen if we landed there — second Ctrl+G / Escape
  await page.keyboard.press("Escape");
  await page.waitForTimeout(300);

  // Ctrl+N
  await page.keyboard.press("Control+n");
  await page.waitForTimeout(2000);
  report.steps.afterNewNoteProbe = await probe(page);
  report.steps.newNoteShot = await shot(page, "45k_new_note");

  // Save status chip presence
  report.steps.saveChip = await page.evaluate(() => {
    const t = document.body.innerText || "";
    return {
      unsaved: /Unsaved/i.test(t),
      savedSession: /Saved in session|just now|Saved/i.test(t),
    };
  });

  report.pageErrors = errors.filter(
    (e) => !/favicon|Download the React DevTools/i.test(e),
  );
  if (
    report.pageErrors.some((e) =>
      /Maximum update depth|is not a function|QuotaExceeded|view is not available/i.test(e),
    )
  ) {
    report.ok = false;
  }

  report.finishedAt = new Date().toISOString();
  writeFileSync(REPORT, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  console.log(report.ok ? "PASS regrade3" : "FAIL regrade3");
  await browser.close();
  process.exit(report.ok ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
