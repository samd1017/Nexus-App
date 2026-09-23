/**
 * Graph draw list from a native page. Never built by walking the vault.
 */

import type { ResolvedGraphData } from "@/lib/graph/build-graph";
import type { GraphEdge, GraphNode } from "@/lib/vault/types";
import type { ShellEgo, ShellLevel, ShellRow } from "@/lib/vault/shell-catalog";

function parentFolderOf(path: string): string {
  const parts = path.replace(/\\/g, "/").split("/").filter(Boolean);
  parts.pop();
  return parts.join("/");
}

function rowToGraphNode(row: ShellRow): GraphNode {
  if (row.kind === "folder") {
    const noteCount = row.childNotes ?? 0;
    return {
      id: row.id,
      title: row.name,
      path: row.path,
      degree: noteCount,
      preview: `${noteCount} note${noteCount === 1 ? "" : "s"}`,
      folder: parentFolderOf(row.path),
      kind: "folder",
      noteCount,
      val: Math.max(1, Math.min(80, noteCount || 1)),
    };
  }
  const title = row.name.replace(/\.md$/i, "");
  return {
    id: row.id,
    title,
    path: row.path,
    degree: 0,
    preview: "",
    folder: parentFolderOf(row.path),
    kind: "note",
    val: 1,
  };
}

export function emptyShellGraph(vaultNoteCount: number): ResolvedGraphData {
  return {
    mode: "folder",
    nodes: [],
    edges: [],
    capped: false,
    stats: {
      vaultNoteCount,
      shownNoteCount: 0,
      shownFolderCount: 0,
      linkCount: 0,
      ghostCount: 0,
      levelPath: "",
      omittedCount: 0,
      isPartialVault: true,
      childFolderCount: 0,
      childNoteCount: 0,
      capped: false,
    },
  };
}

export function graphFromShellLevel(
  level: ShellLevel,
  vaultNoteCount: number,
): ResolvedGraphData {
  const nodes: GraphNode[] = level.rows.map(rowToGraphNode);
  if (level.omitted > 0) {
    nodes.push({
      id: `aggregate:${level.parentPath || "__root__"}`,
      title: `+${level.omitted} more`,
      path: level.parentPath,
      degree: 0,
      preview: `${level.omitted} more items not shown`,
      folder: level.parentPath,
      kind: "aggregate",
      aggregate: true,
      noteCount: level.omitted,
      val: Math.max(1, Math.min(80, level.omitted)),
    });
  }
  const shownFolderCount = nodes.filter((n) => n.kind === "folder").length;
  const shownNoteCount = nodes.filter((n) => n.kind === "note").length;
  return {
    mode: "folder",
    nodes,
    edges: [],
    capped: level.omitted > 0,
    stats: {
      vaultNoteCount,
      shownNoteCount,
      shownFolderCount,
      linkCount: 0,
      ghostCount: 0,
      levelPath: level.parentPath,
      omittedCount: level.omitted,
      isPartialVault: true,
      childFolderCount: level.folderTotal,
      childNoteCount: level.noteTotal,
      capped: level.omitted > 0,
    },
  };
}

export function graphFromShellEgo(
  ego: ShellEgo,
  vaultNoteCount: number,
): ResolvedGraphData {
  const degree = new Map<string, number>();
  const edges: GraphEdge[] = ego.edges.map((e) => {
    degree.set(e.source, (degree.get(e.source) ?? 0) + 1);
    degree.set(e.target, (degree.get(e.target) ?? 0) + 1);
    return { source: e.source, target: e.target };
  });
  const nodes = ego.rows.filter((r) => r.kind === "note").map((row) => {
    const node = rowToGraphNode(row);
    node.degree = degree.get(row.id) ?? 0;
    return node;
  });
  return {
    mode: "ego",
    nodes,
    edges,
    ego: true,
    capped: ego.capped,
    stats: {
      vaultNoteCount,
      shownNoteCount: nodes.length,
      shownFolderCount: 0,
      linkCount: edges.length,
      ghostCount: 0,
      levelPath: "",
      omittedCount: 0,
      isPartialVault: nodes.length < vaultNoteCount,
      childFolderCount: 0,
      childNoteCount: 0,
      capped: ego.capped,
    },
  };
}
