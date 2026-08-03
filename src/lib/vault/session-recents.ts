/**
 * Session command recents for the command palette.
 * Kept in a module array for in-session speed; also mirrored to sessionStorage
 * so a soft reload keeps the last few command ids (optional polish).
 */

const MAX = 8;
const STORAGE_KEY = "nexus-cmd-recents-v1";

function loadPersisted(): string[] {
  if (typeof sessionStorage === "undefined") return [];
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((x): x is string => typeof x === "string" && x.length > 0)
      .slice(0, MAX);
  } catch {
    return [];
  }
}

function persist(list: string[]): void {
  if (typeof sessionStorage === "undefined") return;
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(list.slice(0, MAX)));
  } catch {
    /* private mode / quota */
  }
}

/** Recently run command action ids (newest first). */
export const recentCommandIds: string[] = loadPersisted();

/** Recently visited note ids (newest first) — session-only fallback. */
export const recentVisitIds: string[] = [];

function pushFront(list: string[], id: string): void {
  const i = list.indexOf(id);
  if (i >= 0) list.splice(i, 1);
  list.unshift(id);
  while (list.length > MAX) list.pop();
}

export function trackCommand(id: string): void {
  if (!id) return;
  pushFront(recentCommandIds, id);
  persist(recentCommandIds);
}

export function trackVisit(id: string): void {
  if (!id) return;
  pushFront(recentVisitIds, id);
}

/** Pending query applied the next time the palette opens (e.g. tag chip). */
let pendingCommandQuery: string | null = null;

export function setPendingCommandQuery(query: string | null): void {
  pendingCommandQuery = query;
}

export function takePendingCommandQuery(): string | null {
  const q = pendingCommandQuery;
  pendingCommandQuery = null;
  return q;
}
