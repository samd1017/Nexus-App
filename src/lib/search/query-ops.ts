/**
 * Shared search operators for the command palette and live ```query blocks.
 * Operators: path: folder: file: #tag tag: -exclude is:orphan OR
 * line:N keeps a hit on that 1-based body line.
 * section:"Heading" keeps a hit inside that heading slice.
 * Unloaded bodies are skipped — no vault-wide eager load.
 */

import type { SearchHit, VaultNode } from "@/lib/vault/types";
import { noteTitle } from "@/lib/vault/types";
import { notesForTag } from "@/lib/vault/tags";
import { getOrphanNotes } from "@/lib/vault/broken-links";
import { getDurableIndex } from "@/lib/vault/durable-index";
import { sliceMarkdownByHeading } from "@/lib/markdown/note-slice";
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
  /** 1-based body line. `0` means the token was not a positive integer. */
  lineFilter: number | null;
  /** Heading text from `section:`. Empty string matches nothing. */
  sectionFilter: string | null;
  /** Leftover ops that are still recognized but not applied. line:/section: are applied. */
  unsupported: UnsupportedSearchOp[];
};

const UNSUPPORTED_ORDER: UnsupportedSearchOp[] = ["line", "section"];

/** Settings, shortcuts, and palette copy. */
export const SEARCH_OPERATOR_HELP =
  'Operators: path:, folder:, file:, #tag, tag:, -exclude, is:orphan, line:, section:, and OR for either term (foo OR bar). line:N keeps a hit on that body line. section:"Heading" keeps a hit inside that heading.';

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

/** Shown when OR / path: / folder: cannot reach the durable index. */
export const WINDOW_SCOPED_SEARCH_HINT =
  "OR, path:, and folder: are searching notes loaded in this window, not the whole vault.";

/** line:/section: read loaded bodies. SQLite FTS has no line or heading index. */
export const LINE_SECTION_WINDOW_HINT =
  "line: and section: search notes loaded in this window, not unloaded vault notes.";

export function searchUsesLoadedBodies(ops: SearchOps): boolean {
  const clauses = ops.orClauses.length > 1 ? ops.orClauses : [ops];
  return clauses.some((c) => c.lineFilter != null || c.sectionFilter != null);
}

export type PagedSearchEngine = "sqlite-ops" | "catalog-path" | "window" | "default";

/**
 * Paged desktop search must not silently use the mounted note window.
 * SQLite owns OR, file:, and path/folder combined with words.
 * Path or folder alone already reads note_meta. Without SQLite, say so.
 */
export function planPagedDesktopSearch(args: {
  shellCatalog: boolean;
  sqlite: boolean;
  ops: SearchOps;
}): { engine: PagedSearchEngine; hint: string | null } {
  const clauses = args.ops.orClauses.length > 1 ? args.ops.orClauses : [args.ops];
  if (searchUsesLoadedBodies(args.ops)) {
    return { engine: "default", hint: LINE_SECTION_WINDOW_HINT };
  }
  const or = hasOrQuery(args.ops);
  const path = clauses.some((c) => c.pathFilter || c.folderFilter);
  const file = clauses.some((c) => c.fileFilter);
  const rest = clauses.some((c) => c.rest.trim().length > 0);
  if (args.sqlite && (or || file || (path && rest))) {
    return { engine: "sqlite-ops", hint: null };
  }
  if ((args.sqlite || args.shellCatalog) && path && !or && !file) {
    return { engine: "catalog-path", hint: null };
  }
  if (args.shellCatalog && !args.sqlite && (or || path || file)) {
    return { engine: "window", hint: WINDOW_SCOPED_SEARCH_HINT };
  }
  return { engine: "default", hint: null };
}

/** Desktop SQLite for OR / path+words / file:. Null when this index cannot. */
export async function searchDesktopOps(
  raw: string,
  limit = 16,
): Promise<SearchHit[] | null> {
  const idx = getDurableIndex();
  if (!idx?.searchOpsAsync) return null;
  const ops = parseSearchOps(raw);
  const clauses = (ops.orClauses.length > 1 ? ops.orClauses : [ops]).map((c) => ({
    rest: c.rest,
    pathFilter: c.pathFilter ?? "",
    folderFilter: c.folderFilter ?? "",
    fileFilter: c.fileFilter ?? "",
    tagFilter: c.tagFilter ?? "",
    excludes: c.excludes,
  }));
  return idx.searchOpsAsync(clauses, limit);
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
      ops.lineFilter == null &&
      ops.sectionFilter == null &&
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
    lineFilter: null,
    sectionFilter: null,
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

function parseLineNumber(value: string): number {
  if (!/^\d+$/.test(value)) return 0;
  const n = Number(value);
  if (!Number.isSafeInteger(n) || n < 1) return 0;
  return n;
}

/** Pull line:/section: outside quotes. Quoted path:"section:…" stays text. Last token wins. */
function stripLineSection(raw: string): {
  text: string;
  lineFilter: number | null;
  sectionFilter: string | null;
} {
  let lineFilter: number | null = null;
  let sectionFilter: string | null = null;
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
        const m = /^(line|section):(?:"([^"]*)"|([^\s]*))/i.exec(raw.slice(i));
        if (m) {
          const value = (m[2] ?? m[3] ?? "").trim();
          if (m[1].toLowerCase() === "line") lineFilter = parseLineNumber(value);
          else sectionFilter = value;
          out += " ";
          i += m[0].length - 1;
          continue;
        }
      }
    }
    out += ch;
  }
  return { text: out, lineFilter, sectionFilter };
}

function parseClause(raw: string): SearchOps {
  const stripped = stripLineSection(raw);
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
    lineFilter: stripped.lineFilter,
    sectionFilter: stripped.sectionFilter,
    unsupported: [],
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
      lineFilter: null,
      sectionFilter: null,
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
      ops.isOrphan ||
      ops.lineFilter != null ||
      ops.sectionFilter != null,
  );
}

function lineSectionOk(content: string | undefined, ops: SearchOps): boolean {
  if (ops.lineFilter == null && ops.sectionFilter == null) return true;
  if (typeof content !== "string") return false;
  const rest = ops.rest.trim().toLowerCase();
  if (ops.lineFilter != null) {
    if (!Number.isInteger(ops.lineFilter) || ops.lineFilter < 1) return false;
    const line = content.split("\n")[ops.lineFilter - 1];
    if (line == null) return false;
    if (rest && !line.toLowerCase().includes(rest)) return false;
  }
  if (ops.sectionFilter != null) {
    const slice = sliceMarkdownByHeading(content, ops.sectionFilter);
    if (slice == null) return false;
    if (rest && !slice.toLowerCase().includes(rest)) return false;
  }
  return true;
}

function bodySnippet(content: string, ops: SearchOps): string {
  if (ops.lineFilter != null && ops.lineFilter >= 1) {
    return (content.split("\n")[ops.lineFilter - 1] ?? "").trim().slice(0, 140);
  }
  if (ops.sectionFilter != null) {
    return (sliceMarkdownByHeading(content, ops.sectionFilter) ?? "").trim().slice(0, 140);
  }
  return "";
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
  if (ops.lineFilter != null || ops.sectionFilter != null) {
    if (!nodes) return [];
    out = out.flatMap((h) => {
      const content = nodes[h.noteId]?.content;
      if (typeof content !== "string" || !lineSectionOk(content, ops)) return [];
      return [{ ...h, snippet: bodySnippet(content, ops) || h.snippet, matchType: "content" as const }];
    });
  }
  return out;
}

function bareLineOnly(ops: SearchOps): boolean {
  return (
    ops.lineFilter != null &&
    ops.sectionFilter == null &&
    !ops.rest &&
    !ops.pathFilter &&
    !ops.folderFilter &&
    !ops.fileFilter &&
    !ops.tagFilter &&
    ops.excludes.length === 0 &&
    !ops.isOrphan
  );
}

function loadedNoteHits(nodes: Record<string, VaultNode>): SearchHit[] {
  const hits: SearchHit[] = [];
  for (const n of Object.values(nodes)) {
    if (n.kind !== "note" || typeof n.content !== "string") continue;
    hits.push({
      noteId: n.id,
      path: n.path,
      title: noteTitle(n),
      snippet: "",
      score: 1,
      matchType: "content",
    });
  }
  return hits;
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
  // line:N with no other terms is not "match everything".
  if (bareLineOnly(ops)) return [];
  if (ops.lineFilter != null || ops.sectionFilter != null) {
    let hits = loadedNoteHits(nodes);
    if (ops.isOrphan) {
      try {
        const allowed = new Set(getOrphanNotes(nodes, Math.max(limit, hits.length)).map((n) => n.id));
        hits = hits.filter((h) => allowed.has(h.noteId));
      } catch {
        return [];
      }
    }
    return filterHitsByOps(hits, ops, nodes).slice(0, limit);
  }
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
