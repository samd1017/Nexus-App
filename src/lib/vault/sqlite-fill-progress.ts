/**
 * Desktop SQLite FTS fill progress helpers (no Tauri import).
 * Banner copy + success/failure rules for native fillFromDisk.
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
};

export type SqliteFillResult = {
  indexed: number;
  skipped?: number;
  errors: number;
  notes: number;
};

export function sqliteFillProgressMessage(
  p: Pick<SqliteFillProgress, "scanned" | "total" | "skipped" | "indexed">,
): string {
  const total = p.total > 0 ? p.total : p.scanned;
  const extra =
    p.skipped > 0 ? ` · ${p.skipped.toLocaleString()} unchanged` : "";
  return `Workspace ready — indexing SQLite FTS5… ${p.scanned.toLocaleString()} / ${total.toLocaleString()}${extra}`;
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
  return phase === "walking" || phase === "indexing";
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
