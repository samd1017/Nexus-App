/**
 * Implicit backlinks — other notes that mention this title in plain text
 * without a [[wikilink]]. Obsidian's "Unlinked mentions" equivalent.
 */

import type { VaultNode } from "./types";
import { noteTitle } from "./types";
import { extractWikilinks, stripCodeForLinkScan } from "@/lib/markdown/wikilinks";

export type UnlinkedMention = {
  fromId: string;
  fromPath: string;
  fromTitle: string;
  context: string;
  title: string;
};

const MIN_TITLE = 4;
const MAX_SCAN_NOTES = 400;
const MAX_HITS = 24;

function titleCandidates(note: VaultNode): string[] {
  const titles = new Set<string>();
  const primary = noteTitle(note).trim();
  if (primary) titles.add(primary);
  const stem = note.name.replace(/\.md$/i, "").trim();
  if (stem) titles.add(stem);
  return [...titles].filter((t) => t.length >= MIN_TITLE);
}

function maskWikilinks(body: string): string {
  let out = body;
  for (const link of extractWikilinks(body)) {
    out =
      out.slice(0, link.start) +
      " ".repeat(Math.max(0, link.end - link.start)) +
      out.slice(link.end);
  }
  return out;
}

function mentionRe(title: string): RegExp {
  const escaped = title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(?<![\\w/[\\]])(${escaped})(?![\\w\\]])`, "i");
}

function contextAround(body: string, index: number, length: number): string {
  const start = Math.max(0, index - 56);
  const end = Math.min(body.length, index + length + 72);
  let slice = body.slice(start, end).replace(/\s+/g, " ").trim();
  if (start > 0) slice = `…${slice}`;
  if (end < body.length) slice = `${slice}…`;
  return slice;
}

export function getUnlinkedMentions(
  targetNote: VaultNode,
  nodes: Record<string, VaultNode>,
): UnlinkedMention[] {
  if (targetNote.kind !== "note") return [];
  const titles = titleCandidates(targetNote);
  if (!titles.length) return [];

  const out: UnlinkedMention[] = [];
  let scanned = 0;
  for (const n of Object.values(nodes)) {
    if (out.length >= MAX_HITS) break;
    if (scanned >= MAX_SCAN_NOTES) break;
    if (!n || n.kind !== "note" || n.id === targetNote.id) continue;
    if (typeof n.content !== "string") continue;
    scanned += 1;
    const raw = n.content;
    const scan = maskWikilinks(stripCodeForLinkScan(raw));
    for (const title of titles) {
      const re = mentionRe(title);
      const hit = re.exec(scan);
      if (!hit || hit.index == null) continue;
      out.push({
        fromId: n.id,
        fromPath: n.path,
        fromTitle: noteTitle(n),
        context: contextAround(scan, hit.index, hit[0].length),
        title,
      });
      break;
    }
  }
  return out.sort((a, b) => a.fromTitle.localeCompare(b.fromTitle));
}

/** Filter indexed heads down to plain-text mentions. A page, not the vault. */
export function unlinkedFromHeads(
  title: string,
  heads: Array<{ fromId: string; fromPath: string; fromTitle: string; body: string }>,
  selfId?: string,
): UnlinkedMention[] {
  const needle = title.trim();
  if (needle.length < MIN_TITLE) return [];
  const out: UnlinkedMention[] = [];
  for (const head of heads) {
    if (out.length >= MAX_HITS) break;
    if (selfId && head.fromId === selfId) continue;
    const raw = head.body ?? "";
    const scan = maskWikilinks(stripCodeForLinkScan(raw));
    const hit = mentionRe(needle).exec(scan);
    if (!hit || hit.index == null) continue;
    out.push({
      fromId: head.fromId,
      fromPath: head.fromPath,
      fromTitle: head.fromTitle,
      context: contextAround(scan, hit.index, hit[0].length),
      title: needle,
    });
  }
  return out.sort((a, b) => a.fromTitle.localeCompare(b.fromTitle));
}

/** Wrap the first unlinked title occurrence in [[Title]]. */
export function wrapUnlinkedMention(
  body: string,
  title: string,
): { next: string; did: boolean } {
  if (!body || !title.trim()) return { next: body, did: false };
  const scan = maskWikilinks(stripCodeForLinkScan(body));
  const re = mentionRe(title.trim());
  const hit = re.exec(scan);
  if (!hit || hit.index == null) return { next: body, did: false };
  const found = body.slice(hit.index, hit.index + hit[0].length);
  const next =
    body.slice(0, hit.index) + `[[${title.trim()}]]` + body.slice(hit.index + found.length);
  return { next, did: next !== body };
}
