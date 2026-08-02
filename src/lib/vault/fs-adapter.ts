/**
 * Real local vault via File System Access API.
 * Notes are plain .md files on disk — Hermes-compatible.
 */

import type { VaultNode } from "./types";
import { pathJoin } from "./types";

const IDB_NAME = "noteapp-vault-handles";
const IDB_STORE = "handles";
const HANDLE_KEY = "current";

export function isFileSystemAccessSupported(): boolean {
  return typeof window !== "undefined" && "showDirectoryPicker" in window;
}

function openIdb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, 1);
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
    const row = await new Promise<{
      handle: FileSystemDirectoryHandle;
      meta: { id: string; name: string };
    } | undefined>((resolve, reject) => {
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
  const opts = { mode } as FileSystemHandlePermissionDescriptor;
  const q = await handle.queryPermission?.(opts);
  if (q === "granted") return true;
  const r = await handle.requestPermission?.(opts);
  return r === "granted";
}

function nodeId(path: string): string {
  return "fsa_" + path.replace(/[^a-zA-Z0-9._/-]+/g, "_");
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

/** Recursively scan a directory for folders + .md notes */
export async function scanVault(
  root: FileSystemDirectoryHandle,
): Promise<VaultScan> {
  const nodes: Record<string, VaultNode> = {};
  const rootIds: string[] = [];
  const signatures: Record<string, string> = {};

  async function walk(
    dir: FileSystemDirectoryHandle,
    relPath: string,
    parentId: string | null,
  ) {
    for await (const [name, handle] of dir.entries()) {
      if (name === ".DS_Store" || name === "Thumbs.db") continue;
      if (handle.kind === "directory") {
        if (SKIP_DIRS.has(name) || name.startsWith(".")) continue;
        const path = relPath ? pathJoin(relPath, name) : name;
        const id = nodeId(path);
        nodes[id] = {
          id,
          path,
          name,
          kind: "folder",
          parentId,
          mtime: Date.now(),
        };
        if (parentId == null) rootIds.push(id);
        await walk(handle as FileSystemDirectoryHandle, path, id);
      } else if (handle.kind === "file" && name.toLowerCase().endsWith(".md")) {
        const path = relPath ? pathJoin(relPath, name) : name;
        const file = await (handle as FileSystemFileHandle).getFile();
        const content = await file.text();
        const id = nodeId(path);
        const mtime = file.lastModified;
        nodes[id] = {
          id,
          path,
          name,
          kind: "note",
          parentId,
          mtime,
          content,
        };
        signatures[path] = `${mtime}:${file.size}`;
        if (parentId == null) rootIds.push(id);
      }
    }
  }

  await walk(root, "", null);

  rootIds.sort((a, b) => {
    const na = nodes[a];
    const nb = nodes[b];
    if (na.kind !== nb.kind) return na.kind === "folder" ? -1 : 1;
    return na.name.localeCompare(nb.name);
  });

  return { nodes, rootIds, signatures };
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
      const parts = oldPath.split("/").filter(Boolean);
      const fileName = parts.pop()!;
      const dir = await getDirAtPath(root, parts.join("/"), false);
      const file = await (await dir.getFileHandle(fileName)).getFile();
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

export async function scanSignatures(
  root: FileSystemDirectoryHandle,
): Promise<Record<string, string>> {
  const signatures: Record<string, string> = {};

  async function walk(dir: FileSystemDirectoryHandle, relPath: string) {
    for await (const [name, handle] of dir.entries()) {
      if (name === ".DS_Store") continue;
      if (handle.kind === "directory") {
        if (SKIP_DIRS.has(name) || name.startsWith(".")) continue;
        const path = relPath ? pathJoin(relPath, name) : name;
        await walk(handle as FileSystemDirectoryHandle, path);
      } else if (handle.kind === "file" && name.toLowerCase().endsWith(".md")) {
        const path = relPath ? pathJoin(relPath, name) : name;
        const file = await (handle as FileSystemFileHandle).getFile();
        signatures[path] = `${file.lastModified}:${file.size}`;
      }
    }
  }

  await walk(root, "");
  return signatures;
}

export function signaturesChanged(
  a: Record<string, string>,
  b: Record<string, string>,
): boolean {
  const keysA = Object.keys(a);
  const keysB = Object.keys(b);
  if (keysA.length !== keysB.length) return true;
  for (const k of keysA) {
    if (a[k] !== b[k]) return true;
  }
  return false;
}
