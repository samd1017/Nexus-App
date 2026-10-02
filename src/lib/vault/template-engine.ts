/**
 * Template rendering. Plain text substitution only — nothing is evaluated.
 *
 *   {{title}}  {{date}}  {{time}}  {{yesterday}}
 *   {{date:dddd, MMMM D}}      any date or time in its own format
 *   {{time:h:mm A}}
 *   {{date+7}} {{date-1}}      days from the template's date
 *   {{date+7:YYYY-MM-DD}}      both
 *   {{prompt:Attendees}}       asked once when the template is used
 *   {{carryover}}              open tasks from yesterday's daily note
 *
 * Unknown tokens are left as written.
 */

import { splitFrontmatter } from "../editor/frontmatter";

export const DEFAULT_DATE_FORMAT = "YYYY-MM-DD";
export const DEFAULT_TIME_FORMAT = "HH:mm";

export function formatDateISO(d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function formatTime(d: Date = new Date()): string {
  const h = String(d.getHours()).padStart(2, "0");
  const m = String(d.getMinutes()).padStart(2, "0");
  return `${h}:${m}`;
}

/** Calendar date shifted by `delta` days (local time). */
export function shiftDate(d: Date, delta: number): Date {
  const next = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  next.setDate(next.getDate() + delta);
  return next;
}

function addDays(d: Date, delta: number): Date {
  const next = new Date(d.getTime());
  next.setDate(next.getDate() + delta);
  return next;
}

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/**
 * The moment.js format tokens everyday templates use, with English names.
 * Text in [brackets] is kept as written; other characters pass through.
 */
const FORMAT_TOKEN =
  /\[([^\]]*)\]|YYYY|YY|Q|MMMM|MMM|MM|M|DDDD|DDD|Do|DD|D|dddd|ddd|dd|d|E|e|GGGG|GG|WW|W|gggg|gg|ww|w|HH|H|hh|h|kk|k|mm|m|ss|s|SSS|A|a|X|x|ZZ|Z/g;

function pad(n: number, width = 2): string {
  return String(Math.abs(n)).padStart(width, "0");
}

function ordinal(n: number): string {
  const tens = n % 100;
  if (tens >= 11 && tens <= 13) return `${n}th`;
  return `${n}${["th", "st", "nd", "rd"][n % 10] ?? "th"}`;
}

function dayOfYear(d: Date): number {
  return Math.round((Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) - Date.UTC(d.getFullYear(), 0, 1)) / 864e5) + 1;
}

/**
 * Week of year and its year. ISO weeks run Monday to Sunday and belong to the
 * year of their Thursday. US weeks run Sunday to Saturday; week 1 holds Jan 1.
 */
function weekOf(d: Date, iso: boolean): { week: number; year: number } {
  const anchor = iso ? addDays(d, 3 - ((d.getDay() + 6) % 7)) : addDays(d, 6 - d.getDay());
  return { week: Math.floor((dayOfYear(anchor) - 1) / 7) + 1, year: anchor.getFullYear() };
}

function offset(d: Date, sep: string): string {
  const mins = -d.getTimezoneOffset();
  return `${mins < 0 ? "-" : "+"}${pad(Math.trunc(mins / 60))}${sep}${pad(mins % 60)}`;
}

/** `d` written in a moment.js-style format such as `dddd, MMMM Do YYYY`. */
export function formatDate(d: Date, format: string): string {
  return format.replace(FORMAT_TOKEN, (tok, literal: string | undefined) => {
    if (literal !== undefined) return literal;
    const hours = d.getHours();
    switch (tok) {
      case "YYYY": return String(d.getFullYear());
      case "YY": return pad(d.getFullYear() % 100);
      case "Q": return String(Math.floor(d.getMonth() / 3) + 1);
      case "MMMM": return MONTHS[d.getMonth()];
      case "MMM": return MONTHS[d.getMonth()].slice(0, 3);
      case "MM": return pad(d.getMonth() + 1);
      case "M": return String(d.getMonth() + 1);
      case "DDDD": return pad(dayOfYear(d), 3);
      case "DDD": return String(dayOfYear(d));
      case "Do": return ordinal(d.getDate());
      case "DD": return pad(d.getDate());
      case "D": return String(d.getDate());
      case "dddd": return WEEKDAYS[d.getDay()];
      case "ddd": return WEEKDAYS[d.getDay()].slice(0, 3);
      case "dd": return WEEKDAYS[d.getDay()].slice(0, 2);
      case "d":
      case "e": return String(d.getDay());
      case "E": return String(d.getDay() || 7);
      case "GGGG": return String(weekOf(d, true).year);
      case "GG": return pad(weekOf(d, true).year % 100);
      case "WW": return pad(weekOf(d, true).week);
      case "W": return String(weekOf(d, true).week);
      case "gggg": return String(weekOf(d, false).year);
      case "gg": return pad(weekOf(d, false).year % 100);
      case "ww": return pad(weekOf(d, false).week);
      case "w": return String(weekOf(d, false).week);
      case "HH": return pad(hours);
      case "H": return String(hours);
      case "hh": return pad(hours % 12 || 12);
      case "h": return String(hours % 12 || 12);
      case "kk": return pad(hours || 24);
      case "k": return String(hours || 24);
      case "mm": return pad(d.getMinutes());
      case "m": return String(d.getMinutes());
      case "ss": return pad(d.getSeconds());
      case "s": return String(d.getSeconds());
      case "SSS": return pad(d.getMilliseconds(), 3);
      case "A": return hours < 12 ? "AM" : "PM";
      case "a": return hours < 12 ? "am" : "pm";
      case "X": return String(Math.floor(d.getTime() / 1000));
      case "x": return String(d.getTime());
      case "ZZ": return offset(d, "");
      case "Z": return offset(d, ":");
    }
    return tok;
  });
}

export type TemplateValues = {
  title: string;
  date: Date;
  prompts?: Readonly<Record<string, string>>;
  carryover?: readonly string[];
  /** Format for a bare {{date}}, {{yesterday}}, or {{date+N}}. */
  dateFormat?: string;
  /** Format for a bare {{time}}. */
  timeFormat?: string;
};

const TOKEN = /\{\{\s*([^{}\n]+?)\s*\}\}/g;
const PROMPT = /^prompt\s*:\s*(.+)$/i;
const MOMENT = /^(date|time|yesterday)\s*(?:([+-])\s*(\d{1,5}))?\s*(?::\s*(.*))?$/i;
const CARRYOVER = /\{\{\s*carryover\s*\}\}/i;
const CARRYOVER_LINE = /^[ \t]*\{\{\s*carryover\s*\}\}[ \t]*(?:\r?\n|$)/gim;

/** Prompt labels in first-seen order, each once. */
export function templatePrompts(source: string): string[] {
  const out: string[] = [];
  for (const m of source.matchAll(TOKEN)) {
    const p = PROMPT.exec(m[1]);
    const label = p?.[1].trim();
    if (label && !out.includes(label)) out.push(label);
  }
  return out;
}

export function usesCarryover(source: string): boolean {
  return CARRYOVER.test(source);
}

export function renderTemplate(source: string, values: TemplateValues): string {
  const items = values.carryover ?? [];
  // A line holding only {{carryover}} disappears when there is nothing to carry.
  const text = items.length ? source : source.replace(CARRYOVER_LINE, "");
  const dateFormat = values.dateFormat?.trim() || DEFAULT_DATE_FORMAT;
  const timeFormat = values.timeFormat?.trim() || DEFAULT_TIME_FORMAT;
  return text.replace(TOKEN, (whole, inner: string) => {
    const key = inner.trim();
    switch (key.toLowerCase()) {
      case "title":
        return values.title;
      case "carryover":
        return items.join("\n");
    }
    const moment = MOMENT.exec(key);
    if (moment) {
      const [, word, sign, amount, format] = moment;
      const kind = word.toLowerCase();
      if (sign && kind !== "date") return whole;
      const days = kind === "yesterday" ? -1 : sign ? Number(amount) * (sign === "-" ? -1 : 1) : 0;
      const fallback = kind === "time" ? timeFormat : dateFormat;
      return formatDate(addDays(values.date, days), format?.trim() || fallback);
    }
    const prompt = PROMPT.exec(key);
    if (prompt) return values.prompts?.[prompt[1].trim()] ?? "";
    return whole;
  });
}

type YamlEntry = { key: string | null; lines: string[] };

/** Properties Obsidian always treats as lists, even when written as one value. */
const LIST_PROPERTIES = new Set(["tags", "tag", "aliases", "alias", "cssclasses", "cssclass"]);

function unquote(text: string): string {
  return text.trim().replace(/^(["'])(.*)\1$/, "$2").trim();
}

/** Top-level YAML keys, each with its indented continuation lines. */
function yamlEntries(yaml: string): YamlEntry[] {
  const out: YamlEntry[] = [];
  for (const line of yaml.replace(/\r\n/g, "\n").split("\n")) {
    const continues = /^\s/.test(line) || /^-(\s|$)/.test(line);
    const top = continues ? null : /^([^\s#][^:]*?)\s*:(?:\s|$)/.exec(line);
    if (top) out.push({ key: unquote(top[1]).toLowerCase(), lines: [line] });
    else if (out.length && continues) out[out.length - 1].lines.push(line);
    else if (line.trim()) out.push({ key: null, lines: [line] });
  }
  return out;
}

type YamlValue =
  | { kind: "empty" }
  | { kind: "list"; items: string[]; flow: boolean }
  | { kind: "scalar"; text: string };

const stripComment = (s: string) => s.replace(/\s+#.*$/, "").trim();

function entryValue(e: YamlEntry): YamlValue {
  const first = e.lines[0];
  const rest = stripComment(first.slice(first.search(/:(?:\s|$)/) + 1));
  const more = e.lines.slice(1).filter((l) => l.trim() && !/^\s*#/.test(l));
  if (!rest || /^(~|null|""|'')$/i.test(rest)) {
    if (!more.length) return { kind: "empty" };
    if (more.every((l) => /^\s*-(\s|$)/.test(l))) {
      const items = more.map((l) => stripComment(l.replace(/^\s*-\s*/, ""))).filter(Boolean);
      return items.length ? { kind: "list", items, flow: false } : { kind: "empty" };
    }
    return { kind: "scalar", text: more.join("\n") };
  }
  if (/^\[.*\]$/.test(rest)) {
    const items = rest.slice(1, -1).split(",").map((s) => s.trim()).filter(Boolean);
    return items.length ? { kind: "list", items, flow: true } : { kind: "empty" };
  }
  return { kind: "scalar", text: rest };
}

function listItems(value: YamlValue, key: string): string[] {
  if (value.kind === "list") return value.items;
  if (value.kind === "scalar" && LIST_PROPERTIES.has(key)) {
    return value.text.split(",").map((s) => s.trim()).filter(Boolean);
  }
  return [];
}

function itemKey(item: string, key: string): string {
  const v = unquote(item);
  return key === "tags" || key === "tag" ? v.replace(/^#/, "").toLowerCase() : v;
}

/** The note's entry with the template's list items it lacks, or null when it already has them all. */
function mergeListEntry(note: YamlEntry, noteValue: YamlValue, template: YamlValue, key: string): string[] | null {
  const have = listItems(noteValue, key);
  const seen = new Set(have.map((i) => itemKey(i, key)));
  const extra: string[] = [];
  for (const item of listItems(template, key)) {
    const k = itemKey(item, key);
    if (seen.has(k)) continue;
    seen.add(k);
    extra.push(item);
  }
  if (!extra.length) return null;
  const head = note.lines[0].slice(0, note.lines[0].search(/:(?:\s|$)/));
  if (noteValue.kind === "list" && noteValue.flow) return [`${head}: [${[...have, ...extra].join(", ")}]`];
  if (noteValue.kind === "list") {
    const last = [...note.lines].reverse().find((l) => /^\s*-(\s|$)/.test(l)) ?? "  - ";
    const bullet = /^\s*-\s*/.exec(last)?.[0] ?? "  - ";
    return [...note.lines, ...extra.map((i) => `${bullet}${i}`)];
  }
  return [`${head}:`, ...[...have, ...extra].map((i) => `  - ${i}`)];
}

/**
 * Template properties merged into the note's. Missing properties are added,
 * list properties (tags, aliases, any list on both sides) gain the template's
 * items, and an empty property takes the template's value. Any other value the
 * note already has stays. Null when nothing changes.
 */
function mergeYaml(noteYaml: string | null, templateYaml: string | null): string | null {
  if (!templateYaml?.trim()) return null;
  const note = yamlEntries((noteYaml ?? "").replace(/\s+$/, ""));
  const byKey = new Map(note.flatMap((e, i) => (e.key ? [[e.key, i] as const] : [])));
  let changed = false;
  for (const t of yamlEntries(templateYaml)) {
    if (!t.key) continue;
    const tv = entryValue(t);
    const at = byKey.get(t.key);
    if (at === undefined) {
      byKey.set(t.key, note.length);
      note.push(t);
      changed = true;
      continue;
    }
    if (tv.kind === "empty") continue;
    const nv = entryValue(note[at]);
    if (nv.kind === "empty") {
      note[at] = { key: t.key, lines: t.lines };
      changed = true;
      continue;
    }
    const listy = LIST_PROPERTIES.has(t.key) || (nv.kind === "list" && tv.kind === "list");
    const lines = listy ? mergeListEntry(note[at], nv, tv, t.key) : null;
    if (lines) {
      note[at] = { key: t.key, lines };
      changed = true;
    }
  }
  return changed ? note.flatMap((e) => e.lines).join("\n") : null;
}

export type PropertyMerge = {
  markdown: string;
  /** Where the body began before the merge. */
  oldBodyStart: number;
  /** Where that same body begins now. */
  newBodyStart: number;
};

/**
 * Add a template's frontmatter to a note. Properties the note already has
 * keep their values.
 */
export function mergeTemplateProperties(
  noteMd: string,
  templateYaml: string | null,
): PropertyMerge {
  const { yaml, body } = splitFrontmatter(noteMd);
  const oldBodyStart = noteMd.length - body.length;
  const merged = mergeYaml(yaml, templateYaml);
  if (merged == null) return { markdown: noteMd, oldBodyStart, newBodyStart: oldBodyStart };
  const rest = body === "" || body.startsWith("\n") ? body : `\n${body}`;
  const markdown = `---\n${merged}\n---\n${rest}`;
  return { markdown, oldBodyStart, newBodyStart: markdown.length - body.length };
}

/** A rendered template, split into properties and the body to insert. */
export function splitRendered(rendered: string): { yaml: string | null; body: string } {
  const { yaml, body } = splitFrontmatter(rendered);
  return { yaml, body: body.replace(/^(?:[ \t]*\r?\n)+/, "") };
}

/** Insert a rendered template at `caret` (an offset into `noteMd`). */
export function insertTemplateAt(
  noteMd: string,
  caret: number,
  rendered: string,
): { markdown: string; caret: number } {
  const { yaml, body } = splitRendered(rendered);
  const merged = mergeTemplateProperties(noteMd, yaml);
  const md = merged.markdown;
  const at =
    caret >= merged.oldBodyStart
      ? Math.min(md.length, caret - merged.oldBodyStart + merged.newBodyStart)
      : md.length;
  // A multi-line template starts its own line; a one-liner stays inline.
  const midLine = at > merged.newBodyStart && md[at - 1] !== "\n";
  const text = midLine && body.trimEnd().includes("\n") ? `\n${body}` : body;
  return { markdown: md.slice(0, at) + text + md.slice(at), caret: at + text.length };
}

/** Rendered template added after everything already in the note. */
export function appendTemplate(noteMd: string, rendered: string): string {
  const trimmed = noteMd.replace(/\s+$/, "");
  const base = trimmed ? `${trimmed}\n\n` : "";
  return insertTemplateAt(base, base.length, rendered).markdown;
}

const H1 = /^#\s+\S/;

/** Nothing in the note yet beyond properties and a title heading. */
export function isBlankNote(md: string): boolean {
  const lines = splitFrontmatter(md).body.split(/\r?\n/).filter((l) => l.trim());
  return lines.length === 0 || (lines.length === 1 && H1.test(lines[0]));
}

/**
 * Fill an empty note with a template. The note's title heading stays unless
 * the template brings its own.
 */
export function fillBlankNote(noteMd: string, rendered: string): string {
  const note = splitFrontmatter(noteMd);
  const { yaml, body } = splitRendered(rendered);
  const heading = note.body.split(/\r?\n/).find((l) => l.trim()) ?? null;
  const firstLine = body.split(/\r?\n/).find((l) => l.trim()) ?? "";
  const nextBody = heading && !H1.test(firstLine) ? `${heading}\n\n${body}` : body;
  const head = note.yaml != null ? `---\n${note.yaml.replace(/\s+$/, "")}\n---\n\n` : "";
  return mergeTemplateProperties(head + nextBody, yaml).markdown;
}
