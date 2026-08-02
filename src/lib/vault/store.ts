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
import { DEFAULT_SETTINGS, basename, noteTitle, parentPath, pathJoin } from "./types";
import { buildDemoVault, HERMES_SAMPLE_NOTE } from "./demo-vault";
import { preferCleanWrite } from "@/lib/markdown/serialize";
import { slugifyTitle } from "@/lib/utils";

const STORAGE_KEY = "noteapp-vault-v1";
const RECENT_KEY = "noteapp-recent-v1";

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
    localStorage.setItem(RECENT_KEY, JSON.stringify(list.slice(0, 8)));
  } catch {
    /* ignore */
  }
}

function makeId(path: string): string {
  return "n_" + path.replace(/[^a-zA-Z0-9]+/g, "_") + "_" + Math.random().toString(36).slice(2, 7);
}

function stableId(path: string): string {
  return "n_" + path.replace(/[^a-zA-Z0-9]+/g, "_");
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
  /** Simulated external write queue for Hermes demo */
  hermesTick: number;

  bootstrap: () => void;
  openDemoVault: () => void;
  openLocalVault: (name: string, seed?: ReturnType<typeof buildDemoVault>) => void;
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
  updateNoteContent: (id: string, content: string, opts?: { external?: boolean }) => void;
  renameNode: (id: string, newName: string) => void;
  createNote: (parentId: string | null, title?: string) => string;
  createFolder: (parentId: string | null, name?: string) => string;
  deleteNode: (id: string) => void;
  moveNode: (id: string, newParentId: string | null) => void;
  setCommandOpen: (open: boolean) => void;
  setToast: (msg: string | null) => void;
  simulateHermesWrite: () => void;
  applyExternalSnapshot: (nodes: Record<string, VaultNode>, rootIds: string[]) => void;
  getActiveNote: () => VaultNode | null;
  getChildren: (parentId: string | null) => VaultNode[];
  flushDirty: () => void;
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

      bootstrap: () => {
        const recents = loadRecents();
        set({ recentVaults: recents, ready: true });
        const state = get();
        if (!state.vaultId) {
          // Auto-open last or demo
          if (recents[0]?.mode === "demo" || recents.length === 0) {
            get().openDemoVault();
          } else if (recents[0]) {
            // Reopen demo if local not available in browser
            get().openDemoVault();
          }
        }
      },

      openDemoVault: () => {
        const demo = buildDemoVault();
        const vaultId = "demo-vault";
        const welcome = Object.values(demo.nodes).find((n) => n.path === "Welcome.md");
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
          },
        });
      },

      openLocalVault: (name, seed) => {
        const data = seed ?? buildDemoVault();
        const vaultId = "local-" + slugifyTitle(name).toLowerCase().replace(/\s+/g, "-");
        const first = Object.values(data.nodes).find((n) => n.kind === "note");
        const recents = pushRecent({
          id: vaultId,
          name,
          path: name,
          lastOpened: Date.now(),
          mode: "local",
        });
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
        });
      },

      setActiveNote: (id) => {
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
          expandedFolders: cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id],
        });
      },

      setLeftOpen: (open) => set({ settings: { ...get().settings, leftOpen: open } }),
      setRightOpen: (open) => set({ settings: { ...get().settings, rightOpen: open } }),
      setEditorMode: (mode) => set({ settings: { ...get().settings, editorMode: mode } }),
      setGraphMode: (mode) => set({ settings: { ...get().settings, graphMode: mode } }),

      toggleEditorMode: () => {
        const cur = get().settings.editorMode;
        set({
          settings: {
            ...get().settings,
            editorMode: cur === "visual" ? "source" : "visual",
          },
        });
      },

      toggleLeft: () =>
        set({ settings: { ...get().settings, leftOpen: !get().settings.leftOpen } }),
      toggleRight: () =>
        set({ settings: { ...get().settings, rightOpen: !get().settings.rightOpen } }),

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
          lastExternalSync: opts?.external ? Date.now() : get().lastExternalSync,
        });
      },

      renameNode: (id, newName) => {
        const node = get().nodes[id];
        if (!node) return;
        let name = newName.trim();
        if (!name) return;
        if (node.kind === "note" && !name.endsWith(".md")) name += ".md";
        const parent = parentPath(node.path);
        const newPath = parent ? pathJoin(parent, name) : name;
        const nodes = { ...get().nodes };
        nodes[id] = { ...node, name, path: newPath, mtime: Date.now() };
        // rewrite child paths if folder
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
      },

      createNote: (parentId, title = "Untitled") => {
        const parent = parentId ? get().nodes[parentId] : null;
        const base = slugifyTitle(title) || "Untitled";
        let name = base.endsWith(".md") ? base : `${base}.md`;
        let path = parent ? pathJoin(parent.path, name) : name;
        // unique
        let i = 1;
        const paths = new Set(Object.values(get().nodes).map((n) => n.path));
        while (paths.has(path)) {
          const stem = base.replace(/\.md$/i, "");
          name = `${stem} ${i}.md`;
          path = parent ? pathJoin(parent.path, name) : name;
          i++;
        }
        const id = makeId(path);
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
        const id = stableId(path) + "_" + Math.random().toString(36).slice(2, 6);
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
        return id;
      },

      deleteNode: (id) => {
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
        set({
          nodes,
          rootIds: get().rootIds.filter((r) => !toDelete.has(r)),
          activeNoteId: toDelete.has(get().activeNoteId ?? "")
            ? null
            : get().activeNoteId,
          expandedFolders: get().expandedFolders.filter((x) => !toDelete.has(x)),
        });
      },

      moveNode: (id, newParentId) => {
        const node = get().nodes[id];
        if (!node || id === newParentId) return;
        if (newParentId) {
          // prevent moving into descendant
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
        nodes[id] = { ...node, parentId: newParentId, path: newPath, mtime: Date.now() };
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
        // remove from old root if needed
        set({ nodes, rootIds });
      },

      setCommandOpen: (open) => set({ commandOpen: open }),
      setToast: (msg) => set({ toast: msg }),

      simulateHermesWrite: () => {
        const { nodes, rootIds } = get();
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
          set({
            lastExternalSync: Date.now(),
            hermesTick: get().hermesTick + 1,
            toast: "Hermes updated Systems/Hermes Pulse.md",
            activeNoteId: existing.id,
          });
          return;
        }
        const id = stableId(path);
        const node: VaultNode = {
          id,
          path,
          name: HERMES_SAMPLE_NOTE.name,
          kind: "note",
          parentId: systems?.id ?? null,
          mtime: Date.now(),
          content,
        };
        const nextRoots =
          systems == null ? [...rootIds, id] : rootIds;
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
      },

      applyExternalSnapshot: (nodes, rootIds) => {
        set({
          nodes,
          rootIds,
          lastExternalSync: Date.now(),
        });
      },

      getActiveNote: () => {
        const id = get().activeNoteId;
        if (!id) return null;
        return get().nodes[id] ?? null;
      },

      getChildren: (parentId) => {
        const all = Object.values(get().nodes).filter((n) => n.parentId === parentId);
        return all.sort((a, b) => {
          if (a.kind !== b.kind) return a.kind === "folder" ? -1 : 1;
          return a.name.localeCompare(b.name);
        });
      },

      flushDirty: () => set({ dirtyNoteIds: [] }),
    }),
    {
      name: STORAGE_KEY,
      partialize: (s) => ({
        vaultId: s.vaultId,
        vaultName: s.vaultName,
        vaultPath: s.vaultPath,
        mode: s.mode,
        nodes: s.nodes,
        rootIds: s.rootIds,
        activeNoteId: s.activeNoteId,
        settings: s.settings,
        expandedFolders: s.expandedFolders,
      }),
    },
  ),
);

export function getNoteDisplayTitle(node: VaultNode | null | undefined): string {
  if (!node) return "";
  return noteTitle(node);
}

export function getBreadcrumbs(node: VaultNode | null, nodes: Record<string, VaultNode>): string[] {
  if (!node) return [];
  const parts: string[] = [];
  let cur: VaultNode | undefined = node;
  while (cur) {
    parts.unshift(cur.kind === "note" ? noteTitle(cur) : cur.name);
    cur = cur.parentId ? nodes[cur.parentId] : undefined;
  }
  return parts;
}

export { basename };
