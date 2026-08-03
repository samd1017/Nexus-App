/**
 * Recent note visit history (Wave S4 extract).
 * Used by sidebar "Recent" and reserved for Wave H2/F consumers.
 * Vault open-recents stay in store localStorage keys (nexus-recent-v1).
 */

const VISIT_KEY = "nexus-visits-v1";
const MAX_VISITS = 40;

export type NoteVisit = {
  vaultId: string;
  noteId: string;
  path: string;
  at: number;
};

export function loadVisits(): NoteVisit[] {
  try {
    const raw = localStorage.getItem(VISIT_KEY);
    if (!raw) return [];
    const list = JSON.parse(raw) as NoteVisit[];
    if (!Array.isArray(list)) return [];
    return list.filter(
      (v) =>
        v &&
        typeof v.vaultId === "string" &&
        typeof v.noteId === "string" &&
        typeof v.path === "string" &&
        typeof v.at === "number",
    );
  } catch {
    return [];
  }
}

export function saveVisits(list: NoteVisit[]): void {
  try {
    localStorage.setItem(VISIT_KEY, JSON.stringify(list.slice(0, MAX_VISITS)));
  } catch {
    /* ignore quota */
  }
}

/** Record a note open; returns updated full visit list. */
export function recordNoteVisit(
  vaultId: string,
  noteId: string,
  path: string,
): NoteVisit[] {
  if (!vaultId || !noteId) return loadVisits();
  const list = loadVisits().filter(
    (v) => !(v.vaultId === vaultId && (v.noteId === noteId || v.path === path)),
  );
  list.unshift({ vaultId, noteId, path, at: Date.now() });
  const next = list.slice(0, MAX_VISITS);
  saveVisits(next);
  return next;
}

/** Most recent visits for one vault, newest first. */
export function recentVisitsForVault(
  vaultId: string | null | undefined,
  limit = 5,
): NoteVisit[] {
  if (!vaultId) return [];
  return loadVisits()
    .filter((v) => v.vaultId === vaultId)
    .slice(0, limit);
}
