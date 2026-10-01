/**
 * Built-in note list for one fenced block.
 * LIST or TABLE, FROM a folder or tag, WHERE on one field,
 * including date(), > < comparisons, and contains(), TABLE columns from frontmatter,
 * tags joined by OR or AND, SORT title|mtime.
 * Not full Dataview: no joins, no formulas.
 */

import { parseFrontmatterFields, splitFrontmatter } from "@/lib/editor/frontmatter";
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
  "Built-in list. Not Dataview — no joins, no formulas.";

export const NEXUS_QUERY_HELP =
  'LIST or TABLE. FROM path:Journal, FROM "Journal", or FROM #tag. WHERE status = "draft", WHERE contains(file.name, "Graph"), WHERE due > date(today), or WHERE price > 10. contains() is a case-sensitive substring. file.mtime >= date(today) - 7d. TABLE status, due or field:mtime. Tags: #a OR #b, or #a AND #b. SORT title or SORT mtime, asc or desc.';

export const NEXUS_QUERY_DQL =
  'This block is not Dataview. No joins, no formulas. Use LIST or TABLE, FROM path: or FROM #tag, WHERE contains(status, "draft") or WHERE field = "value", and SORT title or SORT mtime.';

export type NexusQueryField = { name: string; value: string };

export type NexusQueryRow = {
  id: string;
  title: string;
  path: string;
  /** Set only when the TABLE asked for the tags column. */
  tags: string | null;
  /** Set only when the TABLE asked for mtime, which lives on each note. */
  mtime: string | null;
  /** TABLE columns in the order they were written. Empty for LIST. */
  fields: NexusQueryField[];
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

type Parsed =
  | { kind: "help" }
  | { kind: "error"; error: string }
  | {
      kind: "ok";
      mode: "list" | "table";
      path: string | null;
      tags: string[];
      tagMode: TagJoin;
      columns: string[];
      where: WhereCmp | null;
      sort: QuerySort | null;
    };

const FILE_META = new Set(["file.name", "file.path", "file.folder", "file.mtime", "file.tags"]);

function tokenize(source: string): string[] {
  const out: string[] = [];
  const re = /"([^"]*)"|(\S+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(source))) out.push((m[1] ?? m[2] ?? "").trim());
  return out.filter(Boolean);
}

function unsupportedDql(token: string): boolean {
  if (/^(file|this)\./i.test(token) && !FILE_META.has(token.toLowerCase())) return true;
  if (/choice\s*\(/i.test(token)) return true;
  if (/^(FLATTEN|GROUP|LIMIT)$/i.test(token)) return true;
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
  return name;
}

function columnParts(token: string): string[] | null {
  const parts = token.split(",").map((part) => part.trim()).filter(Boolean);
  if (!parts.length) return null;
  const ok = parts.every((part) => FILE_META.has(part.toLowerCase()) || /^[A-Za-z_][\w-]*$/.test(part));
  return ok ? parts : null;
}

const CMP_FIELD = "(?:file\\.(?:name|path|folder|mtime|tags)|[A-Za-z_][\\w-]*)";
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
  const kv = /^(?:path|folder):([\s\S]+)$/i.exec(token);
  if (kv) {
    const value = kv[1].trim();
    return value ? cleanPath(value) : null;
  }
  if (!token || token.includes(":") || token.startsWith("#")) return null;
  if (/^(FROM|WHERE|SORT|OR|AND|ASC|DESC|LIST|TABLE)$/i.test(token)) return null;
  return cleanPath(token);
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
  const columns: string[] = [];
  let where: WhereCmp | null = null;
  let sort: QuerySort | null = null;

  const addColumn = (name: string): string | null => {
    if (head !== "TABLE") return "Columns belong on TABLE. LIST shows the title and the path.";
    if (columns.some((col) => columnKey(col) === columnKey(name))) return `“${name}” is already a column.`;
    if (columns.length >= MAX_QUERY_COLUMNS) return `Only ${MAX_QUERY_COLUMNS} TABLE columns fit.`;
    columns.push(name);
    return null;
  };
  const addWhere = (cmp: WhereCmp): string | null => {
    if (where) return "Only one WHERE comparison is supported.";
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
      const err = addColumn(value);
      if (err) return { kind: "error", error: err };
      continue;
    }
    const cols = columnParts(token);
    if (cols && !/^(?:path|folder):/i.test(token)) {
      for (const name of cols) {
        const err = addColumn(name);
        if (err) return { kind: "error", error: err };
      }
      continue;
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
  return {
    kind: "ok",
    mode: head === "LIST" ? "list" : "table",
    path,
    tags,
    tagMode,
    columns,
    where,
    sort,
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

function whereMatch(node: VaultNode, where: WhereCmp, now: number): "yes" | "no" | "unloaded" {
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

function rowFrom(node: VaultNode, columns: string[]): NexusQueryRow {
  const fields = columns.map((name) => {
    const value = fieldActual(node, name);
    return { name, value: value ? value : "—" };
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
      const match = whereMatch(node, where, now);
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
    const collected = collectInFolder(nodes, folderId, parsed.path, parsed.tags, parsed.tagMode, parsed.where, now);
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
        const match = whereMatch(note, parsed.where, now);
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
  const truncated = notes.length > NEXUS_QUERY_CAP;
  const rows = notes.slice(0, NEXUS_QUERY_CAP).map((n) => rowFrom(n, parsed.columns));
  const frontmatterCols = parsed.columns.filter((name) => {
    const key = columnKey(name);
    return key !== "tags" && key !== "mtime" && !key.startsWith("file.");
  });
  if (unloaded) {
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
        : null,
    fieldNote,
    tagsIncomplete,
  };
}
