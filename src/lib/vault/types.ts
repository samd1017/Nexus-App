/** Core vault domain types — plain-folder knowledge vault (Hermes-compatible). */

export type VaultNodeKind = "folder" | "note";

export interface VaultNode {
  id: string;
  /** Path relative to vault root, POSIX-style. Notes end with .md */
  path: string;
  name: string;
  kind: VaultNodeKind;
  parentId: string | null;
  /** ISO mtime for UI; updated on write/watch */
  mtime: number;
  /** Only for notes — full markdown body on disk */
  content?: string;
}

export interface RecentVault {
  id: string;
  name: string;
  /** Display path / label */
  path: string;
  lastOpened: number;
  /** "demo" | "local" | "fsa" | "desktop" */
  mode: VaultMode;
}

export type VaultMode = "demo" | "local" | "fsa" | "desktop";

export type EditorMode = "visual" | "source";

export type GraphMode = "panel" | "fullscreen" | "hidden";

export interface VaultSettings {
  leftOpen: boolean;
  rightOpen: boolean;
  leftWidth: number;
  rightWidth: number;
  editorMode: EditorMode;
  graphMode: GraphMode;
  lastNotePath: string | null;
}

export interface VaultStateSnapshot {
  vaultId: string;
  vaultName: string;
  vaultPath: string;
  mode: VaultMode;
  nodes: Record<string, VaultNode>;
  rootIds: string[];
  activeNoteId: string | null;
  settings: VaultSettings;
  expandedFolders: string[];
  lastExternalSync: number | null;
  dirtyNoteIds: string[];
}

export interface SearchHit {
  noteId: string;
  path: string;
  title: string;
  snippet: string;
  score: number;
  matchType: "title" | "content";
}

export interface Backlink {
  fromId: string;
  fromPath: string;
  fromTitle: string;
  context: string;
}

export interface GraphNode {
  id: string;
  title: string;
  path: string;
  degree: number;
  preview: string;
  /** Parent folder path ("" = vault root) — used for soft spatial clustering */
  folder: string;
}

export interface GraphEdge {
  source: string;
  target: string;
}

export interface OutlineHeading {
  id: string;
  level: number;
  text: string;
  pos: number;
}

export const DEFAULT_SETTINGS: VaultSettings = {
  leftOpen: true,
  rightOpen: true,
  leftWidth: 260,
  rightWidth: 340,
  editorMode: "visual",
  graphMode: "panel",
  lastNotePath: null,
};

export function noteTitle(node: VaultNode): string {
  if (node.kind !== "note") return node.name;
  return node.name.replace(/\.md$/i, "");
}

export function pathJoin(...parts: string[]): string {
  return parts
    .filter(Boolean)
    .join("/")
    .replace(/\/+/g, "/")
    .replace(/^\//, "");
}

export function parentPath(path: string): string {
  const i = path.lastIndexOf("/");
  return i <= 0 ? "" : path.slice(0, i);
}

export function basename(path: string): string {
  const i = path.lastIndexOf("/");
  return i < 0 ? path : path.slice(i + 1);
}
