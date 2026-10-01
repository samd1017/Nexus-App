/**
 * Obsidian-shaped `.base` import and export for the note table.
 * The live file stays `.nexus/note-table.json`; a `.base` file is a copy
 * going in or out, and anything that does not carry over is listed.
 */

import { parse, stringify } from "yaml";
import { compileNoteFormula } from "@/lib/vault/note-formula";
import {
  MAX_FORMULA_COLUMNS,
  defaultBasesSession,
  formulaColumnId,
  formulaKey,
  type BasesFormula,
  type BasesSession,
  type BasesViewConfig,
} from "@/lib/vault/note-table";

export const BASE_EXPORT_FILE = "Nexus Bases.base";

const EXPORT_HEADER = [
  "# Exported from Nexus. Nexus keeps editing .nexus/note-table.json; export again after changes.",
  "# Formulas use Nexus syntax, which mostly matches Obsidian Bases; check any that error there.",
].join("\n");

const FILE_SORT: Record<string, string> = { name: "file.name", folder: "file.folder", path: "file.path" };
const FILE_FORMULAS: Record<string, { name: string; expr: string }> = {
  "file.mtime": { name: "Modified", expr: "file.mtime" },
  "file.ext": { name: "Extension", expr: "file.ext" },
};

function folderFilter(folder: string): string {
  return `file.inFolder(${JSON.stringify(folder)})`;
}

export function exportBaseFile(
  session: BasesSession,
  detectedKeys: string[] = [],
): { text: string; notes: string[] } {
  const formulas: Record<string, string> = {};
  const properties: Record<string, { displayName: string }> = {};
  const notes: string[] = [];
  const exportKey = new Map<string, string>();
  for (const view of session.views) {
    for (const f of view.formulas) {
      if (!f.expr.trim()) continue;
      let key = f.id;
      if (key in formulas && formulas[key] !== f.expr) key = formulaKey(f.id, Object.keys(formulas));
      formulas[key] = f.expr;
      exportKey.set(`${view.id}:${f.id}`, key);
      properties[`formula.${key}`] = { displayName: f.name };
    }
  }
  const views = session.views.map((view) => {
    const out: Record<string, unknown> = { type: view.layout === "cards" ? "cards" : "table", name: view.name };
    const folder = view.folder.trim().replace(/\\/g, "/").replace(/^\/+|\/+$/g, "");
    if (folder) out.filters = { and: [folderFilter(folder)] };
    const props = [...new Set([...(view.columns.length ? view.columns : detectedKeys), ...(view.relations ?? [])])];
    const formulaOrder = view.formulas
      .map((f) => exportKey.get(`${view.id}:${f.id}`))
      .filter((key): key is string => Boolean(key))
      .map((key) => `formula.${key}`);
    out.order = ["file.name", ...props, ...formulaOrder];
    const direction = view.dir === "desc" ? "DESC" : "ASC";
    const sortFormula = view.formulas.find((f) => formulaColumnId(f.id) === view.column);
    const property = sortFormula
      ? `formula.${exportKey.get(`${view.id}:${sortFormula.id}`) ?? sortFormula.id}`
      : FILE_SORT[view.column] ?? view.column;
    out.sort = [{ property, direction }];
    if (view.query.trim()) {
      notes.push(`“${view.name}” text filter “${view.query.trim()}” has no .base equivalent and was left out.`);
    }
    return out;
  });
  const doc: Record<string, unknown> = {};
  if (Object.keys(formulas).length) {
    doc.formulas = formulas;
    doc.properties = properties;
  }
  doc.views = views;
  return { text: `${EXPORT_HEADER}\n${stringify(doc, { lineWidth: 0 })}`, notes };
}

export type BaseImport = { session: BasesSession; notes: string[] } | { error: string };

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

/** Flattens `and` groups into expressions; `or` / `not` are reported, not guessed at. */
function filterAtoms(node: unknown, notes: string[]): string[] {
  if (node == null) return [];
  if (typeof node === "string") return [node.trim()].filter(Boolean);
  if (Array.isArray(node)) return node.flatMap((item) => filterAtoms(item, notes));
  const rec = asRecord(node);
  if (!rec) return [];
  const out: string[] = [];
  for (const [op, value] of Object.entries(rec)) {
    if (op === "and") out.push(...filterAtoms(value, notes));
    else notes.push(`A “${op}” filter group was not imported; Nexus filters by folder.`);
  }
  return out;
}

function folderOf(expr: string): string | null {
  const inFolder = /^file\.inFolder\(\s*(["'])(.*?)\1\s*\)$/.exec(expr);
  if (inFolder) return inFolder[2] ?? null;
  const eq = /^file\.folder\s*==\s*(["'])(.*?)\1$/.exec(expr);
  return eq ? eq[2] ?? null : null;
}

function propertyId(entry: string): string {
  const bracket = /^note\[\s*(["'])(.*)\1\s*\]$/.exec(entry);
  if (bracket) return bracket[2] ?? entry;
  return entry.startsWith("note.") ? entry.slice(5) : entry;
}

export function importBaseFile(text: string): BaseImport {
  let doc: unknown;
  try {
    doc = parse(text);
  } catch (err) {
    return { error: `Not a readable .base file: ${err instanceof Error ? err.message.split("\n")[0] : String(err)}` };
  }
  const root = asRecord(doc);
  const rawViews = root && Array.isArray(root.views) ? root.views.map(asRecord).filter((v): v is Record<string, unknown> => !!v) : [];
  if (!root || !rawViews.length) return { error: "This .base file has no views to import." };
  const notes: string[] = [];
  const base = defaultBasesSession();
  const props = asRecord(root.properties) ?? {};
  const sourceFormulas = new Map<string, string>();
  for (const [key, value] of Object.entries(asRecord(root.formulas) ?? {})) {
    if (typeof value === "string" || typeof value === "number") sourceFormulas.set(key, String(value));
    else notes.push(`Formula “${key}” is not text and was skipped.`);
  }
  const displayName = (key: string): string => {
    const named = asRecord(props[`formula.${key}`])?.displayName;
    return typeof named === "string" && named.trim() ? named.trim() : key;
  };
  const topFilters = filterAtoms(root.filters, notes);
  const reported = new Set<string>();
  const report = (line: string) => {
    if (!reported.has(line)) {
      reported.add(line);
      notes.push(line);
    }
  };

  const views = rawViews.slice(0, 2).map((raw, index): BasesViewConfig => {
    const fallback = base.views[index] as BasesViewConfig;
    const name = typeof raw.name === "string" && raw.name.trim() ? raw.name.trim() : fallback.name;
    const type = typeof raw.type === "string" ? raw.type : "table";
    if (type !== "table" && type !== "cards") report(`“${name}” is a ${type} view; it opens as a table.`);
    let folder = "";
    for (const expr of [...topFilters, ...filterAtoms(raw.filters, notes)]) {
      const found = folderOf(expr);
      if (found !== null && !folder) folder = found;
      else if (found !== null) report(`“${name}” has more than one folder filter; only “${folder}” was kept.`);
      else report(`Filter ${expr} was not imported; Nexus filters by folder.`);
    }
    const order = Array.isArray(raw.order) ? raw.order.filter((e): e is string => typeof e === "string") : null;
    const formulas: BasesFormula[] = [];
    const formulaIdFor = new Map<string, string>();
    const addFormula = (sourceKey: string, nameText: string, expr: string) => {
      if (formulas.length >= MAX_FORMULA_COLUMNS) {
        report(`Only ${MAX_FORMULA_COLUMNS} formula columns fit in a view; “${nameText}” was left out.`);
        return;
      }
      const id = formulaKey(sourceKey, formulas.map((f) => f.id));
      formulaIdFor.set(sourceKey, id);
      formulas.push({ id, name: nameText, expr });
      const compiled = compileNoteFormula(expr);
      if (compiled.error) report(`Formula “${nameText}” uses syntax Nexus does not read yet (${compiled.error}); it shows that error in its column.`);
    };
    const columns: string[] = [];
    const entries = order ?? ["file.name", ...[...sourceFormulas.keys()].map((k) => `formula.${k}`)];
    for (const entry of entries) {
      if (entry.startsWith("formula.")) {
        const key = entry.slice(8);
        const expr = sourceFormulas.get(key);
        if (expr === undefined) report(`Column ${entry} has no formula in this file.`);
        else if (!formulaIdFor.has(key)) addFormula(key, displayName(key), expr);
      } else if (entry.startsWith("file.")) {
        if (entry in FILE_SORT || Object.values(FILE_SORT).includes(entry)) continue;
        const asFormula = FILE_FORMULAS[entry];
        if (asFormula) addFormula(entry.replace(".", "_"), asFormula.name, asFormula.expr);
        else report(`Column ${entry} has no Nexus equivalent and was left out.`);
      } else {
        const key = propertyId(entry);
        if (key && !columns.includes(key)) columns.push(key);
      }
    }
    let column = "name";
    let dir: "asc" | "desc" = "asc";
    const sort = Array.isArray(raw.sort) ? asRecord(raw.sort[0]) : null;
    if (sort && typeof sort.property === "string") {
      const prop = sort.property;
      dir = String(sort.direction).toUpperCase() === "DESC" ? "desc" : "asc";
      const fileCol = Object.entries(FILE_SORT).find(([, id]) => id === prop)?.[0];
      const formulaSource = prop.startsWith("formula.") ? prop.slice(8) : prop in FILE_FORMULAS ? prop.replace(".", "_") : null;
      if (fileCol) column = fileCol;
      else if (formulaSource !== null && formulaIdFor.has(formulaSource)) {
        column = formulaColumnId(formulaIdFor.get(formulaSource) as string);
      } else if (!prop.startsWith("formula.") && !prop.startsWith("file.")) column = propertyId(prop);
      else report(`“${name}” sorts by ${prop}, which did not carry over; it sorts by name.`);
    }
    if (raw.groupBy !== undefined) report(`“${name}” groups rows; Nexus shows them ungrouped.`);
    if (raw.limit !== undefined) report(`“${name}” has a row limit; Nexus shows up to 400 notes.`);
    return {
      id: fallback.id,
      name,
      query: "",
      folder,
      column,
      dir,
      formulas,
      columns,
      relations: [],
      layout: type === "cards" ? "cards" : "table",
    };
  });
  if (rawViews.length > 2) {
    const left = rawViews.slice(2).map((v, i) => (typeof v.name === "string" ? v.name : `View ${i + 3}`));
    notes.push(`Nexus keeps two views; ${left.map((n) => `“${n}”`).join(", ")} ${left.length === 1 ? "was" : "were"} not imported.`);
  }
  const session: BasesSession = {
    activeId: "all",
    views: [views[0] ?? base.views[0], views[1] ?? base.views[1]] as BasesViewConfig[],
  };
  if (session.views[0]) session.views[0].id = "all";
  if (session.views[1]) session.views[1].id = "saved";
  return { session, notes };
}
