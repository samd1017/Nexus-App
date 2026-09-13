/**
 * Flatten the visible file tree. Capped so a fully expanded 100k vault
 * cannot allocate 100k row objects or mount that many DOM nodes.
 * FileTree virtualizes the visible window (~30 + overscan).
 */

import type { VaultNode } from "./types";
import { ensureVaultIndex } from "./indexes";

export const TREE_FLAT_CAP = 2_400;

export type FlatTreeRow = { id: string; depth: number; kind: "folder" | "note" };

export function flattenVisibleTree(
  rootIds: string[],
  nodes: Record<string, VaultNode>,
  expanded: string[],
  cap = TREE_FLAT_CAP,
): FlatTreeRow[] {
  const idx = ensureVaultIndex(nodes);
  const exp = new Set(expanded);
  const rows: FlatTreeRow[] = [];
  const walk = (ids: string[], depth: number) => {
    for (const id of ids) {
      if (rows.length >= cap) return;
      const n = nodes[id];
      if (!n) continue;
      rows.push({ id, depth, kind: n.kind });
      if (n.kind === "folder" && exp.has(id)) {
        walk(idx.getChildIds(id), depth + 1);
      }
    }
  };
  const indexRoots = idx.getChildIds(null);
  walk(indexRoots.length > 0 ? indexRoots : rootIds, 0);
  return rows;
}
