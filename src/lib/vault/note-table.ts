import { parseFrontmatterFields, splitFrontmatter } from "@/lib/editor/frontmatter";
import { isCanvasPath } from "@/lib/vault/canvas";

export type NoteTableSource = {
  id: string;
  path: string;
  name: string;
  content?: string | null;
};

export type NoteTableRow = {
  id: string;
  name: string;
  path: string;
  folder: string;
  props: Record<string, string>;
};

const MAX_ROWS = 400;
const MAX_KEYS = 6;

export function noteTableTitle(name: string): string {
  return name.replace(/\.canvas$/i, "").replace(/\.md$/i, "").trim() || name;
}

export function noteTableFolder(path: string): string {
  const i = path.lastIndexOf("/");
  return i <= 0 ? "" : path.slice(0, i);
}

export function noteTableProperties(content: string | null | undefined): Record<string, string> {
  if (!content) return {};
  const { yaml } = splitFrontmatter(content);
  if (!yaml) return {};
  const props: Record<string, string> = {};
  for (const field of parseFrontmatterFields(yaml)) {
    const value = field.value.replace(/^['"]|['"]$/g, "").trim();
    if (!value) continue;
    props[field.key] = value;
  }
  return props;
}

export function buildNoteTable(
  notes: NoteTableSource[],
  folderPrefix = "",
): { rows: NoteTableRow[]; keys: string[]; truncated: boolean } {
  const prefix = folderPrefix.trim().replace(/\\/g, "/").replace(/^\/+|\/+$/g, "");
  const counts = new Map<string, number>();
  const rows: NoteTableRow[] = [];
  let truncated = false;
  for (const note of notes) {
    if (!note.path || isCanvasPath(note.path)) continue;
    if (prefix && note.path !== prefix && !note.path.startsWith(`${prefix}/`)) continue;
    if (rows.length >= MAX_ROWS) {
      truncated = true;
      break;
    }
    const props = noteTableProperties(note.content);
    for (const key of Object.keys(props)) counts.set(key, (counts.get(key) || 0) + 1);
    rows.push({
      id: note.id,
      name: noteTableTitle(note.name || note.path.split("/").pop() || note.path),
      path: note.path,
      folder: noteTableFolder(note.path),
      props,
    });
  }
  const keys = [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, MAX_KEYS)
    .map(([key]) => key);
  return { rows, keys, truncated };
}

export function filterNoteRows(rows: NoteTableRow[], query: string): NoteTableRow[] {
  const q = query.trim().toLowerCase();
  if (!q) return rows;
  return rows.filter((row) => {
    if (row.name.toLowerCase().includes(q)) return true;
    if (row.path.toLowerCase().includes(q)) return true;
    if (row.folder.toLowerCase().includes(q)) return true;
    for (const value of Object.values(row.props)) {
      if (value.toLowerCase().includes(q)) return true;
    }
    return false;
  });
}

export function sortNoteRows(
  rows: NoteTableRow[],
  column: string,
  dir: "asc" | "desc",
): NoteTableRow[] {
  const sign = dir === "asc" ? 1 : -1;
  const value = (row: NoteTableRow) => {
    if (column === "name") return row.name;
    if (column === "folder") return row.folder;
    if (column === "path") return row.path;
    return row.props[column] || "";
  };
  return [...rows].sort((a, b) => {
    const av = value(a);
    const bv = value(b);
    if (!av && bv) return 1;
    if (av && !bv) return -1;
    return av.localeCompare(bv, undefined, { numeric: true, sensitivity: "base" }) * sign;
  });
}
