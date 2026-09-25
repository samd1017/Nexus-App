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
  advanceSearchIndexState,
  isEmptyNativeFillFailure,
  isFillSettlePhase,
  sqliteEngineShortLabel,
  fillCountLabel,
  fillProgressRatio,
  openProgressTail,
  honestFillTotal,
  mergeCatalogAndFtsHits,
  sqliteFillPhaseMessage,
  isTitleSearchLive,
  isNoteHeadSearchLive,
  searchEmptyStateMessage,
  searchEmptyStatus,
  searchStateFromPhase,
  sqliteFillProgressMessage,
  sqliteFillReadyMessage,
  sqliteFillSettledMessage,
  isInFlightFillError,
  isIndexFillProgressPhase,
  shouldJoinDesktopFill,
  shouldBlockDesktopOpen,
  shouldWaitForInflightFill,
  vaultSwitcherShowsIndexing,
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
  isEmptyNativeFillFailure({
    noteCount: 100000,
    indexed: 0,
    notes: 0,
    skipped: 0,
    scanned: 32,
  }),
  false,
  "a warm index that already showed the first page is not a scope failure",
);

assert.equal(
  sqliteFillReadyMessage(100000, 100000),
  "Ready · SQLite FTS5 BM25 (unchanged)",
);
assert.equal(sqliteFillReadyMessage(0, 100000), "Ready · SQLite FTS5 BM25");
assert.equal(
  sqliteFillSettledMessage("ready-fts-partial", 0, 100000),
  "Ready · titles and open notes",
);
assert.equal(
  sqliteFillSettledMessage("ready-fts", 0, 12),
  "Ready · SQLite FTS5 BM25",
);

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
assert.equal(isIndexFillProgressPhase("meta"), true);
assert.equal(isIndexFillProgressPhase("fts-partial"), true);
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
  shouldWaitForInflightFill({ fillInFlight: true, searchReady: false }),
  true,
  "an open still waits when titles are not live yet",
);
assert.equal(
  shouldWaitForInflightFill({ fillInFlight: true, searchReady: true }),
  false,
  "a filled page does not wait for the background index open",
);
assert.equal(
  shouldWaitForInflightFill({ fillInFlight: false, searchReady: false }),
  false,
);
assert.equal(
  shouldBlockDesktopOpen({
    currentRoot: "/vault/Notes",
    nextRoot: "/vault/Other",
    fillInFlight: true,
  }),
  false,
  "indexing does not block opening another folder",
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
  false,
  "a fill with no current root still does not block Open",
);
assert.equal(
  vaultSwitcherShowsIndexing({
    connecting: false,
    indexFillBusy: true,
    bannerPhase: "indexing",
  }),
  true,
);
assert.equal(
  vaultSwitcherShowsIndexing({
    connecting: false,
    indexFillBusy: true,
    bannerPhase: "ready",
  }),
  false,
  "Ready already on the banner — the card does not say Indexing",
);
assert.equal(
  vaultSwitcherShowsIndexing({
    connecting: true,
    indexFillBusy: true,
    bannerPhase: "indexing",
  }),
  false,
);

assert.equal(
  searchStateFromPhase("meta"),
  "idle",
  "the path walk must not claim FTS titles are on",
);
assert.equal(searchStateFromPhase("ready-meta"), "ready-meta");
assert.equal(advanceSearchIndexState("idle", "meta"), "idle");
assert.equal(advanceSearchIndexState("idle", "ready-meta"), "ready-meta");

assert.equal(honestFillTotal(24064, 1), null);
assert.equal(honestFillTotal(1, 1), null);
assert.equal(honestFillTotal(0, 10001), null);
assert.equal(honestFillTotal(32768, 100002), 100002);
assert.equal(fillProgressRatio(24064, 1), null);
assert.equal(fillProgressRatio(1, 1), null);
assert.equal(fillProgressRatio(0, 10001), null);
assert.ok(Math.abs((fillProgressRatio(32768, 100002) ?? 0) - 32768 / 100002) < 1e-9);
assert.equal(openProgressTail("ready", 100006, 100006).includes("100%"), false);
assert.equal(openProgressTail("ready", 100006, null).includes("%"), false);
assert.match(openProgressTail("ready", 32, null), /32 notes/);
assert.match(openProgressTail("indexing", 500, 1000), /50%/);

const lying = sqliteFillPhaseMessage({
  phase: "meta",
  scanned: 24064,
  total: 1,
  skipped: 0,
  indexed: 24064,
});
assert.match(lying, /cataloging notes/i);
assert.equal(lying.includes("title search on"), false);
assert.equal(lying.includes("/ 1"), false);
assert.match(lying, /24,064 so far/);

assert.equal(
  sqliteFillPhaseMessage({
    phase: "fts-partial",
    scanned: 0,
    total: 10001,
    skipped: 0,
    indexed: 10001,
  }).includes("0 /"),
  false,
  "heads fill must not flash 0 / N after the tree is usable",
);
assert.match(
  sqliteFillPhaseMessage({
    phase: "fts",
    scanned: 32768,
    total: 100002,
    skipped: 0,
    indexed: 32768,
  }),
  /32,768 \/ 100,002/,
);
assert.match(
  sqliteFillPhaseMessage({
    phase: "ready-meta",
    scanned: 100000,
    total: 100000,
    skipped: 0,
    indexed: 100000,
  }),
  /title search on/,
);
assert.equal(
  sqliteFillPhaseMessage({
    phase: "meta",
    scanned: 100000,
    total: 100000,
    skipped: 0,
    indexed: 100000,
  }).includes("title search on"),
  false,
);
assert.match(
  sqliteFillPhaseMessage({
    phase: "fts-partial",
    scanned: 12800,
    total: 100000,
    skipped: 0,
    indexed: 12800,
  }),
  /note heads/,
);
assert.match(fillCountLabel(12800, 100000), /12,800 \/ 100,000/);

const hub = { noteId: "desk_Hub", path: "00-Inbox/00/Hub 0.md" };
const merged = mergeCatalogAndFtsHits(
  [hub],
  [],
  16,
);
assert.equal(merged.length, 1);
assert.equal(merged[0].path, hub.path);
assert.equal(
  mergeCatalogAndFtsHits([hub], [{ noteId: "desk_Hub", path: hub.path }, { noteId: "other", path: "Topic.md" }], 16)
    .length,
  2,
);
assert.equal(isFillSettlePhase("ready-meta", "meta"), true);
assert.equal(
  isFillSettlePhase("fts-partial", "meta"),
  false,
  "Open settles on ready-meta (title seed), not on later head phases",
);
assert.equal(isFillSettlePhase("done", "meta"), true);
assert.equal(isFillSettlePhase("ready-fts-partial", "fts-partial"), true);
assert.equal(
  advanceSearchIndexState("ready-meta", "fts"),
  "ready-fts-partial",
);
assert.equal(advanceSearchIndexState("ready-fts-partial", "done"), "ready-fts");
assert.equal(
  advanceSearchIndexState("ready-fts-partial", "done", "ready-fts-partial"),
  "ready-fts-partial",
  "a capped fill must not claim every note body is indexed",
);
assert.equal(advanceSearchIndexState("ready-fts", "meta"), "ready-fts");
assert.equal(sqliteEngineShortLabel("ready-meta"), "SQLite FTS5 BM25 · titles");
assert.equal(sqliteEngineShortLabel("ready-fts-partial"), "SQLite FTS5 BM25 · heads");
assert.equal(sqliteEngineShortLabel("ready-fts"), "SQLite FTS5 BM25");

assert.equal(isTitleSearchLive("idle"), false);
assert.equal(isTitleSearchLive("ready-meta"), true);
assert.equal(isTitleSearchLive("ready-fts-partial"), true);
assert.equal(isTitleSearchLive("ready-fts"), true);
assert.equal(isNoteHeadSearchLive("ready-meta"), false);
assert.equal(isNoteHeadSearchLive("ready-fts-partial"), true);
assert.match(
  searchEmptyStateMessage({ titleSearchLive: false, headsReady: false }),
  /still reading files/,
);
assert.match(
  searchEmptyStateMessage({
    titleSearchLive: false,
    headsReady: false,
    catalogSearch: true,
  }),
  /catalog yet/,
);
assert.equal(
  searchEmptyStateMessage({
    titleSearchLive: false,
    headsReady: false,
    catalogSearch: true,
  }).includes("when Ready"),
  false,
);
assert.equal(
  searchEmptyStateMessage({ titleSearchLive: true, headsReady: false }),
  "No notes match.",
  "after title seed, an empty result is a miss, not a still-filling lock",
);
assert.equal(
  searchEmptyStateMessage({ titleSearchLive: true, headsReady: false }).includes(
    "still filling",
  ),
  false,
  "palette must not say note-head search is still filling once titles are live",
);
assert.equal(
  searchEmptyStateMessage({ titleSearchLive: true, headsReady: false }).includes(
    "try again when Ready",
  ),
  false,
  "palette must not gate title search on the note-head / Ready phase",
);
assert.match(
  searchEmptyStateMessage({ titleSearchLive: true, headsReady: true }),
  /No notes match/,
);
assert.equal(
  searchEmptyStateMessage({
    titleSearchLive: true,
    headsReady: false,
    failed: true,
  }),
  "Search did not finish. Try again.",
);
assert.equal(
  searchEmptyStateMessage({
    titleSearchLive: true,
    headsReady: true,
    pending: true,
  }),
  "Looking through notes…",
);
assert.equal(
  searchEmptyStateMessage({
    titleSearchLive: true,
    headsReady: false,
    pending: true,
  }).includes("No notes match."),
  false,
  "a lookup in flight must not say the search already missed",
);
assert.match(
  searchEmptyStateMessage({
    titleSearchLive: false,
    headsReady: false,
    pending: true,
  }),
  /still reading files/,
);
assert.equal(
  searchEmptyStateMessage({
    titleSearchLive: true,
    headsReady: false,
    pending: false,
    failed: false,
  }),
  "No notes match.",
);
assert.equal(
  searchEmptyStatus({ titleSearchLive: false, memorySearch: true }),
  "miss",
  "a finished memory search with no hit is a miss, not still reading",
);
assert.equal(
  searchEmptyStatus({ titleSearchLive: true, memorySearch: false }),
  "miss",
);
assert.equal(
  searchEmptyStatus({ titleSearchLive: false, memorySearch: false }),
  "reading",
);
assert.equal(
  searchEmptyStatus({ titleSearchLive: true, pending: true }),
  "pending",
);
assert.equal(
  searchEmptyStatus({ titleSearchLive: true, failed: true }),
  "failed",
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
