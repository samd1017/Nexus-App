/**
 * Native desktop vault via Tauri 2 plugins (fs + dialog).
 * Path-based, Hermes-compatible plain Markdown on disk.
 * Only used when running inside the Tauri shell.
 */

import type { VaultNode } from "./types";
import { pathJoin } from "./types";
import type { VaultScan } from "./fs-adapter";

const ROOT_KEY = "nexus-desktop-vault-root";
const RECENTS_KEY = "nexus-desktop-vault-recents";

const SKIP_DIRS = new Set([
  ".git",
  ".noteapp",
  "node_modules",
  ".trash",
  ".obsidian",
  ".vscode",
  ".idea",
  "src-tauri",
  "dist",
  "dist-desktop",
  "target",
]);

function nodeId(path: string): string {
  return "desk_" + path.replace(/[^a-zA-Z0-9._/-]+/g, "_");
}

export function getDesktopVaultRoot(): string | null {
  try {
    return localStorage.getItem(ROOT_KEY);
  } catch {
    return null;
  }
}

export function setDesktopVaultRoot(root: string | null): void {
  try {
    if (root) localStorage.setItem(ROOT_KEY, root);
    else localStorage.removeItem(ROOT_KEY);
  } catch {
    /* ignore */
  }
}

export function loadDesktopRecents(): Array<{
  id: string;
  name: string;
  path: string;
}> {
  try {
    const raw = localStorage.getItem(RECENTS_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as Array<{ id: string; name: string; path: string }>;
  } catch {
    return [];
  }
}

export function pushDesktopRecent(entry: {
  id: string;
  name: string;
  path: string;
}): void {
  const list = loadDesktopRecents().filter((r) => r.id !== entry.id);
  list.unshift(entry);
  try {
    localStorage.setItem(RECENTS_KEY, JSON.stringify(list.slice(0, 10)));
  } catch {
    /* ignore */
  }
}

function basename(p: string): string {
  const parts = p.replace(/\\/g, "/").split("/").filter(Boolean);
  return parts[parts.length - 1] || p;
}

/** Join vault root + relative POSIX path (macOS / Linux; Windows uses \\ roots). */
function joinRoot(root: string, rel: string): string {
  if (!rel) return root;
  const isWin = /^[A-Za-z]:[\\/]/.test(root) || root.startsWith("\\\\");
  const sep = isWin ? "\\" : "/";
  const cleanRoot = root.replace(/[/\\]+$/, "");
  const cleanRel = rel.replace(/^[/\\]+/, "").replace(/[/\\]+/g, sep);
  return `${cleanRoot}${sep}${cleanRel}`;
}

export async function pickDesktopVaultFolder(): Promise<string | null> {
  const { open } = await import("@tauri-apps/plugin-dialog");
  const selected = await open({
    directory: true,
    multiple: false,
    recursive: true,
    title: "Open Nexus Vault",
  });
  if (selected == null) return null;
  const root = Array.isArray(selected) ? selected[0] : selected;
  if (!root || typeof root !== "string") return null;
  setDesktopVaultRoot(root);
  pushDesktopRecent({
    id: "desk-" + basename(root).replace(/[^a-zA-Z0-9]+/g, "-").toLowerCase(),
    name: basename(root),
    path: root,
  });
  return root;
}

async function walkNotes(
  root: string,
  relDir: string,
  onFile: (
    relPath: string,
    name: string,
    parentRel: string,
    abs: string,
    mtime: number,
    size: number,
  ) => Promise<void>,
  onDir: (relPath: string, name: string, parentRel: string) => void,
): Promise<void> {
  const { readDir, stat } = await import("@tauri-apps/plugin-fs");
  const absDir = joinRoot(root, relDir);
  let entries;
  try {
    entries = await readDir(absDir);
  } catch (err) {
    console.warn("[nexus] readDir failed", absDir, err);
    return;
  }
  for (const entry of entries) {
    const name = entry.name;
    if (!name || name === ".DS_Store" || name === "Thumbs.db") continue;
    if (entry.isDirectory) {
      if (SKIP_DIRS.has(name) || name.startsWith(".")) continue;
      const rel = relDir ? pathJoin(relDir, name) : name;
      onDir(rel, name, relDir);
      await walkNotes(root, rel, onFile, onDir);
    } else if (entry.isFile && name.toLowerCase().endsWith(".md")) {
      const rel = relDir ? pathJoin(relDir, name) : name;
      const abs = joinRoot(root, rel);
      try {
        const meta = await stat(abs);
        const mtime = meta.mtime
          ? typeof meta.mtime === "number"
            ? meta.mtime
            : new Date(meta.mtime).getTime()
          : Date.now();
        await onFile(rel, name, relDir, abs, mtime, Number(meta.size ?? 0));
      } catch (err) {
        console.warn("[nexus] stat/read skip", abs, err);
      }
    }
  }
}

export async function scanDesktopVault(root: string): Promise<VaultScan> {
  const { readTextFile } = await import("@tauri-apps/plugin-fs");
  const nodes: Record<string, VaultNode> = {};
  const rootIds: string[] = [];
  const signatures: Record<string, string> = {};
  const folderIds = new Map<string, string>();

  await walkNotes(
    root,
    "",
    async (path, name, parentPath, abs, mtime, size) => {
      const parentId = parentPath ? folderIds.get(parentPath) ?? null : null;
      const id = nodeId(path);
      let content = "";
      try {
        content = await readTextFile(abs);
      } catch (err) {
        console.warn("[nexus] readTextFile failed", abs, err);
        content = "";
      }
      nodes[id] = {
        id,
        path,
        name,
        kind: "note",
        parentId,
        mtime,
        content,
      };
      signatures[path] = `${mtime}:${size}`;
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
    return na.name.localeCompare(nb.name);
  });

  return { nodes, rootIds, signatures };
}

export async function scanDesktopSignatures(
  root: string,
): Promise<Record<string, string>> {
  const signatures: Record<string, string> = {};
  await walkNotes(
    root,
    "",
    async (path, _n, _p, _a, mtime, size) => {
      signatures[path] = `${mtime}:${size}`;
    },
    () => {},
  );
  return signatures;
}

export async function writeDesktopNote(
  root: string,
  relPath: string,
  content: string,
): Promise<void> {
  const { writeTextFile, mkdir } = await import("@tauri-apps/plugin-fs");
  const parts = relPath.replace(/\\/g, "/").split("/").filter(Boolean);
  parts.pop();
  if (parts.length) {
    const dir = joinRoot(root, parts.join("/"));
    await mkdir(dir, { recursive: true });
  }
  await writeTextFile(joinRoot(root, relPath), content);
}

export async function createDesktopFolder(
  root: string,
  relPath: string,
): Promise<void> {
  const { mkdir } = await import("@tauri-apps/plugin-fs");
  await mkdir(joinRoot(root, relPath), { recursive: true });
}

export async function deleteDesktopPath(
  root: string,
  relPath: string,
  kind: "folder" | "note",
): Promise<void> {
  const { remove } = await import("@tauri-apps/plugin-fs");
  await remove(joinRoot(root, relPath), { recursive: kind === "folder" });
}

export async function renameDesktopPath(
  root: string,
  oldRel: string,
  newRel: string,
  kind: "folder" | "note",
  content?: string,
): Promise<void> {
  const { rename, readTextFile } = await import("@tauri-apps/plugin-fs");
  if (kind === "note") {
    let text = content;
    if (text == null) {
      text = await readTextFile(joinRoot(root, oldRel));
    }
    await writeDesktopNote(root, newRel, text);
    await deleteDesktopPath(root, oldRel, "note");
    return;
  }
  const parentParts = newRel.replace(/\\/g, "/").split("/").filter(Boolean);
  parentParts.pop();
  if (parentParts.length) {
    await createDesktopFolder(root, parentParts.join("/"));
  }
  await rename(joinRoot(root, oldRel), joinRoot(root, newRel));
}

export async function openDesktopVaultAt(root: string): Promise<VaultScan> {
  setDesktopVaultRoot(root);
  return scanDesktopVault(root);
}

/** Poll-based watcher for desktop (no FileSystemObserver in WKWebView) */
export function startDesktopWatch(
  root: string,
  onChange: (scan: VaultScan) => void,
  intervalMs = 900,
): { stop: () => void; acknowledge: () => void } {
  let lastSig = "";
  let suppressUntil = 0;
  let timer: ReturnType<typeof setInterval> | null = null;
  let busy = false;

  const tick = async () => {
    if (busy || Date.now() < suppressUntil) return;
    busy = true;
    try {
      const sigs = await scanDesktopSignatures(root);
      const hash = JSON.stringify(sigs);
      if (hash !== lastSig) {
        lastSig = hash;
        const scan = await scanDesktopVault(root);
        onChange(scan);
      }
    } catch (err) {
      console.warn("[nexus] desktop watch tick failed", err);
    } finally {
      busy = false;
    }
  };

  void (async () => {
    try {
      const sigs = await scanDesktopSignatures(root);
      lastSig = JSON.stringify(sigs);
    } catch {
      lastSig = "";
    }
    timer = setInterval(() => void tick(), intervalMs);
  })();

  return {
    stop: () => {
      if (timer) clearInterval(timer);
      timer = null;
    },
    acknowledge: () => {
      suppressUntil = Date.now() + 1800;
      // refresh signature after own write so we don't thrash
      void scanDesktopSignatures(root)
        .then((s) => {
          lastSig = JSON.stringify(s);
        })
        .catch(() => {});
    },
  };
}


export async function writeDesktopBinary(
  root: string,
  relPath: string,
  data: Uint8Array,
): Promise<void> {
  const { writeFile, mkdir } = await import("@tauri-apps/plugin-fs");
  const parts = relPath.replace(/\\/g, "/").split("/").filter(Boolean);
  parts.pop();
  if (parts.length) {
    await mkdir(joinRoot(root, parts.join("/")), { recursive: true });
  }
  await writeFile(joinRoot(root, relPath), data);
}

export async function readDesktopBinary(
  root: string,
  relPath: string,
): Promise<Uint8Array> {
  const { readFile } = await import("@tauri-apps/plugin-fs");
  return readFile(joinRoot(root, relPath));
}

/** Native Finder/Explorer image picker (desktop shell). */
export async function pickDesktopImageFile(): Promise<{
  path: string;
  name: string;
  data: Uint8Array;
} | null> {
  const { open } = await import("@tauri-apps/plugin-dialog");
  const selected = await open({
    multiple: false,
    filters: [
      {
        name: "Images",
        extensions: ["png", "jpg", "jpeg", "gif", "webp", "svg", "bmp", "avif"],
      },
    ],
    title: "Choose image",
  });
  if (selected == null) return null;
  const path = Array.isArray(selected) ? selected[0] : selected;
  if (!path || typeof path !== "string") return null;
  const { readFile } = await import("@tauri-apps/plugin-fs");
  const data = await readFile(path);
  const name = path.replace(/\\/g, "/").split("/").pop() || "image.png";
  return { path, name, data };
}

export { joinRoot, basename as desktopBasename };
