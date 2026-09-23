/**
 * First-open architecture checks (meta-first + progressive FTS).
 *
 * Linux CI: JS phase / settle rules. Rust 1k/10k timing budgets run via
 * `npm run test:sqlite-fill-rust` (first_open_timing_budget_*).
 *
 * Windows 100k is a Tower verification target, not claimed here.
 *
 *   npm run test:first-open
 */
import assert from "node:assert/strict";

if (!process.env.NEXUS_TSX) {
  const { spawnSync } = await import("node:child_process");
  const r = spawnSync("npx", ["--yes", "tsx", "scripts/test-first-open-fts.mjs"], {
    cwd: process.cwd(),
    encoding: "utf8",
    timeout: 30_000,
    env: { ...process.env, NEXUS_TSX: "1" },
  });
  if (r.stdout) process.stdout.write(r.stdout);
  if (r.stderr) process.stderr.write(r.stderr);
  process.exit(r.status ?? 1);
}

const {
  advanceSearchIndexState,
  isFillSettlePhase,
  sqliteEngineShortLabel,
  sqliteFillPhaseMessage,
} = await import("../src/lib/vault/sqlite-fill-progress.ts");

assert.equal(isFillSettlePhase("ready-meta", "meta"), true);
assert.equal(isFillSettlePhase("done", "meta"), true);
assert.equal(isFillSettlePhase("fts", "meta"), false);
assert.equal(isFillSettlePhase("ready-fts-partial", "fts-partial"), true);
assert.match(
  sqliteFillPhaseMessage({
    phase: "ready-meta",
    scanned: 100000,
    total: 100000,
    skipped: 0,
    indexed: 100000,
  }),
  /title search/,
);
assert.equal(sqliteEngineShortLabel("ready-meta").includes("SQLite FTS5 BM25"), true);
assert.equal(advanceSearchIndexState("ready-meta", "fts-partial"), "ready-fts-partial");
assert.equal(advanceSearchIndexState("ready-fts-partial", "done"), "ready-fts");
assert.equal(
  advanceSearchIndexState("ready-meta", "done", "ready-fts-partial"),
  "ready-fts-partial",
);

console.log("first-open JS phase rules: PASS");
console.log("");
console.log("Documented first-open targets (not SCALE READY):");
console.log("  Linux CI: 1k meta <2.5s, 1k short-head <6s; 10k title-seed ready-meta <8s, 10k short-head <45s");
console.log("  Desktop: title search for a fixed window (open folder first) is announced");
console.log("    before the rest of the folder is listed. Open-note heads follow.");
console.log("    The remaining titles list in the background and yield between batches.");
console.log("  Cold 100k retest: time title-useful and Ready on the existing vault.");
console.log("    Neither should grow like a full folder listing. After Ready, open,");
console.log("    scroll, graph, and title search stay responsive while names are still listing.");
console.log("  Official vault only (SOAK-MANIFEST / npm run gen:soak-vault). Unofficial Meeting-*");
console.log("    folders with hub_files=0 are a false alarm — probe those with cluster only.");
console.log("  After ready-meta, palette title search is live (not “try again when Ready”).");
console.log("  A title the listing has not reached can miss until that batch lands.");
console.log("  Mid-walk clicks (tree/graph/note) must stay snappy: the listing yields,");
console.log("    and the banner does not go back to cataloging after Ready.");
console.log("  A body word in a note you have not opened stays missing until you open it.");
console.log("first-open: PASS");
