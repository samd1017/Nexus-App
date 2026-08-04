import { chromium } from "playwright";

const url = "http://127.0.0.1:8080/";
const shot = "/workspace/screenshots/t1-large-vault-loaded.png";

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
page.on("console", (msg) => {
  if (msg.type() === "error") errors.push(`console: ${msg.text()}`);
});

await page.goto(url, { waitUntil: "networkidle", timeout: 60000 });
await page.waitForTimeout(1500);
await page.screenshot({ path: "/workspace/screenshots/t1-welcome-before.png", fullPage: false });

// Click Open 45k test vault
const btn = page.getByRole("button", { name: /Open 45k test vault/i });
await btn.waitFor({ state: "visible", timeout: 15000 });
console.log("clicking Open 45k test vault");
await btn.click();

// Wait for load — progress then toast / vault UI
const start = Date.now();
let ready = false;
for (let i = 0; i < 120; i++) {
  await page.waitForTimeout(1000);
  const body = await page.locator("body").innerText().catch(() => "");
  const hasToast = /Large Test Vault ready|45,?000 notes/i.test(body);
  const hasVaultUi =
    (await page.locator('[data-vault], .app-shell, nav, aside').count().catch(() => 0)) > 0 ||
    /00-Inbox|01-Projects|Large Test Vault/i.test(body);
  const stillLoading = /Loading 45k|Indexing large vault|Loading large test/i.test(body);
  const failed = /Could not open large test vault|QuotaExceeded/i.test(body);
  if (i % 5 === 0) {
    console.log(`t+${Math.round((Date.now()-start)/1000)}s loading=${stillLoading} readyish=${hasToast||hasVaultUi} failed=${failed} nodes? body snippet: ${body.slice(0, 200).replace(/\n/g,' | ')}`);
  }
  if (failed) {
    console.error("FAILED:", body.match(/Could not open[^\n]+|QuotaExceeded[^\n]*/)?.[0]);
    break;
  }
  if ((hasToast || hasVaultUi) && !stillLoading) {
    // extra settle
    await page.waitForTimeout(2000);
    ready = true;
    break;
  }
}

const finalBody = await page.locator("body").innerText().catch(() => "");
await page.screenshot({ path: shot, fullPage: false });

// Probe store state via page evaluate
const state = await page.evaluate(() => {
  try {
    // zustand may not be global; count DOM tree items and vault chrome
    const text = document.body?.innerText || "";
    return {
      title: document.title,
      hasQuotaErr: /QuotaExceeded/i.test(text),
      hasReadyToast: /Large Test Vault ready/i.test(text),
      hasInbox: /00-Inbox/.test(text),
      hasProjects: /01-Projects/.test(text),
      hasArchive: /04-Archive/.test(text),
      snippet: text.slice(0, 800),
      lsKeys: Object.keys(localStorage),
      lsVaultLen: (localStorage.getItem("nexus-vault-v1") || "").length,
    };
  } catch (e) {
    return { err: String(e) };
  }
});

console.log(JSON.stringify({ ready, elapsedMs: Date.now()-start, errors: errors.slice(0, 20), state }, null, 2));
await browser.close();
process.exit(ready && !state.hasQuotaErr ? 0 : 1);
