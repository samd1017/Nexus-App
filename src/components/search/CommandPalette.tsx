import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Command } from "cmdk";
import {
  FileText,
  FolderOpen,
  FolderPlus,
  Network,
  Code2,
  Eye,
  FilePlus,
  Search,
  Sparkles,
  CalendarDays,
  Lightbulb,
  Users,
  FolderKanban,
  Trash2,
  PanelLeft,
  PanelRight,
  Settings,
  Save,
  Hash,
  Unlink,
  ExternalLink,
  History,
  Focus,
  CircleHelp,
  Database,
} from "lucide-react";
import { useVaultStore } from "@/lib/vault/store";
import { usePrefsStore } from "@/lib/prefs/preferences";
import { searchWithBackend as searchVault } from "@/lib/search/search-backend";

import { collectVaultTags, notesForTag } from "@/lib/vault/tags";
import { getAllBrokenLinks, getOrphanNotes } from "@/lib/vault/broken-links";
import { cn } from "@/lib/utils";
import { NOTE_TEMPLATES } from "@/lib/vault/templates";
import type { NoteTemplateId } from "@/lib/vault/templates";
import { noteTitle } from "@/lib/vault/types";
import { loadNoteVisits } from "@/lib/vault/note-visits";
import {
  recentCommandIds,
  trackCommand,
  takePendingCommandQuery,
  setPendingCommandQuery,
} from "@/lib/vault/session-recents";
import { previewSnippet } from "@/lib/markdown/serialize";
import type { SearchHit } from "@/lib/vault/types";
import { toggleFocusMode } from "@/lib/prefs/focus-mode";
import { formatShortcut, isAppleModPlatform } from "@/lib/platform";

const GROUP_HEADING =
  "[&_[cmdk-group-heading]]:px-2.5 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-[10px] [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-[0.12em] [&_[cmdk-group-heading]]:text-[var(--text-muted)]";

const ITEM_CLASS =
  "cmdk-item flex cursor-pointer items-center gap-2.5 rounded-[10px] px-2.5 py-2 text-[13px] text-[var(--text-secondary)] aria-selected:text-[var(--text-primary)]";

const TEMPLATE_ICONS: Partial<Record<NoteTemplateId, ReactNode>> = {
  daily: <CalendarDays size={15} />,
  meeting: <Users size={15} />,
  idea: <Lightbulb size={15} />,
  project: <FolderKanban size={15} />,
};

/** Open command palette, optionally with a prefilled query. */
export function openCommandPalette(query?: string) {
  setPendingCommandQuery(query ?? null);
  useVaultStore.getState().setCommandOpen(true);
}

function matchesQuery(label: string, keywords: string[], q: string): boolean {
  if (!q) return true;
  const lower = q.toLowerCase();
  const hay = `${label} ${keywords.join(" ")}`.toLowerCase();
  if (hay.includes(lower)) return true;
  const parts = lower.split(/\s+/).filter(Boolean);
  if (parts.length > 1) return parts.every((p) => hay.includes(p));
  return false;
}

function wrapRun(id: string, run: () => void): () => void {
  return () => {
    trackCommand(id);
    run();
  };
}

/** Parse `path:foo` / `folder:bar` operators; rest is free-text search. */
function parsePathFolderOps(raw: string): {
  pathFilter: string | null;
  folderFilter: string | null;
  rest: string;
} {
  let rest = raw;
  let pathFilter: string | null = null;
  let folderFilter: string | null = null;
  rest = rest.replace(/\bpath:("([^"]+)"|(\S+))/gi, (_, _all, quoted, bare) => {
    pathFilter = (quoted ?? bare ?? "").trim() || null;
    return " ";
  });
  rest = rest.replace(/\bfolder:("([^"]+)"|(\S+))/gi, (_, _all, quoted, bare) => {
    folderFilter = (quoted ?? bare ?? "").trim() || null;
    return " ";
  });
  return {
    pathFilter,
    folderFilter,
    rest: rest.replace(/\s+/g, " ").trim(),
  };
}

function filterHitsByPathOps(
  hits: SearchHit[],
  pathFilter: string | null,
  folderFilter: string | null,
): SearchHit[] {
  let out = hits;
  if (pathFilter) {
    const needle = pathFilter.toLowerCase();
    out = out.filter((h) => h.path.toLowerCase().includes(needle));
  }
  if (folderFilter) {
    const needle = folderFilter.toLowerCase();
    out = out.filter((h) => {
      const p = h.path.toLowerCase();
      if (p.includes(needle)) return true;
      const slash = p.lastIndexOf("/");
      const folder = slash >= 0 ? p.slice(0, slash) : "";
      return folder.includes(needle);
    });
  }
  return out;
}

/** All notes as hits (for path/folder-only filters). */
function allNotesAsHits(
  nodes: Record<string, import("@/lib/vault/types").VaultNode>,
  limit = 40,
): SearchHit[] {
  return Object.values(nodes)
    .filter((n) => n.kind === "note")
    .sort((a, b) => b.mtime - a.mtime)
    .slice(0, limit)
    .map((n) => ({
      noteId: n.id,
      path: n.path,
      title: noteTitle(n),
      snippet: previewSnippet(n.content ?? "", 90),
      score: 1,
      matchType: "title" as const,
    }));
}

/** Top notes by visit MRU, then mtime. */
function topNotesByVisitMtime(
  nodes: Record<string, import("@/lib/vault/types").VaultNode>,
  limit: number,
): SearchHit[] {
  const visits = loadNoteVisits();
  const seen = new Set<string>();
  const out: SearchHit[] = [];
  for (const id of visits) {
    const n = nodes[id];
    if (!n || n.kind !== "note") continue;
    seen.add(id);
    out.push({
      noteId: n.id,
      path: n.path,
      title: noteTitle(n),
      snippet: previewSnippet(n.content ?? "", 90),
      score: 1,
      matchType: "title",
    });
    if (out.length >= limit) return out;
  }
  const rest = Object.values(nodes)
    .filter((n) => n.kind === "note" && !seen.has(n.id))
    .sort((a, b) => b.mtime - a.mtime);
  for (const n of rest) {
    out.push({
      noteId: n.id,
      path: n.path,
      title: noteTitle(n),
      snippet: previewSnippet(n.content ?? "", 90),
      score: 1,
      matchType: "title",
    });
    if (out.length >= limit) break;
  }
  return out;
}

export function CommandPalette() {
  const open = useVaultStore((s) => s.commandOpen);
  const setCommandOpen = useVaultStore((s) => s.setCommandOpen);
  const nodes = useVaultStore((s) => s.nodes);
  const setActiveNote = useVaultStore((s) => s.setActiveNote);
  const createNote = useVaultStore((s) => s.createNote);
  const openDailyNote = useVaultStore((s) => s.openDailyNote);
  const createFromTemplate = useVaultStore((s) => s.createFromTemplate);
  const requestDelete = useVaultStore((s) => s.requestDelete);
  const activeNoteId = useVaultStore((s) => s.activeNoteId);
  const toggleLeft = useVaultStore((s) => s.toggleLeft);
  const toggleRight = useVaultStore((s) => s.toggleRight);
  const toggleEditorMode = useVaultStore((s) => s.toggleEditorMode);
  const toggleGraphFullscreen = useVaultStore((s) => s.toggleGraphFullscreen);
  const openDemoVault = useVaultStore((s) => s.openDemoVault);
  const openLargeTestVault = useVaultStore((s) => s.openLargeTestVault);
  const openFolderAsVault = useVaultStore((s) => s.openFolderAsVault);
  const createNewVault = useVaultStore((s) => s.createNewVault);
  const revealVaultInFinder = useVaultStore((s) => s.revealVaultInFinder);
  const flushDirty = useVaultStore((s) => s.flushDirty);
  const setToast = useVaultStore((s) => s.setToast);
  const simulateHermesWrite = useVaultStore((s) => s.simulateHermesWrite);
  const editorMode = useVaultStore((s) => s.settings.editorMode);
  const [query, setQuery] = useState("");
  const [recentTick, setRecentTick] = useState(0);

  useEffect(() => {
    if (open) {
      const pending = takePendingCommandQuery();
      if (pending != null) {
        setQuery(pending);
      } else {
        setQuery("");
      }
    } else {
      setQuery("");
    }
  }, [open]);

  const raw = query.trim();
  const isCommandMode = raw.startsWith(">");
  const q = isCommandMode ? raw.slice(1).trim() : raw;
  const pathFolderOps = useMemo(
    () =>
      isCommandMode
        ? { pathFilter: null, folderFilter: null, rest: q }
        : parsePathFolderOps(raw),
    [isCommandMode, q, raw],
  );
  const searchText = isCommandMode ? "" : pathFolderOps.rest;
  const qLower = q.toLowerCase();
  const isTagBrowse =
    searchText.startsWith("#") ||
    (!pathFolderOps.pathFilter &&
      !pathFolderOps.folderFilter &&
      q.startsWith("#"));
  const tagPartial = isTagBrowse
    ? (searchText.startsWith("#") ? searchText.slice(1) : q.slice(1)).toLowerCase()
    : "";
  const exactTagQuery = /^#([\w/-]+)$/i.exec(searchText || raw);
  const wantsOrphans =
    qLower === "is:orphan" ||
    qLower === "is:orphans" ||
    qLower === "orphan" ||
    qLower === "orphans";
  const wantsBroken =
    qLower === "is:broken" ||
    qLower === "broken" ||
    qLower === "broken links";
  const hasPathFolderOp = Boolean(
    pathFolderOps.pathFilter || pathFolderOps.folderFilter,
  );
  const showAllActions = Boolean(raw) || isCommandMode;
  const actionQuery = isCommandMode
    ? q
    : searchText || (hasPathFolderOp ? "" : q);
  const isEmptyQuery = !raw && !isCommandMode;

  const hits = useMemo(() => {
    if (isEmptyQuery) {
      return topNotesByVisitMtime(nodes, 10);
    }
    if (isTagBrowse && tagPartial === "" && !hasPathFolderOp) return [];
    if (exactTagQuery && !hasPathFolderOp) {
      return notesForTag(nodes, exactTagQuery[1]).map((n) => ({
        noteId: n.id,
        path: n.path,
        title: noteTitle(n),
        snippet: `#${exactTagQuery[1].toLowerCase()}`,
        score: 1,
        matchType: "title" as const,
      }));
    }
    if (wantsOrphans || wantsBroken || isCommandMode) return [];

    let base: SearchHit[];
    if (searchText) {
      base = searchVault(nodes, searchText, 24);
    } else if (hasPathFolderOp) {
      base = allNotesAsHits(nodes, 48);
    } else {
      base = searchVault(nodes, raw, 16);
    }
    return filterHitsByPathOps(
      base,
      pathFolderOps.pathFilter,
      pathFolderOps.folderFilter,
    ).slice(0, 16);
  }, [
    nodes,
    raw,
    searchText,
    isEmptyQuery,
    isTagBrowse,
    tagPartial,
    exactTagQuery,
    wantsOrphans,
    wantsBroken,
    isCommandMode,
    hasPathFolderOp,
    pathFolderOps.pathFilter,
    pathFolderOps.folderFilter,
  ]);

  const tags = useMemo(() => {
    if (!isTagBrowse) return [];
    return collectVaultTags(nodes)
      .filter(
        (t) =>
          !tagPartial ||
          t.tag.startsWith(tagPartial) ||
          t.tag.includes(tagPartial),
      )
      .slice(0, 20);
  }, [nodes, isTagBrowse, tagPartial]);

  const orphans = useMemo(() => {
    if (!wantsOrphans) return [];
    try {
      return getOrphanNotes(nodes, 24);
    } catch {
      return [];
    }
  }, [nodes, wantsOrphans]);

  const brokenLinks = useMemo(() => {
    if (!wantsBroken) return [];
    try {
      return getAllBrokenLinks(nodes, 40);
    } catch {
      return [];
    }
  }, [nodes, wantsBroken]);

  const brokenCreateTargets = useMemo(() => {
    if (!wantsBroken) return [];
    const seen = new Set<string>();
    const out: string[] = [];
    for (const bl of brokenLinks) {
      const key = bl.target.trim().toLowerCase();
      if (!key || seen.has(key)) continue;
      seen.add(key);
      out.push(bl.target);
      if (out.length >= 12) break;
    }
    return out;
  }, [wantsBroken, brokenLinks]);

  const createActions = useMemo(
    () =>
      [
        {
          id: "new-note",
          label: "New note",
          keywords: ["create", "add", "file"],
          icon: <FilePlus size={15} />,
          shortcut: formatShortcut("N"),
          run: wrapRun("new-note", () => {
            createNote(null);
            setCommandOpen(false);
          }),
        },
        {
          id: "daily",
          label: "Daily note",
          keywords: ["today", "journal", "daily"],
          icon: <CalendarDays size={15} />,
          shortcut: formatShortcut("D"),
          run: wrapRun("daily", () => {
            openDailyNote();
            setCommandOpen(false);
          }),
        },
        ...NOTE_TEMPLATES.filter((t) => t.id !== "blank" && t.id !== "daily").map(
          (t) => ({
            id: `tpl-${t.id}`,
            label: `New ${t.label.toLowerCase()}`,
            keywords: [t.id, t.label, "template", "create"],
            icon: TEMPLATE_ICONS[t.id] ?? <FilePlus size={15} />,
            shortcut: undefined as string | undefined,
            run: wrapRun(`tpl-${t.id}`, () => {
              createFromTemplate(t.id);
              setCommandOpen(false);
            }),
          }),
        ),
      ].filter((a) => matchesQuery(a.label, a.keywords, actionQuery)),
    [actionQuery, createNote, openDailyNote, createFromTemplate, setCommandOpen],
  );

  const navigateActions = useMemo(
    () =>
      [
        {
          id: "toggle-left",
          label: "Toggle left sidebar",
          keywords: ["sidebar", "panel", "files", "tree"],
          icon: <PanelLeft size={15} />,
          shortcut: formatShortcut("\\"),
          run: wrapRun("toggle-left", () => {
            toggleLeft();
            setCommandOpen(false);
          }),
        },
        {
          id: "toggle-right",
          label: "Toggle right panel",
          keywords: ["outline", "backlinks", "panel"],
          icon: <PanelRight size={15} />,
          shortcut: formatShortcut("\\", { alt: true }),
          run: wrapRun("toggle-right", () => {
            toggleRight();
            setCommandOpen(false);
          }),
        },
        {
          id: "toggle-editor",
          label: "Toggle Visual / Source",
          keywords: ["editor", "source", "visual", "mode", "markdown"],
          icon: editorMode === "visual" ? <Code2 size={15} /> : <Eye size={15} />,
          shortcut: formatShortcut("E"),
          run: wrapRun("toggle-editor", () => {
            toggleEditorMode();
            setCommandOpen(false);
          }),
        },
        {
          id: "toggle-graph",
          label: "Toggle graph",
          keywords: ["graph", "fullscreen", "network", "orbit"],
          icon: <Network size={15} />,
          shortcut: formatShortcut("G"),
          run: wrapRun("toggle-graph", () => {
            toggleGraphFullscreen();
            setCommandOpen(false);
          }),
        },
        {
          id: "reveal-active-in-graph",
          label: "Reveal active note in graph",
          keywords: ["graph", "reveal", "folder map", "ego", "locate"],
          icon: <Network size={15} />,
          run: wrapRun("reveal-active-in-graph", () => {
            const id = useVaultStore.getState().activeNoteId;
            if (id) useVaultStore.getState().revealInGraph?.(id);
            else useVaultStore.getState().ensureGraphVisible?.();
            setCommandOpen(false);
          }),
        },
        {
          id: "focus-mode",
          label: "Toggle focus mode",
          keywords: ["focus", "zen", "distraction", "fullscreen", "calm"],
          icon: <Focus size={15} />,
          shortcut: formatShortcut("."),
          run: wrapRun("focus-mode", () => {
            const next = toggleFocusMode();
            setToast(next ? "Focus mode on" : "Focus mode off");
            setCommandOpen(false);
          }),
        },
        {
          id: "settings",
          label: "Settings",
          keywords: ["preferences", "prefs", "options", "config"],
          icon: <Settings size={15} />,
          shortcut: formatShortcut(","),
          run: wrapRun("settings", () => {
            usePrefsStore.getState().setSettingsOpen(true);
            setCommandOpen(false);
          }),
        },
        {
          id: "help",
          label: "Help & shortcuts",
          keywords: ["help", "shortcuts", "keyboard", "docs", "reference"],
          icon: <CircleHelp size={15} />,
          shortcut: undefined as string | undefined,
          run: wrapRun("help", () => {
            usePrefsStore.getState().setSettingsOpen(true);
            setCommandOpen(false);
          }),
        },
      ].filter((a) => matchesQuery(a.label, a.keywords, actionQuery)),
    [
      actionQuery,
      editorMode,
      toggleLeft,
      toggleRight,
      toggleEditorMode,
      toggleGraphFullscreen,
      setCommandOpen,
      setToast,
    ],
  );

  const noteOps = useMemo(
    () =>
      [
        {
          id: "delete",
          label: "Delete current note",
          keywords: ["remove", "trash", "delete"],
          icon: <Trash2 size={15} />,
          shortcut: undefined as string | undefined,
          run: wrapRun("delete", () => {
            if (activeNoteId) requestDelete(activeNoteId);
            setCommandOpen(false);
          }),
        },
        {
          id: "save",
          label: "Flush / save",
          keywords: ["save", "flush", "write", "disk"],
          icon: <Save size={15} />,
          shortcut: formatShortcut("S"),
          run: wrapRun("save", () => {
            void flushDirty();
            setToast("Saved");
            setCommandOpen(false);
          }),
        },
      ].filter((a) => matchesQuery(a.label, a.keywords, actionQuery)),
    [actionQuery, activeNoteId, requestDelete, flushDirty, setToast, setCommandOpen],
  );

  const vaultActions = useMemo(
    () =>
      [
        {
          id: "open-folder",
          label: "Open folder…",
          keywords: ["vault", "open", "folder", "disk"],
          icon: <FolderOpen size={15} />,
          shortcut: undefined as string | undefined,
          run: wrapRun("open-folder", () => {
            void openFolderAsVault();
            setCommandOpen(false);
          }),
        },
        {
          id: "new-vault",
          label: "New vault…",
          keywords: ["vault", "create", "new"],
          icon: <FolderPlus size={15} />,
          shortcut: undefined as string | undefined,
          run: wrapRun("new-vault", () => {
            void createNewVault("Nexus Vault");
            setCommandOpen(false);
          }),
        },
        {
          id: "reveal",
          label: isAppleModPlatform()
            ? "Reveal in Finder"
            : "Reveal in file manager",
          keywords: ["finder", "explorer", "show", "reveal", "folder"],
          icon: <ExternalLink size={15} />,
          shortcut: undefined as string | undefined,
          run: wrapRun("reveal", () => {
            void revealVaultInFinder();
            setCommandOpen(false);
          }),
        },
        {
          id: "demo",
          label: "Demo vault",
          keywords: ["demo", "sample", "example", "try"],
          icon: <Sparkles size={15} />,
          shortcut: undefined as string | undefined,
          run: wrapRun("demo", () => {
            openDemoVault();
            setCommandOpen(false);
          }),
        },
        {
          id: "large-test-vault",
          label: "Open 45k test vault",
          keywords: ["large", "stress", "45k", "test", "scale", "benchmark"],
          icon: <Database size={15} />,
          shortcut: undefined as string | undefined,
          run: wrapRun("large-test-vault", () => {
            void openLargeTestVault();
            setCommandOpen(false);
          }),
        },
        ...(import.meta.env.DEV
          ? [
              {
                id: "hermes-sim",
                label: "Simulate Hermes write",
                keywords: ["hermes", "agent", "external", "simulate", "dev"],
                icon: <Sparkles size={15} />,
                shortcut: undefined as string | undefined,
                run: wrapRun("hermes-sim", () => {
                  simulateHermesWrite();
                  setCommandOpen(false);
                }),
              },
            ]
          : []),
      ].filter((a) => matchesQuery(a.label, a.keywords, actionQuery)),
    [
      actionQuery,
      openFolderAsVault,
      createNewVault,
      revealVaultInFinder,
      openDemoVault,
      openLargeTestVault,
      simulateHermesWrite,
      setCommandOpen,
    ],
  );

  const allActionsById = useMemo(() => {
    const map = new Map<string, ActionDef>();
    for (const a of [
      ...createActions,
      ...navigateActions,
      ...noteOps,
      ...vaultActions,
    ]) {
      map.set(a.id, a);
    }
    return map;
  }, [createActions, navigateActions, noteOps, vaultActions]);

  const fullActionCatalog = useMemo(() => {
    const catalog: ActionDef[] = [
      {
        id: "new-note",
        label: "New note",
        icon: <FilePlus size={15} />,
        shortcut: formatShortcut("N"),
        run: wrapRun("new-note", () => {
          createNote(null);
          setCommandOpen(false);
          setRecentTick((t) => t + 1);
        }),
      },
      {
        id: "daily",
        label: "Daily note",
        icon: <CalendarDays size={15} />,
        shortcut: formatShortcut("D"),
        run: wrapRun("daily", () => {
          openDailyNote();
          setCommandOpen(false);
          setRecentTick((t) => t + 1);
        }),
      },
      ...NOTE_TEMPLATES.filter((t) => t.id !== "blank" && t.id !== "daily").map(
        (t) => ({
          id: `tpl-${t.id}`,
          label: `New ${t.label.toLowerCase()}`,
          icon: TEMPLATE_ICONS[t.id] ?? <FilePlus size={15} />,
          shortcut: undefined as string | undefined,
          run: wrapRun(`tpl-${t.id}`, () => {
            createFromTemplate(t.id);
            setCommandOpen(false);
            setRecentTick((t) => t + 1);
          }),
        }),
      ),
      {
        id: "toggle-left",
        label: "Toggle left sidebar",
        icon: <PanelLeft size={15} />,
        shortcut: formatShortcut("\\"),
        run: wrapRun("toggle-left", () => {
          toggleLeft();
          setCommandOpen(false);
          setRecentTick((t) => t + 1);
        }),
      },
      {
        id: "toggle-right",
        label: "Toggle right panel",
        icon: <PanelRight size={15} />,
        shortcut: formatShortcut("\\", { alt: true }),
        run: wrapRun("toggle-right", () => {
          toggleRight();
          setCommandOpen(false);
          setRecentTick((t) => t + 1);
        }),
      },
      {
        id: "toggle-editor",
        label: "Toggle Visual / Source",
        icon: editorMode === "visual" ? <Code2 size={15} /> : <Eye size={15} />,
        shortcut: formatShortcut("E"),
        run: wrapRun("toggle-editor", () => {
          toggleEditorMode();
          setCommandOpen(false);
          setRecentTick((t) => t + 1);
        }),
      },
      {
        id: "toggle-graph",
        label: "Toggle graph",
        icon: <Network size={15} />,
        shortcut: formatShortcut("G"),
        run: wrapRun("toggle-graph", () => {
          toggleGraphFullscreen();
          setCommandOpen(false);
          setRecentTick((t) => t + 1);
        }),
      },
      {
        id: "focus-mode",
        label: "Toggle focus mode",
        icon: <Focus size={15} />,
        shortcut: formatShortcut("."),
        run: wrapRun("focus-mode", () => {
          const next = toggleFocusMode();
          setToast(next ? "Focus mode on" : "Focus mode off");
          setCommandOpen(false);
          setRecentTick((t) => t + 1);
        }),
      },
      {
        id: "settings",
        label: "Settings",
        icon: <Settings size={15} />,
        shortcut: formatShortcut(","),
        run: wrapRun("settings", () => {
          usePrefsStore.getState().setSettingsOpen(true);
          setCommandOpen(false);
          setRecentTick((t) => t + 1);
        }),
      },
      {
        id: "help",
        label: "Help & shortcuts",
        icon: <CircleHelp size={15} />,
        run: wrapRun("help", () => {
          usePrefsStore.getState().setSettingsOpen(true);
          setCommandOpen(false);
          setRecentTick((t) => t + 1);
        }),
      },
      {
        id: "save",
        label: "Flush / save",
        icon: <Save size={15} />,
        shortcut: formatShortcut("S"),
        run: wrapRun("save", () => {
          void flushDirty();
          setToast("Saved");
          setCommandOpen(false);
          setRecentTick((t) => t + 1);
        }),
      },
      {
        id: "demo",
        label: "Demo vault",
        icon: <Sparkles size={15} />,
        run: wrapRun("demo", () => {
          openDemoVault();
          setCommandOpen(false);
          setRecentTick((t) => t + 1);
        }),
      },
    ];
    return catalog;
  }, [
    createNote,
    openDailyNote,
    createFromTemplate,
    toggleLeft,
    toggleRight,
    toggleEditorMode,
    toggleGraphFullscreen,
    editorMode,
    flushDirty,
    setToast,
    openDemoVault,
    openLargeTestVault,
    setCommandOpen,
  ]);

  const recentCommands = useMemo(() => {
    void recentTick;
    const byId = new Map(fullActionCatalog.map((a) => [a.id, a]));
    for (const a of allActionsById.values()) byId.set(a.id, a);
    return recentCommandIds
      .map((id) => byId.get(id))
      .filter((a): a is ActionDef => Boolean(a))
      .slice(0, 8);
  }, [fullActionCatalog, allActionsById, recentTick]);

  const showCreateNote =
    Boolean(searchText || (q && !hasPathFolderOp && !isCommandMode)) &&
    !isCommandMode &&
    !isTagBrowse &&
    !wantsOrphans &&
    !wantsBroken &&
    hits.length === 0 &&
    !qLower.startsWith("is:") &&
    !hasPathFolderOp;

  const emptyTopActions = useMemo(() => {
    const pool = [...createActions, ...navigateActions];
    return pool.slice(0, 4);
  }, [createActions, navigateActions]);

  if (!open) return null;

  const runTracked = (a: ActionDef) => {
    trackCommand(a.id);
    setRecentTick((t) => t + 1);
    a.run();
  };

  const notesHeading = isEmptyQuery
    ? "Recent notes"
    : hasPathFolderOp
      ? [
          pathFolderOps.pathFilter ? `path:${pathFolderOps.pathFilter}` : null,
          pathFolderOps.folderFilter
            ? `folder:${pathFolderOps.folderFilter}`
            : null,
        ]
          .filter(Boolean)
          .join(" · ")
      : q
        ? isTagBrowse
          ? `Tagged #${tagPartial}`
          : "Notes"
        : "Recent";

  return (
    <div
      className="fixed inset-0 z-[100] flex items-start justify-center bg-black/65 px-4 pt-[10vh] backdrop-blur-[8px]"
      onClick={() => setCommandOpen(false)}
    >
      <Command
        className="glass-elevated w-full max-w-xl overflow-hidden rounded-[16px] shadow-[0_28px_90px_rgba(0,0,0,0.6),0_0_0_1px_rgba(0,200,255,0.1)]"
        onClick={(e) => e.stopPropagation()}
        label="Command palette"
        shouldFilter={false}
      >
        <div className="flex items-center gap-2.5 border-b border-[var(--border)] px-4">
          <Search size={16} className="shrink-0 text-[var(--accent)]" />
          <Command.Input
            value={query}
            onValueChange={setQuery}
            placeholder="Search notes, path: folder: #tags, is:orphan, or > commands…"
            className="h-12 w-full bg-transparent text-[15px] text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)]"
            autoFocus
          />
          <kbd className="shrink-0 rounded-md border border-[var(--border)] bg-white/[0.03] px-1.5 py-0.5 font-mono text-[10px] text-[var(--text-muted)]">
            esc
          </kbd>
        </div>

        <Command.List className="max-h-[min(480px,56vh)] overflow-y-auto p-2">
          <Command.Empty className="px-3 py-8 text-center">
            <div className="text-[13px] text-[var(--text-muted)]">
              {Object.keys(nodes).length === 0
                ? "No notes yet — create one or open a vault"
                : "No matching results"}
            </div>
            {showCreateNote ? (
              <button
                type="button"
                className="mt-3 text-[12.5px] text-[var(--accent)] hover:underline"
                onClick={() => {
                  createNote(null, searchText || q || "Untitled");
                  setCommandOpen(false);
                }}
              >
                Create note: {searchText || q || "Untitled"}
              </button>
            ) : null}
          </Command.Empty>

          {isEmptyQuery && recentCommands.length > 0 ? (
            <Command.Group heading="Recent commands" className={GROUP_HEADING}>
              {recentCommands.map((a) => (
                <Command.Item
                  key={`recent-${a.id}`}
                  value={`recent-${a.id}-${a.label}`}
                  onSelect={() => runTracked(a)}
                  className={ITEM_CLASS}
                >
                  <span className="flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-md bg-[var(--accent-dim)] text-[var(--accent)]">
                    <History size={14} />
                  </span>
                  <span className="flex-1">{a.label}</span>
                  {a.shortcut ? (
                    <kbd className="rounded border border-[var(--border)] bg-white/[0.03] px-1.5 py-0.5 font-mono text-[10px] text-[var(--text-muted)]">
                      {a.shortcut}
                    </kbd>
                  ) : null}
                </Command.Item>
              ))}
            </Command.Group>
          ) : null}

          {isTagBrowse && tags.length > 0 && !exactTagQuery ? (
            <Command.Group heading="Tags" className={GROUP_HEADING}>
              {tags.map((t) => (
                <Command.Item
                  key={t.tag}
                  value={`tag-${t.tag}`}
                  onSelect={() => {
                    if (t.noteIds.length === 1) {
                      setActiveNote(t.noteIds[0]);
                      setCommandOpen(false);
                    } else {
                      setQuery(`#${t.tag}`);
                    }
                  }}
                  className={ITEM_CLASS}
                >
                  <Hash size={15} className="shrink-0 text-[var(--accent)]" />
                  <span className="flex-1 font-medium text-[var(--text-primary)]">
                    #{t.tag}
                  </span>
                  <span className="text-[11px] text-[var(--text-muted)]">
                    {t.count} note{t.count === 1 ? "" : "s"}
                  </span>
                </Command.Item>
              ))}
            </Command.Group>
          ) : null}

          {exactTagQuery && hits.length > 1 ? (
            <Command.Group
              heading={`Tagged #${exactTagQuery[1].toLowerCase()}`}
              className={GROUP_HEADING}
            >
              {hits.map((h) => (
                <Command.Item
                  key={h.noteId}
                  value={`tag-note-${h.noteId}-${h.title}`}
                  onSelect={() => {
                    setActiveNote(h.noteId);
                    setCommandOpen(false);
                  }}
                  className={cn(ITEM_CLASS, "items-start")}
                >
                  <FileText
                    size={15}
                    className="mt-0.5 shrink-0 text-[var(--accent)]"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="font-medium text-[var(--text-primary)]">
                      {h.title}
                    </div>
                    <div className="truncate text-[11.5px] text-[var(--text-muted)]">
                      {h.path}
                    </div>
                  </div>
                </Command.Item>
              ))}
            </Command.Group>
          ) : null}

          {hits.length > 0 && !(exactTagQuery && hits.length > 1) ? (
            <Command.Group
              heading={notesHeading}
              className={cn(GROUP_HEADING, tags.length > 0 && "mt-1")}
            >
              {hits.map((h) => (
                <Command.Item
                  key={h.noteId}
                  value={`note-${h.noteId}-${h.title}`}
                  onSelect={() => {
                    setActiveNote(h.noteId);
                    setCommandOpen(false);
                  }}
                  className={cn(ITEM_CLASS, "items-start")}
                >
                  <FileText
                    size={15}
                    className="mt-0.5 shrink-0 text-[var(--accent)]"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="font-medium text-[var(--text-primary)]">
                      {h.title}
                    </div>
                    <div className="truncate text-[11.5px] text-[var(--text-muted)]">
                      {h.path}
                      {h.snippet ? ` · ${h.snippet}` : ""}
                    </div>
                  </div>
                  <span className="ml-auto shrink-0 text-[10px] uppercase tracking-wide text-[var(--text-muted)]">
                    {h.matchType}
                  </span>
                </Command.Item>
              ))}
            </Command.Group>
          ) : null}

          {wantsOrphans ? (
            <Command.Group
              heading="Orphan notes"
              className={cn(GROUP_HEADING, "mt-1")}
            >
              {orphans.length === 0 ? (
                <Command.Item
                  value="no-orphans"
                  className={ITEM_CLASS}
                  onSelect={() => {}}
                >
                  <span className="text-[var(--text-muted)]">No orphan notes</span>
                </Command.Item>
              ) : null}
              {orphans.map((o) => (
                <Command.Item
                  key={o.id}
                  value={`orphan-${o.id}-${o.title}`}
                  onSelect={() => {
                    setActiveNote(o.id);
                    setCommandOpen(false);
                  }}
                  className={cn(ITEM_CLASS, "items-start")}
                >
                  <Unlink
                    size={15}
                    className="mt-0.5 shrink-0 text-[var(--text-muted)]"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="font-medium text-[var(--text-primary)]">
                      {o.title}
                    </div>
                    <div className="truncate text-[11.5px] text-[var(--text-muted)]">
                      {o.path}
                    </div>
                  </div>
                </Command.Item>
              ))}
            </Command.Group>
          ) : null}

          {wantsBroken ? (
            <Command.Group
              heading="Broken links"
              className={cn(GROUP_HEADING, "mt-1")}
            >
              {brokenLinks.length === 0 ? (
                <Command.Item
                  value="no-broken"
                  className={ITEM_CLASS}
                  onSelect={() => {}}
                >
                  <span className="text-[var(--text-muted)]">
                    No broken links in this vault
                  </span>
                </Command.Item>
              ) : (
                brokenLinks.map((bl, i) => (
                  <Command.Item
                    key={`${bl.noteId}-${bl.target}-${i}`}
                    value={`broken-${bl.noteId}-${bl.target}`}
                    onSelect={() => {
                      setActiveNote(bl.noteId);
                      setCommandOpen(false);
                    }}
                    className={cn(ITEM_CLASS, "items-start")}
                  >
                    <Unlink
                      size={15}
                      className="mt-0.5 shrink-0 text-[var(--warning)]"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="font-medium text-[var(--text-primary)]">
                        [[{bl.target}]]
                      </div>
                      <div className="truncate text-[11.5px] text-[var(--text-muted)]">
                        in {bl.noteTitle} · {bl.notePath}
                      </div>
                    </div>
                  </Command.Item>
                ))
              )}
            </Command.Group>
          ) : null}

          {wantsBroken && brokenCreateTargets.length > 0 ? (
            <Command.Group
              heading="Create missing"
              className={cn(GROUP_HEADING, "mt-1")}
            >
              {brokenCreateTargets.map((target) => (
                <Command.Item
                  key={`create-broken-${target}`}
                  value={`create-broken-${target}`}
                  onSelect={() => {
                    createNote(null, target);
                    setToast(`Created “${target}”`);
                    setCommandOpen(false);
                  }}
                  className={ITEM_CLASS}
                >
                  <span className="flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-md bg-[var(--accent-dim)] text-[var(--accent)]">
                    <FilePlus size={15} />
                  </span>
                  <span className="flex-1">
                    Create:{" "}
                    <span className="font-medium text-[var(--text-primary)]">
                      {target}
                    </span>
                  </span>
                </Command.Item>
              ))}
            </Command.Group>
          ) : null}

          {!showAllActions ? (
            <>
              {emptyTopActions.length > 0 ? (
                <ActionGroup
                  heading="Commands"
                  actions={emptyTopActions}
                  onRun={(a) => {
                    trackCommand(a.id);
                    setRecentTick((t) => t + 1);
                    a.run();
                  }}
                />
              ) : null}
            </>
          ) : (
            <>
              {createActions.length > 0 || showCreateNote ? (
                <Command.Group
                  heading="Create"
                  className={cn(GROUP_HEADING, "mt-1")}
                >
                  {showCreateNote ? (
                    <Command.Item
                      value={`create-note-${searchText || q}`}
                      onSelect={() => {
                        createNote(null, searchText || q || "Untitled");
                        setCommandOpen(false);
                      }}
                      className={ITEM_CLASS}
                    >
                      <span className="flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-md bg-[var(--accent-dim)] text-[var(--accent)]">
                        <FilePlus size={15} />
                      </span>
                      <span className="flex-1">
                        Create note:{" "}
                        <span className="font-medium text-[var(--text-primary)]">
                          {searchText || q}
                        </span>
                      </span>
                    </Command.Item>
                  ) : null}
                  {createActions.map((a) => (
                    <Command.Item
                      key={a.id}
                      value={`Create-${a.id}-${a.label}`}
                      onSelect={() => {
                        trackCommand(a.id);
                        setRecentTick((t) => t + 1);
                        a.run();
                      }}
                      className={ITEM_CLASS}
                    >
                      <span className="flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-md bg-[var(--accent-dim)] text-[var(--accent)]">
                        {a.icon}
                      </span>
                      <span className="flex-1">{a.label}</span>
                      {a.shortcut ? (
                        <kbd className="rounded border border-[var(--border)] bg-white/[0.03] px-1.5 py-0.5 font-mono text-[10px] text-[var(--text-muted)]">
                          {a.shortcut}
                        </kbd>
                      ) : null}
                    </Command.Item>
                  ))}
                </Command.Group>
              ) : null}
              {navigateActions.length > 0 ? (
                <ActionGroup
                  heading="Navigate"
                  actions={navigateActions}
                  onRun={(a) => {
                    trackCommand(a.id);
                    setRecentTick((t) => t + 1);
                    a.run();
                  }}
                />
              ) : null}
              {noteOps.length > 0 ? (
                <ActionGroup
                  heading="Note"
                  actions={noteOps}
                  onRun={(a) => {
                    trackCommand(a.id);
                    setRecentTick((t) => t + 1);
                    a.run();
                  }}
                />
              ) : null}
              {vaultActions.length > 0 ? (
                <ActionGroup
                  heading="Vault"
                  actions={vaultActions}
                  onRun={(a) => {
                    trackCommand(a.id);
                    setRecentTick((t) => t + 1);
                    a.run();
                  }}
                />
              ) : null}
            </>
          )}
        </Command.List>

        <div className="flex items-center gap-3.5 border-t border-[var(--border)] px-3.5 py-2 text-[10.5px] text-[var(--text-muted)]">
          <Hint keys="↑↓" label="navigate" />
          <Hint keys="↵" label="open" />
          <Hint keys="esc" label="close" />
          <span className="ml-auto flex items-center gap-1.5">
            <kbd className="rounded border border-[var(--border)] bg-white/[0.03] px-1.5 py-0.5 font-mono text-[10px] text-[var(--text-muted)]">
              {formatShortcut("K")}
            </kbd>
            <span>anytime</span>
          </span>
        </div>
      </Command>
    </div>
  );
}

type ActionDef = {
  id: string;
  label: string;
  icon: ReactNode;
  shortcut?: string;
  run: () => void;
};

function ActionGroup({
  heading,
  actions,
  onRun,
}: {
  heading: string;
  actions: ActionDef[];
  onRun?: (a: ActionDef) => void;
}) {
  return (
    <Command.Group heading={heading} className={cn(GROUP_HEADING, "mt-1")}>
      {actions.map((a) => (
        <Command.Item
          key={a.id}
          value={`${heading}-${a.id}-${a.label}`}
          onSelect={() => (onRun ? onRun(a) : a.run())}
          className={ITEM_CLASS}
        >
          <span className="flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-md bg-[var(--accent-dim)] text-[var(--accent)]">
            {a.icon}
          </span>
          <span className="flex-1">{a.label}</span>
          {a.shortcut ? (
            <kbd className="rounded border border-[var(--border)] bg-white/[0.03] px-1.5 py-0.5 font-mono text-[10px] text-[var(--text-muted)]">
              {a.shortcut}
            </kbd>
          ) : null}
        </Command.Item>
      ))}
    </Command.Group>
  );
}

function Hint({ keys, label }: { keys: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1">
      <kbd className="rounded border border-[var(--border)] bg-white/[0.03] px-1 py-0.5 font-mono text-[10px] text-[var(--text-muted)]">
        {keys}
      </kbd>
      <span>{label}</span>
    </span>
  );
}
