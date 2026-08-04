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
    if (pathToId.has(acc) && nodes[pathToId.get(acc)!]) continue;
    const id = idOf(acc);
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
  const sorted = [...candidateFolderPaths].sort(
    (a, b) => b.split("/").length - a.split("/").length,
  );
  for (const folderPath of sorted) {
    if (!folderPath) continue;
    const id = pathToId.get(folderPath);
    if (!id || !nodes[id] || nodes[id].kind !== "folder") continue;
    const hasChild = Object.values(nodes).some((n) => n.parentId === id);
    if (hasChild) continue;
    delete nodes[id];
    pathToId.delete(folderPath);
    touched = true;
  }
  return touched;
}

/**
 * Apply note-level ops onto a shallow-copied prev scan.
 * Unchanged nodes keep the same object reference.
 */
export function applyNoteOpsToScan(
  prev: VaultScanLike,
  ops: NotePathOp[],
  idOf: (path: string) => string,
): { scan: VaultScanLike; changedPaths: string[] } {
  const nodes: Record<string, VaultNode> = { ...prev.nodes };
  const signatures: Record<string, string> = { ...prev.signatures };
  const pathToId = buildPathToId(nodes);
  const changedPaths: string[] = [];
  const dirtyParents = new Set<string>();
  let structureTouched = false;

  for (const op of ops) {
    const path = normalizeVaultPath(op.path);
    if (!path) continue;

    if (op.op === "delete") {
      if (signatures[path] !== undefined) {
        delete signatures[path];
        changedPaths.push(path);
      }
      const id = pathToId.get(path) ?? idOf(path);
      if (nodes[id]) {
        delete nodes[id];
        pathToId.delete(path);
        structureTouched = true;
      }
      let p = parentOfPath(path);
      while (p) {
        dirtyParents.add(p);
        p = parentOfPath(p);
      }
      continue;
    }

    // upsert
    const parentPath = parentOfPath(path);
    if (parentPath) {
      if (ensureFolderChain(nodes, pathToId, parentPath, idOf)) {
        structureTouched = true;
      }
    }

    const id = idOf(path);
    const prevNode = nodes[id];
    const name = path.split("/").pop()!;
    const parentId = parentPath ? pathToId.get(parentPath) ?? idOf(parentPath) : null;

    // Skip no-op when sig unchanged and node exists
    if (
      prevNode &&
      signatures[path] === op.sig &&
      prev.signatures[path] === op.sig
    ) {
      continue;
    }

    signatures[path] = op.sig;
    changedPaths.push(path);

    let content: string | undefined = op.content;
    // Preserve previous body when content omitted and sig unchanged
    if (
      content === undefined &&
      prevNode?.content !== undefined &&
      prev.signatures[path] === op.sig
    ) {
      content = prevNode.content;
    }

    nodes[id] = {
      id,
      path,
      name,
      kind: "note",
      parentId,
      mtime: op.mtime,
      ...(content !== undefined ? { content } : {}),
    };
    pathToId.set(path, id);

    if (!prevNode || prevNode.parentId !== parentId) {
      structureTouched = true;
    }
  }

  if (pruneEmptyFolders(nodes, pathToId, dirtyParents)) {
    structureTouched = true;
  }

  const rootIds = structureTouched
    ? recomputeRootIds(nodes)
    : prev.rootIds.filter((id) => nodes[id]);

  // If filter dropped roots (deleted root notes), recompute
  const finalRoots =
    rootIds.length === 0 && Object.keys(nodes).length > 0
      ? recomputeRootIds(nodes)
      : structureTouched
        ? rootIds
        : recomputeRootIds(nodes);

  return {
    scan: { nodes, rootIds: finalRoots, signatures },
    changedPaths,
  };
}
