/**
 * Mid-fill interaction policy (Linux Tauri 100k).
 *
 * Fill used to saturate disk + hold long SQLite WAL locks while every
 * tree/graph select called ensureNoteBody → vault_index_upsert. The JS
 * SQLite mirror is intentionally empty at scale, so slimNotes looked like
 * 0 and every click wrote FTS against the live fill (15s busy_timeout).
 *
 * Keep title-seed / fill-join / Open-gate / link_edge / phases unchanged.
 */

/**
 * The note the user just opened reads from disk immediately.
 * Fill may still be writing the catalog. The SQLite upsert stays
 * skipped (`shouldSkipDurableUpsertOnHydrate`) so this read does not
 * start a second writer. Hover and embeds stay on
 * `shouldSkipBackgroundBodyHydrate`.
 */
export function shouldDeferNoteBodyHydrate(_args: {
  fillBusy: boolean;
}): boolean {
  return false;
}

/**
 * Opening a note must not start a second SQLite writer during fill.
 * Desktop search is disk BM25 — hydrating one body into the empty JS
 * mirror (slimNotes ≈ 0) is what made each click wait on the fill lock.
 */
export function shouldSkipDurableUpsertOnHydrate(args: {
  fillBusy: boolean;
  indexKind?: string | null;
  slimNotes: number;
}): boolean {
  if (args.fillBusy) return true;
  if (args.indexKind === "sqlite") return true;
  return (args.slimNotes ?? 0) >= 400;
}

/**
 * After the capped fill settles, opening a note writes that one deep head
 * into SQLite. During fill the click must not start a second writer.
 */
export function shouldIndexOpenedDesktopNote(args: {
  fillBusy: boolean;
  indexKind?: string | null;
}): boolean {
  return args.fillBusy !== true && args.indexKind === "sqlite";
}

/** Hover / embed / mention extras — never pile onto fill I/O. */
export function shouldSkipBackgroundBodyHydrate(args: {
  fillBusy: boolean;
}): boolean {
  return args.fillBusy === true;
}

export function scheduleFillSafeHydrate(
  run: () => void,
  opts?: { delayMs?: number },
): () => void {
  const delay = opts?.delayMs ?? 80;
  const ric = (
    globalThis as unknown as {
      requestIdleCallback?: (
        cb: () => void,
        opts?: { timeout: number },
      ) => number;
      cancelIdleCallback?: (id: number) => void;
    }
  ).requestIdleCallback;
  if (typeof ric === "function") {
    const id = ric(() => run(), { timeout: 700 });
    const cancel = (
      globalThis as unknown as { cancelIdleCallback?: (id: number) => void }
    ).cancelIdleCallback;
    return () => cancel?.(id);
  }
  const t = setTimeout(run, delay);
  return () => clearTimeout(t);
}
