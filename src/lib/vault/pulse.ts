/**
 * Wave 3 — Pulse activity stream.
 * Module-level ring buffer of recent vault events for the right-rail Pulse tab.
 */

import { useSyncExternalStore } from "react";

export type PulseKind =
  | "create"
  | "update"
  | "delete"
  | "external"
  | "conflict"
  | "hermes";

export type PulseEvent = {
  id: string;
  at: number;
  kind: PulseKind;
  path: string;
  title?: string;
  message: string;
  /** Vault that produced the event — used to filter when switching vaults */
  vaultId?: string | null;
  /** Inbox read state (Wave C) */
  read?: boolean;
};

const MAX_EVENTS = 50;

let events: PulseEvent[] = [];
let version = 0;
const listeners = new Set<() => void>();
let seq = 0;

function notify() {
  version += 1;
  for (const cb of listeners) {
    try {
      cb();
    } catch {
      /* ignore subscriber errors */
    }
  }
}

function makeId(): string {
  seq += 1;
  return `pulse_${Date.now().toString(36)}_${seq}`;
}

/** Push a pulse event (newest first). Partial events get id/at filled. */
export function pushPulse(
  event: Omit<PulseEvent, "id" | "at"> & { id?: string; at?: number },
): PulseEvent {
  const full: PulseEvent = {
    id: event.id ?? makeId(),
    at: event.at ?? Date.now(),
    kind: event.kind,
    path: event.path,
    title: event.title,
    message: event.message,
    vaultId: event.vaultId ?? null,
    read: event.read ?? false,
  };
  events = [full, ...events].slice(0, MAX_EVENTS);
  notify();
  return full;
}

/** Clear the entire pulse buffer (e.g. on vault close). */
export function clearPulse(): void {
  if (events.length === 0) return;
  events = [];
  notify();
}

/** Mark a single event as read. */
export function markPulseRead(id: string): void {
  let changed = false;
  events = events.map((e) => {
    if (e.id !== id || e.read) return e;
    changed = true;
    return { ...e, read: true };
  });
  if (changed) notify();
}

/** Mark all events (optionally vault-scoped) as read. */
export function markAllPulseRead(vaultId?: string | null): void {
  let changed = false;
  events = events.map((e) => {
    if (e.read) return e;
    if (
      vaultId != null &&
      e.vaultId != null &&
      e.vaultId !== vaultId
    ) {
      return e;
    }
    changed = true;
    return { ...e, read: true };
  });
  if (changed) notify();
}

/** Whether an event belongs to the given vault (null vaultId = show all). */
export function pulseEventMatchesVault(
  ev: PulseEvent,
  vaultId: string | null | undefined,
): boolean {
  if (vaultId == null) return true;
  if (ev.vaultId == null) return true; // legacy / unscoped
  return ev.vaultId === vaultId;
}

const INBOX_KINDS: ReadonlySet<PulseKind> = new Set([
  "external",
  "hermes",
  "conflict",
  "delete",
]);

/** Unread inbox-style events for a vault (for rail badges). */
export function getUnreadPulseCount(
  vaultId?: string | null,
): number {
  return events.filter(
    (e) =>
      !e.read &&
      pulseEventMatchesVault(e, vaultId) &&
      INBOX_KINDS.has(e.kind),
  ).length;
}

export function getPulseEvents(): readonly PulseEvent[] {
  return events;
}

export function subscribePulse(cb: () => void): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

/** Snapshot for useSyncExternalStore — version bumps force re-render. */
export function getPulseVersion(): number {
  return version;
}

export function getPulseState(): {
  events: readonly PulseEvent[];
  version: number;
} {
  return { events, version };
}

/** React hook — re-renders when pulse buffer changes. */
export function usePulseEvents(): readonly PulseEvent[] {
  useSyncExternalStore(subscribePulse, getPulseVersion, getPulseVersion);
  return getPulseEvents();
}
