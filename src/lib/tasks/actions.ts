/**
 * Task edits from a list (the Tasks rail or a TASK query block) write the
 * note itself: read its text, change the one line, save through the same
 * path as typing. The list then re-reads that note on the spot.
 */

import { useVaultStore } from "@/lib/vault/store";
import { getFindFocusPane } from "@/lib/editor/find-target";
import { BROWSER_SHELL_DB, fetchShellNote } from "@/lib/vault/shell-catalog";
import { dailyNotePath } from "@/lib/vault/templates";
import { localToday } from "./dates";
import { composeTaskLine, insertTaskLine, type TaskEdit, type TaskRef } from "./edit";
import type { VaultTask } from "./extract";
import { jumpToTaskText } from "./jump";
import { rescanTasks, taskNoteChanged, taskNoteGone } from "./task-index";

export type TaskActionResult = { ok: true; noteId: string; line: number } | { ok: false; reason: string };

/** A note's text, loading it first when only its name is in memory. */
export async function loadNoteBody(noteId: string): Promise<string | null> {
  const store = useVaultStore.getState();
  let node = store.nodes[noteId];
  const db = store.shellDbPath;
  if (!node && store.shellCatalog && db && db !== BROWSER_SHELL_DB) {
    const row = await fetchShellNote(db, noteId).catch(() => null);
    if (row && useVaultStore.getState().shellDbPath === db) useVaultStore.getState().ingestShellRows([row]);
    node = useVaultStore.getState().nodes[noteId];
  }
  if (node?.kind !== "note") return null;
  if (typeof node.content === "string") return node.content;
  return useVaultStore.getState().ensureNoteBody(noteId);
}

function say(message: string): void {
  useVaultStore.getState().setToast(message);
}

/** Run one line edit against a task's note and save it. */
export async function editTask(
  task: Pick<VaultTask, "noteId" | "line" | "raw" | "title">,
  edit: (markdown: string, ref: TaskRef, today: string) => TaskEdit,
): Promise<TaskActionResult> {
  const body = await loadNoteBody(task.noteId);
  if (body === null) {
    taskNoteGone(task.noteId);
    const reason = `Could not open “${task.title}”. It may have been moved or deleted.`;
    say(reason);
    return { ok: false, reason };
  }
  const result = edit(body, { line: task.line, raw: task.raw }, localToday());
  if (!result.ok) {
    taskNoteChanged(task.noteId, body);
    say(result.reason);
    return result;
  }
  if (result.markdown !== body) {
    useVaultStore.getState().updateNoteContent(task.noteId, result.markdown, { source: true });
    taskNoteChanged(task.noteId, result.markdown);
  }
  return { ok: true, noteId: task.noteId, line: result.line };
}

/** Where quick add puts a new task. */
export type AddTarget = { kind: "daily" } | { kind: "note"; noteId: string };

async function dailyNoteId(): Promise<string | null> {
  const store = useVaultStore.getState();
  const path = dailyNotePath(new Date());
  for (const id in store.nodes) {
    const node = store.nodes[id];
    if (node?.kind === "note" && node.path === path) return id;
  }
  const created = await store.openDailyNoteForDate(new Date(), { silent: true });
  return typeof created === "string" ? created : null;
}

/** Turn a quick-add sentence into a task line and add it to the target note. */
export async function addTask(input: string, target: AddTarget): Promise<TaskActionResult> {
  if (!input.trim()) return { ok: false, reason: "Type what needs doing first." };
  const noteId = target.kind === "daily" ? await dailyNoteId() : target.noteId;
  if (!noteId) {
    const reason = "Could not open today's daily note.";
    say(reason);
    return { ok: false, reason };
  }
  const body = await loadNoteBody(noteId);
  if (body === null) {
    const reason = "Could not read that note to add the task.";
    say(reason);
    return { ok: false, reason };
  }
  const composed = composeTaskLine(input, localToday());
  const placed = insertTaskLine(body, composed.line);
  useVaultStore.getState().updateNoteContent(noteId, placed.markdown, { source: true });
  taskNoteChanged(noteId, placed.markdown);
  return { ok: true, noteId, line: placed.line };
}

/** Open the task's note in the pane in use and scroll to the task. */
export function openTaskInNote(task: Pick<VaultTask, "noteId" | "text">): void {
  const store = useVaultStore.getState();
  const split = Boolean(store.settings.workspaceSplit && store.secondaryNoteId);
  const pane = split ? getFindFocusPane() : "primary";
  store.setActiveNote(task.noteId, { pane });
  window.setTimeout(() => jumpToTaskText(task.text, pane), 120);
}

export { rescanTasks };
