/**
 * Shared search operators for the command palette and live ```query blocks.
 * Operators: path: folder: file: #tag tag: -exclude is:orphan OR
 * line: and section: are recognized only so search can say they are not supported yet.
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

export type UnsupportedSearchOp = "line" | "section";

export type SearchOps = {
  rest: string;
  pathFilter: string | null;
  folderFilter: string | null;
  fileFilter: string | null;
  tagFilter: string | null;
  excludes: string[];
  isOrphan: boolean;
  /**
   * Uppercase `OR` clauses, each parsed on its own.
   * Empty when the query did not use OR. Lowercase "or" stays ordinary text.
   */
  orClauses: SearchOps[];
  /** `line:` / `section:` tokens the user typed. They are not applied as filters. */
  unsupported: UnsupportedSearchOp[];
};

const UNSUPPORTED_ORDER: UnsupportedSearchOp[] = ["line", "section"];

/** Settings, shortcuts, and palette copy. Keep the unsupported operators explicit. */
export const SEARCH_OPERATOR_HELP =
  "Operators: path:, folder:, file:, #tag, tag:, -exclude, is:orphan, and OR for either term (foo OR bar). line: and section: are not supported yet.";

function takeQuotedOrBare(all: string, quoted?: string, bare?: string): string {
  return (quoted ?? bare ?? all ?? "").trim();
}

function canonUnsupported(ops: UnsupportedSearchOp[]): UnsupportedSearchOp[] {
  return UNSUPPORTED_ORDER.filter((op) => ops.includes(op));
}

function mergeUnsupported(clauses: SearchOps[]): UnsupportedSearchOp[] {
  const found: UnsupportedSearchOp[] = [];
  for (const clause of clauses) {
    for (const op of clause.unsupported) {
      if (!found.includes(op)) found.push(op);
    }
  }
  return canonUnsupported(found);
}

/** One sentence when the query used line: and/or section:. */
export function unsupportedSearchHint(ops: Pick<SearchOps, "unsupported">): string | null {
  const present = canonUnsupported(ops.unsupported);
  if (present.length === 0) return null;
  const labels = present.map((op) => `${op}:`);
  if (labels.length === 1) return `${labels[0]} is not supported yet.`;
  return `${labels[0]} and ${labels[1]} are not supported yet.`;
}

export function hasOrQuery(ops: SearchOps): boolean {
  return ops.orClauses.length > 1;
}

/** `#tag` or `tag:tag` with no other filters — same tag lookup either way. */
export function isTagOnlyQuery(ops: SearchOps): boolean {
  return Boolean(
    ops.tagFilter &&
      !ops.rest &&
      !ops.pathFilter &&
      !ops.folderFilter &&
      !ops.fileFilter &&
      ops.excludes.length === 0 &&
      !ops.isOrphan &&
      ops.orClauses.length === 0,
  );
}

function blankOps(rest = ""): SearchOps {
  return {
    rest,
    pathFilter: null,
    folderFilter: null,
    fileFilter: null,
    tagFilter: null,
    excludes: [],
    isOrphan: false,
    orClauses: [],
    unsupported: [],
  };
}

/** Split on uppercase OR outside quotes. Lowercase "or" is not an operator. */
function splitUppercaseOr(raw: string): string[] {
  const parts: string[] = [];
  let buf = "";
  let inQuote = false;
  for (let i = 0; i < raw.length; i++) {
    const ch = raw[i];
    if (ch === '"') {
      inQuote = !inQuote;
      buf += ch;
      continue;
    }
    if (!inQuote && raw.startsWith("OR", i)) {
      const before = i === 0 ? "" : raw[i - 1];
      const after = i + 2 >= raw.length ? "" : raw[i + 2];
      const boundaryBefore = i === 0 || /\s/.test(before);
      const boundaryAfter = i + 2 >= raw.length || /\s/.test(after);
      if (boundaryBefore && boundaryAfter) {
        parts.push(buf);
        buf = "";
        i += 1;
        while (i + 1 < raw.length && /\s/.test(raw[i + 1])) i += 1;
        continue;
      }
    }
    buf += ch;
  }
  parts.push(buf);
  return parts;
}

function stripUnsupported(raw: string): { text: string; unsupported: UnsupportedSearchOp[] } {
  const unsupported: UnsupportedSearchOp[] = [];
  let out = "";
  let inQuote = false;
  for (let i = 0; i < raw.length; i++) {
    const ch = raw[i];
    if (ch === '"') {
      inQuote = !inQuote;
      out += ch;
      continue;
    }
    if (!inQuote) {
      const prev = i === 0 ? "" : raw[i - 1];
      const boundary = i === 0 || /\W/.test(prev);
      if (boundary) {
        const m = /^(line|section):(?:"[^"]*"|[^\s]*)/i.exec(raw.slice(i));
        if (m) {
          const key = m[1].toLowerCase() as UnsupportedSearchOp;
          if (!unsupported.includes(key)) unsupported.push(key);
          out += " ";
          i += m[0].length - 1;
          continue;
        }
      }
    }
    out += ch;
  }
  return { text: out, unsupported: canonUnsupported(unsupported) };
}

function parseClause(raw: string): SearchOps {
  const stripped = stripUnsupported(raw);
  let rest = stripped.text;
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
  // tag: is the Obsidian alias of #tag, including tag:#name.
  rest = rest.replace(/(^|\s)tag:#?([a-zA-Z][\w/-]{0,48})\b/gi, (_, lead, tag: string) => {
    tagFilter = tag.toLowerCase();
    return lead;
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
    orClauses: [],
    unsupported: stripped.unsupported,
  };
}

function clauseHasWork(ops: SearchOps): boolean {
  return Boolean(ops.rest || hasSearchOps(ops) || ops.unsupported.length);
}

export function parseSearchOps(raw: string): SearchOps {
  const parts = splitUppercaseOr(raw || "");
  const clauses = parts.map((part) => parseClause(part));
  if (parts.length <= 1) return clauses[0] ?? blankOps();

  const meaningful = clauses.filter(clauseHasWork);
  if (meaningful.length > 1) {
    return {
      rest: meaningful
        .map((clause) => clause.rest)
        .filter(Boolean)
        .join(" "),
      pathFilter: null,
      folderFilter: null,
      fileFilter: null,
      tagFilter: null,
      excludes: [],
      isOrphan: false,
      orClauses: meaningful,
      unsupported: mergeUnsupported(meaningful),
    };
  }
  if (meaningful.length === 1) {
    return {
      ...meaningful[0],
      unsupported: mergeUnsupported(clauses),
    };
  }
  return blankOps();
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

function unionSearchHits(groups: SearchHit[][], limit: number): SearchHit[] {
  const byId = new Map<string, SearchHit>();
  for (const group of groups) {
    for (const hit of group) {
      const prev = byId.get(hit.noteId);
      if (!prev || hit.score > prev.score) byId.set(hit.noteId, hit);
    }
  }
  return [...byId.values()]
    .sort((a, b) => b.score - a.score || a.title.localeCompare(b.title))
    .slice(0, limit);
}

function searchParsedOps(
  nodes: Record<string, VaultNode>,
  ops: SearchOps,
  limit: number,
): SearchHit[] {
  // An unsupported operator alone is not "match everything".
  if (!ops.rest && !hasSearchOps(ops)) {
    if (ops.unsupported.length) return [];
    return searchWithBackend(nodes, "", limit).slice(0, limit);
  }
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

/** Scale-safe operator search used by palette + live query blocks. */
export function searchWithOps(
  nodes: Record<string, VaultNode>,
  raw: string,
  limit = 16,
): SearchHit[] {
  const ops = parseSearchOps(raw);
  if (ops.orClauses.length > 1) {
    const per = Math.min(Math.max(limit, 16), 80);
    return unionSearchHits(
      ops.orClauses.map((clause) => searchParsedOps(nodes, clause, per)),
      limit,
    );
  }
  return searchParsedOps(nodes, ops, limit);
}
