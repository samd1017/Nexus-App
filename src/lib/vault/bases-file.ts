/**
 * Obsidian-shaped `.base` reading and writing for the note table.
 * Import and export are one-off copies; `bases-live.ts` keeps the vault's
 * live `.base` file in sync. Anything that does not carry over is listed.
 */

import { parse, stringify } from "yaml";
import { compileNoteFormula, compileSummaryFormula } from "@/lib/vault/note-formula";
import { compileQueryFilter, filterAndParts, isCompoundFilter, joinFilterParts, toFormulaSyntax } from "@/lib/vault/query-expr";
import {
  MAX_FORMULA_COLUMNS,
  MAX_SUMMARY_FORMULAS,
  MAX_BASE_VIEWS,
  basesViewId,
  customSummary,
  customSummaryName,
  emptyBasesView,
  defaultBasesSession,
  formulaColumnId,
  formulaKey,
  type BasesFormula,
  type BasesSession,
  type BasesSummaryFormula,
  type BasesViewConfig,
  type SummaryChoice,
  type SummaryKind,
} from "@/lib/vault/note-table";

export const BASE_EXPORT_FILE = "Nexus Bases export.base";

const EXPORT_HEADER = [
  "# Exported from Nexus as a copy. Nexus keeps its live views in Nexus Bases.base; open this file from Bases to load its views there.",
  "# Formulas use Nexus syntax, which mostly matches Obsidian Bases; check any that error there.",
].join("\n");

export const FILE_SORT: Record<string, string> = { name: "file.name", folder: "file.folder", path: "file.path" };
export const FILE_FORMULAS: Record<string, { name: string; expr: string }> = {
  "file.mtime": { name: "Modified", expr: "file.mtime" },
  "file.ext": { name: "Extension", expr: "file.ext" },
  "file.tags": { name: "Tags", expr: "file.tags" },
  "file.links": { name: "Links", expr: "file.links" },
  "file.backlinks": { name: "Backlinks", expr: "file.backlinks" },
};

type Picked = { key: string; name: string; expr: string };

const FORMULA_REF = /\bformula\s*(?:\.\s*([A-Za-z_]\w*)|\[\s*(["'])((?:(?!\2).)*)\2\s*\])/g;

/** `formula.x` and `formula["x"]` targets in an expression, in order. */
export function formulaRefs(expr: string): string[] {
  return [...expr.matchAll(FORMULA_REF)].map((m) => m[1] ?? m[3] ?? "").filter(Boolean);
}

/** Replaces each formula reference `to` returns text for; others stay as written. */
export function replaceFormulaRefs(expr: string, to: (ref: string) => string | null): string {
  return expr.replace(FORMULA_REF, (match, dot?: string, _q?: string, bracket?: string) => to(dot ?? bracket ?? "") ?? match);
}

/** Rewrites each formula reference that `to` maps to `formula.<key>`; others stay as written. */
export function rewriteFormulaRefs(expr: string, to: (ref: string) => string | null): string {
  return expr.replace(FORMULA_REF, (match, dot?: string, _q?: string, bracket?: string) => {
    const key = to(dot ?? bracket ?? "");
    return key ? `formula.${key}` : match;
  });
}

/** Obsidian's built-in summary names. Count is Nexus-only. */
export const BASE_SUMMARY_NAME: Record<SummaryKind, string | null> = {
  count: null,
  filled: "Filled",
  empty: "Empty",
  unique: "Unique",
  sum: "Sum",
  average: "Average",
  median: "Median",
  min: "Min",
  max: "Max",
  range: "Range",
  stddev: "Stddev",
  earliest: "Earliest",
  latest: "Latest",
  checked: "Checked",
  unchecked: "Unchecked",
};

export function summaryFromBase(name: string): SummaryKind | null {
  const lower = name.trim().toLowerCase().replace(/[\s_-]+/g, "");
  if (lower === "count") return "count";
  const hit = (Object.entries(BASE_SUMMARY_NAME) as [SummaryKind, string | null][]).find(
    ([, base]) => base?.toLowerCase() === lower,
  );
  return hit ? hit[0] : null;
}

export function folderFilter(folder: string): string {
  return `file.inFolder(${JSON.stringify(folder)})`;
}

export function normalFolder(folder: string): string {
  return folder.trim().replace(/\\/g, "/").replace(/^\/+|\/+$/g, "");
}

/**
 * One Obsidian view for a Nexus view. `keyFor` names each formula's key in the
 * file's `formulas`; `summaryNames` are the summary formulas the file defines.
 */
export function baseViewNode(
  view: BasesViewConfig,
  detectedKeys: string[],
  keyFor: (f: BasesFormula) => string | undefined,
  notes: string[],
  summaryNames: ReadonlySet<string> | null = null,
): Record<string, unknown> {
  const out: Record<string, unknown> = { type: view.layout === "cards" ? "cards" : "table", name: view.name };
  const atoms = viewFilterAtoms(normalFolder(view.folder) || null, view.filter ?? "");
  if (atoms.length) out.filters = { and: atoms };
  const props = [...new Set([...(view.columns.length ? view.columns : detectedKeys), ...(view.relations ?? [])])];
  const formulaOrder = view.formulas
    .map(keyFor)
    .filter((key): key is string => Boolean(key))
    .map((key) => `formula.${key}`);
  const propertyFor = (column: string): string => {
    const f = view.formulas.find((item) => formulaColumnId(item.id) === column);
    return f ? `formula.${keyFor(f) ?? f.id}` : FILE_SORT[column] ?? column;
  };
  // Obsidian shows a summary only under a column in `order`; Nexus always shows folder and path.
  const summarizedFile = ["folder", "path"].filter((column) => view.summaries?.[column]).map((column) => FILE_SORT[column]);
  out.order = ["file.name", ...summarizedFile, ...props, ...formulaOrder];
  out.sort = [{ property: propertyFor(view.column), direction: view.dir === "desc" ? "DESC" : "ASC" }];
  if (view.groupBy) {
    out.groupBy = { property: propertyFor(view.groupBy.column), direction: view.groupBy.dir === "desc" ? "DESC" : "ASC" };
  }
  const summaries: Record<string, string> = {};
  for (const [column, choice] of Object.entries(view.summaries ?? {})) {
    const custom = customSummaryName(choice);
    if (custom !== null) {
      if (!summaryNames || summaryNames.has(custom)) summaries[propertyFor(column)] = custom;
      else notes.push(`“${view.name}” summary on ${propertyFor(column)} uses “${custom}”, which has no formula, so it was left out.`);
      continue;
    }
    const name = BASE_SUMMARY_NAME[choice as SummaryKind];
    if (name) summaries[propertyFor(column)] = name;
    else notes.push(`“${view.name}” ${choice} summary on ${propertyFor(column)} has no .base equivalent and was left out.`);
  }
  if (Object.keys(summaries).length) out.summaries = summaries;
  if (view.query.trim()) {
    notes.push(`“${view.name}” text filter “${view.query.trim()}” has no .base equivalent and was left out.`);
  }
  return out;
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
    const local = new Map<string, string>();
    for (const f of view.formulas) {
      if (!f.expr.trim()) continue;
      const expr = rewriteFormulaRefs(f.expr, (ref) => local.get(ref.toLowerCase()) ?? null);
      let key = f.id;
      if (key in formulas && formulas[key] !== expr) key = formulaKey(f.id, Object.keys(formulas));
      formulas[key] = expr;
      local.set(f.id.toLowerCase(), key);
      if (!local.has(f.name.toLowerCase())) local.set(f.name.toLowerCase(), key);
      exportKey.set(`${view.id}:${f.id}`, key);
      properties[`formula.${key}`] = { displayName: f.name };
    }
  }
  const summaryFormulas: Record<string, string> = {};
  for (const f of session.summaryFormulas ?? []) {
    if (f.expr.trim()) summaryFormulas[f.name] = f.expr;
    else notes.push(`Summary formula “${f.name}” is empty and was left out.`);
  }
  const summaryNames = new Set(Object.keys(summaryFormulas));
  const views = session.views.map((view) =>
    baseViewNode(view, detectedKeys, (f) => exportKey.get(`${view.id}:${f.id}`), notes, summaryNames),
  );
  const doc: Record<string, unknown> = {};
  if (Object.keys(formulas).length) {
    doc.formulas = formulas;
    doc.properties = properties;
  }
  if (summaryNames.size) doc.summaries = summaryFormulas;
  doc.views = views;
  return { text: `${EXPORT_HEADER}\n${stringify(doc, { lineWidth: 0 })}`, notes };
}

/** `sourceKeys[i]` are the `formulas` keys view i reads, so a rewrite knows which formulas it owns. */
export type BaseImport = { session: BasesSession; notes: string[]; sourceKeys: string[][] } | { error: string };

export function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function joinGroup(items: string[], op: "&&" | "||"): string {
  const list = items.map((item) => item.trim()).filter(Boolean);
  if (list.length <= 1) return list[0] ?? "";
  return list.map((item) => (isCompoundFilter(item) ? `(${item})` : item)).join(` ${op} `);
}

/** An Obsidian filter tree as one expression: `and` → &&, `or` → ||, `not` → none of. */
export function filterExpression(node: unknown, notes: string[]): string {
  if (node == null) return "";
  if (typeof node === "string" || typeof node === "number" || typeof node === "boolean") return String(node).trim();
  if (Array.isArray(node)) return joinGroup(node.map((item) => filterExpression(item, notes)), "&&");
  const rec = asRecord(node);
  if (!rec) return "";
  const parts: string[] = [];
  for (const [op, value] of Object.entries(rec)) {
    const items = (Array.isArray(value) ? value : [value]).map((item) => filterExpression(item, notes)).filter(Boolean);
    if (op === "and") parts.push(joinGroup(items, "&&"));
    else if (op === "or") parts.push(joinGroup(items, "||"));
    else if (op === "not") parts.push(joinGroup(items.map((item) => `!(${item})`), "&&"));
    else notes.push(`A “${op}” filter group was not imported.`);
  }
  return joinGroup(parts, "&&");
}

/** Top-level `and` conditions, each as one expression; `or` / `not` groups stay whole. */
export function filterAtoms(node: unknown, notes: string[]): string[] {
  if (node == null) return [];
  if (typeof node === "string") return [node.trim()].filter(Boolean);
  if (Array.isArray(node)) return node.flatMap((item) => filterAtoms(item, notes));
  const rec = asRecord(node);
  if (!rec) return [];
  const out: string[] = [];
  for (const [op, value] of Object.entries(rec)) {
    if (op === "and") out.push(...filterAtoms(value, notes));
    else {
      const expr = filterExpression({ [op]: value }, notes);
      if (expr) out.push(expr);
    }
  }
  return out;
}

/** A view's conditions as `.base` filter atoms: its folder first, then each AND part in Bases syntax. */
export function viewFilterAtoms(folder: string | null, filter: string, skip: ReadonlySet<string> = new Set()): string[] {
  const atoms = folder ? [folderFilter(folder)] : [];
  for (const part of filterAndParts(filter)) {
    const expr = toFormulaSyntax(part).trim();
    if (expr && !skip.has(expr)) atoms.push(expr);
  }
  return atoms;
}

export function folderOf(expr: string): string | null {
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
    const first = err instanceof Error ? (err.message.split("\n")[0] ?? "") : String(err);
    return { error: `Not a readable .base file: ${first.replace(/[:\s]+$/, "")}.` };
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
  const summaryFormulas: BasesSummaryFormula[] = [];
  if (root.summaries != null && !asRecord(root.summaries)) notes.push("The file's summaries are not name: formula pairs and were skipped.");
  for (const [rawName, value] of Object.entries(asRecord(root.summaries) ?? {})) {
    const name = rawName.trim();
    if (typeof value !== "string" && typeof value !== "number") {
      notes.push(`Summary formula “${name}” is not text and was skipped.`);
    } else if (summaryFormulas.length >= MAX_SUMMARY_FORMULAS) {
      notes.push(`Nexus keeps ${MAX_SUMMARY_FORMULAS} summary formulas; “${name}” was not imported.`);
    } else if (name) {
      const expr = String(value);
      summaryFormulas.push({ name, expr });
      const compiled = compileSummaryFormula(expr);
      if (compiled.error) notes.push(`Summary formula “${name}” does not run in Nexus yet (${compiled.error}); its cells show that error.`);
      if (summaryFromBase(name) !== null) {
        notes.push(`Summary formula “${name}” has a built-in summary's name; views that pick “${name}” use the formula.`);
      }
    }
  }
  const customNames = new Set(summaryFormulas.map((f) => f.name));
  const reported = new Set<string>();
  const report = (line: string) => {
    if (!reported.has(line)) {
      reported.add(line);
      notes.push(line);
    }
  };

  const sourceKeys: string[][] = [];
  const shownRaw = rawViews.slice(0, MAX_BASE_VIEWS);
  const views = shownRaw.map((raw, index): BasesViewConfig => {
    const fallback = base.views[index] ?? emptyBasesView(basesViewId(index), `View ${index + 1}`);
    const name = typeof raw.name === "string" && raw.name.trim() ? raw.name.trim() : fallback.name;
    const type = typeof raw.type === "string" ? raw.type : "table";
    if (type !== "table" && type !== "cards") report(`“${name}” is a ${type} view; it opens as a table.`);
    let folder = "";
    const conditions: string[] = [];
    for (const expr of [...topFilters, ...filterAtoms(raw.filters, notes)]) {
      const found = folderOf(expr);
      if (found !== null && !folder) folder = found;
      else if (!conditions.includes(expr)) conditions.push(expr);
    }
    const filter = joinFilterParts(conditions);
    if (filter) {
      const compiled = compileQueryFilter(filter);
      if (!compiled.ok) {
        report(`“${name}” filter uses syntax Nexus does not read yet (${compiled.problem.message}); the view shows every note until it is edited.`);
      }
    }
    const order = Array.isArray(raw.order) ? raw.order.filter((e): e is string => typeof e === "string") : null;
    const picked: Picked[] = [];
    const pick = (key: string, nameText: string, expr: string) => {
      if (!picked.some((p) => p.key === key)) picked.push({ key, name: nameText, expr });
    };
    const columns: string[] = [];
    const entries = order ?? ["file.name", ...[...sourceFormulas.keys()].map((k) => `formula.${k}`)];
    for (const entry of entries) {
      if (entry.startsWith("formula.")) {
        const key = entry.slice(8);
        const expr = sourceFormulas.get(key);
        if (expr === undefined) report(`Column ${entry} has no formula in this file.`);
        else pick(key, displayName(key), expr);
      } else if (entry.startsWith("file.")) {
        if (entry in FILE_SORT || Object.values(FILE_SORT).includes(entry)) continue;
        const asFormula = FILE_FORMULAS[entry];
        if (asFormula) pick(entry.replace(".", "_"), asFormula.name, asFormula.expr);
        else report(`Column ${entry} has no Nexus equivalent and was left out.`);
      } else {
        const key = propertyId(entry);
        if (key && !columns.includes(key)) columns.push(key);
      }
    }
    const resolveRef = (ref: string): string | null => {
      if (sourceFormulas.has(ref)) return ref;
      return [...sourceFormulas.keys()].find((key) => displayName(key) === ref) ?? null;
    };
    const depsOf = (p: Picked) =>
      formulaRefs(p.expr)
        .map(resolveRef)
        .filter((key): key is string => key !== null);
    for (let i = 0; i < picked.length; ) {
      const p = picked[i] as Picked;
      const missing = depsOf(p).find((key) => !picked.some((q) => q.key === key));
      if (missing === undefined) {
        i += 1;
        continue;
      }
      picked.splice(i, 0, { key: missing, name: displayName(missing), expr: sourceFormulas.get(missing) as string });
      report(`“${p.name}” reads formula.${missing}, so “${displayName(missing)}” was added as a column.`);
    }
    const placed: Picked[] = [];
    let rest = [...picked];
    while (rest.length) {
      const next = rest.find((p) => depsOf(p).every((key) => placed.some((q) => q.key === key)));
      if (!next) {
        report(`Formula loop between ${rest.map((p) => `“${p.name}”`).join(", ")}; those columns show an error.`);
        placed.push(...rest);
        break;
      }
      placed.push(next);
      rest = rest.filter((p) => p !== next);
    }
    if (placed.some((p, i) => p !== picked[i])) {
      report(`“${name}” formula columns were reordered so each sits right of the columns it reads.`);
    }
    const formulas: BasesFormula[] = [];
    const formulaIdFor = new Map<string, string>();
    for (const p of placed) {
      if (formulas.length >= MAX_FORMULA_COLUMNS) {
        report(`Only ${MAX_FORMULA_COLUMNS} formula columns fit in a view; “${p.name}” was left out.`);
        continue;
      }
      const id = formulaKey(p.key, formulas.map((f) => f.id));
      formulaIdFor.set(p.key, id);
      formulas.push({ id, name: p.name, expr: p.expr });
    }
    for (const f of formulas) {
      f.expr = rewriteFormulaRefs(f.expr, (ref) => {
        const key = resolveRef(ref);
        return key ? formulaIdFor.get(key) ?? null : null;
      });
      const compiled = compileNoteFormula(f.expr);
      if (compiled.error) report(`Formula “${f.name}” uses syntax Nexus does not read yet (${compiled.error}); it shows that error in its column.`);
    }
    sourceKeys[index] = [...formulaIdFor.keys()].filter((key) => sourceFormulas.has(key));
    const columnFor = (prop: string): string | null => {
      const fileCol = Object.entries(FILE_SORT).find(([, id]) => id === prop)?.[0];
      if (fileCol) return fileCol;
      const formulaSource = prop.startsWith("formula.") ? prop.slice(8) : prop in FILE_FORMULAS ? prop.replace(".", "_") : null;
      if (formulaSource !== null) {
        const id = formulaIdFor.get(formulaSource);
        return id ? formulaColumnId(id) : null;
      }
      if (prop.startsWith("file.")) return null;
      return propertyId(prop) || null;
    };
    let column = "name";
    let dir: "asc" | "desc" = "asc";
    const sort = Array.isArray(raw.sort) ? asRecord(raw.sort[0]) : null;
    if (sort && typeof sort.property === "string") {
      dir = String(sort.direction).toUpperCase() === "DESC" ? "desc" : "asc";
      const found = columnFor(sort.property);
      if (found) column = found;
      else report(`“${name}” sorts by ${sort.property}, which did not carry over; it sorts by name.`);
    }
    let groupBy: BasesViewConfig["groupBy"] = null;
    const rawGroup = typeof raw.groupBy === "string" ? { property: raw.groupBy } : asRecord(raw.groupBy);
    if (rawGroup) {
      const prop = typeof rawGroup.property === "string" ? rawGroup.property : "";
      const found = prop ? columnFor(prop) : null;
      if (found) groupBy = { column: found, dir: String(rawGroup.direction).toUpperCase() === "DESC" ? "desc" : "asc" };
      else report(`“${name}” groups by ${prop || "an unnamed property"}, which did not carry over; it shows ungrouped.`);
    }
    const summaries: Record<string, SummaryChoice> = {};
    for (const [prop, value] of Object.entries(asRecord(raw.summaries) ?? {})) {
      const text = typeof value === "string" ? value.trim() : "";
      const choice: SummaryChoice | null = customNames.has(text) ? customSummary(text) : text ? summaryFromBase(text) : null;
      const found = columnFor(prop);
      if (!choice) {
        report(`“${name}” summary ${String(value)} on ${prop} is not a built-in summary or a summary formula in this file; it was left out.`);
      } else if (!found) report(`“${name}” summary on ${prop} did not carry over.`);
      else summaries[found] = choice;
    }
    if (raw.limit !== undefined) report(`“${name}” has a row limit; Nexus shows up to 400 notes.`);
    return {
      id: fallback.id,
      name,
      query: "",
      folder,
      filter,
      column,
      dir,
      formulas,
      columns,
      relations: [],
      layout: type === "cards" ? "cards" : "table",
      groupBy,
      summaries,
    };
  });
  if (rawViews.length > MAX_BASE_VIEWS) {
    const left = rawViews.slice(MAX_BASE_VIEWS).map((v, i) => (typeof v.name === "string" && v.name.trim() ? v.name.trim() : `View ${MAX_BASE_VIEWS + i + 1}`));
    notes.push(`Nexus shows ${MAX_BASE_VIEWS} views; ${left.map((n) => `“${n}”`).join(", ")} ${left.length === 1 ? "was" : "were"} not imported.`);
  }
  while (views.length < 2) {
    views.push(structuredClone(base.views[views.length] as BasesViewConfig));
    sourceKeys.push([]);
  }
  views.forEach((view, i) => {
    view.id = basesViewId(i);
  });
  const session: BasesSession = { activeId: "all", views, summaryFormulas };
  return { session, notes, sourceKeys };
}
