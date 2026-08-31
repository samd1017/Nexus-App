/**
 * Record a short demo→45k walkthrough video for regrade artifacts.
 */
import { chromium } from "playwright";
import { mkdirSync, copyFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const BASE = process.argv[2] || "http://127.0.0.1:8080/";
const VID_DIR = "/tmp/nexus-regrade3-video";
const OUT = "/opt/cursor/artifacts/nexus_regrade_after_fixes.webm";
mkdirSync(VID_DIR, { recursive: true });

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

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    recordVideo: { dir: VID_DIR, size: { width: 1440, height: 900 } },
  });
  const page = await context.newPage();

  await page.goto(BASE, { waitUntil: "networkidle", timeout: 60000 });
  await clearVault(page);
  await page.reload({ waitUntil: "networkidle", timeout: 60000 });
  await page.waitForTimeout(800);

  // Welcome fold pause
  await page.waitForTimeout(1200);
  await page.evaluate(() => window.scrollBy(0, 500));
  await page.waitForTimeout(900);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(400);

  await page.getByRole("button", { name: /Explore demo/i }).first().click();
  await page.waitForTimeout(2000);
  const gotIt = page.getByRole("button", { name: /Got it/i }).first();
  if (await gotIt.count()) await gotIt.click().catch(() => {});

  const editor = page.locator(".ProseMirror").first();
  if (await editor.count()) {
    await editor.click();
    await page.keyboard.type(" After-fix polish check.", { delay: 20 });
  }
  await page.waitForTimeout(800);

  await page.keyboard.press("Control+k");
  await page.waitForTimeout(400);
  await page.locator('[cmdk-input], [role="combobox"]').first().fill("hermes");
  await page.waitForTimeout(900);
  await page.keyboard.press("Escape");
  await page.waitForTimeout(300);

  await page.keyboard.press("Control+g");
  await page.waitForTimeout(1600);

  // Close vault via store
  await page.evaluate(() => {
    const s = window.__NEXUS_STRESS__ && null;
    // Prefer store close if exposed
    try {
      // @ts-ignore
      const store = window.__NEXUS_STORE__ || null;
    } catch {}
  });
  // Use vault switcher UI
  const vault = page.getByRole("button", { name: /Demo Vault|Demo/i }).first();
  if (await vault.count()) {
    await vault.click().catch(() => {});
    await page.waitForTimeout(300);
    const close = page.getByText(/^Close$/i).first();
    if (await close.count()) await close.click().catch(() => {});
  }
  await page.waitForTimeout(1000);

  // Open 45k
  const btn45 = page.getByRole("button", { name: /Open 45k test vault/i }).first();
  if (await btn45.count()) {
    await btn45.scrollIntoViewIfNeeded();
    await btn45.click();
  }
  for (let i = 0; i < 60; i++) {
    await page.waitForTimeout(800);
    const p = await probe(page);
    if (p?.notes >= 40000) break;
  }
  await page.waitForTimeout(800);
  const dismiss = page.getByRole("button", { name: /Got it/i }).first();
  if (await dismiss.count()) await dismiss.click().catch(() => {});

  const inbox = page.locator('[data-file-tree] [data-node-kind="folder"]', { hasText: "00-Inbox" }).first();
  if (await inbox.count()) {
    const exp = await inbox.getAttribute("aria-expanded");
    if (exp !== "true") await inbox.click();
  }
  await page.waitForTimeout(400);
  const notes = page.locator('[data-file-tree] [data-node-kind="note"]');
  for (let i = 0; i < Math.min(3, await notes.count()); i++) {
    await notes.nth(i).click();
    await page.waitForTimeout(600);
  }

  await page.keyboard.press("Control+k");
  await page.waitForTimeout(300);
  await page.locator('[cmdk-input], [role="combobox"]').first().fill("Meeting");
  await page.waitForTimeout(1000);
  await page.keyboard.press("Enter");
  await page.waitForTimeout(1200);

  await page.keyboard.press("Control+n");
  await page.waitForTimeout(1500);

  await context.close();
  await browser.close();

  const files = readdirSync(VID_DIR).filter((f) => f.endsWith(".webm"));
  if (!files.length) throw new Error("no video");
  copyFileSync(join(VID_DIR, files[0]), OUT);
  console.log("Wrote", OUT);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
