/**
 * Progressive FTS fill for meta-only disk opens (FSA / desktop fallback).
 *
 * Ready used to mean “tree scanned”. Search then ran on title/path tokens only,
 * so body terms like “hub” missed. This module reads a short file head, tokens
 * it into DurableIndex, then drops the string. Store nodes stay meta-only.
 */

import type { VaultNode } from "./types";
import {
  getDurableIndex,
  noteMetaFromNode,
  type DurableNoteMeta,
} from "./durable-index";
import { yieldToUi } from "./yield-ui";

/** Read this many chars from each file for tokens. Do not keep on the node. */
export const DISK_FTS_HEAD_CHARS = 2000;
/** Stored snippet for hit preview — not the full head. */
export const DISK_FTS_SNIPPET_CHARS = 180;

export type DiskHeadReader = (path: string) => Promise<string>;

export function upsertDiskFtsHead(node: VaultNode, head: string): void {
  const idx = getDurableIndex();
  if (!idx?.ready || node.kind !== "note") return;
  const text = head.slice(0, DISK_FTS_HEAD_CHARS);
  const tmp: VaultNode = { ...node, content: text };
  const meta: DurableNoteMeta = {
    ...noteMetaFromNode(tmp),
    bodySnippet: text.slice(0, DISK_FTS_SNIPPET_CHARS),
    ftsText: text,
  };
  idx.upsertNote(meta);
}

export async function fillDurableIndexFromReader(
  nodes: Record<string, VaultNode>,
  readHead: DiskHeadReader,
  opts?: {
    concurrency?: number;
    onProgress?: (done: number, total: number) => void;
    isCancelled?: () => boolean;
  },
): Promise<{ indexed: number; errors: number }> {
  const ids: string[] = [];
  for (const id in nodes) {
    if (nodes[id]?.kind === "note") ids.push(id);
  }
  const total = ids.length;
  const concurrency = Math.max(1, Math.min(opts?.concurrency ?? 8, 16));
  let indexed = 0;
  let errors = 0;
  let cursor = 0;

  const work = async () => {
    while (cursor < ids.length) {
      if (opts?.isCancelled?.()) return;
      const i = cursor++;
      const id = ids[i]!;
      const n = nodes[id];
      if (!n || n.kind !== "note") continue;
      try {
        const head = await readHead(n.path);
        if (opts?.isCancelled?.()) return;
        upsertDiskFtsHead(n, head);
        indexed += 1;
      } catch {
        // Title/path already reconciled — keep going.
        errors += 1;
      }
      if ((indexed + errors) % 64 === 0) {
        opts?.onProgress?.(indexed + errors, total);
        await yieldToUi((indexed + errors) % 256 === 0);
      }
    }
  };

  await Promise.all(Array.from({ length: Math.min(concurrency, total || 1) }, () => work()));
  opts?.onProgress?.(total, total);
  return { indexed, errors };
}

/** Build a meta-only node map from path → markdown (tests / Playwright mock FSA). */
export function nodesFromFileMap(
  files: Record<string, string>,
): { nodes: Record<string, VaultNode>; rootIds: string[] } {
  const nodes: Record<string, VaultNode> = {};
  const folderIds = new Map<string, string>();
  const rootIds: string[] = [];

  const ensureFolder = (path: string): string | null => {
    if (!path) return null;
    const existing = folderIds.get(path);
    if (existing) return existing;
    const slash = path.lastIndexOf("/");
    const parentPath = slash >= 0 ? path.slice(0, slash) : "";
    const parentId = parentPath ? ensureFolder(parentPath) : null;
    const id = "f_" + path.replace(/[^a-zA-Z0-9]+/g, "_");
    nodes[id] = {
      id,
      path,
      name: slash >= 0 ? path.slice(slash + 1) : path,
      kind: "folder",
      parentId,
      mtime: 1,
    };
    folderIds.set(path, id);
    if (!parentId) rootIds.push(id);
    return id;
  };

  const paths = Object.keys(files).sort();
  for (const path of paths) {
    if (!path.toLowerCase().endsWith(".md")) continue;
    const slash = path.lastIndexOf("/");
    const parentPath = slash >= 0 ? path.slice(0, slash) : "";
    const parentId = parentPath ? ensureFolder(parentPath) : null;
    const id = "n_" + path.replace(/[^a-zA-Z0-9]+/g, "_");
    nodes[id] = {
      id,
      path,
      name: slash >= 0 ? path.slice(slash + 1) : path,
      kind: "note",
      parentId,
      mtime: 1,
    };
    if (!parentId && !rootIds.includes(id)) rootIds.push(id);
  }
  return { nodes, rootIds };
}
