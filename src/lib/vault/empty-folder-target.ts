/** Id of the tree row under the event target, or null. */
export function treeRowIdFromTarget(target: EventTarget | null): string | null {
  const el = target as HTMLElement | null;
  if (!el || typeof el.closest !== "function") return null;
  const row = el.closest("[role='treeitem'][data-node-id]");
  const id = row?.getAttribute("data-node-id")?.trim();
  return id || null;
}

/** Empty folder id from a focused row, or null when the target is not that row. */
export function emptyFolderIdFromTarget(target: EventTarget | null): string | null {
  const el = target as HTMLElement | null;
  if (!el || typeof el.closest !== "function") return null;
  const row = el.closest("[data-folder-empty='1']");
  const id = row?.getAttribute("data-node-id")?.trim();
  return id || null;
}

/** Folder the file tree is sitting on, when that folder has nothing in it. */
export function focusedEmptyFolderId(): string | null {
  if (typeof document === "undefined") return null;
  const fromFocus = emptyFolderIdFromTarget(document.activeElement);
  if (fromFocus) return fromFocus;
  const tree = document.querySelector("[data-file-tree]");
  if (!tree || tree.getAttribute("data-tree-focused") !== "1") return null;
  const id = tree.getAttribute("data-focused-empty-folder")?.trim();
  return id || null;
}
