import { useState, type ReactNode } from "react";
import * as Popover from "@radix-ui/react-popover";
import { AlertTriangle, Ban, Check, CircleDot, MoreHorizontal, Repeat } from "lucide-react";
import { editTask, openTaskInNote } from "@/lib/tasks/actions";
import { friendlyDay, localToday } from "@/lib/tasks/dates";
import { fixTaskProblem, setTaskDate, setTaskPriority, setTaskStatus, toggleTask } from "@/lib/tasks/edit";
import { dayFromToday, priorityMarker, type VaultTask } from "@/lib/tasks/extract";
import { isOpen, type TaskPriority, type TaskProblem } from "@/lib/tasks/syntax";
import { cn } from "@/lib/utils";

const PRIORITY_CHOICES: { id: TaskPriority; label: string }[] = [
  { id: "highest", label: "Highest" },
  { id: "high", label: "High" },
  { id: "medium", label: "Medium" },
  { id: "none", label: "None" },
  { id: "low", label: "Low" },
  { id: "lowest", label: "Lowest" },
];

function TaskText({ text, muted }: { text: string; muted: boolean }) {
  const parts: ReactNode[] = [];
  const re = /(^|\s)(#[\p{L}\p{N}_/-]*[\p{L}_/-][\p{L}\p{N}_/-]*)/gu;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const at = m.index + (m[1] ?? "").length;
    if (at > last) parts.push(text.slice(last, at));
    parts.push(
      <span key={at} className="text-[var(--accent)] opacity-80">
        {m[2]}
      </span>,
    );
    last = at + (m[2] ?? "").length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return (
    <span className={cn("break-words", muted && "text-[var(--text-muted)] line-through decoration-[var(--text-muted)]/60")}>
      {parts.length ? parts : text}
    </span>
  );
}

function Checkbox({ task, onToggle }: { task: VaultTask; onToggle: () => void }) {
  const done = task.status === "done";
  const cancelled = task.status === "cancelled";
  const doing = task.status === "doing";
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={done ? true : doing ? "mixed" : false}
      aria-label={isOpen(task.status) ? `Mark done: ${task.text}` : `Mark not done: ${task.text}`}
      title={isOpen(task.status) ? (task.recurring ? "Done — the next one is added" : "Mark done") : "Mark not done"}
      data-testid="tasks-complete"
      onClick={onToggle}
      className={cn(
        "mt-[3px] flex h-4 w-4 shrink-0 items-center justify-center rounded-[5px] border transition-colors",
        done && "border-[var(--accent)] bg-[var(--accent)] text-[var(--bg-base,#000)]",
        cancelled && "border-[var(--border)] text-[var(--text-muted)]",
        doing && "border-[var(--accent)] text-[var(--accent)]",
        !done && !cancelled && !doing && "border-[var(--border-strong,var(--border))] hover:border-[var(--accent)]",
      )}
    >
      {done ? <Check size={11} strokeWidth={3} /> : cancelled ? <Ban size={10} /> : doing ? <CircleDot size={10} /> : null}
    </button>
  );
}

function DueChip({ task, today }: { task: VaultTask; today: string }) {
  if (!task.due) return null;
  const open = isOpen(task.status);
  const late = open && task.due < today;
  const now = open && task.due === today;
  return (
    <span
      data-testid="task-due"
      title={task.dueFromNote ? `Due ${task.due}, from the note's due: property` : `Due ${task.due}`}
      className={cn(
        "rounded px-1",
        late && "bg-[var(--danger-dim)] text-[var(--danger)]",
        now && "bg-[var(--warning-dim)] text-[var(--warning)]",
        !late && !now && "text-[var(--text-secondary)]",
      )}
    >
      📅 {friendlyDay(task.due, today)}
      {task.dueFromNote ? " · note" : ""}
    </span>
  );
}

function ProblemLine({ task, problem }: { task: VaultTask; problem: TaskProblem }) {
  return (
    <div className="mt-0.5 flex items-start gap-1 text-[11px] text-[var(--warning)]" data-testid="task-problem">
      <AlertTriangle size={11} className="mt-[2px] shrink-0" />
      <span className="min-w-0 flex-1">{problem.message}</span>
      {problem.fix !== null ? (
        <button
          type="button"
          data-testid="task-fix"
          className="shrink-0 rounded px-1.5 py-px text-[10.5px] font-medium text-[var(--accent)] hover:bg-white/[0.06]"
          onClick={() => void editTask(task, (md, ref) => fixTaskProblem(md, ref, problem))}
        >
          {problem.fixLabel || "Fix"}
        </button>
      ) : null}
    </div>
  );
}

function MenuButton({ children, onClick, testId, active }: { children: ReactNode; onClick: () => void; testId?: string; active?: boolean }) {
  return (
    <button
      type="button"
      data-testid={testId}
      onClick={onClick}
      className={cn(
        "rounded-[7px] px-2 py-1 text-left text-[12px] text-[var(--text-primary)] hover:bg-white/[0.07]",
        active && "bg-white/[0.07] text-[var(--accent)]",
      )}
    >
      {children}
    </button>
  );
}

const MENU_CLASS =
  "z-[80] flex w-[230px] flex-col rounded-[12px] border border-[var(--border)] bg-[var(--bg-elevated)] p-1.5 shadow-[var(--shadow-elevated)] backdrop-blur-xl";

function TaskMenuItems({ task, today, close }: { task: VaultTask; today: string; close: () => void }) {
  const [picked, setPicked] = useState(task.due ?? "");
  const run = (edit: Parameters<typeof editTask>[1]) => {
    close();
    void editTask(task, edit);
  };
  const due = (ymd: string | null) => run((md, ref) => setTaskDate(md, ref, "due", ymd));
  const label = "px-2 pb-0.5 pt-1.5 text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--text-muted)]";
  return (
    <>
      <div className={label}>Due</div>
      <div className="grid grid-cols-3 gap-0.5">
        <MenuButton testId="task-due-today" onClick={() => due(today)}>Today</MenuButton>
        <MenuButton testId="task-due-tomorrow" onClick={() => due(dayFromToday(today, 1))}>Tomorrow</MenuButton>
        <MenuButton testId="task-due-week" onClick={() => due(dayFromToday(today, 7))}>+1 week</MenuButton>
      </div>
      <div className="flex items-center gap-1 px-1 py-1">
        <input
          type="date"
          aria-label="Due date"
          data-testid="task-due-pick"
          value={picked}
          onChange={(e) => setPicked(e.target.value)}
          className="min-w-0 flex-1 rounded-md border border-[var(--border)] bg-transparent px-1.5 py-0.5 text-[12px] text-[var(--text-primary)]"
        />
        <button
          type="button"
          disabled={!picked || picked === task.due}
          onClick={() => due(picked)}
          className="chip-btn"
        >
          Set
        </button>
        {task.due && !task.dueFromNote ? (
          <button type="button" className="chip-btn" data-testid="task-due-clear" onClick={() => due(null)}>
            Clear
          </button>
        ) : null}
      </div>
      <div className={label}>Priority</div>
      <div className="grid grid-cols-3 gap-0.5">
        {PRIORITY_CHOICES.map((choice) => (
          <MenuButton
            key={choice.id}
            testId={`task-priority-${choice.id}`}
            active={task.priority === choice.id}
            onClick={() => run((md, ref) => setTaskPriority(md, ref, choice.id))}
          >
            {priorityMarker(choice.id)} {choice.label}
          </MenuButton>
        ))}
      </div>
      <div className={label}>Status</div>
      <div className="flex flex-col">
        {task.status !== "doing" && isOpen(task.status) ? (
          <MenuButton testId="task-start" onClick={() => run((md, ref, day) => setTaskStatus(md, ref, "doing", day))}>
            Mark in progress <span className="font-mono text-[var(--text-muted)]">[/]</span>
          </MenuButton>
        ) : null}
        {task.status === "doing" ? (
          <MenuButton testId="task-stop" onClick={() => run((md, ref, day) => setTaskStatus(md, ref, "todo", day))}>
            Back to to-do <span className="font-mono text-[var(--text-muted)]">[ ]</span>
          </MenuButton>
        ) : null}
        {task.status !== "cancelled" ? (
          <MenuButton testId="task-cancel" onClick={() => run((md, ref, day) => setTaskStatus(md, ref, "cancelled", day))}>
            Cancel <span className="font-mono text-[var(--text-muted)]">[-] ❌</span>
          </MenuButton>
        ) : (
          <MenuButton testId="task-reopen" onClick={() => run((md, ref, day) => setTaskStatus(md, ref, "todo", day))}>
            Reopen
          </MenuButton>
        )}
        <MenuButton
          testId="task-open-note"
          onClick={() => {
            close();
            openTaskInNote(task);
          }}
        >
          Open in note
        </MenuButton>
      </div>
    </>
  );
}

function TaskMenu({
  task,
  today,
  open,
  setOpen,
}: {
  task: VaultTask;
  today: string;
  open: boolean;
  setOpen: (open: boolean) => void;
}) {
  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        <button
          type="button"
          aria-label={`Task actions: ${task.text}`}
          data-testid="task-menu"
          className="mt-px shrink-0 rounded-md p-0.5 text-[var(--text-muted)] opacity-40 transition-opacity hover:bg-white/[0.07] hover:text-[var(--text-primary)] focus-visible:opacity-100 group-hover:opacity-100 data-[state=open]:opacity-100"
        >
          <MoreHorizontal size={14} />
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          side="bottom"
          align="end"
          sideOffset={4}
          // Inside a note the editor takes focus back after a right-click; a click outside still closes the menu.
          onFocusOutside={(e) => e.preventDefault()}
          className={MENU_CLASS}
        >
          <TaskMenuItems task={task} today={today} close={() => setOpen(false)} />
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

/** The task menu opened where the pointer is, for task lines that are not React rows (Reading view). */
export function TaskMenuAt({
  task,
  x,
  y,
  onClose,
}: {
  task: VaultTask;
  x: number;
  y: number;
  onClose: () => void;
}) {
  return (
    <Popover.Root open onOpenChange={(open) => (open ? undefined : onClose())}>
      <Popover.Anchor asChild>
        <span aria-hidden style={{ position: "fixed", left: x, top: y, width: 0, height: 0 }} />
      </Popover.Anchor>
      <Popover.Portal>
        <Popover.Content
          side="bottom"
          align="start"
          sideOffset={2}
          aria-label={`Task actions: ${task.text}`}
          data-testid="task-menu-at"
          className={MENU_CLASS}
        >
          <TaskMenuItems task={task} today={localToday()} close={onClose} />
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

export function TaskRow({
  task,
  today,
  showNote = true,
  indent = false,
}: {
  task: VaultTask;
  today: string;
  /** Show which note the task lives in. */
  showNote?: boolean;
  /** Indent subtasks by their depth (a single note's list). */
  indent?: boolean;
}) {
  const open = isOpen(task.status);
  const [menuOpen, setMenuOpen] = useState(false);
  const toggle = () => void editTask(task, toggleTask);
  return (
    <div
      className="group flex items-start gap-2 rounded-[10px] px-1.5 py-1 hover:bg-white/[0.04]"
      style={indent && task.depth ? { paddingLeft: 6 + task.depth * 16 } : undefined}
      data-testid="task-item"
      data-status={task.status}
      onContextMenu={(e) => {
        e.preventDefault();
        setMenuOpen(true);
      }}
    >
      <Checkbox task={task} onToggle={toggle} />
      <div className="min-w-0 flex-1">
        <button
          type="button"
          className="block w-full text-left text-[13px] leading-snug text-[var(--text-primary)]"
          data-testid="tasks-row"
          title="Open in note"
          onClick={() => openTaskInNote(task)}
        >
          {task.priority !== "none" ? (
            <span data-testid="tasks-priority" className="mr-1" title={`${task.priority} priority`}>
              {priorityMarker(task.priority)}
            </span>
          ) : null}
          <TaskText text={task.text || "(empty task)"} muted={!open} />
        </button>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[11px] text-[var(--text-muted)]">
          <DueChip task={task} today={today} />
          {task.scheduled ? <span title={`Scheduled ${task.scheduled}`}>⏳ {friendlyDay(task.scheduled, today)}</span> : null}
          {task.start && task.start > today ? <span title={`Starts ${task.start}`}>🛫 {friendlyDay(task.start, today)}</span> : null}
          {task.recurrence ? (
            <span data-testid="tasks-recurrence" className="inline-flex items-center gap-0.5" title={`Repeats ${task.recurrence}`}>
              <Repeat size={10} /> {task.recurrence}
            </span>
          ) : null}
          {task.status === "done" && task.done ? <span>✅ {friendlyDay(task.done, today)}</span> : null}
          {task.status === "cancelled" && task.cancelled ? <span>❌ {friendlyDay(task.cancelled, today)}</span> : null}
          {showNote ? (
            <span className="min-w-0 truncate" title={task.path}>
              {task.title}
            </span>
          ) : null}
        </div>
        {task.problems.map((problem, i) => (
          <ProblemLine key={i} task={task} problem={problem} />
        ))}
      </div>
      <TaskMenu task={task} today={today} open={menuOpen} setOpen={setMenuOpen} />
    </div>
  );
}
