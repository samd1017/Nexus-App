/**
 * One expression language for query blocks and Bases filters: the Bases formula
 * language, which also reads the Dataview spellings people already type
 * (`=`, AND, OR, NOT, date(today), dur(7 days), `- 7d`, [[Note]], file.outlinks).
 * Expressions are parsed into a small tree and evaluated by Nexus; nothing from a
 * note is ever run as JavaScript.
 */

import {
  FORMULA_FUNCTIONS,
  compileNoteFormula,
  formulaReads,
  formulaTruthy,
  runNoteFormula,
  type CompiledFormula,
  type FormulaReads,
  type FormulaRow,
} from "@/lib/vault/note-formula";

/** A problem in one clause, with the character range in the query that caused it. */
export type QueryProblem = { message: string; clause: string; start: number; end: number };

export type CompiledExpr = { compiled: CompiledFormula; formula: string; reads: FormulaReads };

type Piece = { code: boolean; text: string };

/** Code and quoted text, so rewrites never touch what a user quoted. */
function splitQuoted(text: string): Piece[] {
  const out: Piece[] = [];
  let code = "";
  let i = 0;
  while (i < text.length) {
    const ch = text[i] ?? "";
    if (ch !== '"' && ch !== "'") {
      code += ch;
      i += 1;
      continue;
    }
    let j = i + 1;
    while (j < text.length && text[j] !== ch) j += text[j] === "\\" ? 2 : 1;
    if (code) out.push({ code: true, text: code });
    code = "";
    out.push({ code: false, text: text.slice(i, Math.min(j + 1, text.length)) });
    i = j + 1;
  }
  if (code) out.push({ code: true, text: code });
  return out;
}

const UNIT = "(?:years?|yrs?|y|months?|mo|weeks?|wks?|w|days?|d|hours?|hrs?|hr|h|minutes?|mins?|min|m|seconds?|secs?|sec|s)";
const BARE_DURATION = new RegExp(`([+\\-])\\s*(\\d+(?:\\.\\d+)?)\\s*(${UNIT})(?![\\w-])`, "g");
const DATE_WORDS: Record<string, string> = {
  today: "today()",
  now: "now()",
  tomorrow: '(today() + "1d")',
  yesterday: '(today() - "1d")',
};

function translateCode(code: string): string {
  return code
    .replace(/\[\[([^[\]]+?)\]\]/g, (_m, inner: string) => `link(${JSON.stringify((inner.split("|")[0] ?? "").trim())})`)
    .replace(/\bdate\(\s*(today|now|tomorrow|yesterday)\s*\)/gi, (_m, word: string) => DATE_WORDS[word.toLowerCase()] ?? _m)
    .replace(/\bdate\(\s*(\d{4}-\d{2}-\d{2}(?:T[\d:.]+Z?)?)\s*\)/gi, (_m, day: string) => `date("${day}")`)
    .replace(/\bdur\(\s*([^)]*?)\s*\)/gi, (_m, body: string) => JSON.stringify(body))
    .replace(BARE_DURATION, (_m, sign: string, n: string, unit: string) => `${sign} "${n}${unit}"`)
    .replace(/(?<![\w.-])(and|or|not)(?![\w-])/gi, (_m, word: string) => {
      const lower = word.toLowerCase();
      return lower === "and" ? "&&" : lower === "or" ? "||" : "!";
    })
    .replace(/(?<![=!<>])=(?!=)/g, "==")
    .replace(/\bfile\.outlinks\b/g, "file.links")
    .replace(/\bfile\.inlinks\b/g, "file.backlinks")
    .replace(/\bfile\.cday\b/g, "file.ctime")
    .replace(/\bfile\.mday\b/g, "file.mtime")
    .replace(/\bfile\.etags\b/g, "file.tags")
    .replace(/\bfile\.link\b(?!\s*\()/g, "file.asLink()");
}

/** Dataview spellings rewritten into the Bases formula language. Quoted text is left alone. */
export function toFormulaSyntax(text: string): string {
  const out = splitQuoted(text)
    .map((piece) => (piece.code ? translateCode(piece.text) : piece.text))
    .join("");
  // Dataview writes tags with `#`; Nexus tag lists do not carry it.
  return out.replace(/(contains\(\s*file\.tags\s*,\s*["'])#/g, "$1");
}

/** Positions at depth 0 (outside quotes, parentheses, and brackets). */
export function topLevelScan(text: string, visit: (index: number) => number | void): void {
  let depth = 0;
  let i = 0;
  while (i < text.length) {
    const ch = text[i] ?? "";
    if (ch === '"' || ch === "'") {
      let j = i + 1;
      while (j < text.length && text[j] !== ch) j += text[j] === "\\" ? 2 : 1;
      i = j + 1;
      continue;
    }
    if (ch === "(" || ch === "[") depth += 1;
    else if (ch === ")" || ch === "]") depth = Math.max(0, depth - 1);
    else if (depth === 0) {
      const skip = visit(i);
      if (typeof skip === "number" && skip > 0) {
        i += skip;
        continue;
      }
    }
    i += 1;
  }
}

export type TextPart = { text: string; start: number; end: number };

function trimmedPart(text: string, start: number, end: number): TextPart {
  const raw = text.slice(start, end);
  const lead = raw.length - raw.trimStart().length;
  const body = raw.trim();
  return { text: body, start: start + lead, end: start + lead + body.length };
}

/** Split at top-level commas. */
export function splitTopCommas(text: string): TextPart[] {
  const parts: TextPart[] = [];
  let from = 0;
  topLevelScan(text, (i) => {
    if (text[i] !== ",") return;
    parts.push(trimmedPart(text, from, i));
    from = i + 1;
  });
  parts.push(trimmedPart(text, from, text.length));
  return parts;
}

/** The conditions joined by AND / OR / && / || at the top level, for pointing at the one that broke. */
export function splitConditions(text: string): TextPart[] {
  const parts: TextPart[] = [];
  let from = 0;
  topLevelScan(text, (i) => {
    const two = text.slice(i, i + 2);
    if (two === "&&" || two === "||") {
      parts.push(trimmedPart(text, from, i));
      from = i + 2;
      return 2;
    }
    const word = /^(and|or)(?![\w-])/i.exec(text.slice(i));
    if (word && (i === 0 || /[\s)]/.test(text[i - 1] ?? ""))) {
      parts.push(trimmedPart(text, from, i));
      from = i + word[0].length;
      return word[0].length;
    }
  });
  parts.push(trimmedPart(text, from, text.length));
  return parts.filter((part) => part.text);
}

function distance(a: string, b: string): number {
  const dp = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i += 1) {
    let prev = dp[0] ?? 0;
    dp[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      const keep = dp[j] ?? 0;
      dp[j] = Math.min((dp[j] ?? 0) + 1, (dp[j - 1] ?? 0) + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = keep;
    }
  }
  return dp[b.length] ?? 0;
}

/** The closest name within two edits, or null. Case is ignored. */
export function didYouMean(word: string, choices: Iterable<string>): string | null {
  const needle = word.toLowerCase();
  let best: string | null = null;
  let bestScore = 3;
  for (const choice of choices) {
    const score = distance(needle, choice.toLowerCase());
    if (score > 0 && score < bestScore) {
      best = choice;
      bestScore = score;
    }
  }
  return best;
}

/** Formula wording, restated for a query clause. */
function queryMessage(message: string): string {
  const fn = /^(\w+)\(\) is not a formula function\.$/.exec(message);
  if (fn) {
    const guess = didYouMean(fn[1] ?? "", FORMULA_FUNCTIONS);
    return `${fn[1]}() is not a function Nexus knows.${guess ? ` Did you mean ${guess}()?` : ""}`;
  }
  return message
    .replace(/^Formula has “(.+)” where it does not fit\.$/, "“$1” does not fit here. Join conditions with AND or OR.")
    .replace(/^Formula has “(.+)” where a value should be\.$/, "A value is missing before “$1”.")
    .replace(/^Formula has “(.+)”, which is not supported\.$/, "“$1” is not supported here.")
    .replace(/^Formula is incomplete\.$/, "This is incomplete. Finish the comparison, like status = \"done\".")
    .replace(/^Formula string is missing an end quote\.$/, "A quoted text is missing its end quote.")
    .replace(/^Formula is missing a closing \)\.$/, "A ( is missing its closing ).");
}

/** Narrow a problem to the token its message names, when that token is in the clause. */
function narrow(part: TextPart, message: string): { start: number; end: number } {
  const quoted = /“([^”]+)”/.exec(message)?.[1];
  if (quoted) {
    const at = part.text.indexOf(quoted);
    if (at >= 0) return { start: part.start + at, end: part.start + at + quoted.length };
  }
  const fn = /^(\w+)\(\)/.exec(message)?.[1];
  if (fn) {
    const call = new RegExp(`(?<![\\w.])${fn}\\s*\\(`).exec(part.text);
    if (call) {
      let depth = 0;
      let end = part.text.length;
      for (let i = call.index + call[0].length - 1; i < part.text.length; i++) {
        const ch = part.text[i];
        if (ch === '"' || ch === "'") {
          i += 1;
          while (i < part.text.length && part.text[i] !== ch) i += part.text[i] === "\\" ? 2 : 1;
        } else if (ch === "(") depth += 1;
        else if (ch === ")" && --depth === 0) {
          end = i + 1;
          break;
        }
      }
      return { start: part.start + call.index, end: part.start + end };
    }
  }
  return { start: part.start, end: part.end };
}

function compileOne(text: string): { compiled: CompiledFormula; formula: string; error: string | null } {
  if (/(?<![\w.])this\s*\./.test(splitQuoted(text).filter((p) => p.code).map((p) => p.text).join(" "))) {
    return {
      compiled: { program: null, error: null },
      formula: text,
      error: "this. (the note holding the query) is not supported yet. Name the note instead, like [[Project X]].",
    };
  }
  const formula = toFormulaSyntax(text);
  const compiled = compileNoteFormula(formula);
  return { compiled, formula, error: compiled.error };
}

/**
 * One value expression (a column, a sort key, a group key).
 * `offset` is where `text` starts in the whole query, so the problem range points into it.
 */
export function compileQueryExpr(
  text: string,
  offset: number,
  clause: string,
): { ok: true; expr: CompiledExpr } | { ok: false; problem: QueryProblem } {
  const part = trimmedPart(text, 0, text.length);
  const shifted = { ...part, start: part.start + offset, end: part.end + offset };
  if (!part.text) return { ok: false, problem: { message: `${clause} needs a value.`, clause, start: offset, end: offset + text.length } };
  const one = compileOne(part.text);
  if (one.error) {
    const message = queryMessage(one.error);
    return { ok: false, problem: { message, clause, ...narrow(shifted, message) } };
  }
  return { ok: true, expr: { compiled: one.compiled, formula: one.formula, reads: formulaReads(one.compiled) } };
}

/**
 * A true/false filter (WHERE, a Bases view filter). When it does not parse, the
 * problem points at the first condition that fails on its own.
 */
export function compileQueryFilter(
  text: string,
  offset = 0,
  clause = "WHERE",
): { ok: true; expr: CompiledExpr | null } | { ok: false; problem: QueryProblem } {
  if (!text.trim()) return { ok: true, expr: null };
  const whole = compileOne(text);
  if (!whole.error) {
    return { ok: true, expr: { compiled: whole.compiled, formula: whole.formula, reads: formulaReads(whole.compiled) } };
  }
  for (const part of splitConditions(text)) {
    const one = compileOne(part.text);
    if (!one.error) continue;
    const message = queryMessage(one.error);
    const shifted = { ...part, start: part.start + offset, end: part.end + offset };
    return { ok: false, problem: { message, clause, ...narrow(shifted, message) } };
  }
  const all = trimmedPart(text, 0, text.length);
  const message = queryMessage(whole.error);
  return {
    ok: false,
    problem: { message, clause, ...narrow({ ...all, start: all.start + offset, end: all.end + offset }, message) },
  };
}

export type FilterResult = { pass: boolean; error: string | null };

export function runQueryFilter(expr: CompiledExpr, row: FormulaRow, now: number): FilterResult {
  const result = runNoteFormula(expr.compiled, row, now);
  if (result.error) return { pass: false, error: result.error };
  return { pass: formulaTruthy(result.raw), error: null };
}

/** Whether these expressions read frontmatter or links, which live in the note body. */
export function readsNoteBody(reads: FormulaReads[]): boolean {
  return reads.some((r) => r.props.length > 0 || r.anyProp || r.links || r.backlinks);
}

/** `a && b` as its top-level AND parts, for writing a `.base` `and:` list. OR stays one condition. */
export function filterAndParts(text: string): string[] {
  const parts: TextPart[] = [];
  let from = 0;
  let hasOr = false;
  topLevelScan(text, (i) => {
    const two = text.slice(i, i + 2);
    if (two === "||") hasOr = true;
    if (/^or(?![\w-])/i.test(text.slice(i)) && (i === 0 || /[\s)]/.test(text[i - 1] ?? ""))) hasOr = true;
    if (two === "&&") {
      parts.push(trimmedPart(text, from, i));
      from = i + 2;
      return 2;
    }
    const word = /^and(?![\w-])/i.exec(text.slice(i));
    if (word && (i === 0 || /[\s)]/.test(text[i - 1] ?? ""))) {
      parts.push(trimmedPart(text, from, i));
      from = i + word[0].length;
      return word[0].length;
    }
  });
  parts.push(trimmedPart(text, from, text.length));
  if (hasOr) return text.trim() ? [text.trim()] : [];
  return parts.map((part) => part.text).filter(Boolean);
}

/** Conditions joined with &&; a condition with a top-level OR is wrapped so it stays one. */
export function joinFilterParts(parts: string[]): string {
  return parts
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => (parts.length > 1 && filterAndParts(part).length === 1 && hasTopOr(part) ? `(${part})` : part))
    .join(" && ");
}

function hasTopOr(text: string): boolean {
  let found = false;
  topLevelScan(text, (i) => {
    if (text.slice(i, i + 2) === "||") found = true;
    if (/^or(?![\w-])/i.test(text.slice(i)) && (i === 0 || /[\s)]/.test(text[i - 1] ?? ""))) found = true;
  });
  return found;
}
