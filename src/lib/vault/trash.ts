/**
 * Soft-trash helpers for `.trash/<stamp>__<original path with / → __>`.
 * Matches store.trashRelativePath encoding.
 */

export type TrashEntry = {
  /** Vault-relative path of the trash file (e.g. `.trash/stamp__Notes__A.md`) */
  trashPath: string;
  /** Original vault path before delete (e.g. `Notes/A.md`) */
  originalPath: string;
  /** File basename including `.md` */
  name: string;
  mtime: number;
};

/** Parse a vault-relative trash path into stamp + original path. */
export function parseTrashRel(
  relPath: string,
): { stamp: string; originalPath: string } | null {
  const normalized = relPath.replace(/\\/g, "/").replace(/^\/+/, "");
  if (!normalized.startsWith(".trash/")) return null;
  const rest = normalized.slice(".trash/".length);
  // Flat trash layout only
  if (!rest || rest.includes("/")) return null;
  const idx = rest.indexOf("__");
  if (idx <= 0) return null;
  const stamp = rest.slice(0, idx);
  const safe = rest.slice(idx + 2);
  if (!stamp || !safe) return null;
  const originalPath = safe.replace(/__/g, "/");
  if (!originalPath) return null;
  return { stamp, originalPath };
}

/** Build a TrashEntry from a relative trash path + mtime. */
export function trashEntryFromRel(
  relPath: string,
  mtime: number,
): TrashEntry | null {
  const parsed = parseTrashRel(relPath);
  if (!parsed) return null;
  const trashPath = relPath.replace(/\\/g, "/");
  const name =
    parsed.originalPath.split("/").filter(Boolean).pop() ??
    parsed.originalPath;
  return {
    trashPath,
    originalPath: parsed.originalPath,
    name,
    mtime,
  };
}

/** Alias for callers that import `parse`. */
export const parse = parseTrashRel;
