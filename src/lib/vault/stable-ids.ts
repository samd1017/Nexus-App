import type { VaultNode } from "./types";

/**
 * A folder rescan builds ids from paths. A note renamed in the app keeps the id
 * it was created with, so the rescan would hand the same file a new id: the
 * open editor then saves into an id that no longer exists and reloads the note
 * from disk. Keep the id the store already uses for each path.
 */
export function keepIdsByPath(
  prev: Record<string, VaultNode>,
  incoming: Record<string, VaultNode>,
  rootIds: string[],
): { nodes: Record<string, VaultNode>; rootIds: string[]; remapped: number } {
  const prevIdByPath = new Map<string, string>();
  for (const id in prev) {
    const n = prev[id];
    if (n) prevIdByPath.set(n.path, id);
  }
  const idMap = new Map<string, string>();
  for (const id in incoming) {
    const n = incoming[id];
    if (!n) continue;
    const prevId = prevIdByPath.get(n.path);
    if (!prevId || prevId === id) continue;
    // Never take an id that the rescan already uses for a different file.
    const taken = incoming[prevId];
    if (taken && taken.path !== n.path) continue;
    idMap.set(id, prevId);
  }
  if (idMap.size === 0) return { nodes: incoming, rootIds, remapped: 0 };
  const nodes: Record<string, VaultNode> = {};
  for (const id in incoming) {
    const n = incoming[id];
    if (!n) continue;
    const nextId = idMap.get(id) ?? id;
    const parentId = n.parentId != null ? (idMap.get(n.parentId) ?? n.parentId) : n.parentId;
    nodes[nextId] =
      nextId === id && parentId === n.parentId ? n : { ...n, id: nextId, parentId };
  }
  return {
    nodes,
    rootIds: rootIds.map((id) => idMap.get(id) ?? id),
    remapped: idMap.size,
  };
}
