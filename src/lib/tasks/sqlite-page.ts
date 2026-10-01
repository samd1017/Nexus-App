import type { VaultTask } from "./extract";

export type TaskPage = {
  tasks: VaultTask[];
  nextRowid: number;
  scanned: number;
  done: boolean;
};

/** One indexed page. Null when this runtime has no desktop index. */
export async function fetchTaskPage(
  dbPath: string,
  afterRowid: number,
): Promise<TaskPage | null> {
  if (!dbPath) return null;
  try {
    const { invoke } = await import("@tauri-apps/api/core");
    const page = await invoke<{
      tasks: Array<{
        noteId: string;
        path: string;
        title: string;
        line: number;
        text: string;
        due: string | null;
      }>;
      nextRowid: number;
      scanned: number;
      done: boolean;
    }>("vault_index_task_page", {
      dbPath,
      afterRowid,
      noteBudget: 48,
    });
    return {
      tasks: page.tasks.map((task) => ({
        noteId: task.noteId,
        path: task.path,
        title: task.title,
        line: task.line,
        text: task.text,
        due: task.due,
      })),
      nextRowid: page.nextRowid,
      scanned: page.scanned,
      done: page.done,
    };
  } catch {
    return null;
  }
}
