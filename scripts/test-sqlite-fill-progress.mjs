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
  isInFlightFillError,
  isIndexFillProgressPhase,
  shouldJoinDesktopFill,
  shouldBlockDesktopOpen,
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

assert.equal(
  isInFlightFillError(new Error("index fill already running for this vault")),
  true,
);
assert.equal(isInFlightFillError("index fill in progress"), true);
assert.equal(
  isInFlightFillError(new Error("SQLite FTS fill failed: disk I/O")),
  false,
  "real fill failures stay fatal",
);

assert.equal(isIndexFillProgressPhase("walking"), true);
assert.equal(isIndexFillProgressPhase("indexing"), true);
assert.equal(isIndexFillProgressPhase("ready"), false);
assert.equal(isIndexFillProgressPhase("error"), false);

assert.equal(
  shouldJoinDesktopFill({
    currentRoot: "/vault/Notes/",
    nextRoot: "/vault/Notes",
    fillInFlight: true,
  }),
  true,
  "same folder Open during fill joins",
);
assert.equal(
  shouldJoinDesktopFill({
    currentRoot: "/vault/Notes",
    nextRoot: "/vault/Other",
    fillInFlight: true,
  }),
  false,
);
assert.equal(
  shouldJoinDesktopFill({
    currentRoot: "/vault/Notes",
    nextRoot: "/vault/Notes",
    fillInFlight: false,
  }),
  false,
  "no join when fill is idle",
);
assert.equal(
  shouldBlockDesktopOpen({
    currentRoot: "/vault/Notes",
    nextRoot: "/vault/Other",
    fillInFlight: true,
  }),
  true,
  "different folder Open during fill is blocked",
);
assert.equal(
  shouldBlockDesktopOpen({
    currentRoot: "/vault/Notes",
    nextRoot: "/vault/Notes",
    fillInFlight: true,
  }),
  false,
);
assert.equal(
  shouldBlockDesktopOpen({
    currentRoot: null,
    nextRoot: "/vault/Notes",
    fillInFlight: true,
  }),
  true,
  "no current root + fill still blocks a second Open",
);

{
  const { NativeSqliteDurableIndex } = await import(
    "../src/lib/vault/native-sqlite-index.ts"
  );
  let calls = 0;
  /** @type {(cmd: string, args?: Record<string, unknown>) => Promise<unknown>} */
  const invoke = async (cmd) => {
    if (cmd !== "vault_index_fill_from_disk") throw new Error(cmd);
    calls += 1;
    await new Promise((r) => setTimeout(r, 40));
    return { indexed: 3, skipped: 1, errors: 0, notes: 4, edges: 6 };
  };
  const idx = new NativeSqliteDurableIndex("db.sqlite", "vault", "/vault", invoke);
  const [a, b] = await Promise.all([idx.fillFromDisk(8000), idx.fillFromDisk(8000)]);
  assert.equal(calls, 1, "second fillFromDisk must join the in-flight invoke");
  assert.equal(a.indexed, 3);
  assert.equal(b.indexed, 3);
  assert.equal(a.edges, 6);
}

console.log("sqlite-fill-progress: PASS");
