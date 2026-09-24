/** Folder the file tree is sitting on, when that folder has nothing in it. */
export function focusedEmptyFolderId(): string | null {
  if (typeof document === "undefined") return null;
  const tree = document.querySelector("[data-file-tree]");
  if (!tree || tree.getAttribute("data-tree-focused") !== "1") return null;
  const id = tree.getAttribute("data-focused-empty-folder")?.trim();
  return id || null;
}
