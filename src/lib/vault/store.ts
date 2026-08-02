import { create } from "zustand";
import { persist } from "zustand/middleware";
import type {
  EditorMode,
  GraphMode,
  RecentVault,
  VaultMode,
  VaultNode,
  VaultSettings,
} from "./types";
import { DEFAULT_SETTINGS, noteTitle, parentPath, pathJoin } from "./types";
import { buildDemoVault, HERMES_SAMPLE_NOTE } from "./demo-vault";
import { preferCleanWrite } from "@/lib/markdown/serialize";
import { flushActiveEditors } from "@/lib/editor/flush";
import { slugifyTitle } from "@/lib/utils";
import {
  clearDirectoryHandle,
  createFolderOnDisk,
  deletePathOnDisk,
  ensurePermission,
  isFileSystemAccessSupported,
  loadDirectoryHandle,
  loadRecentHandle,
  pickVaultFolder,
  renamePathOnDisk,
  saveDirectoryHandle,
  scanVault,
  writeNoteFile,
} from "./fs-adapter";
import {
  createDesktopFolder,
  deleteDesktopPath,
  getDesktopVaultRoot,
  openDesktopVaultAt,
  pickDesktopVaultFolder,
  renameDesktopPath,
  setDesktopVaultRoot,
  writeDesktopNote,
} from "./tauri-adapter";
import { isDesktopShell, canOpenLocalVaultFolder } from "@/lib/platform";
import type { CloudProvider, CloudSession } from "@/lib/cloud/oauth";
import { getPrefs } from "@/lib/prefs/preferences";
import {
  beginCloudOAuth,
  disconnectCloud,
  loadCloudSession,
  providerLabel,
} from "@/lib/cloud/oauth";

const STORAGE_KEY = "noteapp-vault-v2";
const RECENT_KEY = "noteapp-recent-v2";

let fsaRoot: FileSystemDirectoryHandle | null = null;
let desktopRoot: string | null = null;
let desktopWatchAck: (() => void) | null = null;
let writeQueue: Promise<void> = Promise.resolve();
let watcherAck: ((dir: FileSystemDirectoryHandle) => Promise<void>) | null = null;
let lastExternalToastAt = 0;

export function getFsaRoot(): FileSystemDirectoryHandle | null {
  return fsaRoot;
}

export function getDesktopRoot(): string | null {
  return desktopRoot;
}

export function setWatcherAck(
  fn: ((dir: FileSystemDirectoryHandle) => Promise<void>) | null,
) {
  watcherAck = fn;
}

export function setDesktopWatchAck(fn: (() => void) | null) {
  desktopWatchAck = fn;
}

function isDiskVault(mode: VaultMode): boolean {
  return mode === "fsa" || mode === "desktop";
}

function loadRecents(): RecentVault[] {
  try {
    const raw = localStorage.getItem(RECENT_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as RecentVault[];
  } catch {
    return [];
  }
}

function saveRecents(list: RecentVault[]) {
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify(list.slice(0, 10)));
  } catch {
    /* ignore */
  }
}

function makeId(path: string): string {
  return (
    "n_" +
    path.replace(/[^a-zA-Z0-9]+/g, "_") +
    "_" +
    Math.random().toString(36).slice(2, 7)
  );
}

function stableId(path: string): string {
  return "n_" + path.replace(/[^a-zA-Z0-9]+/g, "_");
}

function queueDiskWrite(fn: () => Promise<void>) {
  writeQueue = writeQueue.then(fn).catch((err) => {
    console.error("[vault] disk write failed", err);
  });
  return writeQueue;
}

async function persistNoteIfFsa(path: string, content: string) {
  if (desktopRoot) {
    await writeDesktopNote(desktopRoot, path, content);
    desktopWatchAck?.();
    return;
  }
  if (!fsaRoot) return;
  await writeNoteFile(fsaRoot, path, content);
  if (watcherAck) await watcherAck(fsaRoot);
}

interface VaultStore {
  ready: boolean;
  vaultId: string | null;
  vaultName: string;
  vaultPath: string;
  mode: VaultMode;
  nodes: Record<string, VaultNode>;
  rootIds: string[];
  activeNoteId: string | null;
  settings: VaultSettings;
  expandedFolders: string[];
  lastExternalSync: number | null;
  dirtyNoteIds: string[];
  recentVaults: RecentVault[];
  commandOpen: boolean;
  toast: string | null;
  hermesTick: number;
  cloudSession: CloudSession | null;
  fsaSupported: boolean;
  connecting: boolean;

  bootstrap: () => Promise<void>;
  openDemoVault: () => void;
  openLocalVault: (name: string, seed?: ReturnType<typeof buildDemoVault>) => void;
  openFolderAsVault: () => Promise<void>;
  reopenRecentVault: (id: string) => Promise<void>;
  closeVault: () => void;
  setActiveNote: (id: string | null) => void;
  toggleFolder: (id: string) => void;
  setLeftOpen: (open: boolean) => void;
  setRightOpen: (open: boolean) => void;
  setEditorMode: (mode: EditorMode) => void;
  setGraphMode: (mode: GraphMode) => void;
  toggleEditorMode: () => void;
  toggleLeft: () => void;
  toggleRight: () => void;
  toggleGraphFullscreen: () => void;
  updateNoteContent: (
    id: string,
    content: string,
    opts?: { external?: boolean },
  ) => void;
  renameNode: (id: string, newName: string) => void;
  createNote: (parentId: string | null, title?: string) => string;
  createFolder: (parentId: string | null, name?: string) => string;
  deleteNode: (id: string) => void;
  moveNode: (id: string, newParentId: string | null) => void;
  setCommandOpen: (open: boolean) => void;
  setToast: (msg: string | null) => void;
  simulateHermesWrite: () => void;
  applyExternalSnapshot: (
    nodes: Record<string, VaultNode>,
    rootIds: string[],
  ) => void;
  getActiveNote: () => VaultNode | null;
  getChildren: (parentId: string | null) => VaultNode[];
  flushDirty: () => void;
  connectCloud: (provider: CloudProvider) => Promise<void>;
  disconnectCloud: () => void;
  refreshCloudSession: () => void;
}

function pushRecent(entry: RecentVault) {
  const list = loadRecents().filter((r) => r.id !== entry.id);
  list.unshift(entry);
  saveRecents(list);
  return list;
}

export const useVaultStore = create<VaultStore>()(
  persist(
    (set, get) => ({
      ready: false,
      vaultId: null,
      vaultName: "",
      vaultPath: "",
      mode: "demo",
      nodes: {},
      rootIds: [],
      activeNoteId: null,
      settings: { ...DEFAULT_SETTINGS },
      expandedFolders: [],
      lastExternalSync: null,
      dirtyNoteIds: [],
      recentVaults: [],
      commandOpen: false,
      toast: null,
      hermesTick: 0,
      cloudSession: null,
      fsaSupported: false,
      connecting: false,

      bootstrap: async () => {
        const recents = loadRecents();
        const fsaSupported = canOpenLocalVaultFolder();
        const cloudSession = loadCloudSession();
        set({
          recentVaults: recents,
          fsaSupported,
          cloudSession,
          ready: true,
        });

        // Desktop: reopen last Tauri vault path
        if (isDesktopShell() && getPrefs().openLastVault) {
          const root = getDesktopVaultRoot();
          if (root) {
            set({ connecting: true });
            try {
              desktopRoot = root;
              fsaRoot = null;
              const scan = await openDesktopVaultAt(root);
              const lastPath = get().settings.lastNotePath;
              const active =
                (lastPath &&
                  Object.values(scan.nodes).find((n) => n.path === lastPath)
                    ?.id) ||
                Object.values(scan.nodes).find((n) => n.kind === "note")?.id ||
                null;
              const name = root.split(/[/\\]/).filter(Boolean).pop() || "Vault";
              const vaultId =
                "desk-" + name.replace(/[^a-zA-Z0-9]+/g, "-").toLowerCase();
              const recents2 = pushRecent({
                id: vaultId,
                name,
                path: root,
                lastOpened: Date.now(),
                mode: "desktop",
              });
              set({
                vaultId,
                vaultName: name,
                vaultPath: root,
                mode: "desktop",
                nodes: scan.nodes,
                rootIds: scan.rootIds,
                activeNoteId: active,
                expandedFolders: Object.values(scan.nodes)
                  .filter((n) => n.kind === "folder")
                  .map((n) => n.id),
                recentVaults: recents2,
                connecting: false,
                dirtyNoteIds: [],
              });
              return;
            } catch {
              desktopRoot = null;
              set({ connecting: false });
            }
          }
        }

        if (!isDesktopShell() && isFileSystemAccessSupported() && getPrefs().openLastVault) {
          const saved = await loadDirectoryHandle();
          if (saved?.handle) {
            let ok = await ensurePermission(saved.handle, "readwrite");
            if (!ok) {
              // One more attempt after query — some browsers need gesture; keep welcome ready
              ok = await ensurePermission(saved.handle, "readwrite");
            }
            if (ok) {
              fsaRoot = saved.handle;
              set({ connecting: true });
              try {
                const scan = await scanVault(saved.handle);
                const lastPath = get().settings.lastNotePath;
                const active =
                  (lastPath &&
                    Object.values(scan.nodes).find((n) => n.path === lastPath)
                      ?.id) ||
                  Object.values(scan.nodes).find((n) => n.kind === "note")
                    ?.id ||
                  null;
                const recents2 = pushRecent({
                  id: saved.meta.id,
                  name: saved.meta.name,
                  path: saved.meta.name,
                  lastOpened: Date.now(),
                  mode: "fsa",
                });
                set({
                  vaultId: saved.meta.id,
                  vaultName: saved.meta.name,
                  vaultPath: saved.meta.name,
                  mode: "fsa",
                  nodes: scan.nodes,
                  rootIds: scan.rootIds,
                  activeNoteId: active,
                  expandedFolders: Object.values(scan.nodes)
                    .filter((n) => n.kind === "folder")
                    .map((n) => n.id),
                  recentVaults: recents2,
                  connecting: false,
                  dirtyNoteIds: [],
                });
                return;
              } catch {
                fsaRoot = null;
                set({ connecting: false });
              }
            }
          }
        }

        const state = get();
        // Valid in-memory demo/local vault from persist
        if (
          state.vaultId &&
          state.mode !== "fsa" &&
          state.mode !== "desktop" &&
          Object.keys(state.nodes).length > 0
        ) {
          return;
        }

        // Welcome screen
        set({
          vaultId: null,
          vaultName: "",
          vaultPath: "",
          nodes: {},
          rootIds: [],
          activeNoteId: null,
        });
      },

      openDemoVault: () => {
        fsaRoot = null;
        desktopRoot = null;
        setDesktopVaultRoot(null);
        const demo = buildDemoVault();
        const vaultId = "demo-vault";
        const welcome = Object.values(demo.nodes).find(
          (n) => n.path === "Welcome.md",
        );
        const expanded = Object.values(demo.nodes)
          .filter((n) => n.kind === "folder")
          .map((n) => n.id);
        const recents = pushRecent({
          id: vaultId,
          name: demo.vaultName,
          path: "Demo Vault (in-browser)",
          lastOpened: Date.now(),
          mode: "demo",
        });
        set({
          vaultId,
          vaultName: demo.vaultName,
          vaultPath: "Demo Vault",
          mode: "demo",
          nodes: demo.nodes,
          rootIds: demo.rootIds,
          activeNoteId: welcome?.id ?? null,
          expandedFolders: expanded,
          dirtyNoteIds: [],
          lastExternalSync: null,
          recentVaults: recents,
          settings: {
            ...get().settings,
            lastNotePath: welcome?.path ?? null,
            editorMode: getPrefs().defaultEditorMode,
            graphMode: getPrefs().defaultGraphView,
            rightOpen: getPrefs().defaultGraphView === "panel",
          },
        });
      },

      openLocalVault: (name, seed) => {
        fsaRoot = null;
        desktopRoot = null;
        setDesktopVaultRoot(null);
        const data = seed ?? buildDemoVault();
        const vaultId =
          "local-" + slugifyTitle(name).toLowerCase().replace(/\s+/g, "-");
        const first = Object.values(data.nodes).find((n) => n.kind === "note");
        const recents = pushRecent({
          id: vaultId,
          name,
          path: name,
          lastOpened: Date.now(),
          mode: "local",
        });
        const prefs = getPrefs();
        set({
          vaultId,
          vaultName: name,
          vaultPath: name,
          mode: "local",
          nodes: data.nodes,
          rootIds: data.rootIds,
          activeNoteId: first?.id ?? null,
          expandedFolders: Object.values(data.nodes)
            .filter((n) => n.kind === "folder")
            .map((n) => n.id),
          dirtyNoteIds: [],
          recentVaults: recents,
          settings: {
            ...get().settings,
            editorMode: prefs.defaultEditorMode,
            graphMode: prefs.defaultGraphView,
            rightOpen: prefs.defaultGraphView === "panel",
            lastNotePath: first?.path ?? null,
          },
        });
      },

      openFolderAsVault: async () => {
        set({ connecting: true });
        try {
          if (isDesktopShell()) {
            const root = await pickDesktopVaultFolder();
            if (!root) {
              set({ connecting: false });
              return;
            }
            desktopRoot = root;
            fsaRoot = null;
            const scan = await openDesktopVaultAt(root);
            const name = root.split(/[/\\]/).filter(Boolean).pop() || "Vault";
            const vaultId =
              "desk-" + name.replace(/[^a-zA-Z0-9]+/g, "-").toLowerCase();
            const first = Object.values(scan.nodes).find((n) => n.kind === "note");
            const recents = pushRecent({
              id: vaultId,
              name,
              path: root,
              lastOpened: Date.now(),
              mode: "desktop",
            });
            set({
              vaultId,
              vaultName: name,
              vaultPath: root,
              mode: "desktop",
              nodes: scan.nodes,
              rootIds: scan.rootIds,
              activeNoteId: first?.id ?? null,
              expandedFolders: Object.values(scan.nodes)
                .filter((n) => n.kind === "folder")
                .map((n) => n.id),
              dirtyNoteIds: [],
              recentVaults: recents,
              connecting: false,
              toast: `Opened vault: ${name}`,
              settings: {
                ...get().settings,
                lastNotePath: first?.path ?? null,
                editorMode: getPrefs().defaultEditorMode,
                graphMode: getPrefs().defaultGraphView,
                rightOpen: getPrefs().defaultGraphView === "panel",
              },
            });
            return;
          }
          const handle = await pickVaultFolder();
          if (!handle) {
            set({ connecting: false });
            return;
          }
          const ok = await ensurePermission(handle, "readwrite");
          if (!ok) {
            set({
              connecting: false,
              toast: "Permission denied — cannot read vault folder",
            });
            return;
          }
          fsaRoot = handle;
          const vaultId =
            "fsa-" + handle.name.replace(/[^a-zA-Z0-9]+/g, "-").toLowerCase();
          await saveDirectoryHandle(handle, { id: vaultId, name: handle.name });
          const scan = await scanVault(handle);
          const first = Object.values(scan.nodes).find((n) => n.kind === "note");
          const recents = pushRecent({
            id: vaultId,
            name: handle.name,
            path: handle.name,
            lastOpened: Date.now(),
            mode: "fsa",
          });
          set({
            vaultId,
            vaultName: handle.name,
            vaultPath: handle.name,
            mode: "fsa",
            nodes: scan.nodes,
            rootIds: scan.rootIds,
            activeNoteId: first?.id ?? null,
            expandedFolders: Object.values(scan.nodes)
              .filter((n) => n.kind === "folder")
              .map((n) => n.id),
            dirtyNoteIds: [],
            recentVaults: recents,
            connecting: false,
            toast: `Opened vault: ${handle.name}`,
            settings: {
              ...get().settings,
              lastNotePath: first?.path ?? null,
              editorMode: getPrefs().defaultEditorMode,
              graphMode: getPrefs().defaultGraphView,
              rightOpen: getPrefs().defaultGraphView === "panel",
            },
          });
        } catch (e) {
          set({
            connecting: false,
            toast: e instanceof Error ? e.message : "Failed to open folder",
          });
        }
      },

      reopenRecentVault: async (id: string) => {
        if (isDesktopShell()) {
          const recent = get().recentVaults.find((r) => r.id === id);
          const root = recent?.path || getDesktopVaultRoot();
          if (!root || recent?.mode === "demo") {
            if (id === "demo-vault" || recent?.mode === "demo") {
              get().openDemoVault();
              return;
            }
            set({ toast: "Pick the vault folder again" });
            await get().openFolderAsVault();
            return;
          }
          set({ connecting: true });
          try {
            desktopRoot = root;
            fsaRoot = null;
            const scan = await openDesktopVaultAt(root);
            const name = root.split(/[/\\]/).filter(Boolean).pop() || "Vault";
            const first = Object.values(scan.nodes).find((n) => n.kind === "note");
            const recents = pushRecent({
              id,
              name,
              path: root,
              lastOpened: Date.now(),
              mode: "desktop",
            });
            set({
              vaultId: id,
              vaultName: name,
              vaultPath: root,
              mode: "desktop",
              nodes: scan.nodes,
              rootIds: scan.rootIds,
              activeNoteId: first?.id ?? null,
              expandedFolders: Object.values(scan.nodes)
                .filter((n) => n.kind === "folder")
                .map((n) => n.id),
              dirtyNoteIds: [],
              recentVaults: recents,
              connecting: false,
              toast: `Reopened vault: ${name}`,
            });
          } catch (e) {
            set({
              connecting: false,
              toast: e instanceof Error ? e.message : "Failed to reopen vault",
            });
          }
          return;
        }
        const handle = await loadRecentHandle(id);
        if (!handle) {
          set({ toast: "Re-select the folder to restore access" });
          await get().openFolderAsVault();
          return;
        }
        set({ connecting: true });
        try {
          const ok = await ensurePermission(handle, "readwrite");
          if (!ok) {
            set({ connecting: false, toast: "Permission needed — pick the folder again" });
            await get().openFolderAsVault();
            return;
          }
          fsaRoot = handle;
          const vaultId = id;
          await saveDirectoryHandle(handle, { id: vaultId, name: handle.name });
          const scan = await scanVault(handle);
          const first = Object.values(scan.nodes).find((n) => n.kind === "note");
          const recents = pushRecent({
            id: vaultId,
            name: handle.name,
            path: handle.name,
            lastOpened: Date.now(),
            mode: "fsa",
          });
          set({
            vaultId,
            vaultName: handle.name,
            vaultPath: handle.name,
            mode: "fsa",
            nodes: scan.nodes,
            rootIds: scan.rootIds,
            activeNoteId: first?.id ?? null,
            expandedFolders: Object.values(scan.nodes)
              .filter((n) => n.kind === "folder")
              .map((n) => n.id),
            dirtyNoteIds: [],
            recentVaults: recents,
            connecting: false,
            toast: `Reopened vault: ${handle.name}`,
          });
        } catch (e) {
          set({
            connecting: false,
            toast: e instanceof Error ? e.message : "Failed to reopen vault",
          });
        }
      },

      closeVault: () => {
        flushActiveEditors();
        fsaRoot = null;
        desktopRoot = null;
        setDesktopVaultRoot(null);
        void clearDirectoryHandle();
        set({
          vaultId: null,
          vaultName: "",
          vaultPath: "",
          mode: "demo",
          nodes: {},
          rootIds: [],
          activeNoteId: null,
          dirtyNoteIds: [],
          lastExternalSync: null,
          expandedFolders: [],
          settings: {
            ...get().settings,
            graphMode: "panel",
            editorMode: "visual",
          },
        });
      },

      setActiveNote: (id) => {
        // Flush dirty editor into the CURRENT note before changing selection
        flushActiveEditors();
        if (id === get().activeNoteId) return;
        const note = id ? get().nodes[id] : null;
        set({
          activeNoteId: id,
          settings: {
            ...get().settings,
            lastNotePath: note?.path ?? get().settings.lastNotePath,
          },
        });
      },

      toggleFolder: (id) => {
        const cur = get().expandedFolders;
        set({
          expandedFolders: cur.includes(id)
            ? cur.filter((x) => x !== id)
            : [...cur, id],
        });
      },

      setLeftOpen: (open) =>
        set({ settings: { ...get().settings, leftOpen: open } }),
      setRightOpen: (open) =>
        set({ settings: { ...get().settings, rightOpen: open } }),
      setEditorMode: (mode) => {
        flushActiveEditors();
        set({ settings: { ...get().settings, editorMode: mode } });
      },
      setGraphMode: (mode) =>
        set({ settings: { ...get().settings, graphMode: mode } }),

      toggleEditorMode: () => {
        flushActiveEditors();
        const cur = get().settings.editorMode;
        set({
          settings: {
            ...get().settings,
            editorMode: cur === "visual" ? "source" : "visual",
          },
        });
      },

      toggleLeft: () =>
        set({
          settings: { ...get().settings, leftOpen: !get().settings.leftOpen },
        }),
      toggleRight: () =>
        set({
          settings: {
            ...get().settings,
            rightOpen: !get().settings.rightOpen,
          },
        }),

      toggleGraphFullscreen: () => {
        const cur = get().settings.graphMode;
        set({
          settings: {
            ...get().settings,
            graphMode: cur === "fullscreen" ? "panel" : "fullscreen",
            rightOpen: true,
          },
        });
      },

      updateNoteContent: (id, content, opts) => {
        const node = get().nodes[id];
        if (!node || node.kind !== "note") return;
        const prev = node.content ?? "";
        const next = opts?.external ? content : preferCleanWrite(prev, content);
        if (prev === next) return;
        set({
          nodes: {
            ...get().nodes,
            [id]: { ...node, content: next, mtime: Date.now() },
          },
          dirtyNoteIds: opts?.external
            ? get().dirtyNoteIds.filter((x) => x !== id)
            : get().dirtyNoteIds.includes(id)
              ? get().dirtyNoteIds
              : [...get().dirtyNoteIds, id],
          lastExternalSync: opts?.external
            ? Date.now()
            : get().lastExternalSync,
        });
        if (!opts?.external && isDiskVault(get().mode)) {
          void queueDiskWrite(() => persistNoteIfFsa(node.path, next));
        }
      },

      renameNode: (id, newName) => {
        const node = get().nodes[id];
        if (!node) return;
        let name = newName.trim();
        if (!name) return;
        if (node.kind === "note" && !name.endsWith(".md")) name += ".md";
        const parent = parentPath(node.path);
        const newPath = parent ? pathJoin(parent, name) : name;
        if (newPath === node.path && name === node.name) return;
        const oldPath = node.path;
        const nodes = { ...get().nodes };
        const titleOnly = name.replace(/\.md$/i, "");
        let content = node.content;
        if (node.kind === "note" && typeof content === "string") {
          // Keep first markdown heading aligned with the filename title
          if (/^#\s+.+$/m.test(content)) {
            content = content.replace(/^#\s+.+$/m, `# ${titleOnly}`);
          } else {
            content = `# ${titleOnly}\n\n` + content.replace(/^\n+/, "");
          }
        }
        nodes[id] = {
          ...node,
          name,
          path: newPath,
          mtime: Date.now(),
          ...(node.kind === "note" ? { content } : {}),
        };
        if (node.kind === "folder") {
          const oldPrefix = node.path + "/";
          for (const n of Object.values(nodes)) {
            if (n.path.startsWith(oldPrefix)) {
              nodes[n.id] = {
                ...n,
                path: newPath + n.path.slice(node.path.length),
                mtime: Date.now(),
              };
            }
          }
        }
        set({ nodes });
        if (get().mode === "desktop" && desktopRoot) {
          const root = desktopRoot;
          void queueDiskWrite(async () => {
            await renameDesktopPath(
              root,
              oldPath,
              newPath,
              node.kind,
              node.kind === "note" ? (nodes[id].content ?? "") : undefined,
            );
            desktopWatchAck?.();
          });
        } else if (get().mode === "fsa" && fsaRoot) {
          const root = fsaRoot;
          void queueDiskWrite(async () => {
            await renamePathOnDisk(
              root,
              oldPath,
              newPath,
              node.kind,
              node.kind === "note" ? (nodes[id].content ?? "") : undefined,
            );
            if (watcherAck) await watcherAck(root);
          });
        }
      },

      createNote: (parentId, title = "Untitled") => {
        const parent = parentId ? get().nodes[parentId] : null;
        const base = slugifyTitle(title) || "Untitled";
        let name = base.endsWith(".md") ? base : `${base}.md`;
        let path = parent ? pathJoin(parent.path, name) : name;
        let i = 1;
        const paths = new Set(Object.values(get().nodes).map((n) => n.path));
        while (paths.has(path)) {
          const stem = base.replace(/\.md$/i, "");
          name = `${stem} ${i}.md`;
          path = parent ? pathJoin(parent.path, name) : name;
          i++;
        }
        const id =
          get().mode === "fsa"
            ? "fsa_" + path.replace(/[^a-zA-Z0-9._/-]+/g, "_")
            : get().mode === "desktop"
              ? "desk_" + path.replace(/[^a-zA-Z0-9._/-]+/g, "_")
              : makeId(path);
        const content = `# ${title.replace(/\.md$/i, "")}\n\n`;
        const node: VaultNode = {
          id,
          path,
          name,
          kind: "note",
          parentId,
          mtime: Date.now(),
          content,
        };
        const rootIds =
          parentId == null ? [...get().rootIds, id] : get().rootIds;
        const expanded = parentId
          ? get().expandedFolders.includes(parentId)
            ? get().expandedFolders
            : [...get().expandedFolders, parentId]
          : get().expandedFolders;
        set({
          nodes: { ...get().nodes, [id]: node },
          rootIds,
          activeNoteId: id,
          expandedFolders: expanded,
          dirtyNoteIds: [...get().dirtyNoteIds, id],
        });
        if (isDiskVault(get().mode)) {
          void queueDiskWrite(() => persistNoteIfFsa(path, content));
        }
        return id;
      },

      createFolder: (parentId, name = "New Folder") => {
        const parent = parentId ? get().nodes[parentId] : null;
        let folderName = slugifyTitle(name) || "New Folder";
        let path = parent ? pathJoin(parent.path, folderName) : folderName;
        const paths = new Set(Object.values(get().nodes).map((n) => n.path));
        let i = 1;
        while (paths.has(path)) {
          folderName = `${name} ${i}`;
          path = parent ? pathJoin(parent.path, folderName) : folderName;
          i++;
        }
        const id =
          get().mode === "fsa"
            ? "fsa_" + path.replace(/[^a-zA-Z0-9._/-]+/g, "_")
            : get().mode === "desktop"
              ? "desk_" + path.replace(/[^a-zA-Z0-9._/-]+/g, "_")
              : stableId(path) + "_" + Math.random().toString(36).slice(2, 6);
        const node: VaultNode = {
          id,
          path,
          name: folderName,
          kind: "folder",
          parentId,
          mtime: Date.now(),
        };
        const rootIds =
          parentId == null ? [...get().rootIds, id] : get().rootIds;
        set({
          nodes: { ...get().nodes, [id]: node },
          rootIds,
          expandedFolders: [...get().expandedFolders, id],
        });
        if (get().mode === "desktop" && desktopRoot) {
          const root = desktopRoot;
          void queueDiskWrite(async () => {
            await createDesktopFolder(root, path);
            desktopWatchAck?.();
          });
        } else if (get().mode === "fsa" && fsaRoot) {
          const root = fsaRoot;
          void queueDiskWrite(async () => {
            await createFolderOnDisk(root, path);
            if (watcherAck) await watcherAck(root);
          });
        }
        return id;
      },

      deleteNode: (id) => {
        const nodes = { ...get().nodes };
        const target = nodes[id];
        if (!target) return;
        if (getPrefs().confirmDelete) {
          const label = target.kind === "note" ? noteTitle(target) : target.name;
          const ok = window.confirm(`Delete "${label}"? This cannot be undone.`);
          if (!ok) return;
        }
        const toDelete = new Set<string>();
        const walk = (nid: string) => {
          toDelete.add(nid);
          for (const n of Object.values(nodes)) {
            if (n.parentId === nid) walk(n.id);
          }
        };
        walk(id);
        for (const d of toDelete) delete nodes[d];
        set({
          nodes,
          rootIds: get().rootIds.filter((r) => !toDelete.has(r)),
          activeNoteId: toDelete.has(get().activeNoteId ?? "")
            ? null
            : get().activeNoteId,
          expandedFolders: get().expandedFolders.filter((x) => !toDelete.has(x)),
        });
        if (get().mode === "desktop" && desktopRoot) {
          const root = desktopRoot;
          void queueDiskWrite(async () => {
            await deleteDesktopPath(root, target.path, target.kind);
            desktopWatchAck?.();
          });
        } else if (get().mode === "fsa" && fsaRoot) {
          const root = fsaRoot;
          void queueDiskWrite(async () => {
            await deletePathOnDisk(root, target.path, target.kind);
            if (watcherAck) await watcherAck(root);
          });
        }
      },

      moveNode: (id, newParentId) => {
        const node = get().nodes[id];
        if (!node || id === newParentId) return;
        if (newParentId) {
          let p: string | null = newParentId;
          while (p) {
            if (p === id) return;
            p = get().nodes[p]?.parentId ?? null;
          }
        }
        const parent = newParentId ? get().nodes[newParentId] : null;
        if (newParentId && parent?.kind !== "folder") return;
        const newPath = parent ? pathJoin(parent.path, node.name) : node.name;
        const oldPath = node.path;
        const nodes = { ...get().nodes };
        nodes[id] = {
          ...node,
          parentId: newParentId,
          path: newPath,
          mtime: Date.now(),
        };
        if (node.kind === "folder") {
          const oldPrefix = oldPath + "/";
          for (const n of Object.values(nodes)) {
            if (n.path.startsWith(oldPrefix)) {
              nodes[n.id] = {
                ...n,
                path: newPath + n.path.slice(oldPath.length),
              };
            }
          }
        }
        let rootIds = get().rootIds.filter((r) => r !== id);
        if (newParentId == null) rootIds = [...rootIds, id];
        set({ nodes, rootIds });
        if (get().mode === "desktop" && desktopRoot) {
          const root = desktopRoot;
          void queueDiskWrite(async () => {
            await renameDesktopPath(
              root,
              oldPath,
              newPath,
              node.kind,
              node.kind === "note" ? (nodes[id].content ?? "") : undefined,
            );
            desktopWatchAck?.();
          });
        } else if (get().mode === "fsa" && fsaRoot) {
          const root = fsaRoot;
          void queueDiskWrite(async () => {
            await renamePathOnDisk(
              root,
              oldPath,
              newPath,
              node.kind,
              node.kind === "note" ? (nodes[id].content ?? "") : undefined,
            );
            if (watcherAck) await watcherAck(root);
          });
        }
      },

      setCommandOpen: (open) => set({ commandOpen: open }),
      setToast: (msg) => set({ toast: msg }),

      simulateHermesWrite: () => {
        const { nodes, rootIds, mode } = get();
        const systems = Object.values(nodes).find(
          (n) => n.kind === "folder" && n.path === "Systems",
        );
        const path = HERMES_SAMPLE_NOTE.path;
        const existing = Object.values(nodes).find((n) => n.path === path);
        const content = HERMES_SAMPLE_NOTE.content.replace(
          "${TS}",
          new Date().toISOString(),
        );
        if (existing) {
          get().updateNoteContent(existing.id, content, { external: true });
          if (isDiskVault(mode)) {
            void queueDiskWrite(() => persistNoteIfFsa(path, content));
          }
          set({
            lastExternalSync: Date.now(),
            hermesTick: get().hermesTick + 1,
            toast: "Hermes updated Systems/Hermes Pulse.md",
            activeNoteId: existing.id,
          });
          return;
        }
        const id =
          mode === "fsa"
            ? "fsa_" + path.replace(/[^a-zA-Z0-9._/-]+/g, "_")
            : mode === "desktop"
              ? "desk_" + path.replace(/[^a-zA-Z0-9._/-]+/g, "_")
              : stableId(path);
        const node: VaultNode = {
          id,
          path,
          name: HERMES_SAMPLE_NOTE.name,
          kind: "note",
          parentId: systems?.id ?? null,
          mtime: Date.now(),
          content,
        };
        const nextRoots = systems == null ? [...rootIds, id] : rootIds;
        const expanded =
          systems && !get().expandedFolders.includes(systems.id)
            ? [...get().expandedFolders, systems.id]
            : get().expandedFolders;
        set({
          nodes: { ...nodes, [id]: node },
          rootIds: nextRoots,
          expandedFolders: expanded,
          lastExternalSync: Date.now(),
          hermesTick: get().hermesTick + 1,
          toast: "Hermes created Systems/Hermes Pulse.md",
          activeNoteId: id,
        });
        if (isDiskVault(mode)) {
          void queueDiskWrite(() => persistNoteIfFsa(path, content));
        }
      },

      applyExternalSnapshot: (nodes, rootIds) => {
        const prev = get().nodes;
        // Skip no-op snapshots (performance on large vaults)
        const prevSig = Object.values(prev)
          .filter((n) => n.kind === "note")
          .map((n) => `${n.path}:${n.mtime}:${(n.content ?? "").length}`)
          .sort()
          .join("|");
        const nextSig = Object.values(nodes)
          .filter((n) => n.kind === "note")
          .map((n) => `${n.path}:${n.mtime}:${(n.content ?? "").length}`)
          .sort()
          .join("|");
        if (prevSig === nextSig && get().rootIds.join() === rootIds.join()) {
          return;
        }
        const active = get().activeNoteId;
        const activePath = active ? prev[active]?.path : null;
        // Prefer re-select by path so FSA ids stay stable
        let nextActive = active && nodes[active] ? active : null;
        if (!nextActive && activePath) {
          nextActive =
            Object.values(nodes).find((n) => n.path === activePath)?.id ?? null;
        }
        // Preserve in-progress local edits on the active note when disk content is identical semantically
        if (
          nextActive &&
          prev[nextActive]?.content != null &&
          nodes[nextActive] &&
          get().dirtyNoteIds.includes(nextActive)
        ) {
          const disk = nodes[nextActive];
          const local = prev[nextActive];
          // If user has dirty local edits, keep local content until save lands
          nodes = {
            ...nodes,
            [nextActive]: { ...disk, content: local.content, mtime: local.mtime },
          };
        }
        const now = Date.now();
        const shouldToast = now - lastExternalToastAt > 2500;
        if (shouldToast) lastExternalToastAt = now;
        set({
          nodes,
          rootIds,
          lastExternalSync: now,
          activeNoteId: nextActive,
          toast: shouldToast ? "Vault updated from disk" : get().toast,
          expandedFolders: [
            ...new Set([
              ...get().expandedFolders.filter((id) => nodes[id]),
              ...Object.values(nodes)
                .filter((n) => n.kind === "folder")
                .map((n) => n.id)
                .filter((id) => get().expandedFolders.includes(id)),
            ]),
          ],
        });
      },

      getActiveNote: () => {
        const id = get().activeNoteId;
        if (!id) return null;
        return get().nodes[id] ?? null;
      },

      getChildren: (parentId) => {
        const all = Object.values(get().nodes).filter(
          (n) => n.parentId === parentId,
        );
        return all.sort((a, b) => {
          if (a.kind !== b.kind) return a.kind === "folder" ? -1 : 1;
          return a.name.localeCompare(b.name);
        });
      },

      flushDirty: () => {
        set({ dirtyNoteIds: [] });
        get().setToast("Saved");
      },

      connectCloud: async (provider) => {
        const result = await beginCloudOAuth(provider);
        set({
          cloudSession: result.session ?? loadCloudSession(),
          toast:
            result.reason ||
            `Use Open folder on your ${providerLabel(provider)} sync directory`,
        });
      },

      disconnectCloud: () => {
        disconnectCloud();
        set({ cloudSession: null, toast: "Cloud preference cleared" });
      },

      refreshCloudSession: () => {
        set({ cloudSession: loadCloudSession() });
      },
    }),
    {
      name: STORAGE_KEY,
      partialize: (s) => {
        const disk = s.mode === "fsa" || s.mode === "desktop";
        return {
          vaultId: disk ? null : s.vaultId,
          vaultName: disk ? "" : s.vaultName,
          vaultPath: disk ? "" : s.vaultPath,
          mode: disk ? "demo" : s.mode,
          nodes: disk ? {} : s.nodes,
          rootIds: disk ? [] : s.rootIds,
          activeNoteId: disk ? null : s.activeNoteId,
          settings: s.settings,
          expandedFolders: disk ? [] : s.expandedFolders,
        };
      },
    },
  ),
);

// Dev/QA hook — single store instance used by the UI
if (typeof window !== "undefined") {
  (window as unknown as { __NOTEAPP__?: { store: typeof useVaultStore } }).__NOTEAPP__ = {
    store: useVaultStore,
  };
}

export function getNoteDisplayTitle(node: VaultNode | null | undefined): string {
  if (!node) return "";
  return noteTitle(node);
}

export function getBreadcrumbs(
  node: VaultNode | null,
  nodes: Record<string, VaultNode>,
): string[] {
  if (!node) return [];
  const parts: string[] = [];
  let cur: VaultNode | undefined = node;
  while (cur) {
    parts.unshift(cur.kind === "note" ? noteTitle(cur) : cur.name);
    cur = cur.parentId ? nodes[cur.parentId] : undefined;
  }
  return parts;
}
