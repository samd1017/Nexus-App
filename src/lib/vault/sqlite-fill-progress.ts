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
