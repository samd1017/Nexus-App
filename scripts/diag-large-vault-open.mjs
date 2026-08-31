/**
 * Deep 45k open diagnostic — wait for real note count, capture errors & UI stats.
 */
import { chromium } from "playwright";
import { writeFileSync, mkdirSync } from "node:fs";

const BASE = process.argv[2] || "http://127.0.0.1:8080/";
const OUT = "/opt/cursor/artifacts/stress/large-45k-diag.json";
mkdirSync("/opt/cursor/artifacts/stress/shots", { recursive: true });

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await context.newPage();
const errors = [];
const consoleAll = [];
page.on("pageerror", (e) => errors.push(`pageerror: ${String(e)}`));
page.on("console", (msg) => {
  const line = `${msg.type()}: ${msg.text()}`;
  if (msg.type() === "error" || msg.type() === "warning") consoleAll.push(line);
  if (msg.type() === "error") errors.push(`console: ${msg.text()}`);
});

await page.goto(BASE, { waitUntil: "networkidle", timeout: 60000 });
await page.evaluate(() => localStorage.clear());
await page.reload({ waitUntil: "networkidle" });
await page.waitForTimeout(1500);

const t0 = performance.now();
await page.getByRole("button", { name: /Open 45k test vault/i }).click();

const samples = [];
let final = null;
for (let i = 0; i < 120; i++) {
  await page.waitForTimeout(1000);
  const snap = await page.evaluate(() => {
    const text = document.body.innerText || "";
    const status = (text.match(/[\d,]+\s+notes?[^\n]*/i) || [])[0] || null;
    const loading = /Loading 45k|Loading notes|Building folder|Building indexes|Indexing/i.test(text);
    const readyToast = /Large Test Vault ready/i.test(text);
    const failed = /Could not open large test vault/i.test(text);
    return {
      t: Date.now(),
      loading,
      readyToast,
      failed,
      status,
      has45k: /45,?000/.test(text),
      snippet: text.replace(/\s+/g, " ").slice(0, 280),
    };
  });
  samples.push({ sec: i + 1, ...snap });
  if (snap.failed) {
    final = snap;
    break;
  }
  if (snap.readyToast || snap.has45k) {
    // confirm stable for 2s
    await page.waitForTimeout(2000);
    final = await page.evaluate(() => {
      const text = document.body.innerText || "";
      return {
        snippet: text.replace(/\s+/g, " ").slice(0, 400),
        has45k: /45,?000/.test(text),
        readyToast: /Large Test Vault ready/i.test(text),
        statusLine: (text.match(/[\d,]+\s+(notes?|folders?)[^\n]*/gi) || []).slice(0, 5),
      };
    });
    break;
  }
  // Also break if loading stopped and Large Test Vault chrome present for 5+ samples
  if (i > 8 && !snap.loading && /Large Test Vault/i.test(snap.snippet)) {
    final = snap;
    break;
  }
}

const openMs = Math.round(performance.now() - t0);
await page.screenshot({ path: "/opt/cursor/artifacts/stress/shots/large-45k-diag.png" });

// Try search + graph briefly
let searchMs = null;
try {
  await page.keyboard.press("Control+k");
  await page.waitForTimeout(400);
  const input = page.locator('[cmdk-input], input[placeholder*="Search"], [role="combobox"]').first();
  const s0 = performance.now();
  await input.fill("inbox");
  await page.waitForTimeout(1500);
  searchMs = Math.round(performance.now() - s0);
  await page.keyboard.press("Escape");
} catch (e) {
  searchMs = `err:${String(e).slice(0, 80)}`;
}

const report = {
  openMs,
  samples: samples.filter((_, idx) => idx < 3 || idx % 5 === 0 || idx === samples.length - 1),
  sampleCount: samples.length,
  final,
  errors: errors.slice(0, 30),
  warnings: consoleAll.filter((c) => c.startsWith("warning")).slice(0, 20),
  searchMs,
};
writeFileSync(OUT, JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
await browser.close();
process.exit(errors.length || (final && !final.has45k && !final.readyToast) ? 1 : 0);
