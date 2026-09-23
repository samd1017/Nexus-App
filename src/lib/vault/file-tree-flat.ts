/**
 * Flatten the visible file tree.
 *
 * A fully expanded 100k vault must not allocate 100k row objects. The
 * virtualizer only mounts the on-screen window, but the row array is still
 * the scroll model, so it stays capped.
 *
 * Rows stay in depth-first order (a folder's children sit under that folder).
 * Every folder that will be listed keeps a slot, so opening one fat branch
 * cannot erase a later folder. A branch that does not fit keeps an
 * "N more" row instead of ending the tree.
 */

import type { VaultNode } from "./types";
import { ensureVaultIndex } from "./indexes";

/** Safety ceiling for the flattened row array. Not a per-folder limit. */
export const TREE_FLAT_CAP = 16_000;

/**
 * Notes listed under one expanded folder before a remainder row. Real soak
 * folders are well under this (about 700 notes). A larger window is
 * per-folder and only grows when the remainder is opened.
 */
export const TREE_FOLDER_NOTE_WINDOW = 2_000;

export type FlatTreeRow = {
  id: string;
  depth: number;
  kind: "folder" | "note" | "more";
  /** Set when kind is "more": direct children not listed. */
  hiddenCount?: number;
  /** Set when kind is "more": folder those children belong to. */
  moreParentId?: string;
};

export function flattenVisibleTree(
  rootIds: string[],
  nodes: Record<string, VaultNode>,
  expanded: string[],
  cap = TREE_FLAT_CAP,
  folderWindows?: Record<string, number>,
): FlatTreeRow[] {
  const idx = ensureVaultIndex(nodes);
  const exp = new Set(expanded);
  const rows: FlatTreeRow[] = [];

  const countFolders = (ids: string[]): number => {
    let count = 0;
    for (const id of ids) {
      const n = nodes[id];
      if (!n || n.kind !== "folder") continue;
      count++;
      if (exp.has(id)) count += countFolders(idx.getChildIds(id));
    }
    return count;
  };

  // Slots held back so folders we have not emitted yet still fit.
  let foldersRemaining = countFolders(
    idx.getChildIds(null).length > 0 ? idx.getChildIds(null) : rootIds,
  );

  const pushMore = (parentId: string, depth: number, hidden: number) => {
    if (hidden <= 0 || rows.length >= cap) return;
    rows.push({
      id: `more:${parentId}`,
      depth,
      kind: "more",
      hiddenCount: hidden,
      moreParentId: parentId,
    });
  };

  /**
   * Emit ids in order. `noteLimit` bounds notes at this level (a folder
   * window). Root passes the safety cap, which does not truncate a normal
   * vault. Returns how many of `ids` were not emitted.
   */
  const walk = (ids: string[], depth: number, noteLimit: number): number => {
    let notesShown = 0;
    for (let i = 0; i < ids.length; i++) {
      const id = ids[i];
      const n = nodes[id];
      if (!n) continue;

      if (n.kind === "note") {
        let run = 0;
        while (
          i + run < ids.length &&
          nodes[ids[i + run]]?.kind === "note"
        ) {
          run++;
        }
        if (notesShown >= noteLimit) return ids.length - i;
        const slots = cap - rows.length - foldersRemaining;
        if (slots <= 0) return ids.length - i;
        const allowed = Math.min(noteLimit - notesShown, slots, run);
        // A cap trim has to leave one row for "N more". A window trim does
        // not: the safety cap still has room for that remainder row.
        const hitsCap = allowed >= slots && run > allowed;
        const take = run > allowed ? Math.max(0, allowed - (hitsCap ? 1 : 0)) : run;
        if (take <= 0) return ids.length - i;
        for (let k = 0; k < take; k++) {
          const nid = ids[i + k];
          rows.push({ id: nid, depth, kind: "note" });
        }
        notesShown += take;
        if (run > take) return ids.length - (i + take);
        i += take - 1;
        continue;
      }

      if (rows.length >= cap) return ids.length - i;
      rows.push({ id, depth, kind: "folder" });
      foldersRemaining = Math.max(0, foldersRemaining - 1);
      if (!exp.has(id)) continue;
      const children = idx.getChildIds(id);
      if (children.length === 0) continue;
      const limit = Math.max(0, folderWindows?.[id] ?? TREE_FOLDER_NOTE_WINDOW);
      const hidden = walk(children, depth + 1, limit);
      if (hidden > 0) pushMore(id, depth + 1, hidden);
    }
    return 0;
  };

  const indexRoots = idx.getChildIds(null);
  walk(indexRoots.length > 0 ? indexRoots : rootIds, 0, cap);
  return rows;
}
