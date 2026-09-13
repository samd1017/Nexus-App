/**
 * Mock-FSA heap trend: open N notes and search after each (the 100k discard path).
 *
 *   node scripts/stress-fsa-open.mjs http://127.0.0.1:8080/ --notes 800 --opens 20
 *   node scripts/stress-fsa-open.mjs http://127.0.0.1:8080/ --notes 20000 --opens 20 --inpage
 *
 * --inpage builds the vault in the renderer (no huge CDP JSON). Still NOT a
 * real Chrome directory picker. For a real folder see scripts/stress-fsa-cdp.mjs.
 */
import { chromium } from "playwright";
import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";

const BASE = process.argv.find((a) => a.startsWith("http")) || "http://127.0.0.1:8080/";
const notesArg = process.argv.find((_, i, a) => a[i - 1] === "--notes");
const opensArg = process.argv.find((_, i, a) => a[i - 1] === "--opens");
const INPAGE = process.argv.includes("--inpage");
const NOTES = Math.max(50, Number(notesArg || 800) || 800);
const OPENS = Math.max(8, Number(opensArg || 20) || 20);
const OUT = "/opt/cursor/artifacts/stress/fsa-open-trend.json";
mkdirSync("/opt/cursor/artifacts/stress", { recursive: true });

let files = null;
if (!INPAGE) {
  const gen = spawnSync(
    "npx",
    [
      "--yes",
      "tsx",
      "-e",
      `
import { buildSyntheticVaultSync } from "./src/lib/vault/synthetic-vault.ts";
const built = buildSyntheticVaultSync({ noteCount: ${NOTES} });
const files = {};
for (const n of Object.values(built.nodes)) {
  if (n.kind === "note" && typeof n.content === "string") files[n.path] = n.content;
}
console.log(JSON.stringify(files));
`,
    ],
    { cwd: process.cwd(), encoding: "utf8", timeout: 60_000 },
  );
  if (gen.status !== 0) {
    console.error(gen.stderr || gen.stdout);
    process.exit(1);
  }
  files = JSON.parse(gen.stdout.slice(gen.stdout.indexOf("{")));
}

const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.CHROME_PATH || "/opt/google/chrome/chrome",
  args: ["--enable-precise-memory-info"],
});
const page = await browser.newPage();
page.on("crash", () => {
  console.error("FAIL fsa-open: page crashed (tab discard / OOM)");
});
const t0 = Date.now();
await page.goto(BASE, { waitUntil: "domcontentloaded", timeout: 60000 });
await page.waitForFunction(() => window.__NEXUS_SOAK__, { timeout: 30000 });
if (INPAGE) {
  await page.evaluate(async (n) => {
    await window.__NEXUS_SOAK__.openMockFsaCount(n);
  }, NOTES);
} else {
  await page.evaluate(async (files) => {
    await window.__NEXUS_SOAK__.openMockFsa(files);
  }, files);
}
await page.waitForFunction(
  () => window.__NEXUS_STRESS__?.()?.searchReady === true,
  { timeout: NOTES >= 10_000 ? 300000 : 120000 },
);

let result;
try {
  result = await page.evaluate(async (opens) => {
    return window.__NEXUS_SOAK__.heapTrend(opens);
  }, OPENS);
} catch (err) {
  await browser.close();
  const report = {
    ok: false,
    discarded: true,
    error: String(err),
    notes: NOTES,
    opens: OPENS,
  };
  writeFileSync(OUT, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  console.error("FAIL fsa-open");
  process.exit(1);
}
await browser.close();

const trend = result?.trend ?? [];
const clusterOk = trend.every((row) => (row.clusterHits ?? 0) > 0);
const report = {
  ok:
    Boolean(result) &&
    (result.opened ?? 0) >= OPENS &&
    clusterOk &&
    result.discarded === false &&
    (result.heapMaxMb == null || result.heapFirstMb == null || result.heapMaxMb < 2048),
  notes: NOTES,
  opens: OPENS,
  opened: result?.opened ?? 0,
  discarded: result?.discarded ?? true,
  clusterHits: result?.clusterHits ?? 0,
  heapFirstMb: result?.heapFirstMb ?? null,
  heapLastMb: result?.heapLastMb ?? null,
  heapMaxMb: result?.heapMaxMb ?? null,
  trend,
  totalMs: Date.now() - t0,
};
writeFileSync(OUT, JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
if (!report.ok) {
  console.error("FAIL fsa-open");
  process.exit(1);
}
console.log("PASS fsa-open");
