import { applyFrontmatter, parseFrontmatterFields, splitFrontmatter } from "@/lib/editor/frontmatter";
import { isCanvasPath } from "@/lib/vault/canvas";

export type NoteTableSource = {
  id: string;
  path: string;
  name: string;
  content?: string | null;
  mtime?: number;
};

export type NoteLink = { id: string | null; title: string };

export type NoteTableRow = {
  id: string;
  name: string;
  path: string;
  folder: string;
  mtime: number;
  props: Record<string, string>;
  /** Wikilink or note-path values in each property, when the value points at notes. */
  links: Record<string, NoteLink[]>;
  /** Result of the view formula. Empty when the view has no formula. */
  formula: string;
};

export type BasesViewConfig = {
  id: "all" | "saved";
  name: string;
  query: string;
  folder: string;
  column: string;
  dir: "asc" | "desc";
  formula: string;
  /** Property columns to keep. Empty means every detected key. */
  columns: string[];
  /** Frontmatter keys stored as note links ([[Title]]). */
  relations: string[];
};

/** Vault file for the saved table. Not an Obsidian .base file. */
export const NOTE_TABLE_FILE = ".nexus/note-table.json";

export type BasesSession = {
  activeId: "all" | "saved";
  views: BasesViewConfig[];
};

const MAX_ROWS = 400;
const MAX_KEYS = 6;

export function noteTableTitle(name: string): string {
  return name.replace(/\.canvas$/i, "").replace(/\.md$/i, "").trim() || name;
}

export function noteTableFolder(path: string): string {
  const i = path.lastIndexOf("/");
  return i <= 0 ? "" : path.slice(0, i);
}

/** Targets inside a property: [[Note]], [[Note|label]], or a note path. */
export function relationTargets(value: string): string[] {
  const found: string[] = [];
  const re = /\[\[([^\]|#]+)(?:#[^\]|]*)?(?:\|[^\]]*)?\]\]/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(value))) {
    const target = (match[1] || "").trim();
    if (target) found.push(target);
  }
  if (found.length) return found;
  const plain = value.trim();
  if (!plain) return [];
  if (plain.includes("/") || /\.md$/i.test(plain)) return [plain.replace(/\.md$/i, "")];
  return [];
}

export function resolveNoteLink(
  target: string,
  notes: { id: string; path: string; name: string }[],
): NoteLink {
  const needle = target.replace(/\\/g, "/").replace(/\.md$/i, "").trim().toLowerCase();
  const base = needle.split("/").pop() || needle;
  const hit = notes.find((note) => {
    const path = note.path.replace(/\\/g, "/").replace(/\.md$/i, "").toLowerCase();
    const name = (note.name || "").replace(/\.md$/i, "").toLowerCase();
    return path === needle || path.endsWith(`/${needle}`) || name === base || path.endsWith(`/${base}`);
  });
  const title = hit ? noteTableTitle(hit.name || hit.path) : noteTableTitle(base);
  return { id: hit?.id ?? null, title };
}

export function noteTableProperties(content: string | null | undefined): Record<string, string> {
  if (!content) return {};
  const { yaml } = splitFrontmatter(content);
  if (!yaml) return {};
  const props: Record<string, string> = {};
  for (const field of parseFrontmatterFields(yaml)) {
    const value = field.value.replace(/^['"]|['"]$/g, "").trim();
    if (!value) continue;
    props[field.key] = value;
  }
  return props;
}

export function defaultBasesSession(): BasesSession {
  return {
    activeId: "all",
    views: [
      {
        id: "all",
        name: "All notes",
        query: "",
        folder: "",
        column: "name",
        dir: "asc",
        formula: "file.mtime",
        columns: [],
        relations: [],
      },
      {
        id: "saved",
        name: "Saved view",
        query: "",
        folder: "",
        column: "name",
        dir: "asc",
        formula: 'if(status, status, "—")',
        columns: [],
        relations: ["related"],
      },
    ],
  };
}

function asView(raw: unknown, fallback: BasesViewConfig): BasesViewConfig {
  const row = raw && typeof raw === "object" ? (raw as Partial<BasesViewConfig>) : {};
  return {
    id: fallback.id,
    name: typeof row.name === "string" && row.name.trim() ? row.name : fallback.name,
    query: typeof row.query === "string" ? row.query : fallback.query,
    folder: typeof row.folder === "string" ? row.folder : fallback.folder,
    column: typeof row.column === "string" && row.column ? row.column : fallback.column,
    dir: row.dir === "desc" ? "desc" : "asc",
    formula: typeof row.formula === "string" ? row.formula : fallback.formula,
    columns: Array.isArray(row.columns)
      ? row.columns.filter((key): key is string => typeof key === "string" && key.trim().length > 0)
      : fallback.columns,
    relations: Array.isArray(row.relations)
      ? row.relations.filter((key): key is string => typeof key === "string" && /^[A-Za-z_][\w-]*$/.test(key))
      : fallback.relations,
  };
}

/** Write one note-link onto a frontmatter property. Other fields and the body stay. */
export function withNoteRelation(content: string, key: string, title: string): string {
  const name = title.trim();
  if (!/^[A-Za-z_][\w-]*$/.test(key) || !name) return content;
  const { yaml } = splitFrontmatter(content || "");
  const fields = yaml ? parseFrontmatterFields(yaml) : [];
  const current = fields.find((field) => field.key === key)?.value ?? "";
  const titles = relationTargets(current).map((target) => target.split("/").pop() || target);
  if (!titles.some((item) => item.toLowerCase() === name.toLowerCase())) titles.push(name);
  const value = titles.map((item) => `[[${item}]]`).join(" ");
  const next = fields.filter((field) => field.key !== key);
  next.push({ key, value });
  return applyFrontmatter(content || "", next);
}

export function serializeNoteTableFile(session: BasesSession): string {
  return `${JSON.stringify({ kind: "nexus-note-table", ...session }, null, 2)}\n`;
}

/** Session views. An older single-view blob stays on All notes. */
export function parseBasesSession(raw: string | null): BasesSession {
  const base = defaultBasesSession();
  if (!raw) return base;
  try {
    const parsed = JSON.parse(raw) as Partial<BasesSession> & Partial<BasesViewConfig>;
    if (Array.isArray(parsed.views)) {
      const all = asView(parsed.views.find((v) => v && v.id === "all") ?? parsed.views[0], base.views[0]);
      const saved = asView(parsed.views.find((v) => v && v.id === "saved") ?? parsed.views[1], base.views[1]);
      all.id = "all";
      saved.id = "saved";
      return {
        activeId: parsed.activeId === "saved" ? "saved" : "all",
        views: [all, saved],
      };
    }
    if (typeof parsed.query === "string" || typeof parsed.folder === "string") {
      base.views[0] = asView(parsed, base.views[0]);
      base.views[0].id = "all";
      base.views[0].formula = base.views[0].formula || "file.mtime";
    }
  } catch {
    /* keep defaults */
  }
  return base;
}

type FormulaNode =
  | { kind: "file"; key: "mtime" | "name" | "folder" | "path" }
  | { kind: "prop"; key: string }
  | { kind: "text"; value: string }
  | { kind: "concat"; parts: FormulaNode[] }
  | { kind: "if"; cond: FormulaNode; yes: FormulaNode; no: FormulaNode }
  | { kind: "empty"; inner: FormulaNode };

function lexFormula(source: string): { tokens: string[] } | { error: string } {
  const tokens: string[] = [];
  let i = 0;
  while (i < source.length) {
    const ch = source[i] ?? "";
    if (/\s/.test(ch)) {
      i += 1;
      continue;
    }
    if (source.startsWith("file.", i)) {
      const m = /^file\.(mtime|name|folder|path)/.exec(source.slice(i));
      if (!m) return { error: "file. needs mtime, name, folder, or path." };
      tokens.push(m[0]);
      i += m[0].length;
      continue;
    }
    if (ch === '"' || ch === "'") {
      let j = i + 1;
      let value = "";
      while (j < source.length && source[j] !== ch) {
        value += source[j];
        j += 1;
      }
      if (source[j] !== ch) return { error: "Formula string is missing an end quote." };
      tokens.push(JSON.stringify(value));
      i = j + 1;
      continue;
    }
    if ("&(),".includes(ch)) {
      tokens.push(ch);
      i += 1;
      continue;
    }
    const id = /^[A-Za-z_][\w-]*/.exec(source.slice(i));
    if (id) {
      tokens.push(id[0]);
      i += id[0].length;
      continue;
    }
    return { error: `Formula has “${ch}”, which is not supported.` };
  }
  return { tokens };
}

function parseFormulaTokens(
  tokens: string[],
  index: number,
): { node: FormulaNode; next: number } | { error: string } {
  const token = tokens[index];
  if (!token) return { error: "Formula is incomplete." };
  let primary: { node: FormulaNode; next: number } | { error: string };
  if ((token === "if" || token === "empty") && tokens[index + 1] === "(") {
    const open = index + 2;
    if (token === "empty") {
      const inner = parseFormulaTokens(tokens, open);
      if ("error" in inner) return inner;
      if (tokens[inner.next] !== ")") return { error: "empty( needs a closing )." };
      primary = { node: { kind: "empty", inner: inner.node }, next: inner.next + 1 };
    } else {
      const cond = parseFormulaTokens(tokens, open);
      if ("error" in cond) return cond;
      if (tokens[cond.next] !== ",") return { error: "if( needs three parts: if(value, then, else)." };
      const yes = parseFormulaTokens(tokens, cond.next + 1);
      if ("error" in yes) return yes;
      if (tokens[yes.next] !== ",") return { error: "if( needs three parts: if(value, then, else)." };
      const no = parseFormulaTokens(tokens, yes.next + 1);
      if ("error" in no) return no;
      if (tokens[no.next] !== ")") return { error: "if( needs a closing )." };
      primary = { node: { kind: "if", cond: cond.node, yes: yes.node, no: no.node }, next: no.next + 1 };
    }
  } else if (token.startsWith('"')) {
    try {
      primary = { node: { kind: "text", value: JSON.parse(token) as string }, next: index + 1 };
    } catch {
      return { error: "Formula string is not valid." };
    }
  } else if (token.startsWith("file.")) {
    const key = token.slice(5);
    if (key !== "mtime" && key !== "name" && key !== "folder" && key !== "path") {
      return { error: "file. needs mtime, name, folder, or path." };
    }
    primary = { node: { kind: "file", key }, next: index + 1 };
  } else if (/^[A-Za-z_][\w-]*$/.test(token)) {
    primary = { node: { kind: "prop", key: token }, next: index + 1 };
  } else {
    return { error: `Formula has “${token}”, which is not supported.` };
  }
  if ("error" in primary) return primary;
  if (tokens[primary.next] !== "&") return primary;
  const parts: FormulaNode[] = [primary.node];
  let next = primary.next;
  while (tokens[next] === "&") {
    const rest = parseFormulaTokens(tokens, next + 1);
    if ("error" in rest) return rest;
    if (rest.node.kind === "concat") parts.push(...rest.node.parts);
    else parts.push(rest.node);
    next = rest.next;
  }
  return { node: { kind: "concat", parts }, next };
}

function formulaTruthy(value: string): boolean {
  const v = value.trim().toLowerCase();
  return v !== "" && v !== "0" && v !== "false" && v !== "no";
}

function formatMtime(mtime: number): string {
  if (!mtime) return "";
  const d = new Date(mtime);
  if (Number.isNaN(d.getTime())) return "";
  return d.toISOString().slice(0, 16).replace("T", " ");
}

function evalFormulaNode(
  node: FormulaNode,
  row: Pick<NoteTableRow, "name" | "path" | "folder" | "mtime" | "props">,
): string {
  if (node.kind === "text") return node.value;
  if (node.kind === "prop") {
    if (Object.prototype.hasOwnProperty.call(row.props, node.key)) return row.props[node.key] ?? "";
    const found = Object.keys(row.props).find((key) => key.toLowerCase() === node.key.toLowerCase());
    return found ? row.props[found] ?? "" : "";
  }
  if (node.kind === "file") {
    if (node.key === "mtime") return formatMtime(row.mtime);
    if (node.key === "name") return row.name;
    if (node.key === "folder") return row.folder;
    return row.path;
  }
  if (node.kind === "concat") return node.parts.map((part) => evalFormulaNode(part, row)).join("");
  if (node.kind === "empty") return evalFormulaNode(node.inner, row).trim() ? "" : "yes";
  const cond = evalFormulaNode(node.cond, row);
  return evalFormulaNode(formulaTruthy(cond) ? node.yes : node.no, row);
}

/** One formula for every row. An empty formula is not a column. */
export function evalNoteFormula(
  row: Pick<NoteTableRow, "name" | "path" | "folder" | "mtime" | "props">,
  source: string,
): { value: string; error: string | null } {
  const trimmed = source.trim();
  if (!trimmed) return { value: "", error: null };
  const lexed = lexFormula(trimmed);
  if ("error" in lexed) return { value: "", error: lexed.error };
  if (!lexed.tokens.length) return { value: "", error: null };
  const parsed = parseFormulaTokens(lexed.tokens, 0);
  if ("error" in parsed) return { value: "", error: parsed.error };
  if (parsed.next !== lexed.tokens.length) {
    return { value: "", error: `Formula has “${lexed.tokens[parsed.next]}”, which is not supported.` };
  }
  return { value: evalFormulaNode(parsed.node, row), error: null };
}

export function buildNoteTable(
  notes: NoteTableSource[],
  folderPrefix = "",
  formula = "",
): { rows: NoteTableRow[]; keys: string[]; truncated: boolean; formulaError: string | null } {
  const prefix = folderPrefix.trim().replace(/\\/g, "/").replace(/^\/+|\/+$/g, "");
  const counts = new Map<string, number>();
  const rows: NoteTableRow[] = [];
  let truncated = false;
  let formulaError: string | null = null;
  const catalog = notes
    .filter((note) => note.path && !isCanvasPath(note.path))
    .map((note) => ({ id: note.id, path: note.path, name: note.name || note.path }));
  for (const note of notes) {
    if (!note.path || isCanvasPath(note.path)) continue;
    if (prefix && note.path !== prefix && !note.path.startsWith(`${prefix}/`)) continue;
    if (rows.length >= MAX_ROWS) {
      truncated = true;
      break;
    }
    const props = noteTableProperties(note.content);
    const links: Record<string, NoteLink[]> = {};
    for (const key of Object.keys(props)) {
      counts.set(key, (counts.get(key) || 0) + 1);
      const targets = relationTargets(props[key] || "");
      if (targets.length) links[key] = targets.map((target) => resolveNoteLink(target, catalog));
    }
    const built = {
      name: noteTableTitle(note.name || note.path.split("/").pop() || note.path),
      path: note.path,
      folder: noteTableFolder(note.path),
      mtime: note.mtime || 0,
      props,
    };
    const computed = evalNoteFormula(built, formula);
    rows.push({
      id: note.id,
      ...built,
      links,
      formula: computed.error ? "" : computed.value,
    });
    if (computed.error) formulaError = computed.error;
  }
  const keys = [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, MAX_KEYS)
    .map(([key]) => key);
  return { rows, keys, truncated, formulaError };
}

export function filterNoteRows(rows: NoteTableRow[], query: string): NoteTableRow[] {
  const q = query.trim().toLowerCase();
  if (!q) return rows;
  return rows.filter((row) => {
    if (row.name.toLowerCase().includes(q)) return true;
    if (row.path.toLowerCase().includes(q)) return true;
    if (row.folder.toLowerCase().includes(q)) return true;
    for (const value of Object.values(row.props)) {
      if (value.toLowerCase().includes(q)) return true;
    }
    if (row.formula.toLowerCase().includes(q)) return true;
    for (const group of Object.values(row.links)) {
      if (group.some((link) => link.title.toLowerCase().includes(q))) return true;
    }
    return false;
  });
}

/** Keep rows whose typed relation columns link a note matching the query. */
export function filterRowsByRelation(rows: NoteTableRow[], query: string, keys: string[]): NoteTableRow[] {
  const q = query.trim().toLowerCase();
  if (!q || !keys.length) return rows;
  return rows.filter((row) =>
    keys.some((key) => (row.links[key] || []).some((link) => link.title.toLowerCase().includes(q))),
  );
}

export function sortNoteRows(
  rows: NoteTableRow[],
  column: string,
  dir: "asc" | "desc",
): NoteTableRow[] {
  const sign = dir === "asc" ? 1 : -1;
  const value = (row: NoteTableRow) => {
    if (column === "name") return row.name;
    if (column === "folder") return row.folder;
    if (column === "path") return row.path;
    if (column === "formula") return row.formula;
    return row.props[column] || "";
  };
  return [...rows].sort((a, b) => {
    const av = value(a);
    const bv = value(b);
    if (!av && bv) return 1;
    if (av && !bv) return -1;
    return av.localeCompare(bv, undefined, { numeric: true, sensitivity: "base" }) * sign;
  });
}
