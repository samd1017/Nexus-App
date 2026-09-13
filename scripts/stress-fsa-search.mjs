/**
 * Playwright mock-FSA: same fill path as a real folder open, no picker.
 *
 *   node scripts/stress-fsa-search.mjs http://127.0.0.1:8080/ --notes 800
 */
import { chromium } from "playwright";
import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";

const BASE = process.argv[2] || "http://127.0.0.1:8080/";
const notesArg = process.argv.find((_, i, a) => a[i - 1] === "--notes");
const NOTES = Math.max(50, Number(notesArg || 800) || 800);
const OUT = "/opt/cursor/artifacts/stress/fsa-search.json";
mkdirSync("/opt/cursor/artifacts/stress", { recursive: true });

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
const files = JSON.parse(gen.stdout.slice(gen.stdout.indexOf("{")));

const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.CHROME_PATH || "/opt/google/chrome/chrome",
  args: ["--enable-precise-memory-info"],
});
const page = await browser.newPage();
const t0 = Date.now();
await page.goto(BASE, { waitUntil: "domcontentloaded", timeout: 60000 });
await page.waitForFunction(() => window.__NEXUS_SOAK__, { timeout: 30000 });
const openT0 = Date.now();
await page.evaluate(async (files) => {
  await window.__NEXUS_SOAK__.openMockFsa(files);
}, files);
const openMs = Date.now() - openT0;
await page.waitForFunction(
  () => window.__NEXUS_STRESS__?.()?.searchReady === true,
  { timeout: 120000 },
);
const searchT0 = Date.now();
const search = await page.evaluate(async () => {
  const hub = await window.__NEXUS_SOAK__.search("hub", 16);
  const cluster = await window.__NEXUS_SOAK__.search("cluster", 16);
  const probe = window.__NEXUS_STRESS__();
  const n = await window.__NEXUS_SOAK__.openNotes(20);
  const clusterAfter = await window.__NEXUS_SOAK__.search("cluster", 16);
  const after = window.__NEXUS_STRESS__();
  return { hub, cluster, probe, opened: n, clusterAfter, after };
});
const searchMs = Date.now() - searchT0;
await browser.close();

const after = search.after ?? search.probe;
const report = {
  ok:
    (search.hub?.hits?.length ?? 0) > 0 &&
    (search.cluster?.hits?.length ?? 0) > 0 &&
    search.probe?.searchEngine?.id === "memory-fts-capped" &&
    search.probe?.searchReady === true &&
    (search.opened ?? 0) >= 20 &&
    (search.clusterAfter?.hits?.length ?? 0) > 0 &&
    (after?.bodiesLoaded ?? 99) <= 120 &&
    (after?.ftsLargestPosting ?? 0) <= 800 &&
    (after?.ftsNoteTokenSets ?? 999) <= 120,
  notes: NOTES,
  files: Object.keys(files).length,
  openMs,
  searchMs,
  hubHits: search.hub?.hits?.length ?? 0,
  clusterHits: search.cluster?.hits?.length ?? 0,
  searchEngine: search.probe?.searchEngine ?? null,
  searchReady: search.probe?.searchReady ?? false,
  ftsNotes: search.probe?.ftsNotes ?? 0,
  bodiesLoaded: search.probe?.bodiesLoaded ?? 0,
  openedNotes: search.opened ?? 0,
  openedClusterHits: search.clusterAfter?.hits?.length ?? 0,
  openedBodiesLoaded: after?.bodiesLoaded ?? 0,
  ftsLargestPosting: after?.ftsLargestPosting ?? null,
  ftsNoteTokenSets: after?.ftsNoteTokenSets ?? null,
  ftsSlimNotes: after?.ftsSlimNotes ?? null,
  jsHeapUsedMb: after?.jsHeapUsedMb ?? null,
  jsHeapLimitMb: after?.jsHeapLimitMb ?? null,
  discarded: false,
  mode: search.probe?.mode ?? null,
  totalMs: Date.now() - t0,
};
writeFileSync(OUT, JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
if (!report.ok) {
  console.error("FAIL fsa-search");
  process.exit(1);
}
console.log("PASS fsa-search");
