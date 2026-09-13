/**
 * Per-note revision snapshots — recovery beyond soft trash.
 * In-memory for every mode; disk vaults also write `.nexus/history/`.
 */

export type NoteRevision = {
  id: string;
  noteId: string;
  path: string;
  at: number;
  content: string;
};

const MAX_PER_NOTE = 30;
const revisions = new Map<string, NoteRevision[]>();
let seq = 0;

function makeId(at: number): string {
  seq += 1;
  return `rev_${at.toString(36)}_${seq}`;
}

export function recordNoteRevision(
  noteId: string,
  path: string,
  content: string,
): NoteRevision | null {
  if (!noteId || typeof content !== "string") return null;
  const list = revisions.get(noteId) ?? [];
  const last = list[0];
  if (last && last.content === content) return null;
  const at = Date.now();
  const rev: NoteRevision = {
    id: makeId(at),
    noteId,
    path,
    at,
    content,
  };
  revisions.set(noteId, [rev, ...list].slice(0, MAX_PER_NOTE));
  return rev;
}

export function listNoteRevisions(noteId: string): NoteRevision[] {
  return [...(revisions.get(noteId) ?? [])];
}

export function getNoteRevision(
  noteId: string,
  revId: string,
): NoteRevision | null {
  return (revisions.get(noteId) ?? []).find((r) => r.id === revId) ?? null;
}

export function clearNoteHistory(noteId?: string): void {
  if (noteId) revisions.delete(noteId);
  else revisions.clear();
}

export function historyRelPath(notePath: string, at: number): string {
  const safe = (notePath || "note.md")
    .replace(/\\/g, "/")
    .replace(/^\//, "")
    .replace(/[^A-Za-z0-9._/-]+/g, "_")
    .replace(/\//g, "__");
  return `.nexus/history/${safe}/${at}.md`;
}
