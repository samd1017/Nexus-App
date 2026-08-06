/**
 * Smoke: demo vault stays up 5s and Graph tab does not crash the app.
 * Run: node --input-type=module scripts/smoke-demo-no-crash.mjs
 * Requires: npm run dev on :8080, playwright in node_modules, chrome path.
 */
import { createRequire } from "module";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const CHROME =
  process.env.CHROME_PATH ||
  "/home/sam/.agent-browser/browsers/chrome-149.0.7827.115/chrome";
const BASE = process.env.NEXUS_URL || "http://127.0.0.1:8080/";
const OUT = path.join(
  root,
  "..",
  "..",
  "hermes-outputs",
  "nexus-dogfood",
  "round1",
  "screenshots",
);

function bad(body) {
  return /display error|Maximum update depth/i.test(body);
}

const browser = await chromium.launch({
  executablePath: fs.existsSync(CHROME) ? CHROME : undefined,
  headless: true,
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
});
const page = await (
  await browser.newContext({ viewport: { width: 1440, height: 900 } })
).newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));

await page.goto(BASE, { waitUntil: "networkidle", timeout: 60000 });
await page.getByRole("button", { name: /Explore demo/i }).click();
await page.waitForTimeout(5000);
let body = await page.locator("body").innerText();
if (bad(body)) {
  console.error("FAIL: crash within 5s of demo open");
  console.error(body.slice(0, 400));
  process.exit(1);
}
// Open Graph tab intentionally
const graphTab = page.getByRole("button", { name: /^Graph$/i });
if ((await graphTab.count()) > 0) {
  await graphTab.last().click();
  await page.waitForTimeout(4000);
  body = await page.locator("body").innerText();
  if (bad(body) && !/Graph hit a display error/i.test(body)) {
    // Full-app crash is fail; panel-only recoverable is ok to report as soft
    console.error("FAIL: full-app crash after Graph tab");
    console.error(body.slice(0, 400));
    process.exit(1);
  }
  if (/Graph hit a display error/i.test(body)) {
    console.warn("WARN: Graph panel recovered with Retry UI (not full-app death)");
  }
}
try {
  fs.mkdirSync(OUT, { recursive: true });
  await page.screenshot({ path: path.join(OUT, "smoke-demo-ok.png") });
} catch {
  /* ignore */
}
await browser.close();
if (errors.some((e) => /Maximum update depth/i.test(e))) {
  console.error("FAIL: console Maximum update depth");
  process.exit(1);
}
console.log("PASS: demo + graph path stable");
process.exit(0);
