/**
 * Side-channel for creates/edits on large in-memory seeds (45k / soak-*).
 *
 * localStorage cannot hold the 45k map (QuotaExceeded). Disk vaults already
 * write markdown. Browser test vaults would otherwise silently drop session
 * notes on remount.
 *
 * Overlay lives in IndexedDB (localStorage fallback), keyed by vaultId+path.
 * Not a substitute for “open a folder” — files on disk remain the daily-driver
 * path. Cap is small so this cannot become a 45k dump.
 */

import type { VaultNode } from "./types";

export const LARGE_VAULT_OVERLAY_DB = "nexus-large-vault-overlay-v1";
export const LARGE_VAULT_OVERLAY_STORE = "entries";
export const LARGE_VAULT_OVERLAY_LS = "nexus-large-vault-overlay-v1";
/** Hard cap — this is a side-channel, not a second vault. */
export const LARGE_VAULT_OVERLAY_CAP = 400;
const BODY_CAP = 80_000;

export type LargeVaultOverlayEntry = {
  id: string;
  path: string;
  name: string;
  kind: "note" | "folder";
  parentId: string | null;
  parentPath: string | null;
  content?: string;
  mtime: number;
  deleted?: boolean;
};

const mem = new Map<string, Map<string, LargeVaultOverlayEntry>>();
const persistQueue = new Map<string, Promise<void>>();

function vaultMap(vaultId: string): Map<string, LargeVaultOverlayEntry> {
  let m = mem.get(vaultId);
  if (!m) {
    m = new Map();
    mem.set(vaultId, m);
  }
  return m;
}

function clip(entry: LargeVaultOverlayEntry): LargeVaultOverlayEntry {
  if (entry.kind !== "note" || typeof entry.content !== "string") return entry;
  if (entry.content.length <= BODY_CAP) return entry;
  return { ...entry, content: entry.content.slice(0, BODY_CAP) };
}

function evictIfNeeded(m: Map<string, LargeVaultOverlayEntry>) {
  if (m.size <= LARGE_VAULT_OVERLAY_CAP) return;
  const ordered = [...m.values()].sort((a, b) => a.mtime - b.mtime);
  while (m.size > LARGE_VAULT_OVERLAY_CAP) {
    const oldest = ordered.shift();
    if (!oldest) break;
    m.delete(oldest.path);
  }
}

/** Pure apply — mutates `nodes` in place (no 45k clone). */
export function applyLargeVaultOverlay(
  nodes: Record<string, VaultNode>,
  rootIds: string[],
  entries: LargeVaultOverlayEntry[],
): { applied: number; deleted: number; rootIds: string[] } {
  const byPath = new Map<string, string>();
  for (const id in nodes) {
    const n = nodes[id];
    if (n) byPath.set(n.path, id);
  }

  const nextRoots = rootIds.slice();
  let applied = 0;
  let deleted = 0;

  const tombstones = entries.filter((e) => e.deleted);
  const live = entries
    .filter((e) => !e.deleted)
    .sort((a, b) => {
      const da = a.path.split("/").length;
      const db = b.path.split("/").length;
      if (da !== db) return da - db;
      if (a.kind !== b.kind) return a.kind === "folder" ? -1 : 1;
      return a.path.localeCompare(b.path);
    });

  for (const e of tombstones) {
    const id = byPath.get(e.path) ?? e.id;
    const n = nodes[id];
    if (!n) continue;
    delete nodes[id];
    byPath.delete(n.path);
    const ri = nextRoots.indexOf(id);
    if (ri >= 0) nextRoots.splice(ri, 1);
    deleted += 1;
  }

  for (const e of live) {
    const parentId = e.parentPath
      ? (byPath.get(e.parentPath) ?? e.parentId)
      : e.parentId;
    const existingId = byPath.get(e.path);
    const id = existingId ?? e.id;
    const parentOk = parentId && nodes[parentId] ? parentId : null;
    nodes[id] = {
      id,
      path: e.path,
      name: e.name,
      kind: e.kind,
      parentId: parentOk,
      mtime: e.mtime,
      ...(e.kind === "note" ? { content: e.content ?? "" } : {}),
    };
    byPath.set(e.path, id);
    if (!parentOk && !nextRoots.includes(id)) nextRoots.push(id);
    applied += 1;
  }

  return { applied, deleted, rootIds: nextRoots };
}

function remember(vaultId: string, entry: LargeVaultOverlayEntry) {
  const m = vaultMap(vaultId);
  if (entry.deleted) {
    m.set(entry.path, { ...entry, content: undefined });
  } else {
    m.set(entry.path, clip(entry));
  }
  evictIfNeeded(m);
}

export function overlayEntriesFor(vaultId: string): LargeVaultOverlayEntry[] {
  return [...vaultMap(vaultId).values()];
}

export function overlayCount(vaultId: string | null | undefined): number {
  if (!vaultId) return 0;
  let n = 0;
  for (const e of vaultMap(vaultId).values()) if (!e.deleted) n += 1;
  return n;
}

function lsRead(vaultId: string): LargeVaultOverlayEntry[] {
  if (typeof localStorage === "undefined") return [];
  try {
    const raw = localStorage.getItem(LARGE_VAULT_OVERLAY_LS);
    if (!raw) return [];
    const all = JSON.parse(raw) as Record<string, LargeVaultOverlayEntry[]>;
    return Array.isArray(all[vaultId]) ? all[vaultId]! : [];
  } catch {
    return [];
  }
}

function lsWrite(vaultId: string, entries: LargeVaultOverlayEntry[]) {
  if (typeof localStorage === "undefined") return;
  try {
    const raw = localStorage.getItem(LARGE_VAULT_OVERLAY_LS);
    const all = raw
      ? (JSON.parse(raw) as Record<string, LargeVaultOverlayEntry[]>)
      : {};
    all[vaultId] = entries;
    localStorage.setItem(LARGE_VAULT_OVERLAY_LS, JSON.stringify(all));
  } catch {
    /* quota — IndexedDB is the real store */
  }
}

function openDb(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === "undefined") return Promise.resolve(null);
  return new Promise((resolve) => {
    try {
      const req = indexedDB.open(LARGE_VAULT_OVERLAY_DB, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(LARGE_VAULT_OVERLAY_STORE)) {
          db.createObjectStore(LARGE_VAULT_OVERLAY_STORE);
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

function idbKey(vaultId: string, path: string) {
  return `${vaultId}\0${path}`;
}

async function persistVault(vaultId: string): Promise<void> {
  const entries = overlayEntriesFor(vaultId);
  lsWrite(vaultId, entries);
  const db = await openDb();
  if (!db) return;
  await new Promise<void>((resolve) => {
    try {
      const tx = db.transaction(LARGE_VAULT_OVERLAY_STORE, "readwrite");
      const store = tx.objectStore(LARGE_VAULT_OVERLAY_STORE);
      const range = IDBKeyRange.bound(idbKey(vaultId, ""), idbKey(vaultId, "\uffff"));
      store.openCursor(range).onsuccess = (ev) => {
        const cursor = (ev.target as IDBRequest<IDBCursorWithValue | null>).result;
        if (!cursor) return;
        const path = String(cursor.key).slice(vaultId.length + 1);
        if (!entries.some((e) => e.path === path)) cursor.delete();
        cursor.continue();
      };
      for (const e of entries) {
        store.put(e, idbKey(vaultId, e.path));
      }
      tx.oncomplete = () => {
        db.close();
        resolve();
      };
      tx.onerror = () => {
        db.close();
        resolve();
      };
    } catch {
      try {
        db.close();
      } catch {}
      resolve();
    }
  });
}

function enqueuePersist(vaultId: string): Promise<void> {
  const prev = persistQueue.get(vaultId) ?? Promise.resolve();
  const next = prev.then(() => persistVault(vaultId)).catch(() => undefined);
  persistQueue.set(vaultId, next);
  return next;
}

export function upsertLargeVaultOverlay(
  vaultId: string,
  entry: LargeVaultOverlayEntry,
): void {
  remember(vaultId, entry);
  void enqueuePersist(vaultId);
}

export function markLargeVaultOverlayDeleted(
  vaultId: string,
  path: string,
  id: string,
): void {
  remember(vaultId, {
    id,
    path,
    name: path.split("/").pop() ?? path,
    kind: "note",
    parentId: null,
    parentPath: null,
    mtime: Date.now(),
    deleted: true,
  });
  void enqueuePersist(vaultId);
}

export async function loadLargeVaultOverlay(
  vaultId: string,
): Promise<LargeVaultOverlayEntry[]> {
  if (!mem.has(vaultId)) {
    const db = await openDb();
    const loaded: LargeVaultOverlayEntry[] = [];
    if (db) {
      await new Promise<void>((resolve) => {
        try {
          const tx = db.transaction(LARGE_VAULT_OVERLAY_STORE, "readonly");
          const range = IDBKeyRange.bound(
            idbKey(vaultId, ""),
            idbKey(vaultId, "\uffff"),
          );
          const req = tx.objectStore(LARGE_VAULT_OVERLAY_STORE).getAll(range);
          req.onsuccess = () => {
            const rows = (req.result ?? []) as LargeVaultOverlayEntry[];
            loaded.push(...rows);
          };
          tx.oncomplete = () => {
            db.close();
            resolve();
          };
          tx.onerror = () => {
            db.close();
            resolve();
          };
        } catch {
          try {
            db.close();
          } catch {}
          resolve();
        }
      });
    }
    if (!loaded.length) loaded.push(...lsRead(vaultId));
    const m = vaultMap(vaultId);
    for (const e of loaded) m.set(e.path, e);
  }
  return overlayEntriesFor(vaultId);
}

export async function flushLargeVaultOverlay(
  vaultId?: string | null,
): Promise<void> {
  if (vaultId) {
    await enqueuePersist(vaultId);
    return;
  }
  await Promise.all([...mem.keys()].map((id) => enqueuePersist(id)));
}

export async function clearLargeVaultOverlay(vaultId?: string | null): Promise<void> {
  if (vaultId) {
    mem.delete(vaultId);
    lsWrite(vaultId, []);
    const db = await openDb();
    if (!db) return;
    await new Promise<void>((resolve) => {
      try {
        const tx = db.transaction(LARGE_VAULT_OVERLAY_STORE, "readwrite");
        const store = tx.objectStore(LARGE_VAULT_OVERLAY_STORE);
        const range = IDBKeyRange.bound(idbKey(vaultId, ""), idbKey(vaultId, "\uffff"));
        store.openCursor(range).onsuccess = (ev) => {
          const cursor = (ev.target as IDBRequest<IDBCursorWithValue | null>).result;
          if (!cursor) return;
          cursor.delete();
          cursor.continue();
        };
        tx.oncomplete = () => {
          db.close();
          resolve();
        };
        tx.onerror = () => {
          db.close();
          resolve();
        };
      } catch {
        try {
          db.close();
        } catch {}
        resolve();
      }
    });
    return;
  }
  mem.clear();
  if (typeof localStorage !== "undefined") {
    try {
      localStorage.removeItem(LARGE_VAULT_OVERLAY_LS);
    } catch {}
  }
  if (typeof indexedDB !== "undefined") {
    await new Promise<void>((resolve) => {
      try {
        const req = indexedDB.deleteDatabase(LARGE_VAULT_OVERLAY_DB);
        req.onsuccess = () => resolve();
        req.onerror = () => resolve();
        req.onblocked = () => resolve();
      } catch {
        resolve();
      }
    });
  }
}
