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

  const deepNotes = 4500;
  const deepName = "n04050.md";
  const deepToken = "zxqwv_nexus_deepbody_991";
  const deepBody = `${"a".repeat(4096)} ${deepToken}\n`;
  const deep = await page.evaluate(
    async ({ notes, name, text, token }) => {
      await window.__NEXUS_SOAK__.plantPagedNote(name, text);
      const opened = await window.__NEXUS_SOAK__.openPagedFsa(notes);
      const before = await window.__NEXUS_SOAK__.search(token, 8);
      const focused = await window.__NEXUS_SOAK__.openCatalogNote(name);
      let after = await window.__NEXUS_SOAK__.search(token, 8);
      const deadline = Date.now() + 8000;
      while (Date.now() < deadline && !(after.hits ?? []).some((hit) => hit.path === name)) {
        await new Promise((resolve) => setTimeout(resolve, 80));
        after = await window.__NEXUS_SOAK__.search(token, 8);
      }
      const live = window.__NEXUS_STRESS__?.() ?? {};
      return { opened, before, focused, after, liveNotes: live.notes, liveCatalog: live.catalogNoteCount };
    },
    { notes: deepNotes, name: deepName, text: deepBody, token: deepToken },
  );
  console.log(JSON.stringify(deep, null, 2));
  assert.equal(deep.opened.phase, "ready");
  assert.equal(deep.opened.shellCatalog, true);
  assert.equal(deep.opened.catalogNoteCount, deepNotes);
  assert.ok(deep.opened.windowNotes <= 200);
  assert.ok(deep.opened.windowNotes < deep.opened.catalogNoteCount);
  assert.equal((deep.before.hits ?? []).length, 0);
  assert.ok(deep.focused.bodyLength > 4096, "body " + deep.focused.bodyLength);
  assert.ok(
    (deep.after.hits ?? []).some((hit) => hit.path === deepName),
    "deep search misses " + JSON.stringify(deep.after.hits),
  );
  assert.ok(deep.focused.windowNotes <= 220, "window " + deep.focused.windowNotes);
  assert.ok(deep.focused.bodies <= 4, "bodies " + deep.focused.bodies);
  assert.equal(deep.focused.catalogNoteCount, deepNotes);
  assert.equal(pageErrors.length, 0, pageErrors.join("\n"));
  console.log("browser-shell deep body: PASS");
} finally {
  await browser.close();
}
