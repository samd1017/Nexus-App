/**
 * Template rendering. Plain text substitution only — nothing is evaluated.
 *
 *   {{title}}  {{date}}  {{time}}  {{yesterday}}
 *   {{date+7}} {{date-1}}      days from the template's date
 *   {{prompt:Attendees}}       asked once when the template is used
 *   {{carryover}}              open tasks from yesterday's daily note
 *
 * Unknown tokens are left as written.
 */

import { splitFrontmatter } from "../editor/frontmatter";

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

export type TemplateValues = {
  title: string;
  date: Date;
  prompts?: Readonly<Record<string, string>>;
  carryover?: readonly string[];
};

const TOKEN = /\{\{\s*([^{}\n]+?)\s*\}\}/g;
const PROMPT = /^prompt\s*:\s*(.+)$/i;
const DATE_MATH = /^date\s*([+-])\s*(\d{1,5})$/i;
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
  return text.replace(TOKEN, (whole, inner: string) => {
    const key = inner.trim();
    switch (key.toLowerCase()) {
      case "title":
        return values.title;
      case "date":
        return formatDateISO(values.date);
      case "time":
        return formatTime(values.date);
      case "yesterday":
        return formatDateISO(shiftDate(values.date, -1));
      case "carryover":
        return items.join("\n");
    }
    const math = DATE_MATH.exec(key);
    if (math) {
      const days = Number(math[2]) * (math[1] === "-" ? -1 : 1);
      return formatDateISO(shiftDate(values.date, days));
    }
    const prompt = PROMPT.exec(key);
    if (prompt) return values.prompts?.[prompt[1].trim()] ?? "";
    return whole;
  });
}

type YamlEntry = { key: string | null; lines: string[] };

/** Top-level YAML keys, each with its indented continuation lines. */
function yamlEntries(yaml: string): YamlEntry[] {
  const out: YamlEntry[] = [];
  for (const line of yaml.replace(/\r\n/g, "\n").split("\n")) {
    const continues = /^\s/.test(line) || /^-(\s|$)/.test(line);
    const top = continues ? null : /^([^\s#][^:]*?)\s*:/.exec(line);
    if (top) out.push({ key: top[1].trim().toLowerCase(), lines: [line] });
    else if (out.length && continues) out[out.length - 1].lines.push(line);
    else if (line.trim()) out.push({ key: null, lines: [line] });
  }
  return out;
}

/** Template properties the note lacks, appended. Null when nothing changes. */
function mergeYaml(noteYaml: string | null, templateYaml: string | null): string | null {
  if (!templateYaml?.trim()) return null;
  const base = (noteYaml ?? "").replace(/\s+$/, "");
  const have = new Set(yamlEntries(base).map((e) => e.key).filter(Boolean));
  const added = yamlEntries(templateYaml).filter((e) => e.key && !have.has(e.key));
  if (!added.length) return null;
  const lines = added.flatMap((e) => e.lines);
  return base ? `${base}\n${lines.join("\n")}` : lines.join("\n");
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
