/**
 * Desktop SQLite FTS fill progress helpers (no Tauri import).
 * Banner copy + success/failure rules + honest search-index phases.
 */

export type SqliteFillProgress = {
  dbPath?: string;
  scanned: number;
  total: number;
  indexed: number;
  skipped: number;
  errors: number;
  phase: string;
  message?: string | null;
  searchState?: string | null;
};

export type SqliteFillResult = {
  indexed: number;
  skipped?: number;
  errors: number;
  notes: number;
  searchState?: string;
};

export type SearchIndexState =
  | "idle"
  | "ready-meta"
  | "ready-fts-partial"
  | "ready-fts"
  | "error";

export type FillSettlePhase = "meta" | "fts-partial" | "done";

const STATE_RANK: Record<SearchIndexState, number> = {
  idle: 0,
  error: 0,
  "ready-meta": 1,
  "ready-fts-partial": 2,
  "ready-fts": 3,
};

let searchIndexState: SearchIndexState = "idle";

export function getSearchIndexState(): SearchIndexState {
  return searchIndexState;
}

export function setSearchIndexState(next: SearchIndexState): void {
  searchIndexState = next;
}

export function searchStateFromPhase(phase: string): SearchIndexState {
  if (phase === "error") return "error";
  if (phase === "done") return "ready-fts";
  if (
    phase === "ready-fts-partial" ||
    phase === "fts-partial" ||
    phase === "fts"
  ) {
    return "ready-fts-partial";
  }
  if (phase === "ready-meta" || phase === "meta") return "ready-meta";
  return "idle";
}

export function advanceSearchIndexState(
  prev: SearchIndexState,
  phase: string,
): SearchIndexState {
  const next = searchStateFromPhase(phase);
  if (next === "error") return "error";
  return STATE_RANK[next] >= STATE_RANK[prev] ? next : prev;
}

export function isFillSettlePhase(
  phase: string,
  settleAt: FillSettlePhase,
): boolean {
  if (phase === "error") return true;
  if (phase === "done") return true;
  if (settleAt === "meta") return phase === "ready-meta";
  if (settleAt === "fts-partial") return phase === "ready-fts-partial";
  return phase === "done";
}

export function sqliteFillProgressMessage(
  p: Pick<SqliteFillProgress, "scanned" | "total" | "skipped" | "indexed">,
): string {
  const total = p.total > 0 ? p.total : p.scanned;
  const extra =
    p.skipped > 0 ? ` · ${p.skipped.toLocaleString()} unchanged` : "";
  return `Workspace ready — indexing SQLite FTS5… ${p.scanned.toLocaleString()} / ${total.toLocaleString()}${extra}`;
}

export function sqliteFillPhaseMessage(
  p: Pick<
    SqliteFillProgress,
    "phase" | "scanned" | "total" | "skipped" | "indexed"
  >,
): string {
  const counts = sqliteFillProgressMessage(p);
  if (p.phase === "meta" || p.phase === "ready-meta") {
    return `Workspace ready — title search on. Cataloging notes… ${p.scanned.toLocaleString()} / ${(p.total > 0 ? p.total : p.scanned).toLocaleString()}`;
  }
  if (p.phase === "fts-partial" || p.phase === "ready-fts-partial") {
    return `Workspace ready — search filling note heads… ${p.scanned.toLocaleString()} / ${(p.total > 0 ? p.total : p.scanned).toLocaleString()}`;
  }
  if (p.phase === "fts") {
    return `Workspace ready — deepening SQLite FTS5… ${p.scanned.toLocaleString()} / ${(p.total > 0 ? p.total : p.scanned).toLocaleString()}`;
  }
  return counts;
}

/** Empty native walk on a non-empty tree is a scope/forbidden failure, not a no-op skip. */
export function isEmptyNativeFillFailure(args: {
  noteCount: number;
  indexed: number;
  notes: number;
  skipped?: number;
}): boolean {
  if (args.noteCount <= 0) return false;
  const skipped = args.skipped ?? 0;
  return args.indexed === 0 && args.notes === 0 && skipped === 0;
}

export function sqliteFillReadyMessage(skipped: number, notes: number): string {
  if (notes > 0 && skipped >= notes) {
    return "Ready · SQLite FTS5 BM25 (unchanged)";
  }
  return "Ready · SQLite FTS5 BM25";
}

export function sqliteEngineShortLabel(state: SearchIndexState): string {
  if (state === "ready-meta") return "SQLite FTS5 BM25 · titles";
  if (state === "ready-fts-partial") return "SQLite FTS5 BM25 · heads";
  return "SQLite FTS5 BM25";
}
