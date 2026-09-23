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
import { getBacklinks } from "@/lib/vault/backlinks";
import { shouldUseEgoGraph } from "@/lib/vault/scale-flags";
import { vaultIndex } from "@/lib/vault/indexes";

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
  nodes: Record<string, VaultNode> | null | undefined,
  noteId: string | null,
  max = 6,
): GraphInspect | null {
  if (!noteId || !nodes || typeof nodes !== "object") return null;
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
  let innIds = incomingIds(n);
  // Small vaults still have bodies when the reverse map is cold. Match the
  // status line, which falls back to a body scan in that case.
  // getBacklinks returns one row per mention, so the same note can appear
  // several times. Chips and the in-count are unique notes.
  if (
    innIds.length === 0 &&
    vaultLinkIndex.stats().edgeCount === 0 &&
    !shouldUseEgoGraph(vaultIndex.noteCount)
  ) {
    innIds = [...new Set(getBacklinks(n, nodes).map((b) => b.fromId))];
  }
  const uniqueInn = [...new Set(innIds)];
  return {
    id: n.id,
    title: noteTitle(n),
    path: n.path,
    kind: "note",
    out: listedLinks(nodes, uniqueOut, max),
    inn: listedLinks(nodes, uniqueInn, max),
    outCount: uniqueOut.length,
    inCount: uniqueInn.length,
  };
}

function listedLinks(
  nodes: Record<string, VaultNode>,
  ids: string[],
  max: number,
): GraphInspectLink[] {
  const seen = new Set<string>();
  const out: GraphInspectLink[] = [];
  for (const id of ids) {
    const link = toLink(nodes, id);
    if (!link || seen.has(link.id)) continue;
    seen.add(link.id);
    out.push(link);
    if (out.length >= max) break;
  }
  return out;
}
