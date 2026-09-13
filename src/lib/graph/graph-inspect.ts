/**
 * Per-note graph inspector — outgoing / incoming from link maps only.
 * O(degree of this note), never a 100k scan.
 */

import type { VaultNode } from "@/lib/vault/types";
import { noteTitle } from "@/lib/vault/types";
import { vaultLinkIndex } from "@/lib/vault/link-index";
import { normalizeLinkTarget } from "@/lib/markdown/wikilinks";
import { extractWikilinkTargets } from "@/lib/markdown/wikilinks";
import { buildWikilinkIndex, resolveWikilink } from "@/lib/graph/build-graph";

export type GraphInspectLink = {
  id: string;
  title: string;
  path: string;
};

export type GraphInspect = {
  id: string;
  title: string;
  path: string;
  kind: "note" | "folder" | "aggregate" | "missing";
  out: GraphInspectLink[];
  inn: GraphInspectLink[];
  outCount: number;
  inCount: number;
};

function outgoingTargets(note: VaultNode): string[] {
  if (vaultLinkIndex.outgoing.has(note.id)) {
    return vaultLinkIndex.getOutgoing(note.id);
  }
  if (note.content !== undefined) return extractWikilinkTargets(note.content);
  return [];
}

function incomingIds(note: VaultNode): string[] {
  const keys = [
    normalizeLinkTarget(noteTitle(note)),
    normalizeLinkTarget(note.name),
    normalizeLinkTarget(note.path),
    normalizeLinkTarget(note.path.replace(/\.md$/i, "")),
  ].filter(Boolean);
  const srcs = new Set<string>();
  for (const key of keys) {
    for (const src of vaultLinkIndex.getBacklinkSources(key)) {
      if (src !== note.id) srcs.add(src);
    }
  }
  return [...srcs];
}

function toLink(
  nodes: Record<string, VaultNode>,
  id: string,
): GraphInspectLink | null {
  const n = nodes[id];
  if (!n || n.kind !== "note") return null;
  return { id: n.id, title: noteTitle(n), path: n.path };
}

/** Inspect one note. Caps listed chips; counts are full map totals. */
export function inspectGraphNote(
  nodes: Record<string, VaultNode>,
  noteId: string | null,
  max = 6,
): GraphInspect | null {
  if (!noteId) return null;
  const n = nodes[noteId];
  if (!n) {
    return {
      id: noteId,
      title: "Missing",
      path: "",
      kind: "missing",
      out: [],
      inn: [],
      outCount: 0,
      inCount: 0,
    };
  }
  if (n.kind === "folder") {
    return {
      id: n.id,
      title: n.name,
      path: n.path,
      kind: "folder",
      out: [],
      inn: [],
      outCount: 0,
      inCount: 0,
    };
  }
  const widx = buildWikilinkIndex(nodes);
  const destIds: string[] = [];
  for (const t of outgoingTargets(n)) {
    const dest = resolveWikilink(t, nodes, widx);
    if (dest && dest.kind === "note" && dest.id !== n.id) destIds.push(dest.id);
  }
  const uniqueOut = [...new Set(destIds)];
  const innIds = incomingIds(n);
  return {
    id: n.id,
    title: noteTitle(n),
    path: n.path,
    kind: "note",
    out: uniqueOut
      .slice(0, max)
      .map((id) => toLink(nodes, id))
      .filter((x): x is GraphInspectLink => !!x),
    inn: innIds
      .slice(0, max)
      .map((id) => toLink(nodes, id))
      .filter((x): x is GraphInspectLink => !!x),
    outCount: uniqueOut.length,
    inCount: innIds.length,
  };
}
