/**
 * Local-web shell catalog.
 *
 * The granted folder stays the source of truth. IndexedDB holds a disposable
 * copy of paths and titles. The renderer receives a page. This is not the
 * desktop 500k path: Chrome still refuses above its note cap.
 */

import { fsaNodeId, walkCollect } from "./fs-adapter";
import { CHROME_FSA_NOTE_CAP } from "./chrome-fsa-cap";
import {
  BROWSER_SHELL_DB,
  SHELL_CHILD_PAGE,
  SHELL_FULL_MAX_NOTES,
  SHELL_ROOT_KEY,
  registerBrowserShell,
  type ShellBacklinkPage,
  type ShellEgo,
  type ShellForget,
  type ShellLevel,
  type ShellMount,
  type ShellPage,
  type ShellRow,
  type ShellSuggestHit,
  type ShellTagCount,
} from "./shell-catalog";

export type BrowserShellRecord = {
  id: string;
  path: string;
  name: string;
  kind: "note" | "folder";
  parentId: string | null;
  parentPath: string;
  mtime: number;
  title: string;
  /** 0 folder, 1 note — cursor order matches the tree. */
  sortKind: number;
  nameLower: string;
  titleLower: string;
};

const DB_NAME = "nexus-browser-shell";
const STORE = "rows";

export function browserParentPath(path: string): string {
  const norm = path.replace(/\\/g, "/").replace(/^\/+|\/+$/g, "");
  const slash = norm.lastIndexOf("/");
  return slash <= 0 ? "" : norm.slice(0, slash);
}

export function browserRecord(
  path: string,
  name: string,
  kind: "note" | "folder",
  mtime: number,
): BrowserShellRecord {
  const parentPath = browserParentPath(path);
  const title = kind === "note" ? name.replace(/\.md$/i, "") : name;
  return {
    id: fsaNodeId(path),
    path,
    name,
    kind,
    parentId: parentPath ? fsaNodeId(parentPath) : null,
    parentPath,
    mtime,
    title,
    sortKind: kind === "folder" ? 0 : 1,
    nameLower: name.toLowerCase(),
    titleLower: title.toLowerCase(),
  };
}

function byName(a: BrowserShellRecord, b: BrowserShellRecord): number {
  if (a.sortKind !== b.sortKind) return a.sortKind - b.sortKind;
  return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" });
}

/** One folder page. `rows` is the catalog under test, not the renderer. */
export function pageChildRows(
  rows: BrowserShellRecord[],
  parentPath: string,
  offset: number,
  limit: number,
): { rows: BrowserShellRecord[]; noteTotal: number; folderTotal: number } {
  const kids = rows.filter((row) => row.parentPath === parentPath).sort(byName);
  const noteTotal = kids.filter((row) => row.kind === "note").length;
  const folderTotal = kids.filter((row) => row.kind === "folder").length;
  const start = Math.max(0, offset);
  const size = Math.max(1, limit);
  return {
    rows: kids.slice(start, start + size),
    noteTotal,
    folderTotal,
  };
}

export function pageRecentRows(rows: BrowserShellRecord[], limit: number): BrowserShellRecord[] {
  return rows
    .filter((row) => row.kind === "note")
    .sort((a, b) => b.mtime - a.mtime || a.name.localeCompare(b.name))
    .slice(0, Math.max(1, limit));
}

export function pageSuggestRows(
  rows: BrowserShellRecord[],
  query: string,
  limit: number,
): BrowserShellRecord[] {
  const q = query.trim().toLowerCase();
  const size = Math.max(1, limit);
  if (!q) return pageRecentRows(rows, size);
  return rows
    .filter(
      (row) =>
        row.titleLower.startsWith(q) ||
        row.nameLower.startsWith(q) ||
        row.path.toLowerCase().startsWith(q),
    )
    .sort((a, b) => {
      const ap = a.titleLower.startsWith(q) ? 0 : 1;
      const bp = b.titleLower.startsWith(q) ? 0 : 1;
      if (ap !== bp) return ap - bp;
      if (a.sortKind !== b.sortKind) return a.sortKind - b.sortKind;
      return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" });
    })
    .slice(0, size);
}

export function windowNoteCount(rows: Array<{ kind: string }>): number {
  return rows.reduce((n, row) => n + (row.kind === "note" ? 1 : 0), 0);
}

function toShellRow(row: BrowserShellRecord): ShellRow {
  return {
    id: row.id,
    path: row.path,
    name: row.name,
    kind: row.kind,
    parentId: row.parentId,
    mtime: row.mtime,
  };
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("This browser cannot keep a local catalog"));
      return;
    }
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (db.objectStoreNames.contains(STORE)) db.deleteObjectStore(STORE);
      const store = db.createObjectStore(STORE, { keyPath: "path" });
      store.createIndex("byParent", ["parentPath", "sortKind", "nameLower"]);
      store.createIndex("byKind", "kind");
      store.createIndex("byId", "id");
      store.createIndex("byMtime", "mtime");
      store.createIndex("byTitle", "titleLower");
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("catalog open failed"));
  });
}

function txDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("catalog write failed"));
    tx.onabort = () => reject(tx.error ?? new Error("catalog write aborted"));
  });
}

async function withStore<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => T | Promise<T>): Promise<T> {
  const db = await openDb();
  try {
    const tx = db.transaction(STORE, mode);
    const result = await run(tx.objectStore(STORE));
    await txDone(tx);
    return result;
  } finally {
    db.close();
  }
}

function req<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function prefixRange(parentPath: string, sortKind: number): IDBKeyRange {
  return IDBKeyRange.bound(
    [parentPath, sortKind, ""],
    [parentPath, sortKind, "\uffff"],
  );
}

async function countRange(store: IDBObjectStore, range: IDBKeyRange): Promise<number> {
  return req(store.index("byParent").count(range));
}

async function cursorPage(
  store: IDBObjectStore,
  parentPath: string,
  offset: number,
  limit: number,
): Promise<BrowserShellRecord[]> {
  const range = IDBKeyRange.bound(
    [parentPath, 0, ""],
    [parentPath, 1, "\uffff"],
  );
  return new Promise((resolve, reject) => {
    const out: BrowserShellRecord[] = [];
    let seen = 0;
    const cursorReq = store.index("byParent").openCursor(range);
    cursorReq.onerror = () => reject(cursorReq.error);
    cursorReq.onsuccess = () => {
      const cursor = cursorReq.result;
      if (!cursor || out.length >= limit) {
        resolve(out);
        return;
      }
      if (seen < offset) {
        seen += 1;
        cursor.continue();
        return;
      }
      out.push(cursor.value as BrowserShellRecord);
      seen += 1;
      cursor.continue();
    };
  });
}

async function putBatch(rows: BrowserShellRecord[]): Promise<void> {
  if (!rows.length) return;
  await withStore("readwrite", (store) => {
    for (const row of rows) store.put(row);
  });
}

async function childPage(parentPath: string, offset: number, limit: number): Promise<ShellPage> {
  const db = await openDb();
  try {
    const tx = db.transaction(STORE, "readonly");
    const store = tx.objectStore(STORE);
    const [rows, noteTotal, folderTotal] = await Promise.all([
      cursorPage(store, parentPath, offset, limit),
      countRange(store, prefixRange(parentPath, 1)),
      countRange(store, prefixRange(parentPath, 0)),
    ]);
    await txDone(tx);
    return {
      parentPath,
      rows: rows.map(toShellRow),
      noteTotal,
      folderTotal,
      offset,
      limit,
    };
  } finally {
    db.close();
  }
}

async function counts(): Promise<{ notes: number; folders: number }> {
  return withStore("readonly", async (store) => {
    const notes = await req(store.index("byKind").count("note"));
    const folders = await req(store.index("byKind").count("folder"));
    return { notes, folders };
  });
}

async function byPath(path: string): Promise<BrowserShellRecord | null> {
  return withStore("readonly", async (store) => {
    const row = await req(store.get(path));
    return (row as BrowserShellRecord | undefined) ?? null;
  });
}

async function byId(id: string): Promise<BrowserShellRecord | null> {
  return withStore("readonly", async (store) => {
    const row = await req(store.index("byId").get(id));
    return (row as BrowserShellRecord | undefined) ?? null;
  });
}

async function allRows(): Promise<BrowserShellRecord[]> {
  return withStore("readonly", async (store) => {
    const rows = await req(store.getAll());
    return (rows as BrowserShellRecord[]) ?? [];
  });
}

async function recentRows(limit: number): Promise<ShellRow[]> {
  const db = await openDb();
  try {
    const tx = db.transaction(STORE, "readonly");
    const index = tx.objectStore(STORE).index("byMtime");
    const rows = await new Promise<BrowserShellRecord[]>((resolve, reject) => {
      const out: BrowserShellRecord[] = [];
      const cursorReq = index.openCursor(null, "prev");
      cursorReq.onerror = () => reject(cursorReq.error);
      cursorReq.onsuccess = () => {
        const cursor = cursorReq.result;
        if (!cursor || out.length >= limit) {
          resolve(out);
          return;
        }
        const row = cursor.value as BrowserShellRecord;
        if (row.kind === "note") out.push(row);
        cursor.continue();
      };
    });
    await txDone(tx);
    return rows.map(toShellRow);
  } finally {
    db.close();
  }
}

async function suggestRows(query: string, limit: number): Promise<ShellSuggestHit[]> {
  const q = query.trim().toLowerCase();
  if (!q) {
    const recent = await recentRows(limit);
    return recent.map((row) => ({
      id: row.id,
      path: row.path,
      name: row.name,
      kind: row.kind,
      title: row.name.replace(/\.md$/i, ""),
      parentId: row.parentId ?? null,
      mtime: row.mtime,
    }));
  }
  const db = await openDb();
  try {
    const tx = db.transaction(STORE, "readonly");
    const index = tx.objectStore(STORE).index("byTitle");
    const upper = q + "\uffff";
    const hits = await new Promise<BrowserShellRecord[]>((resolve, reject) => {
      const out: BrowserShellRecord[] = [];
      const cursorReq = index.openCursor(IDBKeyRange.bound(q, upper));
      cursorReq.onerror = () => reject(cursorReq.error);
      cursorReq.onsuccess = () => {
        const cursor = cursorReq.result;
        if (!cursor || out.length >= limit) {
          resolve(out);
          return;
        }
        out.push(cursor.value as BrowserShellRecord);
        cursor.continue();
      };
    });
    await txDone(tx);
    return hits.map((row) => ({
      id: row.id,
      path: row.path,
      name: row.name,
      kind: row.kind,
      title: row.title,
      parentId: row.parentId,
      mtime: row.mtime,
    }));
  } finally {
    db.close();
  }
}

function rootIdsOf(rows: BrowserShellRecord[]): string[] {
  return rows
    .filter((row) => !row.parentId)
    .sort(byName)
    .map((row) => row.id);
}

async function buildMount(preferPath: string | null): Promise<ShellMount> {
  const { notes, folders } = await counts();
  if (notes <= SHELL_FULL_MAX_NOTES) {
    const rows = (await allRows()).sort(byName);
    const active = preferPath ? rows.find((row) => row.path === preferPath) : rows.find((row) => row.kind === "note");
    return {
      materialize: true,
      pending: false,
      notes,
      folders,
      rows: rows.map(toShellRow),
      rootIds: rootIdsOf(rows),
      activeNoteId: active?.id ?? null,
      omittedNotes: 0,
      loaded: [],
      dbPath: BROWSER_SHELL_DB,
    };
  }
  const page = await childPage("", 0, SHELL_CHILD_PAGE);
  const extra: BrowserShellRecord[] = [];
  if (preferPath) {
    const note = await byPath(preferPath);
    if (note) extra.push(note);
    let parent = browserParentPath(preferPath);
    while (parent) {
      const folder = await byPath(parent);
      if (folder) extra.push(folder);
      parent = browserParentPath(parent);
    }
  }
  const pageRecords = await Promise.all(page.rows.map((row) => byPath(row.path)));
  const merged = new Map<string, BrowserShellRecord>();
  for (const row of [...pageRecords, ...extra]) {
    if (row) merged.set(row.id, row);
  }
  const rows = [...merged.values()];
  const hidden = Math.max(0, page.noteTotal + page.folderTotal - page.rows.length);
  const shownNotes = rows.filter((row) => row.kind === "note").length;
  return {
    materialize: false,
    pending: false,
    notes,
    folders,
    rows: rows.map(toShellRow),
    rootIds: rootIdsOf(rows),
    activeNoteId: preferPath ? (await byPath(preferPath))?.id ?? null : null,
    omittedNotes: Math.max(0, notes - shownNotes),
    loaded: [
      {
        parentId: SHELL_ROOT_KEY,
        loaded: page.rows.length,
        hidden,
      },
    ],
    dbPath: BROWSER_SHELL_DB,
  };
}

function installRoutes(): void {
  registerBrowserShell({
    children: (parentPath, offset, limit) => childPage(parentPath, offset, limit),
    level: async (parentPath, maxNodes) => {
      const page = await childPage(parentPath, 0, maxNodes);
      const total = page.noteTotal + page.folderTotal;
      const level: ShellLevel = {
        parentPath,
        rows: page.rows,
        noteTotal: page.noteTotal,
        folderTotal: page.folderTotal,
        omitted: Math.max(0, total - page.rows.length),
      };
      return level;
    },
    ego: async (centerId) => {
      const row = await byId(centerId);
      const ego: ShellEgo = {
        centerId,
        rows: row ? [toShellRow(row)] : [],
        edges: [],
        capped: false,
      };
      return ego;
    },
    note: async (id) => {
      const row = await byId(id);
      return row ? toShellRow(row) : null;
    },
    backlinks: async (): Promise<ShellBacklinkPage> => ({ rows: [], total: 0 }),
    tags: async (): Promise<ShellTagCount[]> => [],
    tagNotes: async (): Promise<ShellRow[]> => [],
    suggest: (query, limit) => suggestRows(query, limit),
    recent: (limit) => recentRows(limit),
    forget: async (paths): Promise<ShellForget> => {
      const ids: string[] = [];
      const gone: string[] = [];
      await withStore("readwrite", async (store) => {
        for (const rel of paths) {
          const path = rel.replace(/\\/g, "/");
          const row = (await req(store.get(path))) as BrowserShellRecord | undefined;
          if (row) {
            store.delete(path);
            ids.push(row.id);
            gone.push(path);
          }
        }
      });
      return { ids, paths: gone };
    },
  });
}

export async function closeBrowserShell(): Promise<void> {
  registerBrowserShell(null);
  if (typeof indexedDB === "undefined") return;
  try {
    const db = await openDb();
    try {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).clear();
      await txDone(tx);
    } finally {
      db.close();
    }
  } catch {
    /* catalog is disposable */
  }
}

/**
 * Walk the granted folder into the disposable catalog and return one window.
 * Throws the Chrome cap error when the folder is past the browser limit.
 */
export async function mountBrowserShell(
  root: FileSystemDirectoryHandle,
  preferPath?: string | null,
  onProgress?: (scanned: number) => void,
): Promise<ShellMount> {
  await closeBrowserShell();
  const batch: BrowserShellRecord[] = [];
  let scanned = 0;
  const flush = async () => {
    if (!batch.length) return;
    const chunk = batch.splice(0, batch.length);
    await putBatch(chunk);
  };
  await walkCollect(
    root,
    async (path, name, _parent, file) => {
      batch.push(browserRecord(path, name, "note", file?.lastModified ?? 1));
      scanned += 1;
      if (batch.length >= 200) await flush();
      if (onProgress && scanned % 250 === 0) onProgress(scanned);
    },
    async (path, name) => {
      batch.push(browserRecord(path, name, "folder", 1));
      if (batch.length >= 200) await flush();
    },
    {
      maxNotes: CHROME_FSA_NOTE_CAP,
      skipGetFileAfter: undefined,
    },
  );
  await flush();
  if (onProgress) onProgress(scanned);
  const mount = await buildMount(preferPath ?? null);
  installRoutes();
  return mount;
}
