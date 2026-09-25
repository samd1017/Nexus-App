/**
 * Desktop shell catalog.
 *
 * The renderer holds a window of notes, not the vault. SQLite answers
 * "children of this folder", "this map level", and "this note". Small vaults
 * (under the full-graph threshold) still materialize every note.
 */

import { noteTitle, type VaultNode } from "./types";
import { deskNodeId } from "./desk-node-id";

/** Must match Rust `SHELL_FULL_MAX_NOTES`. */
export const SHELL_FULL_MAX_NOTES = 399;
/** Must match Rust `SHELL_CHILD_PAGE`. */
export const SHELL_CHILD_PAGE = 200;
export const SHELL_ROOT_KEY = "__root__";
/** Local-web catalog. Not a SQLite file. */
export const BROWSER_SHELL_DB = "browser";

export type BrowserShellApi = {
  children: (parentPath: string, offset: number, limit: number) => Promise<ShellPage>;
  level: (parentPath: string, maxNodes: number) => Promise<ShellLevel>;
  ego: (centerId: string, hops: number, maxNodes: number) => Promise<ShellEgo>;
  note: (id: string) => Promise<ShellRow | null>;
  backlinks: (id: string, limit: number) => Promise<ShellBacklinkPage>;
  tags: (limit: number) => Promise<ShellTagCount[]>;
  tagNotes: (tag: string, limit: number) => Promise<ShellRow[]>;
  suggest: (query: string, limit: number) => Promise<ShellSuggestHit[]>;
  /** Token hits from the granted folder, not the renderer window. */
  search: (query: string, limit: number) => Promise<ShellSuggestHit[]>;
  recent: (limit: number) => Promise<ShellRow[]>;
  forget: (paths: string[]) => Promise<ShellForget>;
};

let browserShellApi: BrowserShellApi | null = null;

export function registerBrowserShell(api: BrowserShellApi | null): void {
  browserShellApi = api;
}

function browserApi(dbPath: string): BrowserShellApi | null {
  if (dbPath !== BROWSER_SHELL_DB) return null;
  return browserShellApi;
}

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
  /** Saved page is already searchable. Ready does not wait on the index file. */
  titlesLive?: boolean;
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

/**
 * Attempts inside one invoke, after the native command has already retried.
 * Native budget is 3×40ms plus two short sleeps (156ms). Two invokes stay
 * under half a second, then the UI keeps the last page.
 */
export const SHELL_BUSY_TRIES = 2;
/** Must match `shell_busy_budget_ms` in the native catalog. */
export const SHELL_NATIVE_BUSY_BUDGET_MS = 156;

export function shellBusyBudgetMs(): number {
  let total = 0;
  for (let attempt = 0; attempt < SHELL_BUSY_TRIES; attempt++) {
    total += SHELL_NATIVE_BUSY_BUDGET_MS;
    if (attempt + 1 < SHELL_BUSY_TRIES) total += shellBusyDelayMs(attempt);
  }
  return total;
}

const shellWakes = new Set<() => void>();

/** Run once the catalog has had a chance to commit another fill batch. */
export function onShellCatalogWake(fn: () => void): () => void {
  shellWakes.add(fn);
  return () => {
    shellWakes.delete(fn);
  };
}

export function wakeShellCatalog(): void {
  for (const fn of [...shellWakes]) fn();
}

export function isShellBusyMessage(err: unknown): boolean {
  const msg = String(err).toLowerCase();
  return msg.includes("shell_busy") || msg.includes("database is locked") || msg.includes("sqlite_busy");
}

export function shellBusyDelayMs(attempt: number): number {
  return 16 * (attempt + 1);
}

function commandMissing(err: unknown): boolean {
  const msg = String(err).toLowerCase();
  return msg.includes("not found") || msg.includes("unknown command");
}

async function yieldMs(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

type ShellCall<T> = { ok: true; value: T } | { ok: false; reason: "missing" | "busy" | "error" };

/** Yield between attempts so a fill batch can commit and the page still returns. */
async function callShell<T>(cmd: string, args: Record<string, unknown>): Promise<ShellCall<T>> {
  const invoke = await getInvoke();
  if (!invoke) return { ok: false, reason: "missing" };
  for (let attempt = 0; attempt < SHELL_BUSY_TRIES; attempt++) {
    try {
      return { ok: true, value: await invoke<T>(cmd, args) };
    } catch (err) {
      if (isShellBusyMessage(err)) {
        if (attempt + 1 < SHELL_BUSY_TRIES) {
          await yieldMs(shellBusyDelayMs(attempt));
          continue;
        }
        return { ok: false, reason: "busy" };
      }
      if (commandMissing(err)) return { ok: false, reason: "missing" };
      return { ok: false, reason: "error" };
    }
  }
  return { ok: false, reason: "busy" };
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

/**
 * Remove ids (and loaded descendants) from an already-open window.
 * The walk is the window, not the vault.
 */
export function dropShellIds(
  nodes: Record<string, VaultNode>,
  rootIds: string[],
  ids: string[],
): { nodes: Record<string, VaultNode>; rootIds: string[]; dropped: string[] } {
  if (!ids.length) return { nodes, rootIds, dropped: [] };
  const drop = new Set(ids.filter(Boolean));
  let grew = true;
  while (grew) {
    grew = false;
    for (const node of Object.values(nodes)) {
      if (drop.has(node.id)) continue;
      if (node.parentId && drop.has(node.parentId)) {
        drop.add(node.id);
        grew = true;
      }
    }
  }
  if (drop.size === 0) return { nodes, rootIds, dropped: [] };
  const next: Record<string, VaultNode> = {};
  for (const [id, node] of Object.entries(nodes)) {
    if (!drop.has(id)) next[id] = node;
  }
  return {
    nodes: next,
    rootIds: rootIds.filter((id) => !drop.has(id)),
    dropped: [...drop],
  };
}

export function mergeShellRows(
  nodes: Record<string, VaultNode>,
  rootIds: string[],
  rows: ShellRow[],
): { nodes: Record<string, VaultNode>; rootIds: string[] } {
  if (!rows.length) return { nodes, rootIds };
  const next = { ...nodes };
  const roots = new Set(rootIds);
  let changed = false;
  for (const row of rows) {
    if (!row.id) continue;
    const prev = next[row.id];
    const kind = row.kind === "folder" ? "folder" : "note";
    const parentId = row.parentId ?? null;
    const mtime = row.mtime || prev?.mtime || 0;
    // A fill reload of the same page must not mint a new object for the
    // open note. A new object re-renders the editor on every catalog tick.
    if (
      prev &&
      prev.path === row.path &&
      prev.name === row.name &&
      prev.kind === kind &&
      (prev.parentId ?? null) === parentId &&
      prev.mtime === mtime
    ) {
      if (!parentId) roots.add(prev.id);
      continue;
    }
    const node = shellRowToNode(row);
    if (prev?.content !== undefined) node.content = prev.content;
    if (prev && prev.mtime > node.mtime) node.mtime = prev.mtime;
    next[row.id] = node;
    changed = true;
    if (!node.parentId) roots.add(node.id);
  }
  if (!changed) return { nodes, rootIds };
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

/** Saved page from the desktop boot script. Rejects anything that is not searchable yet. */
export function adoptBootShell(raw: unknown): ShellMount | null {
  if (!raw || typeof raw !== "object") return null;
  const mount = normalizeMount(raw as Record<string, unknown>);
  if (!mount.titlesLive || mount.pending || mount.rows.length === 0 || !mount.dbPath) {
    return null;
  }
  return mount;
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
    titlesLive: Boolean(raw.titlesLive ?? raw.titles_live),
  };
}

/** Titles on the open page. Does not touch the index, so a keystroke is not
 * waiting on a large database. Farther titles arrive from search after. */
export function searchOpenPageTitles(
  nodes: Record<string, VaultNode>,
  query: string,
  limit: number,
): { noteId: string; path: string; title: string; snippet: string; score: number; matchType: "title" }[] {
  const q = query.trim().toLowerCase();
  if (!q || limit <= 0) return [];
  const out: { noteId: string; path: string; title: string; snippet: string; score: number; matchType: "title" }[] = [];
  for (const id in nodes) {
    const n = nodes[id];
    if (!n || n.kind !== "note") continue;
    const title = noteTitle(n);
    const path = n.path || "";
    if (!title.toLowerCase().includes(q) && !path.toLowerCase().includes(q)) continue;
    out.push({
      noteId: n.id,
      path,
      title: title || n.name,
      snippet: path,
      score: title.toLowerCase().startsWith(q) ? 2 : 1,
      matchType: "title",
    });
    if (out.length >= limit) break;
  }
  out.sort((a, b) => b.score - a.score || a.title.localeCompare(b.title));
  return out;
}

export type ShellMountOutcome =
  | { status: "ready"; mount: ShellMount }
  | { status: "absent" }
  | { status: "busy" };

export async function mountShellCatalog(
  vaultRoot: string,
  preferPath?: string | null,
): Promise<ShellMountOutcome> {
  const call = await callShell<Record<string, unknown>>("vault_shell_mount", {
    vaultRoot,
    preferPath: preferPath || null,
  });
  if (!call.ok) {
    return { status: call.reason === "busy" ? "busy" : "absent" };
  }
  if (!call.value || typeof call.value !== "object") return { status: "absent" };
  const mount = normalizeMount(call.value);
  if (!mount.dbPath) return { status: "absent" };
  return { status: "ready", mount };
}

function rowsOf(raw: Record<string, unknown>): ShellRow[] {
  return Array.isArray(raw.rows) ? raw.rows.map((r) => asRow(r as Record<string, unknown>)) : [];
}

export async function fetchShellChildren(
  dbPath: string,
  parentPath: string,
  offset: number,
  limit = SHELL_CHILD_PAGE,
): Promise<ShellPage | null> {
  const browser = browserApi(dbPath);
  if (browser) return browser.children(parentPath, offset, limit);
  if (!dbPath) return null;
  const call = await callShell<Record<string, unknown>>("vault_shell_children", {
    dbPath,
    parentPath,
    limit,
    offset,
  });
  if (!call.ok) return null;
  const raw = call.value;
  return {
    parentPath: String(raw.parentPath ?? raw.parent_path ?? parentPath),
    rows: rowsOf(raw),
    noteTotal: num(raw.noteTotal ?? raw.note_total),
    folderTotal: num(raw.folderTotal ?? raw.folder_total),
    offset: num(raw.offset, offset),
    limit: num(raw.limit, limit),
  };
}

export async function fetchShellLevel(
  dbPath: string,
  parentPath: string,
  maxNodes = 320,
): Promise<ShellLevel | null> {
  const browser = browserApi(dbPath);
  if (browser) return browser.level(parentPath, maxNodes);
  if (!dbPath) return null;
  const call = await callShell<Record<string, unknown>>("vault_shell_level", {
    dbPath,
    parentPath,
    maxNodes,
  });
  if (!call.ok) return null;
  const raw = call.value;
  return {
    parentPath: String(raw.parentPath ?? raw.parent_path ?? parentPath),
    rows: rowsOf(raw),
    noteTotal: num(raw.noteTotal ?? raw.note_total),
    folderTotal: num(raw.folderTotal ?? raw.folder_total),
    omitted: num(raw.omitted),
  };
}

export async function fetchShellEgo(
  dbPath: string,
  centerId: string,
  hops = 2,
  maxNodes = 400,
): Promise<ShellEgo | null> {
  const browser = browserApi(dbPath);
  if (browser) return browser.ego(centerId, hops, maxNodes);
  if (!dbPath || !centerId) return null;
  const call = await callShell<Record<string, unknown>>("vault_shell_ego", {
    dbPath,
    centerId,
    hops,
    maxNodes,
  });
  if (!call.ok) return null;
  const raw = call.value;
  const edgesRaw = Array.isArray(raw.edges) ? raw.edges : [];
  return {
    centerId: String(raw.centerId ?? raw.center_id ?? centerId),
    rows: rowsOf(raw),
    edges: edgesRaw.map((e) => {
      const edge = e as Record<string, unknown>;
      return { source: String(edge.source ?? ""), target: String(edge.target ?? "") };
    }),
    capped: Boolean(raw.capped),
  };
}

export async function fetchShellNote(dbPath: string, id: string): Promise<ShellRow | null> {
  const browser = browserApi(dbPath);
  if (browser) return browser.note(id);
  if (!dbPath || !id) return null;
  const call = await callShell<Record<string, unknown> | null>("vault_shell_note", { dbPath, id });
  if (!call.ok || !call.value || typeof call.value !== "object") return null;
  const row = asRow(call.value);
  return row.id ? row : null;
}

export type ShellBacklinkRow = {
  fromId: string;
  fromPath: string;
  fromTitle: string;
};

export type ShellBacklinkPage = {
  rows: ShellBacklinkRow[];
  total: number;
};

export async function fetchShellBacklinks(
  dbPath: string,
  id: string,
  limit = 80,
): Promise<ShellBacklinkPage | null> {
  const browser = browserApi(dbPath);
  if (browser) return browser.backlinks(id, limit);
  if (!dbPath || !id) return null;
  const call = await callShell<Record<string, unknown>>("vault_shell_backlinks", {
    dbPath,
    id,
    limit,
  });
  if (!call.ok) return null;
  const raw = call.value;
  const rowsRaw = Array.isArray(raw.rows) ? raw.rows : [];
  return {
    total: num(raw.total),
    rows: rowsRaw.map((entry) => {
      const row = entry as Record<string, unknown>;
      return {
        fromId: String(row.fromId ?? row.from_id ?? ""),
        fromPath: String(row.fromPath ?? row.from_path ?? ""),
        fromTitle: String(row.fromTitle ?? row.from_title ?? ""),
      };
    }).filter((row) => row.fromId),
  };
}

export type ShellTagCount = { tag: string; count: number };

export async function fetchShellTags(dbPath: string, limit = 48): Promise<ShellTagCount[] | null> {
  const browser = browserApi(dbPath);
  if (browser) return browser.tags(limit);
  if (!dbPath) return null;
  const call = await callShell<unknown[]>("vault_shell_tags", { dbPath, limit });
  if (!call.ok || !Array.isArray(call.value)) return null;
  return call.value.map((entry) => {
    const row = entry as Record<string, unknown>;
    return { tag: String(row.tag ?? ""), count: num(row.count) };
  }).filter((row) => row.tag);
}

export async function fetchShellTagNotes(
  dbPath: string,
  tag: string,
  limit = 80,
): Promise<ShellRow[] | null> {
  const browser = browserApi(dbPath);
  if (browser) return browser.tagNotes(tag, limit);
  if (!dbPath || !tag) return null;
  const call = await callShell<unknown[]>("vault_shell_tag_notes", { dbPath, tag, limit });
  if (!call.ok || !Array.isArray(call.value)) return null;
  return call.value.map((entry) => asRow(entry as Record<string, unknown>)).filter((row) => row.id);
}

export type ShellSuggestHit = {
  id: string;
  path: string;
  name: string;
  kind: string;
  title: string;
  parentId: string | null;
  mtime: number;
};

export async function fetchShellSearch(
  dbPath: string,
  query: string,
  limit = 40,
): Promise<ShellSuggestHit[] | null> {
  const browser = browserApi(dbPath);
  if (!browser) return null;
  return browser.search(query, limit);
}

export async function fetchShellSuggest(
  dbPath: string,
  query: string,
  limit = 40,
): Promise<ShellSuggestHit[] | null> {
  const browser = browserApi(dbPath);
  if (browser) return browser.suggest(query, limit);
  if (!dbPath) return null;
  const call = await callShell<unknown[]>("vault_shell_suggest", { dbPath, query, limit });
  if (!call.ok || !Array.isArray(call.value)) return null;
  return call.value.map((entry) => {
    const row = entry as Record<string, unknown>;
    return {
      id: String(row.id ?? ""),
      path: String(row.path ?? "").replace(/\\/g, "/"),
      name: String(row.name ?? ""),
      kind: row.kind === "folder" ? "folder" : "note",
      title: String(row.title ?? row.name ?? ""),
      parentId: (row.parentId ?? row.parent_id ?? null) as string | null,
      mtime: num(row.mtime),
    };
  }).filter((row) => row.id);
}

export async function fetchShellRecent(dbPath: string, limit = 12): Promise<ShellRow[] | null> {
  const browser = browserApi(dbPath);
  if (browser) return browser.recent(limit);
  if (!dbPath) return null;
  const call = await callShell<unknown[]>("vault_shell_recent", { dbPath, limit });
  if (!call.ok || !Array.isArray(call.value)) return null;
  return call.value.map((entry) => asRow(entry as Record<string, unknown>)).filter((row) => row.id);
}

export type ShellForget = { ids: string[]; paths: string[] };

export async function fetchShellForget(
  dbPath: string,
  vaultRoot: string,
  paths: string[],
): Promise<ShellForget | null> {
  const browser = browserApi(dbPath);
  if (browser) return browser.forget(paths);
  if (!dbPath || !vaultRoot || !paths.length) return null;
  const call = await callShell<Record<string, unknown>>("vault_shell_forget", {
    dbPath,
    vaultRoot,
    paths,
  });
  if (!call.ok) return null;
  const raw = call.value;
  const ids = Array.isArray(raw.ids) ? raw.ids.map(String) : [];
  const gone = Array.isArray(raw.paths) ? raw.paths.map(String) : [];
  return { ids, paths: gone };
}

export async function fetchShellByPaths(
  dbPath: string,
  paths: string[],
): Promise<ShellRow[] | null> {
  if (browserApi(dbPath) || !dbPath || !paths.length) return null;
  const call = await callShell<unknown[]>("vault_shell_paths", { dbPath, paths: paths.slice(0, 24) });
  if (!call.ok || !Array.isArray(call.value)) return null;
  return call.value.map((entry) => asRow(entry as Record<string, unknown>)).filter((row) => row.id);
}

export async function fetchShellPathPage(
  dbPath: string,
  pathNeedle: string,
  folderNeedle: string,
  limit = 40,
): Promise<ShellRow[] | null> {
  if (browserApi(dbPath) || !dbPath) return null;
  const call = await callShell<unknown[]>("vault_shell_path_page", {
    dbPath,
    pathNeedle,
    folderNeedle,
    limit,
  });
  if (!call.ok || !Array.isArray(call.value)) return null;
  return call.value.map((entry) => asRow(entry as Record<string, unknown>)).filter((row) => row.id);
}

export async function fetchShellOrphans(dbPath: string, limit = 24): Promise<ShellRow[] | null> {
  if (browserApi(dbPath) || !dbPath) return null;
  const call = await callShell<unknown[]>("vault_shell_orphans", { dbPath, limit });
  if (!call.ok || !Array.isArray(call.value)) return null;
  return call.value.map((entry) => asRow(entry as Record<string, unknown>)).filter((row) => row.id);
}

export type ShellBrokenLink = {
  fromId: string;
  fromPath: string;
  fromTitle: string;
  target: string;
};

export async function fetchShellBroken(dbPath: string, limit = 40): Promise<ShellBrokenLink[] | null> {
  if (browserApi(dbPath) || !dbPath) return null;
  const call = await callShell<unknown[]>("vault_shell_broken", { dbPath, limit });
  if (!call.ok || !Array.isArray(call.value)) return null;
  return call.value.map((entry) => {
    const row = entry as Record<string, unknown>;
    return {
      fromId: String(row.fromId ?? row.from_id ?? ""),
      fromPath: String(row.fromPath ?? row.from_path ?? ""),
      fromTitle: String(row.fromTitle ?? row.from_title ?? ""),
      target: String(row.target ?? ""),
    };
  }).filter((row) => row.fromId && row.target);
}

export async function fetchShellKnownNorms(dbPath: string, norms: string[]): Promise<string[] | null> {
  if (browserApi(dbPath) || !dbPath) return null;
  const call = await callShell<unknown[]>("vault_shell_known_norms", {
    dbPath,
    norms: norms.slice(0, 64),
  });
  if (!call.ok || !Array.isArray(call.value)) return null;
  return call.value.map((entry) => String(entry));
}

export type ShellMentionHead = {
  fromId: string;
  fromPath: string;
  fromTitle: string;
  body: string;
};

/** `settled` false: the catalog could not rule the target out in time. */
export type ShellLinkResolve = { row: ShellRow | null; settled: boolean };

function linkNorm(target: string): string {
  return target.trim().replace(/\.md$/i, "").replace(/\\/g, "/").replace(/^\/+|\/+$/g, "").toLowerCase();
}

/** The note a wikilink names, from the whole catalog. Null without a catalog. */
export async function fetchShellResolveLink(
  dbPath: string,
  target: string,
): Promise<ShellLinkResolve | null> {
  const browser = browserApi(dbPath);
  if (browser) {
    const norm = linkNorm(target);
    if (!norm) return { row: null, settled: true };
    const leaf = norm.split("/").pop() || norm;
    const hits = await browser.suggest(leaf, 24);
    const hit = hits.find((h) => {
      if (h.kind !== "note") return false;
      const path = h.path.toLowerCase();
      if (norm.includes("/")) return path === `${norm}.md` || path.endsWith(`/${norm}.md`);
      return h.title.toLowerCase() === norm || path.split("/").pop() === `${norm}.md`;
    });
    if (!hit) return { row: null, settled: hits.length < 24 };
    const row = await browser.note(hit.id);
    return { row, settled: true };
  }
  if (!dbPath || !target.trim()) return null;
  const call = await callShell<Record<string, unknown>>("vault_shell_resolve_link", { dbPath, target });
  if (!call.ok || !call.value || typeof call.value !== "object") return null;
  const raw = call.value;
  const row = raw.row && typeof raw.row === "object" ? asRow(raw.row as Record<string, unknown>) : null;
  return { row: row?.id ? row : null, settled: Boolean(raw.settled) };
}

export type ShellLinkCoverage = { scanned: number; total: number; complete: boolean };

/** How many notes have had their links and tags read. Null for the browser shell. */
export async function fetchShellLinkCoverage(dbPath: string): Promise<ShellLinkCoverage | null> {
  if (browserApi(dbPath) || !dbPath) return null;
  const call = await callShell<Record<string, unknown>>("vault_shell_link_coverage", { dbPath });
  if (!call.ok || !call.value) return null;
  const raw = call.value;
  return {
    scanned: num(raw.scanned),
    total: num(raw.total),
    complete: Boolean(raw.complete),
  };
}

export async function fetchShellMentions(
  dbPath: string,
  phrase: string,
  limit = 24,
): Promise<ShellMentionHead[] | null> {
  if (browserApi(dbPath) || !dbPath || phrase.trim().length < 4) return null;
  const call = await callShell<unknown[]>("vault_shell_mentions", { dbPath, phrase, limit });
  if (!call.ok || !Array.isArray(call.value)) return null;
  return call.value.map((entry) => {
    const row = entry as Record<string, unknown>;
    return {
      fromId: String(row.fromId ?? row.from_id ?? ""),
      fromPath: String(row.fromPath ?? row.from_path ?? ""),
      fromTitle: String(row.fromTitle ?? row.from_title ?? ""),
      body: String(row.body ?? ""),
    };
  }).filter((row) => row.fromId);
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
