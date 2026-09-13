/**
 * Module-level note-body archive for in-memory large vaults (45k test seed).
 * Meta-only mount strips content from store nodes; ensureNoteBody rehydrates
 * via MemoryBackend.readNote → getBodyFromArchive.
 *
 * Lifecycle:
 * - archiveBodiesFromNodes() installs a full map (replaces previous)
 * - clearBodyArchive() only when vault nodes are wiped or a non-archive vault mounts
 * - rename/move must rekey paths so lazy notes stay loadable
 */

import type { VaultNode } from "./types";
import { yieldToUi } from "./yield-ui";

let bodyArchive: Map<string, string> | null = null;

/** Replace the archive (path → full markdown). Pass null/empty to clear. */
export function setBodyArchive(
  map: Map<string, string> | Record<string, string> | null,
): void {
  if (!map) {
    bodyArchive = null;
    return;
  }
  bodyArchive = map instanceof Map ? map : new Map(Object.entries(map));
}

/** Snapshot note bodies from a full-content node map into the archive. */
export function archiveBodiesFromNodes(
  nodes: Record<string, VaultNode>,
): Map<string, string> {
  const map = new Map<string, string>();
  for (const n of Object.values(nodes)) {
    if (n.kind === "note" && typeof n.content === "string") {
      map.set(n.path, n.content);
    }
  }
  bodyArchive = map;
  return map;
}

/**
 * One 45k walk: copy bodies into the archive and strip store nodes except keepIds.
 * Avoids a second Object.keys pass in prepareMountedNodes.
 */
export function archiveAndStripBodiesInPlace(
  nodes: Record<string, VaultNode>,
  keepIds?: Iterable<string>,
): Map<string, string> {
  const keep = new Set(
    keepIds ? [...keepIds].filter((id): id is string => Boolean(id)) : [],
  );
  const map = new Map<string, string>();
  for (const id of Object.keys(nodes)) {
    const n = nodes[id];
    if (!n || n.kind !== "note" || typeof n.content !== "string") continue;
    map.set(n.path, n.content);
    if (keep.has(id)) continue;
    nodes[id] = {
      id: n.id,
      path: n.path,
      name: n.name,
      kind: n.kind,
      parentId: n.parentId,
      mtime: n.mtime,
    };
  }
  bodyArchive = map;
  return map;
}

/** Chunked archive so 45k+ open can paint the progress banner. */
export async function archiveBodiesFromNodesAsync(
  nodes: Record<string, VaultNode>,
  opts?: {
    chunkSize?: number;
    onProgress?: (done: number, total: number) => void;
  },
): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  const ids = Object.keys(nodes);
  const chunk = Math.max(400, opts?.chunkSize ?? 2500);
  for (let i = 0; i < ids.length; i++) {
    const n = nodes[ids[i]!];
    if (n?.kind === "note" && typeof n.content === "string") {
      map.set(n.path, n.content);
    }
    if ((i + 1) % chunk === 0) {
      opts?.onProgress?.(i + 1, ids.length);
      await yieldToUi((i + 1) % (chunk * 3) === 0);
    }
  }
  bodyArchive = map;
  opts?.onProgress?.(ids.length, ids.length);
  return map;
}

export function getBodyFromArchive(path: string): string | undefined {
  return bodyArchive?.get(path);
}

/** Update one path (edits / eviction write-back). No-op if archive inactive. */
export function setBodyInArchive(path: string, content: string): void {
  bodyArchive?.set(path, content);
}

/** Remove one path (delete note). No-op if archive inactive. */
export function removeBodyFromArchive(path: string): void {
  bodyArchive?.delete(path);
}

/**
 * Rekey a single path after rename/move of a note.
 * Moves the body entry from oldPath → newPath when present.
 */
export function rekeyBodyArchive(oldPath: string, newPath: string): void {
  if (!bodyArchive || oldPath === newPath) return;
  const body = bodyArchive.get(oldPath);
  if (body === undefined) return;
  bodyArchive.delete(oldPath);
  bodyArchive.set(newPath, body);
}

/**
 * Rekey all archive entries under a folder after folder rename/move.
 * oldPrefix is the folder path without trailing slash; children use oldPrefix + "/…".
 */
export function rekeyBodyArchivePrefix(
  oldPrefix: string,
  newPrefix: string,
): void {
  if (!bodyArchive || oldPrefix === newPrefix) return;
  const pending: Array<[string, string, string]> = [];
  for (const [path, body] of bodyArchive) {
    if (path === oldPrefix || path.startsWith(oldPrefix + "/")) {
      pending.push([path, newPrefix + path.slice(oldPrefix.length), body]);
    }
  }
  for (const [oldP, newP, body] of pending) {
    bodyArchive.delete(oldP);
    bodyArchive.set(newP, body);
  }
}

export function clearBodyArchive(): void {
  bodyArchive = null;
}

export function hasBodyArchive(): boolean {
  return bodyArchive !== null;
}

export function bodyArchiveSize(): number {
  return bodyArchive?.size ?? 0;
}
