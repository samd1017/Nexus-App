/**
 * Built-in note list for one fenced block.
 * LIST or TABLE, FROM a folder or tag, WHERE on one field,
 * including date(), > < comparisons, and contains(), TABLE columns from frontmatter,
 * one + - * / formula column, tags joined by OR or AND, SORT title|mtime.
 * FLATTEN file.outlinks is one row per outgoing link.
 * FLATTEN file.inlinks is one row per incoming link.
 * One of those joins, not both, and not a join of two queries.
 */

import { parseFrontmatterFields, splitFrontmatter } from "@/lib/editor/frontmatter";
import { extractWikilinks, normalizeLinkTarget } from "@/lib/markdown/wikilinks";
import { extractTagsFromMarkdown, notesForTag } from "@/lib/vault/tags";
import { ensureVaultIndex } from "@/lib/vault/indexes";
import { getDurableIndex } from "@/lib/vault/durable-index";
import type { VaultNode } from "@/lib/vault/types";
import { noteTitle } from "@/lib/vault/types";

export const NEXUS_QUERY_CAP = 100;
/** Stop walking a huge folder before the UI locks. */
const VISIT_BUDGET = 4000;
export const MAX_QUERY_COLUMNS = 4;

export const NEXUS_QUERY_FOOTER =
  'Built-in list. Not Dataview — a join is FLATTEN file.outlinks or FLATTEN file.inlinks, one row per link. No join of two queries. WHERE contains(file.outlinks, "Title") or contains(file.inlinks, "Title") keeps a note with that link title. WHERE file.outlinks = "…" is not supported — use contains. A TABLE formula is one + - * /.';

export const NEXUS_QUERY_HELP =
  'LIST or TABLE. FROM path:Journal, FROM "Journal", or FROM #tag. WHERE status = "draft", WHERE contains(file.name, "Graph"), WHERE due > date(today), or WHERE price > 10. contains() is a case-sensitive substring. contains(file.outlinks, "Title") or contains(file.inlinks, "Title") keeps a note whose link title is exactly that. file.mtime >= date(today) - 7d. TABLE status, due, price * 2, or file.name + " note". FLATTEN file.outlinks, or TABLE file.outlinks, lists one row per outgoing link. FLATTEN file.inlinks, or TABLE file.inlinks, lists one row per incoming link. Tags: #a OR #b, or #a AND #b. SORT title or SORT mtime, asc or desc.';

export const NEXUS_QUERY_DQL =
  'This block is not Dataview. A join is FLATTEN file.outlinks or FLATTEN file.inlinks, one row per link. No join of two queries. WHERE contains(file.outlinks, "Title") or contains(file.inlinks, "Title") keeps a note with that link title. WHERE file.outlinks = "…" is not supported — use contains. A TABLE formula is one + - * /, such as price * 2 or file.name + " note". Use LIST or TABLE, FROM path: or FROM #tag, WHERE contains(status, "draft") or WHERE field = "value", and SORT title or SORT mtime.';

export type NexusQueryField = { name: string; value: string };

export type NexusQueryRow = {
  id: string;
  title: string;
  path: string;
  /** Set only when the TABLE asked for the tags column. */
  tags: string | null;
  /** Set only when the TABLE asked for mtime, which lives on each note. */
  mtime: string | null;
  /** TABLE columns in the order they were written. Empty for LIST, except a join link. */
  fields: NexusQueryField[];
  /** Set on a FLATTEN file.outlinks or file.inlinks row. The note id still opens the matched note. */
  link: string | null;
};

export type NexusQueryModel = {
  footer: string;
  help: string | null;
  error: string | null;
  mode: "list" | "table" | null;
  rows: NexusQueryRow[];
  truncated: boolean;
  /** Shown when the walk stopped before the folder ended. */
  scanNote: string | null;
  /** Shown when a requested column is not in the index. */
  fieldNote: string | null;
  /** A tag_map page failed after retries. Do not treat that as "no notes". */
  tagsIncomplete?: boolean;
};

type TagJoin = "or" | "and";

type QuerySort = { key: "title" | "mtime"; dir: "asc" | "desc" };

type WhereOp = "eq" | "neq" | "gt" | "lt" | "gte" | "lte";

type WhereValue =
  | { kind: "text"; text: string }
  | { kind: "number"; n: number }
  | { kind: "date"; day: "today" | string; shiftDays: number };

type WhereCmp =
  | { kind: "cmp"; field: string; op: WhereOp; value: WhereValue }
  | { kind: "contains"; field: string; needle: string };

const DAY_MS = 86_400_000;

type FormulaOp = "+" | "-" | "*" | "/";

type FormulaAtom =
  | { kind: "field"; name: string }
  | { kind: "number"; n: number }
  | { kind: "text"; text: string };

type QueryColumn =
  | { kind: "field"; name: string }
  | { kind: "formula"; label: string; left: FormulaAtom; op: FormulaOp; right: FormulaAtom };

type Parsed =
  | { kind: "help" }
  | { kind: "error"; error: string }
  | {
      kind: "ok";
      mode: "list" | "table";
      path: string | null;
      tags: string[];
      tagMode: TagJoin;
      columns: QueryColumn[];
      where: WhereCmp | null;
      sort: QuerySort | null;
      /** One link join. Outgoing and incoming are not combined. */
      flattenLinks: "out" | "in" | null;
    };

const FILE_META = new Set(["file.name", "file.path", "file.folder", "file.mtime", "file.tags", "file.outlinks", "file.inlinks"]);

function linkListField(name: string): "out" | "in" | null {
  const key = name.toLowerCase();
  if (key === "file.outlinks") return "out";
  if (key === "file.inlinks") return "in";
  return null;
}

function tokenize(source: string): string[] {
  const out: string[] = [];
  const re = /"([^"]*)"|(\S+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(source))) {
    if (m[1] !== undefined) out.push(`"${m[1]}"`);
    else if (m[2]) out.push(m[2].trim());
  }
  return out.filter(Boolean);
}

function unsupportedDql(token: string): boolean {
  const meta = /^((?:file|this)\.[A-Za-z_][\w-]*)(.*)$/i.exec(token);
  if (meta) {
    const head = (meta[1] ?? "").toLowerCase();
    const rest = meta[2] ?? "";
    const formulaTail = rest === "" || rest === "," || /^([+*/]|-(?=\d))/.test(rest);
    if (!FILE_META.has(head) || !formulaTail) return true;
  }
  if (/choice\s*\(/i.test(token)) return true;
  if (/^(GROUP|LIMIT)$/i.test(token)) return true;
  return false;
}

/** `mtime` and `file.mtime` are one column, and the same for tags. */
function columnKey(name: string): string {
  const key = name.toLowerCase();
  if (key === "file.mtime") return "mtime";
  if (key === "file.tags") return "tags";
  return key;
}

export function queryColumnLabel(name: string): string {
  const key = columnKey(name);
  if (key === "tags") return "Tags";
  if (key === "mtime") return "Modified";
  if (key === "file.name") return "Name";
  if (key === "file.folder") return "Folder";
  if (key === "file.path") return "Path";
  if (key === "file.outlinks" || key === "file.inlinks") return "Link";
  return name;
}

function columnParts(token: string): string[] | null {
  const parts = token.split(",").map((part) => part.trim()).filter(Boolean);
  if (!parts.length) return null;
  const ok = parts.every((part) => FILE_META.has(part.toLowerCase()) || /^[A-Za-z_][\w-]*$/.test(part));
  return ok ? parts : null;
}

const CMP_FIELD = "(?:file\\.(?:name|path|folder|mtime|tags|outlinks|inlinks)|[A-Za-z_][\\w-]*)";
const CMP_OP = "(?:>=|<=|!=|=|>|<)";

function opOf(raw: string): WhereOp | null {
  if (raw === "=") return "eq";
  if (raw === "!=") return "neq";
  if (raw === ">") return "gt";
  if (raw === "<") return "lt";
  if (raw === ">=") return "gte";
  if (raw === "<=") return "lte";
  return null;
}

function unquote(raw: string): string {
  const quoted = /^["']([\s\S]*)["']$/.exec(raw.trim());
  return quoted ? quoted[1] ?? "" : raw.trim();
}

/** `7d`, `2w`, `dur(7d)`. Weeks are seven days. Months and years are not durations. */
function durationDays(raw: string): number | null {
  let body = raw.trim();
  const wrapped = /^dur\(([^)]+)\)$/i.exec(body);
  if (wrapped) body = (wrapped[1] ?? "").trim();
  const match = /^(\d+)\s*(d|day|days|w|week|weeks)$/i.exec(body);
  if (!match) return null;
  const n = Number(match[1]);
  if (!Number.isFinite(n)) return null;
  return (match[2] ?? "").toLowerCase().startsWith("w") ? n * 7 : n;
}

function validYmd(day: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return false;
  const y = Number(day.slice(0, 4));
  const mo = Number(day.slice(5, 7));
  const d = Number(day.slice(8, 10));
  const dt = new Date(Date.UTC(y, mo - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d;
}

type ValueParse = { value: WhereValue; end: number } | { error: string };

/**
 * A comparison value starting at `tokens[at]`, or already glued into `inline`.
 * `date(today) - 7d` may be one token or three.
 */
function parseValueAt(tokens: string[], at: number, inline: string | null): ValueParse {
  const raw = inline ?? tokens[at] ?? "";
  if (!raw) return { error: "That comparison needs a value." };
  const dateErr = "date() takes today or YYYY-MM-DD, such as date(today).";
  const offsetErr = "A date offset is 7d or 2w, such as date(today) - 7d.";
  const dateCall = /^date\(([^)]*)\)\s*(.*)$/i.exec(raw.trim());
  if (dateCall || /^date\s*\(/i.test(raw)) {
    if (!dateCall) return { error: dateErr };
    const inner = (dateCall[1] ?? "").trim();
    const day = /^today$/i.test(inner) ? "today" : validYmd(inner) ? inner : null;
    if (!day) return { error: dateErr };
    let shiftDays = 0;
    let end = inline != null ? at : at;
    const rest = (dateCall[2] ?? "").trim();
    if (rest) {
      const shift = /^([+-])\s*(.+)$/.exec(rest);
      const days = shift ? durationDays(shift[2] ?? "") : null;
      if (!shift || days == null) return { error: offsetErr };
      shiftDays = shift[1] === "-" ? -days : days;
    } else {
      const sign = tokens[end + 1];
      const dur = tokens[end + 2];
      if (sign === "+" || sign === "-") {
        const days = dur ? durationDays(dur) : null;
        if (days == null) return { error: offsetErr };
        shiftDays = sign === "-" ? -days : days;
        end += 2;
      }
    }
    return { value: { kind: "date", day, shiftDays }, end };
  }
  const text = unquote(raw);
  if (/^-?\d+(?:\.\d+)?$/.test(text)) {
    return { value: { kind: "number", n: Number(text) }, end: inline != null ? at : at };
  }
  return { value: { kind: "text", text }, end: inline != null ? at : at };
}

type CmpParse = { cmp: WhereCmp; end: number } | { error: string };

/** `status = "draft"`, `due > date(today)`, `price>=10`, starting at `tokens[at]`. */
function parseCmpAt(tokens: string[], at: number): CmpParse | null {
  const glued = new RegExp(`^(${CMP_FIELD})\\s*(${CMP_OP})\\s*(.*)$`).exec(tokens[at] ?? "");
  let field = "";
  let opRaw = "";
  let inline: string | null = null;
  let valueAt = at;
  if (glued && (glued[3] ?? "") !== "") {
    field = glued[1] ?? "";
    opRaw = glued[2] ?? "";
    inline = glued[3] ?? "";
    valueAt = at;
  } else {
    field = tokens[at] ?? "";
    opRaw = tokens[at + 1] ?? "";
    if (!new RegExp(`^${CMP_FIELD}$`).test(field) || !opOf(opRaw)) return null;
    if (tokens[at + 2] === undefined) return { error: `“${field} ${opRaw}” needs a date, a number, or text.` };
    valueAt = at + 2;
  }
  const op = opOf(opRaw);
  if (!op) return null;
  const parsed = parseValueAt(tokens, valueAt, inline);
  if ("error" in parsed) return parsed;
  const ordered = op !== "eq" && op !== "neq";
  if (ordered && parsed.value.kind === "text") {
    return { error: '> and < compare a date or a number, such as due > date(today) or price > 10.' };
  }
  return { cmp: { kind: "cmp", field, op, value: parsed.value }, end: parsed.end };
}

const CONTAINS_HINT = 'contains() needs a field and text, such as contains(status, "draft") or contains(file.name, "Graph").';

/** `contains(status, "draft")` may be one token or several. Substring, not a regex. */
function parseContainsAt(tokens: string[], at: number): CmpParse | null {
  const first = tokens[at] ?? "";
  if (!/^contains\(/i.test(first)) return null;
  let depth = 0;
  let end = at;
  const parts: string[] = [];
  for (let i = at; i < tokens.length; i++) {
    const token = tokens[i] ?? "";
    parts.push(token);
    for (const ch of token) {
      if (ch === "(") depth += 1;
      else if (ch === ")") depth -= 1;
    }
    end = i;
    if (depth <= 0) break;
  }
  if (depth !== 0) return { error: CONTAINS_HINT };
  const call = /^contains\(([\s\S]*)\)$/i.exec(parts.join(""));
  if (!call) return { error: CONTAINS_HINT };
  const inner = call[1] ?? "";
  const comma = inner.indexOf(",");
  if (comma < 0) return { error: CONTAINS_HINT };
  const field = inner.slice(0, comma).trim();
  const needle = unquote(inner.slice(comma + 1).trim());
  if (!field || !new RegExp(`^${CMP_FIELD}$`).test(field)) {
    return {
      error: `contains() does not read “${field || "that"}”. Use a frontmatter field, file.name, file.path, file.folder, file.tags, or file.mtime.`,
    };
  }
  if (!needle) return { error: 'contains() needs text to look for, such as contains(status, "draft").' };
  return { cmp: { kind: "contains", field, needle }, end };
}

function readTag(token: string): string | null {
  const hash = /^#([a-zA-Z][\w/-]*)$/.exec(token);
  if (hash) return hash[1].toLowerCase();
  const kv = /^tag:#?([a-zA-Z][\w/-]*)$/i.exec(token);
  if (kv) return kv[1].toLowerCase();
  return null;
}

function cleanPath(value: string): string {
  return value.replace(/\\/g, "/").replace(/^\/+|\/+$/g, "");
}

function readPath(token: string): string | null {
  const raw = unquote(token);
  const kv = /^(?:path|folder):([\s\S]+)$/i.exec(raw);
  if (kv) {
    const value = kv[1].trim();
    return value ? cleanPath(value) : null;
  }
  if (!raw || raw.includes(":") || raw.startsWith("#")) return null;
  if (/^(FROM|WHERE|SORT|OR|AND|ASC|DESC|LIST|TABLE)$/i.test(raw)) return null;
  return cleanPath(raw);
}

const FORMULA_HINT = 'A TABLE formula is one + - * /, such as price * 2 or file.name + " note".';

function stripTrailingComma(raw: string): string {
  return raw.trim().replace(/,+$/, "");
}

function parseAtom(raw: string): FormulaAtom | null {
  const text = stripTrailingComma(raw);
  if (!text || /^(FROM|WHERE|SORT|OR|AND|ASC|DESC|LIST|TABLE)$/i.test(text)) return null;
  const quoted = /^"([\s\S]*)"$/.exec(text) ?? /^'([\s\S]*)'$/.exec(text);
  if (quoted) return { kind: "text", text: quoted[1] ?? "" };
  if (/^-?\d+(?:\.\d+)?$/.test(text)) return { kind: "number", n: Number(text) };
  if (FILE_META.has(text.toLowerCase()) || /^[A-Za-z_][\w-]*$/.test(text)) return { kind: "field", name: text };
  return null;
}

function asFormulaOp(raw: string): FormulaOp | null {
  if (raw === "+" || raw === "-" || raw === "*" || raw === "/") return raw;
  return null;
}

function formulaColumn(left: FormulaAtom, op: FormulaOp, right: FormulaAtom): QueryColumn {
  const show = (atom: FormulaAtom) =>
    atom.kind === "text" ? `"${atom.text}"` : atom.kind === "number" ? String(atom.n) : atom.name;
  return { kind: "formula", label: `${show(left)} ${op} ${show(right)}`, left, op, right };
}

/** `price*2` or `file.name+"!"` as one token. A hyphenated key such as due-date stays a field. */
function splitGluedFormula(token: string): { left: string; op: FormulaOp; right: string } | null {
  const body = stripTrailingComma(token);
  if (!body || /\s/.test(body)) return null;
  const match = /^(file\.(?:name|path|folder|mtime|tags)|[A-Za-z_][\w-]*|-?\d+(?:\.\d+)?|"[^"]*")([+*/]|-(?=\d))([\s\S]+)$/.exec(body);
  if (!match) return null;
  const op = asFormulaOp(match[2] ?? "");
  if (!op) return null;
  return { left: match[1] ?? "", op, right: match[3] ?? "" };
}

function parseFormulaAt(tokens: string[], at: number): { col: QueryColumn; end: number } | { error: string } | null {
  const glued = splitGluedFormula(tokens[at] ?? "");
  if (glued) {
    const left = parseAtom(glued.left);
    const right = parseAtom(glued.right);
    if (!left || !right) return { error: FORMULA_HINT };
    return { col: formulaColumn(left, glued.op, right), end: at };
  }
  const left = parseAtom(tokens[at] ?? "");
  if (!left) return null;
  const opTok = tokens[at + 1] ?? "";
  const op = asFormulaOp(opTok);
  if (op) {
    if (tokens[at + 2] === undefined) return { error: FORMULA_HINT };
    const right = parseAtom(tokens[at + 2] ?? "");
    if (!right) return { error: FORMULA_HINT };
    return { col: formulaColumn(left, op, right), end: at + 2 };
  }
  const inline = /^([+*/]|-(?=\d))([\s\S]+)$/.exec(opTok);
  if (!inline) return null;
  const inlineOp = asFormulaOp(inline[1] ?? "");
  const right = inlineOp ? parseAtom(inline[2] ?? "") : null;
  if (!inlineOp || !right) return { error: FORMULA_HINT };
  return { col: formulaColumn(left, inlineOp, right), end: at + 1 };
}

export function parseNexusQuery(source: string): Parsed {
  const raw = (source || "").trim();
  if (!raw) return { kind: "help" };
  const tokens = tokenize(raw);
  if (tokens.some(unsupportedDql)) return { kind: "error", error: NEXUS_QUERY_DQL };
  const head = tokens[0]?.toUpperCase();
  if (head !== "LIST" && head !== "TABLE") {
    return {
      kind: "error",
      error: `Start with LIST or TABLE. Not Dataview. ${NEXUS_QUERY_HELP}`,
    };
  }
  let path: string | null = null;
  const tags: string[] = [];
  let tagMode: TagJoin = "or";
  let sawJoin = false;
  const columns: QueryColumn[] = [];
  let where: WhereCmp | null = null;
  let sort: QuerySort | null = null;
  let flattenLinks: "out" | "in" | null = null;

  const addColumn = (col: QueryColumn): string | null => {
    if (head !== "TABLE") return "Columns belong on TABLE. LIST shows the title and the path.";
    const join = col.kind === "field" ? linkListField(col.name) : null;
    if (join) {
      if (flattenLinks && flattenLinks !== join) {
        return "Only one FLATTEN is supported. Use file.outlinks or file.inlinks, not both.";
      }
      flattenLinks = join;
    }
    const id = col.kind === "field" ? columnKey(col.name) : col.label.toLowerCase();
    const label = col.kind === "field" ? col.name : col.label;
    const taken = columns.some((item) => (item.kind === "field" ? columnKey(item.name) : item.label.toLowerCase()) === id);
    if (taken) return `“${label}” is already a column.`;
    if (columns.length >= MAX_QUERY_COLUMNS) return `Only ${MAX_QUERY_COLUMNS} TABLE columns fit.`;
    columns.push(col);
    return null;
  };
  const addWhere = (cmp: WhereCmp): string | null => {
    if (where) return "Only one WHERE comparison is supported.";
    if (linkListField(cmp.field)) {
      if (cmp.kind === "contains") {
        where = cmp;
        return null;
      }
      return `Use contains(${cmp.field}, "…"). WHERE ${cmp.field} = "…" is not supported.`;
    }
    if (cmp.kind === "contains") {
      where = cmp;
      return null;
    }
    const key = columnKey(cmp.field);
    if (key === "tags") {
      return `WHERE compares a frontmatter field, such as status = "draft". ${cmp.field} is a column.`;
    }
    if (key === "mtime" && cmp.value.kind === "text") {
      return "file.mtime compares a date, such as file.mtime > date(today).";
    }
    where = cmp;
    return null;
  };

  const addTag = (tag: string, joined: TagJoin | null): string | null => {
    if (tags.includes(tag)) return null;
    if (tags.length && !joined) return "Put OR or AND between tags.";
    if (joined) {
      if (sawJoin && tagMode !== joined) return "Use OR or AND, not both.";
      tagMode = joined;
      sawJoin = true;
    }
    tags.push(tag);
    return null;
  };

  for (let i = 1; i < tokens.length; i++) {
    const token = tokens[i] ?? "";
    const upper = token.toUpperCase();
    if (upper === "FROM" || upper === "WHERE") {
      if (upper === "WHERE") {
        const contains = parseContainsAt(tokens, i + 1);
        if (contains && "error" in contains) return { kind: "error", error: contains.error };
        if (contains) {
          const err = addWhere(contains.cmp);
          if (err) return { kind: "error", error: err };
          i = contains.end;
          continue;
        }
        const cmp = parseCmpAt(tokens, i + 1);
        if (cmp && "error" in cmp) return { kind: "error", error: cmp.error };
        if (cmp) {
          const err = addWhere(cmp.cmp);
          if (err) return { kind: "error", error: err };
          i = cmp.end;
          continue;
        }
      }
      const scope = tokens[++i];
      if (!scope) return { kind: "error", error: `${upper} needs path: or #tag.` };
      const tag = readTag(scope);
      if (tag) {
        const err = addTag(tag, null);
        if (err) return { kind: "error", error: err };
        continue;
      }
      const nextPath = readPath(scope);
      if (nextPath) {
        if (upper === "WHERE") {
          return { kind: "error", error: 'WHERE filters a tag or a field, such as contains(file.name, "Graph") or status = "draft". Use FROM path: for a folder.' };
        }
        if (path) return { kind: "error", error: "Only one path: is supported." };
        path = nextPath;
        continue;
      }
      return { kind: "error", error: `${upper} needs path: or #tag, not “${scope}”.` };
    }
    if (upper === "OR" || upper === "AND") {
      const contains = parseContainsAt(tokens, i + 1);
      if (contains && "error" in contains) return { kind: "error", error: contains.error };
      if (contains) {
        const err = addWhere(contains.cmp);
        if (err) return { kind: "error", error: err };
        i = contains.end;
        continue;
      }
      const cmp = parseCmpAt(tokens, i + 1);
      if (cmp && "error" in cmp) return { kind: "error", error: cmp.error };
      if (cmp) {
        const err = addWhere(cmp.cmp);
        if (err) return { kind: "error", error: err };
        i = cmp.end;
        continue;
      }
      const scope = tokens[++i];
      const tag = scope ? readTag(scope) : null;
      if (!tag) return { kind: "error", error: `${upper} needs a tag, such as #idea.` };
      const err = addTag(tag, upper === "OR" ? "or" : "and");
      if (err) return { kind: "error", error: err };
      continue;
    }
    if (upper === "FLATTEN") {
      const what = (tokens[++i] || "").toLowerCase();
      const join = linkListField(what);
      if (!join) {
        return { kind: "error", error: "FLATTEN file.outlinks or FLATTEN file.inlinks lists one row per link." };
      }
      if (flattenLinks) return { kind: "error", error: "Only one FLATTEN is supported." };
      flattenLinks = join;
      continue;
    }
    if (upper === "SORT") {
      const keyRaw = (tokens[++i] || "").toLowerCase();
      const key = keyRaw === "file.mtime" ? "mtime" : keyRaw === "file.name" || keyRaw === "name" ? "title" : keyRaw;
      if (key !== "title" && key !== "mtime") {
        return { kind: "error", error: "SORT title or SORT mtime. asc or desc follows." };
      }
      let dir: "asc" | "desc" = "asc";
      const maybe = tokens[i + 1];
      if (maybe && /^(asc|desc)$/i.test(maybe)) {
        dir = maybe.toLowerCase() === "desc" ? "desc" : "asc";
        i += 1;
      }
      if (sort) return { kind: "error", error: "Only one SORT is supported." };
      sort = { key, dir };
      continue;
    }
    const tag = readTag(token);
    if (tag) {
      const err = addTag(tag, null);
      if (err) return { kind: "error", error: err };
      continue;
    }
    const nextPath = readPath(token);
    if (nextPath && /^(?:path|folder):/i.test(token)) {
      if (path) return { kind: "error", error: "Only one path: is supported." };
      path = nextPath;
      continue;
    }
    const fieldMatch = /^field:([\s\S]+)$/i.exec(token);
    if (fieldMatch) {
      const value = (fieldMatch[1] ?? "").trim();
      if (!value) return { kind: "error", error: "field: needs a value." };
      const err = addColumn({ kind: "field", name: value });
      if (err) return { kind: "error", error: err };
      continue;
    }
    const formula = parseFormulaAt(tokens, i);
    if (formula && "error" in formula) return { kind: "error", error: formula.error };
    if (formula) {
      const err = addColumn(formula.col);
      if (err) return { kind: "error", error: err };
      i = formula.end;
      continue;
    }
    const cols = columnParts(token);
    if (cols && !/^(?:path|folder):/i.test(token)) {
      for (const name of cols) {
        const err = addColumn({ kind: "field", name });
        if (err) return { kind: "error", error: err };
      }
      continue;
    }
    if (token === "+" || token === "-" || token === "*" || token === "/") {
      return { kind: "error", error: FORMULA_HINT };
    }
    return {
      kind: "error",
      error: `Unknown “${token}”. ${NEXUS_QUERY_HELP}`,
    };
  }
  if (!path && tags.length === 0) {
    return {
      kind: "error",
      error: "Add FROM path: or FROM #tag so the list stays on one folder or tag.",
    };
  }
  if (flattenLinks === "out" && !columns.some((col) => col.kind === "field" && linkListField(col.name) === "out")) {
    columns.push({ kind: "field", name: "file.outlinks" });
  }
  if (flattenLinks === "in" && !columns.some((col) => col.kind === "field" && linkListField(col.name) === "in")) {
    columns.push({ kind: "field", name: "file.inlinks" });
  }
  return {
    kind: "ok",
    mode: head === "LIST" ? "list" : "table",
    path,
    tags,
    tagMode,
    columns,
    where,
    sort,
    flattenLinks,
  };
}

function pathHasPrefix(path: string, prefix: string): boolean {
  const p = path.replace(/\\/g, "/").toLowerCase();
  const pre = prefix.replace(/\\/g, "/").replace(/^\/+|\/+$/g, "").toLowerCase();
  if (!pre) return false;
  if (p === pre) return true;
  if (p.startsWith(pre + "/")) return true;
  const next = p.charAt(pre.length);
  return p.startsWith(pre) && (next === " " || next === ".");
}

function tagsOf(node: VaultNode): string[] {
  if (node.kind !== "note") return [];
  const tags = new Set<string>();
  if (typeof node.content === "string") {
    for (const tag of extractTagsFromMarkdown(node.content)) tags.add(tag);
  }
  const meta = getDurableIndex()?.getNoteMeta(node.id);
  for (const tag of meta?.tags ?? []) tags.add(tag.toLowerCase());
  return [...tags];
}

/** notesForTag plus tags stored on the durable index (sqlite tag_map mirror). */
function notesForTagJoined(nodes: Record<string, VaultNode>, tag: string): VaultNode[] {
  const out = notesForTag(nodes, tag);
  const idx = getDurableIndex();
  if (!idx?.ready) return out;
  const needle = tag.replace(/^#/, "").toLowerCase();
  const seen = new Set(out.map((n) => n.id));
  for (const meta of idx.listNoteMeta()) {
    if (!meta?.id || seen.has(meta.id) || meta.kind === "folder") continue;
    if (!meta.tags?.some((t) => t.toLowerCase() === needle)) continue;
    const node = nodes[meta.id];
    if (node?.kind !== "note") continue;
    seen.add(node.id);
    out.push(node);
  }
  return out;
}

export function joinTaggedNotes(lists: VaultNode[][], mode: TagJoin): VaultNode[] {
  if (!lists.length) return [];
  if (mode === "and") {
    const sets = lists.map((list) => new Set(list.map((n) => n.id)));
    let smallest = lists[0] ?? [];
    for (const list of lists) if (list.length < smallest.length) smallest = list;
    return smallest.filter((n) => sets.every((set) => set.has(n.id)));
  }
  const seen = new Set<string>();
  const out: VaultNode[] = [];
  for (const list of lists) {
    for (const note of list) {
      if (!note || seen.has(note.id)) continue;
      seen.add(note.id);
      out.push(note);
    }
  }
  return out;
}

function formatMtime(mtime: number): string {
  if (!mtime) return "—";
  const d = new Date(mtime);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toISOString().slice(0, 16).replace("T", " ");
}

function hasTags(node: VaultNode, tags: string[], mode: TagJoin): boolean {
  if (!tags.length) return true;
  const have = tagsOf(node);
  if (mode === "and") return tags.every((tag) => have.includes(tag));
  return tags.some((tag) => have.includes(tag));
}

function frontmatterProps(content: string): Record<string, string> {
  const { yaml } = splitFrontmatter(content);
  if (!yaml) return {};
  const props: Record<string, string> = {};
  for (const field of parseFrontmatterFields(yaml)) {
    const value = field.value.replace(/^['"]|['"]$/g, "").trim();
    if (value) props[field.key.toLowerCase()] = value;
  }
  return props;
}

function folderOf(path: string): string {
  const i = path.lastIndexOf("/");
  return i <= 0 ? "" : path.slice(0, i);
}

/** A frontmatter value, or null when the note body is not loaded. File columns never need the body. */
function fieldActual(node: VaultNode, field: string): string | null {
  const key = columnKey(field);
  if (key === "tags") return tagsOf(node).join(", ");
  if (key === "mtime") return formatMtime(node.mtime);
  if (key === "file.name") return noteTitle(node);
  if (key === "file.path") return node.path;
  if (key === "file.folder") return folderOf(node.path);
  if (typeof node.content !== "string") return null;
  return frontmatterProps(node.content)[key] ?? "";
}

function startOfUtcDay(ms: number): number {
  const d = new Date(ms);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

function ymdToMs(text: string): number | null {
  const match = /^(\d{4}-\d{2}-\d{2})/.exec(text.trim());
  if (!match || !validYmd(match[1] ?? "")) return null;
  const day = match[1] ?? "";
  return Date.UTC(Number(day.slice(0, 4)), Number(day.slice(5, 7)) - 1, Number(day.slice(8, 10)));
}

function dateValueMs(value: Extract<WhereValue, { kind: "date" }>, now: number): number {
  const base = value.day === "today" ? startOfUtcDay(now) : ymdToMs(value.day) ?? startOfUtcDay(now);
  return base + value.shiftDays * DAY_MS;
}

function numericActual(text: string): number | null {
  const trimmed = text.trim();
  if (!/^-?\d+(?:\.\d+)?$/.test(trimmed)) return null;
  const n = Number(trimmed);
  return Number.isFinite(n) ? n : null;
}

function ordered(left: number, right: number, op: WhereOp): boolean {
  if (op === "gt") return left > right;
  if (op === "lt") return left < right;
  if (op === "gte") return left >= right;
  if (op === "lte") return left <= right;
  if (op === "eq") return left === right;
  return left !== right;
}

type LinkScan = {
  index: Map<string, string>;
  incoming: Map<string, string[]>;
  incomingUnloaded: number;
};

/** Indexes for one query. Built only when WHERE or FLATTEN reads links. */
function scanLinks(nodes: Record<string, VaultNode>, need: { out: boolean; inn: boolean }): LinkScan {
  const index = need.out ? noteLinkIndex(nodes) : new Map();
  if (!need.inn) return { index, incoming: new Map(), incomingUnloaded: 0 };
  const incoming = incomingByTarget(nodes);
  return { index, incoming: incoming.byId, incomingUnloaded: incoming.unloaded };
}

function whereMatch(
  node: VaultNode,
  where: WhereCmp,
  now: number,
  nodes?: Record<string, VaultNode>,
  links?: LinkScan | null,
): "yes" | "no" | "unloaded" {
  if (where.kind === "contains" && nodes && links) {
    const join = linkListField(where.field);
    if (join === "out") {
      if (typeof node.content !== "string") return "unloaded";
      const labels = outgoingJoinLabels(node, nodes, links.index);
      return labels.some((label) => label === where.needle) ? "yes" : "no";
    }
    if (join === "in") {
      const labels = links.incoming.get(node.id) ?? [];
      return labels.some((label) => label === where.needle) ? "yes" : "no";
    }
  }
  if (where.kind === "contains") {
    const actual = fieldActual(node, where.field);
    if (actual === null) return "unloaded";
    return actual.includes(where.needle) ? "yes" : "no";
  }
  const key = columnKey(where.field);
  if (key === "mtime" && where.value.kind !== "text") {
    if (where.value.kind === "date") {
      return ordered(startOfUtcDay(node.mtime || 0), dateValueMs(where.value, now), where.op) ? "yes" : "no";
    }
    return ordered(node.mtime || 0, where.value.n, where.op) ? "yes" : "no";
  }
  const actual = fieldActual(node, where.field);
  if (actual === null) return "unloaded";
  if (where.value.kind === "text") {
    const eq = actual === where.value.text;
    return (where.op === "eq" ? eq : !eq) ? "yes" : "no";
  }
  if (where.value.kind === "number") {
    const n = numericActual(actual);
    if (where.op === "eq") return n === where.value.n ? "yes" : "no";
    if (where.op === "neq") return n === where.value.n ? "no" : "yes";
    if (n === null) return "no";
    return ordered(n, where.value.n, where.op) ? "yes" : "no";
  }
  const day = ymdToMs(actual);
  if (day === null) return where.op === "neq" ? "yes" : "no";
  return ordered(day, dateValueMs(where.value, now), where.op) ? "yes" : "no";
}

function formatNum(n: number): string {
  if (!Number.isFinite(n)) return "—";
  const rounded = Math.round(n * 1000) / 1000;
  return String(rounded);
}

function formulaText(node: VaultNode, column: Extract<QueryColumn, { kind: "formula" }>): string {
  const read = (atom: FormulaAtom): { kind: "num"; n: number } | { kind: "text"; text: string } | { kind: "blank" } | { kind: "missing" } => {
    if (atom.kind === "number") return { kind: "num", n: atom.n };
    if (atom.kind === "text") return { kind: "text", text: atom.text };
    const actual = fieldActual(node, atom.name);
    if (actual === null) return { kind: "missing" };
    if (!actual) return { kind: "blank" };
    const n = numericActual(actual);
    if (n !== null) return { kind: "num", n };
    return { kind: "text", text: actual };
  };
  const left = read(column.left);
  const right = read(column.right);
  if (left.kind === "missing" || right.kind === "missing") return "—";
  if (column.op === "+") {
    if (left.kind === "num" && right.kind === "num") return formatNum(left.n + right.n);
    if (left.kind === "text" || right.kind === "text") {
      const show = (side: typeof left) => (side.kind === "text" ? side.text : side.kind === "num" ? formatNum(side.n) : "");
      return show(left) + show(right);
    }
    return "—";
  }
  if (left.kind !== "num" || right.kind !== "num") return "—";
  if (column.op === "-") return formatNum(left.n - right.n);
  if (column.op === "*") return formatNum(left.n * right.n);
  if (right.n === 0) return "—";
  return formatNum(left.n / right.n);
}

function noteLinkIndex(nodes: Record<string, VaultNode>): Map<string, string> {
  const index = new Map<string, string>();
  const put = (key: string, id: string) => {
    if (key && !index.has(key)) index.set(key, id);
  };
  for (const node of Object.values(nodes)) {
    if (node.kind !== "note") continue;
    put(normalizeLinkTarget(noteTitle(node)), node.id);
    put(normalizeLinkTarget(node.name), node.id);
    put(normalizeLinkTarget(node.path.replace(/\.md$/i, "")), node.id);
    put(normalizeLinkTarget(node.path), node.id);
  }
  return index;
}

/**
 * Incoming titles for each target id, from loaded note bodies.
 * A note with no body is counted and skipped. Same-note and heading-only links are not rows.
 */
function incomingByTarget(nodes: Record<string, VaultNode>): { byId: Map<string, string[]>; unloaded: number } {
  const index = noteLinkIndex(nodes);
  const byId = new Map<string, string[]>();
  const seen = new Map<string, Set<string>>();
  let unloaded = 0;
  const sources = Object.values(nodes)
    .filter((node) => node.kind === "note")
    .sort((a, b) => noteTitle(a).localeCompare(noteTitle(b)) || a.path.localeCompare(b.path));
  for (const source of sources) {
    if (typeof source.content !== "string") {
      unloaded += 1;
      continue;
    }
    const title = noteTitle(source);
    const local = new Set<string>();
    for (const link of extractWikilinks(source.content)) {
      if (!link.noteTarget) continue;
      const key = normalizeLinkTarget(link.noteTarget);
      if (!key || local.has(key)) continue;
      local.add(key);
      const id = index.get(key);
      const hit = id ? nodes[id] : undefined;
      if (!hit || hit.kind !== "note" || hit.id === source.id) continue;
      let bag = seen.get(hit.id);
      if (!bag) {
        bag = new Set();
        seen.set(hit.id, bag);
        byId.set(hit.id, []);
      }
      if (bag.has(source.id)) continue;
      bag.add(source.id);
      byId.get(hit.id)?.push(title);
    }
  }
  return { byId, unloaded };
}

/** One label per outgoing note link, in the order written. Same-note headings are not rows. */
function outgoingJoinLabels(node: VaultNode, nodes: Record<string, VaultNode>, index: Map<string, string>): string[] {
  if (typeof node.content !== "string") return [];
  const labels: string[] = [];
  const seen = new Set<string>();
  for (const link of extractWikilinks(node.content)) {
    if (!link.noteTarget) continue;
    const key = normalizeLinkTarget(link.noteTarget);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    const id = index.get(key);
    const hit = id ? nodes[id] : null;
    if (hit?.kind === "note") {
      if (hit.id === node.id) continue;
      labels.push(noteTitle(hit));
      continue;
    }
    labels.push(link.alias || link.noteTarget);
  }
  return labels;
}

function rowFrom(node: VaultNode, columns: QueryColumn[], link: string | null): NexusQueryRow {
  const fields = columns.map((column) => {
    if (column.kind === "field" && linkListField(column.name)) {
      return { name: column.name, value: link || "—" };
    }
    if (column.kind === "formula") return { name: column.label, value: formulaText(node, column) || "—" };
    const value = fieldActual(node, column.name);
    return { name: column.name, value: value ? value : "—" };
  });
  const tags = fields.find((field) => columnKey(field.name) === "tags");
  const mtime = fields.find((field) => columnKey(field.name) === "mtime");
  return {
    id: node.id,
    title: noteTitle(node),
    path: node.path,
    tags: tags ? tags.value : null,
    mtime: mtime ? mtime.value : null,
    fields,
    link,
  };
}

/**
 * Folder that contains this prefix, walking the child index (not every note).
 * `folderId` null means the prefix names nothing in the tree.
 */
function resolveFolder(
  nodes: Record<string, VaultNode>,
  prefix: string,
): string | null {
  const idx = ensureVaultIndex(nodes);
  idx.getIdByPath(nodes, prefix);
  const parts = prefix.split("/").filter(Boolean);
  let parentId: string | null = null;
  let matched = false;
  for (let i = 0; i < parts.length; i++) {
    const seg = parts[i].toLowerCase();
    const kids = idx.getChildIds(parentId);
    let folder: VaultNode | null = null;
    for (const id of kids) {
      const n = nodes[id];
      if (n?.kind === "folder" && n.name.toLowerCase() === seg) {
        folder = n;
        break;
      }
    }
    if (!folder) return matched ? parentId : null;
    parentId = folder.id;
    matched = true;
  }
  return parentId;
}

function collectInFolder(
  nodes: Record<string, VaultNode>,
  folderId: string,
  prefix: string,
  tags: string[],
  tagMode: TagJoin,
  where: WhereCmp | null,
  now: number,
  links: LinkScan | null = null,
): { notes: VaultNode[]; truncated: boolean; budgetHit: boolean; unloaded: number } {
  const idx = ensureVaultIndex(nodes);
  idx.getIdByPath(nodes, prefix);
  const notes: VaultNode[] = [];
  const stack = [...idx.getChildIds(folderId)];
  let visits = 0;
  let budgetHit = false;
  let unloaded = 0;
  while (stack.length) {
    const id = stack.pop();
    if (!id) break;
    visits += 1;
    if (visits > VISIT_BUDGET) {
      budgetHit = true;
      break;
    }
    const node = nodes[id];
    if (!node) continue;
    if (node.kind === "folder") {
      const kids = idx.getChildIds(node.id);
      for (let i = kids.length - 1; i >= 0; i--) stack.push(kids[i]);
      continue;
    }
    if (!pathHasPrefix(node.path, prefix)) continue;
    if (!hasTags(node, tags, tagMode)) continue;
    if (where) {
      const match = whereMatch(node, where, now, nodes, links);
      if (match === "unloaded") {
        unloaded += 1;
        continue;
      }
      if (match === "no") continue;
    }
    notes.push(node);
  }
  return { notes, truncated: false, budgetHit, unloaded };
}

export function runNexusQuery(
  source: string,
  nodes: Record<string, VaultNode>,
  /**
   * One list per parsed tag, from sqlite tag_map.
   * `null` slot: that page failed. `[]`: the tag has no notes.
   */
  tagExtras?: (VaultNode[] | null)[] | null,
  now = Date.now(),
): NexusQueryModel {
  const footer = NEXUS_QUERY_FOOTER;
  const parsed = parseNexusQuery(source);
  if (parsed.kind === "help") {
    return {
      footer,
      help: NEXUS_QUERY_HELP,
      error: null,
      mode: null,
      rows: [],
      truncated: false,
      scanNote: null,
      fieldNote: null,
    };
  }
  if (parsed.kind === "error") {
    return {
      footer,
      help: null,
      error: parsed.error,
      mode: null,
      rows: [],
      truncated: false,
      scanNote: null,
      fieldNote: null,
    };
  }

  let fieldNote: string | null = null;
  let notes: VaultNode[] = [];
  let budgetHit = false;
  let unloaded = 0;
  let tagsIncomplete = false;
  const whereJoin = parsed.where?.kind === "contains" ? linkListField(parsed.where.field) : null;
  const linkScan =
    parsed.flattenLinks || whereJoin
      ? scanLinks(nodes, {
          out: parsed.flattenLinks === "out" || whereJoin === "out",
          inn: parsed.flattenLinks === "in" || whereJoin === "in",
        })
      : null;
  if (parsed.path) {
    const folderId = resolveFolder(nodes, parsed.path);
    if (!folderId) {
      return {
        footer,
        help: null,
        error: `No folder matches path:${parsed.path}. Use a folder from the file list.`,
        mode: parsed.mode,
        rows: [],
        truncated: false,
        scanNote: null,
        fieldNote: null,
      };
    }
    const collected = collectInFolder(nodes, folderId, parsed.path, parsed.tags, parsed.tagMode, parsed.where, now, linkScan);
    notes = collected.notes;
    budgetHit = collected.budgetHit;
    unloaded = collected.unloaded;
  } else if (parsed.tags.length) {
    const failed = parsed.tags.map((_, i) => tagExtras != null && tagExtras[i] == null);
    tagsIncomplete = failed.some(Boolean);
    if (parsed.tagMode === "and" && tagsIncomplete) {
      notes = joinTaggedNotes(
        parsed.tags.map((tag) => notesForTagJoined(nodes, tag)),
        "and",
      );
    } else {
      notes = joinTaggedNotes(
        parsed.tags.map((tag, i) => {
          const mem = notesForTagJoined(nodes, tag);
          const extra = tagExtras?.[i];
          if (extra == null) return mem;
          return joinTaggedNotes([mem, extra], "or");
        }),
        parsed.tagMode,
      );
    }
    if (parsed.where) {
      const kept: VaultNode[] = [];
      for (const note of notes) {
        const match = whereMatch(note, parsed.where, now, nodes, linkScan);
        if (match === "unloaded") unloaded += 1;
        else if (match === "yes") kept.push(note);
      }
      notes = kept;
    }
  }

  const dir = parsed.sort?.dir === "desc" ? -1 : 1;
  const sortKey = parsed.sort?.key ?? "title";
  notes.sort((a, b) => {
    if (sortKey === "mtime") {
      const delta = (a.mtime || 0) - (b.mtime || 0);
      if (delta) return delta * dir;
    }
    return noteTitle(a).localeCompare(noteTitle(b)) * dir || a.path.localeCompare(b.path) * dir;
  });
  let linkUnloaded = 0;
  let joined: { node: VaultNode; link: string | null }[];
  if (parsed.flattenLinks === "out" && linkScan) {
    joined = [];
    for (const node of notes) {
      if (typeof node.content !== "string") {
        linkUnloaded += 1;
        continue;
      }
      for (const label of outgoingJoinLabels(node, nodes, linkScan.index)) joined.push({ node, link: label });
    }
  } else if (parsed.flattenLinks === "in" && linkScan) {
    linkUnloaded = linkScan.incomingUnloaded;
    joined = [];
    for (const node of notes) {
      for (const label of linkScan.incoming.get(node.id) ?? []) joined.push({ node, link: label });
    }
  } else {
    if (whereJoin === "in" && linkScan) linkUnloaded = linkScan.incomingUnloaded;
    joined = notes.map((node) => ({ node, link: null }));
  }
  const truncated = joined.length > NEXUS_QUERY_CAP;
  const rows = joined.slice(0, NEXUS_QUERY_CAP).map((item) => rowFrom(item.node, parsed.columns, item.link));
  if (linkUnloaded) unloaded += linkUnloaded;
  const frontmatterCols = parsed.columns.flatMap((column) => {
    if (column.kind !== "field") return [];
    const key = columnKey(column.name);
    if (key === "tags" || key === "mtime" || key.startsWith("file.")) return [];
    return [column.name];
  });
  if (unloaded && linkUnloaded === unloaded) {
    fieldNote = `${linkUnloaded} ${linkUnloaded === 1 ? "note is" : "notes are"} not loaded, so ${linkUnloaded === 1 ? "its links were" : "their links were"} left out.`;
  } else if (unloaded) {
    fieldNote = `${unloaded} ${unloaded === 1 ? "note is" : "notes are"} not loaded, so a field comparison left ${unloaded === 1 ? "it" : "them"} out and empty fields show —.`;
  } else if (rows.length && frontmatterCols.length) {
    const missing = frontmatterCols.filter((name) => rows.every((row) => row.fields.find((field) => field.name === name)?.value === "—"));
    if (missing.length) {
      fieldNote = `No loaded note has ${missing.map((name) => `“${name}”`).join(" or ")} in its frontmatter.`;
    }
  }
  return {
    footer,
    help: null,
    error: null,
    mode: parsed.mode,
    rows,
    truncated,
    scanNote: budgetHit
      ? `Stopped while reading this folder (${VISIT_BUDGET} files). Narrow with tag:.`
      : tagsIncomplete && notes.length === 0
        ? "Couldn't read every tag from the index."
        : parsed.flattenLinks && notes.length > 0 && joined.length === 0 && !linkUnloaded
          ? parsed.flattenLinks === "in"
            ? "No incoming links in these notes."
            : "No outgoing links in these notes."
          : null,
    fieldNote,
    tagsIncomplete,
  };
}
