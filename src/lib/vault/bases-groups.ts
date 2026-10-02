/**
 * Group-by and summary rows for the Bases note table.
 * Summaries read the rows on screen (after filters, up to the table's row cap).
 */

import {
  compileSummaryFormula,
  formulaPropValue,
  parseFormulaDate,
  runSummaryFormula,
  type CompiledFormula,
  type FormulaValue,
} from "@/lib/vault/note-formula";
import {
  FORMULA_COLUMN_PREFIX,
  customSummaryName,
  type BasesGroupBy,
  type BasesSummaryFormula,
  type NoteTableRow,
  type SummaryChoice,
  type SummaryKind,
} from "@/lib/vault/note-table";

type Needs = "any" | "number" | "date" | "boolean";

export const SUMMARY_KINDS: { id: SummaryKind; label: string; needs: Needs }[] = [
  { id: "count", label: "Count", needs: "any" },
  { id: "filled", label: "Filled", needs: "any" },
  { id: "empty", label: "Empty", needs: "any" },
  { id: "unique", label: "Unique", needs: "any" },
  { id: "sum", label: "Sum", needs: "number" },
  { id: "average", label: "Average", needs: "number" },
  { id: "median", label: "Median", needs: "number" },
  { id: "min", label: "Min", needs: "number" },
  { id: "max", label: "Max", needs: "number" },
  { id: "range", label: "Range", needs: "number" },
  { id: "stddev", label: "Std dev", needs: "number" },
  { id: "earliest", label: "Earliest", needs: "date" },
  { id: "latest", label: "Latest", needs: "date" },
  { id: "checked", label: "Checked", needs: "boolean" },
  { id: "unchecked", label: "Unchecked", needs: "boolean" },
];

const KIND_BY_ID = new Map(SUMMARY_KINDS.map((kind) => [kind.id, kind]));

export function summaryLabel(choice: SummaryChoice): string {
  return customSummaryName(choice) ?? KIND_BY_ID.get(choice as SummaryKind)?.label ?? choice;
}

export type ColumnCell = {
  text: string;
  num: number | null;
  date: number | null;
  bool: boolean | null;
  error: boolean;
};

const NUMBER = /^\s*-?\d+(?:\.\d+)?\s*$/;

function textCell(text: string): ColumnCell {
  const trimmed = text.trim();
  const lower = trimmed.toLowerCase();
  return {
    text: trimmed,
    num: NUMBER.test(trimmed) ? Number(trimmed) : null,
    date: trimmed ? parseFormulaDate(trimmed) : null,
    bool: lower === "true" ? true : lower === "false" ? false : null,
    error: false,
  };
}

/** The value one row shows in one column, typed for grouping and summaries. */
export function columnCell(row: NoteTableRow, column: string): ColumnCell {
  if (column === "name") return textCell(row.name);
  if (column === "folder") return textCell(row.folder);
  if (column === "path") return textCell(row.path);
  if (column.startsWith(FORMULA_COLUMN_PREFIX)) {
    const cell = row.formulas[column.slice(FORMULA_COLUMN_PREFIX.length)];
    if (!cell) return { text: "", num: null, date: null, bool: null, error: false };
    if (cell.error) return { text: "", num: null, date: null, bool: null, error: true };
    return {
      text: cell.value,
      num: cell.kind === "number" ? cell.sort : null,
      date: cell.kind === "date" ? cell.sort : null,
      bool: cell.kind === "boolean" ? cell.sort === 1 : null,
      error: false,
    };
  }
  const links = row.links[column];
  if (links?.length) return textCell(links.map((link) => link.title).join(", "));
  return textCell(row.props[column] ?? "");
}

/** Kinds worth offering for a column, given the values it holds now. */
export function summaryKindsFor(rows: NoteTableRow[], column: string): SummaryKind[] {
  let number = false;
  let date = false;
  let bool = false;
  for (const row of rows) {
    const cell = columnCell(row, column);
    if (cell.num !== null) number = true;
    if (cell.date !== null) date = true;
    if (cell.bool !== null) bool = true;
  }
  return SUMMARY_KINDS.filter(
    (kind) =>
      kind.needs === "any" ||
      (kind.needs === "number" && number) ||
      (kind.needs === "date" && date) ||
      (kind.needs === "boolean" && bool),
  ).map((kind) => kind.id);
}

export type SummaryResult = {
  /** Shown in the summary cell. "—" when no value fits. */
  text: string;
  /** Tooltip: how many notes fed the number, or why there is none. */
  detail: string;
  /** A summary formula that did not parse or failed on these values. */
  error?: string;
};

/**
 * What a summary formula sees as `values`: one item per note, typed as
 * formulas read the column. A note without the property, or whose formula
 * failed, gives null, so `values.length` counts notes.
 */
export function summaryValues(rows: NoteTableRow[], column: string): FormulaValue[] {
  return rows.map((row): FormulaValue => {
    if (column === "name") return row.name;
    if (column === "folder") return row.folder;
    if (column === "path") return row.path;
    if (column.startsWith(FORMULA_COLUMN_PREFIX)) {
      const cell = row.formulas[column.slice(FORMULA_COLUMN_PREFIX.length)];
      return !cell || cell.error ? null : (cell.raw ?? null);
    }
    return formulaPropValue(row.props[column]);
  });
}

const compiledSummaries = new Map<string, CompiledFormula>();

function compiledSummary(expr: string): CompiledFormula {
  let hit = compiledSummaries.get(expr);
  if (!hit) {
    if (compiledSummaries.size > 200) compiledSummaries.clear();
    hit = compileSummaryFormula(expr);
    compiledSummaries.set(expr, hit);
  }
  return hit;
}

function customSummary(
  rows: NoteTableRow[],
  column: string,
  name: string,
  formulas: BasesSummaryFormula[],
  now: number,
): SummaryResult {
  const formula = formulas.find((f) => f.name === name);
  if (!formula) {
    const error = `No summary formula is named “${name}”.`;
    return { text: "Error", detail: error, error };
  }
  const compiled = compiledSummary(formula.expr);
  if (compiled.error) return { text: "Error", detail: `“${name}”: ${compiled.error}`, error: compiled.error };
  const failed = column.startsWith(FORMULA_COLUMN_PREFIX)
    ? rows.filter((row) => row.formulas[column.slice(FORMULA_COLUMN_PREFIX.length)]?.error).length
    : 0;
  const errorNote = failed ? `; ${plural(failed, "note")} with a formula error ${failed === 1 ? "counts" : "count"} as empty` : "";
  const result = runSummaryFormula(compiled, summaryValues(rows, column), now);
  if (result.error) return { text: "Error", detail: `“${name}”: ${result.error}`, error: result.error };
  if (result.value === "") return { text: "—", detail: `“${name}” gave no value for ${plural(rows.length, "note")}${errorNote}` };
  return { text: result.value, detail: `“${name}” over ${plural(rows.length, "note")}${errorNote}` };
}

function round(n: number, places: number): number {
  const f = 10 ** places;
  return Math.round(n * f) / f;
}

function showNumber(n: number): string {
  return String(round(n, Math.abs(n) >= 100 ? 2 : 4));
}

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}

export function summarize(
  rows: NoteTableRow[],
  column: string,
  choice: SummaryChoice,
  formulas: BasesSummaryFormula[] = [],
  now = Date.now(),
): SummaryResult {
  const custom = customSummaryName(choice);
  if (custom !== null) return customSummary(rows, column, custom, formulas, now);
  const kind = choice as SummaryKind;
  const cells = rows.map((row) => columnCell(row, column));
  const total = cells.length;
  const errors = cells.filter((cell) => cell.error).length;
  const errorNote = errors ? `; ${plural(errors, "note")} with an error left out` : "";
  const filled = cells.filter((cell) => !cell.error && cell.text !== "");
  switch (kind) {
    case "count":
      return { text: String(total), detail: `${plural(total, "note")}` };
    case "filled":
      return { text: String(filled.length), detail: `${filled.length} of ${total} have a value${errorNote}` };
    case "empty":
      return { text: String(total - filled.length - errors), detail: `${total - filled.length - errors} of ${total} are empty${errorNote}` };
    case "unique": {
      const unique = new Set(filled.map((cell) => cell.text)).size;
      return { text: String(unique), detail: `${unique} different values in ${plural(filled.length, "note")}${errorNote}` };
    }
    case "checked":
    case "unchecked": {
      const want = kind === "checked";
      const bools = cells.filter((cell) => cell.bool !== null);
      if (!bools.length) return { text: "—", detail: "No true or false values in this column." };
      const n = bools.filter((cell) => cell.bool === want).length;
      return { text: String(n), detail: `${n} of ${plural(bools.length, "true/false value")}` };
    }
    case "earliest":
    case "latest": {
      const dated = cells.filter((cell) => cell.date !== null);
      if (!dated.length) return { text: "—", detail: "No dates in this column." };
      const pick = dated.reduce((best, cell) =>
        (kind === "earliest" ? (cell.date as number) < (best.date as number) : (cell.date as number) > (best.date as number)) ? cell : best,
      );
      return { text: pick.text, detail: `Of ${plural(dated.length, "date")}${dated.length < total ? `; ${total - dated.length} notes have none` : ""}` };
    }
    default:
      break;
  }
  const nums = cells.map((cell) => cell.num).filter((n): n is number => n !== null);
  if (kind === "range" && !nums.length) {
    const dates = cells.map((cell) => cell.date).filter((n): n is number => n !== null);
    if (dates.length) {
      const days = round((Math.max(...dates) - Math.min(...dates)) / 86_400_000, 2);
      return { text: `${days} day${days === 1 ? "" : "s"}`, detail: `Earliest to latest of ${plural(dates.length, "date")}` };
    }
  }
  if (!nums.length) return { text: "—", detail: "No numbers in this column." };
  const skipped = total - nums.length;
  const detail = `Of ${plural(nums.length, "number")}${skipped ? `; ${skipped} notes have none` : ""}${errorNote}`;
  const sorted = [...nums].sort((a, b) => a - b);
  const sum = nums.reduce((acc, n) => acc + n, 0);
  const mean = sum / nums.length;
  let value: number;
  switch (kind) {
    case "sum":
      value = sum;
      break;
    case "average":
      value = mean;
      break;
    case "median": {
      const mid = Math.floor(sorted.length / 2);
      value = sorted.length % 2 ? (sorted[mid] as number) : ((sorted[mid - 1] as number) + (sorted[mid] as number)) / 2;
      break;
    }
    case "min":
      value = sorted[0] as number;
      break;
    case "max":
      value = sorted[sorted.length - 1] as number;
      break;
    case "range":
      value = (sorted[sorted.length - 1] as number) - (sorted[0] as number);
      break;
    default:
      value = Math.sqrt(nums.reduce((acc, n) => acc + (n - mean) ** 2, 0) / nums.length);
  }
  return { text: showNumber(value), detail };
}

export type NoteGroup = {
  /** Stable key for collapse state; "" is the empty group. */
  key: string;
  label: string;
  rows: NoteTableRow[];
};

export const EMPTY_GROUP_LABEL = "(empty)";
export const ERROR_GROUP_LABEL = "(formula error)";
const ERROR_KEY = "\u0000error";

/** Groups keep the row order they were given; empty and error groups sort last. */
export function groupNoteRows(rows: NoteTableRow[], groupBy: BasesGroupBy): NoteGroup[] {
  const groups = new Map<string, { cell: ColumnCell; rows: NoteTableRow[] }>();
  for (const row of rows) {
    const cell = columnCell(row, groupBy.column);
    const key = cell.error ? ERROR_KEY : cell.text;
    const group = groups.get(key);
    if (group) group.rows.push(row);
    else groups.set(key, { cell, rows: [row] });
  }
  const sign = groupBy.dir === "desc" ? -1 : 1;
  const rank = (key: string) => (key === ERROR_KEY ? 2 : key === "" ? 1 : 0);
  return [...groups.entries()]
    .sort(([ak, a], [bk, b]) => {
      const tier = rank(ak) - rank(bk);
      if (tier || rank(ak)) return tier;
      if (a.cell.num !== null && b.cell.num !== null) return (a.cell.num - b.cell.num) * sign;
      if (a.cell.date !== null && b.cell.date !== null) return (a.cell.date - b.cell.date) * sign;
      return ak.localeCompare(bk, undefined, { numeric: true, sensitivity: "base" }) * sign;
    })
    .map(([key, group]) => ({
      key,
      label: key === ERROR_KEY ? ERROR_GROUP_LABEL : key === "" ? EMPTY_GROUP_LABEL : key,
      rows: group.rows,
    }));
}
