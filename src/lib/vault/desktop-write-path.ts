/** A vault file the desktop writer must overwrite, never mkdir. */
const DESKTOP_FILE = /\.(md|canvas|json|css|base)$/i;

export function isDesktopFileName(name: string): boolean {
  return DESKTOP_FILE.test(name);
}

export function isDesktopFileRel(relPath: string): boolean {
  const name = relPath.replace(/\\/g, "/").split("/").filter(Boolean).pop() ?? "";
  return isDesktopFileName(name);
}

/**
 * Directory to create before writing `relPath`.
 * A note path is never that directory, including when a later segment
 * sits under the `.md` file (`Projects/Note.md/extra`).
 */
export function desktopWriteParent(relPath: string): string {
  const parts = relPath.replace(/\\/g, "/").split("/").filter(Boolean);
  if (parts.length === 0) return "";
  parts.pop();
  while (parts.length > 0 && isDesktopFileName(parts[parts.length - 1] ?? "")) {
    parts.pop();
  }
  return parts.join("/");
}

/**
 * Relative mkdir target before a file write, or null when no directory
 * should be created. An existing note is overwritten in place.
 */
export function mkdirTargetForWrite(relPath: string, destIsFile: boolean): string | null {
  if (destIsFile) return null;
  const parent = desktopWriteParent(relPath);
  if (!parent || isDesktopFileRel(parent)) return null;
  return parent;
}

/** Folder mkdir target, or null when the path exists or names a file. */
export function mkdirTargetForFolder(
  relPath: string,
  existing: "file" | "dir" | "missing",
): string | null {
  const rel = relPath.replace(/\\/g, "/").replace(/^\/+|\/+$/g, "");
  if (!rel || existing !== "missing" || isDesktopFileRel(rel)) return null;
  return rel;
}
