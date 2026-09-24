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
  const wanted = new Map<string, string>();
  for (const id in incoming) {
    const n = incoming[id];
    if (!n) continue;
    const prevId = prevIdByPath.get(n.path);
    if (prevId && prevId !== id) wanted.set(id, prevId);
  }
  // An id the rescan gives a different file is free only when that file moves
  // to its own kept id too (a rename, then a new note under the old name).
  const idMap = new Map<string, string>();
  for (const [id, prevId] of wanted) {
    const taken = incoming[prevId];
    if (taken && taken.path !== incoming[id]!.path && !wanted.has(prevId)) continue;
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

/**
 * Catalog ids are built from paths, and a note renamed in the app keeps the id
 * of its old name. "The old name is gone from disk" must not drop the renamed
 * note, nor a note the app is still writing. Returns the ids that really left.
 */
export function keepRenamedShellIds(
  nodes: Record<string, VaultNode>,
  goneIds: string[],
  gonePaths: string[],
  wroteRecently: (path: string) => boolean,
): string[] {
  const gone = new Set(gonePaths);
  const under = (path: string) => {
    if (gone.has(path)) return true;
    for (let i = path.lastIndexOf("/"); i > 0; i = path.lastIndexOf("/", i - 1)) {
      if (gone.has(path.slice(0, i))) return true;
    }
    return false;
  };
  return goneIds.filter((id) => {
    const n = nodes[id];
    if (!n) return true;
    if (wroteRecently(n.path)) return false;
    return under(n.path);
  });
}

/**
 * Notes the app wrote moments ago keep the text the app holds. A rescan that
 * lands between the app's create/rename and its disk write lacks the file,
 * still lists it under its old name, or has an older title-only copy. Taking
 * that copy would move the open note back to its old name or drop it, and what
 * was typed next would be saved somewhere else or not at all.
 *
 * `ours(path, body)` is true when the app wrote `path` moments ago and `body`
 * is one of its own writes (or unknown). An outside edit is left alone.
 */
export function keepRecentLocalBodies(
  prev: Record<string, VaultNode>,
  incoming: Record<string, VaultNode>,
  rootIds: string[],
  ours: (path: string, diskBody: string | undefined) => boolean,
): { nodes: Record<string, VaultNode>; rootIds: string[]; kept: number } {
  let nodes = incoming;
  let roots = rootIds;
  let kept = 0;
  const copy = () => {
    if (nodes === incoming) nodes = { ...incoming };
  };
  let byPath: Map<string, string> | null = null;
  const idForPath = (path: string) => {
    if (!byPath) {
      byPath = new Map();
      for (const id in incoming) {
        const n = incoming[id];
        if (n) byPath.set(n.path, id);
      }
    }
    return byPath.get(path);
  };
  for (const id in prev) {
    const local = prev[id];
    if (!local || local.kind !== "note" || local.content === undefined) continue;
    const diskId = incoming[id]?.path === local.path ? id : idForPath(local.path);
    if (diskId) {
      const disk = incoming[diskId]!;
      if (disk.content === local.content) continue;
      if (!ours(local.path, disk.content)) continue;
      copy();
      nodes[diskId] = { ...disk, content: local.content, mtime: Math.max(disk.mtime, local.mtime) };
      kept += 1;
      continue;
    }
    if (!ours(local.path, undefined)) continue;
    // The rescan still has this id under the note's old name: that file is the
    // app's own, mid-rename. Anything else keeps its place.
    const stale = incoming[id];
    if (stale && !ours(stale.path, stale.content)) continue;
    const parentId = local.parentId && nodes[local.parentId] ? local.parentId : null;
    copy();
    nodes[id] = { ...local, parentId };
    if (parentId == null) {
      if (!roots.includes(id)) roots = [...roots, id];
    } else if (roots.includes(id)) {
      roots = roots.filter((r) => r !== id);
    }
    kept += 1;
  }
  return { nodes, rootIds: roots, kept };
}
