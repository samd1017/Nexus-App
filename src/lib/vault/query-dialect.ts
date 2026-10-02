/**
 * The query block's full form: clauses a Dataview user already knows, with every
 * value written in the Bases formula language (see query-expr.ts).
 *
 *   TABLE status, due AS "Due", file.mtime.relative() AS "Edited"
 *   FROM "Projects" AND #active AND -#archive
 *   WHERE status != "done" AND due <= date(today) + 7d
 *   SORT due ASC, file.name
 *   GROUP BY status
 *   LIMIT 50
 *
 * LIST shows titles (plus one value), TABLE shows columns, CARDS shows a card per
 * note. FROM is optional; without it the whole vault is read.
 */

import {
  compileQueryExpr,
  compileQueryFilter,
  splitTopCommas,
  topLevelScan,
  type CompiledExpr,
  type QueryProblem,
} from "@/lib/vault/query-expr";

/** FROM [[]] or [[#]]: the note the query is written in, as in Dataview. */
export const THIS_NOTE = "\u0000this";

export type DialectView = "list" | "table" | "cards";

export type DialectColumn = { label: string; text: string; expr: CompiledExpr };

export type DialectSort = { text: string; expr: CompiledExpr; dir: "asc" | "desc" };

export type DialectSource = {
  folder: string | null;
  tags: string[];
  tagMode: "and" | "or";
  notTags: string[];
  notFolders: string[];
  /** FROM [[Note]]: notes that link to Note. `THIS_NOTE` for [[]] or [[#]]. */
  linksTo: string | null;
  /** FROM outgoing([[Note]]): notes Note links to. */
  linkedFrom: string | null;
  /** No folder, tag, or link scope: every note. */
  vault: boolean;
};

export type DialectQuery = {
  view: DialectView;
  withoutId: boolean;
  columns: DialectColumn[];
  source: DialectSource;
  where: CompiledExpr[];
  sort: DialectSort[];
  groupBy: { text: string; expr: CompiledExpr } | null;
  limit: number | null;
};

export type DialectParse = { ok: true; query: DialectQuery } | { ok: false; problem: QueryProblem };

export const MAX_DIALECT_COLUMNS = 8;

const HEAD = /^(\s*)(list|table|cards)(\s+without\s+id)?(?![\w-])/i;
const CLAUSE = /^(from|where|sort|group\s+by|limit|flatten)(?![\w-])/i;

const FILE_LABELS: Record<string, string> = {
  "file.name": "Name",
  "file.path": "Path",
  "file.folder": "Folder",
  "file.ext": "Extension",
  "file.size": "Size",
  "file.ctime": "Created",
  "file.cday": "Created",
  "file.mtime": "Modified",
  "file.mday": "Modified",
  "file.tags": "Tags",
  "file.etags": "Tags",
  "file.links": "Links",
  "file.outlinks": "Links",
  "file.backlinks": "Backlinks",
  "file.inlinks": "Backlinks",
};

/** Bare sort words the simple form takes; anything else is a property or formula. */
const SORT_ALIASES: Record<string, string> = { mtime: "file.mtime", ctime: "file.ctime", size: "file.size" };

type Clause = { keyword: string; start: number; bodyStart: number; end: number };

function problem(message: string, clause: string, start: number, end: number): DialectParse {
  return { ok: false, problem: { message, clause, start, end: Math.max(end, start + 1) } };
}

function clauses(source: string, from: number): Clause[] {
  const found: Clause[] = [];
  const body = source.slice(from);
  topLevelScan(body, (i) => {
    if (i > 0 && !/\s/.test(body[i - 1] ?? "")) return;
    const m = CLAUSE.exec(body.slice(i));
    if (!m) return;
    const keyword = (m[1] ?? "").toUpperCase().replace(/\s+/g, " ");
    found.push({ keyword, start: from + i, bodyStart: from + i + m[0].length, end: source.length });
    return m[0].length;
  });
  for (let k = 0; k < found.length - 1; k += 1) (found[k] as Clause).end = (found[k + 1] as Clause).start;
  return found;
}

/** `expr AS "Label"` or `expr AS Label`, split at the last top-level AS. */
function splitAs(text: string): { expr: string; label: string | null } {
  let at = -1;
  topLevelScan(text, (i) => {
    if (/^as(?![\w-])/i.test(text.slice(i)) && i > 0 && /\s/.test(text[i - 1] ?? "")) at = i;
  });
  if (at < 0) return { expr: text, label: null };
  const raw = text.slice(at + 2).trim();
  const label = /^"([^"]*)"$/.exec(raw)?.[1] ?? /^'([^']*)'$/.exec(raw)?.[1] ?? (/^[\w-]+$/.test(raw) ? raw : null);
  if (label === null) return { expr: text, label: null };
  return { expr: text.slice(0, at), label };
}

export function dialectLabel(text: string): string {
  const key = text.trim();
  return FILE_LABELS[key.toLowerCase()] ?? key;
}

function readColumns(source: string, start: number, end: number, view: DialectView): DialectColumn[] | DialectParse {
  const body = source.slice(start, end);
  if (!body.trim()) return [];
  const columns: DialectColumn[] = [];
  for (const part of splitTopCommas(body)) {
    const at = start + part.start;
    if (!part.text) return problem("A column is empty. Remove the extra comma.", view.toUpperCase(), at, at + 1);
    const { expr, label } = splitAs(part.text);
    const compiled = compileQueryExpr(expr, at, view.toUpperCase());
    if (!compiled.ok) return { ok: false, problem: compiled.problem };
    const name = label ?? dialectLabel(expr);
    if (columns.some((col) => col.label.toLowerCase() === name.toLowerCase())) {
      return problem(`“${name}” is already a column. Name this one with AS "Another name".`, view.toUpperCase(), at, at + part.text.length);
    }
    columns.push({ label: name, text: expr.trim(), expr: compiled.expr });
  }
  if (view === "list" && columns.length > 1) {
    const second = splitTopCommas(body)[1];
    const at = start + (second?.start ?? 0);
    return problem("LIST shows one value next to each title. Use TABLE or CARDS for more columns.", "LIST", at, end);
  }
  if (columns.length > MAX_DIALECT_COLUMNS) {
    return problem(`Up to ${MAX_DIALECT_COLUMNS} columns fit.`, view.toUpperCase(), start, end);
  }
  return columns;
}

function cleanFolder(raw: string): string {
  return raw.replace(/\\/g, "/").replace(/^\/+|\/+$/g, "").trim();
}

function readSource(source: string, start: number, end: number): DialectSource | DialectParse {
  const body = source.slice(start, end);
  const out: DialectSource = {
    folder: null,
    tags: [],
    tagMode: "or",
    notTags: [],
    notFolders: [],
    linksTo: null,
    linkedFrom: null,
    vault: false,
  };
  if (!body.trim()) return problem('FROM needs "Folder", #tag, or [[Note]].', "FROM", start - 4, end);
  type Atom = { text: string; start: number; end: number; join: "and" | "or" | null };
  const atoms: Atom[] = [];
  let from = 0;
  let join: "and" | "or" | null = null;
  const push = (to: number, next: "and" | "or" | null) => {
    const raw = body.slice(from, to);
    const lead = raw.length - raw.trimStart().length;
    const text = raw.trim();
    if (text) atoms.push({ text, start: start + from + lead, end: start + from + lead + text.length, join });
    join = next;
  };
  topLevelScan(body, (i) => {
    const m = /^(and|or)(?![\w-])/i.exec(body.slice(i));
    if (m && (i === 0 || /\s/.test(body[i - 1] ?? ""))) {
      push(i, (m[1] ?? "").toLowerCase() as "and" | "or");
      from = i + m[0].length;
      return m[0].length;
    }
  });
  push(body.length, null);
  let positiveTags = 0;
  let tagJoin: "and" | "or" | null = null;
  let positiveFolders = 0;
  let joinsOr = false;
  for (const [n, atom] of atoms.entries()) {
    if (n > 0 && atom.join === "or") joinsOr = true;
    let text = atom.text;
    let negate = false;
    const neg = /^(?:-|!|not\s+)/i.exec(text);
    if (neg) {
      negate = true;
      text = text.slice(neg[0].length).trim();
    }
    const tag = /^#([\p{L}\p{N}_][\p{L}\p{N}_/-]*)$/u.exec(text);
    const quoted = /^"([^"]*)"$/.exec(text) ?? /^'([^']*)'$/.exec(text);
    const keyed = /^(?:path|folder):(?:"([^"]*)"|(.+))$/i.exec(text);
    const link = /^\[\[([^[\]]*)\]\]$/.exec(text);
    const outgoing = /^outgoing\(\s*\[\[([^[\]]*)\]\]\s*\)$/i.exec(text);
    if (tag) {
      const name = (tag[1] ?? "").toLowerCase();
      if (negate) {
        out.notTags.push(name);
        continue;
      }
      if (positiveTags > 0 && n > 0) {
        const j = atom.join ?? "and";
        if (tagJoin && tagJoin !== j) {
          return problem("Use AND or OR between tags, not both. Move the rest into WHERE, like WHERE file.hasTag(\"a\") || file.hasTag(\"b\").", "FROM", atom.start, atom.end);
        }
        tagJoin = j;
      }
      positiveTags += 1;
      out.tags.push(name);
      continue;
    }
    if (quoted || keyed) {
      const folder = cleanFolder(quoted ? (quoted[1] ?? "") : (keyed?.[1] ?? keyed?.[2] ?? ""));
      if (negate) {
        if (folder) out.notFolders.push(folder);
        continue;
      }
      if (!folder) {
        out.vault = true;
        continue;
      }
      positiveFolders += 1;
      if (positiveFolders > 1) {
        return problem('FROM reads one folder. For several, use WHERE file.inFolder("A") || file.inFolder("B").', "FROM", atom.start, atom.end);
      }
      out.folder = folder;
      continue;
    }
    if (link || outgoing) {
      if (negate) return problem("FROM cannot leave out a link. Use WHERE !file.hasLink(\"Note\").", "FROM", atom.start, atom.end);
      const written = ((link ?? outgoing)?.[1] ?? "").split("|")[0]?.trim() ?? "";
      const target = written === "" || written === "#" ? THIS_NOTE : written;
      if (out.linksTo || out.linkedFrom) return problem("FROM reads one [[link]]. Add the others in WHERE.", "FROM", atom.start, atom.end);
      if (link) out.linksTo = target;
      else out.linkedFrom = target;
      continue;
    }
    return problem(`FROM reads "Folder", #tag, or [[Note]], not “${atom.text}”. Quote folder names.`, "FROM", atom.start, atom.end);
  }
  if (joinsOr && (positiveFolders > 0 || out.linksTo || out.linkedFrom || out.notTags.length || out.notFolders.length)) {
    return problem(
      'FROM joins a folder, a link, or a left-out tag with AND. For either-or, use WHERE, like WHERE file.inFolder("A") || file.hasTag("b").',
      "FROM",
      start,
      end,
    );
  }
  out.tagMode = tagJoin ?? "or";
  if (!out.folder && !out.tags.length && !out.linksTo && !out.linkedFrom) out.vault = true;
  return out;
}

function readSort(source: string, start: number, end: number): DialectSort[] | DialectParse {
  const body = source.slice(start, end);
  const keys: DialectSort[] = [];
  for (const part of splitTopCommas(body)) {
    const at = start + part.start;
    if (!part.text) return problem("SORT needs a value, like SORT due ASC.", "SORT", at, at + 1);
    let text = part.text;
    let dir: "asc" | "desc" = "asc";
    const tail = /\s+(asc|ascending|desc|descending)$/i.exec(text);
    if (tail) {
      dir = (tail[1] ?? "").toLowerCase().startsWith("desc") ? "desc" : "asc";
      text = text.slice(0, tail.index);
    } else if (/^(asc|ascending|desc|descending)$/i.test(text)) {
      return problem("SORT needs a value before ASC or DESC, like SORT due DESC.", "SORT", at, at + text.length);
    }
    const key = SORT_ALIASES[text.trim().toLowerCase()] ?? text;
    const compiled = compileQueryExpr(key === text ? text : key, key === text ? at : at, "SORT");
    if (!compiled.ok) return { ok: false, problem: compiled.problem };
    keys.push({ text: key.trim(), expr: compiled.expr, dir });
  }
  return keys;
}

export function parseDialect(source: string): DialectParse {
  const head = HEAD.exec(source);
  if (!head) {
    const first = /^\s*(\S*)/.exec(source);
    const lead = (first?.[0].length ?? 0) - (first?.[1]?.length ?? 0);
    return problem("Start with LIST, TABLE, or CARDS.", "LIST", lead, lead + (first?.[1]?.length || 1));
  }
  const view = (head[2] ?? "").toLowerCase() as DialectView;
  const withoutId = Boolean(head[3]);
  const headEnd = head[0].length;
  const found = clauses(source, headEnd);
  const columnsEnd = found[0]?.start ?? source.length;
  const columns = readColumns(source, headEnd, columnsEnd, view);
  if (!Array.isArray(columns)) return columns;
  if (withoutId && view !== "table") {
    return problem("WITHOUT ID belongs on TABLE.", view.toUpperCase(), (head[1] ?? "").length, headEnd);
  }
  if (withoutId && !columns.length) {
    return problem("TABLE WITHOUT ID needs at least one column.", "TABLE", (head[1] ?? "").length, headEnd);
  }
  let source_: DialectSource | null = null;
  const where: CompiledExpr[] = [];
  let sort: DialectSort[] | null = null;
  let groupBy: DialectQuery["groupBy"] = null;
  let limit: number | null = null;
  for (const clause of found) {
    const body = source.slice(clause.bodyStart, clause.end);
    const kwEnd = clause.bodyStart;
    if (clause.keyword === "FROM") {
      if (source_) return problem("Only one FROM. Join sources with AND or OR.", "FROM", clause.start, kwEnd);
      const read = readSource(source, clause.bodyStart, clause.end);
      if ("ok" in read) return read;
      source_ = read;
    } else if (clause.keyword === "WHERE") {
      if (!body.trim()) return problem('WHERE needs a condition, like WHERE status != "done".', "WHERE", clause.start, kwEnd);
      const compiled = compileQueryFilter(body, clause.bodyStart, "WHERE");
      if (!compiled.ok) return { ok: false, problem: compiled.problem };
      if (compiled.expr) where.push(compiled.expr);
    } else if (clause.keyword === "SORT") {
      if (sort) return problem("Only one SORT. List several keys with commas, like SORT status, due DESC.", "SORT", clause.start, kwEnd);
      if (!body.trim()) return problem("SORT needs a value, like SORT due ASC.", "SORT", clause.start, kwEnd);
      const read = readSort(source, clause.bodyStart, clause.end);
      if (!Array.isArray(read)) return read;
      sort = read;
    } else if (clause.keyword === "GROUP BY") {
      if (groupBy) return problem("Only one GROUP BY is supported.", "GROUP BY", clause.start, kwEnd);
      const { expr } = splitAs(body);
      if (!expr.trim()) return problem("GROUP BY needs a value, like GROUP BY status.", "GROUP BY", clause.start, kwEnd);
      const compiled = compileQueryExpr(expr, clause.bodyStart, "GROUP BY");
      if (!compiled.ok) return { ok: false, problem: compiled.problem };
      groupBy = { text: expr.trim(), expr: compiled.expr };
    } else if (clause.keyword === "LIMIT") {
      if (limit !== null) return problem("Only one LIMIT is supported.", "LIMIT", clause.start, kwEnd);
      const raw = body.trim();
      if (!/^[1-9]\d*$/.test(raw)) {
        const at = clause.bodyStart + (body.length - body.trimStart().length);
        return problem("LIMIT needs a positive number, such as LIMIT 3.", "LIMIT", raw ? at : clause.start, raw ? at + raw.length : kwEnd);
      }
      limit = Number(raw);
    } else {
      return problem(
        'FLATTEN works in the simple form, like LIST FROM "Folder" FLATTEN file.outlinks. Here, show links as a column: TABLE file.links.',
        "FLATTEN",
        clause.start,
        clause.end,
      );
    }
  }
  const scope: DialectSource = source_ ?? {
    folder: null,
    tags: [],
    tagMode: "or",
    notTags: [],
    notFolders: [],
    linksTo: null,
    linkedFrom: null,
    vault: true,
  };
  return { ok: true, query: { view, withoutId, columns, source: scope, where, sort: sort ?? [], groupBy, limit } };
}

/** Spellings only the full form reads, so its message wins when neither form parses. */
export function looksLikeDialect(source: string): boolean {
  const code = source.replace(/"[^"]*"|'[^']*'/g, '""');
  return (
    /^\s*cards\b/i.test(code) ||
    /\bwithout\s+id\b/i.test(code) ||
    /==|&&|\|\||\[\[|\s+as\s+/i.test(code) ||
    /\b(today|now|link|if|file\.has\w*|file\.inFolder|file\.asLink)\s*\(/i.test(code) ||
    /\w\.\w+\s*\(/.test(code) ||
    /(^|[\s(])!\s*[\w(]/.test(code)
  );
}
