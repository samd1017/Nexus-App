/** The folder a plain Enter in search goes to: the one named exactly, else the first. */
export function folderForEnter(
  folders: { id: string; name: string; path: string }[],
  query: string,
): { id: string; exact: boolean } | null {
  if (!folders.length) return null;
  const want = query.trim().replace(/\\/g, "/").replace(/^\/+|\/+$/g, "").toLowerCase();
  const exact = folders.find(
    (f) => f.name.toLowerCase() === want || f.path.toLowerCase() === want,
  );
  if (exact) return { id: exact.id, exact: true };
  return { id: folders[0]!.id, exact: false };
}

/** A catalog row for a folder found on disk, under the id the catalog would give it. */
export function diskFolderRow(
  path: string,
  mtime: number,
  idFor: (path: string) => string,
): { id: string; path: string; name: string; kind: "folder"; parentId: string | null; mtime: number } {
  const clean = path.replace(/\\/g, "/").replace(/^\/+|\/+$/g, "");
  const cut = clean.lastIndexOf("/");
  return {
    id: idFor(clean),
    path: clean,
    name: cut >= 0 ? clean.slice(cut + 1) : clean,
    kind: "folder",
    parentId: cut >= 0 ? idFor(clean.slice(0, cut)) : null,
    mtime,
  };
}
