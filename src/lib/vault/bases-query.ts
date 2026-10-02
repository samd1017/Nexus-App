/**
 * A Bases view written as a query block, so a table built with clicks can be
 * pasted into any note. Both sides share one expression language.
 */

import { FILE_SORT, normalFolder, replaceFormulaRefs } from "@/lib/vault/bases-file";
import { FORMULA_COLUMN_PREFIX, type BasesViewConfig } from "@/lib/vault/note-table";

const BARE_KEY = /^[A-Za-z_][\w]*$/;
/** Words the query reads as clauses or keywords, so a property with that name needs note[...]. */
const RESERVED = new Set(["from", "where", "sort", "group", "by", "limit", "flatten", "as", "and", "or", "not", "asc", "desc", "file", "formula", "note", "this", "true", "false", "null"]);

function propertyRef(key: string): string {
  return BARE_KEY.test(key) && !RESERVED.has(key.toLowerCase()) ? key : `note[${JSON.stringify(key)}]`;
}

function quote(text: string): string {
  return JSON.stringify(text);
}

export function basesViewToQuery(view: BasesViewConfig, detectedKeys: string[]): { text: string; notes: string[] } {
  const notes: string[] = [];
  const inlined = new Map<string, string>();
  for (const f of view.formulas) {
    if (!f.expr.trim()) continue;
    const expr = replaceFormulaRefs(f.expr, (ref) => {
      const hit = view.formulas.find((other) => other.id === ref || other.name === ref);
      const body = hit ? inlined.get(hit.id) : undefined;
      return body !== undefined ? `(${body})` : null;
    });
    inlined.set(f.id, expr);
  }
  const columnExpr = (column: string): string | null => {
    if (column in FILE_SORT) return FILE_SORT[column] ?? null;
    if (column.startsWith(FORMULA_COLUMN_PREFIX)) {
      const body = inlined.get(column.slice(FORMULA_COLUMN_PREFIX.length));
      return body === undefined ? null : body;
    }
    return column ? propertyRef(column) : null;
  };

  const properties = [...new Set([...(view.columns.length ? view.columns : detectedKeys), ...(view.relations ?? [])])];
  const columns = [
    ...properties.map((key) => (propertyRef(key) === key ? key : `${propertyRef(key)} AS ${quote(key)}`)),
    ...view.formulas.filter((f) => inlined.has(f.id)).map((f) => `${inlined.get(f.id)} AS ${quote(f.name)}`),
  ];
  const head = view.layout === "cards" ? "CARDS" : "TABLE";
  const lines = [columns.length ? `${head} ${columns.join(", ")}` : head];
  const folder = normalFolder(view.folder);
  if (folder) lines.push(`FROM ${quote(folder)}`);
  if (view.filter?.trim()) lines.push(`WHERE ${view.filter.trim().replace(/\s*\n\s*/g, " ")}`);
  if (view.query.trim()) notes.push(`The search text “${view.query.trim()}” is not part of the query.`);
  if (view.groupBy) {
    const group = columnExpr(view.groupBy.column);
    if (group) lines.push(`GROUP BY ${group}`);
    if (view.groupBy.dir === "desc") notes.push("Query groups always run A to Z.");
  }
  const sort = columnExpr(view.column);
  if (sort && !(view.column === "name" && view.dir === "asc")) lines.push(`SORT ${sort} ${view.dir === "desc" ? "DESC" : "ASC"}`);
  if (Object.keys(view.summaries ?? {}).length) notes.push("Summaries stay in Bases.");
  return { text: lines.join("\n"), notes };
}
