/**
 * Screenshot the Chrome FSA refuse card (25k) and warn banner (18k).
 *   node scripts/shot-chrome-fsa-gate.mjs http://127.0.0.1:8080/
 */
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
import { artifactPath } from "./artifact-dir.mjs";

const BASE = process.argv.find((a) => a.startsWith("http")) || "http://127.0.0.1:8080/";
const OUT = artifactPath("screenshots");
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.CHROME_PATH || "/opt/google/chrome/chrome",
});
const page = await browser.newPage({ viewport: { width: 1280, height: 820 } });
await page.goto(BASE, { waitUntil: "domcontentloaded", timeout: 60000 });
await page.waitForFunction(() => window.__NEXUS_SOAK__, { timeout: 30000 });

await page.evaluate(async () => {
  await window.__NEXUS_SOAK__.openMockFsaCount(25000);
});
await page.waitForSelector("[data-chrome-fsa-refused]", { timeout: 60000 });
await page.screenshot({
  path: `${OUT}/chrome_fsa_refuse_25k.png`,
  fullPage: false,
});

await page.reload({ waitUntil: "domcontentloaded" });
await page.waitForFunction(() => window.__NEXUS_SOAK__, { timeout: 30000 });
await page.evaluate(async () => {
  await window.__NEXUS_SOAK__.openMockFsaCount(18000);
});
await page.waitForFunction(
  () => window.__NEXUS_STRESS__?.()?.searchReady === true,
  { timeout: 180000 },
);
await page.waitForSelector("[data-chrome-fsa-limit='warn']", { timeout: 15000 });
await page.locator("[data-chrome-fsa-limit='warn']").scrollIntoViewIfNeeded();
await page.screenshot({
  path: `${OUT}/chrome_fsa_warn_18k.png`,
  fullPage: false,
});
await page.locator("[data-chrome-fsa-limit='warn']").screenshot({
  path: `${OUT}/chrome_fsa_warn_18k_banner.png`,
});

const refuseText = await page.evaluate(() => {
  /* after reload we are on warn — re-read last refuse from a fresh tab */
  return null;
});
void refuseText;
await browser.close();
console.log("PASS shot-chrome-fsa-gate");
console.log(`${OUT}/chrome_fsa_refuse_25k.png`);
console.log(`${OUT}/chrome_fsa_warn_18k.png`);
