/**
 * Local web: a folder past the full-window limit opens to Ready as a page.
 * The renderer keeps that page. An edit lands in the granted folder.
 *
 *   node scripts/test-browser-shell-ready.mjs http://127.0.0.1:8080/
 */
import assert from "node:assert/strict";
import { chromium } from "playwright";

const BASE = process.argv.find((a) => a.startsWith("http")) || "http://127.0.0.1:8080/";
const NOTES = Math.max(400, Number(process.env.BROWSER_PAGE_NOTES || 4500) || 4500);

const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.CHROME_PATH || "/opt/google/chrome/chrome",
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const pageErrors = [];
page.on("pageerror", (err) => pageErrors.push(String(err)));
page.on("crash", () => pageErrors.push("tab crashed"));

try {
  await page.goto(BASE, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForFunction(() => window.__NEXUS_SOAK__?.openPagedFsa, { timeout: 30000 });
  const opened = await page.evaluate(async (n) => {
    return window.__NEXUS_SOAK__.openPagedFsa(n);
  }, NOTES);
  const banner = await page.locator("[data-open-progress='ready']").textContent();
  const saved = await page.evaluate(async () => {
    return window.__NEXUS_SOAK__.saveActiveMarker("nexus-page-roundtrip");
  });
  const report = { opened, banner, saved, pageErrors };
  console.log(JSON.stringify(report, null, 2));
  assert.equal(pageErrors.length, 0, pageErrors.join("\n"));
  assert.equal(opened.phase, "ready");
  assert.match(opened.message, /Ready/);
  assert.match(banner ?? "", /Ready/);
  assert.equal(opened.shellCatalog, true);
  assert.equal(opened.catalogNoteCount, NOTES);
  assert.ok(opened.windowNotes > 0);
  assert.ok(opened.windowNotes <= 200, "window " + opened.windowNotes);
  assert.ok(opened.windowNotes < opened.catalogNoteCount);
  assert.ok(opened.bodies <= 2, "bodies " + opened.bodies);
  assert.ok(opened.getFileCalls <= 4016, "getFile " + opened.getFileCalls);
  assert.ok(opened.getFileCalls < NOTES);
  assert.ok(opened.hidden > 0, "hidden " + opened.hidden);
  assert.equal(opened.activeHasBody, true);
  if (NOTES >= 15000) {
    assert.equal(opened.limitKind, "warn");
    const warn = await page.locator("[data-chrome-fsa-limit='warn']").textContent();
    assert.match(warn ?? "", /20,000/);
    assert.match(warn ?? "", /Desktop/);
  } else {
    assert.equal(opened.limitKind, null);
  }
  assert.equal(saved.ok, true);
  assert.equal(saved.dirty, false);
  assert.match(saved.path ?? "", /\.md$/);
  console.log("browser-shell ready: PASS");
} finally {
  await browser.close();
}
