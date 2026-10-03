/**
 * A ```tasks block as written for the Obsidian Tasks plugin, read as a TASK
 * query. Each line is one instruction; filters are ANDed, as the plugin does.
 * Lines with no TASK meaning are reported on the line with a likely rewrite;
 * nothing in the block is run as code.
 */

import { addDays, addMonths, daysInMonth, isYmdText, parseYmd, resolveNaturalDate, weekdayOf } from "./dates";
import { PRIORITY_RANK, type TaskPriority } from "./syntax";

export type TasksBlockProblem = {
  /** 0-based line in the block. */
  line: number;
  text: string;
  message: string;
  /** A line that would work here, when one is clear. */
  rewrite: string | null;
  /** The block cannot run without this line: a filter that could not be read. */
  blocking: boolean;
};

export type TasksBlockPlan = {
  /** The TASK query the block runs as. */
  query: string;
  problems: TasksBlockProblem[];
  /** The block asked to show its query (`explain`). */
  explain: boolean;
};

/** The note the block is written in, for {{query.file.*}} placeholders. */
export type TasksBlockHost = { path: string } | null;

type Read = { expr: string } | { error: string; rewrite: string | null };

export const TASKS_BLOCK_FOOTER =
  "One rule per line, and every line must match: not done · done · due, scheduled, starts, or happens before / after / on today, tomorrow, 2026-10-09, or this week · has due date / no due date · priority is high, above medium, or below high · description, path, filename, folder, or heading includes words · tags include #tag · is recurring · exclude sub-items · (A) AND (B), (A) OR (B), NOT (A) · sort by due, priority, or urgency, with reverse · group by filename, folder, heading, priority, or status · limit 20 · explain shows the TASK query it runs. Ticking a box here writes the note.";

const PRIORITIES = Object.keys(PRIORITY_RANK) as TaskPriority[];

const DATE_FIELD: Record<string, string> = {
  due: "due",
  scheduled: "scheduled",
  starts: "start",
  start: "start",
  done: "completion",
  created: "created",
  cancelled: "cancelledDate",
};

const TEXT_FIELD: Record<string, string> = {
  description: "text",
  path: "file.path",
  folder: "file.folder",
  filename: "file.name",
  heading: "heading",
  recurrence: "recurrence",
  id: "id",
};

const SORT_FIELD: Record<string, string> = {
  due: "due",
  scheduled: "scheduled",
  start: "start",
  starts: "start",
  done: "completion",
  created: "created",
  cancelled: "cancelledDate",
  happens: "happens",
  description: "text",
  path: "file.path",
  filename: "file.name",
  folder: "file.folder",
  heading: "heading",
  id: "id",
  recurrence: "recurrence",
};

const GROUP_FIELD: Record<string, string> = {
  ...SORT_FIELD,
  backlink: "file.name",
  priority: "priority",
  status: "status",
  "status.type": "status",
  "status.name": "status",
  recurring: "recurring",
  urgency: "urgency",
};

const KNOWN_STARTS = [
  "not done",
  "done",
  "due",
  "scheduled",
  "starts",
  "happens",
  "created",
  "cancelled",
  "has due date",
  "no due date",
  "priority is",
  "path includes",
  "heading includes",
  "description includes",
  "filename includes",
  "folder includes",
  "tags include",
  "is recurring",
  "is blocked",
  "exclude sub-items",
  "sort by",
  "group by",
  "limit",
];

function q(text: string): string {
  return JSON.stringify(text);
}

function day(ymd: string): string {
  return `date(${ymd})`;
}

/** Monday of the week `ymd` is in. */
function weekStart(ymd: string): string {
  const wd = weekdayOf(ymd) ?? 1;
  return addDays(ymd, -((wd + 6) % 7)) as string;
}

/** A day or a range of days, as the plugin reads a date: one day, `this week`, or two dates. */
const NUMBER_WORDS: Record<string, string> = {
  a: "1",
  an: "1",
  one: "1",
  two: "2",
  three: "3",
  four: "4",
  five: "5",
  six: "6",
  seven: "7",
  eight: "8",
  nine: "9",
  ten: "10",
  twelve: "12",
};

export function tasksDateRange(text: string, today: string): [string, string] | null {
  const raw = text
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/^(in )?(a|an|one|two|three|four|five|six|seven|eight|nine|ten|twelve) (?=(day|week|month|year)s?\b)/, (_all, inWord: string | undefined, n: string) => `${inWord ?? ""}${NUMBER_WORDS[n]} `);
  const two = /^(\d{4}-\d{2}-\d{2}) (\d{4}-\d{2}-\d{2})$/.exec(raw);
  if (two && isYmdText(two[1] as string) && isYmdText(two[2] as string)) {
    const a = two[1] as string;
    const b = two[2] as string;
    return a <= b ? [a, b] : [b, a];
  }
  const rel = /^(last|this|next) (week|month|quarter|year)$/.exec(raw);
  if (rel) {
    const shift = rel[1] === "last" ? -1 : rel[1] === "next" ? 1 : 0;
    const p = parseYmd(today);
    if (!p) return null;
    if (rel[2] === "week") {
      const from = addDays(weekStart(today), shift * 7) as string;
      return [from, addDays(from, 6) as string];
    }
    const span = rel[2] === "month" ? 1 : rel[2] === "quarter" ? 3 : 12;
    const firstMonth = rel[2] === "month" ? p.m : rel[2] === "quarter" ? Math.floor((p.m - 1) / 3) * 3 + 1 : 1;
    const start = addMonths(`${p.y}-${String(firstMonth).padStart(2, "0")}-01`, shift * span) as string;
    const endMonth = addMonths(start, span - 1) as string;
    const e = parseYmd(endMonth) as { y: number; m: number };
    return [start, `${endMonth.slice(0, 8)}${String(daysInMonth(e.y, e.m)).padStart(2, "0")}`];
  }
  const ago = /^(\d{1,3}) (day|week|month|year)s? ago$/.exec(raw);
  if (ago) {
    const n = Number(ago[1]);
    const unit = ago[2];
    const ymd = unit === "day" ? addDays(today, -n) : unit === "week" ? addDays(today, -7 * n) : addMonths(today, unit === "month" ? -n : -12 * n);
    return ymd ? [ymd, ymd] : null;
  }
  const one = resolveNaturalDate(raw, today);
  return one ? [one, one] : null;
}

function dateCompare(field: string, op: string, range: [string, string]): string {
  const [from, to] = range;
  switch (op) {
    case "before":
      return `${field} < ${day(from)}`;
    case "after":
      return `${field} > ${day(to)}`;
    case "on or before":
      return `${field} <= ${day(to)}`;
    case "on or after":
      return `${field} >= ${day(from)}`;
    default:
      return from === to ? `${field} = ${day(from)}` : `${field} >= ${day(from)} && ${field} <= ${day(to)}`;
  }
}

/** One date filter: `due before tomorrow`, `starts in this week`, `happens on 2026-10-09`. */
function readDate(kind: string, rest: string, today: string): Read {
  const m = /^(on or before|on or after|before|after|on|in)?\s*(.*)$/.exec(rest.trim());
  const op = m?.[1] ?? "on";
  const when = (m?.[2] ?? "").trim();
  if (!when) return { error: `Say which day, like “${kind} before tomorrow” or “${kind} on 2026-10-09”.`, rewrite: `${kind} before tomorrow` };
  if (/^date is invalid$/i.test(when) || /^is invalid$/i.test(when)) {
    return { error: "Bad dates are flagged on the task itself, with a fix.", rewrite: null };
  }
  const range = tasksDateRange(when, today);
  if (!range && !m?.[1]) {
    const [first = "", ...tail] = when.split(" ");
    const rest = tail.join(" ");
    const meant = ["before", "after"].find((word) => first.length >= 4 && editDistance(first, word) <= 2);
    if (meant && tasksDateRange(rest, today)) {
      return { error: `“${first}” is not a word Nexus reads here.`, rewrite: `${kind} ${meant} ${rest}` };
    }
  }
  if (!range) {
    return {
      error: `“${when}” is not a day Nexus can read.`,
      rewrite: `${kind} ${op === "on" && !m?.[1] ? "" : `${op} `}${/week|month|year/.test(when) ? "this week" : "today"}`.replace(/\s+/g, " "),
    };
  }
  if (kind === "happens") {
    const parts = ["due", "scheduled", "start"].map((field) => `(!empty(${field}) && ${dateCompare(field, op, range)})`);
    return { expr: parts.join(" || ") };
  }
  const field = DATE_FIELD[kind] as string;
  const test = dateCompare(field, op, range);
  // The plugin keeps a task with no start date in every `starts` filter.
  return { expr: kind === "starts" || kind === "start" ? `empty(start) || (${test})` : `!empty(${field}) && ${test}` };
}

function placeholders(text: string, host: TasksBlockHost): string | null {
  if (!text.includes("{{")) return text;
  if (!host) return null;
  const path = host.path;
  const name = path.split("/").pop() ?? path;
  const folder = path.includes("/") ? `${path.slice(0, path.lastIndexOf("/"))}/` : "/";
  const values: Record<string, string> = {
    "query.file.path": path,
    "query.file.pathwithoutextension": path.replace(/\.md$/i, ""),
    "query.file.folder": folder,
    "query.file.root": path.includes("/") ? `${path.split("/")[0]}/` : "/",
    "query.file.filename": name,
    "query.file.filenamewithoutextension": name.replace(/\.md$/i, ""),
  };
  let missing = false;
  const out = text.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_all, key: string) => {
    const value = values[key.toLowerCase()];
    if (value === undefined) missing = true;
    return value ?? "";
  });
  return missing ? null : out;
}

function priorityRead(rest: string): Read {
  const m = /^(above |below |not )?(highest|high|medium|normal|none|low|lowest)$/.exec(rest.trim());
  if (!m) return { error: "Priorities are highest, high, medium, none, low, and lowest.", rewrite: "priority is high" };
  const level = (m[2] === "normal" ? "none" : m[2]) as TaskPriority;
  const how = (m[1] ?? "").trim();
  const rank = PRIORITY_RANK[level];
  const keep = PRIORITIES.filter((p) =>
    how === "above" ? PRIORITY_RANK[p] > rank : how === "below" ? PRIORITY_RANK[p] < rank : how === "not" ? p !== level : p === level,
  );
  if (!keep.length) return { expr: "false" };
  return { expr: keep.length === 1 ? `priority = ${q(keep[0] as string)}` : `[${keep.map(q).join(", ")}].contains(priority)` };
}

function nearestStart(text: string): string | null {
  const lower = text.toLowerCase();
  let best: string | null = null;
  let bestScore = Infinity;
  for (const start of KNOWN_STARTS) {
    const head = lower.slice(0, start.length);
    const score = editDistance(head, start);
    if (score < bestScore) {
      bestScore = score;
      best = start;
    }
  }
  return best && bestScore <= Math.max(2, Math.floor(best.length / 4)) ? best : null;
}

function editDistance(a: string, b: string): number {
  const row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i += 1) {
    let prev = row[0] as number;
    row[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      const cur = row[j] as number;
      row[j] = Math.min(cur + 1, (row[j - 1] as number) + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = cur;
    }
  }
  return row[b.length] as number;
}

/** One plain filter line, without AND / OR. */
function readLeaf(text: string, today: string, host: TasksBlockHost): Read {
  const line = text.trim().replace(/\s+/g, " ");
  const lower = line.toLowerCase();
  if (lower === "not done") return { expr: "open" };
  if (lower === "done") return { expr: "!open" };
  if (lower === "is recurring") return { expr: "recurring" };
  if (lower === "is not recurring") return { expr: "!recurring" };
  if (lower === "is blocked") return { expr: "blocked" };
  if (lower === "is not blocked") return { expr: "!blocked" };
  if (lower === "exclude sub-items") return { expr: "depth = 0" };
  if (lower === "has tags" || lower === "has tag") return { expr: "!empty(tags)" };
  if (lower === "no tags" || lower === "no tag") return { expr: "empty(tags)" };
  if (lower === "has id") return { expr: "!empty(id)" };
  if (lower === "no id") return { expr: "empty(id)" };
  if (/^(?:filter|sort|group) by function\b/.test(lower)) {
    return { error: "Nexus does not run code from notes. Write this as a TASK query in a ```nexus-query block.", rewrite: null };
  }
  const has = /^(has|no) (due|scheduled|start|done|created|cancelled|happens) date$/.exec(lower);
  if (has) {
    const kind = has[2] as string;
    if (kind === "happens") {
      const any = "(!empty(due) || !empty(scheduled) || !empty(start))";
      return { expr: has[1] === "has" ? any : `!${any}` };
    }
    const field = DATE_FIELD[kind] as string;
    return { expr: has[1] === "has" ? `!empty(${field})` : `empty(${field})` };
  }
  const date = /^(due|scheduled|starts|start|done|created|cancelled|happens)\b(.*)$/.exec(lower);
  if (date) return readDate(date[1] as string, date[2] as string, today);
  const pri = /^priority is (.*)$/.exec(lower);
  if (pri) return priorityRead(pri[1] as string);
  const status = /^status\.type is (not )?(todo|in_progress|done|cancelled|non_task)$/.exec(lower);
  if (status) {
    const name = { todo: "todo", in_progress: "doing", done: "done", cancelled: "cancelled", non_task: "non_task" }[status[2] as string] as string;
    return { expr: `status ${status[1] ? "!=" : "="} ${q(name)}` };
  }
  if (/^status\.(name|type)\b/.test(lower)) {
    return { error: "Statuses are read by type: todo, in_progress, done, or cancelled.", rewrite: "status.type is in_progress" };
  }
  const tag = /^tags? (includes?|does not include|do not include) (.+)$/i.exec(line);
  if (tag) {
    const want = tag[2]?.trim().toLowerCase() ?? "";
    const test = `string(tags).lower().contains(${q(want)})`;
    return { expr: /not/i.test(tag[1] as string) ? `!${test}` : test };
  }
  const textual = /^(description|path|folder|filename|heading|recurrence|id|root) (includes|does not include|regex matches|regex does not match) (.*)$/i.exec(line);
  if (textual) {
    const kind = (textual[1] as string).toLowerCase();
    const how = (textual[2] as string).toLowerCase();
    if (kind === "root") return { error: "Read the folder from the path instead.", rewrite: `path includes ${textual[3]}` };
    if (how.startsWith("regex")) {
      const plain = (textual[3] as string).replace(/^\/(.*)\/[a-z]*$/i, "$1").replace(/[\\^$.*+?()[\]{}|]/g, "");
      return {
        error: "Regular expressions are not read here. Match plain words with includes.",
        rewrite: `${kind} ${how.includes("not") ? "does not include" : "includes"} ${plain || "words"}`,
      };
    }
    const value = placeholders((textual[3] as string).trim(), host);
    if (value === null) return { error: "That {{query…}} placeholder only works in a saved note.", rewrite: null };
    let want = value.toLowerCase();
    if (kind === "filename") want = want.replace(/\.md$/, "");
    const field = TEXT_FIELD[kind] as string;
    const test = `${field}.lower().contains(${q(want)})`;
    return { expr: how === "includes" ? test : `!${test}` };
  }
  const guess = nearestStart(line);
  return {
    error: `“${line}” is not a Tasks filter Nexus reads.`,
    rewrite: guess && guess !== lower ? guess + line.slice(guess.length).replace(/^\S*/, "") : null,
  };
}

type Group = { inner: string; end: number };

/** A ( … ) or " … " group starting at `at`, matched to its closing mark. */
function groupAt(text: string, at: number): Group | null {
  const open = text[at];
  if (open === '"') {
    const end = text.indexOf('"', at + 1);
    return end > at ? { inner: text.slice(at + 1, end), end: end + 1 } : null;
  }
  if (open !== "(") return null;
  let depth = 0;
  for (let i = at; i < text.length; i += 1) {
    if (text[i] === "(") depth += 1;
    else if (text[i] === ")") {
      depth -= 1;
      if (depth === 0) return { inner: text.slice(at + 1, i), end: i + 1 };
    }
  }
  return null;
}

/** A filter line: one plain filter, or ( … ) AND / OR / NOT ( … ) groups. */
export function readTasksFilter(text: string, today: string, host: TasksBlockHost): Read {
  const line = text.trim();
  if (!/^(?:\(|"|NOT\s*[("])/.test(line)) {
    const bare = /^(.+?)\s+(AND|OR)\s+(.+)$/.exec(line);
    if (bare && "expr" in readLeaf(bare[1] as string, today, host)) {
      return {
        error: "Put each side of AND / OR in parentheses.",
        rewrite: `(${bare[1]}) ${bare[2]} (${bare[3]})`,
      };
    }
    return readLeaf(line, today, host);
  }
  const out: string[] = [];
  let i = 0;
  let expectOperand = true;
  while (i < line.length) {
    while (line[i] === " ") i += 1;
    if (i >= line.length) break;
    if (expectOperand) {
      let negate = false;
      if (/^NOT\b/.test(line.slice(i))) {
        negate = true;
        i += 3;
        while (line[i] === " ") i += 1;
      }
      const group = groupAt(line, i);
      if (!group) return { error: "Each part needs its own ( … ), and every ( needs a ).", rewrite: null };
      const inner = readTasksFilter(group.inner, today, host);
      if ("error" in inner) return { error: `In “${group.inner.trim()}”: ${inner.error}`, rewrite: inner.rewrite ? line.replace(group.inner, inner.rewrite) : null };
      out.push(`${negate ? "!" : ""}(${inner.expr})`);
      i = group.end;
      expectOperand = false;
    } else {
      const op = /^(AND NOT|OR NOT|AND|OR|XOR)\b/.exec(line.slice(i));
      if (!op) return { error: "Join groups with AND, OR, or NOT.", rewrite: null };
      const word = op[1] as string;
      if (word === "XOR") return { error: "XOR is not read here. Spell it out with AND, OR, and NOT.", rewrite: null };
      out.push(word.startsWith("AND") ? "&&" : "||");
      if (word.endsWith("NOT")) out.push("!");
      i += word.length;
      expectOperand = true;
    }
  }
  if (expectOperand || !out.length) return { error: "A group is missing after the last AND / OR.", rewrite: null };
  return { expr: out.join(" ").replace(/! \(/g, "!(") };
}

/** What a query block runs: its own text, or for a ```tasks block the TASK query it reads as. */
export function blockQuery(
  source: string,
  fence: string | null | undefined,
  today: string,
  host: TasksBlockHost,
): { query: string; plan: TasksBlockPlan | null } {
  if (fence !== "tasks") return { query: source, plan: null };
  const plan = tasksBlockToQuery(source, today, host);
  return { query: plan.query, plan };
}

/** True when a line of the block keeps it from running. */
export function planBlocked(plan: TasksBlockPlan | null): boolean {
  return Boolean(plan?.problems.some((problem) => problem.blocking));
}

/** The block with one line swapped for its suggested rewrite. */
export function applyRewrite(source: string, problem: TasksBlockProblem): string {
  if (problem.rewrite === null) return source;
  const lines = source.split(/\r?\n/);
  const at = lines[problem.line];
  if (at === undefined) return source;
  const indent = /^\s*/.exec(at)?.[0] ?? "";
  lines[problem.line] = indent + problem.rewrite;
  return lines.join("\n");
}

/** Read a whole ```tasks block. */
export function tasksBlockToQuery(source: string, today: string, host: TasksBlockHost = null): TasksBlockPlan {
  const where: string[] = [];
  const sort: string[] = [];
  let group: string | null = null;
  let limit: number | null = null;
  let explain = false;
  const problems: TasksBlockProblem[] = [];
  const lines = source.split(/\r?\n/);
  lines.forEach((rawLine, index) => {
    const line = rawLine.trim();
    const lower = line.toLowerCase().replace(/\s+/g, " ");
    if (!line || line.startsWith("#") || /^\{\{!.*\}\}$/.test(line)) return;
    const note = (message: string, rewrite: string | null = null, blocking = false) =>
      problems.push({ line: index, text: line, message, rewrite, blocking });
    if (lower === "explain") {
      explain = true;
      return;
    }
    if (/^(hide|show)\b/.test(lower) || /^(short|full)( mode)?$/.test(lower) || lower === "ignore global query") return;
    const lim = /^limit (?:to )?(\d+)(?: tasks?)?$/.exec(lower);
    if (lim) {
      limit = Number(lim[1]);
      return;
    }
    if (/^limit groups\b/.test(lower)) {
      note("Limits on each group are not read; the whole list is limited instead.", "limit 50");
      return;
    }
    if (lower.startsWith("limit")) {
      note("Limit takes a number.", "limit 50");
      return;
    }
    const sortBy = /^sort by (.+?)( reverse)?$/.exec(lower);
    if (sortBy) {
      const key = (sortBy[1] as string).trim();
      const reverse = Boolean(sortBy[2]);
      if (key === "priority") sort.push(reverse ? "priority DESC" : "priority");
      else if (key === "urgency") sort.push(reverse ? "urgency ASC" : "urgency DESC");
      else if (key === "status" || key === "status.type") sort.push(reverse ? "open ASC" : "open DESC");
      else if (key === "recurring") sort.push(reverse ? "recurring ASC" : "recurring DESC");
      else if (SORT_FIELD[key]) sort.push(`${SORT_FIELD[key]}${reverse ? " DESC" : ""}`);
      else if (key.startsWith("function")) note("Nexus does not run code from notes, so this sort is skipped.", "sort by due");
      else note(`Sorting by “${key}” is not read, so it is skipped.`, "sort by due");
      return;
    }
    const groupBy = /^group by (.+?)( reverse)?$/.exec(lower);
    if (groupBy) {
      const key = (groupBy[1] as string).trim();
      if (group) {
        note("Only the first group by is used.");
        return;
      }
      if (GROUP_FIELD[key]) {
        group = GROUP_FIELD[key] as string;
        if (groupBy[2]) note("Groups always run in order; reverse is skipped.");
      } else if (key.startsWith("function")) note("Nexus does not run code from notes, so this grouping is skipped.", "group by filename");
      else note(`Grouping by “${key}” is not read, so it is skipped.`, "group by filename");
      return;
    }
    const read = readTasksFilter(line, today, host);
    if ("expr" in read) where.push(read.expr);
    else note(read.error, read.rewrite, true);
  });
  const out = ["TASK"];
  if (where.length) out.push(`WHERE ${where.map((expr) => (where.length > 1 ? `(${expr})` : expr)).join(" AND ")}`);
  if (sort.length) out.push(`SORT ${sort.join(", ")}`);
  if (group) out.push(`GROUP BY ${group}`);
  if (limit !== null) out.push(`LIMIT ${limit}`);
  return { query: out.join("\n"), problems, explain };
}
