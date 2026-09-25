/**
 * Folder-map badge counts for the open level.
 * A number, including zero, is that level’s own children. Drawn totals are
 * used only when the level has not reported a child count yet.
 */
export function folderLevelCounts(
  childFolders: number | null | undefined,
  childNotes: number | null | undefined,
  shownFolders = 0,
  shownNotes = 0,
): { folders: number; notes: number } {
  return {
    folders:
      childFolders == null ? Math.max(0, shownFolders) : Math.max(0, childFolders),
    notes: childNotes == null ? Math.max(0, shownNotes) : Math.max(0, childNotes),
  };
}

/**
 * “N in vault” is the root map’s vault total. A folder level does not
 * repeat that number beside its own counts.
 */
export function folderLevelShowsVaultTotal(
  levelPath: string | null | undefined,
): boolean {
  const path = (levelPath ?? "").replace(/\\/g, "/").replace(/^\/+|\/+$/g, "");
  return path.length === 0;
}
