/**
 * Folder-map badge counts for the open level.
 * Direct children of that folder. Zero is an empty level, not a stand-in
 * for the rest of the vault.
 */
export function folderLevelCounts(
  childFolders: number,
  childNotes: number,
  shownFolders: number,
  shownNotes: number,
): { folders: number; notes: number } {
  return {
    folders: childFolders > 0 ? childFolders : Math.max(0, shownFolders),
    notes: childNotes > 0 ? childNotes : Math.max(0, shownNotes),
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
