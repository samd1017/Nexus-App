/**
 * Local-web shell catalog.
 *
 * The granted folder stays the source of truth. IndexedDB holds a disposable
 * copy of paths and titles. The renderer receives a page. This is not the
 * desktop 500k path: Chrome still refuses above its note cap.
 */

import { fsaNodeId, walkCollect } from "./fs-adapter";
import { CHROME_FSA_NOTE_CAP } from "./chrome-fsa-cap";
import { extractTagsFromMarkdown } from "./tags";
import { extractWikilinkTargets, normalizeLinkTarget } from "@/lib/markdown/wikilinks";
import {
  BROWSER_SHELL_DB,
  SHELL_CHILD_PAGE,
  SHELL_FULL_MAX_NOTES,
  SHELL_ROOT_KEY,
  registerBrowserShell,
  type ShellBacklinkPage,
  type ShellBacklinkRow,
  type ShellEdge,
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
const DB_VERSION = 2;
const STORE = "rows";
const EDGES = "edges";
const TAGS = "tags";
const TAG_STATS = "tagStats";
const POSTINGS = "postings";
const CATALOG_STORES = [STORE, EDGES, TAGS, TAG_STATS, POSTINGS] as const;

type EdgeRec = { key: string; sourceId: string; targetNorm: string };
type TagRec = { key: string; tag: string; noteId: string; mtime: number };
type PostRec = { key: string; token: string; noteId: string };
type TagStatRec = { tag: string; count: number };

let grantedRoot: FileSystemDirectoryHandle | null = null;

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

/** Match the desktop neighborhood caps. The result is a draw list, not the folder. */
export const BROWSER_EGO_MAX = 400;
export const BROWSER_EGO_HOPS = 2;
export const BROWSER_EGO_DEGREE = 48;
export const BROWSER_BACKLINK_LIMIT = 80;
export const BROWSER_TAG_LIMIT = 48;
/** A very common word keeps this many note ids. The index still covers the folder. */
export const BROWSER_POSTING_CAP = 400;
/** Links and tags are taken from this much of each file, then the text is dropped. */
export const BROWSER_HEAD_CHARS = 4096;

export type BrowserLinkEdge = { sourceId: string; targetNorm: string };
export type BrowserTagPair = { tag: string; noteId: string; mtime: number };
export type BrowserPosting = { token: string; noteId: string };

export function noteIdentityNorms(row: { title: string; name: string; path: string }): string[] {
  const out: string[] = [];
  const push = (raw: string) => {
    const norm = normalizeLinkTarget(raw);
    if (!norm || out.includes(norm)) return;
    out.push(norm);
  };
  push(row.title);
  push(row.name);
  push(row.path);
  return out;
}

export function catalogTokens(text: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const token of text.toLowerCase().split(/[^a-z0-9_\u00c0-\u024f]+/i)) {
    if (token.length < 3 || /\d/.test(token) || seen.has(token)) continue;
    seen.add(token);
    out.push(token);
  }
  return out;
}

export function backlinksFromEdges(
  targetId: string,
  norms: string[],
  edges: BrowserLinkEdge[],
  notes: Array<{ id: string; path: string; name: string; title: string; kind: string }>,
  limit: number,
): { rows: ShellBacklinkRow[]; total: number } {
  const want = new Set(norms.filter(Boolean));
  const byId = new Map(notes.map((note) => [note.id, note]));
  const sources = new Set<string>();
  for (const edge of edges) {
    if (edge.sourceId === targetId || !want.has(edge.targetNorm)) continue;
    const note = byId.get(edge.sourceId);
    if (note?.kind === "note") sources.add(edge.sourceId);
  }
  const size = Math.max(1, limit);
  const rows = [...sources]
    .map((id) => byId.get(id))
    .filter((note): note is NonNullable<typeof note> => Boolean(note))
    .sort((a, b) => a.title.localeCompare(b.title, undefined, { sensitivity: "base" }))
    .slice(0, size)
    .map((note) => ({
      fromId: note.id,
      fromPath: note.path,
      fromTitle: note.title || note.name.replace(/\.md$/i, ""),
    }));
  return { rows, total: sources.size };
}

export function tagCountsFromPairs(
  pairs: Array<{ tag: string }>,
  limit: number,
): ShellTagCount[] {
  const counts = new Map<string, number>();
  for (const pair of pairs) {
    const tag = pair.tag.trim().replace(/^#/, "").toLowerCase();
    if (!tag) continue;
    counts.set(tag, (counts.get(tag) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag))
    .slice(0, Math.max(1, limit));
}

export function tagNoteIds(pairs: BrowserTagPair[], tag: string, limit: number): string[] {
  const want = tag.trim().replace(/^#/, "").toLowerCase();
  if (!want) return [];
  return pairs
    .filter((pair) => pair.tag === want)
    .sort((a, b) => b.mtime - a.mtime)
    .slice(0, Math.max(1, limit))
    .map((pair) => pair.noteId);
}

/**
 * Neighborhood from link edges. Degree and draw caps match the desktop query.
 * Callers pass the catalog edges; the returned rows are the draw list.
 */
export function egoFromEdges(
  centerId: string,
  edges: BrowserLinkEdge[],
  records: BrowserShellRecord[],
  hops: number,
  maxNodes: number,
  degree: number,
): { rows: BrowserShellRecord[]; edges: ShellEdge[]; capped: boolean } {
  const hopLimit = Math.min(BROWSER_EGO_HOPS, Math.max(1, hops));
  const max = Math.min(BROWSER_EGO_MAX, Math.max(1, maxNodes));
  const deg = Math.max(1, degree);
  const byId = new Map(records.map((row) => [row.id, row]));
  if (!byId.has(centerId)) return { rows: [], edges: [], capped: false };
  const normToId = new Map<string, string>();
  for (const row of records) {
    if (row.kind !== "note") continue;
    for (const norm of noteIdentityNorms(row)) {
      if (!normToId.has(norm)) normToId.set(norm, row.id);
    }
  }
  const outgoing = new Map<string, string[]>();
  const incoming = new Map<string, string[]>();
  for (const edge of edges) {
    const target = normToId.get(edge.targetNorm);
    if (!target || target === edge.sourceId) continue;
    const outs = outgoing.get(edge.sourceId) ?? [];
    if (outs.length < deg && !outs.includes(target)) {
      outs.push(target);
      outgoing.set(edge.sourceId, outs);
    }
    const ins = incoming.get(target) ?? [];
    if (ins.length < deg && !ins.includes(edge.sourceId)) {
      ins.push(edge.sourceId);
      incoming.set(target, ins);
    }
  }
  const keep = [centerId];
  const have = new Set([centerId]);
  let frontier = [centerId];
  const raw: Array<[string, string]> = [];
  for (let hop = 0; hop < hopLimit; hop++) {
    if (keep.length >= max) break;
    const next: string[] = [];
    for (const id of frontier) {
      if (keep.length >= max) break;
      const neighbors = [...(outgoing.get(id) ?? []), ...(incoming.get(id) ?? [])];
      let used = 0;
      for (const nid of neighbors) {
        if (keep.length >= max || used >= deg * 2) break;
        used += 1;
        raw.push([id, nid]);
        if (!have.has(nid) && byId.has(nid)) {
          have.add(nid);
          keep.push(nid);
          next.push(nid);
        }
      }
    }
    frontier = next;
  }
  const rows = keep
    .map((id) => byId.get(id))
    .filter((row): row is BrowserShellRecord => Boolean(row));
  const seen = new Set<string>();
  const drawn: ShellEdge[] = [];
  for (const [source, target] of raw) {
    if (!have.has(source) || !have.has(target) || source === target) continue;
    const key = `${source}\n${target}`;
    if (seen.has(key)) continue;
    seen.add(key);
    drawn.push({ source, target });
  }
  return { rows, edges: drawn, capped: rows.length >= max };
}

export function pageSearchHits(
  postings: BrowserPosting[],
  notes: BrowserShellRecord[],
  query: string,
  limit: number,
): BrowserShellRecord[] {
  const tokens = catalogTokens(query);
  const size = Math.max(1, limit);
  if (!tokens.length) return [];
  const byId = new Map(notes.filter((row) => row.kind === "note").map((row) => [row.id, row]));
  let ids: Set<string> | null = null;
  for (const token of tokens) {
    const hit = new Set<string>();
    for (const posting of postings) {
      if (posting.token === token) hit.add(posting.noteId);
    }
    if (!ids) {
      ids = hit;
      continue;
    }
    const next = new Set<string>();
    for (const id of ids) {
      if (hit.has(id)) next.add(id);
    }
    ids = next;
  }
  const matched: string[] = [];
  if (ids) {
    for (const id of ids) matched.push(id);
  }
  return matched
    .map((id) => byId.get(id))
    .filter((row): row is BrowserShellRecord => Boolean(row))
    .sort((a, b) => a.title.localeCompare(b.title, undefined, { sensitivity: "base" }))
    .slice(0, size);
}

/** Catalog paths removed when `gone` is missing on disk. Descendants go with a folder. */
export function catalogPathsToDrop(catalogPaths: string[], gone: string[]): string[] {
  const targets = gone
    .map((path) => path.replace(/\\/g, "/").replace(/^\/+|\/+$/g, ""))
    .filter(Boolean);
  return catalogPaths.filter((path) => {
    const norm = path.replace(/\\/g, "/");
    return targets.some((target) => norm === target || norm.startsWith(`${target}/`));
  });
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
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      for (const name of [...db.objectStoreNames]) db.deleteObjectStore(name);
      const store = db.createObjectStore(STORE, { keyPath: "path" });
      store.createIndex("byParent", ["parentPath", "sortKind", "nameLower"]);
      store.createIndex("byKind", "kind");
      store.createIndex("byId", "id");
      store.createIndex("byMtime", "mtime");
      store.createIndex("byTitle", "titleLower");
      const edges = db.createObjectStore(EDGES, { keyPath: "key" });
      edges.createIndex("bySource", "sourceId");
      edges.createIndex("byTarget", "targetNorm");
      const tags = db.createObjectStore(TAGS, { keyPath: "key" });
      tags.createIndex("byTag", ["tag", "mtime"]);
      tags.createIndex("byNote", "noteId");
      db.createObjectStore(TAG_STATS, { keyPath: "tag" });
      const posts = db.createObjectStore(POSTINGS, { keyPath: "key" });
      posts.createIndex("byToken", "token");
      posts.createIndex("byNote", "noteId");
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

function eachCursor(
  source: IDBIndex | IDBObjectStore,
  range: IDBKeyRange | null,
  visit: (cursor: IDBCursorWithValue) => "stop" | "continue",
  direction?: IDBCursorDirection,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const cursorReq = source.openCursor(range, direction);
    cursorReq.onerror = () => reject(cursorReq.error);
    cursorReq.onsuccess = () => {
      const cursor = cursorReq.result;
      if (!cursor) {
        resolve();
        return;
      }
      if (visit(cursor) === "stop") {
        resolve();
        return;
      }
      cursor.continue();
    };
  });
}

function toSuggest(row: BrowserShellRecord): ShellSuggestHit {
  return {
    id: row.id,
    path: row.path,
    name: row.name,
    kind: row.kind,
    title: row.title,
    parentId: row.parentId,
    mtime: row.mtime,
  };
}

async function noteHead(file: File | null): Promise<string> {
  if (!file) return "";
  try {
    const blob = file.size > BROWSER_HEAD_CHARS * 4 ? file.slice(0, BROWSER_HEAD_CHARS * 4) : file;
    const text = await blob.text();
    return text.length > BROWSER_HEAD_CHARS ? text.slice(0, BROWSER_HEAD_CHARS) : text;
  } catch {
    return "";
  }
}

function appendNoteCatalog(
  row: BrowserShellRecord,
  head: string,
  tokenCounts: Map<string, number>,
  tagCounts: Map<string, number>,
  edges: EdgeRec[],
  tags: TagRec[],
  posts: PostRec[],
): void {
  const seenLink = new Set<string>();
  for (const raw of extractWikilinkTargets(head)) {
    if (seenLink.size >= 64) break;
    const norm = normalizeLinkTarget(raw);
    if (!norm || seenLink.has(norm)) continue;
    seenLink.add(norm);
    edges.push({ key: `${row.id}\0${norm}`, sourceId: row.id, targetNorm: norm });
  }
  let tagN = 0;
  for (const tag of extractTagsFromMarkdown(head)) {
    if (tagN >= 32) break;
    const clean = tag.trim().replace(/^#/, "").toLowerCase();
    if (!clean) continue;
    tagN += 1;
    tags.push({ key: `${clean}\0${row.id}`, tag: clean, noteId: row.id, mtime: row.mtime });
    tagCounts.set(clean, (tagCounts.get(clean) ?? 0) + 1);
  }
  const seen = new Set<string>();
  const take = (token: string, fromTitle: boolean) => {
    if (seen.has(token)) return;
    const count = tokenCounts.get(token) ?? 0;
    const cap = fromTitle ? BROWSER_POSTING_CAP * 2 : BROWSER_POSTING_CAP;
    if (count >= cap) return;
    seen.add(token);
    tokenCounts.set(token, count + 1);
    posts.push({ key: `${token}\0${row.id}`, token, noteId: row.id });
  };
  for (const token of catalogTokens(`${row.title} ${row.path}`).slice(0, 12)) take(token, true);
  for (const token of catalogTokens(head).slice(0, 24)) take(token, false);
}

async function putCatalogChunk(chunk: {
  rows: BrowserShellRecord[];
  edges: EdgeRec[];
  tags: TagRec[];
  posts: PostRec[];
}): Promise<void> {
  if (!chunk.rows.length && !chunk.edges.length && !chunk.tags.length && !chunk.posts.length) return;
  const db = await openDb();
  try {
    const tx = db.transaction([STORE, EDGES, TAGS, POSTINGS], "readwrite");
    const rows = tx.objectStore(STORE);
    const edges = tx.objectStore(EDGES);
    const tags = tx.objectStore(TAGS);
    const posts = tx.objectStore(POSTINGS);
    for (const row of chunk.rows) rows.put(row);
    for (const edge of chunk.edges) edges.put(edge);
    for (const tag of chunk.tags) tags.put(tag);
    for (const post of chunk.posts) posts.put(post);
    await txDone(tx);
  } finally {
    db.close();
  }
}

async function writeTagStats(counts: Map<string, number>): Promise<void> {
  if (!counts.size) return;
  const db = await openDb();
  try {
    const tx = db.transaction(TAG_STATS, "readwrite");
    const store = tx.objectStore(TAG_STATS);
    for (const [tag, count] of counts) store.put({ tag, count } satisfies TagStatRec);
    await txDone(tx);
  } finally {
    db.close();
  }
}

async function resolveNorm(rows: IDBObjectStore, norm: string): Promise<string | null> {
  const titled = (await req(rows.index("byTitle").get(norm))) as BrowserShellRecord | undefined;
  if (titled?.kind === "note") return titled.id;
  const direct = (await req(rows.get(norm))) as BrowserShellRecord | undefined;
  if (direct?.kind === "note") return direct.id;
  const withMd = (await req(rows.get(norm.endsWith(".md") ? norm : `${norm}.md`))) as
    | BrowserShellRecord
    | undefined;
  return withMd?.kind === "note" ? withMd.id : null;
}

async function queryEgo(centerId: string, hops: number, maxNodes: number): Promise<ShellEgo> {
  const hopLimit = Math.min(BROWSER_EGO_HOPS, Math.max(1, hops));
  const max = Math.min(BROWSER_EGO_MAX, Math.max(1, maxNodes));
  const db = await openDb();
  try {
    const tx = db.transaction([STORE, EDGES], "readonly");
    const rows = tx.objectStore(STORE);
    const edges = tx.objectStore(EDGES);
    const center = (await req(rows.index("byId").get(centerId))) as BrowserShellRecord | undefined;
    if (!center) {
      await txDone(tx);
      return { centerId, rows: [], edges: [], capped: false };
    }
    const keep = [center];
    const have = new Set([center.id]);
    let frontier = [center];
    const raw: ShellEdge[] = [];
    for (let hop = 0; hop < hopLimit; hop++) {
      if (keep.length >= max) break;
      const next: BrowserShellRecord[] = [];
      for (const node of frontier) {
        if (keep.length >= max) break;
        const outgoing: string[] = [];
        const outNorms: string[] = [];
        await eachCursor(edges.index("bySource"), IDBKeyRange.only(node.id), (cursor) => {
          if (outNorms.length >= BROWSER_EGO_DEGREE) return "stop";
          outNorms.push((cursor.value as EdgeRec).targetNorm);
          return "continue";
        });
        for (const norm of outNorms) {
          if (outgoing.length >= BROWSER_EGO_DEGREE) break;
          const id = await resolveNorm(rows, norm);
          if (id && id !== node.id && !outgoing.includes(id)) outgoing.push(id);
        }
        const incoming: string[] = [];
        for (const norm of noteIdentityNorms(node)) {
          if (incoming.length >= BROWSER_EGO_DEGREE) break;
          await eachCursor(edges.index("byTarget"), IDBKeyRange.only(norm), (cursor) => {
            if (incoming.length >= BROWSER_EGO_DEGREE) return "stop";
            const sourceId = (cursor.value as EdgeRec).sourceId;
            if (sourceId !== node.id && !incoming.includes(sourceId)) incoming.push(sourceId);
            return "continue";
          });
        }
        for (const nid of [...outgoing, ...incoming]) {
          if (keep.length >= max) break;
          raw.push({ source: node.id, target: nid });
          if (have.has(nid)) continue;
          const row = (await req(rows.index("byId").get(nid))) as BrowserShellRecord | undefined;
          if (!row) continue;
          have.add(row.id);
          keep.push(row);
          next.push(row);
        }
      }
      frontier = next;
    }
    const seen = new Set<string>();
    const drawn: ShellEdge[] = [];
    for (const edge of raw) {
      if (!have.has(edge.source) || !have.has(edge.target) || edge.source === edge.target) continue;
      const key = `${edge.source}\n${edge.target}`;
      if (seen.has(key)) continue;
      seen.add(key);
      drawn.push(edge);
    }
    await txDone(tx);
    return {
      centerId,
      rows: keep.map(toShellRow),
      edges: drawn,
      capped: keep.length >= max,
    };
  } finally {
    db.close();
  }
}

async function queryBacklinks(id: string, limit: number): Promise<ShellBacklinkPage> {
  const size = Math.min(BROWSER_BACKLINK_LIMIT, Math.max(1, limit));
  const db = await openDb();
  try {
    const tx = db.transaction([STORE, EDGES], "readonly");
    const rows = tx.objectStore(STORE);
    const edges = tx.objectStore(EDGES);
    const target = (await req(rows.index("byId").get(id))) as BrowserShellRecord | undefined;
    if (!target) {
      await txDone(tx);
      return { rows: [], total: 0 };
    }
    const sources = new Set<string>();
    for (const norm of noteIdentityNorms(target)) {
      await eachCursor(edges.index("byTarget"), IDBKeyRange.only(norm), (cursor) => {
        const sourceId = (cursor.value as EdgeRec).sourceId;
        if (sourceId !== id) sources.add(sourceId);
        return "continue";
      });
    }
    const page: ShellBacklinkRow[] = [];
    for (const sourceId of sources) {
      if (page.length >= size) break;
      const src = (await req(rows.index("byId").get(sourceId))) as BrowserShellRecord | undefined;
      if (!src || src.kind !== "note") continue;
      page.push({
        fromId: src.id,
        fromPath: src.path,
        fromTitle: src.title || src.name.replace(/\.md$/i, ""),
      });
    }
    page.sort((a, b) => a.fromTitle.localeCompare(b.fromTitle, undefined, { sensitivity: "base" }));
    await txDone(tx);
    return { rows: page, total: sources.size };
  } finally {
    db.close();
  }
}

async function queryTags(limit: number): Promise<ShellTagCount[]> {
  const size = Math.min(BROWSER_TAG_LIMIT, Math.max(1, limit));
  const db = await openDb();
  try {
    const tx = db.transaction(TAG_STATS, "readonly");
    const all = (await req(tx.objectStore(TAG_STATS).getAll())) as TagStatRec[];
    await txDone(tx);
    return all
      .filter((row) => row.tag && row.count > 0)
      .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag))
      .slice(0, size);
  } finally {
    db.close();
  }
}

async function queryTagNotes(tag: string, limit: number): Promise<ShellRow[]> {
  const want = tag.trim().replace(/^#/, "").toLowerCase();
  const size = Math.max(1, Math.min(80, limit));
  if (!want) return [];
  const db = await openDb();
  try {
    const tx = db.transaction([TAGS, STORE], "readonly");
    const tags = tx.objectStore(TAGS);
    const rows = tx.objectStore(STORE);
    const ids: string[] = [];
    const range = IDBKeyRange.bound([want, 0], [want, Number.MAX_SAFE_INTEGER]);
    await eachCursor(
      tags.index("byTag"),
      range,
      (cursor) => {
        if (ids.length >= size) return "stop";
        ids.push((cursor.value as TagRec).noteId);
        return "continue";
      },
      "prev",
    );
    const out: ShellRow[] = [];
    for (const id of ids) {
      const row = (await req(rows.index("byId").get(id))) as BrowserShellRecord | undefined;
      if (row?.kind === "note") out.push(toShellRow(row));
    }
    await txDone(tx);
    return out;
  } finally {
    db.close();
  }
}

async function querySearch(query: string, limit: number): Promise<ShellSuggestHit[]> {
  const tokens = catalogTokens(query);
  const size = Math.max(1, limit);
  if (!tokens.length) return suggestRows(query, size);
  const db = await openDb();
  try {
    const tx = db.transaction([POSTINGS, STORE], "readonly");
    const posts = tx.objectStore(POSTINGS);
    const rows = tx.objectStore(STORE);
    const lists: string[][] = [];
    for (const token of tokens) {
      const ids: string[] = [];
      await eachCursor(posts.index("byToken"), IDBKeyRange.only(token), (cursor) => {
        if (ids.length >= Math.max(size * 25, BROWSER_POSTING_CAP)) return "stop";
        ids.push((cursor.value as PostRec).noteId);
        return "continue";
      });
      lists.push(ids);
    }
    lists.sort((a, b) => a.length - b.length);
    let acc = new Set(lists[0] ?? []);
    for (const list of lists.slice(1)) {
      const have = new Set(list);
      const next = new Set<string>();
      for (const id of acc) {
        if (have.has(id)) next.add(id);
      }
      acc = next;
    }
    const hits: ShellSuggestHit[] = [];
    for (const id of acc) {
      if (hits.length >= size) break;
      const row = (await req(rows.index("byId").get(id))) as BrowserShellRecord | undefined;
      if (!row || row.kind !== "note") continue;
      hits.push(toSuggest(row));
    }
    hits.sort((a, b) => a.title.localeCompare(b.title, undefined, { sensitivity: "base" }));
    await txDone(tx);
    return hits;
  } finally {
    db.close();
  }
}

async function pathIsMissing(root: FileSystemDirectoryHandle, rel: string): Promise<boolean> {
  const parts = rel.split("/").filter(Boolean);
  if (!parts.length) return false;
  const missing = (err: unknown) => (err as { name?: string }).name === "NotFoundError";
  try {
    let dir = root;
    for (let i = 0; i < parts.length - 1; i++) {
      dir = await dir.getDirectoryHandle(parts[i]!);
    }
    const leaf = parts[parts.length - 1]!;
    try {
      await dir.getFileHandle(leaf);
      return false;
    } catch (err) {
      if (!missing(err)) return false;
      try {
        await dir.getDirectoryHandle(leaf);
        return false;
      } catch (dirErr) {
        return missing(dirErr);
      }
    }
  } catch (err) {
    return missing(err);
  }
}

async function queryForget(paths: string[]): Promise<ShellForget> {
  const root = grantedRoot;
  if (!root) return { ids: [], paths: [] };
  const missing: string[] = [];
  for (const raw of paths) {
    const rel = raw.replace(/\\/g, "/").replace(/^\/+/, "");
    if (!rel || rel.split("/").some((seg) => seg.startsWith("."))) continue;
    if (await pathIsMissing(root, rel)) missing.push(rel);
  }
  if (!missing.length) return { ids: [], paths: [] };
  const db = await openDb();
  try {
    const tx = db.transaction([...CATALOG_STORES], "readwrite");
    const rows = tx.objectStore(STORE);
    const edges = tx.objectStore(EDGES);
    const tags = tx.objectStore(TAGS);
    const stats = tx.objectStore(TAG_STATS);
    const posts = tx.objectStore(POSTINGS);
    const victims: { id: string; path: string; norms: string[] }[] = [];
    const seen = new Set<string>();
    const take = (row: BrowserShellRecord) => {
      if (seen.has(row.id)) return;
      seen.add(row.id);
      victims.push({ id: row.id, path: row.path, norms: noteIdentityNorms(row) });
    };
    for (const rel of missing) {
      const exact = (await req(rows.get(rel))) as BrowserShellRecord | undefined;
      if (exact) take(exact);
      await eachCursor(rows, IDBKeyRange.bound(`${rel}/`, `${rel}/\uffff`), (cursor) => {
        take(cursor.value as BrowserShellRecord);
        return "continue";
      });
    }
    for (const victim of victims) {
      await eachCursor(edges.index("bySource"), IDBKeyRange.only(victim.id), (cursor) => {
        cursor.delete();
        return "continue";
      });
      for (const norm of victim.norms) {
        await eachCursor(edges.index("byTarget"), IDBKeyRange.only(norm), (cursor) => {
          cursor.delete();
          return "continue";
        });
      }
      const tagNames: string[] = [];
      await eachCursor(tags.index("byNote"), IDBKeyRange.only(victim.id), (cursor) => {
        tagNames.push((cursor.value as TagRec).tag);
        cursor.delete();
        return "continue";
      });
      for (const tag of tagNames) {
        const stat = (await req(stats.get(tag))) as TagStatRec | undefined;
        if (!stat) continue;
        if (stat.count <= 1) stats.delete(tag);
        else stats.put({ tag, count: stat.count - 1 });
      }
      await eachCursor(posts.index("byNote"), IDBKeyRange.only(victim.id), (cursor) => {
        cursor.delete();
        return "continue";
      });
      rows.delete(victim.path);
    }
    await txDone(tx);
    return { ids: victims.map((row) => row.id), paths: victims.map((row) => row.path) };
  } finally {
    db.close();
  }
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
    ego: (centerId, hops, maxNodes) => queryEgo(centerId, hops, maxNodes),
    note: async (id) => {
      const row = await byId(id);
      return row ? toShellRow(row) : null;
    },
    backlinks: (id, limit) => queryBacklinks(id, limit),
    tags: (limit) => queryTags(limit),
    tagNotes: (tag, limit) => queryTagNotes(tag, limit),
    suggest: (query, limit) => suggestRows(query, limit),
    search: (query, limit) => querySearch(query, limit),
    recent: (limit) => recentRows(limit),
    forget: (paths) => queryForget(paths),
  });
}

export async function closeBrowserShell(): Promise<void> {
  grantedRoot = null;
  registerBrowserShell(null);
  if (typeof indexedDB === "undefined") return;
  try {
    const db = await openDb();
    try {
      const tx = db.transaction([...CATALOG_STORES], "readwrite");
      for (const name of CATALOG_STORES) tx.objectStore(name).clear();
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
 * Link, tag, and search rows are written here. File text is not kept.
 * Throws the Chrome cap error when the folder is past the browser limit.
 */
export async function mountBrowserShell(
  root: FileSystemDirectoryHandle,
  preferPath?: string | null,
  onProgress?: (scanned: number) => void,
): Promise<ShellMount> {
  await closeBrowserShell();
  grantedRoot = root;
  const chunk = {
    rows: [] as BrowserShellRecord[],
    edges: [] as EdgeRec[],
    tags: [] as TagRec[],
    posts: [] as PostRec[],
  };
  const tokenCounts = new Map<string, number>();
  const tagCounts = new Map<string, number>();
  let scanned = 0;
  const flush = async () => {
    if (!chunk.rows.length && !chunk.edges.length && !chunk.tags.length && !chunk.posts.length) return;
    await putCatalogChunk({
      rows: chunk.rows.splice(0, chunk.rows.length),
      edges: chunk.edges.splice(0, chunk.edges.length),
      tags: chunk.tags.splice(0, chunk.tags.length),
      posts: chunk.posts.splice(0, chunk.posts.length),
    });
  };
  await walkCollect(
    root,
    async (path, name, _parent, file) => {
      const row = browserRecord(path, name, "note", file?.lastModified ?? 1);
      const head = await noteHead(file);
      chunk.rows.push(row);
      appendNoteCatalog(row, head, tokenCounts, tagCounts, chunk.edges, chunk.tags, chunk.posts);
      scanned += 1;
      if (chunk.rows.length >= 200) await flush();
      if (onProgress && scanned % 250 === 0) onProgress(scanned);
    },
    async (path, name) => {
      chunk.rows.push(browserRecord(path, name, "folder", 1));
      if (chunk.rows.length >= 200) await flush();
    },
    {
      maxNotes: CHROME_FSA_NOTE_CAP,
      skipGetFileAfter: undefined,
    },
  );
  await flush();
  await writeTagStats(tagCounts);
  if (onProgress) onProgress(scanned);
  const mount = await buildMount(preferPath ?? null);
  installRoutes();
  return mount;
}
