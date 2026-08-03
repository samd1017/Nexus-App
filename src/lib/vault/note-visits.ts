/**
 * Visit-based Recent notes — MRU note opens, persisted in localStorage.
 */

export const NOTE_VISITS_KEY = "nexus-note-visits-v1";
export const MAX_NOTE_VISITS = 12;

export function loadNoteVisits(): string[] {
  if (typeof localStorage === "undefined") return [];
  try {
    const raw = localStorage.getItem(NOTE_VISITS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((x): x is string => typeof x === "string" && x.length > 0)
      .slice(0, MAX_NOTE_VISITS);
  } catch {
    return [];
  }
}

export function pushNoteVisit(id: string, prev: string[] = loadNoteVisits()): string[] {
  const next = [id, ...prev.filter((x) => x !== id)].slice(0, MAX_NOTE_VISITS);
  if (typeof localStorage !== "undefined") {
    try {
      localStorage.setItem(NOTE_VISITS_KEY, JSON.stringify(next));
    } catch {
      /* quota / private mode */
    }
  }
  return next;
}
