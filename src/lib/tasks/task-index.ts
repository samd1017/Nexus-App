/**
 * One live list of every task in the vault, shared by the Tasks rail and TASK
 * query blocks. The first read comes from the desktop search index when there
 * is one (a page of note bodies per call, so a 100k-note vault never blocks the
 * window), else from note bodies in memory. After that, only notes whose text
 * changed are read again, so an edit shows up without a rescan.
 */

import { useEffect, useSyncExternalStore } from "react";
import { useVaultStore } from "@/lib/vault/store";
import { vaultIndex } from "@/lib/vault/indexes";
import { subscribeBodyGen } from "@/lib/vault/content";
import { getBodyFromArchive } from "@/lib/vault/body-archive";
import { BROWSER_SHELL_DB } from "@/lib/vault/shell-catalog";
import { noteTitle, type VaultNode } from "@/lib/vault/types";
import { localToday } from "./dates";
import { tasksInNote, type VaultTask } from "./extract";
import { fetchTaskPage } from "./sqlite-page";

export type TaskIndexState = {
  phase: "idle" | "scanning" | "ready";
  /** Notes read so far in this scan. */
  scanned: number;
  /** Notes whose text is not in memory yet. Their tasks appear once they are read. */
  unread: number;
  source: "index" | "memory";
  /** How long the last full read took. */
  ms: number;
};

export type TaskIndexSnapshot = { tasks: VaultTask[]; state: TaskIndexState; gen: number };

/** Notes read from disk on their own; past this the rail offers a button. */
export const AUTO_READ_LIMIT = 1500;
const READ_BATCH = 24;
const SYNC_DELAY_MS = 120;
const CHUNK = 1500;

const byNote = new Map<string, VaultTask[]>();
/** The exact text each note's tasks were read from. */
const readFrom = new Map<string, string>();
const listeners = new Set<() => void>();
let snapshot: TaskIndexSnapshot = {
  tasks: [],
  state: { phase: "idle", scanned: 0, unread: 0, source: "memory", ms: 0 },
  gen: 0,
};
let started = false;
let vaultKey = "";
let scanToken = 0;
let syncTimer: ReturnType<typeof setTimeout> | null = null;
let publishTimer: ReturnType<typeof setTimeout> | null = null;
let lastGen = -1;
let unreadIds: string[] = [];
let reading = false;

export function isTaskNote(node: VaultNode | undefined): node is VaultNode {
  return !!node && node.kind === "note" && /\.(md|markdown)$/i.test(node.path);
}

function publish(state: Partial<TaskIndexState> = {}): void {
  const tasks: VaultTask[] = [];
  for (const list of byNote.values()) for (const task of list) tasks.push(task);
  snapshot = { tasks, state: { ...snapshot.state, ...state }, gen: snapshot.gen + 1 };
  for (const listener of listeners) listener();
}

function publishSoon(state: Partial<TaskIndexState>): void {
  snapshot = { ...snapshot, state: { ...snapshot.state, ...state } };
  if (publishTimer) return;
  publishTimer = setTimeout(() => {
    publishTimer = null;
    publish();
  }, 60);
}

function keyOf(): string {
  const s = useVaultStore.getState();
  return `${s.vaultId ?? ""}|${s.shellDbPath ?? ""}|${s.shellCatalog ? 1 : 0}`;
}

function shellMode(): boolean {
  const s = useVaultStore.getState();
  return Boolean(s.shellCatalog && s.shellDbPath && s.shellDbPath !== BROWSER_SHELL_DB);
}

function bodyOf(node: VaultNode): string | null {
  if (typeof node.content === "string") return node.content;
  const archived = getBodyFromArchive(node.path);
  return typeof archived === "string" ? archived : null;
}

/** Read one note's text into the list. */
function readNote(node: VaultNode, body: string, today: string): void {
  readFrom.set(node.id, body);
  const tasks = tasksInNote({ id: node.id, path: node.path, title: noteTitle(node), body }, today);
  if (tasks.length) byNote.set(node.id, tasks);
  else byNote.delete(node.id);
}

/** Re-read notes whose loaded text changed; follow renames; drop deleted notes. */
function syncFromNodes(): boolean {
  const nodes = useVaultStore.getState().nodes;
  const today = localToday();
  let changed = false;
  for (const id in nodes) {
    const node = nodes[id];
    if (!isTaskNote(node)) continue;
    const body = typeof node.content === "string" ? node.content : null;
    if (body !== null && readFrom.get(id) !== body) {
      readNote(node, body, today);
      changed = true;
      continue;
    }
    const list = byNote.get(id);
    if (list?.length && (list[0] as VaultTask).path !== node.path) {
      const title = noteTitle(node);
      byNote.set(id, list.map((task) => ({ ...task, path: node.path, title })));
      changed = true;
    }
  }
  if (!shellMode()) {
    for (const id of [...byNote.keys()]) {
      if (!isTaskNote(nodes[id])) {
        byNote.delete(id);
        readFrom.delete(id);
        changed = true;
      }
    }
  }
  return changed;
}

function scheduleSync(): void {
  if (syncTimer) return;
  syncTimer = setTimeout(() => {
    syncTimer = null;
    if (snapshot.state.phase === "scanning") return;
    if (syncFromNodes()) publish();
  }, SYNC_DELAY_MS);
}

async function fullScan(): Promise<void> {
  const token = ++scanToken;
  const began = performance.now();
  byNote.clear();
  readFrom.clear();
  unreadIds = [];
  publish({ phase: "scanning", scanned: 0, unread: 0 });
  const store = useVaultStore.getState();
  const today = localToday();
  const db = store.shellDbPath && store.shellDbPath !== BROWSER_SHELL_DB ? store.shellDbPath : null;
  let source: TaskIndexState["source"] = "memory";
  let scanned = 0;
  if (db) {
    let after = 0;
    for (;;) {
      const page = await fetchTaskPage(db, after, today);
      if (token !== scanToken) return;
      if (!page) break;
      source = "index";
      for (const task of page.tasks) {
        const list = byNote.get(task.noteId);
        if (list) list.push(task);
        else byNote.set(task.noteId, [task]);
      }
      scanned += page.scanned;
      publishSoon({ scanned, source });
      if (page.done) break;
      after = page.nextRowid;
    }
  }
  if (source === "memory") {
    const nodes = useVaultStore.getState().nodes;
    const ids = Object.keys(nodes);
    for (let i = 0; i < ids.length; i += 1) {
      const node = nodes[ids[i] as string];
      if (!isTaskNote(node)) continue;
      const body = bodyOf(node);
      if (body === null) unreadIds.push(node.id);
      else readNote(node, body, today);
      scanned += 1;
      if (i % CHUNK === CHUNK - 1) {
        publishSoon({ scanned });
        await new Promise((resolve) => setTimeout(resolve, 0));
        if (token !== scanToken) return;
      }
    }
  }
  syncFromNodes();
  lastGen = vaultIndex.generation();
  publish({ phase: "ready", scanned, source, unread: unreadIds.length, ms: Math.round(performance.now() - began) });
  if (unreadIds.length && unreadIds.length <= AUTO_READ_LIMIT) void readUnread();
}

/** Load notes whose text was not in memory, a batch at a time, so their tasks join the list. */
export async function readUnread(limit = Number.POSITIVE_INFINITY): Promise<void> {
  if (reading) return;
  reading = true;
  const token = scanToken;
  try {
    const store = useVaultStore.getState();
    let done = 0;
    while (unreadIds.length && done < limit) {
      const batch = unreadIds.splice(0, READ_BATCH);
      const bodies = await Promise.all(batch.map((id) => store.ensureNoteBody(id).catch(() => null)));
      if (token !== scanToken) return;
      const nodes = useVaultStore.getState().nodes;
      const today = localToday();
      batch.forEach((id, i) => {
        const node = nodes[id];
        const body = bodies[i];
        if (isTaskNote(node) && typeof body === "string") readNote(node, body, today);
      });
      done += batch.length;
      publishSoon({ unread: unreadIds.length });
    }
  } finally {
    reading = false;
    publish({ unread: unreadIds.length });
  }
}

function start(): void {
  if (started) return;
  started = true;
  vaultKey = keyOf();
  void fullScan();
  useVaultStore.subscribe(() => {
    const key = keyOf();
    if (key !== vaultKey) {
      vaultKey = key;
      void fullScan();
      return;
    }
    const gen = vaultIndex.generation();
    if (gen !== lastGen) {
      lastGen = gen;
      scheduleSync();
    }
  });
  subscribeBodyGen(scheduleSync);
  if (typeof window !== "undefined") {
    let lastFocusScan = Date.now();
    window.addEventListener("focus", () => {
      if (!shellMode() || Date.now() - lastFocusScan < 120_000) return;
      lastFocusScan = Date.now();
      void fullScan();
    });
  }
}

/** Read the vault again from the start. */
export function rescanTasks(): void {
  if (!started) start();
  else void fullScan();
}

/** Put one note's new text into the list right away (after a write from a task view). */
export function taskNoteChanged(noteId: string, body: string): void {
  const node = useVaultStore.getState().nodes[noteId];
  if (!isTaskNote(node)) return;
  readNote({ ...node, content: body } as VaultNode, body, localToday());
  publish();
}

/** Drop a note the list still had but the vault no longer does. */
export function taskNoteGone(noteId: string): void {
  if (byNote.delete(noteId)) publish();
  readFrom.delete(noteId);
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot(): TaskIndexSnapshot {
  return snapshot;
}

/** Listen for list changes outside React. */
export const subscribeTasks = subscribe;

/** The list as it is right now, for code outside React. */
export function currentTasks(): TaskIndexSnapshot {
  return snapshot;
}

/** Start the list if needed and wait for the first full read, or `ms`, whichever comes first. */
export function whenTasksReady(ms = 4000): Promise<TaskIndexSnapshot> {
  start();
  if (snapshot.state.phase === "ready") return Promise.resolve(snapshot);
  return new Promise((resolve) => {
    const finish = () => {
      clearTimeout(timer);
      listeners.delete(check);
      resolve(snapshot);
    };
    const check = () => {
      if (snapshot.state.phase === "ready") finish();
    };
    const timer = setTimeout(finish, ms);
    listeners.add(check);
  });
}

const EMPTY: TaskIndexSnapshot = snapshot;

/** Every task in the vault, live. `enabled: false` reads nothing and starts nothing. */
export function useTaskIndex(enabled = true): TaskIndexSnapshot {
  useEffect(() => {
    if (enabled) start();
  }, [enabled]);
  const live = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  return enabled ? live : EMPTY;
}
