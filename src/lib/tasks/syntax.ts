/**
 * One Markdown task line, read into fields with the exact character range of
 * every token so an edit rewrites only that token.
 *
 *   - [ ] Call Sam #home 📅 2026-10-02 ⏳ 2026-10-01 🛫 2026-09-30 ⏫ 🔁 every week ➕ 2026-09-01 ^call
 *   - [x] Ship it [due:: 2026-10-02] [completion:: 2026-10-02] [priority:: high]
 *
 * Both the emoji spellings and the [key:: value] spellings are read on any line;
 * an edit writes the spelling that line already uses. Checkbox symbols:
 * space is to do, x is done, / is in progress, - is cancelled. Any other symbol
 * reads as to do and is kept as written. Nothing on the line is run as code.
 */

import { isYmdText, parseYmd, resolveNaturalDate } from "./dates";
import { RECURRENCE_EXAMPLES, parseRecurrence, type RecurrenceRule } from "./recurrence";

export type TaskStatus = "todo" | "doing" | "done" | "cancelled";

/** Obsidian Tasks order. "none" is a line with no marker. */
export type TaskPriority = "highest" | "high" | "medium" | "none" | "low" | "lowest";

export type TaskDateField = "due" | "scheduled" | "start" | "created" | "done" | "cancelled";

export type TokenKind = TaskDateField | "priority" | "recurrence" | "id" | "dependsOn" | "field";

export type TaskToken = {
  kind: TokenKind;
  /** Range in the task body (the text after `] `). */
  start: number;
  end: number;
  /** The value as written, trimmed. */
  value: string;
  spelling: "emoji" | "field";
  /** Inline field key, for spelling "field". */
  key?: string;
};

export type TaskProblem = {
  message: string;
  /** Range in the task body that the message is about. */
  start: number;
  end: number;
  /** Replacement for that range that resolves the problem, or null when only the author can say. */
  fix: string | null;
  fixLabel: string | null;
};

export type ParsedTaskLine = {
  /** Indent, blockquote markers, and list marker up to the checkbox. */
  lead: string;
  symbol: string;
  status: TaskStatus;
  /** Text after the checkbox and its space. */
  body: string;
  /** Where `body` starts in the line. */
  bodyStart: number;
  /** The description without date, priority, and recurrence tokens or the block id. Tags stay. */
  text: string;
  tags: string[];
  due: string | null;
  scheduled: string | null;
  start: string | null;
  created: string | null;
  done: string | null;
  cancelled: string | null;
  priority: TaskPriority;
  recurrence: string | null;
  rule: RecurrenceRule | null;
  id: string | null;
  dependsOn: string[];
  /** Other [key:: value] fields on the line, lowercased keys. */
  fields: Record<string, string>;
  blockId: string | null;
  /** The spelling new tokens are written in. */
  format: "emoji" | "field";
  tokens: TaskToken[];
  problems: TaskProblem[];
};

export const TASK_LINE_RE = /^((?:[ \t]*>)*[ \t]*(?:[-*+]|\d{1,9}[.)])[ \t]+)\[([^\]\n])\][ \t]+(\S.*)$/;

export const DATE_EMOJI: Record<string, TaskDateField> = {
  "📅": "due",
  "📆": "due",
  "🗓": "due",
  "⏳": "scheduled",
  "⌛": "scheduled",
  "🛫": "start",
  "➕": "created",
  "✅": "done",
  "❌": "cancelled",
};

export const EMOJI_OF: Record<TaskDateField, string> = {
  due: "📅",
  scheduled: "⏳",
  start: "🛫",
  created: "➕",
  done: "✅",
  cancelled: "❌",
};

export const PRIORITY_EMOJI: Record<string, TaskPriority> = {
  "🔺": "highest",
  "⏫": "high",
  "❗": "high",
  "🔼": "medium",
  "🔽": "low",
  "⏬": "lowest",
};

export const PRIORITY_MARK: Record<TaskPriority, string> = {
  highest: "🔺",
  high: "⏫",
  medium: "🔼",
  none: "",
  low: "🔽",
  lowest: "⏬",
};

/** Higher is more urgent; used for sorting. */
export const PRIORITY_RANK: Record<TaskPriority, number> = { highest: 5, high: 4, medium: 3, none: 2, low: 1, lowest: 0 };

const FIELD_DATE: Record<string, TaskDateField> = {
  due: "due",
  scheduled: "scheduled",
  start: "start",
  created: "created",
  completion: "done",
  done: "done",
  cancelled: "cancelled",
};

export const FIELD_OF: Record<TaskDateField, string> = {
  due: "due",
  scheduled: "scheduled",
  start: "start",
  created: "created",
  done: "completion",
  cancelled: "cancelled",
};

const LABEL: Record<TaskDateField, string> = {
  due: "due date",
  scheduled: "scheduled date",
  start: "start date",
  created: "created date",
  done: "done date",
  cancelled: "cancelled date",
};

const SIGNIFIERS = "📅📆🗓⏳⌛🛫➕✅❌🔁🔺⏫❗🔼🔽⏬🆔⛔🏁";
const EMOJI_RE = /(📅|📆|🗓|⏳|⌛|🛫|➕|✅|❌|🔁|🔺|⏫|❗|🔼|🔽|⏬|🆔|⛔|🏁)\uFE0F?/gu;
const FIELD_RE = /([[(])([A-Za-z][\w-]*)::[ \t]*([^\])]*?)[ \t]*([\])])/g;
const TAG_RE = /(^|[\s(])#([\p{L}\p{N}_/-]*[\p{L}_/-][\p{L}\p{N}_/-]*)/gu;
const BLOCK_ID_RE = /[ \t]\^([A-Za-z0-9-]+)[ \t]*$/;

export function statusOf(symbol: string): TaskStatus {
  if (symbol === "x" || symbol === "X") return "done";
  if (symbol === "/") return "doing";
  if (symbol === "-") return "cancelled";
  return "todo";
}

export function symbolOf(status: TaskStatus): string {
  if (status === "done") return "x";
  if (status === "doing") return "/";
  if (status === "cancelled") return "-";
  return " ";
}

export function isOpen(status: TaskStatus): boolean {
  return status === "todo" || status === "doing";
}

function priorityWord(raw: string): TaskPriority | null {
  const w = raw.trim().toLowerCase();
  if (w === "highest" || w === "high" || w === "medium" || w === "low" || w === "lowest" || w === "none") return w;
  if (w === "normal") return "none";
  return null;
}

/** Where the free text after an emoji stops: the next signifier, tag, field, or block id. */
function runEnd(body: string, from: number): number {
  let end = body.length;
  EMOJI_RE.lastIndex = from;
  const emoji = EMOJI_RE.exec(body);
  if (emoji) end = Math.min(end, emoji.index);
  const rest = body.slice(from, end);
  const stop = /[ \t](?:#[\p{L}_]|\[[A-Za-z][\w-]*::|\^[A-Za-z0-9-]+[ \t]*$)/u.exec(rest);
  if (stop) end = from + stop.index;
  return end;
}

function dateProblem(field: TaskDateField, mark: string, value: string, today: string | null): { message: string; fix: string | null; fixLabel: string | null } {
  const what = LABEL[field];
  if (!value) {
    return { message: `${mark} needs a date after it, like ${mark} 2026-10-02.`, fix: null, fixLabel: null };
  }
  const shaped = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (shaped) {
    return { message: `${value} is not a day on the calendar, so this ${what} is ignored.`, fix: null, fixLabel: null };
  }
  const resolved = today ? resolveNaturalDate(value, today) : null;
  if (resolved) {
    return {
      message: `The ${what} “${value}” is not written as YYYY-MM-DD, so Obsidian and other tools cannot read it.`,
      fix: resolved,
      fixLabel: `Write ${resolved}`,
    };
  }
  return { message: `The ${what} “${value}” is not a date. Write it as YYYY-MM-DD, like 2026-10-02.`, fix: null, fixLabel: null };
}

/**
 * Read one line. Null when it is not a task: no checkbox, or nothing after it.
 * `today` lets a problem offer the date a word like "tomorrow" means.
 */
export function parseTaskLine(line: string, today: string | null = null): ParsedTaskLine | null {
  const m = TASK_LINE_RE.exec(line);
  if (!m) return null;
  const lead = m[1] ?? "";
  const symbol = m[2] ?? " ";
  const body = (m[3] ?? "").replace(/\s+$/, "");
  const bodyStart = line.length - (m[3] ?? "").length;
  const out: ParsedTaskLine = {
    lead,
    symbol,
    status: statusOf(symbol),
    body,
    bodyStart,
    text: "",
    tags: [],
    due: null,
    scheduled: null,
    start: null,
    created: null,
    done: null,
    cancelled: null,
    priority: "none",
    recurrence: null,
    rule: null,
    id: null,
    dependsOn: [],
    fields: {},
    blockId: null,
    format: "emoji",
    tokens: [],
    problems: [],
  };
  const block = BLOCK_ID_RE.exec(body);
  const blockAt = block ? block.index : body.length;
  if (block) out.blockId = block[1] ?? null;

  const problem = (start: number, end: number, message: string, fix: string | null = null, fixLabel: string | null = null) =>
    out.problems.push({ start, end, message, fix, fixLabel });
  const seen = new Map<TokenKind, TaskToken>();
  const extra: TaskToken[] = [];
  const claim = (token: TaskToken, label: string): boolean => {
    const first = seen.get(token.kind);
    if (first && token.kind !== "field") {
      problem(token.start, token.end, `This line has a second ${label}; the first one counts.`, "", "Remove the second");
      extra.push(token);
      return false;
    }
    seen.set(token.kind, token);
    out.tokens.push(token);
    return true;
  };

  FIELD_RE.lastIndex = 0;
  let fm: RegExpExecArray | null;
  let sawField = false;
  while ((fm = FIELD_RE.exec(body))) {
    if (fm.index >= blockAt) break;
    const open = fm[1];
    const close = fm[4];
    if ((open === "[" && close !== "]") || (open === "(" && close !== ")")) continue;
    const key = (fm[2] ?? "").toLowerCase();
    const value = (fm[3] ?? "").trim();
    const start = fm.index;
    const end = fm.index + fm[0].length;
    const inner = fm[0].indexOf("::") + 2;
    const valueStart = start + inner + (/^[ \t]*/.exec(fm[0].slice(inner))?.[0].length ?? 0);
    const date = FIELD_DATE[key];
    if (date) {
      sawField = true;
      const token: TaskToken = { kind: date, start, end, value, spelling: "field", key };
      if (!claim(token, LABEL[date])) continue;
      if (isYmdText(value)) out[date] = value;
      else {
        const p = dateProblem(date, `[${key}::]`, value, today);
        problem(value ? valueStart : start, value ? valueStart + value.length : end, p.message, p.fix, p.fixLabel);
      }
      continue;
    }
    if (key === "priority") {
      sawField = true;
      const token: TaskToken = { kind: "priority", start, end, value, spelling: "field", key };
      if (!claim(token, "priority")) continue;
      const word = priorityWord(value);
      if (word) out.priority = word;
      else problem(start, end, `Priority “${value}” is not one Nexus reads. Use highest, high, medium, low, or lowest.`);
      continue;
    }
    if (key === "repeat" || key === "recurrence") {
      sawField = true;
      const token: TaskToken = { kind: "recurrence", start, end, value, spelling: "field", key };
      if (!claim(token, "repeat rule")) continue;
      out.recurrence = value || null;
      out.rule = value ? parseRecurrence(value) : null;
      if (!out.rule) problem(start, end, `Nexus does not read the repeat rule “${value}”. Try ${RECURRENCE_EXAMPLES}.`);
      continue;
    }
    if (key === "id") {
      claim({ kind: "id", start, end, value, spelling: "field", key }, "id");
      out.id = value || null;
      continue;
    }
    if (key === "dependson") {
      claim({ kind: "dependsOn", start, end, value, spelling: "field", key }, "depends-on list");
      out.dependsOn = value.split(",").map((part) => part.trim()).filter(Boolean);
      continue;
    }
    out.tokens.push({ kind: "field", start, end, value, spelling: "field", key });
    if (!(key in out.fields)) out.fields[key] = value;
  }
  if (sawField) out.format = "field";

  const inField = (at: number) => out.tokens.some((token) => token.spelling === "field" && at >= token.start && at < token.end);
  EMOJI_RE.lastIndex = 0;
  let em: RegExpExecArray | null;
  const emojis: RegExpExecArray[] = [];
  while ((em = EMOJI_RE.exec(body))) {
    if (em.index >= blockAt) break;
    if (!inField(em.index)) emojis.push(em);
  }
  for (const hit of emojis) {
    const mark = hit[1] ?? "";
    const start = hit.index;
    const afterMark = start + hit[0].length;
    const date = DATE_EMOJI[mark];
    const priority = PRIORITY_EMOJI[mark];
    if (priority) {
      if (claim({ kind: "priority", start, end: afterMark, value: priority, spelling: "emoji" }, "priority")) out.priority = priority;
      continue;
    }
    const lead = body.slice(afterMark).length - body.slice(afterMark).trimStart().length;
    const valueStart = afterMark + lead;
    if (date) {
      const word = /^\d{4}-\d{2}-\d{2}(?![\w-])/.exec(body.slice(valueStart));
      let end = word ? valueStart + word[0].length : Math.min(runEnd(body, afterMark), blockAt);
      let value = body.slice(valueStart, Math.max(valueStart, end)).trim();
      if (!word && value && !resolveNaturalDate(value, today ?? "2000-01-01")) {
        const first = /^\S+/.exec(value)?.[0] ?? value;
        value = first;
        end = valueStart + first.length;
      }
      if (!value) end = afterMark;
      const token: TaskToken = { kind: date, start, end, value, spelling: "emoji" };
      if (!claim(token, LABEL[date])) continue;
      if (isYmdText(value)) out[date] = value;
      else {
        const p = dateProblem(date, mark, value, today);
        problem(value ? valueStart : start, value ? end : afterMark, p.message, p.fix, p.fixLabel);
      }
      continue;
    }
    if (mark === "🔁") {
      const tail = /^[A-Za-z0-9, !]*/.exec(body.slice(valueStart))?.[0] ?? "";
      const value = tail.replace(/[\s,]+$/, "");
      const end = value ? valueStart + value.length : afterMark;
      if (!claim({ kind: "recurrence", start, end, value, spelling: "emoji" }, "repeat rule")) continue;
      out.recurrence = value || null;
      out.rule = value ? parseRecurrence(value) : null;
      if (!value) problem(start, afterMark, `🔁 needs a rule after it, like 🔁 every week.`);
      else if (!out.rule) problem(valueStart, end, `Nexus does not read the repeat rule “${value}”. Try ${RECURRENCE_EXAMPLES}.`);
      continue;
    }
    if (mark === "🆔") {
      const value = /^[A-Za-z0-9_-]*/.exec(body.slice(valueStart))?.[0] ?? "";
      claim({ kind: "id", start, end: valueStart + value.length, value, spelling: "emoji" }, "id");
      out.id = value || null;
      continue;
    }
    if (mark === "⛔") {
      const value = /^[A-Za-z0-9_,\s-]*/.exec(body.slice(valueStart))?.[0]?.replace(/[\s,]+$/, "") ?? "";
      claim({ kind: "dependsOn", start, end: valueStart + value.length, value, spelling: "emoji" }, "depends-on list");
      out.dependsOn = value.split(",").map((part) => part.trim()).filter(Boolean);
      continue;
    }
    if (mark === "🏁") {
      const value = /^[A-Za-z]*/.exec(body.slice(valueStart))?.[0] ?? "";
      out.tokens.push({ kind: "field", key: "oncompletion", start, end: valueStart + value.length, value, spelling: "emoji" });
      out.fields.oncompletion = value.toLowerCase();
    }
  }
  out.tokens.sort((a, b) => a.start - b.start);

  if (out.start && out.due && out.start > out.due) {
    const token = seen.get("start");
    if (token) problem(token.start, token.end, `This task starts (${out.start}) after it is due (${out.due}).`);
  }
  let text = "";
  let at = 0;
  for (const token of [...out.tokens, ...extra].sort((a, b) => a.start - b.start)) {
    text += body.slice(at, Math.max(at, token.start));
    at = Math.max(at, token.end);
  }
  text += body.slice(at, blockAt);
  out.text = text.replace(/\s+/g, " ").trim();
  TAG_RE.lastIndex = 0;
  let tm: RegExpExecArray | null;
  const tags = new Set<string>();
  while ((tm = TAG_RE.exec(out.text))) tags.add(`#${tm[2] ?? ""}`);
  out.tags = [...tags];
  return out;
}

/** True when the date is real; used where a value came from outside the parser. */
export function validTaskDate(value: string | null | undefined): value is string {
  return typeof value === "string" && parseYmd(value) !== null;
}

/** For tests and UI: the emoji or field spelling of one date token. */
export function dateToken(field: TaskDateField, ymd: string, format: "emoji" | "field"): string {
  return format === "field" ? `[${FIELD_OF[field]}:: ${ymd}]` : `${EMOJI_OF[field]} ${ymd}`;
}

export function priorityToken(priority: TaskPriority, format: "emoji" | "field"): string {
  if (priority === "none") return "";
  return format === "field" ? `[priority:: ${priority}]` : PRIORITY_MARK[priority];
}

export function recurrenceToken(rule: string, format: "emoji" | "field"): string {
  return format === "field" ? `[repeat:: ${rule}]` : `🔁 ${rule}`;
}

export const TASK_SIGNIFIERS = SIGNIFIERS;
