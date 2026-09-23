/**
 * Desktop shell catalog.
 *
 * The renderer holds a window of notes, not the vault. SQLite answers
 * "children of this folder", "this map level", and "this note". Small vaults
 * (under the full-graph threshold) still materialize every note.
 */

import type { VaultNode } from "./types";
import { deskNodeId } from "./desk-node-id";

/** Must match Rust `SHELL_FULL_MAX_NOTES`. */
export const SHELL_FULL_MAX_NOTES = 399;
/** Must match Rust `SHELL_CHILD_PAGE`. */
export const SHELL_CHILD_PAGE = 200;
export const SHELL_ROOT_KEY = "__root__";

export type ShellRow = {
  id: string;
  path: string;
  name: string;
  kind: string;
  parentId?: string | null;
  mtime: number;
  childNotes?: number;
};

export type ShellLoaded = {
  parentId: string;
  loaded: number;
  hidden: number;
};

export type ShellMount = {
  materialize: boolean;
  pending: boolean;
  notes: number;
  folders: number;
  rows: ShellRow[];
  rootIds: string[];
  activeNoteId?: string | null;
  omittedNotes: number;
  loaded: ShellLoaded[];
  dbPath: string;
};

export type ShellPage = {
  parentPath: string;
  rows: ShellRow[];
  noteTotal: number;
  folderTotal: number;
  offset: number;
  limit: number;
};

export type ShellLevel = {
  parentPath: string;
  rows: ShellRow[];
  noteTotal: number;
  folderTotal: number;
  omitted: number;
};

export type ShellEdge = { source: string; target: string };

export type ShellEgo = {
  centerId: string;
  rows: ShellRow[];
  edges: ShellEdge[];
  capped: boolean;
};

export type ShellSession = {
  shellCatalog: boolean;
  catalogNoteCount: number;
  catalogFolderCount: number;
  shellDbPath: string | null;
  shellUnloaded: Record<string, number>;
  shellLoaded: Record<string, number>;
};

type Invoke = <T>(cmd: string, args?: Record<string, unknown>) => Promise<T>;

async function getInvoke(): Promise<Invoke | null> {
  try {
    const { invoke } = await import("@tauri-apps/api/core");
    return invoke as Invoke;
  } catch {
    return null;
  }
}

function num(v: unknown, fallback = 0): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function asRow(raw: Record<string, unknown>): ShellRow {
  return {
    id: String(raw.id ?? ""),
    path: String(raw.path ?? "").replace(/\\/g, "/"),
    name: String(raw.name ?? ""),
    kind: raw.kind === "folder" ? "folder" : "note",
    parentId: (raw.parentId ?? raw.parent_id ?? null) as string | null,
    mtime: num(raw.mtime),
    childNotes: num(raw.childNotes ?? raw.child_notes),
  };
}

export function shellRowToNode(row: ShellRow): VaultNode {
  return {
    id: row.id,
    path: row.path,
    name: row.name,
    kind: row.kind === "folder" ? "folder" : "note",
    parentId: row.parentId ?? null,
    mtime: row.mtime || Date.now(),
  };
}

/** The node map the renderer is allowed to keep from a mount payload. */
export function nodesFromShellRows(rows: ShellRow[]): {
  nodes: Record<string, VaultNode>;
  rootIds: string[];
} {
  const nodes: Record<string, VaultNode> = {};
  const rootIds: string[] = [];
  for (const row of rows) {
    if (!row.id) continue;
    const node = shellRowToNode(row);
    nodes[node.id] = node;
    if (!node.parentId) rootIds.push(node.id);
  }
  rootIds.sort((a, b) => {
    const na = nodes[a];
    const nb = nodes[b];
    if (!na || !nb) return 0;
    if (na.kind !== nb.kind) return na.kind === "folder" ? -1 : 1;
    return na.name.localeCompare(nb.name, undefined, { numeric: true, sensitivity: "base" });
  });
  return { nodes, rootIds };
}

export function mergeShellRows(
  nodes: Record<string, VaultNode>,
  rootIds: string[],
  rows: ShellRow[],
): { nodes: Record<string, VaultNode>; rootIds: string[] } {
  if (!rows.length) return { nodes, rootIds };
  const next = { ...nodes };
  const roots = new Set(rootIds);
  for (const row of rows) {
    if (!row.id) continue;
    const prev = next[row.id];
    const node = shellRowToNode(row);
    if (prev?.content !== undefined) node.content = prev.content;
    if (prev && prev.mtime > node.mtime) node.mtime = prev.mtime;
    next[row.id] = node;
    if (!node.parentId) roots.add(node.id);
  }
  return { nodes: next, rootIds: [...roots] };
}

export function loadedMaps(entries: ShellLoaded[]): {
  shellLoaded: Record<string, number>;
  shellUnloaded: Record<string, number>;
} {
  const shellLoaded: Record<string, number> = {};
  const shellUnloaded: Record<string, number> = {};
  for (const entry of entries) {
    if (!entry.parentId) continue;
    shellLoaded[entry.parentId] = entry.loaded;
    if (entry.hidden > 0) shellUnloaded[entry.parentId] = entry.hidden;
  }
  return { shellLoaded, shellUnloaded };
}

export const SHELL_CATALOG_OFF: ShellSession = {
  shellCatalog: false,
  catalogNoteCount: 0,
  catalogFolderCount: 0,
  shellDbPath: null,
  shellUnloaded: {},
  shellLoaded: {},
};

/**
 * Large desktop vaults stay a window. Small vaults keep every note so the
 * full graph still draws. `materialize` is the native decision.
 */
export function shellSessionFromMount(
  mount: ShellMount | null,
  scanNoteCount: number,
): ShellSession {
  if (!mount || mount.materialize) {
    return {
      ...SHELL_CATALOG_OFF,
      catalogNoteCount: mount?.notes || scanNoteCount,
      catalogFolderCount: mount?.folders || 0,
    };
  }
  const maps = loadedMaps(mount.loaded ?? []);
  return {
    shellCatalog: true,
    catalogNoteCount: mount.notes,
    catalogFolderCount: mount.folders,
    shellDbPath: mount.dbPath || null,
    shellUnloaded: maps.shellUnloaded,
    shellLoaded: maps.shellLoaded,
  };
}

function normalizeMount(raw: Record<string, unknown>): ShellMount {
  const rows = Array.isArray(raw.rows) ? raw.rows.map((r) => asRow(r as Record<string, unknown>)) : [];
  const loadedRaw = Array.isArray(raw.loaded) ? raw.loaded : [];
  const loaded: ShellLoaded[] = loadedRaw.map((entry) => {
    const e = entry as Record<string, unknown>;
    return {
      parentId: String(e.parentId ?? e.parent_id ?? ""),
      loaded: num(e.loaded),
      hidden: num(e.hidden),
    };
  });
  const rootIds = Array.isArray(raw.rootIds)
    ? raw.rootIds.map(String)
    : Array.isArray(raw.root_ids)
      ? (raw.root_ids as unknown[]).map(String)
      : [];
  return {
    materialize: Boolean(raw.materialize),
    pending: Boolean(raw.pending),
    notes: num(raw.notes),
    folders: num(raw.folders),
    rows,
    rootIds,
    activeNoteId: (raw.activeNoteId ?? raw.active_note_id ?? null) as string | null,
    omittedNotes: num(raw.omittedNotes ?? raw.omitted_notes),
    loaded,
    dbPath: String(raw.dbPath ?? raw.db_path ?? ""),
  };
}

export async function mountShellCatalog(
  vaultRoot: string,
  preferPath?: string | null,
): Promise<ShellMount | null> {
  const invoke = await getInvoke();
  if (!invoke) return null;
  try {
    const raw = await invoke<Record<string, unknown>>("vault_shell_mount", {
      vaultRoot,
      preferPath: preferPath || null,
    });
    if (!raw || typeof raw !== "object") return null;
    const mount = normalizeMount(raw);
    if (!mount.dbPath) return null;
    return mount;
  } catch {
    return null;
  }
}

export async function fetchShellChildren(
  dbPath: string,
  parentPath: string,
  offset: number,
  limit = SHELL_CHILD_PAGE,
): Promise<ShellPage | null> {
  const invoke = await getInvoke();
  if (!invoke || !dbPath) return null;
  try {
    const raw = await invoke<Record<string, unknown>>("vault_shell_children", {
      dbPath,
      parentPath,
      limit,
      offset,
    });
    return {
      parentPath: String(raw.parentPath ?? raw.parent_path ?? parentPath),
      rows: Array.isArray(raw.rows) ? raw.rows.map((r) => asRow(r as Record<string, unknown>)) : [],
      noteTotal: num(raw.noteTotal ?? raw.note_total),
      folderTotal: num(raw.folderTotal ?? raw.folder_total),
      offset: num(raw.offset, offset),
      limit: num(raw.limit, limit),
    };
  } catch (err) {
    if (String(err).includes("shell_busy")) return null;
    return null;
  }
}

export async function fetchShellLevel(
  dbPath: string,
  parentPath: string,
  maxNodes = 320,
): Promise<ShellLevel | null> {
  const invoke = await getInvoke();
  if (!invoke || !dbPath) return null;
  try {
    const raw = await invoke<Record<string, unknown>>("vault_shell_level", {
      dbPath,
      parentPath,
      maxNodes,
    });
    return {
      parentPath: String(raw.parentPath ?? raw.parent_path ?? parentPath),
      rows: Array.isArray(raw.rows) ? raw.rows.map((r) => asRow(r as Record<string, unknown>)) : [],
      noteTotal: num(raw.noteTotal ?? raw.note_total),
      folderTotal: num(raw.folderTotal ?? raw.folder_total),
      omitted: num(raw.omitted),
    };
  } catch {
    return null;
  }
}

export async function fetchShellEgo(
  dbPath: string,
  centerId: string,
  hops = 2,
  maxNodes = 400,
): Promise<ShellEgo | null> {
  const invoke = await getInvoke();
  if (!invoke || !dbPath || !centerId) return null;
  try {
    const raw = await invoke<Record<string, unknown>>("vault_shell_ego", {
      dbPath,
      centerId,
      hops,
      maxNodes,
    });
    const edgesRaw = Array.isArray(raw.edges) ? raw.edges : [];
    return {
      centerId: String(raw.centerId ?? raw.center_id ?? centerId),
      rows: Array.isArray(raw.rows) ? raw.rows.map((r) => asRow(r as Record<string, unknown>)) : [],
      edges: edgesRaw.map((e) => {
        const edge = e as Record<string, unknown>;
        return { source: String(edge.source ?? ""), target: String(edge.target ?? "") };
      }),
      capped: Boolean(raw.capped),
    };
  } catch {
    return null;
  }
}

export async function fetchShellNote(dbPath: string, id: string): Promise<ShellRow | null> {
  const invoke = await getInvoke();
  if (!invoke || !dbPath || !id) return null;
  try {
    const raw = await invoke<Record<string, unknown> | null>("vault_shell_note", { dbPath, id });
    if (!raw || typeof raw !== "object") return null;
    const row = asRow(raw);
    return row.id ? row : null;
  } catch {
    return null;
  }
}

export function shellParentPath(
  nodes: Record<string, VaultNode>,
  parentId: string,
): string | null {
  if (parentId === SHELL_ROOT_KEY) return "";
  const node = nodes[parentId];
  if (!node || node.kind !== "folder") return null;
  return node.path;
}

/** Parent key for a changed relative path — used to refresh one tree page. */
export function shellParentKeyForPath(relPath: string): string {
  const path = relPath.replace(/\\/g, "/").replace(/^\/+/, "");
  const slash = path.lastIndexOf("/");
  if (slash <= 0) return SHELL_ROOT_KEY;
  return deskNodeId(path.slice(0, slash));
}

export function pageHidden(page: ShellPage, loadedAfter: number): number {
  const total = page.folderTotal + page.noteTotal;
  return Math.max(0, total - loadedAfter);
}
