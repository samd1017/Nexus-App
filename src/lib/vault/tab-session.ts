/**
 * Open note tabs for one vault, remembered across reopen.
 * Paths, not machine locations. A missing file is dropped. Another vault's
 * list is never returned for this one.
 */

export const TAB_SESSION_KEY = "nexus-tabs-v1";
export const TAB_SESSION_MAX = 20;
const VAULT_MAX = 16;
const SCROLL_MAX = 40;

export type TabPaneName = "primary" | "secondary";

export type TabScroll = {
  pane: TabPaneName;
  path: string;
  top: number;
};

export type TabSession = {
  primary: string[];
  secondary: string[];
  active: string | null;
  secondaryActive: string | null;
  split: boolean;
  scroll: TabScroll[];
  at: number;
};

export type TabBook = Record<string, TabSession>;

export type ResolvedTabs = {
  ids: string[];
  paths: string[];
  activeId: string | null;
  activePath: string | null;
  missing: string[];
};

const EMPTY: TabSession = {
  primary: [],
  secondary: [],
  active: null,
  secondaryActive: null,
  split: false,
  scroll: [],
  at: 0,
};

function cleanPath(path: unknown): string | null {
  if (typeof path !== "string") return null;
  const trimmed = path.trim();
  if (!trimmed || trimmed.startsWith("/") || trimmed.includes("..")) return null;
  return trimmed;
}

function cleanPaths(list: unknown): string[] {
  if (!Array.isArray(list)) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const item of list) {
    const path = cleanPath(item);
    if (!path || seen.has(path)) continue;
    seen.add(path);
    out.push(path);
    if (out.length >= TAB_SESSION_MAX) break;
  }
  return out;
}

export function emptyTabSession(): TabSession {
  return { ...EMPTY, primary: [], secondary: [], scroll: [] };
}

export function normalizeTabSession(raw: unknown): TabSession | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Partial<TabSession>;
  const primary = cleanPaths(row.primary);
  const secondary = cleanPaths(row.secondary);
  const active = cleanPath(row.active);
  const secondaryActive = cleanPath(row.secondaryActive);
  const scroll: TabScroll[] = [];
  if (Array.isArray(row.scroll)) {
    for (const item of row.scroll) {
      if (!item || typeof item !== "object") continue;
      const pane = (item as TabScroll).pane === "secondary" ? "secondary" : "primary";
      const path = cleanPath((item as TabScroll).path);
      const top = (item as TabScroll).top;
      if (!path || typeof top !== "number" || !Number.isFinite(top) || top <= 0) continue;
      scroll.push({ pane, path, top: Math.round(top) });
      if (scroll.length >= SCROLL_MAX) break;
    }
  }
  return {
    primary,
    secondary,
    active: active && primary.includes(active) ? active : primary[0] ?? null,
    secondaryActive:
      secondaryActive && secondary.includes(secondaryActive) ? secondaryActive : secondary[0] ?? null,
    split: Boolean(row.split) && secondary.length > 0,
    scroll,
    at: typeof row.at === "number" && Number.isFinite(row.at) ? row.at : 0,
  };
}

/** Keep this vault's list under its own id. Other vaults stay in their own slots. */
export function writeVaultTabs(book: TabBook, vaultId: string, session: TabSession): TabBook {
  if (!vaultId) return book;
  const next: TabBook = { ...book, [vaultId]: { ...session, at: session.at || Date.now() } };
  const ids = Object.keys(next);
  if (ids.length <= VAULT_MAX) return next;
  const ranked = ids.sort((a, b) => (next[b]?.at ?? 0) - (next[a]?.at ?? 0));
  const keep = new Set(ranked.slice(0, VAULT_MAX));
  const trimmed: TabBook = {};
  for (const id of ranked) {
    if (keep.has(id)) trimmed[id] = next[id];
  }
  return trimmed;
}

export function readVaultTabs(book: TabBook, vaultId: string | null | undefined): TabSession | null {
  if (!vaultId) return null;
  return normalizeTabSession(book[vaultId]);
}

/**
 * Paths that still name a note stay, in order. A missing active path focuses
 * the tab that followed it, or the last one left. Nothing left is an empty list.
 */
export function resolveTabList(
  paths: readonly string[],
  activePath: string | null,
  pathToId: ReadonlyMap<string, string>,
): ResolvedTabs {
  const ids: string[] = [];
  const kept: string[] = [];
  const missing: string[] = [];
  const seen = new Set<string>();
  let activeId: string | null = null;
  const list = paths.slice(0, TAB_SESSION_MAX);
  for (const path of list) {
    if (!path || seen.has(path)) continue;
    seen.add(path);
    const id = pathToId.get(path);
    if (!id) {
      missing.push(path);
      continue;
    }
    if (path === activePath) activeId = id;
    ids.push(id);
    kept.push(path);
  }
  if (!activeId && ids.length) {
    const wanted = activePath ? list.indexOf(activePath) : 0;
    const idx = wanted < 0 ? 0 : wanted;
    let before = 0;
    for (let i = 0; i < list.length && i < idx; i++) {
      if (pathToId.has(list[i])) before++;
    }
    activeId = ids[Math.min(before, ids.length - 1)] ?? ids[0];
  }
  const activeKept = activeId ? kept[ids.indexOf(activeId)] ?? null : null;
  return { ids, paths: kept, activeId, activePath: activeKept, missing };
}

export function pathIndex(
  nodes: Record<string, { id?: string; kind?: string; path?: string } | undefined>,
): Map<string, string> {
  const map = new Map<string, string>();
  for (const id in nodes) {
    const node = nodes[id];
    if (node?.kind === "note" && node.path) map.set(node.path, node.id || id);
  }
  return map;
}

type Memory = { getItem(key: string): string | null; setItem(key: string, value: string): void };

function storage(): Memory | null {
  try {
    if (typeof localStorage === "undefined") return null;
    return localStorage;
  } catch {
    return null;
  }
}

export function loadTabBook(): TabBook {
  const store = storage();
  if (!store) return {};
  try {
    const raw = store.getItem(TAB_SESSION_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as { vaults?: TabBook } | TabBook;
    const vaults = (parsed && typeof parsed === "object" && "vaults" in parsed
      ? parsed.vaults
      : parsed) as TabBook;
    if (!vaults || typeof vaults !== "object") return {};
    const book: TabBook = {};
    for (const id of Object.keys(vaults)) {
      const session = normalizeTabSession(vaults[id]);
      if (session) book[id] = session;
    }
    return book;
  } catch {
    return {};
  }
}

export function saveTabBook(book: TabBook): void {
  const store = storage();
  if (!store) return;
  try {
    store.setItem(TAB_SESSION_KEY, JSON.stringify({ vaults: book }));
  } catch {
    /* quota: the open tabs are still on screen */
  }
}

export function loadTabSession(vaultId: string | null | undefined): TabSession | null {
  return readVaultTabs(loadTabBook(), vaultId);
}

export function saveTabSession(vaultId: string | null | undefined, session: TabSession): void {
  if (!vaultId) return;
  const book = writeVaultTabs(loadTabBook(), vaultId, normalizeTabSession(session) ?? emptyTabSession());
  saveTabBook(book);
}
