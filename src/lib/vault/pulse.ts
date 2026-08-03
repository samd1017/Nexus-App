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
  };
  events = [full, ...events].slice(0, MAX_EVENTS);
  notify();
  return full;
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
