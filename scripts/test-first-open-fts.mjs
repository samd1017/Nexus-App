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

console.log("first-open JS phase rules: PASS");
console.log("");
console.log("Documented first-open targets (not SCALE READY):");
console.log("  Linux CI: 1k meta <2.5s, 1k short-head <6s; 10k meta <12s, 10k short-head <30s");
console.log("  Windows 100k (Tower): tree/editor <3s; usable title search with ready-meta;");
console.log("    usable body search (hub/cluster) <15s via short-head FTS; full 8k FTS background");
console.log("first-open: PASS");
