/**
 * Edits to task lines in a note's Markdown. Each edit changes one line (plus
 * the next copy of a repeating task) and returns the whole note text to save.
 * A task is found by its line number and checked against the text that was
 * read; when the note changed underneath, the same line text is looked up
 * nearby instead of editing whatever now sits on that line.
 */

import { addDays, daysBetween, isYmd, resolveNaturalDate } from "./dates";
import { dueFromFrontmatter, nonTaskLines } from "./extract";
import { nextOccurrence, parseRecurrence } from "./recurrence";
import {
  EMOJI_OF,
  FIELD_OF,
  PRIORITY_MARK,
  isOpen,
  parseTaskLine,
  symbolOf,
  type ParsedTaskLine,
  type TaskDateField,
  type TaskPriority,
  type TaskStatus,
  type TokenKind,
} from "./syntax";

export type TaskRef = { line: number; raw: string };

export type TaskEdit = { ok: true; markdown: string; line: number } | { ok: false; reason: string };

export const TASK_MOVED = "That task changed in the note since the list was read. The list has been refreshed; try again.";

function splitLines(markdown: string): { lines: string[]; nl: string } {
  return { lines: markdown.split(/\r?\n/), nl: markdown.includes("\r\n") ? "\r\n" : "\n" };
}

/** 0-based index of the task line, or -1 when that text is gone or now appears more than once nearby. */
export function locateTask(lines: string[], ref: TaskRef): number {
  const at = ref.line - 1;
  if (lines[at] === ref.raw) return at;
  const hits: number[] = [];
  for (let i = 0; i < lines.length; i += 1) if (lines[i] === ref.raw) hits.push(i);
  if (hits.length === 1) return hits[0] as number;
  if (hits.length > 1) {
    hits.sort((a, b) => Math.abs(a - at) - Math.abs(b - at));
    const [best, next] = hits;
    if (next === undefined || Math.abs((best as number) - at) < Math.abs(next - at)) return best as number;
  }
  return -1;
}

function bodyOf(line: string, parsed: ParsedTaskLine): { head: string; body: string } {
  return { head: line.slice(0, parsed.bodyStart), body: parsed.body };
}

function tidy(body: string): string {
  return body.replace(/[ \t]{2,}/g, " ").replace(/[ \t]+$/, "");
}

/** Where a new token goes: before a trailing ^block-id, else at the end. */
function insertAt(body: string, parsed: ParsedTaskLine): number {
  if (!parsed.blockId) return body.length;
  const m = /[ \t]\^[A-Za-z0-9-]+[ \t]*$/.exec(body);
  return m ? m.index : body.length;
}

/** Replace, remove (`text` null), or add the token of `kind` on one line. */
export function setLineToken(line: string, kind: TokenKind, text: string | null, today: string | null = null): string {
  const parsed = parseTaskLine(line, today);
  if (!parsed) return line;
  const { head, body } = bodyOf(line, parsed);
  const token = parsed.tokens.find((t) => t.kind === kind);
  let next: string;
  if (token) {
    const before = body.slice(0, token.start);
    const after = body.slice(token.end);
    next = text ? `${before}${text}${after}` : `${before.replace(/[ \t]+$/, "")}${after.startsWith(" ") || !before ? after : ` ${after}`}`;
  } else {
    if (!text) return line;
    const at = insertAt(body, parsed);
    next = `${body.slice(0, at).replace(/[ \t]+$/, "")} ${text}${body.slice(at)}`;
  }
  return head + tidy(next).replace(/^[ \t]+/, "");
}

function dateText(field: TaskDateField, ymd: string, format: "emoji" | "field"): string {
  return format === "field" ? `[${FIELD_OF[field]}:: ${ymd}]` : `${EMOJI_OF[field]} ${ymd}`;
}

export function setLineDate(line: string, field: TaskDateField, ymd: string | null): string {
  const parsed = parseTaskLine(line);
  if (!parsed) return line;
  return setLineToken(line, field, ymd ? dateText(field, ymd, parsed.format) : null);
}

function setLineStatus(line: string, status: TaskStatus): string {
  const parsed = parseTaskLine(line);
  if (!parsed) return line;
  const box = parsed.lead.length;
  return `${line.slice(0, box)}[${symbolOf(status)}]${line.slice(box + 3)}`;
}

/**
 * The next open copy of a repeating line, or null when the rule is not one Nexus reads.
 * Dates on the line move by the same number of days as the reference date
 * (due, else scheduled, else start). A line with no date gets a due date.
 * The ^block id stays with the finished line unless that line is being removed,
 * so links to it keep pointing at one line.
 */
export function nextRecurrenceLine(line: string, today: string, noteDue: string | null = null, keepBlockId = false): string | null {
  const parsed = parseTaskLine(line, today);
  if (!parsed?.recurrence) return null;
  const rule = parseRecurrence(parsed.recurrence);
  if (!rule) return null;
  const reference = parsed.due ?? parsed.scheduled ?? parsed.start;
  const basis = rule.whenDone ? today : (reference ?? noteDue ?? today);
  const next = nextOccurrence(rule, basis);
  if (!next) return null;
  let out = setLineStatus(line, "todo");
  if (!keepBlockId) out = out.replace(/[ \t]+\^[A-Za-z0-9-]+[ \t]*$/, "");
  out = setLineToken(out, "done", null);
  out = setLineToken(out, "cancelled", null);
  if (parsed.created) out = setLineDate(out, "created", today);
  if (!reference) return setLineDate(out, "due", next);
  const shift = daysBetween(reference, next) ?? 0;
  for (const field of ["due", "scheduled", "start"] as const) {
    const day = parsed[field];
    if (!day) continue;
    out = setLineDate(out, field, field === (parsed.due ? "due" : parsed.scheduled ? "scheduled" : "start") ? next : (addDays(day, shift) ?? day));
  }
  return out;
}

function withLines(markdown: string, ref: TaskRef, edit: (lines: string[], at: number, parsed: ParsedTaskLine) => number): TaskEdit {
  const { lines, nl } = splitLines(markdown);
  const at = locateTask(lines, ref);
  if (at < 0) return { ok: false, reason: TASK_MOVED };
  const parsed = parseTaskLine(lines[at] ?? "");
  if (!parsed) return { ok: false, reason: TASK_MOVED };
  const line = edit(lines, at, parsed);
  return { ok: true, markdown: lines.join(nl), line: line + 1 };
}

/**
 * Check off an open task: [x], ✅ today, and for a repeating task the next open
 * copy on the line above (as Obsidian Tasks writes it). 🏁 delete drops the done line.
 */
function completeAt(lines: string[], at: number, today: string, noteDue: string | null): number {
  const line = lines[at] ?? "";
  const parsed = parseTaskLine(line, today);
  if (!parsed) return at;
  let done = setLineStatus(line, "done");
  done = setLineToken(done, "cancelled", null);
  done = setLineDate(done, "done", today);
  const drop = parsed.fields.oncompletion === "delete";
  const next = nextRecurrenceLine(line, today, noteDue, drop);
  if (drop) lines.splice(at, 1);
  else lines[at] = done;
  if (next) {
    lines.splice(at, 0, next);
    return drop ? at : at + 1;
  }
  return at;
}

export function setTaskStatus(markdown: string, ref: TaskRef, status: TaskStatus, today: string): TaskEdit {
  const noteDue = dueFromFrontmatter(markdown);
  return withLines(markdown, ref, (lines, at, parsed) => {
    if (status === parsed.status && status !== "todo") return at;
    if (status === "done") return isOpen(parsed.status) ? completeAt(lines, at, today, noteDue) : at;
    let line = setLineStatus(lines[at] ?? "", status);
    line = setLineToken(line, "done", null);
    line = status === "cancelled" ? setLineDate(line, "cancelled", today) : setLineToken(line, "cancelled", null);
    lines[at] = line;
    return at;
  });
}

/** Open → done; done or cancelled → open again. */
export function toggleTask(markdown: string, ref: TaskRef, today: string): TaskEdit {
  const parsed = parseTaskLine(ref.raw);
  const status = parsed && isOpen(parsed.status) ? "done" : "todo";
  return setTaskStatus(markdown, ref, status, today);
}

export function setTaskDate(markdown: string, ref: TaskRef, field: TaskDateField, ymd: string | null): TaskEdit {
  if (ymd !== null && !isYmd(ymd)) return { ok: false, reason: `${ymd} is not a date. Use YYYY-MM-DD.` };
  return withLines(markdown, ref, (lines, at) => {
    lines[at] = setLineDate(lines[at] ?? "", field, ymd);
    return at;
  });
}

export function setTaskPriority(markdown: string, ref: TaskRef, priority: TaskPriority): TaskEdit {
  return withLines(markdown, ref, (lines, at, parsed) => {
    const text = priority === "none" ? null : parsed.format === "field" ? `[priority:: ${priority}]` : PRIORITY_MARK[priority];
    lines[at] = setLineToken(lines[at] ?? "", "priority", text);
    return at;
  });
}

/** Apply the fix a problem offers (problem positions are line offsets, as VaultTask carries them). */
export function fixTaskProblem(markdown: string, ref: TaskRef, problem: { start: number; end: number; fix: string | null }): TaskEdit {
  if (problem.fix === null) return { ok: false, reason: "This one needs you to edit the line." };
  return withLines(markdown, ref, (lines, at) => {
    const line = lines[at] ?? "";
    const before = line.slice(0, problem.start);
    const after = line.slice(problem.end);
    const joined = problem.fix ? `${before}${problem.fix}${after}` : `${before.replace(/[ \t]+$/, "")}${after.startsWith(" ") ? "" : " "}${after}`;
    const parsed = parseTaskLine(joined);
    lines[at] = parsed ? joined.slice(0, parsed.bodyStart) + tidy(joined.slice(parsed.bodyStart)) : joined;
    return at;
  });
}

/**
 * When a checkbox in the note editor flips, finish the job the way the Tasks
 * list does: ✅ date and the next repeat on check, ✅ date removed on uncheck.
 * Only when every changed line is a checkbox flip; any other edit returns null.
 */
export function applyCheckboxFlips(prev: string, next: string, today: string): string | null {
  const a = splitLines(prev).lines;
  const { lines: b, nl } = splitLines(next);
  if (a.length !== b.length) return null;
  const flips: { at: number; to: "done" | "open" }[] = [];
  const skip = nonTaskLines(b);
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] === b[i]) continue;
    if (skip.has(i)) return null;
    const was = parseTaskLine(a[i] ?? "");
    const now = parseTaskLine(b[i] ?? "");
    if (!was || !now || was.lead !== now.lead || was.body !== now.body) return null;
    if (isOpen(was.status) && now.status === "done") flips.push({ at: i, to: "done" });
    else if (was.status === "done" && now.status === "todo") flips.push({ at: i, to: "open" });
    else return null;
  }
  if (!flips.length) return null;
  const noteDue = dueFromFrontmatter(next);
  const lines = [...a];
  for (const flip of flips.reverse()) {
    if (flip.to === "done") completeAt(lines, flip.at, today, noteDue);
    else lines[flip.at] = setLineToken(setLineStatus(lines[flip.at] ?? "", "todo"), "done", null);
  }
  const out = lines.join(nl);
  return out === next ? null : out;
}

/** A quick-add sentence read into a task line. */
export type ComposedTask = {
  line: string;
  text: string;
  due: string | null;
  scheduled: string | null;
  start: string | null;
  priority: TaskPriority;
  recurrence: string | null;
  /** Words that looked like a date or rule but did not read as one. */
  warning: string | null;
};

const PRIORITY_WORD: Record<string, TaskPriority> = {
  "!!!": "highest",
  "!!": "high",
  "!highest": "highest",
  "!high": "high",
  "!medium": "medium",
  "!med": "medium",
  "!low": "low",
  "!lowest": "lowest",
};

const DATE_PHRASE =
  "(?:today|tod|tomorrow|tom|tmr|yesterday|next (?:week|month|year)|in \\d{1,3} ?(?:d|days?|w|weeks?|mo|months?|y|years?)|(?:next |this |on )?(?:mon|tue|tues|wed|thu|thur|thurs|fri|sat|sun)(?:day|nesday|sday|urday|rsday)?|\\d{4}-\\d{1,2}-\\d{1,2}|\\d{4}/\\d{1,2}/\\d{1,2}|(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\\.? \\d{1,2}(?:st|nd|rd|th)?|\\d{1,2}(?:st|nd|rd|th)? (?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*)";

/**
 * "Call Sam tomorrow !high #home every week" → `- [ ] Call Sam #home ⏫ 🔁 every week 📅 <tomorrow>`.
 * Reads: due / scheduled / start <date>, a trailing date (today, fri, next week, in 3 days, oct 5),
 * !highest !high !medium !low !lowest (or !!! / !!), and "every …" rules. Emoji typed directly are kept.
 */
export function composeTaskLine(input: string, today: string): ComposedTask {
  let text = ` ${input.trim().replace(/^[-*+]\s+\[.\]\s*/, "")} `;
  let due: string | null = null;
  let scheduled: string | null = null;
  let start: string | null = null;
  let priority: TaskPriority = "none";
  let recurrence: string | null = null;
  let warning: string | null = null;

  text = text.replace(/\s(!!!|!!|!highest|!high|!medium|!med|!lowest|!low)(?=\s)/gi, (_m, word: string) => {
    priority = PRIORITY_WORD[word.toLowerCase()] ?? priority;
    return " ";
  });
  const keyed = new RegExp(`\\s(due|by|scheduled|sched|start|starts|on)\\s+(${DATE_PHRASE})(?=\\s)`, "gi");
  text = text.replace(keyed, (whole, key: string, phrase: string) => {
    const day = resolveNaturalDate(phrase, today);
    if (!day) return whole;
    const k = key.toLowerCase();
    if (k.startsWith("sched")) scheduled = day;
    else if (k.startsWith("start")) start = day;
    else due = day;
    return " ";
  });
  const rule = /\s(every\s+.+?|daily|weekly|monthly|yearly)(?=\s(?:#|📅|⏳|🛫|$)|\s*$)/i.exec(text);
  if (rule) {
    const words = (rule[1] ?? "").trim();
    let found: string | null = null;
    const parts = words.split(/\s+/);
    for (let n = parts.length; n >= 1; n -= 1) {
      const candidate = parts.slice(0, n).join(" ");
      if (parseRecurrence(candidate)) {
        found = candidate;
        break;
      }
    }
    if (found) {
      recurrence = found;
      text = text.replace(` ${found}`, " ");
    } else warning = `“${words}” is not a repeat rule Nexus reads.`;
  }
  if (!due) {
    const trailing = new RegExp(`\\s(${DATE_PHRASE})((?:\\s+#[^\\s#]+)*)\\s*$`, "i").exec(text);
    if (trailing) {
      const day = resolveNaturalDate(trailing[1] ?? "", today);
      if (day) {
        due = day;
        text = `${text.slice(0, trailing.index)}${trailing[2] ?? ""} `;
      }
    }
  }
  if (!due && !scheduled && !start && recurrence) {
    const ruled = parseRecurrence(recurrence);
    const first = ruled ? nextOccurrence(ruled, addDays(today, -1) ?? today) : null;
    if (first) due = first;
  }
  const description = text.replace(/\s+/g, " ").trim();
  const parts = [`- [ ] ${description || "New task"}`];
  if (priority !== "none") parts.push(PRIORITY_MARK[priority]);
  if (recurrence) parts.push(`🔁 ${recurrence}`);
  if (start) parts.push(`🛫 ${start}`);
  if (scheduled) parts.push(`⏳ ${scheduled}`);
  if (due) parts.push(`📅 ${due}`);
  const line = parts.join(" ");
  const parsed = parseTaskLine(line, today);
  return {
    line,
    text: parsed?.text ?? description,
    due: parsed?.due ?? due,
    scheduled: parsed?.scheduled ?? scheduled,
    start: parsed?.start ?? start,
    priority: parsed?.priority ?? priority,
    recurrence: parsed?.recurrence ?? recurrence,
    warning: warning ?? (parsed?.problems[0]?.message ?? null),
  };
}

/**
 * Add a task line to a note: into the first empty `- [ ]` placeholder, else after
 * the last top-level task, else at the end.
 */
export function insertTaskLine(markdown: string, taskLine: string): { markdown: string; line: number } {
  const { lines, nl } = splitLines(markdown);
  const skip = nonTaskLines(lines);
  for (let i = 0; i < lines.length; i += 1) {
    if (skip.has(i)) continue;
    if (/^[-*+] \[ \]\s*$/.test(lines[i] ?? "")) {
      lines[i] = taskLine;
      return { markdown: lines.join(nl), line: i + 1 };
    }
  }
  let last = -1;
  for (let i = 0; i < lines.length; i += 1) {
    if (skip.has(i)) continue;
    if (/^[-*+] \[.\] \S/.test(lines[i] ?? "")) {
      last = i;
      while (last + 1 < lines.length && /^[ \t]+\S/.test(lines[last + 1] ?? "")) last += 1;
    }
  }
  if (last >= 0) {
    lines.splice(last + 1, 0, taskLine);
    return { markdown: lines.join(nl), line: last + 2 };
  }
  while (lines.length && (lines[lines.length - 1] ?? "").trim() === "") lines.pop();
  if (lines.length) lines.push("");
  lines.push(taskLine, "");
  return { markdown: lines.join(nl), line: lines.length - 1 };
}
