/**
 * Unresolved [[wikilinks]] for the active note / vault health.
 */

import type { VaultNode } from "./types";
import { noteTitle } from "./types";
import { extractWikilinks } from "@/lib/markdown/wikilinks";
import { resolveWikilink } from "@/lib/graph/build-graph";

export type BrokenLink = {
  target: string;
  context: string;
};

export function getBrokenLinksForNote(
  note: VaultNode,
  nodes: Record<string, VaultNode>,
): BrokenLink[] {
  if (note.kind !== "note") return [];
  const content = note.content ?? "";
  const seen = new Set<string>();
  const out: BrokenLink[] = [];
  for (const link of extractWikilinks(content)) {
    const key = link.target.trim().toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    if (resolveWikilink(link.target, nodes)) continue;
    const start = Math.max(0, link.start - 40);
    const end = Math.min(content.length, link.end + 40);
    let ctx = content.slice(start, end).replace(/\s+/g, " ").trim();
    if (start > 0) ctx = "…" + ctx;
    if (end < content.length) ctx = ctx + "…";
    out.push({ target: link.target, context: ctx });
  }
  return out.sort((a, b) => a.target.localeCompare(b.target));
}

export type VaultBrokenLink = BrokenLink & {
  noteId: string;
  noteTitle: string;
  notePath: string;
};

/** Vault-wide broken [[wikilinks]] across all notes */
export function getAllBrokenLinks(
  nodes: Record<string, VaultNode>,
  limit = 40,
): VaultBrokenLink[] {
  const notes = Object.values(nodes).filter((n) => n.kind === "note");
  const out: VaultBrokenLink[] = [];
  for (const note of notes) {
    for (const bl of getBrokenLinksForNote(note, nodes)) {
      out.push({
        ...bl,
        noteId: note.id,
        noteTitle: noteTitle(note),
        notePath: note.path,
      });
      if (out.length >= limit) return out;
    }
  }
  return out;
}

export type OrphanNote = {
  id: string;
  title: string;
  path: string;
};

/** Notes with no incoming or outgoing wikilinks */
export function getOrphanNotes(
  nodes: Record<string, VaultNode>,
  limit = 24,
): OrphanNote[] {
  const notes = Object.values(nodes).filter((n) => n.kind === "note");
  const linked = new Set<string>();
  for (const n of notes) {
    const links = extractWikilinks(n.content ?? "");
    if (links.length) linked.add(n.id);
    for (const l of links) {
      const hit = resolveWikilink(l.target, nodes);
      if (hit) linked.add(hit.id);
    }
  }
  return notes
    .filter((n) => !linked.has(n.id))
    .sort((a, b) => b.mtime - a.mtime)
    .slice(0, limit)
    .map((n) => ({
      id: n.id,
      title: noteTitle(n),
      path: n.path,
    }));
}
