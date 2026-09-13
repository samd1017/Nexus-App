/**
 * Desktop SQLite fill progress / incremental success rules.
 * Run: npm run test:sqlite-fill
 */
import assert from "node:assert/strict";

if (!process.env.NEXUS_TSX) {
  const { spawnSync } = await import("node:child_process");
  const r = spawnSync("npx", ["--yes", "tsx", "scripts/test-sqlite-fill-progress.mjs"], {
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
  isEmptyNativeFillFailure,
  sqliteFillProgressMessage,
  sqliteFillReadyMessage,
} = await import("../src/lib/vault/sqlite-fill-progress.ts");

assert.equal(
  sqliteFillProgressMessage({
    scanned: 0,
    total: 100000,
    skipped: 0,
    indexed: 0,
  }),
  "Workspace ready — indexing SQLite FTS5… 0 / 100,000",
);
assert.match(
  sqliteFillProgressMessage({
    scanned: 12800,
    total: 100000,
    skipped: 12000,
    indexed: 800,
  }),
  /12,800 \/ 100,000 · 12,000 unchanged/,
);

assert.equal(
  isEmptyNativeFillFailure({
    noteCount: 100000,
    indexed: 0,
    notes: 0,
    skipped: 0,
  }),
  true,
  "empty native walk on a 100k tree is a failure",
);
assert.equal(
  isEmptyNativeFillFailure({
    noteCount: 100000,
    indexed: 0,
    notes: 100000,
    skipped: 100000,
  }),
  false,
  "incremental skip of a warm index is success",
);
assert.equal(
  isEmptyNativeFillFailure({
    noteCount: 100000,
    indexed: 12,
    notes: 100000,
    skipped: 99988,
  }),
  false,
);

assert.equal(
  sqliteFillReadyMessage(100000, 100000),
  "Ready · SQLite FTS5 BM25 (unchanged)",
);
assert.equal(sqliteFillReadyMessage(0, 100000), "Ready · SQLite FTS5 BM25");

console.log("sqlite-fill-progress: PASS");
