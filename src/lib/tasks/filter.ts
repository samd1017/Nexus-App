/**
 * What the Tasks rail shows: one view (Today, Upcoming, …) narrowed by search,
 * tag, folder, and priority, sorted most urgent first and split into groups.
 * Pure, so the same filter is tested without a browser and copied as a TASK query.
 */

import { addDays, friendlyDay, isYmd } from "./dates";
import { taskNotStarted, taskUrgency, type VaultTask } from "./extract";
import { PRIORITY_RANK, isOpen, type TaskPriority } from "./syntax";

export type TaskView = "today" | "upcoming" | "nodate" | "open" | "done" | "note";

export const TASK_VIEWS: { id: TaskView; label: string }[] = [
  { id: "today", label: "Today" },
  { id: "upcoming", label: "Upcoming" },
  { id: "nodate", label: "No date" },
  { id: "open", label: "All open" },
  { id: "done", label: "Done" },
  { id: "note", label: "This note" },
];

export type TaskFilter = {
  view: TaskView;
  /** Words that must all appear in the task text or its note's path. */
  search: string;
  /** Lowercase, without #. Nested tags match too. */
  tag: string | null;
  /** Folder or path start, like "Projects/". */
  path: string;
  /** Keep this priority or higher. */
  minPriority: TaskPriority | null;
  /** For "This note". */
  noteId: string | null;
};

export const EMPTY_FILTER: TaskFilter = { view: "today", search: "", tag: null, path: "", minPriority: null, noteId: null };

export type TaskGroup = {
  key: string;
  label: string;
  tone: "overdue" | "today" | "normal" | "muted";
  tasks: VaultTask[];
};

/** Upcoming lists each of the next days on its own, then one "Later" group. */
const UPCOMING_DAYS = 7;

/** The day a task counts for in Today and Upcoming: due, else scheduled. */
export function taskDay(task: Pick<VaultTask, "due" | "scheduled">): string | null {
  if (isYmd(task.due) && isYmd(task.scheduled)) return task.due < task.scheduled ? task.due : task.scheduled;
  return isYmd(task.due) ? task.due : isYmd(task.scheduled) ? task.scheduled : null;
}

function tagsLower(task: VaultTask): string[] {
  return task.tags.map((tag) => tag.replace(/^#/, "").toLowerCase());
}

function cleanPath(path: string): string {
  return path.trim().replace(/\\/g, "/").replace(/^\/+/, "").toLowerCase();
}

/** Search, tag, folder, and priority — everything but the view. */
export function taskPassesFilter(task: VaultTask, filter: TaskFilter): boolean {
  if (filter.tag) {
    const want = filter.tag;
    if (!tagsLower(task).some((tag) => tag === want || tag.startsWith(`${want}/`))) return false;
  }
  const path = cleanPath(filter.path);
  if (path && !task.path.toLowerCase().startsWith(path)) return false;
  if (filter.minPriority && PRIORITY_RANK[task.priority] < PRIORITY_RANK[filter.minPriority]) return false;
  const words = filter.search.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length) {
    const hay = `${task.text} ${task.path} ${task.recurrence ?? ""}`.toLowerCase();
    if (!words.every((word) => hay.includes(word))) return false;
  }
  return true;
}

/** The day a task shows under in Upcoming: its start while it has not started, else due or scheduled. */
export function upcomingDay(task: Pick<VaultTask, "due" | "scheduled" | "start">, today: string): string | null {
  return taskNotStarted(task, today) ? task.start : taskDay(task);
}

/**
 * Whether a task belongs in a view, before search and the other filters.
 * Every open task is in exactly one of Today, Upcoming, and No date.
 */
export function taskInView(task: VaultTask, view: TaskView, today: string, noteId: string | null = null): boolean {
  const open = isOpen(task.status);
  switch (view) {
    case "today": {
      const day = taskDay(task);
      return open && !!day && day <= today && !taskNotStarted(task, today);
    }
    case "upcoming": {
      const day = upcomingDay(task, today);
      return open && !!day && day > today;
    }
    case "nodate":
      return open && !taskDay(task) && !taskNotStarted(task, today);
    case "open":
      return open;
    case "done":
      return !open;
    case "note":
      return !!noteId && task.noteId === noteId;
  }
}

function byUrgency(today: string) {
  return (a: VaultTask, b: VaultTask) =>
    taskUrgency(b, today) - taskUrgency(a, today) || a.path.localeCompare(b.path) || a.line - b.line;
}

/** Tasks for the rail, already grouped. */
export function groupTasks(tasks: VaultTask[], filter: TaskFilter, today: string): TaskGroup[] {
  const kept = tasks.filter((task) => taskInView(task, filter.view, today, filter.noteId) && taskPassesFilter(task, filter));
  const urgent = byUrgency(today);
  switch (filter.view) {
    case "today": {
      const overdue = kept.filter((task) => (taskDay(task) as string) < today).sort(urgent);
      const now = kept.filter((task) => taskDay(task) === today).sort(urgent);
      const out: TaskGroup[] = [];
      if (overdue.length) out.push({ key: "overdue", label: "Overdue", tone: "overdue", tasks: overdue });
      if (now.length) out.push({ key: "today", label: "Today", tone: "today", tasks: now });
      return out;
    }
    case "upcoming": {
      const last = addDays(today, UPCOMING_DAYS) ?? today;
      const byDay = new Map<string, VaultTask[]>();
      const later: VaultTask[] = [];
      for (const task of kept) {
        const day = upcomingDay(task, today) ?? "";
        if (day > last) later.push(task);
        else byDay.set(day, [...(byDay.get(day) ?? []), task]);
      }
      const out: TaskGroup[] = [...byDay.keys()].sort().map((day) => ({
        key: day,
        label: friendlyDay(day, today),
        tone: "normal" as const,
        tasks: (byDay.get(day) ?? []).sort(urgent),
      }));
      if (later.length) {
        const dayOf = (task: VaultTask) => upcomingDay(task, today) ?? "";
        later.sort((a, b) => dayOf(a).localeCompare(dayOf(b)) || urgent(a, b));
        out.push({ key: "later", label: "Later", tone: "muted", tasks: later });
      }
      return out;
    }
    case "done": {
      const doneDay = (task: VaultTask) => task.done ?? task.cancelled ?? "";
      kept.sort((a, b) => doneDay(b).localeCompare(doneDay(a)) || a.path.localeCompare(b.path) || a.line - b.line);
      return kept.length ? [{ key: "done", label: "Done", tone: "muted", tasks: kept }] : [];
    }
    case "note":
      kept.sort((a, b) => a.line - b.line);
      return kept.length ? [{ key: "note", label: "This note", tone: "normal", tasks: kept }] : [];
    default:
      kept.sort(urgent);
      return kept.length ? [{ key: filter.view, label: filter.view === "nodate" ? "No date" : "Open", tone: "normal", tasks: kept }] : [];
  }
}

/** How many tasks each view has, with the current search and filters applied. */
export function viewCounts(tasks: VaultTask[], filter: TaskFilter, today: string): Record<TaskView, number> {
  const counts: Record<TaskView, number> = { today: 0, upcoming: 0, nodate: 0, open: 0, done: 0, note: 0 };
  for (const task of tasks) {
    if (!taskPassesFilter(task, filter)) continue;
    for (const { id } of TASK_VIEWS) if (taskInView(task, id, today, filter.noteId)) counts[id] += 1;
  }
  return counts;
}

/** Tags on open tasks, most used first. */
export function openTaskTags(tasks: VaultTask[], limit = 40): { tag: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const task of tasks) {
    if (!isOpen(task.status)) continue;
    for (const tag of tagsLower(task)) counts.set(tag, (counts.get(tag) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag))
    .slice(0, limit);
}

function quoted(text: string): string {
  return `"${text.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

/**
 * The rail's current view as a TASK query block, so a view can live in a note.
 * "This note" becomes FROM [[]], the note the block is pasted into.
 */
export function filterAsQuery(filter: TaskFilter): string {
  const from: string[] = [];
  const where: string[] = [];
  let sort = "SORT urgency DESC";
  const folder = filter.path.trim().replace(/\\/g, "/").replace(/^\/+|\/+$/g, "");
  if (filter.view === "note") from.push("[[]]");
  else if (folder) from.push(quoted(folder));
  if (filter.tag) from.push(`#${filter.tag}`);
  switch (filter.view) {
    case "today":
      where.push("open", "(due <= date(today) || scheduled <= date(today))", "!(start > date(today))");
      break;
    case "upcoming":
      where.push(
        "open",
        "(start > date(today) || ((!empty(due) || !empty(scheduled)) && !(due <= date(today)) && !(scheduled <= date(today))))",
      );
      sort = "SORT happens ASC, urgency DESC";
      break;
    case "nodate":
      where.push("open", "empty(due)", "empty(scheduled)", "!(start > date(today))");
      break;
    case "open":
      where.push("open");
      break;
    case "done":
      where.push("!open");
      sort = "SORT completion DESC";
      break;
    case "note":
      sort = "SORT line ASC";
      break;
  }
  if (filter.minPriority && filter.minPriority !== "lowest") {
    const keep = (Object.keys(PRIORITY_RANK) as TaskPriority[]).filter(
      (p) => PRIORITY_RANK[p] >= PRIORITY_RANK[filter.minPriority as TaskPriority],
    );
    where.push(keep.length === 1 ? `priority = ${quoted(keep[0] as string)}` : `[${keep.map(quoted).join(", ")}].contains(priority)`);
  }
  for (const word of filter.search.trim().split(/\s+/).filter(Boolean)) {
    where.push(`text.lower().contains(${quoted(word.toLowerCase())})`);
  }
  const lines = ["TASK"];
  if (from.length) lines.push(`FROM ${from.join(" AND ")}`);
  if (where.length) lines.push(`WHERE ${where.join(" AND ")}`);
  lines.push(sort);
  return lines.join("\n");
}
