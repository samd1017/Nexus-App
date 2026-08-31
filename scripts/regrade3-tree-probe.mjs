/**
 * Focused 45k tree open + rename reliability probe.
 */
import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";

const BASE = process.argv[2] || "http://127.0.0.1:8080/";
const OUT = "/opt/cursor/artifacts/regrade3-tree-probe.json";
mkdirSync("/opt/cursor/artifacts/regrade3", { recursive: true });

async function probe(page) {
  return page.evaluate(() => {
    const fn = window.__NEXUS_STRESS__;
    return typeof fn === "function" ? fn() : null;
  });
}

async function clearVault(page) {
  await page.evaluate(() => {
    try {
      for (const k of Object.keys(localStorage)) {
        if (k.startsWith("nexus-")) localStorage.removeItem(k);
      }
    } catch {}
  });
}

async function dismissChrome(page) {
  for (let i = 0; i < 4; i++) {
    const b = page.getByRole("button", { name: /Got it|Dismiss/i }).first();
    if (await b.count()) await b.click({ timeout: 1500 }).catch(() => {});
    await page.keyboard.press("Escape");
    await page.waitForTimeout(120);
  }
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));

  await page.goto(BASE, { waitUntil: "networkidle", timeout: 60000 });
  await clearVault(page);
  await page.reload({ waitUntil: "networkidle", timeout: 60000 });
  await page.waitForTimeout(500);

  const btn = page.getByRole("button", { name: /Open 45k test vault/i }).first();
  await btn.scrollIntoViewIfNeeded();
  await btn.click({ timeout: 15000 });

  let ready = false;
  for (let i = 0; i < 90; i++) {
    await page.waitForTimeout(1000);
    const p = await probe(page);
    if (p?.notes >= 40000) {
      ready = true;
      break;
    }
  }
  if (!ready) {
    writeFileSync(OUT, JSON.stringify({ ok: false, reason: "open failed" }, null, 2));
    process.exit(1);
  }

  await dismissChrome(page);
  await page.screenshot({ path: "/opt/cursor/artifacts/regrade3/tree_probe_ready.png" });

  // Expand 00-Inbox if collapsed
  const inbox = page.locator('[data-file-tree] [data-node-kind="folder"]', { hasText: "00-Inbox" }).first();
  if (await inbox.count()) {
    const expanded = await inbox.getAttribute("aria-expanded");
    if (expanded !== "true") await inbox.click();
    await page.waitForTimeout(400);
  }

  const notes = page.locator('[data-file-tree] [data-node-kind="note"]');
  const count = await notes.count();
  const results = [];
  const n = Math.min(count, 8);
  for (let i = 0; i < n; i++) {
    const row = notes.nth(i);
    const label = (await row.innerText()).replace(/\s+/g, " ").slice(0, 40);
    const before = await probe(page);
    const t0 = performance.now();
    await row.click({ timeout: 3000 });
    await page.waitForTimeout(500);
    const after = await probe(page);
    results.push({
      i,
      label,
      ms: Math.round(performance.now() - t0),
      before: before?.activeNoteId,
      after: after?.activeNoteId,
      ok: !!after?.activeNoteId,
      switched: before?.activeNoteId !== after?.activeNoteId,
    });
  }

  // Rename last opened
  let rename = { ok: false };
  if (n > 0) {
    const row = notes.nth(Math.min(2, n - 1));
    await row.click();
    await page.waitForTimeout(300);
    await row.dblclick();
    await page.waitForTimeout(250);
    const input = page.locator("[data-file-tree] input").first();
    if (await input.count()) {
      const t0 = performance.now();
      await input.fill(`TreeRename-${Date.now().toString(36)}`);
      await input.press("Enter");
      await page.waitForTimeout(400);
      rename = {
        ok: true,
        ms: Math.round(performance.now() - t0),
        probe: await probe(page),
      };
    }
  }

  await page.screenshot({ path: "/opt/cursor/artifacts/regrade3/tree_probe_after.png" });

  const report = {
    ok: results.filter((r) => r.ok).length >= 3 && results.some((r) => r.switched),
    noteRowsVisible: count,
    opens: results,
    openOk: results.filter((r) => r.ok).length,
    switched: results.filter((r) => r.switched).length,
    rename,
    pageErrors: errors,
  };
  writeFileSync(OUT, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  console.log(report.ok ? "PASS tree-probe" : "FAIL tree-probe");
  await browser.close();
  process.exit(report.ok ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
