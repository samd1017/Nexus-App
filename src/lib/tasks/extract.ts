/**
 * Incomplete Markdown tasks. A 📅 YYYY-MM-DD on the line is the due date.
 * When the line has no emoji date, the note YAML `due:` (YYYY-MM-DD) applies.
 * The first priority marker on the line is ⏫ 🔼 🔽 ⏬ or ❗.
 * A 🔁 plus following rule text is a recurrence label. Completing a task does not schedule the next one.
 * Not supported: Dataview queries.
 */

import { parseFrontmatterFields, splitFrontmatter } from "@/lib/editor/frontmatter";

export type VaultTask = {
  noteId: string;
  path: string;
  title: string;
  /** 1-based line in the note. */
  line: number;
  text: string;
  due: string | null;
  /** First priority marker on the line. Null when the line has none. */
  priority: TaskPriority | null;
  /** Rule text after the first 🔁. Null when the line has no rule. */
  recurrence: string | null;
};

/** Tasks-plugin markers. High chip uses highest (⏫) and high-alt (❗) only. */
export type TaskPriority = "highest" | "high" | "medium" | "low" | "high-alt";

const TASK_RE = /^(\s*)([-*])\s+\[ \]\s+(\S.*)$/;
const DUE_RE = /📅\s*(\d{4}-\d{2}-\d{2})/;
const PRIORITY_RE = /[⏫🔼🔽⏬❗]/u;
/** First 🔁 and the rule text up to the next task emoji, or the end of the line. */
const RECURRENCE_RE = /🔁\s*([^📅⏫🔼🔽⏬❗🔁]*)/u;
const PER_NOTE_CAP = 40;

const PRIORITY_OF: Record<string, TaskPriority> = {
  "⏫": "highest",
  "🔼": "high",
  "🔽": "medium",
  "⏬": "low",
  "❗": "high-alt",
};

/** First priority marker on the line, or null. */
export function priorityOnTaskLine(text: string): TaskPriority | null {
  const match = PRIORITY_RE.exec(text);
  return match ? PRIORITY_OF[match[0]] ?? null : null;
}

export function priorityMarker(priority: TaskPriority | null): string {
  if (priority === "highest") return "⏫";
  if (priority === "high") return "🔼";
  if (priority === "medium") return "🔽";
  if (priority === "low") return "⏬";
  if (priority === "high-alt") return "❗";
  return "";
}

/** High chip: ⏫ or ❗. 🔼, 🔽, ⏬, and unmarked lines stay out. */
export function taskIsHigh(priority: TaskPriority | null): boolean {
  return priority === "highest" || priority === "high-alt";
}

/** Med chip: 🔽 only. */
export function taskIsMedium(priority: TaskPriority | null): boolean {
  return priority === "medium";
}

/** Low chip: ⏬ only. */
export function taskIsLow(priority: TaskPriority | null): boolean {
  return priority === "low";
}

/** Rule after the first 🔁, or null when the marker is missing or has no text. Display and filter only. */
export function recurrenceOnTaskLine(text: string): string | null {
  const match = RECURRENCE_RE.exec(text);
  if (!match) return null;
  const rule = (match[1] ?? "").replace(/\s+/g, " ").trim();
  return rule || null;
}

export function dueOnTaskLine(text: string): string | null {
  const match = DUE_RE.exec(text);
  return match ? match[1] : null;
}

/** `due:` YAML value, or null when it is missing or not a calendar date. */
export function dueFromFrontmatter(body: string): string | null {
  const { yaml } = splitFrontmatter(body);
  if (!yaml) return null;
  let found: string | null = null;
  for (const field of parseFrontmatterFields(yaml)) {
    if (field.key.toLowerCase() !== "due") continue;
    found = normalizeDueValue(field.value);
  }
  return found;
}

function normalizeDueValue(value: string): string | null {
  let v = value.trim();
  if (
    (v.startsWith('"') && v.endsWith('"') && v.length >= 2) ||
    (v.startsWith("'") && v.endsWith("'") && v.length >= 2)
  ) {
    v = v.slice(1, -1).trim();
  }
  return /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null;
}

export function taskDisplayText(text: string): string {
  return text.replace(DUE_RE, "").replace(PRIORITY_RE, "").replace(RECURRENCE_RE, "").replace(/\s+/g, " ").trim();
}

export function tasksInNote(note: {
  id: string;
  path: string;
  title: string;
  body: string;
}): VaultTask[] {
  const out: VaultTask[] = [];
  const noteDue = dueFromFrontmatter(note.body);
  const lines = note.body.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const match = TASK_RE.exec(lines[i]);
    if (!match) continue;
    const raw = match[3].trim();
    if (!raw) continue;
    out.push({
      noteId: note.id,
      path: note.path,
      title: note.title,
      line: i + 1,
      text: taskDisplayText(raw),
      due: dueOnTaskLine(raw) ?? noteDue,
      priority: priorityOnTaskLine(raw),
      recurrence: recurrenceOnTaskLine(raw),
    });
    if (out.length >= PER_NOTE_CAP) break;
  }
  return out;
}

/** Flip one incomplete task to `[x]`. Returns null when that line is not an open task. */
export function completeTaskLine(markdown: string, line: number): string | null {
  if (!Number.isFinite(line) || line < 1) return null;
  const parts = markdown.split(/\r?\n/);
  const index = line - 1;
  const current = parts[index];
  if (current == null || !TASK_RE.test(current)) return null;
  parts[index] = current.replace("[ ]", "[x]");
  const nl = markdown.includes("\r\n") ? "\r\n" : "\n";
  return parts.join(nl);
}

export function taskMatchesPath(task: VaultTask, prefix: string): boolean {
  const want = prefix.trim().replace(/\\/g, "/").replace(/^\/+/, "").toLowerCase();
  if (!want) return true;
  return task.path.toLowerCase().startsWith(want);
}

/**
 * Local calendar day as YYYY-MM-DD (the runtime's local zone, not a fixed offset).
 * `now` defaults to the current instant.
 */
export function localToday(now = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/**
 * Due today when `due` equals `today`. Overdue when `due` is strictly before `today`.
 * Upcoming when `due` is a calendar day strictly after `today`.
 * Null, blank, and non-dates are none of the three. YYYY-MM-DD compares in calendar order.
 */
export function taskDueBucket(due: string | null, today: string): "today" | "overdue" | "upcoming" | null {
  if (!due || !/^\d{4}-\d{2}-\d{2}$/.test(due) || !/^\d{4}-\d{2}-\d{2}$/.test(today)) return null;
  if (due === today) return "today";
  if (due < today) return "overdue";
  return "upcoming";
}

/** No due chip: missing due, or a value that is not YYYY-MM-DD. */
export function taskHasNoDue(due: string | null, today: string): boolean {
  return taskDueBucket(due, today) === null;
}
