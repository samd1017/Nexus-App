import { chromium } from "playwright";

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
page.on("console", (msg) => {
  if (msg.type() === "error") errors.push(`console: ${msg.text()}`);
});

await page.goto("http://127.0.0.1:8080/", { waitUntil: "networkidle", timeout: 60000 });
await page.waitForTimeout(1000);

// clear and reopen for clean shot
await page.evaluate(() => {
  try { localStorage.removeItem("nexus-vault-v1"); } catch {}
});
await page.reload({ waitUntil: "networkidle" });
await page.waitForTimeout(1000);

const btn = page.getByRole("button", { name: /Open 45k test vault/i });
await btn.click();
await page.waitForTimeout(10000);

// Expand a few roots if chevrons visible
for (const name of ["01-Projects", "02-Areas", "03-Resources", "04-Archive"]) {
  const row = page.getByText(name, { exact: true }).first();
  if (await row.count()) {
    try { await row.click({ timeout: 2000 }); } catch {}
  }
}
await page.waitForTimeout(500);
await page.screenshot({ path: "/workspace/screenshots/t1-large-vault-tree.png" });

// Open graph panel if button exists
const graphBtn = page.getByRole("button", { name: /Graph/i }).first();
if (await graphBtn.count()) {
  try { await graphBtn.click({ timeout: 3000 }); await page.waitForTimeout(2500); } catch {}
}
await page.screenshot({ path: "/workspace/screenshots/t1-large-vault-graph.png" });

// Count nodes in store if exposed via window debug — probe via text
const info = await page.evaluate(() => {
  const text = document.body.innerText;
  return {
    vaultLine: (text.match(/Large Test Vault[^\n]*/)?.[0] || "").slice(0, 80),
    folderHints: ["00-Inbox","01-Projects","02-Areas","03-Resources","04-Archive"].filter(f => text.includes(f)),
    noteCountHint: (text.match(/45,?000/) || [])[0] || null,
    lsLen: (localStorage.getItem("nexus-vault-v1")||"").length,
  };
});
console.log(JSON.stringify({ info, errors: errors.slice(0,10) }, null, 2));
await browser.close();
