import { useEffect, useMemo, useState } from "react";
import { ClipboardCopy, ListChecks, Plus, RefreshCw, Search } from "lucide-react";
import { useVaultStore } from "@/lib/vault/store";
import { addTask } from "@/lib/tasks/actions";
import { friendlyDay, localToday } from "@/lib/tasks/dates";
import { composeTaskLine } from "@/lib/tasks/edit";
import { priorityMarker } from "@/lib/tasks/extract";
import {
  EMPTY_FILTER,
  TASK_VIEWS,
  filterAsQuery,
  groupTasks,
  openTaskTags,
  viewCounts,
  type TaskFilter,
  type TaskView,
} from "@/lib/tasks/filter";
import { isTaskNote, readUnread, rescanTasks, useTaskIndex } from "@/lib/tasks/task-index";
import { TaskRow } from "@/components/tasks/TaskRow";
import { cn } from "@/lib/utils";

/** Rows drawn at first; "Show more" adds this many again. */
const PAGE = 150;
const VIEW_KEY = "nexus.tasks.view";

const EMPTY_TEXT: Record<TaskView, string> = {
  today: "Nothing due or scheduled for today.",
  upcoming: "Nothing with a date after today.",
  nodate: "Every open task has a date.",
  open: "No open tasks.",
  done: "Nothing done or cancelled yet.",
  note: "This note has no tasks.",
};

function savedView(): TaskView {
  try {
    const v = window.localStorage.getItem(VIEW_KEY);
    if (v && TASK_VIEWS.some((view) => view.id === v)) return v as TaskView;
  } catch {
    /* storage blocked */
  }
  return "today";
}

/** Tick today's date over at midnight while the rail stays open. */
function useToday(): string {
  const [today, setToday] = useState(localToday);
  useEffect(() => {
    const timer = window.setInterval(() => setToday(localToday()), 60_000);
    return () => window.clearInterval(timer);
  }, []);
  return today;
}

function QuickAdd({ today, activeNoteId }: { today: string; activeNoteId: string | null }) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [target, setTarget] = useState<"daily" | "note">("daily");
  const canNote = Boolean(activeNoteId);
  const preview = useMemo(() => (text.trim() ? composeTaskLine(text, today) : null), [text, today]);
  const submit = async () => {
    if (!text.trim() || busy) return;
    setBusy(true);
    const result = await addTask(
      text,
      target === "note" && activeNoteId ? { kind: "note", noteId: activeNoteId } : { kind: "daily" },
    );
    setBusy(false);
    if (result.ok) {
      setText("");
      const where = target === "note" ? "this note" : "today's daily note";
      useVaultStore.getState().setToast(`Task added to ${where}`);
    }
  };
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-1 rounded-[10px] border border-[var(--border)] bg-white/[0.02] px-2 py-1 focus-within:border-[var(--accent)]">
        <Plus size={14} className="shrink-0 text-[var(--text-muted)]" />
        <input
          id="tasks-quick-add"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              void submit();
            } else if (e.key === "Escape") setText("");
          }}
          placeholder="Add a task… e.g. Pay rent fri !high every month"
          aria-label="Add a task"
          data-testid="tasks-quick-add"
          className="min-w-0 flex-1 bg-transparent py-0.5 text-[13px] text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)]"
        />
      </div>
      {preview ? (
        <div className="flex flex-col gap-0.5 px-1 text-[11px] text-[var(--text-muted)]" data-testid="tasks-quick-preview">
          <div className="flex flex-wrap items-center gap-x-1.5">
            <span className="text-[var(--text-secondary)]">{preview.text || "New task"}</span>
            {preview.priority !== "none" ? <span>{priorityMarker(preview.priority)} {preview.priority}</span> : null}
            {preview.due ? <span>📅 {friendlyDay(preview.due, today)}</span> : null}
            {preview.scheduled ? <span>⏳ {friendlyDay(preview.scheduled, today)}</span> : null}
            {preview.start ? <span>🛫 {friendlyDay(preview.start, today)}</span> : null}
            {preview.recurrence ? <span>🔁 {preview.recurrence}</span> : null}
          </div>
          {preview.warning ? <div className="text-[var(--warning)]">{preview.warning}</div> : null}
          <div className="flex items-center gap-1">
            <span className="min-w-0 flex-1 truncate font-mono text-[10.5px] opacity-80" title="The line that will be written">
              {preview.line}
            </span>
            <select
              value={canNote ? target : "daily"}
              onChange={(e) => setTarget(e.target.value as "daily" | "note")}
              aria-label="Add to"
              data-testid="tasks-quick-target"
              className="rounded border border-[var(--border)] bg-[var(--bg-elevated)] px-1 py-px text-[11px] text-[var(--text-secondary)]"
            >
              <option value="daily">→ Today's note</option>
              {canNote ? <option value="note">→ This note</option> : null}
            </select>
          </div>
        </div>
      ) : null}
    </div>
  );
}

const SYNTAX_ROWS: [string, string][] = [
  ["- [ ] Task", "to do"],
  ["- [x] / - [/] / - [-]", "done / in progress / cancelled"],
  ["📅 2026-10-03", "due  (or [due:: 2026-10-03])"],
  ["⏳ / 🛫", "scheduled / starts"],
  ["🔺 ⏫ 🔼 🔽 ⏬", "highest → lowest priority"],
  ["🔁 every week", "repeat; ticking adds the next one"],
  ["✅ / ❌ date", "written for you on done / cancel"],
  ["🆔 a1 · ⛔ a1", "this task waits on task a1"],
];

function SyntaxHelp() {
  return (
    <div className="rounded-[10px] border border-[var(--border)] p-2 text-[11px] text-[var(--text-muted)]" data-testid="tasks-syntax">
      <p className="mb-1 text-[var(--text-secondary)]">
        Tasks are lines in your notes. Everything below is plain text on the line, so the note reads the same in any
        Markdown editor and stays unchanged on disk.
      </p>
      <dl className="grid grid-cols-[auto_1fr] gap-x-2 gap-y-0.5">
        {SYNTAX_ROWS.map(([code, meaning]) => (
          <div key={code} className="contents">
            <dt className="font-mono text-[var(--text-secondary)]">{code}</dt>
            <dd>{meaning}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-1">
        Quick add reads words: <span className="font-mono">tomorrow</span>, <span className="font-mono">fri</span>,{" "}
        <span className="font-mono">in 3 days</span>, <span className="font-mono">due oct 5</span>,{" "}
        <span className="font-mono">!high</span>, <span className="font-mono">every 2 weeks</span>.
      </p>
    </div>
  );
}

export function TasksRail() {
  const activeNoteId = useVaultStore((s) => s.activeNoteId);
  const activeIsNote = useVaultStore((s) => (s.activeNoteId ? isTaskNote(s.nodes[s.activeNoteId]) : false));
  const { tasks, state } = useTaskIndex();
  const today = useToday();
  const [filter, setFilter] = useState<TaskFilter>(() => ({ ...EMPTY_FILTER, view: savedView() }));
  const [shown, setShown] = useState(PAGE);
  const [showSyntax, setShowSyntax] = useState(false);

  const noteId = activeIsNote ? activeNoteId : null;
  const live: TaskFilter = { ...filter, noteId };
  const groups = useMemo(() => groupTasks(tasks, live, today), [tasks, filter, noteId, today]); // eslint-disable-line react-hooks/exhaustive-deps
  const counts = useMemo(() => viewCounts(tasks, live, today), [tasks, filter, noteId, today]); // eslint-disable-line react-hooks/exhaustive-deps
  const tags = useMemo(() => openTaskTags(tasks), [tasks]);
  const total = groups.reduce((n, g) => n + g.tasks.length, 0);

  useEffect(() => setShown(PAGE), [filter]);

  const update = (patch: Partial<TaskFilter>) => {
    setFilter((cur) => ({ ...cur, ...patch }));
    if (patch.view) {
      try {
        window.localStorage.setItem(VIEW_KEY, patch.view);
      } catch {
        /* storage blocked */
      }
    }
  };

  const copyQuery = () => {
    const block = "```nexus-query\n" + filterAsQuery(live) + "\n```";
    void navigator.clipboard?.writeText(block).then(
      () => useVaultStore.getState().setToast("Copied as a query block. Paste it into any note."),
      () => useVaultStore.getState().setToast("Could not reach the clipboard."),
    );
  };

  let budget = shown;
  const anyTasks = tasks.length > 0;
  const filtered = Boolean(filter.search || filter.tag || filter.path || filter.minPriority);

  return (
    <div className="flex flex-col gap-2 p-3" data-testid="tasks-rail">
      <QuickAdd today={today} activeNoteId={noteId} />

      <div className="flex flex-wrap gap-1" role="tablist" aria-label="Task views">
        {TASK_VIEWS.map((view) => (
          <button
            key={view.id}
            type="button"
            role="tab"
            aria-selected={filter.view === view.id}
            data-testid={`tasks-view-${view.id}`}
            disabled={view.id === "note" && !noteId}
            className={cn("chip-btn", filter.view === view.id && "is-active")}
            onClick={() => update({ view: view.id })}
          >
            {view.label}
            {view.id !== "done" ? (
              <span
                className={cn(
                  "ml-1 tabular-nums opacity-70",
                  view.id === "today" && counts.today > 0 && "text-[var(--accent)] opacity-100",
                )}
              >
                {counts[view.id]}
              </span>
            ) : null}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-1">
        <div className="flex min-w-[120px] flex-1 items-center gap-1 rounded-md border border-[var(--border)] px-1.5">
          <Search size={12} className="shrink-0 text-[var(--text-muted)]" />
          <input
            value={filter.search}
            onChange={(e) => update({ search: e.target.value })}
            placeholder="Search tasks"
            aria-label="Search tasks"
            data-testid="tasks-search"
            className="min-w-0 flex-1 bg-transparent py-1 text-[12px] text-[var(--text-primary)] outline-none"
          />
        </div>
        <select
          value={filter.tag ?? ""}
          onChange={(e) => update({ tag: e.target.value || null })}
          aria-label="Tag"
          data-testid="tasks-tag"
          className="max-w-[110px] rounded-md border border-[var(--border)] bg-[var(--bg-elevated)] px-1 py-1 text-[12px] text-[var(--text-secondary)]"
        >
          <option value="">Any tag</option>
          {tags.map(({ tag, count }) => (
            <option key={tag} value={tag}>
              #{tag} ({count})
            </option>
          ))}
        </select>
        <select
          value={filter.minPriority ?? ""}
          onChange={(e) => update({ minPriority: (e.target.value || null) as TaskFilter["minPriority"] })}
          aria-label="Priority"
          data-testid="tasks-priority-filter"
          className="rounded-md border border-[var(--border)] bg-[var(--bg-elevated)] px-1 py-1 text-[12px] text-[var(--text-secondary)]"
        >
          <option value="">Any priority</option>
          <option value="highest">🔺 Highest</option>
          <option value="high">⏫ High+</option>
          <option value="medium">🔼 Medium+</option>
        </select>
        <input
          value={filter.path}
          onChange={(e) => update({ path: e.target.value })}
          placeholder="Folder"
          aria-label="Folder or path start"
          data-testid="tasks-path-prefix"
          className="w-[84px] rounded-md border border-[var(--border)] bg-transparent px-1.5 py-1 text-[12px] text-[var(--text-primary)]"
        />
      </div>

      <div className="flex items-center gap-2 text-[11.5px] text-[var(--text-muted)]" role="status">
        {state.phase === "scanning" ? (
          <span data-testid="tasks-scanning">Reading tasks… {state.scanned.toLocaleString()} notes</span>
        ) : (
          <span data-testid="tasks-summary">
            {total.toLocaleString()} {total === 1 ? "task" : "tasks"}
            {state.ms ? <span className="opacity-70"> · {state.scanned.toLocaleString()} notes read in {state.ms.toLocaleString()} ms</span> : null}
          </span>
        )}
        <span className="flex-1" />
        <button type="button" className="rounded p-0.5 hover:bg-white/[0.07]" title="Read the vault again" aria-label="Read the vault again" onClick={rescanTasks}>
          <RefreshCw size={12} />
        </button>
      </div>
      {state.unread > 0 ? (
        <div className="flex items-center gap-2 rounded-md bg-[var(--warning-dim)] px-2 py-1 text-[11.5px] text-[var(--text-secondary)]" data-testid="tasks-unread">
          <span className="flex-1">
            {state.unread.toLocaleString()} {state.unread === 1 ? "note is" : "notes are"} not read yet, so their tasks are missing.
          </span>
          <button type="button" className="chip-btn" onClick={() => void readUnread()}>
            Read them
          </button>
        </div>
      ) : null}

      <div className="flex flex-col gap-2">
        {groups.map((group) => {
          if (budget <= 0) return null;
          const rows = group.tasks.slice(0, budget);
          budget -= rows.length;
          return (
            <section key={group.key} data-testid={`tasks-group-${group.key}`}>
              {groups.length > 1 || filter.view === "today" || filter.view === "upcoming" ? (
                <h3
                  className={cn(
                    "mb-0.5 flex items-center gap-1 px-1.5 text-[10.5px] font-semibold uppercase tracking-[0.08em]",
                    group.tone === "overdue" && "text-[var(--danger)]",
                    group.tone === "today" && "text-[var(--accent)]",
                    group.tone !== "overdue" && group.tone !== "today" && "text-[var(--text-muted)]",
                  )}
                >
                  {group.label}
                  <span className="font-normal opacity-70">{group.tasks.length}</span>
                </h3>
              ) : null}
              <div className="flex flex-col">
                {rows.map((task) => (
                  <TaskRow
                    key={`${task.noteId}:${task.line}:${task.raw}`}
                    task={task}
                    today={today}
                    showNote={filter.view !== "note"}
                    indent={filter.view === "note"}
                  />
                ))}
              </div>
            </section>
          );
        })}
        {total > shown ? (
          <button type="button" className="chip-btn self-start" data-testid="tasks-more" onClick={() => setShown((n) => n + PAGE)}>
            Show {Math.min(PAGE, total - shown).toLocaleString()} more of {(total - shown).toLocaleString()}
          </button>
        ) : null}
      </div>

      {state.phase !== "scanning" && total === 0 ? (
        <div className="flex flex-col items-start gap-1.5 px-1 py-3 text-[12.5px] text-[var(--text-muted)]" data-testid="tasks-empty">
          {anyTasks ? (
            <>
              <p>{filtered ? "No tasks match these filters." : EMPTY_TEXT[filter.view]}</p>
              {filtered ? (
                <button type="button" className="chip-btn" onClick={() => update({ search: "", tag: null, path: "", minPriority: null })}>
                  Clear filters
                </button>
              ) : filter.view === "today" && counts.upcoming > 0 ? (
                <button type="button" className="chip-btn" onClick={() => update({ view: "upcoming" })}>
                  See {counts.upcoming} upcoming
                </button>
              ) : null}
            </>
          ) : (
            <>
              <p className="text-[var(--text-secondary)]">No tasks in this vault yet.</p>
              <p>
                Type one above and press Enter; it goes into today's daily note. Or write{" "}
                <span className="font-mono">- [ ] Task 📅 {today}</span> in any note.
              </p>
              <button
                type="button"
                className="chip-btn"
                onClick={() => document.getElementById("tasks-quick-add")?.focus()}
              >
                <Plus size={12} className="mr-1 inline" />
                Add the first task
              </button>
            </>
          )}
        </div>
      ) : null}

      {showSyntax ? <SyntaxHelp /> : null}
      <div className="flex items-center gap-2 text-[10.5px] text-[var(--text-muted)]">
        <ListChecks size={12} />
        <button type="button" className="hover:text-[var(--text-primary)]" data-testid="tasks-syntax-toggle" onClick={() => setShowSyntax((v) => !v)}>
          {showSyntax ? "Hide syntax" : "Syntax"}
        </button>
        <span className="flex-1" />
        <button
          type="button"
          className="inline-flex items-center gap-1 hover:text-[var(--text-primary)]"
          data-testid="tasks-copy-query"
          title="Put this view in a note as a TASK query block"
          onClick={copyQuery}
        >
          <ClipboardCopy size={11} />
          Copy as query
        </button>
      </div>
    </div>
  );
}
