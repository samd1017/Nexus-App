/**
 * Shared search operators for the command palette and live ```query blocks.
 * Operators: path: folder: file: #tag -exclude is:orphan
 */

import type { SearchHit, VaultNode } from "@/lib/vault/types";
import { noteTitle } from "@/lib/vault/types";
import { notesForTag } from "@/lib/vault/tags";
import { getOrphanNotes } from "@/lib/vault/broken-links";
import {
  filterHitsByPathOps,
  searchWithBackend,
  searchWithPathFolderOps,
} from "./search-backend";

export type SearchOps = {
  rest: string;
  pathFilter: string | null;
  folderFilter: string | null;
  fileFilter: string | null;
  tagFilter: string | null;
  excludes: string[];
  isOrphan: boolean;
};

const TOKEN = /("([^"]+)"|(\S+))/;

function takeQuotedOrBare(all: string, quoted?: string, bare?: string): string {
  return (quoted ?? bare ?? all ?? "").trim();
}

export function parseSearchOps(raw: string): SearchOps {
  let rest = raw || "";
  let pathFilter: string | null = null;
  let folderFilter: string | null = null;
  let fileFilter: string | null = null;
  let tagFilter: string | null = null;
  const excludes: string[] = [];
  let isOrphan = false;

  rest = rest.replace(/\bpath:("([^"]+)"|(\S+))/gi, (_, all, quoted, bare) => {
    pathFilter = takeQuotedOrBare(all, quoted, bare) || null;
    return " ";
  });
  rest = rest.replace(/\bfolder:("([^"]+)"|(\S+))/gi, (_, all, quoted, bare) => {
    folderFilter = takeQuotedOrBare(all, quoted, bare) || null;
    return " ";
  });
  rest = rest.replace(/\bfile:("([^"]+)"|(\S+))/gi, (_, all, quoted, bare) => {
    fileFilter = takeQuotedOrBare(all, quoted, bare) || null;
    return " ";
  });
  rest = rest.replace(/(^|\s)-("([^"]+)"|(\S+))/g, (_, lead, all, quoted, bare) => {
    const term = takeQuotedOrBare(all, quoted, bare).replace(/^-/, "");
    if (term) excludes.push(term.toLowerCase());
    return lead;
  });
  rest = rest.replace(/\bis:(orphan|orphans)\b/gi, () => {
    isOrphan = true;
    return " ";
  });
  rest = rest.replace(/(^|\s)#([a-zA-Z][\w/-]{0,48})\b/g, (_, lead, tag: string) => {
    tagFilter = tag.toLowerCase();
    return lead;
  });

  return {
    rest: rest.replace(/\s+/g, " ").trim(),
    pathFilter,
    folderFilter,
    fileFilter,
    tagFilter,
    excludes,
    isOrphan,
  };
}

export function hasSearchOps(ops: SearchOps): boolean {
  return Boolean(
    ops.pathFilter ||
      ops.folderFilter ||
      ops.fileFilter ||
      ops.tagFilter ||
      ops.excludes.length ||
      ops.isOrphan,
  );
}

function basename(path: string): string {
  const i = path.lastIndexOf("/");
  return (i < 0 ? path : path.slice(i + 1)).toLowerCase();
}

export function filterHitsByOps(
  hits: SearchHit[],
  ops: SearchOps,
  nodes?: Record<string, VaultNode>,
): SearchHit[] {
  let out = filterHitsByPathOps(hits, ops.pathFilter, ops.folderFilter);
  if (ops.fileFilter) {
    const needle = ops.fileFilter.toLowerCase();
    out = out.filter(
      (h) =>
        basename(h.path).includes(needle) || h.title.toLowerCase().includes(needle),
    );
  }
  if (ops.tagFilter && nodes) {
    const allowed = new Set(notesForTag(nodes, ops.tagFilter).map((n) => n.id));
    out = out.filter((h) => allowed.has(h.noteId));
  }
  if (ops.excludes.length) {
    out = out.filter((h) => {
      const hay = `${h.title} ${h.path} ${h.snippet}`.toLowerCase();
      return !ops.excludes.some((ex) => hay.includes(ex));
    });
  }
  return out;
}

/** Scale-safe operator search used by palette + live query blocks. */
export function searchWithOps(
  nodes: Record<string, VaultNode>,
  raw: string,
  limit = 16,
): SearchHit[] {
  const ops = parseSearchOps(raw);
  if (ops.isOrphan) {
    try {
      return getOrphanNotes(nodes, limit).map((n) => ({
        noteId: n.id,
        path: n.path,
        title: n.title,
        snippet: "Orphan — no incoming links",
        score: 1,
        matchType: "title" as const,
      }));
    } catch {
      return [];
    }
  }
  const hasPath = Boolean(ops.pathFilter || ops.folderFilter);
  let hits: SearchHit[];
  if (hasPath) {
    hits = searchWithPathFolderOps(
      nodes,
      ops.rest,
      ops.pathFilter,
      ops.folderFilter,
      Math.min(Math.max(limit * 4, 32), 128),
    );
  } else if (ops.rest) {
    hits = searchWithBackend(nodes, ops.rest, Math.min(Math.max(limit * 4, 32), 128));
  } else if (ops.tagFilter) {
    hits = notesForTag(nodes, ops.tagFilter)
      .slice(0, 80)
      .map((n) => ({
        noteId: n.id,
        path: n.path,
        title: noteTitle(n),
        snippet: `#${ops.tagFilter}`,
        score: 1,
        matchType: "title" as const,
      }));
  } else if (ops.fileFilter) {
    hits = searchWithBackend(nodes, ops.fileFilter, 80);
  } else {
    hits = searchWithBackend(nodes, "", limit);
  }
  return filterHitsByOps(hits, ops, nodes).slice(0, limit);
}
