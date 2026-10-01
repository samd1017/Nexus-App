/**
 * Formula language for the Bases note table. One expression per view,
 * evaluated per note. Values are text, numbers, true/false, and dates.
 * Dates read and print in UTC so a saved view looks the same on every machine.
 */

export type FormulaRow = {
  name: string;
  path: string;
  folder: string;
  mtime: number;
  props: Record<string, string>;
};

type DateValue = { kind: "date"; ms: number; dateOnly: boolean };
type Value = null | string | number | boolean | DateValue;

type Token =
  | { t: "num"; v: number }
  | { t: "str"; v: string }
  | { t: "id"; v: string }
  | { t: "op"; v: string };

const FILE_KEYS = ["name", "path", "folder", "ext", "mtime"] as const;
type FileKey = (typeof FILE_KEYS)[number];

type Node =
  | { k: "lit"; v: Value }
  | { k: "prop"; key: string }
  | { k: "file"; key: FileKey }
  | { k: "call"; name: string; args: Node[] }
  | { k: "bin"; op: string; a: Node; b: Node }
  | { k: "un"; op: "!" | "-"; a: Node };

export type CompiledFormula = { program: Node | null; error: string | null };
export type FormulaResult = { value: string; error: string | null; sort: number | null };

class FormulaError extends Error {}

const DAY = 86_400_000;
const OPS = ["||", "&&", "==", "!=", ">=", "<=", ">", "<", "+", "-", "*", "/", "%", "&", "!", "(", ")", ",", ".", "[", "]"];
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function lex(source: string): Token[] {
  const out: Token[] = [];
  let i = 0;
  while (i < source.length) {
    const ch = source[i] ?? "";
    if (/\s/.test(ch)) {
      i += 1;
      continue;
    }
    if (ch === '"' || ch === "'") {
      let j = i + 1;
      let value = "";
      while (j < source.length && source[j] !== ch) {
        if (source[j] === "\\" && j + 1 < source.length) {
          value += source[j + 1];
          j += 2;
          continue;
        }
        value += source[j];
        j += 1;
      }
      if (source[j] !== ch) throw new FormulaError("Formula string is missing an end quote.");
      out.push({ t: "str", v: value });
      i = j + 1;
      continue;
    }
    const rest = source.slice(i);
    const num = /^\d+(?:\.\d+)?/.exec(rest);
    if (num) {
      out.push({ t: "num", v: Number(num[0]) });
      i += num[0].length;
      continue;
    }
    // Frontmatter keys may contain hyphens (due-date); subtraction between names needs spaces.
    const id = /^[A-Za-z_]\w*(?:-[A-Za-z_]\w*)*/.exec(rest);
    if (id) {
      out.push({ t: "id", v: id[0] });
      i += id[0].length;
      continue;
    }
    const op = OPS.find((o) => source.startsWith(o, i));
    if (op) {
      out.push({ t: "op", v: op });
      i += op.length;
      continue;
    }
    if (ch === "=") throw new FormulaError("Use == to compare.");
    throw new FormulaError(`Formula has “${ch}”, which is not supported.`);
  }
  return out;
}

function tokenText(t: Token): string {
  return t.t === "str" ? `"${t.v}"` : String(t.v);
}

function isDate(v: Value): v is DateValue {
  return typeof v === "object" && v !== null && v.kind === "date";
}

function pad(n: number, width = 2): string {
  return String(n).padStart(width, "0");
}

function formatDate(d: DateValue, pattern: string): string {
  const t = new Date(d.ms);
  const Y = t.getUTCFullYear();
  const M = t.getUTCMonth();
  const D = t.getUTCDate();
  const h = t.getUTCHours();
  return pattern.replace(/\[[^\]]*\]|YYYY|YY|MMMM|MMM|MM|M|DD|D|dddd|ddd|HH|H|mm|ss/g, (tok) => {
    if (tok.startsWith("[")) return tok.slice(1, -1);
    switch (tok) {
      case "YYYY":
        return String(Y);
      case "YY":
        return pad(Y % 100);
      case "MMMM":
        return MONTHS[M] ?? "";
      case "MMM":
        return (MONTHS[M] ?? "").slice(0, 3);
      case "MM":
        return pad(M + 1);
      case "M":
        return String(M + 1);
      case "DD":
        return pad(D);
      case "D":
        return String(D);
      case "dddd":
        return WEEKDAYS[t.getUTCDay()] ?? "";
      case "ddd":
        return (WEEKDAYS[t.getUTCDay()] ?? "").slice(0, 3);
      case "HH":
        return pad(h);
      case "H":
        return String(h);
      case "mm":
        return pad(t.getUTCMinutes());
      default:
        return pad(t.getUTCSeconds());
    }
  });
}

function show(v: Value): string {
  if (v === null) return "";
  if (typeof v === "string") return v;
  if (typeof v === "boolean") return v ? "true" : "false";
  if (typeof v === "number") return String(Math.round(v * 10_000) / 10_000);
  return formatDate(v, v.dateOnly ? "YYYY-MM-DD" : "YYYY-MM-DD HH:mm");
}

function quote(v: Value): string {
  return typeof v === "string" ? `“${v}”` : show(v);
}

function truthy(v: Value): boolean {
  if (v === null) return false;
  if (typeof v === "boolean") return v;
  if (typeof v === "number") return v !== 0;
  if (isDate(v)) return true;
  const s = v.trim().toLowerCase();
  return s !== "" && s !== "0" && s !== "false" && s !== "no";
}

function numeric(v: Value): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "string" && /^\s*-?\d+(?:\.\d+)?\s*$/.test(v)) return Number(v);
  return null;
}

function needNumber(v: Value): number | null {
  if (v === null || v === "") return null;
  const n = numeric(v);
  if (n === null) throw new FormulaError(`${quote(v)} is not a number.`);
  return n;
}

function startOfDay(ms: number): number {
  return Math.floor(ms / DAY) * DAY;
}

function parseDate(raw: string): DateValue | null {
  let s = raw.trim().replace(/^\[\[/, "").replace(/\]\]$/, "").replace(/\|.*$/, "").trim();
  s = (s.split("/").pop() ?? s).replace(/\.md$/i, "");
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2}))?(?:\.\d+)?(Z|[+-]\d{2}:?\d{2})?)?$/.exec(s);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]) - 1;
  const d = Number(m[3]);
  const check = new Date(Date.UTC(y, mo, d));
  if (check.getUTCMonth() !== mo || check.getUTCDate() !== d) return null;
  if (m[4] === undefined) return { kind: "date", ms: check.getTime(), dateOnly: true };
  const hh = Number(m[4]);
  const mi = Number(m[5]);
  const ss = Number(m[6] ?? 0);
  if (hh > 23 || mi > 59 || ss > 59) return null;
  let ms = Date.UTC(y, mo, d, hh, mi, ss);
  const zone = m[7];
  if (zone && zone !== "Z") {
    const sign = zone.startsWith("-") ? -1 : 1;
    const digits = zone.slice(1).replace(":", "");
    ms -= sign * (Number(digits.slice(0, 2)) * 60 + Number(digits.slice(2, 4))) * 60_000;
  }
  return { kind: "date", ms, dateOnly: false };
}

function toDate(v: Value): DateValue | null {
  if (v === null) return null;
  if (isDate(v)) return v;
  if (typeof v === "string") {
    if (!v.trim()) return null;
    const d = parseDate(v);
    if (d) return d;
  }
  throw new FormulaError(`${quote(v)} is not a date. Use YYYY-MM-DD.`);
}

type Duration = { n: number; unit: "y" | "M" | "w" | "d" | "h" | "m" | "s" };

const UNIT_WORDS: Record<string, Duration["unit"]> = {
  y: "y", yr: "y", yrs: "y", year: "y", years: "y",
  mo: "M", month: "M", months: "M",
  w: "w", wk: "w", week: "w", weeks: "w",
  d: "d", day: "d", days: "d",
  h: "h", hr: "h", hour: "h", hours: "h",
  m: "m", min: "m", minute: "m", minutes: "m",
  s: "s", sec: "s", second: "s", seconds: "s",
};

function parseDuration(raw: string): Duration | null {
  const m = /^\s*(-?\d+(?:\.\d+)?)\s*([A-Za-z]+)\s*$/.exec(raw);
  if (!m) return null;
  const word = m[2] ?? "";
  const unit = word === "M" ? "M" : UNIT_WORDS[word.toLowerCase()];
  return unit ? { n: Number(m[1]), unit } : null;
}

function shift(d: DateValue, dur: Duration, sign: 1 | -1): DateValue {
  const n = dur.n * sign;
  if (dur.unit === "y" || dur.unit === "M") {
    const t = new Date(d.ms);
    const months = dur.unit === "y" ? Math.round(n * 12) : Math.round(n);
    t.setUTCMonth(t.getUTCMonth() + months);
    return { kind: "date", ms: t.getTime(), dateOnly: d.dateOnly };
  }
  const unitMs = { w: 7 * DAY, d: DAY, h: 3_600_000, m: 60_000, s: 1000 }[dur.unit];
  const ms = d.ms + n * unitMs;
  return { kind: "date", ms, dateOnly: d.dateOnly && ms === startOfDay(ms) };
}

function relative(d: DateValue, now: number): string {
  const diff = d.ms - now;
  if (!d.dateOnly && Math.abs(diff) < DAY) {
    const mins = Math.round(Math.abs(diff) / 60_000);
    if (mins < 1) return "just now";
    const amount = mins < 60 ? `${mins} minute${mins === 1 ? "" : "s"}` : `${Math.round(mins / 60)} hour${Math.round(mins / 60) === 1 ? "" : "s"}`;
    return diff < 0 ? `${amount} ago` : `in ${amount}`;
  }
  const days = Math.round((startOfDay(d.ms) - startOfDay(now)) / DAY);
  if (days === 0) return "today";
  if (days === -1) return "yesterday";
  if (days === 1) return "tomorrow";
  const abs = Math.abs(days);
  let amount: string;
  if (abs < 30) amount = `${abs} days`;
  else if (abs < 365) {
    const months = Math.max(1, Math.round(abs / 30));
    amount = `${months} month${months === 1 ? "" : "s"}`;
  } else {
    const years = Math.max(1, Math.round(abs / 365));
    amount = `${years} year${years === 1 ? "" : "s"}`;
  }
  return days < 0 ? `${amount} ago` : `in ${amount}`;
}

type Ctx = { now: number };
type Fn = { name: string; min: number; max: number; run?: (args: Value[], ctx: Ctx) => Value };

const text = (fn: (s: string) => Value) => (args: Value[]) => (args[0] === null ? null : fn(show(args[0])));
const num = (fn: (n: number) => number) => (args: Value[]) => {
  const n = needNumber(args[0] ?? null);
  return n === null ? null : fn(n);
};
const datePart = (fn: (t: Date) => number) => (args: Value[]) => {
  const d = toDate(args[0] ?? null);
  return d ? fn(new Date(d.ms)) : null;
};

const FUNCTION_LIST: Fn[] = [
  { name: "if", min: 2, max: 3 },
  { name: "empty", min: 1, max: 1, run: ([v]) => v === null || v === undefined || (typeof v === "string" && !v.trim()) },
  { name: "now", min: 0, max: 0, run: (_a, ctx) => ({ kind: "date", ms: ctx.now, dateOnly: false }) },
  { name: "today", min: 0, max: 0, run: (_a, ctx) => ({ kind: "date", ms: startOfDay(ctx.now), dateOnly: true }) },
  { name: "date", min: 1, max: 1, run: ([v]) => toDate(v ?? null) },
  {
    name: "number",
    min: 1,
    max: 1,
    run: ([v]) => {
      if (v === undefined || v === null) return null;
      if (typeof v === "boolean") return v ? 1 : 0;
      if (isDate(v)) return v.ms;
      return needNumber(v);
    },
  },
  { name: "string", min: 1, max: 1, run: ([v]) => show(v ?? null) },
  { name: "lower", min: 1, max: 1, run: text((s) => s.toLowerCase()) },
  { name: "upper", min: 1, max: 1, run: text((s) => s.toUpperCase()) },
  { name: "trim", min: 1, max: 1, run: text((s) => s.trim()) },
  { name: "length", min: 1, max: 1, run: ([v]) => (v === null || v === undefined ? 0 : show(v).length) },
  { name: "contains", min: 2, max: 2, run: ([v, s]) => v !== null && v !== undefined && show(v).includes(show(s ?? null)) },
  { name: "startsWith", min: 2, max: 2, run: ([v, s]) => v !== null && v !== undefined && show(v).startsWith(show(s ?? null)) },
  { name: "endsWith", min: 2, max: 2, run: ([v, s]) => v !== null && v !== undefined && show(v).endsWith(show(s ?? null)) },
  {
    name: "replace",
    min: 3,
    max: 3,
    run: ([v, a, b]) => {
      if (v === null || v === undefined) return null;
      const find = show(a ?? null);
      return find ? show(v).split(find).join(show(b ?? null)) : show(v);
    },
  },
  {
    name: "slice",
    min: 2,
    max: 3,
    run: (args) => {
      const v = args[0] ?? null;
      if (v === null) return null;
      const start = needNumber(args[1] ?? null) ?? 0;
      const end = args.length > 2 ? needNumber(args[2] ?? null) : null;
      return show(v).slice(start, end ?? undefined);
    },
  },
  {
    name: "round",
    min: 1,
    max: 2,
    run: (args) => {
      const n = needNumber(args[0] ?? null);
      if (n === null) return null;
      const f = 10 ** Math.max(0, Math.min(10, needNumber(args[1] ?? null) ?? 0));
      return Math.round(n * f) / f;
    },
  },
  { name: "floor", min: 1, max: 1, run: num(Math.floor) },
  { name: "ceil", min: 1, max: 1, run: num(Math.ceil) },
  { name: "abs", min: 1, max: 1, run: num(Math.abs) },
  {
    name: "min",
    min: 1,
    max: 32,
    run: (args) => {
      const nums = args.map((a) => needNumber(a)).filter((n): n is number => n !== null);
      return nums.length ? Math.min(...nums) : null;
    },
  },
  {
    name: "max",
    min: 1,
    max: 32,
    run: (args) => {
      const nums = args.map((a) => needNumber(a)).filter((n): n is number => n !== null);
      return nums.length ? Math.max(...nums) : null;
    },
  },
  {
    name: "format",
    min: 1,
    max: 2,
    run: (args) => {
      const d = toDate(args[0] ?? null);
      if (!d) return null;
      return formatDate(d, args.length > 1 ? show(args[1] ?? null) : d.dateOnly ? "YYYY-MM-DD" : "YYYY-MM-DD HH:mm");
    },
  },
  {
    name: "relative",
    min: 1,
    max: 1,
    run: ([v], ctx) => {
      const d = toDate(v ?? null);
      return d ? relative(d, ctx.now) : null;
    },
  },
  { name: "year", min: 1, max: 1, run: datePart((t) => t.getUTCFullYear()) },
  { name: "month", min: 1, max: 1, run: datePart((t) => t.getUTCMonth() + 1) },
  { name: "day", min: 1, max: 1, run: datePart((t) => t.getUTCDate()) },
];

const FUNCTIONS = new Map(FUNCTION_LIST.map((fn) => [fn.name.toLowerCase(), fn]));

/** Function names, in the order the help lists them. */
export const FORMULA_FUNCTIONS = FUNCTION_LIST.map((fn) => fn.name);

export const FORMULA_EXAMPLES: { formula: string; label: string }[] = [
  { formula: "file.mtime.relative()", label: "Edited, like “3 days ago”" },
  { formula: 'date(due).format("MMM D, YYYY")', label: "Format a date property" },
  { formula: 'if(empty(due), "—", date(due) - today())', label: "Days until due" },
  { formula: 'date(due) + "7d"', label: "A week after due" },
  { formula: 'if(status == "done", "Done", status.upper())', label: "Compare and change text" },
  { formula: 'round(number(estimate) / 60, 1) & " h"', label: "Math on a number property" },
  { formula: 'if(contains(lower(tags), "writing"), "Writing", file.folder)', label: "Text contains" },
];

function arityMessage(fn: Fn, method: boolean): string {
  const lo = method ? fn.min - 1 : fn.min;
  const hi = method ? fn.max - 1 : fn.max;
  const label = method ? `.${fn.name}()` : `${fn.name}()`;
  if (fn.name === "if") return "if() needs two or three parts: if(test, then, else).";
  if (hi <= 0) return `${label} takes no values.`;
  const span = lo === hi ? `${lo}` : hi >= 32 ? `${lo} or more` : `${lo} to ${hi}`;
  return `${label} takes ${span} value${span === "1" ? "" : "s"}.`;
}

class Parser {
  private i = 0;
  constructor(private readonly toks: Token[]) {}

  private peek(offset = 0): Token | undefined {
    return this.toks[this.i + offset];
  }

  private isOp(v: string): boolean {
    const t = this.peek();
    return t?.t === "op" && t.v === v;
  }

  private expect(v: string, message: string): void {
    if (!this.isOp(v)) throw new FormulaError(message);
    this.i += 1;
  }

  parse(): Node {
    const node = this.or();
    const left = this.peek();
    if (left) {
      const prev = this.toks[this.i - 1];
      if (left.t === "id" && prev?.t === "num") throw new FormulaError(`Durations are quoted, like "${prev.v}${left.v}".`);
      throw new FormulaError(`Formula has “${tokenText(left)}” where it does not fit.`);
    }
    return node;
  }

  private binary(ops: string[], next: () => Node): Node {
    let a = next();
    for (;;) {
      const t = this.peek();
      if (t?.t !== "op" || !ops.includes(t.v)) return a;
      this.i += 1;
      a = { k: "bin", op: t.v, a, b: next() };
    }
  }

  private or = (): Node => this.binary(["||"], this.and);
  private and = (): Node => this.binary(["&&"], this.cmp);
  private cmp = (): Node => this.binary(["==", "!=", ">=", "<=", ">", "<"], this.add);
  private add = (): Node => this.binary(["+", "-", "&"], this.mul);
  private mul = (): Node => this.binary(["*", "/", "%"], this.unary);

  private unary = (): Node => {
    if (this.isOp("!")) {
      this.i += 1;
      return { k: "un", op: "!", a: this.unary() };
    }
    if (this.isOp("-")) {
      this.i += 1;
      return { k: "un", op: "-", a: this.unary() };
    }
    return this.postfix();
  };

  private callArgs(label: string): Node[] {
    this.i += 1;
    const out: Node[] = [];
    if (!this.peek()) throw new FormulaError(`${label} needs a closing ).`);
    if (this.isOp(")")) {
      this.i += 1;
      return out;
    }
    for (;;) {
      out.push(this.or());
      if (this.isOp(",")) {
        this.i += 1;
        continue;
      }
      this.expect(")", `${label} needs a closing ).`);
      return out;
    }
  }

  private postfix(): Node {
    let node = this.primary();
    while (this.isOp(".")) {
      this.i += 1;
      const t = this.peek();
      if (t?.t !== "id") throw new FormulaError("A name must follow the dot.");
      this.i += 1;
      const fn = FUNCTIONS.get(t.v.toLowerCase());
      if (!fn || fn.name === "if" || fn.max === 0) throw new FormulaError(`.${t.v}() is not a formula function.`);
      const args = [node, ...(this.isOp("(") ? this.callArgs(`.${fn.name}(`) : [])];
      if (args.length < fn.min || args.length > fn.max) throw new FormulaError(arityMessage(fn, true));
      node = { k: "call", name: fn.name, args };
    }
    return node;
  }

  private primary(): Node {
    const t = this.peek();
    if (!t) throw new FormulaError("Formula is incomplete.");
    this.i += 1;
    if (t.t === "num" || t.t === "str") return { k: "lit", v: t.v };
    if (t.t === "op") {
      if (t.v === "(") {
        const inner = this.or();
        this.expect(")", "Formula is missing a closing ).");
        return inner;
      }
      throw new FormulaError(`Formula has “${t.v}” where a value should be.`);
    }
    const word = t.v;
    const lower = word.toLowerCase();
    if (lower === "true" || lower === "false") return { k: "lit", v: lower === "true" };
    if (lower === "null") return { k: "lit", v: null };
    if (this.isOp("(")) {
      const fn = FUNCTIONS.get(lower);
      if (!fn) throw new FormulaError(`${word}() is not a formula function.`);
      const args = this.callArgs(`${fn.name}(`);
      if (args.length < fn.min || args.length > fn.max) throw new FormulaError(arityMessage(fn, false));
      return { k: "call", name: fn.name, args };
    }
    if (word === "file" && this.isOp(".")) {
      this.i += 1;
      const key = this.peek();
      this.i += 1;
      const field = key?.t === "id" ? FILE_KEYS.find((k) => k === key.v) : undefined;
      if (!field) throw new FormulaError(`file. needs ${FILE_KEYS.join(", ")}.`);
      return { k: "file", key: field };
    }
    if (word === "note" && this.isOp(".")) {
      this.i += 1;
      const key = this.peek();
      this.i += 1;
      if (key?.t !== "id") throw new FormulaError("note. needs a property name.");
      return { k: "prop", key: key.v };
    }
    if (word === "note" && this.isOp("[")) {
      this.i += 1;
      const key = this.peek();
      this.i += 1;
      if (key?.t !== "str") throw new FormulaError('note[ needs a quoted property name, like note["due date"].');
      this.expect("]", 'note[ needs a closing ].');
      return { k: "prop", key: key.v };
    }
    return { k: "prop", key: word };
  }
}

function equals(a: Value, b: Value): boolean {
  const blankA = a === null || a === "";
  const blankB = b === null || b === "";
  if (blankA || blankB) return blankA && blankB;
  if (isDate(a) || isDate(b)) {
    const da = isDate(a) ? a : parseDate(show(a));
    const db = isDate(b) ? b : parseDate(show(b));
    return !!da && !!db && da.ms === db.ms;
  }
  const na = numeric(a);
  const nb = numeric(b);
  if (na !== null && nb !== null) return na === nb;
  return show(a) === show(b);
}

function order(a: Value, b: Value): number | null {
  if (a === null || b === null || a === "" || b === "") return null;
  if (isDate(a) || isDate(b)) {
    const da = isDate(a) ? a : parseDate(show(a));
    const db = isDate(b) ? b : parseDate(show(b));
    if (da && db) return da.ms - db.ms;
  }
  const na = numeric(a);
  const nb = numeric(b);
  if (na !== null && nb !== null) return na - nb;
  return show(a).localeCompare(show(b), undefined, { numeric: true, sensitivity: "base" });
}

function daysBetween(a: DateValue, b: DateValue): number {
  return (a.ms - b.ms) / DAY;
}

function add(a: Value, b: Value): Value {
  if (isDate(a) || isDate(b)) {
    const d = (isDate(a) ? a : b) as DateValue;
    const other = isDate(a) ? b : a;
    if (other === null || other === "") return null;
    if (isDate(other)) throw new FormulaError("Two dates cannot be added. Subtract them to get days.");
    const dur = typeof other === "string" ? parseDuration(other) : null;
    if (!dur) throw new FormulaError(`Add a duration like "7d" to a date, not ${quote(other)}.`);
    return shift(d, dur, 1);
  }
  if (a === null || b === null) {
    const other = a === null ? b : a;
    if (other === null || numeric(other) !== null) return null;
    return show(other);
  }
  const na = numeric(a);
  const nb = numeric(b);
  if (na !== null && nb !== null) return na + nb;
  return show(a) + show(b);
}

function subtract(a: Value, b: Value): Value {
  if (a === null || b === null || a === "" || b === "") return null;
  if (isDate(a)) {
    if (isDate(b)) return daysBetween(a, b);
    if (typeof b === "string") {
      const asDate = parseDate(b);
      if (asDate) return daysBetween(a, asDate);
      const dur = parseDuration(b);
      if (dur) return shift(a, dur, -1);
    }
    throw new FormulaError(`Subtract a duration like "7d" or a date from a date, not ${quote(b)}.`);
  }
  if (isDate(b)) {
    const asDate = typeof a === "string" ? parseDate(a) : null;
    if (asDate) return daysBetween(asDate, b);
    throw new FormulaError(`${quote(a)} is not a date, so a date cannot be subtracted from it.`);
  }
  const na = needNumber(a);
  const nb = needNumber(b);
  return na === null || nb === null ? null : na - nb;
}

function arithmetic(op: string, a: Value, b: Value): Value {
  if (isDate(a) || isDate(b)) throw new FormulaError(`Dates cannot use ${op}. Use + or - with a duration like "7d".`);
  const na = needNumber(a);
  const nb = needNumber(b);
  if (na === null || nb === null) return null;
  if ((op === "/" || op === "%") && nb === 0) throw new FormulaError("Division by zero.");
  if (op === "*") return na * nb;
  if (op === "/") return na / nb;
  return na % nb;
}

function readProp(row: FormulaRow, key: string): Value {
  if (Object.prototype.hasOwnProperty.call(row.props, key)) return row.props[key] ?? null;
  const found = Object.keys(row.props).find((k) => k.toLowerCase() === key.toLowerCase());
  return found ? row.props[found] ?? null : null;
}

function evalNode(node: Node, row: FormulaRow, ctx: Ctx): Value {
  switch (node.k) {
    case "lit":
      return node.v;
    case "prop":
      return readProp(row, node.key);
    case "file":
      if (node.key === "mtime") return row.mtime ? { kind: "date", ms: row.mtime, dateOnly: false } : null;
      if (node.key === "ext") {
        const base = row.path.split("/").pop() ?? "";
        const dot = base.lastIndexOf(".");
        return dot > 0 ? base.slice(dot + 1) : "";
      }
      return row[node.key];
    case "un": {
      const v = evalNode(node.a, row, ctx);
      if (node.op === "!") return !truthy(v);
      const n = needNumber(v);
      return n === null ? null : -n;
    }
    case "bin": {
      if (node.op === "&&") return truthy(evalNode(node.a, row, ctx)) && truthy(evalNode(node.b, row, ctx));
      if (node.op === "||") return truthy(evalNode(node.a, row, ctx)) || truthy(evalNode(node.b, row, ctx));
      const a = evalNode(node.a, row, ctx);
      const b = evalNode(node.b, row, ctx);
      switch (node.op) {
        case "&":
          return show(a) + show(b);
        case "+":
          return add(a, b);
        case "-":
          return subtract(a, b);
        case "==":
          return equals(a, b);
        case "!=":
          return !equals(a, b);
        case ">":
        case "<":
        case ">=":
        case "<=": {
          const c = order(a, b);
          if (c === null) return false;
          if (node.op === ">") return c > 0;
          if (node.op === "<") return c < 0;
          if (node.op === ">=") return c >= 0;
          return c <= 0;
        }
        default:
          return arithmetic(node.op, a, b);
      }
    }
    case "call": {
      if (node.name === "if") {
        const [cond, yes, no] = node.args;
        if (truthy(evalNode(cond as Node, row, ctx))) return evalNode(yes as Node, row, ctx);
        return no ? evalNode(no, row, ctx) : null;
      }
      const fn = FUNCTIONS.get(node.name.toLowerCase());
      if (!fn?.run) throw new FormulaError(`${node.name}() is not a formula function.`);
      const out = fn.run(
        node.args.map((arg) => evalNode(arg, row, ctx)),
        ctx,
      );
      if (typeof out === "number" && !Number.isFinite(out)) throw new FormulaError(`${fn.name}() did not produce a number.`);
      return out;
    }
  }
}

/** Parse once per view; an empty formula compiles to no program. */
export function compileNoteFormula(source: string): CompiledFormula {
  const trimmed = source.trim();
  if (!trimmed) return { program: null, error: null };
  try {
    const tokens = lex(trimmed);
    if (!tokens.length) return { program: null, error: null };
    return { program: new Parser(tokens).parse(), error: null };
  } catch (err) {
    if (err instanceof FormulaError) return { program: null, error: err.message };
    throw err;
  }
}

export function runNoteFormula(compiled: CompiledFormula, row: FormulaRow, now = Date.now()): FormulaResult {
  if (compiled.error) return { value: "", error: compiled.error, sort: null };
  if (!compiled.program) return { value: "", error: null, sort: null };
  try {
    const v = evalNode(compiled.program, row, { now });
    const sort = typeof v === "number" ? v : isDate(v) ? v.ms : typeof v === "boolean" ? Number(v) : null;
    return { value: show(v), error: null, sort };
  } catch (err) {
    if (err instanceof FormulaError) return { value: "", error: err.message, sort: null };
    throw err;
  }
}
