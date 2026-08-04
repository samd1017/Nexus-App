/**
 * Real local vault via File System Access API.
 * Notes are plain .md files on disk — Hermes-compatible.
 * Supports full scan + incremental re-read of changed paths only.
 * Wave C: pure path-patch tree merge when change set is small.
 */

import type { VaultNode } from "./types";
import { pathJoin } from "./types";
import {
  canPathPatchTree,
  shouldFullStructuralRescan,
} from "./rescan-policy";
import {
  applyNoteOpsToScan,
  expandPathsToNoteTargets,
  type NotePathOp,
} from "./path-patch";

const IDB_NAME = "noteapp-vault-handles-v2";
const IDB_STORE = "handles";
const HANDLE_KEY = "current";
const RECENTS_KEY = "recents";

export function isFileSystemAccessSupported(): boolean {
  return typeof window !== "undefined" && "showDirectoryPicker" in window;
}

function openIdb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, 2);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(IDB_STORE)) {
        db.createObjectStore(IDB_STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function saveDirectoryHandle(
  handle: FileSystemDirectoryHandle,
  meta: { id: string; name: string },
): Promise<void> {
  const db = await openIdb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, "readwrite");
    tx.objectStore(IDB_STORE).put({ handle, meta, savedAt: Date.now() }, HANDLE_KEY);
    const getReq = tx.objectStore(IDB_STORE).get(RECENTS_KEY);
    getReq.onsuccess = () => {
      const map =
        (getReq.result as Record<
          string,
          { handle: FileSystemDirectoryHandle; meta: { id: string; name: string } }
        >) || {};
      map[meta.id] = { handle, meta };
      tx.objectStore(IDB_STORE).put(map, RECENTS_KEY);
    };
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

export async function loadDirectoryHandle(): Promise<{
  handle: FileSystemDirectoryHandle;
  meta: { id: string; name: string };
} | null> {
  try {
    const db = await openIdb();
    const row = await new Promise<
      | {
          handle: FileSystemDirectoryHandle;
          meta: { id: string; name: string };
        }
      | undefined
    >((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, "readonly");
      const req = tx.objectStore(IDB_STORE).get(HANDLE_KEY);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    db.close();
    if (!row?.handle) return null;
    return row;
  } catch {
    return null;
  }
}

export async function loadRecentHandle(
  id: string,
): Promise<FileSystemDirectoryHandle | null> {
  try {
    const db = await openIdb();
    const map = await new Promise<
      Record<
        string,
        { handle: FileSystemDirectoryHandle; meta: { id: string; name: string } }
      >
    >((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, "readonly");
      const req = tx.objectStore(IDB_STORE).get(RECENTS_KEY);
      req.onsuccess = () => resolve(req.result || {});
      req.onerror = () => reject(req.error);
    });
    db.close();
    return map[id]?.handle ?? null;
  } catch {
    return null;
  }
}

export async function clearDirectoryHandle(): Promise<void> {
  try {
    const db = await openIdb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, "readwrite");
      tx.objectStore(IDB_STORE).delete(HANDLE_KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch {
    /* ignore */
  }
}

export async function ensurePermission(
  handle: FileSystemDirectoryHandle,
  mode: FileSystemPermissionMode = "readwrite",
): Promise<boolean> {
  try {
    const opts = { mode } as FileSystemHandlePermissionDescriptor;
    const q = await handle.queryPermission?.(opts);
    if (q === "granted") return true;
    const r = await handle.requestPermission?.(opts);
    return r === "granted";
  } catch {
    return false;
  }
}

export function fsaNodeId(path: string): string {
  return "fsa_" + path.replace(/[^a-zA-Z0-9._/-]+/g, "_");
}

function nodeId(path: string): string {
  return fsaNodeId(path);
}

const SKIP_DIRS = new Set([
  ".git",
  ".noteapp",
  "node_modules",
  ".trash",
  ".obsidian",
  ".vscode",
  ".idea",
]);

export interface VaultScan {
  nodes: Record<string, VaultNode>;
  rootIds: string[];
  signatures: Record<string, string>;
}

async function walkCollect(
  root: FileSystemDirectoryHandle,
  onFile: (
    path: string,
    name: string,
    parentPath: string,
    file: File,
    handle: FileSystemFileHandle,
  ) => Promise<void>,
  onDir: (path: string, name: string, parentPath: string) => void,
) {
  async function walk(dir: FileSystemDirectoryHandle, relPath: string) {
    for await (const [name, handle] of dir.entries()) {
      if (name === ".DS_Store" || name === "Thumbs.db") continue;
      if (handle.kind === "directory") {
        if (SKIP_DIRS.has(name) || name.startsWith(".")) continue;
        const path = relPath ? pathJoin(relPath, name) : name;
        onDir(path, name, relPath);
        await walk(handle as FileSystemDirectoryHandle, path);
      } else if (
        handle.kind === "file" &&
        name.toLowerCase().endsWith(".md")
      ) {
        const path = relPath ? pathJoin(relPath, name) : name;
        const fh = handle as FileSystemFileHandle;
        const file = await fh.getFile();
        await onFile(path, name, relPath, file, fh);
      }
    }
  }
  await walk(root, "");
}

export async function scanVault(
  root: FileSystemDirectoryHandle,
): Promise<VaultScan> {
  const nodes: Record<string, VaultNode> = {};
  const rootIds: string[] = [];
  const signatures: Record<string, string> = {};
  const folderIds = new Map<string, string>();

  await walkCollect(
    root,
    async (path, name, parentPath, file) => {
      const parentId = parentPath ? folderIds.get(parentPath) ?? null : null;
      const id = nodeId(path);
      const content = await file.text();
      nodes[id] = {
        id,
        path,
        name,
        kind: "note",
        parentId,
        mtime: file.lastModified,
        content,
      };
      signatures[path] = `${file.lastModified}:${file.size}`;
      if (!parentPath) rootIds.push(id);
    },
    (path, name, parentPath) => {
      const parentId = parentPath ? folderIds.get(parentPath) ?? null : null;
      const id = nodeId(path);
      folderIds.set(path, id);
      nodes[id] = {
        id,
        path,
        name,
        kind: "folder",
        parentId,
        mtime: Date.now(),
      };
      if (!parentPath) rootIds.push(id);
    },
  );

  rootIds.sort((a, b) => {
    const na = nodes[a];
    const nb = nodes[b];
    if (na.kind !== nb.kind) return na.kind === "folder" ? -1 : 1;
    return na.name.localeCompare(nb.name, undefined, { numeric: true, sensitivity: "base" });
  });

  return { nodes, rootIds, signatures };
}

/** Meta-only open — no note bodies. */
export async function scanVaultMeta(
  root: FileSystemDirectoryHandle,
  onProgress?: (scanned: number) => void,
): Promise<VaultScan> {
  const nodes: Record<string, VaultNode> = {};
  const rootIds: string[] = [];
  const signatures: Record<string, string> = {};
  const folderIds = new Map<string, string>();
  let scanned = 0;

  await walkCollect(
    root,
    async (path, name, parentPath, file) => {
      const parentId = parentPath ? folderIds.get(parentPath) ?? null : null;
      const id = nodeId(path);
      nodes[id] = {
        id,
        path,
        name,
        kind: "note",
        parentId,
        mtime: file.lastModified,
      };
      signatures[path] = `${file.lastModified}:${file.size}`;
      if (!parentPath) rootIds.push(id);
      scanned += 1;
      if (onProgress && scanned % 250 === 0) onProgress(scanned);
    },
    (path, name, parentPath) => {
      const parentId = parentPath ? folderIds.get(parentPath) ?? null : null;
      const id = nodeId(path);
      folderIds.set(path, id);
      nodes[id] = {
        id,
        path,
        name,
        kind: "folder",
        parentId,
        mtime: Date.now(),
      };
      if (!parentPath) rootIds.push(id);
    },
  );

  rootIds.sort((a, b) => {
    const na = nodes[a];
    const nb = nodes[b];
    if (na.kind !== nb.kind) return na.kind === "folder" ? -1 : 1;
    return na.name.localeCompare(nb.name, undefined, { numeric: true, sensitivity: "base" });
  });

  if (onProgress) onProgress(scanned);
  return { nodes, rootIds, signatures };
}

/** Lightweight signature map for change detection. */
export async function scanSignatures(
  root: FileSystemDirectoryHandle,
): Promise<Record<string, string>> {
  const signatures: Record<string, string> = {};
  await walkCollect(
    root,
    async (path, _name, _parentPath, file) => {
      signatures[path] = `${file.lastModified}:${file.size}`;
    },
    () => {},
  );
  return signatures;
}

export function signaturesChanged(
  a: Record<string, string>,
  b: Record<string, string>,
): boolean {
  const ak = Object.keys(a);
  const bk = Object.keys(b);
  if (ak.length !== bk.length) return true;
  for (const k of ak) {
    if (a[k] !== b[k]) return true;
  }
  return false;
}

/** Single-note body read (O(path depth), not full vault). */
export async function readNoteFile(
  root: FileSystemDirectoryHandle,
  path: string,
): Promise<string> {
  const file = await readFileAtPath(root, path);
  return file.text();
}

/**
 * Wave C — pure path-patch: mutate prev.nodes only for changed paths.
 */
export async function patchFsaVaultPaths(
  root: FileSystemDirectoryHandle,
  prev: VaultScan,
  paths: string[],
  opts?: { metaOnly?: boolean; nextSigs?: Record<string, string> },
): Promise<{ scan: VaultScan; changedPaths: string[] }> {
  const metaOnly = !!opts?.metaOnly;
  const nextSigs = opts?.nextSigs;
  const targets = expandPathsToNoteTargets(paths, {
    ...prev.signatures,
    ...(nextSigs ?? {}),
  });
  if (nextSigs) {
    for (const p of Object.keys(nextSigs)) {
      if (prev.signatures[p] === undefined) targets.add(p);
    }
  }

  const ops: NotePathOp[] = [];
  for (const notePath of targets) {
    try {
      const file = await readFileAtPath(root, notePath);
      const sig = `${file.lastModified}:${file.size}`;
      if (prev.signatures[notePath] === sig && prev.nodes[nodeId(notePath)]) {
        continue;
      }
      let content: string | undefined;
      if (!metaOnly) {
        content = await file.text();
      }
      ops.push({
        path: notePath,
        op: "upsert",
        sig,
        mtime: file.lastModified,
        ...(content !== undefined ? { content } : {}),
      });
    } catch {
      if (
        prev.signatures[notePath] !== undefined ||
        prev.nodes[nodeId(notePath)]
      ) {
        ops.push({ path: notePath, op: "delete" });
      }
    }
  }

  if (nextSigs) {
    for (const p of Object.keys(prev.signatures)) {
      if (nextSigs[p] === undefined && !ops.some((o) => o.path === p)) {
        ops.push({ path: p, op: "delete" });
      }
    }
  }

  const { scan, changedPaths } = applyNoteOpsToScan(prev, ops, nodeId);
  // Prefer authoritative nextSigs when provided (complete walk)
  const signatures = nextSigs
    ? { ...nextSigs }
    : scan.signatures;
  return {
    scan: {
      nodes: scan.nodes,
      rootIds: scan.rootIds,
      signatures,
    },
    changedPaths,
  };
}

/**
 * Incremental rescan — Wave C path-patch when !structural.
 */
export async function incrementalRescan(
  root: FileSystemDirectoryHandle,
  prev: VaultScan,
  opts?: { metaOnly?: boolean },
): Promise<{ scan: VaultScan; changedPaths: string[] }> {
  const metaOnly = !!opts?.metaOnly;
  const nextSigs = await scanSignatures(root);
  const changedPaths: string[] = [];

  const allPaths = new Set([
    ...Object.keys(prev.signatures),
    ...Object.keys(nextSigs),
  ]);
  for (const p of allPaths) {
    if (prev.signatures[p] !== nextSigs[p]) changedPaths.push(p);
  }

  const prevCount = Object.keys(prev.signatures).length;
  const nextCount = Object.keys(nextSigs).length;
  const structural =
    nextCount === 0 ||
    shouldFullStructuralRescan(changedPaths.length, prevCount, nextCount);

  if (structural) {
    const scan = metaOnly ? await scanVaultMeta(root) : await scanVault(root);
    return { scan, changedPaths: Object.keys(scan.signatures) };
  }

  // Wave C: always path-patch when we have a complete sig walk and !structural
  if (changedPaths.length > 0) {
    return patchFsaVaultPaths(root, prev, changedPaths, {
      metaOnly,
      nextSigs,
    });
  }

  return { scan: prev, changedPaths: [] };
}

// Silence unused import if tree-shaken differently
void canPathPatchTree;

async function readFileAtPath(
  root: FileSystemDirectoryHandle,
  path: string,
): Promise<File> {
  const parts = path.split("/").filter(Boolean);
  const fileName = parts.pop()!;
  let dir = root;
  for (const part of parts) {
    dir = await dir.getDirectoryHandle(part);
  }
  const fh = await dir.getFileHandle(fileName);
  return fh.getFile();
}

async function getDirAtPath(
  root: FileSystemDirectoryHandle,
  dirPath: string,
  create = false,
): Promise<FileSystemDirectoryHandle> {
  if (!dirPath) return root;
  const parts = dirPath.split("/").filter(Boolean);
  let cur = root;
  for (const part of parts) {
    cur = await cur.getDirectoryHandle(part, { create });
  }
  return cur;
}

export async function writeNoteFile(
  root: FileSystemDirectoryHandle,
  path: string,
  content: string,
): Promise<void> {
  const parts = path.split("/").filter(Boolean);
  const fileName = parts.pop()!;
  const dir = await getDirAtPath(root, parts.join("/"), true);
  const fileHandle = await dir.getFileHandle(fileName, { create: true });
  const writable = await fileHandle.createWritable();
  await writable.write(content);
  await writable.close();
}

export async function writeBinaryFile(
  root: FileSystemDirectoryHandle,
  path: string,
  data: BufferSource | Blob,
): Promise<void> {
  const parts = path.split("/").filter(Boolean);
  const fileName = parts.pop()!;
  const dir = await getDirAtPath(root, parts.join("/"), true);
  const fileHandle = await dir.getFileHandle(fileName, { create: true });
  const writable = await fileHandle.createWritable();
  await writable.write(data);
  await writable.close();
}

export async function readBinaryFile(
  root: FileSystemDirectoryHandle,
  path: string,
): Promise<Blob> {
  const file = await readFileAtPath(root, path);
  return file;
}

export async function createFolderOnDisk(
  root: FileSystemDirectoryHandle,
  path: string,
): Promise<void> {
  await getDirAtPath(root, path, true);
}

export async function deletePathOnDisk(
  root: FileSystemDirectoryHandle,
  path: string,
  kind: "folder" | "note",
): Promise<void> {
  const parts = path.split("/").filter(Boolean);
  const name = parts.pop()!;
  const dir = await getDirAtPath(root, parts.join("/"), false);
  await dir.removeEntry(name, { recursive: kind === "folder" });
}

export async function renamePathOnDisk(
  root: FileSystemDirectoryHandle,
  oldPath: string,
  newPath: string,
  kind: "folder" | "note",
  content?: string,
): Promise<void> {
  if (kind === "note") {
    let text = content;
    if (text == null) {
      const file = await readFileAtPath(root, oldPath);
      text = await file.text();
    }
    await writeNoteFile(root, newPath, text);
    await deletePathOnDisk(root, oldPath, "note");
    return;
  }
  const oldParts = oldPath.split("/").filter(Boolean);
  const oldName = oldParts.pop()!;
  const parent = await getDirAtPath(root, oldParts.join("/"), false);
  const oldDir = await parent.getDirectoryHandle(oldName);
  await getDirAtPath(root, newPath, true);
  for await (const [name, handle] of oldDir.entries()) {
    const from = pathJoin(oldPath, name);
    const to = pathJoin(newPath, name);
    if (handle.kind === "file") {
      const file = await (handle as FileSystemFileHandle).getFile();
      await writeNoteFile(root, to, await file.text());
    } else {
      await renamePathOnDisk(root, from, to, "folder");
    }
  }
  await parent.removeEntry(oldName, { recursive: true });
}

export async function pickVaultFolder(): Promise<FileSystemDirectoryHandle | null> {
  if (!isFileSystemAccessSupported()) return null;
  try {
    const handle = await window.showDirectoryPicker({
      id: "noteapp-vault",
      mode: "readwrite",
      startIn: "documents",
    });
    return handle;
  } catch {
    return null;
  }
}

/** List soft-deleted notes under `.trash/` (newest first). */
export async function listFsaTrash(
  root: FileSystemDirectoryHandle,
): Promise<Array<{ relPath: string; mtime: number }>> {
  const out: Array<{ relPath: string; mtime: number }> = [];
  try {
    const trash = await root.getDirectoryHandle(".trash", { create: false });
    for await (const [name, handle] of trash.entries()) {
      if (handle.kind !== "file") continue;
      if (!name.toLowerCase().endsWith(".md")) continue;
      const file = await (handle as FileSystemFileHandle).getFile();
      out.push({ relPath: `.trash/${name}`, mtime: file.lastModified });
    }
  } catch {
    /* no trash */
  }
  return out.sort((a, b) => b.mtime - a.mtime);
}
