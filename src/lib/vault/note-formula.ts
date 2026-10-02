/**
 * Formula language for the Bases note table. One expression per view,
 * evaluated per note. Values are text, numbers, true/false, dates, lists,
 * note links, files a link opens, and regexes.
 * Dates read and print in UTC so a saved view looks the same on every machine.
 */

import { parseWikilinkInner } from "@/lib/markdown/wikilinks";

type DateValue = { kind: "date"; ms: number; dateOnly: boolean };
type LinkValue = { kind: "link"; target: string; display: string | null };
type FileValue = {
  kind: "file";
  id: string;
  /** Path without `.md`, used to match links. */
  target: string;
  name: string;
  /** Vault path, including `.md`, same as `file.path` on that note. */
  path: string;
  props: Record<string, string>;
  /** Edited time. Notes do not store size or created time. */
  mtime: number;
};
type PropsValue = { kind: "props"; fields: Record<string, string> };
type RegexValue = { kind: "regex"; source: string; flags: string };
type Value = null | string | number | boolean | DateValue | LinkValue | FileValue | PropsValue | RegexValue | Value[];
/** A computed formula value, kept typed so later columns can do date math on it. */
export type FormulaValue = Value;
/** Results of columns to the left, by lowercased column id and name. */
export type FormulaRefs = Map<string, { value: FormulaValue } | { error: string }>;
/** A note link as written: target without `.md`, plus its `|label` if any. */
export type FormulaLink = { target: string; display?: string | null };

export type FormulaRow = {
  name: string;
  path: string;
  folder: string;
  mtime: number;
  props: Record<string, string>;
  refs?: FormulaRefs;
  /** Lazy so a table that never reads links or tags does not scan note bodies. */
  outlinks?: () => FormulaLink[];
  backlinks?: () => FormulaLink[];
  tags?: () => string[];
  /** The note a link names, or null when that path is not in the vault. */
  fileAt?: (target: string) => FileValue | null;
  /** Outgoing links of that note, or null when its body is not loaded. */
  linksAt?: (target: string) => FormulaLink[] | null;
};

type Token =
  | { t: "num"; v: number }
  | { t: "str"; v: string }
  | { t: "id"; v: string }
  | { t: "re"; source: string; flags: string }
  | { t: "op"; v: string };

const FILE_KEYS = ["name", "path", "folder", "ext", "mtime", "links", "backlinks", "tags"] as const;
type FileKey = (typeof FILE_KEYS)[number];
type Local = "value" | "index" | "acc" | "values";

type Node =
  | { k: "lit"; v: Value }
  | { k: "prop"; key: string }
  | { k: "file"; key: FileKey }
  | { k: "ref"; key: string }
  | { k: "local"; name: Local }
  | { k: "list"; items: Node[] }
  | { k: "index"; a: Node; i: Node }
  | { k: "get"; a: Node; key: string }
  | { k: "call"; name: string; args: Node[] }
  | { k: "bin"; op: string; a: Node; b: Node }
  | { k: "un"; op: "!" | "-"; a: Node };

export type CompiledFormula = { program: Node | null; error: string | null };
export type FormulaResult = { value: string; error: string | null; sort: number | null; raw: FormulaValue };

class FormulaError extends Error {}

const DAY = 86_400_000;
const OPS = ["||", "&&", "==", "!=", ">=", "<=", ">", "<", "+", "-", "*", "/", "%", "&", "!", "(", ")", ",", ".", "[", "]"];
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

const REGEX_FLAGS = "gimsu";

/** `/` starts a regex where a value is expected, and divides after one. */
function regexCanStart(prev: Token | undefined): boolean {
  return !prev || (prev.t === "op" && prev.v !== ")" && prev.v !== "]");
}

function lexRegex(source: string, start: number): { token: Token; end: number } {
  let j = start + 1;
  let inClass = false;
  let body = "";
  while (j < source.length) {
    const c = source[j] ?? "";
    if (c === "\\" && j + 1 < source.length) {
      body += c + source[j + 1];
      j += 2;
      continue;
    }
    if (c === "/" && !inClass) break;
    if (c === "[") inClass = true;
    else if (c === "]") inClass = false;
    body += c;
    j += 1;
  }
  if (source[j] !== "/") throw new FormulaError("Regex is missing its closing /.");
  if (!body) throw new FormulaError("Regex needs a pattern between the slashes, like /draft/.");
  const flags = /^[A-Za-z]*/.exec(source.slice(j + 1))?.[0] ?? "";
  for (const [n, flag] of [...flags].entries()) {
    if (!REGEX_FLAGS.includes(flag)) throw new FormulaError(`Regex flag “${flag}” is not supported. Use g, i, m, s, or u.`);
    if (flags.indexOf(flag) !== n) throw new FormulaError(`Regex flag “${flag}” is repeated.`);
  }
  try {
    new RegExp(body, flags);
  } catch (err) {
    const reason = String((err as Error).message ?? "").split(": ").pop() || "it does not parse";
    throw new FormulaError(`Regex /${body}/ is not valid: ${reason.charAt(0).toLowerCase()}${reason.slice(1)}.`);
  }
  return { token: { t: "re", source: body, flags }, end: j + 1 + flags.length };
}

function lex(source: string): Token[] {
  const out: Token[] = [];
  let i = 0;
  while (i < source.length) {
    const ch = source[i] ?? "";
    if (/\s/.test(ch)) {
      i += 1;
      continue;
    }
    if (ch === "/" && regexCanStart(out[out.length - 1])) {
      const { token, end } = lexRegex(source, i);
      out.push(token);
      i = end;
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
  if (t.t === "re") return `/${t.source}/${t.flags}`;
  return t.t === "str" ? `"${t.v}"` : String(t.v);
}

function isDate(v: Value): v is DateValue {
  return typeof v === "object" && v !== null && !Array.isArray(v) && v.kind === "date";
}

function isLink(v: Value): v is LinkValue {
  return typeof v === "object" && v !== null && !Array.isArray(v) && v.kind === "link";
}

function isFile(v: Value): v is FileValue {
  return typeof v === "object" && v !== null && !Array.isArray(v) && v.kind === "file";
}

function isProps(v: Value): v is PropsValue {
  return typeof v === "object" && v !== null && !Array.isArray(v) && v.kind === "props";
}

function linkTargetOf(v: Value): string | null {
  if (isLink(v) || isFile(v)) return v.target;
  if (typeof v === "string" && v.trim()) return v;
  return null;
}

function isRegex(v: Value): v is RegexValue {
  return typeof v === "object" && v !== null && !Array.isArray(v) && v.kind === "regex";
}

function isBlank(v: Value): boolean {
  return v === null || v === "" || (Array.isArray(v) && v.length === 0);
}

/** One value as a list; list methods accept a single value as a one-item list. */
function listOf(v: Value): Value[] {
  if (v === null || v === "") return [];
  return Array.isArray(v) ? v : [v];
}

function toRegExp(re: RegexValue, keepGlobal: boolean): RegExp {
  return new RegExp(re.source, keepGlobal ? re.flags : re.flags.replace("g", ""));
}

function linkLabel(target: string): string {
  const parts = parseWikilinkInner(target);
  const note = parts.noteTarget.replace(/\.md$/i, "");
  if (parts.heading) return note ? `${note} > ${parts.heading}` : parts.heading;
  return note || target;
}

/** Lowercased note path or title, without `.md`, heading, or label. */
function linkKey(target: string): string {
  const inner = target.trim().replace(/^\[\[/, "").replace(/\]\]$/, "");
  return parseWikilinkInner(inner)
    .noteTarget.replace(/\\/g, "/")
    .replace(/^\/+/, "")
    .replace(/\.md$/i, "")
    .trim()
    .toLowerCase();
}

/** Same note: equal paths, or equal titles when either side is a bare title. */
function sameNote(a: string, b: string): boolean {
  const ka = linkKey(a);
  const kb = linkKey(b);
  if (!ka || !kb) return false;
  if (ka === kb) return true;
  if (ka.includes("/") && kb.includes("/")) return false;
  return (ka.split("/").pop() ?? ka) === (kb.split("/").pop() ?? kb);
}

function linkMatches(link: LinkValue, other: Value): boolean {
  if (isLink(other)) return sameNote(link.target, other.target);
  if (typeof other === "string") return sameNote(link.target, other);
  return false;
}

function makeLink(target: string, display: string | null = null): LinkValue | null {
  const inner = target.trim().replace(/^\[\[/, "").replace(/\]\]$/, "");
  const parts = parseWikilinkInner(inner);
  const to = parts.target.replace(/\.md$/i, "").trim();
  if (!to) return null;
  return { kind: "link", target: to, display: display ?? parts.alias };
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
  if (Array.isArray(v)) return v.map(show).filter((s) => s !== "").join(", ");
  if (v.kind === "link") return v.display || linkLabel(v.target);
  if (v.kind === "file") return v.name || linkLabel(v.target);
  if (v.kind === "props") return Object.entries(v.fields).map(([key, value]) => `${key}: ${value}`).join(", ");
  if (v.kind === "regex") return `/${v.source}/${v.flags}`;
  return formatDate(v, v.dateOnly ? "YYYY-MM-DD" : "YYYY-MM-DD HH:mm");
}

function quote(v: Value): string {
  if (Array.isArray(v)) return `[${v.map(quote).join(", ")}]`;
  if (isLink(v) || isFile(v)) return `[[${v.target}]]`;
  if (isProps(v)) return "properties";
  return typeof v === "string" ? `“${v}”` : show(v);
}

function truthy(v: Value): boolean {
  if (v === null) return false;
  if (typeof v === "boolean") return v;
  if (typeof v === "number") return v !== 0;
  if (Array.isArray(v)) return v.length > 0;
  if (typeof v === "object") return true;
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
  if (Array.isArray(v)) {
    throw new FormulaError(`The list ${quote(v)} is not a number. Use .length to count it, or .reduce(acc + value, 0) to add it up.`);
  }
  const n = numeric(v);
  if (n === null) throw new FormulaError(`${quote(v)} is not a number.`);
  return n;
}

function needText(v: Value, label: string): string {
  if (isRegex(v)) throw new FormulaError(`${label} takes text here, not the regex ${show(v)}.`);
  return show(v);
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
  if (isLink(v)) {
    const d = parseDate(v.target);
    if (d) return d;
  }
  if (Array.isArray(v)) {
    if (!v.length) return null;
    throw new FormulaError(`The list ${quote(v)} is not a date. Pick one item, like dates[0].`);
  }
  throw new FormulaError(`${quote(v)} is not a date. Use YYYY-MM-DD.`);
}

/** Date for comparisons; a [[2026-10-01]] link counts as its date. */
function dateOf(v: Value): DateValue | null {
  if (isDate(v)) return v;
  if (isLink(v)) return parseDate(v.target);
  if (Array.isArray(v) || isRegex(v)) return null;
  return parseDate(show(v));
}

/**
 * Frontmatter text as a typed value: `[a, b]` is a list, a value made only of
 * [[links]] is a link (or a list of links), anything else stays text.
 */
function splitFlowList(inner: string): string[] | null {
  const items: string[] = [];
  let depth = 0;
  let q: string | null = null;
  let cur = "";
  for (let i = 0; i < inner.length; i += 1) {
    const c = inner[i] ?? "";
    if (q) {
      cur += c;
      if (c === "\\" && q === '"' && i + 1 < inner.length) {
        cur += inner[i + 1];
        i += 1;
      } else if (c === q) q = null;
      continue;
    }
    if ((c === '"' || c === "'") && !cur.trim()) q = c;
    else if (c === "[") depth += 1;
    else if (c === "]") depth -= 1;
    else if (c === "," && depth === 0) {
      items.push(cur.trim());
      cur = "";
      continue;
    }
    if (depth < 0) return null;
    cur += c;
  }
  if (q || depth !== 0) return null;
  items.push(cur.trim());
  return items.filter((item) => item !== "");
}

function unquoteItem(item: string): string {
  if (item.length >= 2 && item.startsWith('"') && item.endsWith('"')) {
    try {
      return String(JSON.parse(item));
    } catch {
      return item.slice(1, -1);
    }
  }
  if (item.length >= 2 && item.startsWith("'") && item.endsWith("'")) return item.slice(1, -1).replace(/''/g, "'");
  return item;
}

function onlyLinks(s: string): LinkValue[] | null {
  const found: LinkValue[] = [];
  const re = /\[\[([^\]]+)\]\]/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(s))) {
    const link = makeLink(m[1] ?? "");
    if (link) found.push(link);
  }
  if (!found.length || s.replace(re, "").replace(/[\s,]/g, "")) return null;
  return found;
}

function typedProp(raw: string): Value {
  const s = raw.trim();
  if (s.startsWith("[") && !s.startsWith("[[") && s.endsWith("]")) {
    const items = splitFlowList(s.slice(1, -1));
    if (items) {
      return items.map((item) => {
        const text = unquoteItem(item);
        const links = onlyLinks(text);
        return links?.length === 1 ? (links[0] as LinkValue) : text;
      });
    }
  }
  const links = onlyLinks(s);
  if (links) return links.length === 1 ? (links[0] as LinkValue) : links;
  return raw;
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

type Scope = { value: Value; index: number; acc?: Value };
/** `values` is set only for summary formulas: one item per note in the group. */
type Ctx = { now: number; row: FormulaRow; scope: Scope[]; values?: Value[] };
type FnGroup = "logic" | "text" | "number" | "date" | "list" | "regex" | "link" | "file";
type Fn = {
  name: string;
  min: number;
  max: number;
  group: FnGroup;
  /** Shown when the call has the wrong number of values. */
  usage?: string;
  run?: (args: Value[], ctx: Ctx) => Value;
};

/** Functions whose later values are re-run per item, with value, index, and acc in scope. */
const LAMBDA_FUNCTIONS = new Set(["filter", "map", "reduce"]);

const text = (fn: (s: string) => Value) => (args: Value[]) => (args[0] === null ? null : fn(show(args[0])));
const num = (fn: (n: number) => number) => (args: Value[]) => {
  const n = needNumber(args[0] ?? null);
  return n === null ? null : fn(n);
};
const datePart = (fn: (t: Date) => number) => (args: Value[]) => {
  const d = toDate(args[0] ?? null);
  return d ? fn(new Date(d.ms)) : null;
};

function has(v: Value, x: Value): boolean {
  if (v === null) return false;
  if (Array.isArray(v)) return v.some((item) => equals(item, x));
  if (isLink(v)) return linkMatches(v, x);
  return show(v).includes(needText(x, "contains()"));
}

function flatten(list: Value[]): Value[] {
  const out: Value[] = [];
  for (const item of list) {
    if (Array.isArray(item)) out.push(...flatten(item));
    else out.push(item);
  }
  return out;
}

function uniqueKey(v: Value): string {
  if (v === null) return "0";
  if (Array.isArray(v)) return `L[${v.map(uniqueKey).join(",")}]`;
  if (isLink(v)) return `K${linkKey(v.target)}`;
  if (isDate(v)) return `D${v.ms}`;
  if (isRegex(v)) return `R${show(v)}`;
  const n = numeric(v);
  return n !== null ? `N${n}` : `S${show(v)}`;
}

function sortList(list: Value[]): Value[] {
  return [...list].sort((a, b) => {
    if (isBlank(a)) return isBlank(b) ? 0 : 1;
    if (isBlank(b)) return -1;
    return order(a, b) ?? 0;
  });
}

/** Numbers in a list (or several values); text, dates, and blanks are skipped. */
function numbersIn(args: Value[]): number[] {
  return flatten(args)
    .map((v) => numeric(v))
    .filter((n): n is number => n !== null);
}

/** Smallest or largest: dates when every value is a date, else numbers. */
function extreme(args: Value[], sign: 1 | -1): Value {
  const items = flatten(args).filter((v) => !isBlank(v));
  if (!items.length) return null;
  const dates = items.map((v) => (numeric(v) === null ? dateOf(v) : null));
  if (dates.every((d): d is DateValue => d !== null)) {
    return dates.reduce((best, d) => ((d.ms - best.ms) * sign > 0 ? d : best));
  }
  const nums = items.map((a) => needNumber(a)).filter((n): n is number => n !== null);
  return sign > 0 ? Math.max(...nums) : Math.min(...nums);
}

function median(nums: number[]): number | null {
  if (!nums.length) return null;
  const sorted = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? (sorted[mid] as number) : ((sorted[mid - 1] as number) + (sorted[mid] as number)) / 2;
}

function optionalText(v: Value | undefined): string | null {
  return v === undefined || v === null || v === "" ? null : show(v);
}

const FUNCTION_LIST: Fn[] = [
  { name: "if", min: 2, max: 3, group: "logic" },
  { name: "empty", min: 1, max: 1, group: "logic", run: ([v]) => isBlank(v ?? null) || (typeof v === "string" && !v.trim()) },
  { name: "isEmpty", min: 1, max: 1, group: "logic", run: ([v]) => isBlank(v ?? null) || (typeof v === "string" && !v.trim()) },
  { name: "string", min: 1, max: 1, group: "text", run: ([v]) => show(v ?? null) },
  { name: "toString", min: 1, max: 1, group: "text", run: ([v]) => show(v ?? null) },
  { name: "lower", min: 1, max: 1, group: "text", run: text((s) => s.toLowerCase()) },
  { name: "upper", min: 1, max: 1, group: "text", run: text((s) => s.toUpperCase()) },
  { name: "trim", min: 1, max: 1, group: "text", run: text((s) => s.trim()) },
  {
    name: "length",
    min: 1,
    max: 1,
    group: "text",
    run: ([v]) => (v === null || v === undefined ? 0 : Array.isArray(v) ? v.length : show(v).length),
  },
  { name: "contains", min: 2, max: 2, group: "text", run: ([v, x]) => has(v ?? null, x ?? null) },
  { name: "containsAll", min: 2, max: 32, group: "text", run: ([v, ...xs]) => xs.every((x) => has(v ?? null, x)) },
  { name: "containsAny", min: 2, max: 32, group: "text", run: ([v, ...xs]) => xs.some((x) => has(v ?? null, x)) },
  { name: "startsWith", min: 2, max: 2, group: "text", run: ([v, s]) => v !== null && v !== undefined && show(v).startsWith(show(s ?? null)) },
  { name: "endsWith", min: 2, max: 2, group: "text", run: ([v, s]) => v !== null && v !== undefined && show(v).endsWith(show(s ?? null)) },
  {
    name: "replace",
    min: 3,
    max: 3,
    group: "text",
    run: ([v, a, b]) => {
      if (v === null || v === undefined) return null;
      const to = needText(b ?? null, "replace()");
      if (a && isRegex(a)) return show(v).replace(toRegExp(a, true), to);
      const find = show(a ?? null);
      return find ? show(v).split(find).join(to) : show(v);
    },
  },
  {
    name: "slice",
    min: 2,
    max: 3,
    group: "text",
    run: (args) => {
      const v = args[0] ?? null;
      if (v === null) return null;
      const start = needNumber(args[1] ?? null) ?? 0;
      const end = args.length > 2 ? needNumber(args[2] ?? null) : null;
      if (Array.isArray(v)) return v.slice(start, end ?? undefined);
      return show(v).slice(start, end ?? undefined);
    },
  },
  {
    name: "split",
    min: 2,
    max: 3,
    group: "text",
    run: ([v, sep, n]) => {
      if (v === null || v === undefined) return [];
      const s = show(v);
      if (!s) return [];
      const limit = n === undefined ? null : needNumber(n);
      if (limit !== null && (!Number.isInteger(limit) || limit < 0)) {
        throw new FormulaError('split() keeps a whole number of parts, like split(",", 2).');
      }
      if (sep && isRegex(sep)) return s.split(toRegExp(sep, false), limit ?? undefined);
      return s.split(show(sep ?? null), limit ?? undefined);
    },
  },
  {
    name: "number",
    min: 1,
    max: 1,
    group: "number",
    run: ([v]) => {
      if (v === undefined || v === null) return null;
      if (typeof v === "boolean") return v ? 1 : 0;
      if (isDate(v)) return v.ms;
      return needNumber(v);
    },
  },
  {
    name: "round",
    min: 1,
    max: 2,
    group: "number",
    run: (args) => {
      const n = needNumber(args[0] ?? null);
      if (n === null) return null;
      const f = 10 ** Math.max(0, Math.min(10, needNumber(args[1] ?? null) ?? 0));
      return Math.round(n * f) / f;
    },
  },
  { name: "floor", min: 1, max: 1, group: "number", run: num(Math.floor) },
  { name: "ceil", min: 1, max: 1, group: "number", run: num(Math.ceil) },
  { name: "abs", min: 1, max: 1, group: "number", run: num(Math.abs) },
  { name: "min", min: 1, max: 32, group: "number", run: (args) => extreme(args, -1) },
  { name: "max", min: 1, max: 32, group: "number", run: (args) => extreme(args, 1) },
  { name: "sum", min: 1, max: 32, group: "number", run: (args) => numbersIn(args).reduce((acc, n) => acc + n, 0) },
  {
    name: "mean",
    min: 1,
    max: 32,
    group: "number",
    run: (args) => {
      const nums = numbersIn(args);
      return nums.length ? nums.reduce((acc, n) => acc + n, 0) / nums.length : null;
    },
  },
  { name: "median", min: 1, max: 32, group: "number", run: (args) => median(numbersIn(args)) },
  {
    name: "stddev",
    min: 1,
    max: 32,
    group: "number",
    run: (args) => {
      const nums = numbersIn(args);
      if (!nums.length) return null;
      const mean = nums.reduce((acc, n) => acc + n, 0) / nums.length;
      return Math.sqrt(nums.reduce((acc, n) => acc + (n - mean) ** 2, 0) / nums.length);
    },
  },
  {
    name: "toFixed",
    min: 2,
    max: 2,
    group: "number",
    run: ([v, d]) => {
      const n = needNumber(v ?? null);
      const digits = needNumber(d ?? null) ?? 0;
      if (!Number.isInteger(digits) || digits < 0 || digits > 20) {
        throw new FormulaError("toFixed() keeps 0 to 20 decimal places, like price.toFixed(2).");
      }
      return n === null ? null : n.toFixed(digits);
    },
  },
  { name: "date", min: 1, max: 1, group: "date", run: ([v]) => toDate(v ?? null) },
  { name: "now", min: 0, max: 0, group: "date", run: (_a, ctx) => ({ kind: "date", ms: ctx.now, dateOnly: false }) },
  { name: "today", min: 0, max: 0, group: "date", run: (_a, ctx) => ({ kind: "date", ms: startOfDay(ctx.now), dateOnly: true }) },
  {
    name: "format",
    min: 1,
    max: 2,
    group: "date",
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
    group: "date",
    run: ([v], ctx) => {
      const d = toDate(v ?? null);
      return d ? relative(d, ctx.now) : null;
    },
  },
  { name: "year", min: 1, max: 1, group: "date", run: datePart((t) => t.getUTCFullYear()) },
  { name: "month", min: 1, max: 1, group: "date", run: datePart((t) => t.getUTCMonth() + 1) },
  { name: "day", min: 1, max: 1, group: "date", run: datePart((t) => t.getUTCDate()) },
  { name: "list", min: 1, max: 1, group: "list", run: ([v]) => listOf(v ?? null) },
  {
    name: "filter",
    min: 2,
    max: 2,
    group: "list",
    usage: 'filter() keeps the items that pass a test, like tags.filter(value != "draft").',
  },
  { name: "map", min: 2, max: 2, group: "list", usage: "map() changes every item, like tags.map(upper(value))." },
  {
    name: "reduce",
    min: 2,
    max: 3,
    group: "list",
    usage: "reduce() folds a list into one value, like scores.reduce(acc + value, 0).",
  },
  {
    name: "join",
    min: 1,
    max: 2,
    group: "list",
    run: ([v, sep]) =>
      listOf(v ?? null)
        .map(show)
        .filter((item) => item !== "")
        .join(sep === undefined ? ", " : needText(sep, "join()")),
  },
  { name: "sort", min: 1, max: 1, group: "list", run: ([v]) => sortList(listOf(v ?? null)) },
  {
    name: "unique",
    min: 1,
    max: 1,
    group: "list",
    run: ([v]) => {
      const seen = new Set<string>();
      return listOf(v ?? null).filter((item) => {
        const key = uniqueKey(item);
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
    },
  },
  { name: "flat", min: 1, max: 1, group: "list", run: ([v]) => flatten(listOf(v ?? null)) },
  {
    name: "reverse",
    min: 1,
    max: 1,
    group: "list",
    run: ([v]) => {
      if (v === null || v === undefined) return null;
      if (Array.isArray(v)) return [...v].reverse();
      return [...show(v)].reverse().join("");
    },
  },
  {
    name: "matches",
    min: 2,
    max: 2,
    group: "regex",
    run: ([a, b]) => {
      const first = a ?? null;
      const second = b ?? null;
      const re = isRegex(first) ? first : isRegex(second) ? second : null;
      if (!re) throw new FormulaError("matches() needs a regex, like status.matches(/^draft/i). Use contains() for plain text.");
      const other = re === first ? second : first;
      if (isRegex(other)) throw new FormulaError("matches() compares a regex with text, not two regexes.");
      if (other === null) return false;
      return toRegExp(re, false).test(show(other));
    },
  },
  {
    name: "link",
    min: 1,
    max: 2,
    group: "link",
    run: ([t, d]) => {
      const target = t ?? null;
      if (isBlank(target)) return null;
      const display = optionalText(d);
      if (isLink(target)) return { ...target, display: display ?? target.display };
      if (typeof target !== "string") throw new FormulaError(`link() needs a note title or path, not ${quote(target)}.`);
      return makeLink(target, display);
    },
  },
  {
    name: "asFile",
    min: 1,
    max: 1,
    group: "link",
    run: ([v], ctx) => {
      const target = v ?? null;
      if (!isLink(target) && !isFile(target)) {
        if (target === null || target === "") return null;
        throw new FormulaError('asFile() needs a link, like link("Note").asFile().');
      }
      return ctx.row.fileAt?.(target.target) ?? null;
    },
  },
  {
    name: "linksTo",
    min: 2,
    max: 2,
    group: "link",
    run: ([v, other], ctx) => {
      const target = v ?? null;
      if (!isLink(target) && !isFile(target)) {
        if (target === null || target === "") return false;
        throw new FormulaError('linksTo() needs a link, like link("Note").linksTo(file.asLink()).');
      }
      const want = linkTargetOf(other ?? null);
      if (!want) return false;
      const links = ctx.row.linksAt?.(target.target);
      if (!links) return false;
      return links.some((link) => sameNote(link.target, want));
    },
  },
];

/** `file.<name>(…)`: questions about the note this row is. */
const FILE_FUNCTION_LIST: Fn[] = [
  {
    name: "hasLink",
    min: 1,
    max: 1,
    group: "file",
    run: ([t], ctx) => {
      const target = t ?? null;
      if (isBlank(target)) return false;
      const want = isLink(target) ? target.target : needText(target, "file.hasLink()");
      return (ctx.row.outlinks?.() ?? []).some((link) => sameNote(link.target, want));
    },
  },
  {
    name: "hasTag",
    min: 1,
    max: 32,
    group: "file",
    run: (args, ctx) => {
      const tags = ctx.row.tags?.() ?? [];
      return flatten(args).some((t) => {
        const want = show(t).trim().replace(/^#/, "").toLowerCase();
        return !!want && tags.some((tag) => tag === want || tag.startsWith(`${want}/`));
      });
    },
  },
  {
    name: "hasProperty",
    min: 1,
    max: 1,
    group: "file",
    run: ([k], ctx) => {
      const key = show(k ?? null).trim().toLowerCase();
      return !!key && Object.keys(ctx.row.props).some((p) => p.toLowerCase() === key);
    },
  },
  {
    name: "inFolder",
    min: 1,
    max: 1,
    group: "file",
    run: ([f], ctx) => {
      const want = show(f ?? null).replace(/\\/g, "/").replace(/^\/+|\/+$/g, "").toLowerCase();
      const folder = ctx.row.folder.toLowerCase();
      return !want || folder === want || folder.startsWith(`${want}/`);
    },
  },
  {
    name: "asLink",
    min: 0,
    max: 1,
    group: "file",
    run: ([d], ctx) => ({ kind: "link", target: ctx.row.path.replace(/\.md$/i, ""), display: optionalText(d) ?? ctx.row.name }),
  },
];

const FUNCTIONS = new Map(FUNCTION_LIST.map((fn) => [fn.name.toLowerCase(), fn]));
const FILE_FUNCTIONS = new Map(FILE_FUNCTION_LIST.map((fn) => [fn.name.toLowerCase(), fn]));

/** Function names, in the order the help lists them. */
export const FORMULA_FUNCTIONS = FUNCTION_LIST.map((fn) => fn.name);

const GROUP_LABELS: Record<FnGroup, string> = {
  logic: "Logic",
  text: "Text",
  number: "Numbers",
  date: "Dates",
  list: "Lists",
  regex: "Regex",
  link: "Links",
  file: "This note",
};

/** Help lines: each group's functions, file ones written as file.name(). */
export const FORMULA_FUNCTION_GROUPS: { group: FnGroup; label: string; names: string[] }[] = (
  Object.keys(GROUP_LABELS) as FnGroup[]
).map((group) => ({
  group,
  label: GROUP_LABELS[group],
  names: [
    ...FUNCTION_LIST.filter((fn) => fn.group === group).map((fn) => fn.name),
    ...FILE_FUNCTION_LIST.filter((fn) => fn.group === group).map((fn) => `file.${fn.name}`),
  ],
}));

export const FORMULA_EXAMPLES: { formula: string; label: string; name: string }[] = [
  { formula: "file.mtime.relative()", label: "Edited, like “3 days ago”", name: "Edited" },
  { formula: 'date(due).format("MMM D, YYYY")', label: "Format a date property", name: "Due" },
  { formula: 'if(empty(due), "—", date(due) - today())', label: "Days until due", name: "Days left" },
  { formula: 'date(due) + "7d"', label: "A week after due", name: "Follow up" },
  { formula: 'if(status == "done", "Done", status.upper())', label: "Compare and change text", name: "Status" },
  { formula: 'round(number(estimate) / 60, 1) & " h"', label: "Math on a number property", name: "Hours" },
  { formula: 'if(contains(lower(tags), "writing"), "Writing", file.folder)', label: "Text contains", name: "Area" },
  { formula: "file.backlinks", label: "Links: notes that link here", name: "Backlinks" },
  { formula: "file.asLink().asFile()", label: "This note, opened as a file", name: "This file" },
  { formula: "file.asLink().asFile().name", label: "Name of the note a link opens", name: "Linked name" },
  { formula: 'file.links.filter(!value.matches(/^\\d{4}-/)).slice(0, 3)', label: "List + regex: first 3 links, no dailies", name: "Links" },
  { formula: 'file.tags.map("#" & value).join(" ")', label: "List: every tag", name: "Tags" },
];

function arityMessage(fn: Fn, method: boolean, file = false): string {
  if (fn.usage) return fn.usage;
  const lo = method ? fn.min - 1 : fn.min;
  const hi = method ? fn.max - 1 : fn.max;
  const label = file ? `file.${fn.name}()` : method ? `.${fn.name}()` : `${fn.name}()`;
  if (fn.name === "if") return "if() needs two or three parts: if(test, then, else).";
  if (hi <= 0) return `${label} takes no values.`;
  const span = lo === hi ? `${lo}` : hi >= 32 ? `${lo} or more` : `${lo} to ${hi}`;
  return `${label} takes ${span} value${span === "1" ? "" : "s"}.`;
}

const SUMMARY_ONLY_VALUES = "A summary formula reads values, the column's values in each group";

class Parser {
  private i = 0;
  /** Inside filter/map/reduce, value, index, and acc name the current item. */
  private lambda = 0;
  /** A summary formula runs once per group: it reads `values`, not one note's fields. */
  constructor(
    private readonly toks: Token[],
    private readonly summary = false,
  ) {}

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

  /** `lambdaFrom`: index of the value that is re-run per list item. */
  private callArgs(label: string, lambdaFrom = Number.POSITIVE_INFINITY): Node[] {
    this.i += 1;
    const out: Node[] = [];
    if (!this.peek()) throw new FormulaError(`${label} needs a closing ).`);
    if (this.isOp(")")) {
      this.i += 1;
      return out;
    }
    for (;;) {
      const inLambda = out.length === lambdaFrom;
      if (inLambda) this.lambda += 1;
      try {
        out.push(this.or());
      } finally {
        if (inLambda) this.lambda -= 1;
      }
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
    for (;;) {
      if (this.isOp("[")) {
        this.i += 1;
        if (this.isOp("]")) throw new FormulaError("[ ] needs a position, like tags[0].");
        const index = this.or();
        this.expect("]", "A position needs a closing ], like tags[0].");
        node = { k: "index", a: node, i: index };
        continue;
      }
      if (!this.isOp(".")) return node;
      this.i += 1;
      const t = this.peek();
      if (t?.t !== "id") throw new FormulaError("A name must follow the dot.");
      this.i += 1;
      const fn = FUNCTIONS.get(t.v.toLowerCase());
      if (!fn || fn.name === "if" || fn.max === 0) {
        if (this.isOp("(")) throw new FormulaError(`.${t.v}() is not a formula function.`);
        node = { k: "get", a: node, key: t.v };
        continue;
      }
      if ((fn.name === "asFile" || fn.name === "linksTo") && !this.isOp("(")) {
        throw new FormulaError(
          fn.name === "asFile"
            ? 'asFile() needs (), like link("Note").asFile().'
            : 'linksTo() needs a file, like link("Note").linksTo(file.asLink()).',
        );
      }
      const lambda = LAMBDA_FUNCTIONS.has(fn.name);
      if (lambda && !this.isOp("(")) throw new FormulaError(arityMessage(fn, true));
      const args = [node, ...(this.isOp("(") ? this.callArgs(`.${fn.name}(`, lambda ? 0 : undefined) : [])];
      if (args.length < fn.min || args.length > fn.max) throw new FormulaError(arityMessage(fn, true));
      node = { k: "call", name: fn.name, args };
    }
  }

  private primary(): Node {
    const t = this.peek();
    if (!t) throw new FormulaError("Formula is incomplete.");
    this.i += 1;
    if (t.t === "num" || t.t === "str") return { k: "lit", v: t.v };
    if (t.t === "re") return { k: "lit", v: { kind: "regex", source: t.source, flags: t.flags } };
    if (t.t === "op") {
      if (t.v === "(") {
        const inner = this.or();
        this.expect(")", "Formula is missing a closing ).");
        return inner;
      }
      if (t.v === "[") {
        const items: Node[] = [];
        if (this.isOp("]")) {
          this.i += 1;
          return { k: "list", items };
        }
        for (;;) {
          items.push(this.or());
          if (this.isOp(",")) {
            this.i += 1;
            continue;
          }
          this.expect("]", "List needs a closing ], like [1, 2].");
          return { k: "list", items };
        }
      }
      throw new FormulaError(`Formula has “${t.v}” where a value should be.`);
    }
    const word = t.v;
    const lower = word.toLowerCase();
    if (lower === "true" || lower === "false") return { k: "lit", v: lower === "true" };
    if (lower === "null") return { k: "lit", v: null };
    if (this.isOp("(")) {
      const fn = FUNCTIONS.get(lower);
      if (!fn) {
        if (FILE_FUNCTIONS.has(lower)) throw new FormulaError(`${word}() is a file method. Write file.${FILE_FUNCTIONS.get(lower)?.name}(…).`);
        throw new FormulaError(`${word}() is not a formula function.`);
      }
      const args = this.callArgs(`${fn.name}(`, LAMBDA_FUNCTIONS.has(fn.name) ? 1 : undefined);
      if (args.length < fn.min || args.length > fn.max) throw new FormulaError(arityMessage(fn, false));
      return { k: "call", name: fn.name, args };
    }
    if (this.lambda > 0 && (word === "value" || word === "index" || word === "acc")) return { k: "local", name: word };
    if (this.summary) {
      if (word === "values") return { k: "local", name: "values" };
      if (word === "file" || word === "formula" || word === "note") {
        throw new FormulaError(`${SUMMARY_ONLY_VALUES}; ${word}. reads one note, and a summary runs once per group.`);
      }
      throw new FormulaError(`${SUMMARY_ONLY_VALUES}, not the property “${word}”. Pick the column, then use values, like values.filter(value == "done").length.`);
    }
    if (word === "file" && this.isOp(".")) {
      this.i += 1;
      const key = this.peek();
      this.i += 1;
      const method = key?.t === "id" ? FILE_FUNCTIONS.get(key.v.toLowerCase()) : undefined;
      if (method && this.isOp("(")) {
        const args = this.callArgs(`file.${method.name}(`);
        if (args.length < method.min || args.length > method.max) throw new FormulaError(arityMessage(method, false, true));
        return { k: "call", name: `file.${method.name}`, args };
      }
      if (method) throw new FormulaError(`file.${method.name} needs (…), like file.${method.name}(${method.min ? '"…"' : ""}).`);
      const field = key?.t === "id" ? FILE_KEYS.find((k) => k === key.v) : undefined;
      if (!field) {
        throw new FormulaError(
          `file. needs ${FILE_KEYS.join(", ")}, or ${FILE_FUNCTION_LIST.map((fn) => `${fn.name}()`).join(", ")}.`,
        );
      }
      return { k: "file", key: field };
    }
    if (word === "note" && this.isOp(".")) {
      this.i += 1;
      const key = this.peek();
      this.i += 1;
      if (key?.t !== "id") throw new FormulaError("note. needs a property name.");
      return { k: "prop", key: key.v };
    }
    if (word === "formula" && (this.isOp(".") || this.isOp("["))) {
      const bracket = this.isOp("[");
      this.i += 1;
      const key = this.peek();
      this.i += 1;
      if (bracket) {
        if (key?.t !== "str") throw new FormulaError('formula[ needs a quoted column name, like formula["Days left"].');
        this.expect("]", "formula[ needs a closing ].");
        return { k: "ref", key: key.v };
      }
      if (key?.t !== "id") throw new FormulaError("formula. needs a column name.");
      return { k: "ref", key: key.v };
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
  const blankA = isBlank(a);
  const blankB = isBlank(b);
  if (blankA || blankB) return blankA && blankB;
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
    return a.every((item, i) => equals(item, b[i] ?? null));
  }
  if (isRegex(a) || isRegex(b)) return isRegex(a) && isRegex(b) && a.source === b.source && a.flags === b.flags;
  if (isDate(a) || isDate(b)) {
    const da = dateOf(a);
    const db = dateOf(b);
    return !!da && !!db && da.ms === db.ms;
  }
  if (isLink(a) || isFile(a)) return linkTargetOf(b) !== null && sameNote((a as LinkValue | FileValue).target, linkTargetOf(b) as string);
  if (isLink(b) || isFile(b)) return linkTargetOf(a) !== null && sameNote((b as LinkValue | FileValue).target, linkTargetOf(a) as string);
  const na = numeric(a);
  const nb = numeric(b);
  if (na !== null && nb !== null) return na === nb;
  return show(a) === show(b);
}

function order(a: Value, b: Value): number | null {
  if (isBlank(a) || isBlank(b)) return null;
  if (isDate(a) || isDate(b)) {
    const da = dateOf(a);
    const db = dateOf(b);
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
  if (Array.isArray(a) || Array.isArray(b)) {
    if (Array.isArray(a) && Array.isArray(b)) return [...a, ...b];
    if (Array.isArray(a)) return b === null ? a : [...a, b];
    return a === null ? (b as Value[]) : [a, ...(b as Value[])];
  }
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
  if (isLink(a) && isDate(b)) a = dateOf(a) ?? a;
  if (isLink(b) && isDate(a)) b = dateOf(b) ?? b;
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

const typedProps = new WeakMap<Record<string, string>, Map<string, Value>>();

function lookupFields(fields: Record<string, string>, key: string): Value {
  const found = Object.prototype.hasOwnProperty.call(fields, key)
    ? key
    : Object.keys(fields).find((k) => k.toLowerCase() === key.toLowerCase());
  const raw = found === undefined ? undefined : fields[found];
  if (raw === undefined || found === undefined) return null;
  let cache = typedProps.get(fields);
  if (!cache) {
    cache = new Map();
    typedProps.set(fields, cache);
  }
  if (!cache.has(found)) cache.set(found, typedProp(raw));
  return cache.get(found) ?? null;
}

function readProp(row: FormulaRow, key: string): Value {
  return lookupFields(row.props, key);
}

/** `.name`, `.path`, `.properties`, and `.mtime` on the file `asFile()` returned. */
function readFileField(file: FileValue, key: string): Value {
  const field = key.trim().toLowerCase();
  if (field === "name") return file.name;
  if (field === "path") return file.path;
  if (field === "properties") return { kind: "props", fields: file.props };
  if (field === "mtime") return file.mtime ? { kind: "date", ms: file.mtime, dateOnly: false } : null;
  if (field === "size") throw new FormulaError("asFile() has no size. Nexus does not store how many bytes a note is.");
  if (field === "ctime") throw new FormulaError("asFile() has no ctime. Nexus keeps when a note was edited, not when it was created.");
  throw new FormulaError(`A file has no .${key}. It has name, path, properties, and mtime.`);
}

function readMember(v: Value, key: string): Value {
  if (v === null || v === "") return null;
  if (isFile(v)) return readFileField(v, key);
  if (isProps(v)) return lookupFields(v.fields, key);
  throw new FormulaError(`${quote(v)} has no .${key}.`);
}

function evalNode(node: Node, row: FormulaRow, ctx: Ctx): Value {
  switch (node.k) {
    case "lit":
      return node.v;
    case "prop":
      return readProp(row, node.key);
    case "ref": {
      const hit = row.refs?.get(node.key.toLowerCase());
      if (!hit) throw new FormulaError(`formula.${node.key} is not a formula column to the left of this one.`);
      if ("error" in hit) throw new FormulaError(`formula.${node.key} has an error.`);
      return hit.value;
    }
    case "file":
      if (node.key === "mtime") return row.mtime ? { kind: "date", ms: row.mtime, dateOnly: false } : null;
      if (node.key === "ext") {
        const base = row.path.split("/").pop() ?? "";
        const dot = base.lastIndexOf(".");
        return dot > 0 ? base.slice(dot + 1) : "";
      }
      if (node.key === "links" || node.key === "backlinks") {
        const links = (node.key === "links" ? row.outlinks : row.backlinks)?.() ?? [];
        return links.map((link) => ({ kind: "link", target: link.target, display: link.display ?? null }));
      }
      if (node.key === "tags") return [...(row.tags?.() ?? [])];
      return row[node.key];
    case "local": {
      if (node.name === "values") {
        if (!ctx.values) throw new FormulaError("values only works in a summary formula.");
        return ctx.values;
      }
      const top = ctx.scope[ctx.scope.length - 1];
      if (!top) throw new FormulaError(`${node.name} only works inside filter(), map(), or reduce().`);
      if (node.name === "acc") {
        if (!("acc" in top)) throw new FormulaError("acc only works inside reduce().");
        return top.acc ?? null;
      }
      return node.name === "index" ? top.index : top.value;
    }
    case "list":
      return node.items.map((item) => evalNode(item, row, ctx));
    case "get":
      return readMember(evalNode(node.a, row, ctx), node.key);
    case "index": {
      const list = evalNode(node.a, row, ctx);
      if (isFile(list) || isProps(list)) {
        const key = evalNode(node.i, row, ctx);
        if (typeof key !== "string" || !key.trim()) {
          throw new FormulaError(
            isFile(list)
              ? 'A file field needs a name in quotes, like asFile()["path"].'
              : 'A property name needs quotes, like .properties["due date"].',
          );
        }
        return isFile(list) ? readFileField(list, key) : lookupFields(list.fields, key);
      }
      const at = needNumber(evalNode(node.i, row, ctx));
      if (list === null || at === null) return null;
      if (!Array.isArray(list)) throw new FormulaError(`${quote(list)} is not a list, so it has no [${at}]. Use list(x) to make one.`);
      if (!Number.isInteger(at)) throw new FormulaError(`List positions are whole numbers, like tags[0], not ${at}.`);
      return list[at < 0 ? list.length + at : at] ?? null;
    }
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
      if (LAMBDA_FUNCTIONS.has(node.name)) return runLambda(node.name, node.args, row, ctx);
      const fn = node.name.startsWith("file.")
        ? FILE_FUNCTIONS.get(node.name.slice(5).toLowerCase())
        : FUNCTIONS.get(node.name.toLowerCase());
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

function runLambda(name: string, args: Node[], row: FormulaRow, ctx: Ctx): Value {
  const [listNode, body, initial] = args as [Node, Node, Node | undefined];
  const source = evalNode(listNode, row, ctx);
  if (isRegex(source) || isDate(source)) throw new FormulaError(`${name}() works on lists, not ${quote(source)}.`);
  const items = listOf(source);
  const step = (scope: Scope): Value => {
    ctx.scope.push(scope);
    try {
      return evalNode(body, row, ctx);
    } finally {
      ctx.scope.pop();
    }
  };
  if (name === "filter") return items.filter((value, index) => truthy(step({ value, index })));
  if (name === "map") return items.map((value, index) => step({ value, index }));
  // Without a start value, the first item is the start, as in JavaScript.
  const start = initial ? 0 : 1;
  let acc: Value = initial ? evalNode(initial, row, ctx) : (items[0] ?? null);
  for (let index = start; index < items.length; index += 1) {
    acc = step({ value: items[index] ?? null, index, acc });
  }
  return acc;
}

/** Milliseconds for a YYYY-MM-DD (or [[YYYY-MM-DD]], or ISO date-time) value, else null. */
export function parseFormulaDate(raw: string): number | null {
  return parseDate(raw)?.ms ?? null;
}

/** Parse once per view; an empty formula compiles to no program. */
export function compileNoteFormula(source: string, summary = false): CompiledFormula {
  const trimmed = source.trim();
  if (!trimmed) return { program: null, error: null };
  try {
    const tokens = lex(trimmed);
    if (!tokens.length) return { program: null, error: null };
    return { program: new Parser(tokens, summary).parse(), error: null };
  } catch (err) {
    if (err instanceof FormulaError) return { program: null, error: err.message };
    throw err;
  }
}

export function runNoteFormula(compiled: CompiledFormula, row: FormulaRow, now = Date.now()): FormulaResult {
  if (compiled.error) return { value: "", error: compiled.error, sort: null, raw: null };
  if (!compiled.program) return { value: "", error: null, sort: null, raw: null };
  try {
    const v = evalNode(compiled.program, row, { now, row, scope: [] });
    const sort = typeof v === "number" ? v : isDate(v) ? v.ms : typeof v === "boolean" ? Number(v) : null;
    return { value: show(v), error: null, sort, raw: v };
  } catch (err) {
    if (err instanceof FormulaError) return { value: "", error: err.message, sort: null, raw: null };
    throw err;
  }
}

/** A summary formula: reads `values` (one item per note in the group) instead of a note. */
export function compileSummaryFormula(source: string): CompiledFormula {
  const compiled = compileNoteFormula(source, true);
  if (!compiled.error && !compiled.program) return { program: null, error: "Summary formula is empty." };
  return compiled;
}

const NO_NOTE: FormulaRow = { name: "", path: "", folder: "", mtime: 0, props: {} };

export function runSummaryFormula(compiled: CompiledFormula, values: FormulaValue[], now = Date.now()): FormulaResult {
  if (compiled.error) return { value: "", error: compiled.error, sort: null, raw: null };
  if (!compiled.program) return { value: "", error: null, sort: null, raw: null };
  try {
    const v = evalNode(compiled.program, NO_NOTE, { now, row: NO_NOTE, scope: [], values });
    if (typeof v === "number" && !Number.isFinite(v)) throw new FormulaError("The summary did not produce a number.");
    const sort = typeof v === "number" ? v : isDate(v) ? v.ms : typeof v === "boolean" ? Number(v) : null;
    return { value: show(v), error: null, sort, raw: v };
  } catch (err) {
    if (err instanceof FormulaError) return { value: "", error: err.message, sort: null, raw: null };
    throw err;
  }
}

/** A frontmatter value typed the way formulas read it: lists, links, or text. */
export function formulaPropValue(raw: string | undefined): FormulaValue {
  return raw === undefined ? null : typedProp(raw);
}

export const SUMMARY_FORMULA_EXAMPLES: { formula: string; label: string; name: string }[] = [
  { formula: "values.mean().round(2)", label: "Average, 2 decimals", name: "Mean" },
  { formula: "values.filter(!value.isEmpty()).length / values.length", label: "Share of notes with a value", name: "Filled share" },
  { formula: 'values.filter(value == "done").length', label: "Count one value", name: "Done" },
  { formula: "values.unique().join(\", \")", label: "Every different value", name: "Values" },
  { formula: "values.max() - values.min()", label: "Spread: numbers, or days between dates", name: "Spread" },
];
