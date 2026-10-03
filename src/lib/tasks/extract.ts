/**
 * Tasks in one note: every checkbox line outside frontmatter and code fences,
 * read with the task grammar in syntax.ts. A note `due:` (YYYY-MM-DD) is the
 * due date of a task whose line has none; a date on the line always wins.
 */

import { parseFrontmatterFields, splitFrontmatter } from "@/lib/editor/frontmatter";
import { addDays, daysBetween, isYmd, localToday } from "./dates";
import { PRIORITY_MARK, isOpen, parseTaskLine, type TaskPriority, type TaskProblem, type TaskStatus } from "./syntax";

export { localToday } from "./dates";
export type { TaskPriority, TaskStatus } from "./syntax";

export type VaultTask = {
  noteId: string;
  path: string;
  title: string;
  /** 1-based line in the note. */
  line: number;
  /** The whole line as it was read; an edit checks the file still has it. */
  raw: string;
  text: string;
  status: TaskStatus;
  symbol: string;
  due: string | null;
  /** The due date came from the note's `due:` property, not the line. */
  dueFromNote: boolean;
  scheduled: string | null;
  start: string | null;
  created: string | null;
  done: string | null;
  cancelled: string | null;
  priority: TaskPriority;
  /** Rule text after 🔁 or in [repeat::]. */
  recurrence: string | null;
  /** The rule is one Nexus can schedule. */
  recurring: boolean;
  tags: string[];
  /** Other [key:: value] fields on the line. */
  fields: Record<string, string>;
  id: string | null;
  dependsOn: string[];
  blockId: string | null;
  format: "emoji" | "field";
  /** Indent depth: 0 for a top-level task. */
  depth: number;
  /** Line of the nearest task above with less indent, or null. */
  parentLine: number | null;
  problems: TaskProblem[];
};

/** A giant checklist note still reads in a few ms; beyond this the rest is left out. */
export const PER_NOTE_CAP = 2000;

/** `due:` YAML value, or null when it is missing or not a calendar date. */
export function dueFromFrontmatter(body: string): string | null {
  const { yaml } = splitFrontmatter(body);
  if (!yaml) return null;
  let found: string | null = null;
  for (const field of parseFrontmatterFields(yaml)) {
    if (field.key.toLowerCase() !== "due") continue;
    let v = field.value.trim();
    if ((v.startsWith('"') && v.endsWith('"') && v.length >= 2) || (v.startsWith("'") && v.endsWith("'") && v.length >= 2)) {
      v = v.slice(1, -1).trim();
    }
    found = isYmd(v) ? v : null;
  }
  return found;
}

/** Lines that are frontmatter or inside a ``` / ~~~ fence. */
export function nonTaskLines(lines: string[]): Set<number> {
  const skip = new Set<number>();
  let i = 0;
  if (lines[0]?.replace(/^\uFEFF/, "").trim() === "---") {
    for (let j = 1; j < lines.length; j += 1) {
      if (lines[j]?.trim() === "---" || lines[j]?.trim() === "...") {
        for (let k = 0; k <= j; k += 1) skip.add(k);
        i = j + 1;
        break;
      }
    }
  }
  let fence: string | null = null;
  for (; i < lines.length; i += 1) {
    const line = lines[i] ?? "";
    const open = /^\s*(?:>\s*)*(`{3,}|~{3,})/.exec(line);
    if (fence) {
      skip.add(i);
      if (open && (open[1] ?? "").startsWith(fence)) fence = null;
      continue;
    }
    if (open) {
      fence = (open[1] ?? "").slice(0, 3);
      skip.add(i);
    }
  }
  return skip;
}

function indentWidth(lead: string): number {
  const ws = /^[ \t]*(?:>[ \t]*)*/.exec(lead)?.[0] ?? "";
  let n = 0;
  for (const ch of ws.replace(/>/g, "")) n += ch === "\t" ? 4 : 1;
  return n;
}

export type TaskNote = { id: string; path: string; title: string };

/**
 * Tasks from checkbox lines already picked out of one note, in line order.
 * The desktop index sends lines this way; tasksInNote reads a whole body.
 */
export function tasksFromLines(
  note: TaskNote,
  entries: { line: number; raw: string }[],
  noteDue: string | null,
  today: string = localToday(),
): VaultTask[] {
  const out: VaultTask[] = [];
  const stack: { width: number; line: number }[] = [];
  for (const { line, raw } of entries) {
    const parsed = parseTaskLine(raw, today);
    if (!parsed) continue;
    const width = indentWidth(parsed.lead);
    while (stack.length && (stack[stack.length - 1] as { width: number }).width >= width) stack.pop();
    const parent = stack[stack.length - 1] ?? null;
    out.push({
      noteId: note.id,
      path: note.path,
      title: note.title,
      line,
      raw,
      text: parsed.text,
      status: parsed.status,
      symbol: parsed.symbol,
      due: parsed.due ?? noteDue,
      dueFromNote: !parsed.due && !!noteDue,
      scheduled: parsed.scheduled,
      start: parsed.start,
      created: parsed.created,
      done: parsed.done,
      cancelled: parsed.cancelled,
      priority: parsed.priority,
      recurrence: parsed.recurrence,
      recurring: parsed.rule !== null,
      tags: parsed.tags,
      fields: parsed.fields,
      id: parsed.id,
      dependsOn: parsed.dependsOn,
      blockId: parsed.blockId,
      format: parsed.format,
      depth: stack.length,
      parentLine: parent ? parent.line : null,
      problems: parsed.problems.map((p) => ({ ...p, start: p.start + parsed.bodyStart, end: p.end + parsed.bodyStart })),
    });
    stack.push({ width, line });
    if (out.length >= PER_NOTE_CAP) break;
  }
  return out;
}

const QUICK_TASK = /^[ \t>]*(?:[-*+]|\d{1,9}[.)])[ \t]+\[[^\]\n]\][ \t]+\S/m;

export function tasksInNote(note: TaskNote & { body: string }, today: string = localToday()): VaultTask[] {
  if (!QUICK_TASK.test(note.body)) return [];
  const lines = note.body.split(/\r?\n/);
  const skip = nonTaskLines(lines);
  const entries: { line: number; raw: string }[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (skip.has(i)) continue;
    const raw = lines[i] ?? "";
    if (raw.includes("[") && QUICK_TASK.test(raw)) entries.push({ line: i + 1, raw });
    if (entries.length >= PER_NOTE_CAP) break;
  }
  return tasksFromLines(note, entries, dueFromFrontmatter(note.body), today);
}

/** The tasks Markdown draws as checkboxes (`[ ]` and `[x]`), in line order. */
export function checkboxTasks(tasks: VaultTask[]): VaultTask[] {
  return tasks.filter((task) => /^[ xX]$/.test(task.symbol));
}

export function taskIsOpen(task: Pick<VaultTask, "status">): boolean {
  return isOpen(task.status);
}

export function priorityMarker(priority: TaskPriority | null): string {
  return priority ? PRIORITY_MARK[priority] : "";
}

export function taskMatchesPath(task: Pick<VaultTask, "path">, prefix: string): boolean {
  const want = prefix.trim().replace(/\\/g, "/").replace(/^\/+/, "").toLowerCase();
  if (!want) return true;
  return task.path.toLowerCase().startsWith(want);
}

/** Due today, overdue (before today), or upcoming (after today). Null when there is no real date. */
export function taskDueBucket(due: string | null, today: string): "today" | "overdue" | "upcoming" | null {
  if (!isYmd(due) || !isYmd(today)) return null;
  if (due === today) return "today";
  if (due < today) return "overdue";
  return "upcoming";
}

/** The earliest of due, scheduled, and start: the day a task first asks for attention. */
export function taskHappens(task: Pick<VaultTask, "due" | "scheduled" | "start">): string | null {
  let best: string | null = null;
  for (const day of [task.due, task.scheduled, task.start]) {
    if (isYmd(day) && (!best || day < best)) best = day;
  }
  return best;
}

/** Hidden until its start date: a task that has not started yet. */
export function taskNotStarted(task: Pick<VaultTask, "start">, today: string): boolean {
  return isYmd(task.start) && task.start > today;
}

const PRIORITY_SCORE: Record<TaskPriority, number> = { highest: 9, high: 6, medium: 3.9, none: 1.95, low: 0, lowest: -1.8 };

/**
 * Obsidian Tasks' urgency score, so a "most urgent first" list orders the same:
 * due (12 × 0.2–1.0 from 14 days out to 7 days overdue), scheduled today or
 * earlier (+5), not started yet (−3), and priority.
 */
export function taskUrgency(task: Pick<VaultTask, "due" | "scheduled" | "start" | "priority">, today: string): number {
  let score = PRIORITY_SCORE[task.priority] ?? PRIORITY_SCORE.none;
  if (isYmd(task.due)) {
    const overdue = daysBetween(task.due, today) ?? 0;
    const due = overdue >= 7 ? 1 : overdue >= -14 ? ((overdue + 14) * 0.8) / 21 + 0.2 : 0.2;
    score += 12 * due;
  }
  if (isYmd(task.scheduled) && task.scheduled <= today) score += 5;
  if (isYmd(task.start) && task.start > today) score -= 3;
  return Math.round(score * 100) / 100;
}

/** Today plus `days`, for quick reschedule buttons. */
export function dayFromToday(today: string, days: number): string {
  return addDays(today, days) ?? today;
}
