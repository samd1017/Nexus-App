/**
 * Desktop SQLite FTS fill progress helpers (no Tauri import).
 * Banner copy + success/failure rules + honest search-index phases.
 * `ready-meta` may fire after a title/path FTS seed — Open must not wait
 * for every empty-body row or short-head before title search is live.
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
  edges?: number;
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
  // "meta" is the path walk. Batches commit titles along the way.
  // ready-meta is the interactive window, not the end of the listing.
  if (phase === "ready-meta") return "ready-meta";
  return "idle";
}

export function advanceSearchIndexState(
  prev: SearchIndexState,
  phase: string,
  searchState?: string | null,
): SearchIndexState {
  if (phase === "done" && searchState === "ready-fts-partial") {
    if (prev === "error") return "error";
    const next: SearchIndexState = "ready-fts-partial";
    return STATE_RANK[next] >= STATE_RANK[prev] ? next : prev;
  }
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

/**
 * A total is honest when it can contain `scanned`. A startup hint of 1
 * must not turn 24,064 scanned notes into 100%. A heads-phase reset of
 * scanned=0 must not flash `0 / N`.
 */
export function honestFillTotal(scanned: number, total: number): number | null {
  if (!(total > 1) || scanned <= 0 || total < scanned) return null;
  return total;
}

export function fillCountLabel(scanned: number, total: number): string {
  if (scanned <= 0) return "";
  const honest = honestFillTotal(scanned, total);
  if (honest == null) return `${scanned.toLocaleString()} so far`;
  return `${scanned.toLocaleString()} / ${honest.toLocaleString()}`;
}

/**
 * Count shown beside the open banner. Ready never claims 100% of a total:
 * a full-vault denominator made a window-sized Ready look like the listing
 * had finished.
 */
export function openProgressTail(
  phase: string,
  scanned: number,
  totalHint: number | null | undefined,
): string {
  if (!(scanned > 0)) return "";
  const count = ` · ${scanned.toLocaleString()} items`;
  if (phase === "ready" || phase === "error") return count;
  const ratio = fillProgressRatio(scanned, totalHint);
  if (ratio == null) return count;
  return `${count} · ${Math.round(ratio * 100)}%`;
}

export function fillProgressRatio(
  scanned: number,
  totalHint: number | null | undefined,
): number | null {
  if (totalHint == null) return null;
  const honest = honestFillTotal(scanned, totalHint);
  if (honest == null) return null;
  return scanned / honest;
}

export function sqliteFillPhaseMessage(
  p: Pick<
    SqliteFillProgress,
    "phase" | "scanned" | "total" | "skipped" | "indexed"
  >,
): string {
  const counts = fillCountLabel(p.scanned, p.total);
  const tail = counts ? ` ${counts}` : "";
  if (p.phase === "ready-meta") {
    return `Workspace ready — title search on. Cataloging notes…${tail}`;
  }
  if (p.phase === "meta") {
    return `Workspace ready — cataloging notes…${tail}`;
  }
  if (p.phase === "fts-partial" || p.phase === "ready-fts-partial") {
    return `Workspace ready — search filling note heads…${tail}`;
  }
  if (p.phase === "fts") {
    return `Workspace ready — indexing open notes…${tail}`;
  }
  if (!counts) return "Workspace ready — indexing SQLite FTS5…";
  return `Workspace ready — indexing SQLite FTS5…${tail}`;
}

export function mergeCatalogAndFtsHits<T extends { noteId: string; path: string }>(
  catalog: T[],
  fts: T[],
  limit: number,
): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  const cap = limit > 0 ? limit : catalog.length + fts.length;
  for (const hit of [...catalog, ...fts]) {
    const key = hit.noteId || hit.path;
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(hit);
    if (out.length >= cap) break;
  }
  return out;
}

/** Empty native walk on a non-empty tree is a scope/forbidden failure, not a no-op skip. */
export function isEmptyNativeFillFailure(args: {
  noteCount: number;
  indexed: number;
  notes: number;
  skipped?: number;
  scanned?: number;
}): boolean {
  if (args.noteCount <= 0) return false;
  // The first page landed. A warm index often reports no new rows yet.
  if ((args.scanned ?? 0) > 0) return false;
  const skipped = args.skipped ?? 0;
  return args.indexed === 0 && args.notes === 0 && skipped === 0;
}

export function sqliteFillReadyMessage(skipped: number, notes: number): string {
  if (notes > 0 && skipped >= notes) {
    return "Ready · SQLite FTS5 BM25 (unchanged)";
  }
  return "Ready · SQLite FTS5 BM25";
}

/** Banner once the background fill has stopped. A large vault stays on titles plus the notes that were opened. */
export function sqliteFillSettledMessage(
  searchState: string | null | undefined,
  skipped: number,
  notes: number,
): string {
  if (searchState === "ready-fts-partial") return "Ready · titles and open notes";
  return sqliteFillReadyMessage(skipped, notes);
}

/** Second fill invoke while one is healthy — join, do not paint a red banner. */
export function isInFlightFillError(err: unknown): boolean {
  const msg =
    err instanceof Error
      ? err.message
      : typeof err === "string"
        ? err
        : String(err ?? "");
  return /already running for this vault|fill join failed|fill in progress/i.test(
    msg,
  );
}

export function isIndexFillProgressPhase(phase: string): boolean {
  return (
    phase === "walking" ||
    phase === "indexing" ||
    phase === "meta" ||
    phase === "fts-partial" ||
    phase === "fts"
  );
}

export function normalizeVaultRoot(root: string): string {
  return root.replace(/\\/g, "/").replace(/\/+$/, "");
}

/** Same-folder Open during fill must join, not remount. */
export function shouldJoinDesktopFill(args: {
  currentRoot: string | null | undefined;
  nextRoot: string;
  fillInFlight: boolean;
}): boolean {
  if (!args.fillInFlight || !args.currentRoot) return false;
  return normalizeVaultRoot(args.currentRoot) === normalizeVaultRoot(args.nextRoot);
}

/**
 * A second open waits on the in-flight index job only when this folder is
 * not searchable yet. Once the saved page is Ready, that job is background
 * and must not hold the next announcement.
 */
export function shouldWaitForInflightFill(args: {
  fillInFlight: boolean;
  searchReady: boolean;
}): boolean {
  return args.fillInFlight && !args.searchReady;
}

/** Opening a different folder while fill is healthy — block, do not start a second writer. */
export function shouldBlockDesktopOpen(args: {
  currentRoot: string | null | undefined;
  nextRoot: string;
  fillInFlight: boolean;
}): boolean {
  return args.fillInFlight && !shouldJoinDesktopFill(args);
}

export const FILL_IN_PROGRESS_TOAST =
  "Still indexing this vault — wait until Ready to open another.";

export function sqliteEngineShortLabel(state: SearchIndexState): string {
  if (state === "ready-meta") return "SQLite FTS5 BM25 · titles";
  if (state === "ready-fts-partial") return "SQLite FTS5 BM25 · heads";
  return "SQLite FTS5 BM25";
}

/** Title/path FTS is queryable — palette must not wait for note heads. */
export function isTitleSearchLive(state: SearchIndexState): boolean {
  return STATE_RANK[state] >= STATE_RANK["ready-meta"] && state !== "error";
}

export function isNoteHeadSearchLive(state: SearchIndexState): boolean {
  return state === "ready-fts-partial" || state === "ready-fts";
}

/**
 * Empty palette row after a query. After ready-meta, title search is live —
 * do not tell the user to wait until Ready (that is full deep FTS).
 */
export type SearchEmptyStatus = "failed" | "pending" | "miss" | "reading";

/** Memory search can answer before the sqlite fill clock reaches ready-meta. */
export function searchAnswersNow(args: {
  titleSearchLive: boolean;
  memorySearch?: boolean;
}): boolean {
  return args.titleSearchLive || args.memorySearch === true;
}

/** Same decision as the empty-palette sentence, so the status attribute cannot drift. */
export function searchEmptyStatus(args: {
  titleSearchLive: boolean;
  memorySearch?: boolean;
  failed?: boolean;
  pending?: boolean;
}): SearchEmptyStatus {
  if (args.failed) return "failed";
  if (args.pending) return "pending";
  if (searchAnswersNow(args)) return "miss";
  return "reading";
}

export function searchEmptyStateMessage(args: {
  titleSearchLive: boolean;
  headsReady: boolean;
  /** Desktop shell catalog can answer titles before FTS is claimable. */
  catalogSearch?: boolean;
  /** The lookup failed. Distinct from a miss and from still reading. */
  failed?: boolean;
  /** A lookup is in flight and nothing has matched yet. */
  pending?: boolean;
}): string {
  if (args.failed) return "Search did not finish. Try again.";
  if (!args.titleSearchLive) {
    if (args.catalogSearch) return "No title matches in the catalog yet.";
    return "Search is still reading files — try again when Ready.";
  }
  // Titles are live. Say we are still looking, then a plain miss.
  // Do not tell the user to wait until Ready.
  if (args.pending) return "Looking through notes…";
  return "No notes match.";
}
