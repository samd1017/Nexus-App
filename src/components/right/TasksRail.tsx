import { useEffect, useMemo, useState } from "react";
import { ListChecks } from "lucide-react";
import { useVaultStore } from "@/lib/vault/store";
import { noteTitle } from "@/lib/vault/types";
import { getSearchIndexState } from "@/lib/vault/sqlite-fill-progress";
import { BROWSER_SHELL_DB } from "@/lib/vault/shell-catalog";
import { completeTaskLine, localToday, priorityMarker, taskDueBucket, taskIsHigh, taskMatchesPath, tasksInNote, type VaultTask } from "@/lib/tasks/extract";
import { fetchTaskPage } from "@/lib/tasks/sqlite-page";
import { jumpToTaskText } from "@/lib/tasks/jump";
import { getFindFocusPane } from "@/lib/editor/find-target";
import { cn } from "@/lib/utils";

const TASK_CAP = 400;
const CHUNK = 80;

type Scope = "all" | "note" | "due-today" | "overdue" | "high";

function liveTitle(id: string, path: string, fallback: string): string {
  const node = useVaultStore.getState().nodes[id];
  if (node?.kind === "note") return noteTitle(node);
  return fallback || path;
}

export function TasksRail() {
  const vaultId = useVaultStore((s) => s.vaultId);
  const shellDbPath = useVaultStore((s) => s.shellDbPath);
  const shellCatalog = useVaultStore((s) => s.shellCatalog);
  const activeNoteId = useVaultStore((s) => s.activeNoteId);
  const indexState = getSearchIndexState();
  const [scope, setScope] = useState<Scope>("all");
  const [pathPrefix, setPathPrefix] = useState("");
  const [tasks, setTasks] = useState<VaultTask[]>([]);
  const [phase, setPhase] = useState<"scanning" | "ready">("scanning");
  const [scanned, setScanned] = useState(0);
  const [refresh, setRefresh] = useState(0);

  useEffect(() => {
    let cancel = false;
    setPhase("scanning");
    setScanned(0);
    setTasks([]);
    const db =
      shellCatalog && shellDbPath && shellDbPath !== BROWSER_SHELL_DB ? shellDbPath : null;

    const overlay = (found: VaultTask[]) => {
      const nodes = useVaultStore.getState().nodes;
      const replaced = new Set<string>();
      const extra: VaultTask[] = [];
      for (const id in nodes) {
        const node = nodes[id];
        if (node?.kind !== "note" || typeof node.content !== "string") continue;
        if (extra.length > 200) break;
        replaced.add(id);
        extra.push(
          ...tasksInNote({
            id,
            path: node.path,
            title: noteTitle(node),
            body: node.content,
          }),
        );
      }
      return [...found.filter((task) => !replaced.has(task.noteId)), ...extra];
    };

    const finish = (found: VaultTask[]) => {
      if (cancel) return;
      const next = overlay(found).slice(0, TASK_CAP);
      next.sort((a, b) => a.path.localeCompare(b.path) || a.line - b.line);
      setTasks(next);
      setPhase("ready");
    };

    if (db) {
      const found: VaultTask[] = [];
      const step = (after: number, seen: number) => {
        if (cancel) return;
        void fetchTaskPage(db, after).then((page) => {
          if (cancel) return;
          if (!page) {
            scanMemory(finish, () => cancel, setScanned);
            return;
          }
          found.push(...page.tasks);
          const total = seen + page.scanned;
          setScanned(total);
          setTasks(overlay(found).slice(0, TASK_CAP));
          if (!page.done && found.length < TASK_CAP) step(page.nextRowid, total);
          else finish(found);
        });
      };
      step(0, 0);
    } else {
      scanMemory(finish, () => cancel, setScanned);
    }
    return () => {
      cancel = true;
    };
  }, [vaultId, shellDbPath, shellCatalog, refresh]);

  const today = localToday();
  const visible = useMemo(() => {
    const note = activeNoteId ? useVaultStore.getState().nodes[activeNoteId] : null;
    const notePath = note?.kind === "note" ? note.path : "";
    return tasks.filter((task) => {
      if (scope === "note" && task.noteId !== activeNoteId && task.path !== notePath) return false;
      if (scope === "due-today" && taskDueBucket(task.due, today) !== "today") return false;
      if (scope === "overdue" && taskDueBucket(task.due, today) !== "overdue") return false;
      if (scope === "high" && !taskIsHigh(task.priority)) return false;
      return taskMatchesPath(task, pathPrefix);
    });
  }, [tasks, scope, pathPrefix, activeNoteId, today]);

  const openTask = (task: VaultTask) => {
    const store = useVaultStore.getState();
    const split = Boolean(store.settings.workspaceSplit && store.secondaryNoteId);
    const pane = split ? getFindFocusPane() : "primary";
    store.setActiveNote(task.noteId, { pane });
    window.setTimeout(() => jumpToTaskText(task.text, pane), 80);
  };

  const complete = (task: VaultTask) => {
    const store = useVaultStore.getState();
    const node = store.nodes[task.noteId];
    const write = (body: string) => {
      const next = completeTaskLine(body, task.line);
      if (next == null) {
        setRefresh((n) => n + 1);
        return;
      }
      store.updateNoteContent(task.noteId, next, { source: true });
      setTasks((cur) => cur.filter((row) => !(row.noteId === task.noteId && row.line === task.line)));
    };
    if (node?.kind === "note" && typeof node.content === "string") {
      write(node.content);
      return;
    }
    void store.ensureNoteBody(task.noteId).then((body) => {
      if (typeof body === "string") write(body);
    });
  };

  return (
    <div className="flex flex-col gap-2 p-3" data-testid="tasks-rail">
      <p className="text-[11.5px] leading-snug text-[var(--text-muted)]">
        Unchecked <span className="font-mono">- [ ]</span> and <span className="font-mono">* [ ]</span> lines.
        A <span className="font-mono">📅 YYYY-MM-DD</span> on the line is the due date and wins.
        Otherwise the note <span className="font-mono">due:</span> YAML applies.
        Due today and Overdue keep incomplete tasks due on this local day, or before it.
        <span className="font-mono">⏫</span> and <span className="font-mono">❗</span> are high priority.
        High keeps those incomplete tasks.
        Recurrence and Dataview queries are not supported.
      </p>
      <div className="flex flex-wrap items-center gap-1">
        <button
          type="button"
          data-testid="tasks-filter-all"
          aria-pressed={scope === "all"}
          className={cn("chip-btn", scope === "all" && "is-active")}
          onClick={() => setScope("all")}
        >
          Incomplete
        </button>
        <button
          type="button"
          data-testid="tasks-filter-note"
          aria-pressed={scope === "note"}
          className={cn("chip-btn", scope === "note" && "is-active")}
          onClick={() => setScope("note")}
        >
          This note
        </button>
        <button
          type="button"
          data-testid="tasks-filter-due-today"
          aria-pressed={scope === "due-today"}
          className={cn("chip-btn", scope === "due-today" && "is-active")}
          onClick={() => setScope("due-today")}
        >
          Due today
        </button>
        <button
          type="button"
          data-testid="tasks-filter-overdue"
          aria-pressed={scope === "overdue"}
          className={cn("chip-btn", scope === "overdue" && "is-active")}
          onClick={() => setScope("overdue")}
        >
          Overdue
        </button>
        <button
          type="button"
          data-testid="tasks-filter-high"
          aria-pressed={scope === "high"}
          className={cn("chip-btn", scope === "high" && "is-active")}
          onClick={() => setScope("high")}
        >
          High
        </button>
        <input
          value={pathPrefix}
          onChange={(e) => setPathPrefix(e.target.value)}
          placeholder="path prefix"
          aria-label="Task path prefix"
          data-testid="tasks-path-prefix"
          className="min-w-0 flex-1 rounded-md border border-[var(--border)] bg-transparent px-2 py-1 text-[12px] text-[var(--text-primary)]"
        />
      </div>
      {phase === "scanning" ? (
        <p className="text-[12px] text-[var(--text-secondary)]" role="status" data-testid="tasks-scanning">
          Reading tasks… {scanned.toLocaleString()} notes
          {indexState === "ready-meta" ? " · bodies still indexing" : ""}
        </p>
      ) : (
        <p className="text-[12px] text-[var(--text-muted)]" role="status">
          {visible.length} incomplete
          {tasks.length >= TASK_CAP ? ` · stopped at ${TASK_CAP}` : ""}
        </p>
      )}
      {phase === "ready" && visible.length === 0 ? (
        <p className="px-1 py-4 text-[13px] text-[var(--text-muted)]">No incomplete tasks in this view.</p>
      ) : (
        <ul className="flex flex-col gap-1">
          {visible.map((task) => (
            <li key={`${task.noteId}:${task.line}:${task.text}`}>
              <div className="flex items-start gap-1.5 rounded-[10px] px-1 py-1 hover:bg-white/[0.04]">
                <button
                  type="button"
                  className="mt-0.5 h-4 w-4 shrink-0 rounded border border-[var(--border)]"
                  aria-label={`Mark done: ${task.text}`}
                  data-testid="tasks-complete"
                  onClick={() => complete(task)}
                />
                <button
                  type="button"
                  className="min-w-0 flex-1 text-left"
                  data-testid="tasks-row"
                  onClick={() => openTask(task)}
                >
                  <div className="text-[13px] text-[var(--text-primary)]">
                    {task.priority ? (
                      <span data-testid="tasks-priority">{priorityMarker(task.priority)} </span>
                    ) : null}
                    {task.text}
                  </div>
                  <div className="truncate text-[11px] text-[var(--text-muted)]">
                    {liveTitle(task.noteId, task.path, task.title)}
                    <span className="opacity-70"> · {task.path}</span>
                    {task.due ? <span className="text-[var(--accent)]"> · {task.due}</span> : null}
                  </div>
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
      <p className="flex items-center gap-1 text-[10.5px] text-[var(--text-muted)]">
        <ListChecks size={12} />
        Built-in Tasks. Not a Dataview query.
      </p>
    </div>
  );
}

function scanMemory(
  finish: (tasks: VaultTask[]) => void,
  stop: () => boolean,
  onProgress: (n: number) => void,
) {
  const nodes = useVaultStore.getState().nodes;
  const ids: string[] = [];
  for (const id in nodes) {
    if (nodes[id]?.kind === "note") ids.push(id);
  }
  const found: VaultTask[] = [];
  let index = 0;
  const step = () => {
    if (stop()) return;
    const slice = ids.slice(index, index + CHUNK);
    index += CHUNK;
    for (const id of slice) {
      const node = nodes[id];
      if (node?.kind !== "note" || typeof node.content !== "string") continue;
      found.push(
        ...tasksInNote({
          id,
          path: node.path,
          title: noteTitle(node),
          body: node.content,
        }),
      );
      if (found.length >= TASK_CAP) break;
    }
    onProgress(Math.min(index, ids.length));
    if (index < ids.length && found.length < TASK_CAP) {
      window.setTimeout(step, 0);
    } else {
      finish(found);
    }
  };
  step();
}
