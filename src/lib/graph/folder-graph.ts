/**
 * Hierarchical folder graph builder — O(k) children at a level, hard-capped.
 * Wave 1 pure API (see docs/GRAPH-FOLDER-HIERARCHY.md).
 */

import type { GraphEdge, GraphNode, VaultNode } from "@/lib/vault/types";
import { noteTitle } from "@/lib/vault/types";
import type { VaultStructuralIndex } from "@/lib/vault/indexes";
import { getScaleFlags } from "@/lib/vault/scale-flags";

function lightPreview(content: string, max = 100): string {
  const s = (content || "").replace(/\s+/g, " ").trim();
  if (s.length <= max) return s;
  return s.slice(0, max - 1) + "…";
}

export type FolderGraphOpts = {
  /** Folder node id; null = vault root children */
  levelFolderId: string | null;
  maxNodes?: number;
};

export type FolderGraphStats = {
  levelFolderId: string | null;
  levelPath: string;
  childFolderCount: number;
  childNoteCount: number;
  shownNodeCount: number;
  capped: boolean;
  omittedCount: number;
};

const VAL_CLAMP_MAX = 80;

function parentFolderOf(path: string): string {
  const parts = path.replace(/\\/g, "/").split("/").filter(Boolean);
  parts.pop();
  return parts.join("/");
}

function clampVal(n: number): number {
  if (!Number.isFinite(n) || n < 1) return 1;
  return Math.min(VAL_CLAMP_MAX, Math.max(1, Math.round(n)));
}

function countDirectNotes(
  nodes: Record<string, VaultNode>,
  index: VaultStructuralIndex,
  folderId: string,
): number {
  const kids = index.getChildIds(folderId);
  let c = 0;
  for (const id of kids) {
    if (nodes[id]?.kind === "note") c += 1;
  }
  return c;
}

/**
 * Build folder-browse graph for one level of the vault tree.
 * Children via index.getChildIds only — never full-vault scan for selection.
 */
export function buildFolderGraph(
  nodes: Record<string, VaultNode>,
  index: VaultStructuralIndex,
  opts: FolderGraphOpts,
): {
  mode: "folder";
  nodes: GraphNode[];
  edges: GraphEdge[];
  stats: FolderGraphStats;
} {
  index.sync(nodes);
  const maxNodes =
    opts.maxNodes ?? getScaleFlags().folderMaxNodes ?? 320;
  const levelFolderId = opts.levelFolderId;
  const levelNode = levelFolderId ? nodes[levelFolderId] : null;
  const levelPath =
    levelFolderId && levelNode?.kind === "folder" ? levelNode.path : "";

  const childIds = index.getChildIds(levelFolderId);
  const folders: VaultNode[] = [];
  const notes: VaultNode[] = [];
  for (const id of childIds) {
    const n = nodes[id];
    if (!n) continue;
    if (n.kind === "folder") folders.push(n);
    else if (n.kind === "note") notes.push(n);
  }

  // Cap: folders first (name order already from index), then notes by mtime desc
  folders.sort((a, b) => a.name.localeCompare(b.name));
  notes.sort((a, b) => (b.mtime | 0) - (a.mtime | 0));

  const selected: VaultNode[] = [];
  for (const f of folders) {
    if (selected.length >= maxNodes) break;
    selected.push(f);
  }
  for (const n of notes) {
    if (selected.length >= maxNodes) break;
    selected.push(n);
  }

  const totalChildren = folders.length + notes.length;
  const capped = selected.length < totalChildren;
  const omittedCount = capped ? totalChildren - selected.length : 0;

  // Reserve one slot for aggregate when capped and at least one shown
  let showList = selected;
  if (capped && selected.length >= maxNodes && maxNodes > 0) {
    showList = selected.slice(0, maxNodes - 1);
  }
  const omittedAfterReserve = totalChildren - showList.length;

  const gNodes: GraphNode[] = [];
  for (const n of showList) {
    if (n.kind === "folder") {
      const noteCount = countDirectNotes(nodes, index, n.id);
      gNodes.push({
        id: n.id,
        title: n.name,
        path: n.path,
        degree: noteCount,
        preview: `${noteCount} note${noteCount === 1 ? "" : "s"}`,
        folder: parentFolderOf(n.path),
        kind: "folder",
        noteCount,
        val: clampVal(noteCount || 1),
      });
    } else {
      gNodes.push({
        id: n.id,
        title: noteTitle(n),
        path: n.path,
        degree: 0,
        preview: lightPreview(n.content ?? "", 100),

        folder: parentFolderOf(n.path),
        kind: "note",
        val: 1,
      });
    }
  }

  if (omittedAfterReserve > 0) {
    gNodes.push({
      id: `aggregate:${levelPath || "__root__"}`,
      title: `+${omittedAfterReserve} more`,
      path: levelPath,
      degree: 0,
      preview: `${omittedAfterReserve} more items not shown`,
      folder: levelPath,
      kind: "aggregate",
      aggregate: true,
      noteCount: omittedAfterReserve,
      val: clampVal(Math.min(omittedAfterReserve, VAL_CLAMP_MAX)),
    });
  }

  const stats: FolderGraphStats = {
    levelFolderId,
    levelPath,
    childFolderCount: folders.length,
    childNoteCount: notes.length,
    shownNodeCount: gNodes.length,
    capped: omittedAfterReserve > 0,
    omittedCount: Math.max(0, omittedAfterReserve),
  };

  return {
    mode: "folder",
    nodes: gNodes,
    edges: [],
    stats,
  };
}

/** Resolve browse path string to folder id ("" / null → root). */
export function folderIdFromBrowsePath(
  nodes: Record<string, VaultNode>,
  index: VaultStructuralIndex,
  browsePath: string,
): string | null {
  const p = (browsePath || "").replace(/\\/g, "/").replace(/^\/+|\/+$/g, "");
  if (!p) return null;
  index.sync(nodes);
  const id = index.getIdByPath(nodes, p);
  if (id && nodes[id]?.kind === "folder") return id;
  // Fallback scan only when path map miss (rare)
  for (const n of Object.values(nodes)) {
    if (n.kind === "folder" && n.path === p) return n.id;
  }
  return null;
}
