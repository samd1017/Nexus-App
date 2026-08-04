import { chromium } from "playwright";
import fs from "fs";

const url = process.argv[2] || "http://127.0.0.1:8080/";
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const errors = [];
page.on("pageerror", (e) => errors.push(String(e.message || e)));
page.on("console", (m) => {
  if (m.type() === "error") errors.push(m.text());
});

await page.goto(url, { waitUntil: "networkidle", timeout: 60000 });
await page.waitForTimeout(1000);

// Click demo
const clicked = await page.evaluate(() => {
  const buttons = [...document.querySelectorAll("button, a, [role=button]")];
  const el = buttons.find((b) => /demo/i.test(b.textContent || ""));
  if (el) {
    el.click();
    return el.textContent?.trim() || true;
  }
  return false;
});
await page.waitForTimeout(2500);

const mainText = await page.locator("body").innerText();

// Open settings via gear or shortcut
await page.keyboard.press("Control+,");
await page.waitForTimeout(600);
let settingsText = await page.locator("body").innerText();
if (!/Vault scale|Settings|Confirm before delete/i.test(settingsText)) {
  await page.keyboard.press("Meta+,");
  await page.waitForTimeout(600);
  settingsText = await page.locator("body").innerText();
}
const hasLargeToggle = /Large vault mode/i.test(settingsText);
const hasVaultScale = /Vault scale/i.test(settingsText);
await page.screenshot({ path: "/workspace/screenshots/single-path-settings.png" });
await page.keyboard.press("Escape");
await page.waitForTimeout(300);

// Search
await page.keyboard.press("Control+k");
await page.waitForTimeout(400);
await page.keyboard.press("Meta+k");
await page.waitForTimeout(400);
const input = page.locator("input").first();
if (await input.count()) {
  await input.fill("Welcome");
  await page.waitForTimeout(700);
}
await page.screenshot({ path: "/workspace/screenshots/single-path-demo.png" });

await page.setViewportSize({ width: 390, height: 844 });
await page.keyboard.press("Escape");
await page.waitForTimeout(400);
await page.screenshot({ path: "/workspace/screenshots/single-path-mobile.png" });

const report = {
  demoClicked: clicked,
  hasLargeToggle,
  hasVaultScale,
  hasNoteTree: /Journal|Projects|Research|Welcome|Systems/i.test(mainText),
  bodySample: mainText.slice(0, 400),
  consoleErrors: errors.filter((e) => !/favicon|ResizeObserver|Download the React DevTools/i.test(e)),
};
console.log(JSON.stringify(report, null, 2));
fs.writeFileSync("/workspace/screenshots/single-path-qa.json", JSON.stringify(report, null, 2));
await browser.close();
const bad = report.consoleErrors.length > 0 || report.hasLargeToggle || !report.hasVaultScale;
process.exit(bad ? 1 : 0);
