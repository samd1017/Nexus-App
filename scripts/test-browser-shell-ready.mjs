/**
 * Local web: a folder past the full-window limit opens to Ready as a page.
 * The renderer keeps that page. An edit lands in the granted folder.
 *
 *   node scripts/test-browser-shell-ready.mjs http://127.0.0.1:8080/
 */
import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
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
  const bannerCount = await page.locator("[data-open-progress='ready']").count();
  const readyText = await page.getByText("titles and open notes").count();
  const saved = await page.evaluate(async () => {
    return window.__NEXUS_SOAK__.saveActiveMarker("nexus-page-roundtrip");
  });
  const report = { opened, bannerCount, readyText, saved, pageErrors };
  console.log(JSON.stringify(report, null, 2));
  assert.equal(pageErrors.length, 0, pageErrors.join("\n"));
  assert.equal(opened.phase, "ready");
  assert.match(opened.message, /titles and open notes/);
  assert.equal(bannerCount, 0);
  assert.equal(readyText, 0);
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

  const snappy = await page.evaluate(async () => {
    const queries = ["n01234", "n03000", "n04400", "n01234", "n02550"];
    const times = [];
    const hits = [];
    let bodiesDuringSearch = 0;
    for (const query of queries) {
      const t0 = performance.now();
      const found = await window.__NEXUS_SOAK__.search(query, 8);
      times.push(Math.round(performance.now() - t0));
      hits.push(found.hits?.[0]?.path ?? null);
      bodiesDuringSearch = Math.max(
        bodiesDuringSearch,
        window.__NEXUS_STRESS__?.()?.bodiesOnStore ?? 0,
      );
    }
    const paths = [];
    for (let i = 0; i < 24; i++) {
      const n = 1200 + i * 113;
      paths.push(`n${String(n).padStart(5, "0")}.md`);
    }
    let lastOpen = null;
    for (const path of paths) {
      lastOpen = await window.__NEXUS_SOAK__.openCatalogNote(path);
    }
    const paged = await window.__NEXUS_SOAK__.pageShellRoot();
    const probe = window.__NEXUS_STRESS__?.() ?? {};
    return {
      times,
      hits,
      bodiesDuringSearch,
      searchReady: probe.searchReady,
      bodyLruMax: probe.bodyLruMax,
      lastOpen,
      paged,
      catalog: probe.catalogNoteCount,
    };
  });
  console.log(JSON.stringify(snappy, null, 2));
  assert.equal(snappy.searchReady, true);
  assert.ok(snappy.bodyLruMax <= 16, "lru " + snappy.bodyLruMax);
  assert.deepEqual(snappy.hits, [
    "n01234.md",
    "n03000.md",
    "n04400.md",
    "n01234.md",
    "n02550.md",
  ]);
  assert.ok(snappy.times[0] <= 400, "first search " + snappy.times[0] + "ms");
  for (const ms of snappy.times.slice(1)) {
    assert.ok(ms <= 120, "search " + ms + "ms");
  }
  assert.ok(snappy.bodiesDuringSearch <= 4, "search bodies " + snappy.bodiesDuringSearch);
  assert.ok(snappy.lastOpen.bodyLength > 0, "opened body " + snappy.lastOpen.bodyLength);
  assert.ok(snappy.lastOpen.windowNotes <= 240, "window after opens " + snappy.lastOpen.windowNotes);
  assert.ok(snappy.lastOpen.windowNotes < snappy.lastOpen.catalogNoteCount);
  assert.ok(snappy.lastOpen.bodies <= 16, "bodies after opens " + snappy.lastOpen.bodies);
  assert.equal(snappy.paged.catalogNoteCount, 4500);
  assert.ok(snappy.paged.windowNotes <= snappy.lastOpen.windowNotes + 200);
  assert.ok(snappy.paged.windowNotes < 700, "window after page " + snappy.paged.windowNotes);
  assert.ok(snappy.paged.windowNotes < snappy.paged.catalogNoteCount / 2);
  assert.ok(snappy.paged.hidden > 1000, "hidden " + snappy.paged.hidden);
  assert.ok(snappy.paged.bodies <= 16, "bodies after page " + snappy.paged.bodies);
  assert.equal(pageErrors.length, 0, pageErrors.join("\n"));
  console.log("browser-shell snappy: PASS");

  const craftDir = "/tmp/nexus-craft";
  mkdirSync(craftDir, { recursive: true });
  assert.equal(await page.locator("[data-open-progress='ready']").count(), 0);
  assert.equal(await page.getByText(/Ready/).count(), 0);
  await page.screenshot({ path: `${craftDir}/ready-dark.png` });

  await page.locator("[aria-label='Open settings']").focus();
  const settingsRing = await page.evaluate(() => {
    const s = getComputedStyle(document.activeElement);
    return `${s.outlineWidth} ${s.outlineStyle} ${s.outlineColor}`;
  });
  assert.match(settingsRing, /rgb\(90, 216, 255\)/);

  await page.locator(".note-title-input").focus();
  const titleOutline = await page.evaluate(() => getComputedStyle(document.activeElement).outlineStyle);
  assert.equal(titleOutline, "none");

  await page.keyboard.press("Control+k");
  const palette = page.locator("[aria-label='Command palette']");
  await palette.waitFor({ state: "visible", timeout: 5000 });
  assert.match(await palette.innerText(), /Command palette/);
  await page.screenshot({ path: `${craftDir}/palette.png` });
  await page.keyboard.press("Escape");

  await page.evaluate(() => document.documentElement.setAttribute("data-theme", "light"));
  // The title-bar chip eases its color. Read it after that settle.
  await page.waitForFunction(
    () => getComputedStyle(document.querySelector("[data-vault-status='on-disk']")).color === "rgb(20, 108, 54)",
    { timeout: 2000 },
  );
  const light = await page.evaluate(() => {
    const word = document.querySelector("header .nexus-wordmark");
    const chip = document.querySelector("[data-vault-status='on-disk']");
    return {
      word: word ? getComputedStyle(word).backgroundImage : "",
      chip: chip ? getComputedStyle(chip).color : "",
      chipText: chip ? chip.textContent.trim() : "",
    };
  });
  assert.match(light.word, /rgb\(59, 66, 82\)/);
  assert.equal(light.chip, "rgb(20, 108, 54)");
  assert.match(light.chipText, /On disk|Saved/);
  await page.screenshot({ path: `${craftDir}/ready-light.png` });

  await page.getByRole("button", { name: "New folder" }).click();
  const emptyStatus = page.locator("[data-testid='tree-empty-folder-status']");
  await emptyStatus.waitFor({ state: "visible", timeout: 5000 });
  const emptyFit = await emptyStatus.evaluate((el) => {
    const row = el.closest("[role='treeitem']");
    const rr = row?.getBoundingClientRect();
    const er = el.getBoundingClientRect();
    return {
      text: el.textContent.trim(),
      overflow: el.scrollWidth - el.clientWidth,
      rowH: rr ? Math.round(rr.height) : 0,
      fitsRow: rr ? er.top >= rr.top - 1 && er.bottom <= rr.bottom + 1 : false,
      color: getComputedStyle(el).color,
    };
  });
  assert.match(emptyFit.text, /Enter starts a note/);
  assert.ok(emptyFit.overflow <= 1, "empty line overflow " + emptyFit.overflow);
  assert.equal(emptyFit.rowH, 30);
  assert.equal(emptyFit.fitsRow, true);
  assert.equal(emptyFit.color, "rgb(18, 20, 26)");
  const emptyBox = await emptyStatus.boundingBox();
  if (emptyBox) {
    await page.screenshot({
      path: `${craftDir}/empty-row.png`,
      clip: {
        x: 0,
        y: Math.max(0, emptyBox.y - 36),
        width: 280,
        height: 90,
      },
    });
  }
  assert.equal(pageErrors.length, 0, pageErrors.join("\n"));
  console.log("browser-shell craft: PASS", JSON.stringify(emptyFit));
} finally {
  await browser.close();
}
