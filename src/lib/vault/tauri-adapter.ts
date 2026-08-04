/**
 * Native desktop vault via Tauri 2 plugins (fs + dialog).
 * Path-based, Hermes-compatible plain Markdown on disk.
 * Only used when running inside the Tauri shell.
 */

import type { VaultNode } from "./types";
import { pathJoin } from "./types";
import type { VaultScan } from "./fs-adapter";
import {
  canPathPatchTree,
  shouldFullStructuralRescan,
  shouldPathPatchOnly,
} from "./rescan-policy";
import {
  applyNoteOpsToScan,
  expandPathsToNoteTargets,
  type NotePathOp,
} from "./path-patch";

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
  // Reject path escape: absolute segments, .., drive letters, null bytes
  if (
    rel.includes("\0") ||
    /(?:^|[/\\])\.\.(?:[/\\]|$)/.test(rel) ||
    /^[A-Za-z]:[\\/]/.test(rel) ||
    rel.startsWith("\\\\") ||
    rel.startsWith("/")
  ) {
    throw new Error(`Invalid vault-relative path: ${rel}`);
  }
  const isWin = /^[A-Za-z]:[\\/]/.test(root) || root.startsWith("\\\\");
  const sep = isWin ? "\\" : "/";
  const cleanRoot = root.replace(/[/\\]+$/, "");
  const cleanRel = rel.replace(/^[/\\]+/, "").replace(/[/\\]+/g, sep);
  const joined = `${cleanRoot}${sep}${cleanRel}`;
  // Defense in depth: normalized join must stay under root
  const rootNorm = cleanRoot.toLowerCase().replace(/\\/g, "/");
  const joinNorm = joined.toLowerCase().replace(/\\/g, "/");
  if (joinNorm !== rootNorm && !joinNorm.startsWith(rootNorm + "/")) {
    throw new Error(`Path escapes vault root: ${rel}`);
  }
  return joined;
}

export async function pickDesktopVaultFolder(
  title = "Open Nexus Vault",
  opts?: { remember?: boolean },
): Promise<string | null> {
  const { open } = await import("@tauri-apps/plugin-dialog");
  const selected = await open({
    directory: true,
    multiple: false,
    recursive: true,
    title,
  });
  if (selected == null) return null;
  const root = Array.isArray(selected) ? selected[0] : selected;
  if (!root || typeof root !== "string") return null;
  if (opts?.remember !== false) {
    setDesktopVaultRoot(root);
    pushDesktopRecent({
      id: "desk-" + basename(root).replace(/[^a-zA-Z0-9]+/g, "-").toLowerCase(),
      name: basename(root),
      path: root,
    });
  }
  return root;
}

/** Create a new empty vault directory with a Welcome note. Returns absolute path. */
export async function createNewDesktopVault(
  parentDir: string,
  vaultName: string,
  welcomeMarkdown: string,
): Promise<string> {
  const { mkdir, writeTextFile, exists } = await import("@tauri-apps/plugin-fs");
  const isWin =
    /^[A-Za-z]:[\\/]/.test(parentDir) || parentDir.startsWith("\\\\");
  const sep = isWin ? "\\" : "/";
  const cleanParent = parentDir.replace(/[/\\]+$/, "");
  const safe =
    vaultName
      .trim()
      .replace(/[<>:"/\\|?*\u0000-\u001f]+/g, "-")
      .replace(/\s+/g, " ")
      .slice(0, 80)
      .trim() || "Nexus Vault";

  let vaultPath = `${cleanParent}${sep}${safe}`;
  let n = 2;
  while (await exists(vaultPath)) {
    vaultPath = `${cleanParent}${sep}${safe} ${n}`;
    n += 1;
    if (n > 50) throw new Error("Could not find a free vault folder name");
  }

  await mkdir(vaultPath, { recursive: true });
  await writeTextFile(`${vaultPath}${sep}Welcome.md`, welcomeMarkdown);
  setDesktopVaultRoot(vaultPath);
  pushDesktopRecent({
    id:
      "desk-" +
      basename(vaultPath).replace(/[^a-zA-Z0-9]+/g, "-").toLowerCase(),
    name: basename(vaultPath),
    path: vaultPath,
  });
  return vaultPath;
}

/** Reveal a path in Finder (macOS) / Explorer (Windows). */
export async function revealDesktopPath(path: string): Promise<void> {
  const { revealItemInDir } = await import("@tauri-apps/plugin-opener");
  await revealItemInDir(path);
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
  onProgress?: (scanned: number) => void,
  counter?: { n: number },
): Promise<void> {
  const { readDir, stat } = await import("@tauri-apps/plugin-fs");
  const count = counter ?? { n: 0 };
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
      await walkNotes(root, rel, onFile, onDir, onProgress, count);
    } else if (
      // Wave S3: only .md notes loaded; non-md files skipped during vault scans
      entry.isFile &&
      name.toLowerCase().endsWith(".md")
    ) {
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
        count.n += 1;
        if (onProgress && (count.n === 1 || count.n % 250 === 0)) {
          onProgress(count.n);
        }
      } catch (err) {
        console.warn("[nexus] stat/read skip", abs, err);
      }
    }
  }
  if (onProgress && !relDir) onProgress(count.n);
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
      let content: string | undefined;
      try {
        content = await readTextFile(abs);
      } catch (err) {
        console.warn("[nexus] readTextFile failed", abs, err);
        // Unloaded — never treat read failure as empty body (avoids wipe risk)
        content = undefined;
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

/** List soft-deleted notes under `.trash/` (newest first). */
export async function listDesktopTrash(
  root: string,
): Promise<Array<{ relPath: string; mtime: number }>> {
  try {
    const { readDir, stat } = await import("@tauri-apps/plugin-fs");
    const trashDir = joinRoot(root, ".trash");
    let entries;
    try {
      entries = await readDir(trashDir);
    } catch {
      return [];
    }
    const out: Array<{ relPath: string; mtime: number }> = [];
    for (const e of entries) {
      if (!e.name || e.isDirectory) continue;
      if (!e.name.toLowerCase().endsWith(".md")) continue;
      const full = joinRoot(root, pathJoin(".trash", e.name));
      let mtime = Date.now();
      try {
        const s = await stat(full);
        mtime = s.mtime
          ? typeof s.mtime === "number"
            ? s.mtime
            : new Date(s.mtime).getTime()
          : mtime;
      } catch {
        /* */
      }
      out.push({ relPath: `.trash/${e.name}`, mtime });
    }
    return out.sort((a, b) => b.mtime - a.mtime);
  } catch {
    return [];
  }
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
  const { rename, writeTextFile } = await import("@tauri-apps/plugin-fs");
  // Ensure destination parent exists, then atomic rename (notes + folders).
  const parentParts = newRel.replace(/\\/g, "/").split("/").filter(Boolean);
  parentParts.pop();
  if (parentParts.length) {
    await createDesktopFolder(root, parentParts.join("/"));
  }
  // If note content was updated (e.g. title heading sync), write to old path first
  if (kind === "note" && content != null) {
    await writeTextFile(joinRoot(root, oldRel), content);
  }
  await rename(joinRoot(root, oldRel), joinRoot(root, newRel));
}

/**
 * Wave A/1 — meta-only desktop vault scan (no body reads).
 * Notes omit content so ensureNoteBody hydrates on demand.
 */
export async function scanDesktopVaultMeta(
  root: string,
  onProgress?: (scanned: number) => void,
): Promise<VaultScan> {
  const nodes: Record<string, VaultNode> = {};
  const rootIds: string[] = [];
  const signatures: Record<string, string> = {};
  const folderIds = new Map<string, string>();

  await walkNotes(
    root,
    "",
    async (path, name, parentPath, _abs, mtime, size) => {
      const parentId = parentPath ? folderIds.get(parentPath) ?? null : null;
      const id = nodeId(path);
      nodes[id] = {
        id,
        path,
        name,
        kind: "note",
        parentId,
        mtime,
        // content omitted — unloaded
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
    onProgress,
  );

  rootIds.sort((a, b) => {
    const na = nodes[a];
    const nb = nodes[b];
    if (na.kind !== nb.kind) return na.kind === "folder" ? -1 : 1;
    return na.name.localeCompare(nb.name);
  });

  return { nodes, rootIds, signatures };
}

/** Flat meta listing for VaultBackend.walkMeta */
export async function scanDesktopMeta(root: string) {
  const scan = await scanDesktopVaultMeta(root);
  return Object.values(scan.nodes).map((n) => ({
    path: n.path,
    name: n.name,
    kind: n.kind as "folder" | "note",
    mtime: n.mtime,
  }));
}

/** Single-note body read (O(1) path, not full vault). */
export async function readDesktopNote(
  root: string,
  path: string,
): Promise<string> {
  const { readTextFile } = await import("@tauri-apps/plugin-fs");
  return readTextFile(joinRoot(root, path));
}

export async function openDesktopVaultAt(
  root: string,
  opts?: { metaOnly?: boolean; onProgress?: (scanned: number) => void },
): Promise<VaultScan> {
  setDesktopVaultRoot(root);
  if (opts?.metaOnly) return scanDesktopVaultMeta(root, opts.onProgress);
  return scanDesktopVault(root);
}

/**
 * Incremental desktop rescan — Wave C path-patch when !structural.
 * Falls back to full/meta scan on structural churn.
 */
export async function incrementalScanDesktopVault(
  root: string,
  prev: VaultScan,
  opts?: { metaOnly?: boolean },
): Promise<{ scan: VaultScan; changedPaths: string[] }> {
  const metaOnly = !!opts?.metaOnly;
  const nextSigs = await scanDesktopSignatures(root);
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
    const scan = metaOnly
      ? await scanDesktopVaultMeta(root)
      : await scanDesktopVault(root);
    return { scan, changedPaths: Object.keys(scan.signatures) };
  }

  // Wave C: pure path-patch (complete path set from signature walk)
  if (changedPaths.length > 0) {
    return patchDesktopVaultPaths(root, prev, changedPaths, { metaOnly });
  }

  return { scan: prev, changedPaths: [] };
}


/**
 * Wave B/C: path-level patch from native notify paths — no full signature walk.
 * Uses shared pure applyNoteOpsToScan for ID-stable tree merge.
 */
export async function patchDesktopVaultPaths(
  root: string,
  prev: VaultScan,
  paths: string[],
  opts?: { metaOnly?: boolean },
): Promise<{ scan: VaultScan; changedPaths: string[] }> {
  const metaOnly = !!opts?.metaOnly;
  const { readTextFile, stat, exists } = await import("@tauri-apps/plugin-fs");
  const targetNotes = expandPathsToNoteTargets(paths, prev.signatures);
  const ops: NotePathOp[] = [];

  for (const notePath of targetNotes) {
    const abs = joinRoot(root, notePath);
    let present = false;
    try {
      present = await exists(abs);
    } catch {
      present = false;
    }
    if (!present) {
      ops.push({ path: notePath, op: "delete" });
      continue;
    }
    try {
      const meta = await stat(abs);
      const mtime = meta.mtime
        ? typeof meta.mtime === "number"
          ? meta.mtime
          : new Date(meta.mtime).getTime()
        : Date.now();
      const size = typeof meta.size === "number" ? meta.size : 0;
      const sig = `${mtime}:${size}`;
      if (prev.signatures[notePath] === sig) continue;
      let content: string | undefined;
      if (!metaOnly) {
        content = await readTextFile(abs);
      }
      ops.push({
        path: notePath,
        op: "upsert",
        sig,
        mtime,
        ...(content !== undefined ? { content } : {}),
      });
    } catch (err) {
      console.warn("[nexus] path patch failed", notePath, err);
    }
  }

  const { scan, changedPaths } = applyNoteOpsToScan(prev, ops, nodeId);
  return {
    scan: {
      nodes: scan.nodes,
      rootIds: scan.rootIds,
      signatures: scan.signatures,
    },
    changedPaths,
  };
}

/** Prefer OS notify (Rust) with slow safety-net poll; fall back to 900ms poll. */
export function startDesktopWatch(
  root: string,
  onChange: (scan: VaultScan, changedPaths?: string[]) => void,
  intervalMs = 900,
  opts?: { metaOnly?: boolean },
): { stop: () => void; acknowledge: () => void } {
  const metaOnly = !!opts?.metaOnly;
  let lastSig = "";
  let lastScan: VaultScan | null = null;
  let suppressUntil = 0;
  let timer: ReturnType<typeof setInterval> | null = null;
  let busy = false;
  let stopped = false;
  let watchId: string | null = null;
  let unlisten: (() => void) | null = null;
  let usingNative = false;

  const runIncremental = async () => {
    if (busy || stopped || Date.now() < suppressUntil) return;
    busy = true;
    try {
      const sigs = await scanDesktopSignatures(root);
      const hash = JSON.stringify(sigs);
      if (hash === lastSig && lastScan) return;
      lastSig = hash;
      if (lastScan) {
        const { scan, changedPaths } = await incrementalScanDesktopVault(root, lastScan, {
          metaOnly,
        });
        lastScan = scan;
        onChange(scan, changedPaths);
      } else {
        const scan = metaOnly
          ? await scanDesktopVaultMeta(root)
          : await scanDesktopVault(root);
        lastScan = scan;
        onChange(scan);
      }
    } catch (err) {
      console.warn("[nexus] desktop watch tick failed", err);
    } finally {
      busy = false;
    }
  };

  const startPoll = (ms: number) => {
    if (timer) clearInterval(timer);
    timer = setInterval(() => void runIncremental(), ms);
  };

  void (async () => {
    try {
      const sigs = await scanDesktopSignatures(root);
      lastSig = JSON.stringify(sigs);
      lastScan = metaOnly
        ? await scanDesktopVaultMeta(root)
        : await scanDesktopVault(root);
    } catch {
      lastSig = "";
      lastScan = null;
    }
    if (stopped) return;

    // Try native OS notify (Tauri v3 index ping)
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      const { listen } = await import("@tauri-apps/api/event");
      const ping = await invoke<string>("vault_index_ping");
      if (typeof ping === "string" && ping.startsWith("nexus-vault-index")) {
        const started = await invoke<{ watchId: string }>("vault_watch_start", {
          root,
          metaOnly,
        });
        watchId = started?.watchId ?? null;
        if (watchId) {
          usingNative = true;
          unlisten = await listen<{
            watchId: string;
            kind: string;
            paths: string[];
          }>("nexus-vault-fs", (ev) => {
            if (stopped) return;
            const p = ev.payload;
            if (watchId && p.watchId && p.watchId !== watchId) return;
            // Wave B: path-patch on change; full incremental only on resync
            if (
              p.kind === "change" &&
              p.paths?.length &&
              lastScan &&
              shouldPathPatchOnly(p.paths.length)
            ) {
              void (async () => {
                if (busy || stopped || Date.now() < suppressUntil) return;
                busy = true;
                try {
                  const { scan, changedPaths } = await patchDesktopVaultPaths(
                    root,
                    lastScan!,
                    p.paths,
                    { metaOnly },
                  );
                  lastScan = scan;
                  // Soft-update signature hash from patch
                  lastSig = JSON.stringify(scan.signatures);
                  onChange(scan, changedPaths);
                } catch (err) {
                  console.warn("[nexus] path patch failed; falling back", err);
                  await runIncremental();
                } finally {
                  busy = false;
                }
              })();
              return;
            }
            void runIncremental();
          });
          // Slow safety-net poll (missed events / network FS)
          startPoll(Math.max(intervalMs * 20, 15000));
          return;
        }
      }
    } catch {
      usingNative = false;
    }

    // Fallback: classic poll
    startPoll(intervalMs);
  })();

  return {
    stop: () => {
      stopped = true;
      if (timer) clearInterval(timer);
      timer = null;
      try {
        unlisten?.();
      } catch {
        /* ignore */
      }
      unlisten = null;
      if (watchId) {
        const id = watchId;
        watchId = null;
        void import("@tauri-apps/api/core")
          .then(({ invoke }) => invoke("vault_watch_stop", { watchId: id }))
          .catch(() => {});
      }
    },
    acknowledge: () => {
      suppressUntil = Date.now() + 1800;
      void scanDesktopSignatures(root)
        .then((s) => {
          lastSig = JSON.stringify(s);
        })
        .catch(() => {});
      if (usingNative && watchId) {
        const id = watchId;
        void import("@tauri-apps/api/core")
          .then(({ invoke }) => invoke("vault_watch_ack", { watchId: id }))
          .catch(() => {});
      }
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
