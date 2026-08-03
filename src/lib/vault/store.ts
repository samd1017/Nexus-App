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
  createNewDesktopVault,
  deleteDesktopPath,
  getDesktopVaultRoot,
  openDesktopVaultAt,
  pickDesktopVaultFolder,
  renameDesktopPath,
  revealDesktopPath,
  setDesktopVaultRoot,
  writeDesktopNote,
} from "./tauri-adapter";
import { isDesktopShell, canOpenLocalVaultFolder, confirmDesktopShell } from "@/lib/platform";
import type { CloudProvider, CloudSession } from "@/lib/cloud/oauth";
import {
  buildPathIndex,
  collectFolderPaths,
  defaultNoteContent,
  ensureMdPath,
  pathToName,
  titleFromPath,
  uniquePath,
  type BulkImportInput,
  type BulkImportResult,
} from "./bulk";
import { getPrefs } from "@/lib/prefs/preferences";
import {
  beginCloudOAuth,
  disconnectCloud,
  loadCloudSession,
  providerLabel,
} from "@/lib/cloud/oauth";
import {
  buildDailyNoteContent,
  buildTemplateContent,
  dailyNotePath,
  dailyNoteTitle,
  formatDateISO,
  getTemplate,
  type NoteTemplateId,
} from "./templates";
import { loadNoteVisits, pushNoteVisit } from "./note-visits";
import {
  isOnlySerializationNoise,
  markdownFingerprint,
} from "@/lib/markdown/purity";
import { recordNoteVisit } from "./visit-history";
import { trackVisit } from "./session-recents";
import { pushNav } from "./nav-history";
import { pushPulse } from "./pulse";
import { ensureVaultIndex, vaultIndex } from "./indexes";

/** Nexus keys (Wave S5). Dual-read legacy noteapp-* on load; always write nexus-*. */
const STORAGE_KEY = "nexus-vault-v1";
const STORAGE_KEY_LEGACY = "noteapp-vault-v2";
const RECENT_KEY = "nexus-recent-v1";
const RECENT_KEY_LEGACY = "noteapp-recent-v2";

/** Copy legacy noteapp-* → nexus-* once when new key is absent. */
function migrateNamingKeys(): void {
  try {
    if (!localStorage.getItem(STORAGE_KEY)) {
      const legacy = localStorage.getItem(STORAGE_KEY_LEGACY);
      if (legacy) localStorage.setItem(STORAGE_KEY, legacy);
    }
    if (!localStorage.getItem(RECENT_KEY)) {
      const legacy = localStorage.getItem(RECENT_KEY_LEGACY);
      if (legacy) localStorage.setItem(RECENT_KEY, legacy);
    }
  } catch {
    /* ignore */
  }
}

if (typeof window !== "undefined") {
  migrateNamingKeys();
}


let fsaRoot: FileSystemDirectoryHandle | null = null;
let desktopRoot: string | null = null;
let desktopWatchAck: (() => void) | null = null;
let writeQueue: Promise<void> = Promise.resolve();
let watcherAck: ((dir: FileSystemDirectoryHandle) => Promise<void>) | null = null;
let lastExternalToastAt = 0;
let lastDiskResyncAt = 0;
let diskWriteError: string | null = null;

/** Coalesce rapid create/import storms (agent bulk writes). */
const CREATE_BATCH_MS = 48;
const DISK_ACK_MS = 120;
const EXTERNAL_DEBOUNCE_MS = 80;

type PendingDiskOp = () => Promise<void>;
let pendingDiskOps: PendingDiskOp[] = [];
let diskFlushTimer: ReturnType<typeof setTimeout> | null = null;
let externalSnapTimer: ReturnType<typeof setTimeout> | null = null;
let pendingExternal: {
  nodes: Record<string, VaultNode>;
  rootIds: string[];
} | null = null;
/** path → fingerprint of external body already shelved as .conflict-* */
const shelvedConflicts = new Map<string, string>();

type StageBuf = {
  nodes: Record<string, VaultNode>;
  rootIds: string[];
  expandedFolders: string[];
  dirtyNoteIds: string[];
  activeNoteId: string | null;
};
let stageBuf: StageBuf | null = null;
let stageTimer: ReturnType<typeof setTimeout> | null = null;

async function resyncFromDiskAfterError() {
  const now = Date.now();
  if (now - lastDiskResyncAt < 1500) return;
  lastDiskResyncAt = now;
  try {
    if (desktopRoot) {
      const scan = await openDesktopVaultAt(desktopRoot);
      useVaultStore.getState().applyExternalSnapshot(scan.nodes, scan.rootIds);
    } else if (fsaRoot) {
      const scan = await scanVault(fsaRoot);
      useVaultStore.getState().applyExternalSnapshot(scan.nodes, scan.rootIds);
    }
  } catch (err) {
    console.error("[vault] resync after write failure failed", err);
  }
}

function reportDiskError(label: string, err: unknown) {
  console.error("[vault] disk write failed", err);
  const msg = err instanceof Error ? err.message : "Unknown disk error";
  diskWriteError = msg;
  queueMicrotask(() => {
    try {
      useVaultStore.getState().setToast(`Could not ${label}: ${msg}`);
      void resyncFromDiskAfterError();
    } catch {
      /* ignore */
    }
  });
}

function queueDiskWrite(fn: () => Promise<void>, label = "save") {
  writeQueue = writeQueue.then(fn).catch((err) => reportDiskError(label, err));
  return writeQueue;
}

function flushDiskOps(): Promise<void> {
  if (diskFlushTimer) {
    clearTimeout(diskFlushTimer);
    diskFlushTimer = null;
  }
  const ops = pendingDiskOps;
  pendingDiskOps = [];
  if (!ops.length) return writeQueue;
  return queueDiskWrite(async () => {
    for (const op of ops) {
      try {
        await op();
      } catch (err) {
        reportDiskError("update vault files", err);
        throw err;
      }
    }
    if (desktopRoot) desktopWatchAck?.();
    else if (fsaRoot && watcherAck) await watcherAck(fsaRoot);
  }, "update vault files");
}

function enqueueDiskOp(op: PendingDiskOp, immediate = false) {
  pendingDiskOps.push(op);
  if (immediate) {
    flushDiskOps();
    return;
  }
  if (diskFlushTimer) clearTimeout(diskFlushTimer);
  diskFlushTimer = setTimeout(flushDiskOps, DISK_ACK_MS);
}

function beginStage(get: () => { nodes: Record<string, VaultNode>; rootIds: string[]; expandedFolders: string[]; dirtyNoteIds: string[]; activeNoteId: string | null }): StageBuf {
  if (!stageBuf) {
    stageBuf = {
      nodes: { ...get().nodes },
      rootIds: [...get().rootIds],
      expandedFolders: [...get().expandedFolders],
      dirtyNoteIds: [...get().dirtyNoteIds],
      activeNoteId: get().activeNoteId,
    };
  }
  return stageBuf;
}

function scheduleStageFlush(set: (partial: Record<string, unknown>) => void) {
  if (stageTimer) return;
  stageTimer = setTimeout(() => {
    stageTimer = null;
    const s = stageBuf;
    stageBuf = null;
    if (!s) return;
    set({
      nodes: s.nodes,
      rootIds: s.rootIds,
      expandedFolders: s.expandedFolders,
      dirtyNoteIds: s.dirtyNoteIds,
      activeNoteId: s.activeNoteId,
    });
  }, CREATE_BATCH_MS);
}

function flushStageNow(set: (partial: Record<string, unknown>) => void) {
  if (stageTimer) {
    clearTimeout(stageTimer);
    stageTimer = null;
  }
  const s = stageBuf;
  stageBuf = null;
  if (!s) return;
  set({
    nodes: s.nodes,
    rootIds: s.rootIds,
    expandedFolders: s.expandedFolders,
    dirtyNoteIds: s.dirtyNoteIds,
    activeNoteId: s.activeNoteId,
  });
}


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

/** Load recent vaults; dual-read legacy noteapp-recent-v2 → write nexus-recent-v1 (S5). */
function loadRecents(): RecentVault[] {
  try {
    const raw =
      localStorage.getItem(RECENT_KEY) ??
      localStorage.getItem(RECENT_KEY_LEGACY);
    if (!raw) return [];
    if (!localStorage.getItem(RECENT_KEY) && localStorage.getItem(RECENT_KEY_LEGACY)) {
      try {
        localStorage.setItem(RECENT_KEY, raw);
      } catch {
        /* ignore */
      }
    }
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

/** Wave 6: expand only ancestors of active note (+ top-level Journal) — not every folder */
function smartExpandedFolders(
  nodes: Record<string, VaultNode>,
  activeId: string | null,
): string[] {
  const out = new Set<string>();
  for (const n of Object.values(nodes)) {
    if (n.kind === "folder" && n.path === "Journal" && n.parentId == null) {
      out.add(n.id);
    }
  }
  let cur = activeId ? nodes[activeId] : null;
  while (cur?.parentId) {
    out.add(cur.parentId);
    cur = nodes[cur.parentId] ?? null;
  }
  return Array.from(out);
}


function stableId(path: string): string {
  return "n_" + path.replace(/[^a-zA-Z0-9]+/g, "_");
}


async function persistNoteIfFsa(
  path: string,
  content: string,
  opts?: { ack?: boolean },
) {
  const ack = opts?.ack !== false;
  if (desktopRoot) {
    await writeDesktopNote(desktopRoot, path, content);
    if (ack) desktopWatchAck?.();
    return;
  }
  if (!fsaRoot) return;
  await writeNoteFile(fsaRoot, path, content);
  if (ack && watcherAck) await watcherAck(fsaRoot);
}

/** Pending in-app delete confirm (window.confirm is blocked in many previews). */
export type PendingDelete = {
  id: string;
  kind: "note" | "folder";
  label: string;
};

/** Expand folder ancestors so the note is visible in the tree. */
function expandPathToNote(
  nodes: Record<string, VaultNode>,
  noteId: string | null,
): string[] {
  if (!noteId) return [];
  const out: string[] = [];
  let cur = nodes[noteId]?.parentId ?? null;
  while (cur) {
    out.push(cur);
    cur = nodes[cur]?.parentId ?? null;
  }
  return out;
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
  pendingDelete: PendingDelete | null;
  recentNoteVisits: string[];
  folderAccessLost: boolean;

  bootstrap: () => Promise<void>;
  openDemoVault: () => void;
  openLocalVault: (name: string, seed?: ReturnType<typeof buildDemoVault>) => void;
  openFolderAsVault: () => Promise<void>;
  createNewVault: (name?: string) => Promise<void>;
  revealVaultInFinder: () => Promise<void>;
  reopenRecentVault: (id: string) => Promise<void>;
  closeVault: () => void;
  setActiveNote: (id: string | null) => void;
  toggleFolder: (id: string) => void;
  setLeftOpen: (open: boolean) => void;
  setRightOpen: (open: boolean) => void;
  setLeftWidth: (w: number) => void;
  setRightWidth: (w: number) => void;
  setEditorMode: (mode: EditorMode) => void;
  setGraphMode: (mode: GraphMode) => void;
  toggleEditorMode: () => void;
  toggleLeft: () => void;
  toggleRight: () => void;
  toggleGraphFullscreen: () => void;
  updateNoteContent: (
    id: string,
    content: string,
    opts?: { external?: boolean; source?: boolean },
  ) => void;
  renameNode: (id: string, newName: string) => void;
  createNote: (
    parentId: string | null,
    title?: string,
    opts?: {
      activate?: boolean;
      template?: NoteTemplateId;
      content?: string;
      raw?: boolean;
    },
  ) => string;
  createFolder: (
    parentId: string | null,
    name?: string,
    opts?: { expand?: boolean },
  ) => string;
  createFromTemplate: (
    templateId: NoteTemplateId,
    parentId?: string | null,
  ) => string;
  openDailyNote: (opts?: { silent?: boolean }) => string;
  openDailyNoteForDate: (date: Date, opts?: { silent?: boolean }) => string;
  importBulk: (input: BulkImportInput) => BulkImportResult;
  deleteNode: (id: string) => void;
  requestDelete: (id: string) => void;
  confirmPendingDelete: () => void;
  cancelPendingDelete: () => void;
  moveNode: (id: string, newParentId: string | null) => void;
  setCommandOpen: (open: boolean) => void;
  setToast: (msg: string | null) => void;
  simulateHermesWrite: () => void;
  applyExternalSnapshot: (
    nodes: Record<string, VaultNode>,
    rootIds: string[],
  ) => void;
  _applyExternalSnapshotNow: (
    nodes: Record<string, VaultNode>,
    rootIds: string[],
  ) => void;
  getActiveNote: () => VaultNode | null;
  getChildren: (parentId: string | null) => VaultNode[];
  flushDirty: () => Promise<void>;
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

/**
 * Wave H / Habit Home: honor launch note preference after a vault is fully mounted.
 * Silent so we don't toast on every open.
 *
 * launchNoteMode:
 * - today: always open today's daily
 * - last: leave restored last note
 * - smart: open today when no active note, or active is a prior Journal daily
 *
 * openTodayOnLaunch remains as legacy mirror (true when mode is today/smart).
 */
function applyLaunchNotePreference(): void {
  try {
    const prefs = getPrefs();
    const mode =
      prefs.launchNoteMode ??
      (prefs.openTodayOnLaunch ? "today" : "last");
    if (mode === "last") return;
    const st = useVaultStore.getState();
    if (!st.vaultId) return;

    if (mode === "smart") {
      const activeId = st.activeNoteId;
      const active = activeId ? st.nodes[activeId] : null;
      const todayPath = dailyNotePath(new Date());
      // Already on today — nothing to do
      if (active?.kind === "note" && active.path === todayPath) return;
      // Keep non-daily notes (projects, etc.)
      if (
        active?.kind === "note" &&
        active.path &&
        !/^Journal\/\d{4}-\d{2}-\d{2}\.md$/.test(active.path)
      ) {
        return;
      }
      // No note, or a prior daily → open today
      st.openDailyNote({ silent: true });
      return;
    }

    // today
    st.openDailyNote({ silent: true });
  } catch {
    /* ignore */
  }
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
      pendingDelete: null,
      recentNoteVisits: loadNoteVisits(),
      folderAccessLost: false,

      bootstrap: async () => {
        const recents = loadRecents();
        const fsaSupported = canOpenLocalVaultFolder();
        const cloudSession = loadCloudSession();
        set({
          recentVaults: recents,
          recentNoteVisits: loadNoteVisits(),
          fsaSupported,
          cloudSession,
          ready: true,
          folderAccessLost: false,
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
                expandedFolders: smartExpandedFolders(scan.nodes, active),
                recentVaults: recents2,
                connecting: false,
                dirtyNoteIds: [],
              });
              applyLaunchNotePreference();
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
                  expandedFolders: smartExpandedFolders(scan.nodes, active),
                  recentVaults: recents2,
                  connecting: false,
                  dirtyNoteIds: [],
                });
                applyLaunchNotePreference();
                return;
              } catch {
                fsaRoot = null;
                set({
                  connecting: false,
                  folderAccessLost: true,
                  toast: "Folder access lost — click to re-open",
                });
              }
            } else {
              fsaRoot = null;
              set({
                folderAccessLost: true,
                toast: "Folder access lost — click to re-open",
              });
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
          applyLaunchNotePreference();
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
            // Wave G6: demo opens with graph panel visible
            graphMode: "panel",
            rightOpen: true,
          },
        });
        applyLaunchNotePreference();
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
          expandedFolders: smartExpandedFolders(data.nodes, first?.id ?? null),
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
        applyLaunchNotePreference();
      },

      openFolderAsVault: async () => {
        set({ connecting: true, folderAccessLost: false });
        try {
          const desktop = (await confirmDesktopShell()) || isDesktopShell();
          if (desktop) {
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
              expandedFolders: smartExpandedFolders(scan.nodes, first?.id ?? null),
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
            applyLaunchNotePreference();
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
            expandedFolders: smartExpandedFolders(scan.nodes, first?.id ?? null),
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
          applyLaunchNotePreference();
        } catch (e) {
          set({
            connecting: false,
            toast: e instanceof Error ? e.message : "Failed to open folder",
          });
        }
      },


      createNewVault: async (name) => {
        const vaultName = (name || "Nexus Vault").trim() || "Nexus Vault";
        const welcome = [
          "# Welcome",
          "",
          "This is your new **Nexus** vault.",
          "",
          "Notes are plain Markdown files in this folder. Type `[[` to link notes, switch Visual and Source, and open the graph to see connections.",
          "",
          "— Nexus · Notes for Humans and Agents",
          "",
        ].join("\n");
        set({ connecting: true });
        try {
          const desktop = (await confirmDesktopShell()) || isDesktopShell();
          if (desktop) {
            const parent = await pickDesktopVaultFolder(
              "Choose where to create the vault",
              { remember: false },
            );
            if (!parent) {
              set({ connecting: false });
              return;
            }
            const vaultPath = await createNewDesktopVault(
              parent,
              vaultName,
              welcome,
            );
            desktopRoot = vaultPath;
            fsaRoot = null;
            const scan = await openDesktopVaultAt(vaultPath);
            const nameOut =
              vaultPath.split(/[/\\]/).filter(Boolean).pop() || vaultName;
            const vaultId =
              "desk-" + nameOut.replace(/[^a-zA-Z0-9]+/g, "-").toLowerCase();
            const first = Object.values(scan.nodes).find((n) => n.kind === "note");
            const recents = pushRecent({
              id: vaultId,
              name: nameOut,
              path: vaultPath,
              lastOpened: Date.now(),
              mode: "desktop",
            });
            set({
              vaultId,
              vaultName: nameOut,
              vaultPath,
              mode: "desktop",
              nodes: scan.nodes,
              rootIds: scan.rootIds,
              activeNoteId: first?.id ?? null,
              expandedFolders: smartExpandedFolders(scan.nodes, first?.id ?? null),
              dirtyNoteIds: [],
              recentVaults: recents,
              connecting: false,
              toast: `Created vault: ${nameOut}`,
              settings: {
                ...get().settings,
                lastNotePath: first?.path ?? null,
                editorMode: getPrefs().defaultEditorMode,
                graphMode: getPrefs().defaultGraphView,
                rightOpen: getPrefs().defaultGraphView === "panel",
              },
            });
            applyLaunchNotePreference();
            return;
          }

          const parent = await pickVaultFolder();
          if (!parent) {
            set({ connecting: false });
            return;
          }
          const ok = await ensurePermission(parent, "readwrite");
          if (!ok) {
            set({
              connecting: false,
              toast: "Permission denied — cannot create vault",
            });
            return;
          }
          let childName = vaultName.replace(/[\\/]+/g, "-").slice(0, 80);
          let handle: FileSystemDirectoryHandle | null = null;
          for (let i = 0; i < 40; i++) {
            const tryName = i === 0 ? childName : `${childName} ${i + 1}`;
            try {
              handle = await parent.getDirectoryHandle(tryName, { create: true });
              childName = tryName;
              break;
            } catch {
              /* try next */
            }
          }
          if (!handle) {
            set({ connecting: false, toast: "Could not create vault folder" });
            return;
          }
          fsaRoot = handle;
          desktopRoot = null;
          await writeNoteFile(handle, "Welcome.md", welcome);
          const vaultId =
            "fsa-" + childName.replace(/[^a-zA-Z0-9]+/g, "-").toLowerCase();
          await saveDirectoryHandle(handle, { id: vaultId, name: childName });
          const scan = await scanVault(handle);
          const first = Object.values(scan.nodes).find((n) => n.kind === "note");
          const recents = pushRecent({
            id: vaultId,
            name: childName,
            path: childName,
            lastOpened: Date.now(),
            mode: "fsa",
          });
          set({
            vaultId,
            vaultName: childName,
            vaultPath: childName,
            mode: "fsa",
            nodes: scan.nodes,
            rootIds: scan.rootIds,
            activeNoteId: first?.id ?? null,
            expandedFolders: smartExpandedFolders(scan.nodes, first?.id ?? null),
            dirtyNoteIds: [],
            recentVaults: recents,
            connecting: false,
            toast: `Created vault: ${childName}`,
            settings: {
              ...get().settings,
              lastNotePath: first?.path ?? null,
              editorMode: getPrefs().defaultEditorMode,
              graphMode: getPrefs().defaultGraphView,
              rightOpen: getPrefs().defaultGraphView === "panel",
            },
          });
          applyLaunchNotePreference();
        } catch (e) {
          set({
            connecting: false,
            toast: e instanceof Error ? e.message : "Failed to create vault",
          });
        }
      },

      revealVaultInFinder: async () => {
        const { mode, vaultPath, vaultId } = get();
        if (!vaultId) {
          set({ toast: "No vault open" });
          return;
        }
        if (mode === "desktop" && vaultPath) {
          try {
            await revealDesktopPath(vaultPath);
          } catch (e) {
            set({
              toast:
                e instanceof Error
                  ? e.message
                  : "Could not reveal vault in Finder",
            });
          }
          return;
        }
        if (mode === "fsa") {
          set({
            toast:
              "In the browser, the vault is the folder you granted access to.",
          });
          return;
        }
        set({ toast: "Reveal is available for local folders on desktop" });
      },

      reopenRecentVault: async (id: string) => {
        const desktop = (await confirmDesktopShell()) || isDesktopShell();
        if (desktop) {
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
              expandedFolders: smartExpandedFolders(scan.nodes, first?.id ?? null),
              dirtyNoteIds: [],
              recentVaults: recents,
              connecting: false,
              toast: `Reopened vault: ${name}`,
            });
            applyLaunchNotePreference();
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
            expandedFolders: smartExpandedFolders(scan.nodes, first?.id ?? null),
            dirtyNoteIds: [],
            recentVaults: recents,
            connecting: false,
            toast: `Reopened vault: ${handle.name}`,
          });
          applyLaunchNotePreference();
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
          pendingDelete: null,
          settings: {
            ...get().settings,
            graphMode: "panel",
            editorMode: "visual",
          },
        });
      },

      setActiveNote: (id) => {
        flushStageNow(set as (p: Record<string, unknown>) => void);
        // Flush dirty editor into the CURRENT note before changing selection
        flushActiveEditors();
        if (id === get().activeNoteId) return;
        const note = id ? get().nodes[id] : null;
        const pathExpand = expandPathToNote(get().nodes, id);
        const expanded = new Set([...get().expandedFolders, ...pathExpand]);
        let recentNoteVisits = get().recentNoteVisits;
        if (typeof id === "string" && note?.kind === "note") {
          recentNoteVisits = pushNoteVisit(id, get().recentNoteVisits);
          trackVisit(id);
          pushNav(id);
          const vaultId = get().vaultId;
          if (vaultId && note.path) {
            recordNoteVisit(vaultId, id, note.path);
          }
        }
        set({
          activeNoteId: id,
          expandedFolders: Array.from(expanded),
          recentNoteVisits,
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
      setLeftWidth: (w) =>
        set({
          settings: {
            ...get().settings,
            leftWidth: Math.min(480, Math.max(200, Math.round(w))),
          },
        }),
      setRightWidth: (w) =>
        set({
          settings: {
            ...get().settings,
            rightWidth: Math.min(520, Math.max(260, Math.round(w))),
          },
        }),
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

      // Wave S1: content-only patch — spreads nodes[id] only; never rebuilds rootIds
      updateNoteContent: (id, content, opts) => {
        flushStageNow(set as (p: Record<string, unknown>) => void);

        const node = get().nodes[id];
        if (!node || node.kind !== "note") return;
        const prev = node.content ?? "";
        // Wave 1: Source intentional edits skip fingerprint purity gate
        const next = opts?.external
          ? content
          : opts?.source
            ? content
            : preferCleanWrite(prev, content);
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
        flushStageNow(set as (p: Record<string, unknown>) => void);
        const node = get().nodes[id];
        if (!node) return;
        let name = newName.trim();
        if (!name) return;
        if (node.kind === "note") {
          name = name.replace(/\.md$/i, "");
          if (!name) return;
          name = `${name}.md`;
        }
        const parent = parentPath(node.path);
        let newPath = parent ? pathJoin(parent, name) : name;
        if (newPath === node.path && name === node.name) return;
        const conflict = Object.values(get().nodes).find(
          (n) => n.id !== id && n.path === newPath,
        );
        if (conflict) {
          const stem = name.replace(/\.md$/i, "");
          const ext = node.kind === "note" ? ".md" : "";
          let i = 1;
          const paths = new Set(Object.values(get().nodes).map((n) => n.path));
          while (
            paths.has(
              parent
                ? pathJoin(parent, `${stem} ${i}${ext}`)
                : `${stem} ${i}${ext}`,
            )
          ) {
            i++;
          }
          name = `${stem} ${i}${ext}`;
          newPath = parent ? pathJoin(parent, name) : name;
          get().setToast(
            `Name in use — saved as ${name.replace(/\.md$/i, "")}`,
          );
        }
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


      createNote: (parentId, title = "Untitled", opts) => {
        const activate = opts?.activate !== false;
        const stage = beginStage(get);
        const parent = parentId ? stage.nodes[parentId] : null;
        const base = slugifyTitle(title) || "Untitled";
        let name = base.endsWith(".md") ? base : `${base}.md`;
        let path = parent ? pathJoin(parent.path, name) : name;
        let i = 1;
        const paths = new Set(Object.values(stage.nodes).map((n) => n.path));
        while (paths.has(path)) {
          const stem = base.replace(/\.md$/i, "");
          name = `${stem} ${i}.md`;
          path = parent ? pathJoin(parent.path, name) : name;
          i++;
        }
        // Always unique IDs — path-based ids collide after rename + create
        const id = makeId(path);
        const titleClean = title.replace(/\.md$/i, "");
        let content: string;
        if (opts?.raw && typeof opts.content === "string") {
          content = opts.content;
        } else if (typeof opts?.content === "string") {
          content = opts.content;
        } else if (opts?.template) {
          content = buildTemplateContent(opts.template, titleClean);
        } else {
          content = `# ${titleClean}\n\n`;
        }
        stage.nodes[id] = {
          id,
          path,
          name,
          kind: "note",
          parentId,
          mtime: Date.now(),
          content,
        };
        if (parentId == null && !stage.rootIds.includes(id)) {
          stage.rootIds = [...stage.rootIds, id];
        }
        if (parentId && !stage.expandedFolders.includes(parentId)) {
          stage.expandedFolders = [...stage.expandedFolders, parentId];
        }
        if (activate) {
          stage.activeNoteId = id;
          pushNoteVisit(id);
        }
        if (!stage.dirtyNoteIds.includes(id)) {
          stage.dirtyNoteIds = [...stage.dirtyNoteIds, id];
        }
        scheduleStageFlush(set as (p: Record<string, unknown>) => void);
        if (isDiskVault(get().mode)) {
          const pth = path;
          const body = content;
          enqueueDiskOp(async () => {
            await persistNoteIfFsa(pth, body, { ack: false });
          });
        }
        // Wave 3: skip pulse when non-activating (bulk-style creates)
        if (activate) {
          pushPulse({
            kind: "create",
            path,
            title: titleClean,
            message: `Created ${path}`,
          });
        }
        return id;
      },

      createFolder: (parentId, name = "New Folder", opts) => {
        const expand = opts?.expand !== false;
        const stage = beginStage(get);
        const parent = parentId ? stage.nodes[parentId] : null;
        let folderName = slugifyTitle(name) || "New Folder";
        let path = parent ? pathJoin(parent.path, folderName) : folderName;
        const paths = new Set(Object.values(stage.nodes).map((n) => n.path));
        let i = 1;
        while (paths.has(path)) {
          folderName = `${name} ${i}`;
          path = parent ? pathJoin(parent.path, folderName) : folderName;
          i++;
        }
        const id = makeId(path);
        stage.nodes[id] = {
          id,
          path,
          name: folderName,
          kind: "folder",
          parentId,
          mtime: Date.now(),
        };
        if (parentId == null && !stage.rootIds.includes(id)) {
          stage.rootIds = [...stage.rootIds, id];
        }
        if (expand && !stage.expandedFolders.includes(id)) {
          stage.expandedFolders = [...stage.expandedFolders, id];
        }
        scheduleStageFlush(set as (p: Record<string, unknown>) => void);
        if (get().mode === "desktop" && desktopRoot) {
          const root = desktopRoot;
          const pth = path;
          enqueueDiskOp(async () => {
            await createDesktopFolder(root, pth);
          });
        } else if (get().mode === "fsa" && fsaRoot) {
          const root = fsaRoot;
          const pth = path;
          enqueueDiskOp(async () => {
            await createFolderOnDisk(root, pth);
          });
        }
        return id;
      },

      createFromTemplate: (templateId, parentId = null) => {
        if (templateId === "daily") {
          return get().openDailyNote();
        }
        const tpl = getTemplate(templateId);
        const date = new Date();
        let parent = parentId ?? null;
        // Ensure preferred folder exists when no parent given
        if (parent == null && tpl.preferredFolder) {
          const folderPath = tpl.preferredFolder;
          const existing = Object.values(get().nodes).find(
            (n) => n.kind === "folder" && n.path === folderPath,
          );
          if (existing) {
            parent = existing.id;
          } else {
            // Create nested path parts
            let acc = "";
            let curParent: string | null = null;
            for (const part of folderPath.split("/").filter(Boolean)) {
              acc = acc ? `${acc}/${part}` : part;
              const hit = Object.values(get().nodes).find(
                (n) => n.kind === "folder" && n.path === acc,
              );
              if (hit) {
                curParent = hit.id;
              } else {
                curParent = get().createFolder(curParent, part, { expand: true });
              }
            }
            parent = curParent;
          }
        }
        const title = tpl.defaultTitle;
        const content = buildTemplateContent(templateId, title, date);
        return get().createNote(parent, title, { content, raw: true });
      },

      openDailyNote: (opts) => {
        return get().openDailyNoteForDate(new Date(), opts);
      },

      openDailyNoteForDate: (date, opts) => {
        const silent = opts?.silent === true;
        const target = new Date(
          date.getFullYear(),
          date.getMonth(),
          date.getDate(),
        );
        const path = dailyNotePath(target);
        const existing = Object.values(get().nodes).find(
          (n) => n.kind === "note" && n.path === path,
        );
        const today = new Date();
        const isToday =
          target.getFullYear() === today.getFullYear() &&
          target.getMonth() === today.getMonth() &&
          target.getDate() === today.getDate();
        if (existing) {
          get().setActiveNote(existing.id);
          if (!silent) {
            get().setToast(
              isToday
                ? "Opened today's daily note"
                : `Opened daily note ${formatDateISO(target)}`,
            );
          }
          return existing.id;
        }
        // Ensure Journal folder — use returned id (stage may not be flushed yet)
        const existingJournal = Object.values(get().nodes).find(
          (n) => n.kind === "folder" && n.path === "Journal",
        );
        let journalId: string | null = existingJournal?.id ?? null;
        if (!journalId) {
          journalId = get().createFolder(null, "Journal", { expand: true });
        }
        // H4: carry open loops from yesterday when creating today's daily
        let yesterdayMarkdown: string | null = null;
        if (isToday) {
          const y = new Date(target);
          y.setDate(y.getDate() - 1);
          const yPath = dailyNotePath(y);
          const yNote = Object.values(get().nodes).find(
            (n) => n.kind === "note" && n.path === yPath,
          );
          yesterdayMarkdown = yNote?.content ?? null;
        }
        const content = buildDailyNoteContent(target, yesterdayMarkdown);
        const id = get().createNote(journalId, dailyNoteTitle(target), {
          content,
          raw: true,
        });
        if (!silent) {
          get().setToast(
            isToday
              ? "Created today's daily note"
              : `Created daily note ${formatDateISO(target)}`,
          );
        }
        return id;
      },

      importBulk: (input) => {
        flushStageNow(set as (p: Record<string, unknown>) => void);
        const activateLast = input.activateLast === true;
        const folderSpecs = input.folders ?? [];
        const noteSpecs = (input.notes ?? []).map((n) => ({
          ...n,
          path: ensureMdPath(n.path),
        }));
        const implied = collectFolderPaths([
          ...folderSpecs.map((f) => f.path),
          ...noteSpecs.map((n) => n.path),
        ]);
        const allFolderPaths = Array.from(
          new Set([
            ...implied,
            ...folderSpecs.map((f) =>
              f.path.replace(/\\/g, "/").replace(/^\/+/, ""),
            ),
          ]),
        ).sort(
          (a, b) =>
            a.split("/").length - b.split("/").length || a.localeCompare(b),
        );

        const nodes: Record<string, VaultNode> = { ...get().nodes };
        let rootIds = [...get().rootIds];
        const pathToId = buildPathIndex(nodes);
        const existingPaths = new Set(
          Object.values(nodes).map((n) => n.path),
        );
        const folderIds: string[] = [];
        const noteIds: string[] = [];
        let created = 0;
        let skipped = 0;
        const now = Date.now();
        const diskOps: Array<() => Promise<void>> = [];
        const expanded = new Set(get().expandedFolders);

        for (const fpath of allFolderPaths) {
          if (!fpath) continue;
          if (existingPaths.has(fpath)) {
            skipped++;
            continue;
          }
          const parent = parentPath(fpath);
          const parentId = parent ? pathToId.get(parent) ?? null : null;
          if (parent && !parentId) {
            skipped++;
            continue;
          }
          const id = makeId(fpath);
          nodes[id] = {
            id,
            path: fpath,
            name: pathToName(fpath),
            kind: "folder",
            parentId,
            mtime: now,
          };
          pathToId.set(fpath, id);
          existingPaths.add(fpath);
          folderIds.push(id);
          created++;
          if (parentId == null) rootIds.push(id);
          expanded.add(id);
          if (get().mode === "desktop" && desktopRoot) {
            const root = desktopRoot;
            diskOps.push(async () => {
              await createDesktopFolder(root, fpath);
            });
          } else if (get().mode === "fsa" && fsaRoot) {
            const root = fsaRoot;
            diskOps.push(async () => {
              await createFolderOnDisk(root, fpath);
            });
          }
        }

        for (const spec of noteSpecs) {
          let path = spec.path;
          if (existingPaths.has(path)) {
            const existingId = pathToId.get(path);
            if (existingId && nodes[existingId]?.kind === "note") {
              const title = spec.title || titleFromPath(path);
              const content = defaultNoteContent(title, spec.content);
              nodes[existingId] = {
                ...nodes[existingId],
                content,
                mtime: now,
              };
              noteIds.push(existingId);
              created++;
              if (isDiskVault(get().mode)) {
                diskOps.push(async () => {
                  await persistNoteIfFsa(path, content, { ack: false });
                });
              }
              continue;
            }
            path = uniquePath(path, existingPaths);
          }
          const parent = parentPath(path);
          const parentId = parent ? pathToId.get(parent) ?? null : null;
          if (parent && !parentId) {
            skipped++;
            continue;
          }
          const title = spec.title || titleFromPath(path);
          const content = defaultNoteContent(title, spec.content);
          const id = makeId(path);
          nodes[id] = {
            id,
            path,
            name: pathToName(path),
            kind: "note",
            parentId,
            mtime: now,
            content,
          };
          pathToId.set(path, id);
          existingPaths.add(path);
          noteIds.push(id);
          created++;
          if (parentId == null) rootIds.push(id);
          if (parentId) expanded.add(parentId);
          if (isDiskVault(get().mode)) {
            diskOps.push(async () => {
              await persistNoteIfFsa(path, content, { ack: false });
            });
          }
        }

        rootIds = Array.from(new Set(rootIds)).filter((id) => nodes[id]);
        const lastNote = noteIds.length ? noteIds[noteIds.length - 1] : null;
        set({
          nodes,
          rootIds,
          expandedFolders: Array.from(expanded),
          activeNoteId:
            activateLast && lastNote ? lastNote : get().activeNoteId,
          dirtyNoteIds:
            activateLast && lastNote
              ? Array.from(new Set([...get().dirtyNoteIds, lastNote]))
              : get().dirtyNoteIds,
          toast: input.silent
            ? get().toast
            : created
              ? `Imported ${created} item${created === 1 ? "" : "s"}${
                  skipped ? ` (${skipped} skipped)` : ""
                }`
              : get().toast,
          lastExternalSync: now,
        });

        for (const op of diskOps) enqueueDiskOp(op);
        if (diskOps.length >= 10) flushDiskOps();

        return { folderIds, noteIds, created, skipped };
      },

      deleteNode: (id) => {
        flushStageNow(set as (p: Record<string, unknown>) => void);
        const nodes = { ...get().nodes };
        const target = nodes[id];
        if (!target) return;
        const toDelete = new Set<string>();
        const walk = (nid: string) => {
          toDelete.add(nid);
          for (const n of Object.values(nodes)) {
            if (n.parentId === nid) walk(n.id);
          }
        };
        walk(id);
        for (const d of toDelete) delete nodes[d];
        pushPulse({
          kind: "delete",
          path: target.path,
          title: target.kind === "note" ? noteTitle(target) : target.name,
          message: `Deleted ${target.path}`,
        });
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

      requestDelete: (id) => {
        const node = get().nodes[id];
        if (!node) return;
        if (!getPrefs().confirmDelete) {
          get().deleteNode(id);
          return;
        }
        set({
          pendingDelete: {
            id,
            kind: node.kind === "folder" ? "folder" : "note",
            label: node.kind === "note" ? noteTitle(node) : node.name,
          },
        });
      },

      confirmPendingDelete: () => {
        const p = get().pendingDelete;
        if (!p) return;
        set({ pendingDelete: null });
        get().deleteNode(p.id);
      },

      cancelPendingDelete: () => set({ pendingDelete: null }),

      moveNode: (id, newParentId) => {
        flushStageNow(set as (p: Record<string, unknown>) => void);
        const node = get().nodes[id];
        if (!node || id === newParentId) return;
        // No-op if already in that parent
        if ((node.parentId ?? null) === (newParentId ?? null)) return;
        // Prevent dropping a folder into itself or a descendant
        if (newParentId) {
          let p: string | null = newParentId;
          while (p) {
            if (p === id) {
              get().setToast("Can't move a folder into itself");
              return;
            }
            p = get().nodes[p]?.parentId ?? null;
          }
        }
        const parent = newParentId ? get().nodes[newParentId] : null;
        if (newParentId && parent?.kind !== "folder") return;

        let destName = node.name;
        let newPath = parent ? pathJoin(parent.path, destName) : destName;
        const occupied = new Set(
          Object.values(get().nodes)
            .filter((n) => n.id !== id)
            .map((n) => n.path),
        );
        if (occupied.has(newPath)) {
          // Auto-suffix on name collision in the destination
          const isNote = node.kind === "note";
          const stem = isNote ? destName.replace(/\.md$/i, "") : destName;
          const ext = isNote ? ".md" : "";
          let i = 1;
          while (
            occupied.has(
              parent
                ? pathJoin(parent.path, `${stem} ${i}${ext}`)
                : `${stem} ${i}${ext}`,
            )
          ) {
            i++;
          }
          destName = `${stem} ${i}${ext}`;
          newPath = parent ? pathJoin(parent.path, destName) : destName;
        }

        const oldPath = node.path;
        const nodes = { ...get().nodes };
        nodes[id] = {
          ...node,
          name: destName,
          parentId: newParentId,
          path: newPath,
          mtime: Date.now(),
        };
        if (node.kind === "folder") {
          const oldPrefix = oldPath + "/";
          for (const n of Object.values(nodes)) {
            if (n.id === id) continue;
            if (n.path.startsWith(oldPrefix)) {
              nodes[n.id] = {
                ...n,
                path: newPath + n.path.slice(oldPath.length),
                mtime: Date.now(),
              };
            }
          }
        }
        let rootIds = get().rootIds.filter((r) => r !== id);
        if (newParentId == null) rootIds = [...rootIds, id];
        const expanded = new Set(get().expandedFolders);
        if (newParentId) expanded.add(newParentId);
        set({
          nodes,
          rootIds,
          expandedFolders: Array.from(expanded),
          toast: `Moved to ${parent ? parent.path || parent.name : "vault root"}`,
        });
        // Clear toast shortly so it doesn't stick
        window.setTimeout(() => {
          if (get().toast?.startsWith("Moved to")) get().setToast(null);
        }, 1800);

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
          pushPulse({
            kind: "hermes",
            path,
            title: "Hermes Pulse",
            message: "Hermes updated Systems/Hermes Pulse.md",
          });
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
        pushPulse({
          kind: "hermes",
          path,
          title: "Hermes Pulse",
          message: "Hermes created Systems/Hermes Pulse.md",
        });
        if (isDiskVault(mode)) {
          void queueDiskWrite(() => persistNoteIfFsa(path, content));
        }
      },

      applyExternalSnapshot: (nodes, rootIds) => {
        pendingExternal = { nodes, rootIds };
        if (externalSnapTimer) clearTimeout(externalSnapTimer);
        const size = Object.keys(nodes).length;
        const wait =
          size > 80 ? EXTERNAL_DEBOUNCE_MS + 40 : EXTERNAL_DEBOUNCE_MS;
        externalSnapTimer = setTimeout(() => {
          externalSnapTimer = null;
          const pending = pendingExternal;
          pendingExternal = null;
          if (!pending) return;
          get()._applyExternalSnapshotNow(pending.nodes, pending.rootIds);
        }, wait);
      },

      _applyExternalSnapshotNow: (nodes, rootIds) => {
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

        // Path → new id for remapping UI sets across random create IDs
        const pathToNewId = new Map<string, string>();
        for (const n of Object.values(nodes)) {
          pathToNewId.set(n.path, n.id);
        }

        // Preserve dirty local edits; on real diverge shelf disk as .conflict-*
        const dirty = new Set(get().dirtyNoteIds);
        const existingPaths = new Set(Object.values(nodes).map((n) => n.path));
        let conflictToast: string | null = null;
        let nextRootIds = rootIds;

        for (const dirtyId of dirty) {
          const local = prev[dirtyId];
          if (!local || local.kind !== "note") continue;
          const diskId =
            nodes[dirtyId]?.kind === "note"
              ? dirtyId
              : Object.values(nodes).find(
                  (n) => n.kind === "note" && n.path === local.path,
                )?.id;
          // Wave 1: external delete of dirty note — restore local
          if (!diskId || !nodes[diskId]) {
            const restoredId = makeId(local.path);
            const parentPathStr = parentPath(local.path);
            let parentId: string | null = null;
            if (parentPathStr) {
              parentId =
                Object.values(nodes).find(
                  (n) => n.kind === "folder" && n.path === parentPathStr,
                )?.id ?? null;
            }
            nodes = {
              ...nodes,
              [restoredId]: {
                ...local,
                id: restoredId,
                parentId,
                mtime: Date.now(),
                content: local.content ?? "",
              },
            };
            pathToNewId.set(local.path, restoredId);
            if (parentId == null && !nextRootIds.includes(restoredId)) {
              nextRootIds = [...nextRootIds, restoredId];
            }
            existingPaths.add(local.path);
            if (isDiskVault(get().mode)) {
              const pth = local.path;
              const body = local.content ?? "";
              enqueueDiskOp(async () => {
                await persistNoteIfFsa(pth, body, { ack: false });
              });
            }
            conflictToast =
              conflictToast ??
              `Restored unsaved note ${pathToName(local.path)} (removed externally)`;
            continue;
          }
          const disk = nodes[diskId];
          const localBody = local.content ?? "";
          const diskBody = disk.content ?? "";
          if (
            localBody === diskBody ||
            isOnlySerializationNoise(localBody, diskBody)
          ) {
            nodes = {
              ...nodes,
              [diskId]: { ...disk, content: localBody, mtime: local.mtime },
            };
            continue;
          }

          // Real diverge: write disk body to sibling, keep local on primary
          const diskFp = markdownFingerprint(diskBody);
          if (shelvedConflicts.get(local.path) === diskFp) {
            nodes = {
              ...nodes,
              [diskId]: { ...disk, content: localBody, mtime: local.mtime },
            };
            continue;
          }
          shelvedConflicts.set(local.path, diskFp);

          const stamp = new Date()
            .toISOString()
            .replace(/[:.]/g, "-")
            .slice(0, 19);
          const base = local.path.replace(/\.md$/i, "");
          let sibling = `${base}.conflict-${stamp}.md`;
          let n = 1;
          while (existingPaths.has(sibling)) {
            sibling = `${base}.conflict-${stamp}-${n}.md`;
            n++;
          }
          existingPaths.add(sibling);

          nodes = {
            ...nodes,
            [diskId]: { ...disk, content: localBody, mtime: local.mtime },
          };

          const siblingId = makeId(sibling);
          nodes = {
            ...nodes,
            [siblingId]: {
              id: siblingId,
              path: sibling,
              name: pathToName(sibling),
              kind: "note",
              parentId: disk.parentId,
              mtime: Date.now(),
              content: diskBody,
            },
          };
          pathToNewId.set(sibling, siblingId);
          if (disk.parentId == null && !nextRootIds.includes(siblingId)) {
            nextRootIds = [...nextRootIds, siblingId];
          }

          if (isDiskVault(get().mode)) {
            const siblingPath = sibling;
            const body = diskBody;
            enqueueDiskOp(async () => {
              await persistNoteIfFsa(siblingPath, body, { ack: false });
            });
          }

          conflictToast = `Conflict — kept your edits; disk copy saved as ${pathToName(sibling)}`;
        }

        // T5: remap expandedFolders + dirtyNoteIds by path (old path → new id)
        const remappedExpanded: string[] = [];
        for (const id of get().expandedFolders) {
          const p = prev[id]?.path;
          if (!p) continue;
          const nid = pathToNewId.get(p);
          if (nid && nodes[nid]) remappedExpanded.push(nid);
        }
        const remappedDirty: string[] = [];
        for (const id of get().dirtyNoteIds) {
          const p = prev[id]?.path;
          if (!p) continue;
          const nid = pathToNewId.get(p);
          if (nid && nodes[nid]?.kind === "note") remappedDirty.push(nid);
        }
        for (const path of [...shelvedConflicts.keys()]) {
          const still = remappedDirty.some((id) => nodes[id]?.path === path);
          if (!still) shelvedConflicts.delete(path);
        }

        const now = Date.now();
        const shouldToast = now - lastExternalToastAt > 2500;
        if (shouldToast || conflictToast) lastExternalToastAt = now;
        set({
          nodes,
          rootIds: nextRootIds,
          lastExternalSync: now,
          activeNoteId: nextActive,
          dirtyNoteIds: remappedDirty,
          toast: conflictToast
            ? conflictToast
            : shouldToast
              ? "Vault updated from disk"
              : get().toast,
          expandedFolders: [
            ...new Set([
              ...remappedExpanded,
              ...expandPathToNote(nodes, nextActive),
            ]),
          ],
        });
        // Wave 3 pulse: external sync / conflict paths
        if (conflictToast) {
          const activeP =
            (nextActive && nodes[nextActive]?.path) ||
            activePath ||
            "vault";
          pushPulse({
            kind: "conflict",
            path: activeP,
            title: pathToName(activeP).replace(/\.md$/i, ""),
            message: conflictToast,
          });
        } else if (shouldToast) {
          pushPulse({
            kind: "external",
            path: activePath || "vault",
            title: activePath
              ? pathToName(activePath).replace(/\.md$/i, "")
              : "Vault",
            message: "Vault updated from disk",
          });
        }
      },

      getActiveNote: () => {
        const id = get().activeNoteId;
        if (!id) return null;
        return get().nodes[id] ?? null;
      },

      getChildren: (parentId) => {
        // Phase 1 scale: O(k) adjacency via vaultIndex (was O(n) full scan)
        const nodes = get().nodes;
        return ensureVaultIndex(nodes).getChildren(nodes, parentId);
      },

      flushDirty: () => {
        flushActiveEditors();
        diskWriteError = null;
        // Drain batched create/import ops into writeQueue, then wait for all disk ops
        flushDiskOps();
        const disk = isDiskVault(get().mode);
        return writeQueue.then(() => {
          if (diskWriteError) {
            // reportDiskError already toasted; keep dirty so user can retry
            return;
          }
          for (const id of get().dirtyNoteIds) {
            const p = get().nodes[id]?.path;
            if (p) shelvedConflicts.delete(p);
          }
          set({ dirtyNoteIds: [] });
          get().setToast(disk ? "Saved to disk" : "Saved");
        });
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
  (
    window as unknown as {
      __NOTEAPP__?: {
        store: typeof useVaultStore;
        importBulk: (input: BulkImportInput) => BulkImportResult;
        vaultIndex: typeof vaultIndex;
      };
    }
  ).__NOTEAPP__ = {
    store: useVaultStore,
    importBulk: (input) => useVaultStore.getState().importBulk(input),
    vaultIndex,
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
