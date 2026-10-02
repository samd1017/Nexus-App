/**
 * Incomplete Markdown tasks. A 📅 YYYY-MM-DD on the line is the due date.
 * When the line has no emoji date, the note YAML `due:` (YYYY-MM-DD) applies.
 * Not supported: recurrence, priorities, and Dataview queries.
 */

import { parseFrontmatterFields, splitFrontmatter } from "@/lib/editor/frontmatter";

export type VaultTask = {
  noteId: string;
  path: string;
  title: string;
  /** 1-based line in the note. */
  line: number;
  text: string;
  due: string | null;
};

const TASK_RE = /^(\s*)([-*])\s+\[ \]\s+(\S.*)$/;
const DUE_RE = /📅\s*(\d{4}-\d{2}-\d{2})/;
const PER_NOTE_CAP = 40;

export function dueOnTaskLine(text: string): string | null {
  const match = DUE_RE.exec(text);
  return match ? match[1] : null;
}

/** `due:` YAML value, or null when it is missing or not a calendar date. */
export function dueFromFrontmatter(body: string): string | null {
  const { yaml } = splitFrontmatter(body);
  if (!yaml) return null;
  let found: string | null = null;
  for (const field of parseFrontmatterFields(yaml)) {
    if (field.key.toLowerCase() !== "due") continue;
    found = normalizeDueValue(field.value);
  }
  return found;
}

function normalizeDueValue(value: string): string | null {
  let v = value.trim();
  if (
    (v.startsWith('"') && v.endsWith('"') && v.length >= 2) ||
    (v.startsWith("'") && v.endsWith("'") && v.length >= 2)
  ) {
    v = v.slice(1, -1).trim();
  }
  return /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null;
}

export function taskDisplayText(text: string): string {
  return text.replace(DUE_RE, "").replace(/\s+/g, " ").trim();
}

export function tasksInNote(note: {
  id: string;
  path: string;
  title: string;
  body: string;
}): VaultTask[] {
  const out: VaultTask[] = [];
  const noteDue = dueFromFrontmatter(note.body);
  const lines = note.body.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const match = TASK_RE.exec(lines[i]);
    if (!match) continue;
    const raw = match[3].trim();
    if (!raw) continue;
    out.push({
      noteId: note.id,
      path: note.path,
      title: note.title,
      line: i + 1,
      text: taskDisplayText(raw),
      due: dueOnTaskLine(raw) ?? noteDue,
    });
    if (out.length >= PER_NOTE_CAP) break;
  }
  return out;
}

/** Flip one incomplete task to `[x]`. Returns null when that line is not an open task. */
export function completeTaskLine(markdown: string, line: number): string | null {
  if (!Number.isFinite(line) || line < 1) return null;
  const parts = markdown.split(/\r?\n/);
  const index = line - 1;
  const current = parts[index];
  if (current == null || !TASK_RE.test(current)) return null;
  parts[index] = current.replace("[ ]", "[x]");
  const nl = markdown.includes("\r\n") ? "\r\n" : "\n";
  return parts.join(nl);
}

export function taskMatchesPath(task: VaultTask, prefix: string): boolean {
  const want = prefix.trim().replace(/\\/g, "/").replace(/^\/+/, "").toLowerCase();
  if (!want) return true;
  return task.path.toLowerCase().startsWith(want);
}
