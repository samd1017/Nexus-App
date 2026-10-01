export type SwitcherNote = { id: string; title: string; path: string };

/** Higher is a closer title or path match. Zero means no match. */
export function scoreSwitcherNote(note: SwitcherNote, query: string): number {
  const q = query.trim().toLowerCase();
  if (!q) return 0;
  const title = note.title.toLowerCase();
  const path = note.path.toLowerCase();
  if (title === q || path === q) return 1000;
  if (title.startsWith(q)) return 800;
  if (title.includes(q)) return 600;
  if (path.includes(q)) return 400;
  if (fuzzy(title, q)) return 200;
  if (fuzzy(path, q)) return 100;
  return 0;
}

function fuzzy(hay: string, needle: string): boolean {
  let i = 0;
  for (const ch of hay) {
    if (ch === needle[i]) i += 1;
    if (i === needle.length) return true;
  }
  return false;
}

export function rankSwitcherNotes(notes: SwitcherNote[], query: string, limit = 30): SwitcherNote[] {
  const q = query.trim();
  if (!q) return [];
  return notes
    .map((note) => ({ note, score: scoreSwitcherNote(note, q) }))
    .filter((row) => row.score > 0)
    .sort((a, b) => b.score - a.score || a.note.title.localeCompare(b.note.title) || a.note.path.localeCompare(b.note.path))
    .slice(0, limit)
    .map((row) => row.note);
}

/** Recent ids, in visit order, that still exist. */
export function recentSwitcherNotes(
  notes: SwitcherNote[],
  recentIds: readonly string[],
  limit = 12,
): SwitcherNote[] {
  const byId = new Map(notes.map((note) => [note.id, note]));
  const out: SwitcherNote[] = [];
  for (const id of recentIds) {
    const note = byId.get(id);
    if (!note) continue;
    out.push(note);
    if (out.length >= limit) break;
  }
  return out;
}
