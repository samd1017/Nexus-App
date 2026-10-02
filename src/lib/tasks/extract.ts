/**
 * Incomplete Markdown tasks. A 📅 YYYY-MM-DD on the line is the due date.
 * When the line has no emoji date, the note YAML `due:` (YYYY-MM-DD) applies.
 * The first priority marker on the line is ⏫ 🔼 🔽 ⏬ or ❗.
 * A 🔁 plus following rule text is a recurrence label.
 * Completing a recurring row whose rule is every day, week, month, or year writes the next incomplete line.
 * A date on that line wins over the note due:. A row with no recurrence only marks the line done.
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

/** Rule after the first 🔁, or null when the marker is missing or has no text. */
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

const EVERY_RE = /^every(?:\s+(\d+))?\s+(day|week|month|year)s?$/i;

/** Days or months to add for `every day|week|month|year` and `every N` of those. Other rules are null. */
function recurrenceShift(rule: string): { days: number; months: number } | null {
  const match = EVERY_RE.exec(rule.trim());
  if (!match) return null;
  const count = match[1] ? Number(match[1]) : 1;
  if (!Number.isInteger(count) || count < 1 || count > 999) return null;
  const unit = (match[2] ?? "").toLowerCase();
  if (unit === "day") return { days: count, months: 0 };
  if (unit === "week") return { days: count * 7, months: 0 };
  if (unit === "month") return { days: 0, months: count };
  return { days: 0, months: count * 12 };
}

function parseYmd(ymd: string): { y: number; m: number; d: number } | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return null;
  const y = Number(ymd.slice(0, 4));
  const m = Number(ymd.slice(5, 7));
  const d = Number(ymd.slice(8, 10));
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  return { y, m, d };
}

function formatYmd(y: number, m: number, d: number): string {
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

function shiftYmd(ymd: string, shift: { days: number; months: number }): string | null {
  const parts = parseYmd(ymd);
  if (!parts) return null;
  if (shift.months) {
    const total = parts.y * 12 + (parts.m - 1) + shift.months;
    const y = Math.floor(total / 12);
    const m = (total % 12) + 1;
    const dim = new Date(Date.UTC(y, m, 0)).getUTCDate();
    return formatYmd(y, m, Math.min(parts.d, dim));
  }
  const dt = new Date(Date.UTC(parts.y, parts.m - 1, parts.d));
  dt.setUTCDate(dt.getUTCDate() + shift.days);
  return formatYmd(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate());
}

/**
 * Next calendar day for a parsed recurrence rule.
 * Basis is the line date, else the note due, else `today`. Null when the rule is not every day/week/month/year.
 */
export function nextRecurrenceDue(rule: string, basis: string): string | null {
  const shift = recurrenceShift(rule);
  if (!shift) return null;
  return shiftYmd(basis, shift);
}

function spawnNextLine(current: string, nextDue: string): string | null {
  const match = TASK_RE.exec(current);
  if (!match) return null;
  const rest = match[3] ?? "";
  const dated = DUE_RE.test(rest) ? rest.replace(DUE_RE, `📅 ${nextDue}`) : `${rest} 📅 ${nextDue}`;
  return `${match[1] ?? ""}${match[2] ?? "-"} [ ] ${dated}`;
}

/**
 * Flip one incomplete task to `[x]`.
 * A recurring row whose rule is every day, week, month, or year also inserts the next incomplete line.
 * The line date wins over the note `due:`. Returns null when that line is not an open task.
 */
export function completeTaskLine(markdown: string, line: number, today = localToday()): string | null {
  if (!Number.isFinite(line) || line < 1) return null;
  const parts = markdown.split(/\r?\n/);
  const index = line - 1;
  const current = parts[index];
  if (current == null || !TASK_RE.test(current)) return null;
  parts[index] = current.replace("[ ]", "[x]");
  const raw = TASK_RE.exec(current)?.[3] ?? "";
  const rule = recurrenceOnTaskLine(raw);
  const shift = rule ? recurrenceShift(rule) : null;
  if (shift) {
    const basis = dueOnTaskLine(raw) ?? dueFromFrontmatter(markdown) ?? today;
    const nextDue = shiftYmd(basis, shift);
    const spawned = nextDue ? spawnNextLine(current, nextDue) : null;
    if (spawned) parts.splice(index + 1, 0, spawned);
  }
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
