import { chromium } from "playwright";
import fs from "fs";

const url = process.argv[2] || "http://127.0.0.1:8080/";
const out = process.argv[3] || "/workspace/screenshots/wave-c-qa.png";

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const consoleErrors = [];
const pageErrors = [];
page.on("console", (m) => {
  if (m.type() === "error") consoleErrors.push(m.text());
});
page.on("pageerror", (e) => pageErrors.push(String(e)));

await page.goto(url, { waitUntil: "networkidle", timeout: 60000 });
await page.waitForTimeout(800);

// Welcome
const welcome = await page.locator("body").innerText();
const hasWelcome = /Nexus|Demo|Open|Vault/i.test(welcome);

// Open demo
const demoBtn = page.getByRole("button", { name: /demo/i }).first();
if (await demoBtn.count()) {
  await demoBtn.click();
  await page.waitForTimeout(1200);
}

const body1 = await page.locator("body").innerText();
const hasMain = body1.length > 200 && /Visual|Source|Graph|Search|FILES|Journal|Welcome/i.test(body1);

// Command palette
await page.keyboard.press("Meta+k").catch(() => {});
await page.keyboard.press("Control+k").catch(() => {});
await page.waitForTimeout(400);
const cmdk = await page.locator("[cmdk-root], [data-cmdk], input[placeholder*='Search'], [role='dialog']").count() > 0
  || /Search|notes|Jump/i.test(await page.locator("body").innerText());
await page.keyboard.press("Escape");
await page.waitForTimeout(200);

// Settings
await page.keyboard.press("Meta+,").catch(() => {});
await page.keyboard.press("Control+,").catch(() => {});
await page.waitForTimeout(500);
const settingsText = await page.locator("body").innerText();
const hasScale = /Vault scale|Memory budget|Automatic/i.test(settingsText);
await page.keyboard.press("Escape");
await page.waitForTimeout(200);

// Pulse / right panel
const pulseBtn = page.getByRole("button", { name: /Pulse/i }).first();
if (await pulseBtn.count()) {
  await pulseBtn.click();
  await page.waitForTimeout(400);
}
const pulseText = await page.locator("body").innerText();
const hasPulse = /Agent inbox|Inbox|Conflicts|Pulse/i.test(pulseText);

// Simulate conflict in demo via store
const conflictResult = await page.evaluate(async () => {
  const st = window.__NOTEAPP__?.getState?.() || null;
  // Try zustand store via window if exposed
  const store = (await import("/src/lib/vault/store.ts").catch(() => null));
  return { hasNoteapp: !!window.__NOTEAPP__, store: !!store };
}).catch((e) => ({ err: String(e) }));

// Inject a conflict sibling into demo vault via page eval of global if possible
const inject = await page.evaluate(() => {
  try {
    // Access through React fiber is hard; use demo by mutating if DEV hook exists
    const g = globalThis;
    if (g.__NEXUS_DEBUG__) return { ok: false, reason: "debug" };
    // Direct import path may not work in browser SSR
    return { ok: false, reason: "no-hook" };
  } catch (e) {
    return { ok: false, reason: String(e) };
  }
});

await page.screenshot({ path: out, fullPage: false });

// Mobile
const mobile = await browser.newPage({ viewport: { width: 390, height: 844 } });
const mErr = [];
mobile.on("pageerror", (e) => mErr.push(String(e)));
await mobile.goto(url, { waitUntil: "networkidle", timeout: 60000 });
await mobile.waitForTimeout(600);
const mDemo = mobile.getByRole("button", { name: /demo/i }).first();
if (await mDemo.count()) {
  await mDemo.click();
  await mobile.waitForTimeout(1000);
}
const mBody = await mobile.locator("body").innerText();
const overflow = await mobile.evaluate(() => {
  return document.documentElement.scrollWidth > document.documentElement.clientWidth + 2;
});
await mobile.screenshot({ path: out.replace(".png", "-mobile.png"), fullPage: false });

// Filter known non-blocking React warning
const hardConsole = consoleErrors.filter(
  (e) => !/React state update on a component that hasn't mounted/i.test(e),
);

const report = {
  ok:
    hasWelcome &&
    hasMain &&
    hasScale &&
    hasPulse &&
    hardConsole.length === 0 &&
    pageErrors.length === 0 &&
    mBody.length > 100 &&
    !overflow &&
    mErr.length === 0,
  hasWelcome,
  hasMain,
  cmdk,
  hasScale,
  hasPulse,
  bodyLen: body1.length,
  mobileLen: mBody.length,
  overflow,
  consoleErrors: hardConsole,
  pageErrors,
  mobileErrors: mErr,
  conflictResult,
  inject,
};

fs.writeFileSync(out.replace(".png", ".json"), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
await browser.close();
process.exit(report.ok ? 0 : 1);
