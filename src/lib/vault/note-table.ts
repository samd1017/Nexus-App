import { applyFrontmatter, parseFrontmatterFields, splitFrontmatter } from "@/lib/editor/frontmatter";
import { isCanvasPath } from "@/lib/vault/canvas";
import {
  compileNoteFormula,
  runNoteFormula,
  type FormulaRefs,
  type FormulaResult,
  type FormulaRow,
} from "@/lib/vault/note-formula";

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
  /** One cell per formula column, keyed by column id. */
  formulas: Record<string, FormulaCell>;
};

export type FormulaCell = {
  /** Display value. Empty when the formula has no value or failed. */
  value: string;
  /** Why the formula failed for this note, shown in place of a value. */
  error: string | null;
  /** Numeric or date result as a number, so the column sorts by value. */
  sort: number | null;
};

/** A formula column. `id` is stable across renames; `formula.<id>` reads it. */
export type BasesFormula = { id: string; name: string; expr: string };

export const MAX_FORMULA_COLUMNS = 8;
export const FORMULA_COLUMN_PREFIX = "formula:";

export type BasesViewConfig = {
  id: "all" | "saved";
  name: string;
  query: string;
  folder: string;
  column: string;
  dir: "asc" | "desc";
  /** Formula columns, left to right. A column may read columns to its left. */
  formulas: BasesFormula[];
  /** Property columns to keep. Empty means every detected key. */
  columns: string[];
  /** Frontmatter keys stored as note links ([[Title]]). */
  relations: string[];
  /** Table spreadsheet or note cards. Same filters either way. */
  layout: "table" | "cards";
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

export type LinkChoiceNote = { name: string; path: string };

/** Exact title first, then prefix, then contains. Canvas files are not choices. */
export function rankLinkChoices<T extends LinkChoiceNote>(notes: T[], query: string): T[] {
  const q = query.trim().toLowerCase();
  const ranked: { note: T; score: number }[] = [];
  for (const note of notes) {
    if (note.path.toLowerCase().endsWith(".canvas")) continue;
    const title = noteTableTitle(note.name || note.path).toLowerCase();
    const path = note.path.toLowerCase();
    let score = 0;
    if (!q) score = 1;
    else if (title === q) score = 300;
    else if (title.startsWith(q)) score = 200;
    else if (title.includes(q)) score = 100;
    else if (path.includes(q)) score = 50;
    if (score) ranked.push({ note, score });
  }
  ranked.sort(
    (a, b) =>
      b.score - a.score ||
      noteTableTitle(a.note.name || a.note.path).localeCompare(noteTableTitle(b.note.name || b.note.path)),
  );
  return ranked.slice(0, 8).map((row) => row.note);
}

/** Reading is only while visible rows are still loading. A loaded table is idle. */
export function basesPropertiesReading(visibleMissing: number, hydrating: boolean): boolean {
  return visibleMissing > 0 && hydrating;
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
        formulas: [{ id: "formula", name: "Formula", expr: "file.mtime" }],
        columns: [],
        relations: [],
        layout: "table",
      },
      {
        id: "saved",
        name: "Saved view",
        query: "",
        folder: "",
        column: "name",
        dir: "asc",
        formulas: [{ id: "formula", name: "Formula", expr: 'if(status, status, "—")' }],
        columns: [],
        relations: ["related"],
        layout: "table",
      },
    ],
  };
}

/** Identifier for `formula.<id>`: lowercase letters, digits, and underscores, unique in the view. */
export function formulaKey(name: string, taken: Iterable<string>): string {
  const used = new Set([...taken].map((id) => id.toLowerCase()));
  let base = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, "_")
    .replace(/^_+|_+$/g, "");
  if (!base) base = "formula";
  if (/^\d/.test(base)) base = `f_${base}`;
  base = base.slice(0, 40);
  if (!used.has(base)) return base;
  for (let n = 2; ; n += 1) {
    const next = `${base}_${n}`;
    if (!used.has(next)) return next;
  }
}

export function formulaColumnId(id: string): string {
  return `${FORMULA_COLUMN_PREFIX}${id}`;
}

function asFormulas(raw: unknown): BasesFormula[] {
  if (!Array.isArray(raw)) return [];
  const out: BasesFormula[] = [];
  for (const item of raw) {
    if (out.length >= MAX_FORMULA_COLUMNS) break;
    if (!item || typeof item !== "object") continue;
    const f = item as Partial<BasesFormula>;
    const name = typeof f.name === "string" && f.name.trim() ? f.name.trim().slice(0, 60) : "Formula";
    const expr = typeof f.expr === "string" ? f.expr : "";
    const wanted = typeof f.id === "string" && /^[a-z_][a-z0-9_]*$/.test(f.id) ? f.id : name;
    const id = wanted === f.id && !out.some((o) => o.id === wanted) ? wanted : formulaKey(wanted, out.map((o) => o.id));
    out.push({ id, name, expr });
  }
  return out;
}

function asView(raw: unknown, fallback: BasesViewConfig): BasesViewConfig {
  const row = raw && typeof raw === "object" ? (raw as Partial<BasesViewConfig> & { formula?: unknown }) : {};
  const formulas = Array.isArray(row.formulas)
    ? asFormulas(row.formulas)
    : typeof row.formula === "string"
      ? row.formula.trim()
        ? [{ id: "formula", name: "Formula", expr: row.formula }]
        : []
      : fallback.formulas.map((f) => ({ ...f }));
  let column = typeof row.column === "string" && row.column ? row.column : fallback.column;
  if (column === "formula") column = formulas[0] ? formulaColumnId(formulas[0].id) : "name";
  if (column.startsWith(FORMULA_COLUMN_PREFIX) && !formulas.some((f) => formulaColumnId(f.id) === column)) {
    column = "name";
  }
  return {
    id: fallback.id,
    name: typeof row.name === "string" && row.name.trim() ? row.name : fallback.name,
    query: typeof row.query === "string" ? row.query : fallback.query,
    folder: typeof row.folder === "string" ? row.folder : fallback.folder,
    column,
    dir: row.dir === "desc" ? "desc" : "asc",
    formulas,
    columns: Array.isArray(row.columns)
      ? row.columns.filter((key): key is string => typeof key === "string" && key.trim().length > 0)
      : fallback.columns,
    relations: Array.isArray(row.relations)
      ? row.relations.filter((key): key is string => typeof key === "string" && /^[A-Za-z_][\w-]*$/.test(key))
      : fallback.relations,
    layout: row.layout === "cards" ? "cards" : "table",
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

/** `formula` keeps the first column's expression so older Nexus builds still open the file. */
export function serializeNoteTableFile(session: BasesSession): string {
  const views = session.views.map((view) => ({ ...view, formula: view.formulas[0]?.expr ?? "" }));
  return `${JSON.stringify({ kind: "nexus-note-table", version: 2, activeId: session.activeId, views }, null, 2)}\n`;
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
      if (!base.views[0].formulas.length) base.views[0].formulas = defaultBasesSession().views[0].formulas;
    }
  } catch {
    /* keep defaults */
  }
  return base;
}

/** One formula for every row. An empty formula is not a column. */
export function evalNoteFormula(row: FormulaRow, source: string, now = Date.now()): FormulaResult {
  return runNoteFormula(compileNoteFormula(source), row, now);
}

export type FormulaColumnStatus = {
  id: string;
  name: string;
  parseError: string | null;
  /** Notes this column failed on, and the first reason. */
  failed: number;
  firstFailure: string | null;
};

export function formulaStatusLine(status: FormulaColumnStatus[]): string | null {
  const broken = status.filter((s) => !s.parseError && s.failed);
  if (!broken.length) return null;
  return broken
    .map((s) => `“${s.name}” failed on ${s.failed} note${s.failed === 1 ? "" : "s"}: ${s.firstFailure}`)
    .join(" · ");
}

export function buildNoteTable(
  notes: NoteTableSource[],
  folderPrefix = "",
  formulas: BasesFormula[] = [],
  now = Date.now(),
): {
  rows: NoteTableRow[];
  keys: string[];
  truncated: boolean;
  formulaStatus: FormulaColumnStatus[];
} {
  const prefix = folderPrefix.trim().replace(/\\/g, "/").replace(/^\/+|\/+$/g, "");
  const counts = new Map<string, number>();
  const rows: NoteTableRow[] = [];
  let truncated = false;
  const columns = formulas.slice(0, MAX_FORMULA_COLUMNS).map((f) => ({ f, compiled: compileNoteFormula(f.expr) }));
  const formulaStatus: FormulaColumnStatus[] = columns.map(({ f, compiled }) => ({
    id: f.id,
    name: f.name,
    parseError: compiled.error,
    failed: 0,
    firstFailure: null,
  }));
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
    const refs: FormulaRefs = new Map();
    const cells: Record<string, FormulaCell> = {};
    columns.forEach(({ f, compiled }, index) => {
      const computed = runNoteFormula(compiled, { ...built, refs }, now);
      cells[f.id] = { value: computed.error ? "" : computed.value, error: computed.error, sort: computed.sort };
      const entry = computed.error ? { error: computed.error } : { value: computed.raw };
      refs.set(f.id.toLowerCase(), entry);
      if (!refs.has(f.name.toLowerCase())) refs.set(f.name.toLowerCase(), entry);
      const status = formulaStatus[index];
      if (status && computed.error && !compiled.error) {
        status.failed += 1;
        status.firstFailure ??= computed.error;
      }
    });
    rows.push({ id: note.id, ...built, links, formulas: cells });
  }
  const keys = [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, MAX_KEYS)
    .map(([key]) => key);
  return { rows, keys, truncated, formulaStatus };
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
    for (const cell of Object.values(row.formulas)) {
      if (cell.value.toLowerCase().includes(q)) return true;
    }
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
  const formulaId = column.startsWith(FORMULA_COLUMN_PREFIX) ? column.slice(FORMULA_COLUMN_PREFIX.length) : null;
  const value = (row: NoteTableRow) => {
    if (column === "name") return row.name;
    if (column === "folder") return row.folder;
    if (column === "path") return row.path;
    if (formulaId !== null) return row.formulas[formulaId]?.value ?? "";
    return row.props[column] || "";
  };
  return [...rows].sort((a, b) => {
    if (formulaId !== null) {
      const as = a.formulas[formulaId]?.sort ?? null;
      const bs = b.formulas[formulaId]?.sort ?? null;
      if (as !== null && bs !== null) return (as - bs) * sign;
    }
    const av = value(a);
    const bv = value(b);
    if (!av && bv) return 1;
    if (av && !bv) return -1;
    return av.localeCompare(bv, undefined, { numeric: true, sensitivity: "base" }) * sign;
  });
}
