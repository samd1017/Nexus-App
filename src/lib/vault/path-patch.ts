/**
 * Wave C — pure path-patch tree merge.
 * Adapters do IO; this module applies note ops to a complete VaultScan
 * while preserving object identity for unchanged nodes.
 */

import type { VaultNode } from "./types";

export type VaultScanLike = {
  nodes: Record<string, VaultNode>;
  rootIds: string[];
  signatures: Record<string, string>;
};

export type NotePathOp =
  | {
      path: string;
      op: "upsert";
      sig: string;
      mtime: number;
      /** omit when metaOnly / unloaded */
      content?: string;
    }
  | {
      path: string;
      op: "delete";
    };

export function normalizeVaultPath(raw: string): string {
  return raw.replace(/\\/g, "/").replace(/^\/+/, "");
}

/** Expand dir prefixes and bare paths into note signature keys. */
export function expandPathsToNoteTargets(
  paths: string[],
  prevSignatures: Record<string, string>,
): Set<string> {
  const targetNotes = new Set<string>();
  for (const raw of paths) {
    const p = normalizeVaultPath(raw);
    if (!p) continue;
    if (p.toLowerCase().endsWith(".md")) {
      targetNotes.add(p);
      continue;
    }
    const prefix = p.endsWith("/") ? p : p + "/";
    for (const notePath of Object.keys(prevSignatures)) {
      if (notePath === p || notePath.startsWith(prefix)) {
        targetNotes.add(notePath);
      }
    }
  }
  return targetNotes;
}

export function buildPathToId(
  nodes: Record<string, VaultNode>,
): Map<string, string> {
  const map = new Map<string, string>();
  for (const n of Object.values(nodes)) {
    map.set(n.path, n.id);
  }
  return map;
}

export function recomputeRootIds(
  nodes: Record<string, VaultNode>,
): string[] {
  return Object.values(nodes)
    .filter((n) => !n.parentId)
    .map((n) => n.id)
    .sort((a, b) => {
      const na = nodes[a];
      const nb = nodes[b];
      if (!na || !nb) return 0;
      if (na.kind !== nb.kind) return na.kind === "folder" ? -1 : 1;
      return na.name.localeCompare(nb.name);
    });
}

function parentOfPath(path: string): string {
  if (!path.includes("/")) return "";
  return path.slice(0, path.lastIndexOf("/"));
}

/** Ensure folder chain exists; returns whether structure changed. */
export function ensureFolderChain(
  nodes: Record<string, VaultNode>,
  pathToId: Map<string, string>,
  folderPath: string,
  idOf: (path: string) => string,
): boolean {
  if (!folderPath) return false;
  let touched = false;
  const parts = folderPath.split("/").filter(Boolean);
  let acc = "";
  for (const part of parts) {
    acc = acc ? `${acc}/${part}` : part;
    const known = pathToId.get(acc);
    if (known && nodes[known]?.path === acc) continue;
    const id = idOf(acc);
    if (nodes[id]?.path === acc) {
      pathToId.set(acc, id);
      continue;
    }
    const pp = parentOfPath(acc);
    const parentId = pp ? pathToId.get(pp) ?? idOf(pp) : null;
    nodes[id] = {
      id,
      path: acc,
      name: part,
      kind: "folder",
      parentId,
      mtime: Date.now(),
    };
    pathToId.set(acc, id);
    touched = true;
  }
  return touched;
}

/** Remove empty folders among candidates (leaf → root). */
export function pruneEmptyFolders(
  nodes: Record<string, VaultNode>,
  pathToId: Map<string, string>,
  candidateFolderPaths: Iterable<string>,
): boolean {
  let touched = false;
  const candidates = [...candidateFolderPaths];
  if (candidates.length === 0) return false;

  // One pass child counts — avoid O(folders × notes) scans at 25k+
  const childCount = new Map<string, number>();
  for (const n of Object.values(nodes)) {
    if (!n.parentId) continue;
    childCount.set(n.parentId, (childCount.get(n.parentId) ?? 0) + 1);
  }

  const sorted = candidates.sort(
    (a, b) => b.split("/").length - a.split("/").length,
  );
  for (const folderPath of sorted) {
    if (!folderPath) continue;
    const id = pathToId.get(folderPath);
    if (!id || !nodes[id] || nodes[id].kind !== "folder") continue;
    if ((childCount.get(id) ?? 0) > 0) continue;
    const parentId = nodes[id].parentId;
    delete nodes[id];
    pathToId.delete(folderPath);
    if (parentId) {
      childCount.set(parentId, Math.max(0, (childCount.get(parentId) ?? 1) - 1));
    }
    touched = true;
  }
  return touched;
}

/** Resolve path → id without scanning the vault. Production idOf is O(1). */
function idForPath(
  path: string,
  nodes: Record<string, VaultNode>,
  pathToId: Map<string, string>,
  idOf: (path: string) => string,
): string {
  const cached = pathToId.get(path);
  if (cached && nodes[cached]?.path === path) return cached;
  const id = idOf(path);
  if (nodes[id]?.path === path) pathToId.set(path, id);
  return id;
}

function hasNodeAtPath(
  path: string,
  nodes: Record<string, VaultNode>,
  pathToId: Map<string, string>,
  idOf: (path: string) => string,
): boolean {
  const id = idForPath(path, nodes, pathToId, idOf);
  return nodes[id]?.path === path;
}

/**
 * Apply note-level ops onto the prev scan **in place**.
 * Sparse watch batches (20 paths @ 50k–100k) must not copy `nodes` or
 * `signatures` and must not rebuild path→id from the whole vault.
 * Unchanged node objects keep the same reference.
 */
export function applyNoteOpsToScan(
  prev: VaultScanLike,
  ops: NotePathOp[],
  idOf: (path: string) => string,
): { scan: VaultScanLike; changedPaths: string[] } {
  if (ops.length === 0) {
    return { scan: prev, changedPaths: [] };
  }
  const nodes = prev.nodes;
  const signatures = prev.signatures;
  // Incremental only — never `buildPathToId` of the full map.
  const pathToId = new Map<string, string>();
  const changedPaths: string[] = [];
  const dirtyParents = new Set<string>();
  let structureTouched = false;
  let mutated = false;

  for (const op of ops) {
    const path = normalizeVaultPath(op.path);
    if (!path) continue;

    if (op.op === "delete") {
      if (signatures[path] !== undefined) {
        delete signatures[path];
        changedPaths.push(path);
        mutated = true;
      }
      const id = idForPath(path, nodes, pathToId, idOf);
      if (nodes[id]?.path === path) {
        delete nodes[id];
        pathToId.delete(path);
        structureTouched = true;
        mutated = true;
      }
      let p = parentOfPath(path);
      while (p) {
        dirtyParents.add(p);
        p = parentOfPath(p);
      }
      continue;
    }

    const id = idOf(path);
    const prevNode = nodes[id];
    const parentPath = parentOfPath(path);

    if (
      prevNode &&
      signatures[path] === op.sig &&
      (!parentPath || hasNodeAtPath(parentPath, nodes, pathToId, idOf))
    ) {
      continue;
    }

    if (parentPath) {
      if (ensureFolderChain(nodes, pathToId, parentPath, idOf)) {
        structureTouched = true;
        mutated = true;
      }
    }

    const name = path.split("/").pop()!;
    const resolvedParentId = parentPath
      ? idForPath(parentPath, nodes, pathToId, idOf)
      : null;

    const prevSig = signatures[path];
    signatures[path] = op.sig;
    changedPaths.push(path);
    mutated = true;

    let content: string | undefined = op.content;
    if (
      content === undefined &&
      prevNode?.content !== undefined &&
      prevSig === op.sig
    ) {
      content = prevNode.content;
    }

    nodes[id] = {
      id,
      path,
      name,
      kind: "note",
      parentId: resolvedParentId,
      mtime: op.mtime,
      ...(content !== undefined ? { content } : {}),
    };
    pathToId.set(path, id);

    if (!prevNode || prevNode.parentId !== resolvedParentId) {
      structureTouched = true;
    }
  }

  if (dirtyParents.size > 0) {
    if (pruneEmptyFolders(nodes, pathToId, dirtyParents)) {
      structureTouched = true;
      mutated = true;
    }
  }

  if (!mutated) {
    return { scan: prev, changedPaths: [] };
  }

  const rootIds = structureTouched
    ? recomputeRootIds(nodes)
    : prev.rootIds.filter((id) => nodes[id]);

  const finalRoots =
    structureTouched ||
    (rootIds.length === 0 && prev.rootIds.length > 0)
      ? structureTouched
        ? rootIds
        : recomputeRootIds(nodes)
      : rootIds;

  return {
    scan: { nodes, rootIds: finalRoots, signatures },
    changedPaths,
  };
}
