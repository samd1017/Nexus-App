import { chromium } from "playwright";
import fs from "fs";

const url = "http://127.0.0.1:8080/";
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const consoleErrors = [];
const pageErrors = [];
page.on("console", (m) => { if (m.type() === "error") consoleErrors.push(m.text()); });
page.on("pageerror", (e) => pageErrors.push(String(e)));

await page.goto(url, { waitUntil: "networkidle", timeout: 60000 });
await page.waitForTimeout(500);

// Demo
const demo = page.getByRole("button", { name: /Try demo|demo vault|Open demo/i }).first();
if (await demo.count()) await demo.click();
else {
  // try text click
  const t = page.locator("text=Demo").first();
  if (await t.count()) await t.click();
}
await page.waitForTimeout(1200);

// Open settings via store hook
const settingsOpened = await page.evaluate(() => {
  try {
    // prefs store
    const w = window;
    if (w.__NOTEAPP__?.openSettings) {
      w.__NOTEAPP__.openSettings();
      return "noteapp";
    }
    // click gear if present
    return "no-hook";
  } catch (e) {
    return String(e);
  }
});

// Try gear / settings button
const gear = page.locator('button[title*="Settings"], button[aria-label*="Settings"], button:has-text("Settings")').first();
if (await gear.count()) {
  await gear.click();
  await page.waitForTimeout(500);
}

// Also try ⌘,
await page.keyboard.press("Meta+,");
await page.keyboard.press("Control+,");
await page.waitForTimeout(600);

let settingsText = await page.locator("body").innerText();
let hasScale = /Vault scale|Memory budget|Automatic for all folder/i.test(settingsText);

// If still not, click More / menu
if (!hasScale) {
  const more = page.locator('button:has-text("More"), button[aria-label*="menu"]').first();
  if (await more.count()) {
    await more.click();
    await page.waitForTimeout(300);
  }
  const set2 = page.locator('text=Settings').first();
  if (await set2.count()) await set2.click();
  await page.waitForTimeout(500);
  settingsText = await page.locator("body").innerText();
  hasScale = /Vault scale|Memory budget|Automatic for all folder/i.test(settingsText);
}

await page.screenshot({ path: "/workspace/screenshots/wave-c-settings.png" });

// Pulse
const pulse = page.getByRole("button", { name: /Pulse/i }).first();
if (await pulse.count()) await pulse.click();
await page.waitForTimeout(400);

// Conflict inject via __NOTEAPP__ if available
const conflictInject = await page.evaluate(() => {
  const api = window.__NOTEAPP__;
  if (!api?.getState) return { ok: false, reason: "no-getState", keys: api ? Object.keys(api) : [] };
  const st = api.getState();
  // Manually add conflict sibling to nodes
  const primary = Object.values(st.nodes || {}).find((n) => n.kind === "note" && !n.path.includes(".conflict"));
  if (!primary) return { ok: false, reason: "no-primary" };
  const sibPath = primary.path.replace(/\.md$/i, "") + ".conflict-2026-08-03T12-00-00.md";
  const sibId = "conflict_test_sib";
  const nodes = {
    ...st.nodes,
    [sibId]: {
      id: sibId,
      path: sibPath,
      name: sibPath.split("/").pop(),
      kind: "note",
      parentId: primary.parentId,
      mtime: Date.now(),
      content: "THEIRS BODY",
    },
  };
  // Use setState if available
  if (typeof api.setState === "function") {
    api.setState({ nodes });
  } else if (st && typeof st === "object") {
    // zustand persist store on window
    return { ok: false, reason: "no-setState", keys: Object.keys(api) };
  }
  const count = api.getState?.().getOpenConflictCount?.() ?? -1;
  return { ok: true, count, sibPath, primary: primary.path };
});

// If inject worked, open studio
if (conflictInject.ok) {
  await page.evaluate(() => {
    window.__NOTEAPP__?.getState?.().openConflictStudio?.();
  });
  await page.waitForTimeout(500);
}
const bodyAfter = await page.locator("body").innerText();
const hasStudio = /Conflict Studio|Keep mine|Take theirs/i.test(bodyAfter);
await page.screenshot({ path: "/workspace/screenshots/wave-c-conflict.png" });

// Mobile
const mobile = await browser.newPage({ viewport: { width: 390, height: 844 } });
const mErr = [];
mobile.on("pageerror", (e) => mErr.push(String(e)));
await mobile.goto(url, { waitUntil: "networkidle", timeout: 60000 });
await mobile.waitForTimeout(500);
const mDemo = mobile.getByRole("button", { name: /demo/i }).first();
if (await mDemo.count()) await mDemo.click();
await mobile.waitForTimeout(1000);
const overflow = await mobile.evaluate(
  () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 2,
);
const mText = await mobile.locator("body").innerText();
await mobile.screenshot({ path: "/workspace/screenshots/wave-c-mobile.png" });

const hardConsole = consoleErrors.filter(
  (e) => !/React state update on a component that hasn't mounted/i.test(e),
);

const report = {
  ok:
    hardConsole.length === 0 &&
    pageErrors.length === 0 &&
    mErr.length === 0 &&
    !overflow &&
    mText.length > 100 &&
    hasScale,
  settingsOpened,
  hasScale,
  settingsSnippet: settingsText.slice(0, 400),
  conflictInject,
  hasStudio,
  consoleErrors: hardConsole,
  pageErrors,
  mobileErrors: mErr,
  overflow,
  bodyLen: (await page.locator("body").innerText()).length,
  mobileLen: mText.length,
};
fs.writeFileSync("/workspace/screenshots/wave-c-qa2.json", JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
await browser.close();
process.exit(report.ok ? 0 : 2);
