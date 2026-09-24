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
