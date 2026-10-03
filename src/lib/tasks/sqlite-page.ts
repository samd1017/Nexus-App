import { tasksFromLines, type VaultTask } from "./extract";

export type TaskPage = {
  tasks: VaultTask[];
  nextRowid: number;
  scanned: number;
  done: boolean;
};

type TaskHit = {
  noteId: string;
  path: string;
  title: string;
  line: number;
  raw?: string;
  text: string;
  noteDue?: string | null;
  heading?: string | null;
};

/** Notes read per desktop index call. */
export const TASK_PAGE_NOTES = 400;

/** One indexed page. Null when this runtime has no desktop index. */
export async function fetchTaskPage(dbPath: string, afterRowid: number, today: string): Promise<TaskPage | null> {
  if (!dbPath) return null;
  try {
    const { invoke } = await import("@tauri-apps/api/core");
    const page = await invoke<{ tasks: TaskHit[]; nextRowid: number; scanned: number; done: boolean }>("vault_index_task_page", {
      dbPath,
      afterRowid,
      noteBudget: TASK_PAGE_NOTES,
    });
    return { tasks: tasksFromHits(page.tasks, today), nextRowid: page.nextRowid, scanned: page.scanned, done: page.done };
  } catch {
    return null;
  }
}

/** Index hits come grouped by note, in line order. An older index without `raw` reads as an open task. */
export function tasksFromHits(hits: TaskHit[], today: string): VaultTask[] {
  const out: VaultTask[] = [];
  let i = 0;
  while (i < hits.length) {
    const first = hits[i] as TaskHit;
    const entries: { line: number; raw: string; heading: string | null }[] = [];
    let j = i;
    while (j < hits.length && (hits[j] as TaskHit).noteId === first.noteId) {
      const hit = hits[j] as TaskHit;
      entries.push({ line: hit.line, raw: hit.raw ?? `- [ ] ${hit.text}`, heading: hit.heading ?? null });
      j += 1;
    }
    out.push(...tasksFromLines({ id: first.noteId, path: first.path, title: first.title }, entries, first.noteDue ?? null, today));
    i = j;
  }
  return out;
}
