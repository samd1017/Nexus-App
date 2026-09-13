import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
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
  LayoutGrid,
  Trash2,
  PanelLeft,
  PanelRight,
  Settings,
  Save,
  Hash,
  Unlink,
  ExternalLink,
  History,
  Bookmark,
  RotateCcw,
  Focus,
  CircleHelp,
  Database,
  X,
  Pin,
  Paperclip,
} from "lucide-react";
import { useVaultStore } from "@/lib/vault/store";
import { usePrefsStore } from "@/lib/prefs/preferences";
import {
  searchWithBackend as searchVault,
  searchWithBackendAsync,
  describeSearchEngine,
} from "@/lib/search/search-backend";
import { hasSearchOps, parseSearchOps, searchWithOps } from "@/lib/search/query-ops";
import { fuseSearchHits } from "@/lib/search/rank-fusion";
import { buildAskAnswer, retrieveForAsk } from "@/lib/search/ask-notes";
import { getBacklinks } from "@/lib/vault/backlinks";

import { collectVaultTags, notesForTag } from "@/lib/vault/tags";
import { getAllBrokenLinks, getOrphanNotes } from "@/lib/vault/broken-links";
import type { TrashEntry } from "@/lib/vault/trash";
import { cn } from "@/lib/utils";
import { NOTE_TEMPLATES } from "@/lib/vault/templates";
import type { NoteTemplateId } from "@/lib/vault/templates";
import { noteTitle } from "@/lib/vault/types";
import type { SearchHit } from "@/lib/vault/types";
import { recentNoteIdsForVault } from "@/lib/vault/visit-history";
import {
  recentCommandIds,
  trackCommand,
  takePendingCommandQuery,
  setPendingCommandQuery,
} from "@/lib/vault/session-recents";
import { getDurableIndex } from "@/lib/vault/durable-index";
import { snippetForSearchHit, highlightParts } from "@/lib/search/snippets";
import { toggleFocusMode } from "@/lib/prefs/focus-mode";
import { formatShortcut, isAppleModPlatform } from "@/lib/platform";
import { toggleGraphForViewport } from "@/lib/layout/viewport";

const GROUP_HEADING =
  "[&_[cmdk-group-heading]]:px-2.5 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-[10px] [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-[0.12em] [&_[cmdk-group-heading]]:text-[var(--text-muted)]";

const ITEM_CLASS =
  "cmdk-item flex cursor-pointer items-center gap-2.5 rounded-[var(--radius-sm)] px-2.5 py-2 text-[13px] text-[var(--text-secondary)] aria-selected:text-[var(--text-primary)]";

const MATCH_TYPE_LABEL: Record<string, string> = {
  title: "Title",
  content: "In note",
  path: "Path",
  tag: "Tag",
};

function HighlightedText({
  text,
  query,
  className,
}: {
  text: string;
  query: string;
  className?: string;
}) {
  const parts = useMemo(
    () => highlightParts(text, query),
    [text, query],
  );
  return (
    <span className={className}>
      {parts.map((p, i) =>
        p.match ? (
          <mark
            key={i}
            className="rounded-[2px] bg-[color-mix(in_srgb,var(--accent)_28%,transparent)] px-0.5 text-[var(--text-primary)]"
          >
            {p.text}
          </mark>
        ) : (
          <span key={i}>{p.text}</span>
        ),
      )}
    </span>
  );
}

const TEMPLATE_ICONS: Partial<Record<NoteTemplateId, ReactNode>> = {
  daily: <CalendarDays size={15} />,
  meeting: <Users size={15} />,
  idea: <Lightbulb size={15} />,
  project: <FolderKanban size={15} />,
  canvas: <LayoutGrid size={15} />,
};

const ASK_STARTERS = [
  { q: "ask: how do agents share this vault", label: "How do agents share this vault?" },
  { q: "ask: what is a wikilink", label: "What is a wikilink?" },
  { q: "ask: where are daily notes", label: "Where are daily notes?" },
];

const ASK_OPS = [
  { fill: "ask: path:Systems ", label: "path:Systems" },
  { fill: "ask: folder:Research ", label: "folder:Research" },
  { fill: "ask: #agents ", label: "#agents" },
  { fill: "ask: -welcome ", label: "−welcome" },
];

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

/** Top notes by visit MRU, then mtime. */
function topNotesByVisitMtime(
  nodes: Record<string, import("@/lib/vault/types").VaultNode>,
  limit: number,
  vaultId?: string | null,
): SearchHit[] {
  const durable = getDurableIndex();
  const visits = recentNoteIdsForVault(vaultId, nodes, limit);
  const seen = new Set<string>();
  const out: SearchHit[] = [];
  const snip = (n: import("@/lib/vault/types").VaultNode) =>
    snippetForSearchHit({
      path: n.path,
      content: n.content,
      durableBody:
        n.content === undefined
          ? durable?.getNoteMeta?.(n.id)?.bodySnippet
          : undefined,
      matchType: "title",
    });
  for (const id of visits) {
    const n = nodes[id];
    if (!n || n.kind !== "note") continue;
    seen.add(id);
    out.push({
      noteId: n.id,
      path: n.path,
      title: noteTitle(n),
      snippet: snip(n),
      score: 1,
      matchType: "title",
    });
    if (out.length >= limit) return out;
  }
  // Recents-only on large vaults — never sort 45k notes for an empty query.
  return out;
}

export function CommandPalette() {
  const open = useVaultStore((s) => s.commandOpen);
  if (!open) return null;
  return <CommandPaletteOpen />;
}

function CommandPaletteOpen() {
  const open = useVaultStore((s) => s.commandOpen);
  const vaultId = useVaultStore((s) => s.vaultId);
  const setCommandOpen = useVaultStore((s) => s.setCommandOpen);
  const nodesTick = useVaultStore((s) => s.activeNoteId);
  const nodes = useVaultStore.getState().nodes;
  void nodesTick;
  const setActiveNote = useVaultStore((s) => s.setActiveNote);
  const createNote = useVaultStore((s) => s.createNote);
  const openDailyNote = useVaultStore((s) => s.openDailyNote);
  const createFromTemplate = useVaultStore((s) => s.createFromTemplate);
  const requestDelete = useVaultStore((s) => s.requestDelete);
  const activeNoteId = useVaultStore((s) => s.activeNoteId);
  const toggleLeft = useVaultStore((s) => s.toggleLeft);
  const toggleRight = useVaultStore((s) => s.toggleRight);
  const toggleEditorMode = useVaultStore((s) => s.toggleEditorMode);
  const openDemoVault = useVaultStore((s) => s.openDemoVault);
  const openLargeTestVault = useVaultStore((s) => s.openLargeTestVault);
  const openSyntheticVault = useVaultStore((s) => s.openSyntheticVault);
  const openFolderAsVault = useVaultStore((s) => s.openFolderAsVault);
  const createMemoryVault = useVaultStore((s) => s.createMemoryVault);
  const revealVaultInFinder = useVaultStore((s) => s.revealVaultInFinder);
  const flushDirty = useVaultStore((s) => s.flushDirty);
  const setToast = useVaultStore((s) => s.setToast);
  const openPulseRail = useVaultStore((s) => s.openPulseRail);
  const listTrash = useVaultStore((s) => s.listTrash);
  const restoreTrash = useVaultStore((s) => s.restoreTrash);
  const trashTick = useVaultStore((s) => s.trashTick);
  const simulateHermesWrite = useVaultStore((s) => s.simulateHermesWrite);
  const practiceAgentConflict = useVaultStore((s) => s.practiceAgentConflict);
  const editorMode = useVaultStore((s) => s.settings.editorMode);
  const savedSearches = usePrefsStore((s) => s.savedSearches);
  const [query, setQuery] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [recentTick, setRecentTick] = useState(0);
  const [trashItems, setTrashItems] = useState<TrashEntry[]>([]);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (open) {
      const pending = takePendingCommandQuery();
      if (pending != null) {
        setQuery(pending);
      } else {
        setQuery("");
      }
      // Ensure keystrokes land in the palette without an extra click
      const t = window.setTimeout(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
      }, 0);
      return () => window.clearTimeout(t);
    } else {
      setQuery("");
      setDebouncedSearch("");
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const rawQ = query.trim();
    if (!rawQ || rawQ.startsWith(">")) {
      setDebouncedSearch("");
      return;
    }
    const t = window.setTimeout(() => setDebouncedSearch(query), 90);
    return () => window.clearTimeout(t);
  }, [open, query]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    void listTrash().then((rows) => {
      if (!cancelled) setTrashItems(rows);
    });
    return () => {
      cancelled = true;
    };
  }, [open, listTrash, trashTick]);

  const raw = query.trim();
  const isCommandMode = raw.startsWith(">");
  const q = isCommandMode ? raw.slice(1).trim() : raw;
  const pathFolderOps = useMemo(
    () =>
      isCommandMode
        ? parseSearchOps("")
        : parseSearchOps(raw),
    [isCommandMode, raw],
  );
  const searchText = isCommandMode ? "" : pathFolderOps.rest;
  const qLower = q.toLowerCase();
  const isTagBrowse =
    searchText.startsWith("#") ||
    (!hasSearchOps(pathFolderOps) &&
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
  const wantsDeleted =
    qLower === "is:deleted" ||
    qLower === "is:trash" ||
    qLower === "trash" ||
    qLower === "deleted" ||
    qLower === "restore";
  const hasPathFolderOp = hasSearchOps(pathFolderOps);
  const showAllActions = Boolean(raw) || isCommandMode;
  const actionQuery = isCommandMode
    ? q
    : searchText || (hasPathFolderOp ? "" : q);
  const isEmptyQuery = !raw && !isCommandMode;
  const isAskMode = !isCommandMode && /^(ask:|\?)\s+/i.test(raw);

  const syncHits = useMemo(() => {
    if (isEmptyQuery) {
      return topNotesByVisitMtime(nodes, 10, vaultId);
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

    const recentIds = vaultId ? recentNoteIdsForVault(vaultId, nodes, 16) : [];
    const activeNode = activeNoteId ? nodes[activeNoteId] : null;
    const neighborIds =
      activeNode?.kind === "note"
        ? getBacklinks(activeNode, nodes).map((b) => b.fromId)
        : [];
    const signals = {
      recentIds,
      activeNoteId,
      neighborIds,
      queryText: debouncedSearch.trim() || raw,
    };

    if (isAskMode) {
      return retrieveForAsk(nodes, debouncedSearch.trim() || raw, signals, 8);
    }

    if (hasPathFolderOp) {
      return fuseSearchHits(
        searchWithOps(nodes, debouncedSearch.trim() || raw, 16),
        signals,
      );
    }
    const needle = debouncedSearch.trim() || searchText || raw;
    if (needle) {
      return fuseSearchHits(searchVault(nodes, needle, 16), signals);
    }
    return fuseSearchHits(searchVault(nodes, raw, 16), signals);
  }, [
    nodes,
    vaultId,
    raw,
    searchText,
    debouncedSearch,
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
    pathFolderOps.fileFilter,
    pathFolderOps.tagFilter,
    pathFolderOps.excludes,
    isAskMode,
    activeNoteId,
  ]);

  const [asyncHits, setAsyncHits] = useState<SearchHit[] | null>(null);
  useEffect(() => {
    setAsyncHits(null);
    if (
      isEmptyQuery ||
      isCommandMode ||
      isTagBrowse ||
      wantsOrphans ||
      wantsBroken ||
      isAskMode ||
      exactTagQuery
    ) {
      return;
    }
    const idx = getDurableIndex();
    if (!idx?.searchFtsAsync) return;
    const needle = hasPathFolderOp
      ? debouncedSearch.trim() || raw
      : debouncedSearch.trim() || searchText || raw;
    if (!needle.trim()) return;
    let cancelled = false;
    const recentIds = vaultId ? recentNoteIdsForVault(vaultId, nodes, 16) : [];
    const activeNode = activeNoteId ? nodes[activeNoteId] : null;
    const neighborIds =
      activeNode?.kind === "note"
        ? getBacklinks(activeNode, nodes).map((b) => b.fromId)
        : [];
    const signals = {
      recentIds,
      activeNoteId,
      neighborIds,
      queryText: needle,
    };
    void (hasPathFolderOp
      ? Promise.resolve(searchWithOps(nodes, needle, 16))
      : searchWithBackendAsync(nodes, needle, 16)
    ).then((rows) => {
      if (cancelled) return;
      setAsyncHits(fuseSearchHits(rows, signals));
    });
    return () => {
      cancelled = true;
    };
  }, [
    nodes,
    vaultId,
    raw,
    searchText,
    debouncedSearch,
    isEmptyQuery,
    isTagBrowse,
    exactTagQuery,
    wantsOrphans,
    wantsBroken,
    isCommandMode,
    hasPathFolderOp,
    isAskMode,
    activeNoteId,
  ]);
  const hits = asyncHits ?? syncHits;

  const askAnswer = useMemo(() => {
    if (!isAskMode) return null;
    return buildAskAnswer(raw, hits, nodes);
  }, [isAskMode, raw, hits, nodes]);

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
        {
          id: "pin-note",
          label: activeNoteId && useVaultStore.getState().isNotePinned(activeNoteId)
            ? "Unpin current note"
            : "Pin current note",
          keywords: ["pin", "star", "favorite", "bookmark"],
          icon: <Pin size={15} />,
          shortcut: formatShortcut("P", { shift: true }),
          run: wrapRun("pin-note", () => {
            const id = useVaultStore.getState().activeNoteId;
            if (id) useVaultStore.getState().togglePinnedNote(id);
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
          label: "Cycle Visual / Source / Split",
          keywords: ["editor", "source", "visual", "split", "mode", "markdown"],
          icon: editorMode === "visual" ? <Code2 size={15} /> : <Eye size={15} />,
          shortcut: formatShortcut("E"),
          run: wrapRun("toggle-editor", () => {
            toggleEditorMode();
            setCommandOpen(false);
          }),
        },
        {
          id: "toggle-graph",
          label: "Open graph",
          keywords: ["graph", "fullscreen", "network", "orbit"],
          icon: <Network size={15} />,
          shortcut: formatShortcut("G"),
          run: wrapRun("toggle-graph", () => {
            toggleGraphForViewport();
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
          shortcut: "?" as string | undefined,
          run: wrapRun("help", () => {
            window.dispatchEvent(new Event("nexus:open-shortcuts"));
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
          id: "recently-deleted",
          label: "Recently deleted notes",
          keywords: ["trash", "restore", "deleted", "undelete", "recycle"],
          icon: <RotateCcw size={15} />,
          shortcut: undefined as string | undefined,
          run: wrapRun("recently-deleted", () => {
            openCommandPalette("is:deleted");
          }),
        },
        {
          id: "save",
          label: "Save now",
          keywords: ["save", "flush", "write", "disk"],
          icon: <Save size={15} />,
          shortcut: formatShortcut("S"),
          run: wrapRun("save", () => {
            void flushDirty();
            setCommandOpen(false);
          }),
        },
      ].filter((a) => matchesQuery(a.label, a.keywords, actionQuery)),
    [
      actionQuery,
      activeNoteId,
      requestDelete,
      flushDirty,
      setToast,
      setCommandOpen,
      openPulseRail,
      trashItems.length,
    ],
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
            createMemoryVault("Nexus Vault");
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
        ...(import.meta.env.DEV ? [
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
          ...([10_000, 50_000, 100_000, 200_000] as const).map((n) => ({
            id: `soak-vault-${n}`,
            label: `Open soak vault (${n.toLocaleString()} notes)`,
            keywords: ["soak", "scale", "stress", "synthetic", String(n), "large"],
            icon: <Database size={15} />,
            shortcut: undefined as string | undefined,
            run: wrapRun(`soak-vault-${n}`, () => {
              void openSyntheticVault(n);
              setCommandOpen(false);
            }),
          })),
        ] : []),
        {
          id: "hermes-sim",
          label: "Simulate agent write",
          keywords: ["hermes", "agent", "external", "simulate", "grok", "pulse"],
          icon: <Sparkles size={15} />,
          shortcut: undefined as string | undefined,
          run: wrapRun("hermes-sim", () => {
            simulateHermesWrite();
            setCommandOpen(false);
          }),
        },
        {
          id: "hermes-conflict",
          label: "Practice agent conflict",
          keywords: [
            "hermes",
            "conflict",
            "studio",
            "agent",
            "practice",
            "grok",
          ],
          icon: <Sparkles size={15} />,
          shortcut: undefined as string | undefined,
          run: wrapRun("hermes-conflict", () => {
            practiceAgentConflict();
            setCommandOpen(false);
          }),
        },
        {
          id: "open-files",
          label: "Open Files rail",
          keywords: ["attachments", "pdf", "images", "files", "paperclip"],
          icon: <Paperclip size={15} />,
          shortcut: undefined as string | undefined,
          run: wrapRun("open-files", () => {
            useVaultStore.getState().openAttachmentsRail();
            setCommandOpen(false);
          }),
        },
        {
          id: "split-pane",
          label: "Toggle dual-note workspace",
          keywords: ["split", "pane", "dual", "workspace"],
          icon: <PanelRight size={15} />,
          shortcut: formatShortcut("2"),
          run: wrapRun("split-pane", () => {
            useVaultStore.getState().toggleWorkspaceSplit();
            setCommandOpen(false);
          }),
        },
      ].filter((a) => matchesQuery(a.label, a.keywords, actionQuery)),
    [
      actionQuery,
      openFolderAsVault,
      createMemoryVault,
      revealVaultInFinder,
      openDemoVault,
      openLargeTestVault,
      openSyntheticVault,
      simulateHermesWrite,
      practiceAgentConflict,
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
      {
        id: "pin-note",
        label: "Pin / unpin current note",
        icon: <Pin size={15} />,
        shortcut: formatShortcut("P", { shift: true }),
        run: wrapRun("pin-note", () => {
          const id = useVaultStore.getState().activeNoteId;
          if (id) useVaultStore.getState().togglePinnedNote(id);
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
        id: "open-files-rail",
        label: "Open Files rail",
        icon: <Paperclip size={15} />,
        shortcut: undefined as string | undefined,
        run: wrapRun("open-files-rail", () => {
          useVaultStore.getState().openAttachmentsRail();
          setCommandOpen(false);
          setRecentTick((t) => t + 1);
        }),
      },
      {
        id: "toggle-editor",
        label: "Cycle Visual / Source / Split",
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
        label: "Open graph",
        icon: <Network size={15} />,
        shortcut: formatShortcut("G"),
        run: wrapRun("toggle-graph", () => {
          toggleGraphForViewport();
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
          window.dispatchEvent(new Event("nexus:open-shortcuts"));
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

  const searchEngine = describeSearchEngine();
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
          : hits.length > 0
            ? `Notes · ${hits.length}${hits.length >= 40 ? "+" : ""} · ${searchEngine.shortLabel}`
            : "Notes"
        : "Recent";

  return (
    <div
      className="fixed inset-0 z-[100] flex items-end justify-center bg-[var(--overlay,rgba(0,0,0,0.65))] px-0 pt-0 backdrop-blur-[8px] sm:items-start sm:px-4 sm:pt-[10vh]"
      onClick={() => setCommandOpen(false)}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
        className="w-full max-w-xl"
        onClick={(e) => e.stopPropagation()}
      >
      <Command
        className="glass-elevated max-h-[min(92dvh,720px)] w-full overflow-hidden rounded-t-[var(--radius-xl,16px)] shadow-[var(--shadow-elevated)] sm:max-h-none sm:rounded-[var(--radius-xl,16px)] sm:shadow-[0_28px_90px_rgba(0,0,0,0.6),0_0_0_1px_color-mix(in_srgb,var(--accent)_12%,transparent)]"
        label="Command palette"
        shouldFilter={false}
      >
        <div className="flex justify-center pt-2 sm:hidden" aria-hidden>
          <div className="h-1 w-10 rounded-full bg-white/15" />
        </div>
        <div className="flex items-center gap-2.5 border-b border-[var(--border)] px-4 focus-within:shadow-[inset_0_-1px_0_0_var(--accent)]">
          <Search size={16} className="shrink-0 text-[var(--accent)]" />
          <Command.Input
            ref={inputRef}
            value={query}
            onValueChange={setQuery}
            placeholder="Search, path: folder:, or ask: what links Hermes…"
            className="h-12 w-full bg-transparent text-[15px] text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)]"
            autoFocus
          />
          <button
            type="button"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[var(--radius-sm)] text-[var(--text-muted)] hover:bg-white/[0.06] hover:text-[var(--text-primary)] sm:hidden"
            aria-label="Close command palette"
            onClick={() => setCommandOpen(false)}
          >
            <X size={18} />
          </button>
          <kbd className="hidden shrink-0 rounded-md border border-[var(--border)] bg-white/[0.03] px-1.5 py-0.5 font-mono text-[10px] text-[var(--text-muted)] sm:inline">
            esc
          </kbd>
        </div>
        {!query.trim() ? (
          <div className="border-b border-[var(--border)] px-4 py-1.5 text-[11px] text-[var(--text-muted)]">
            Tips: <span className="font-mono text-[var(--text-secondary)]">path:</span>{" "}
            <span className="font-mono text-[var(--text-secondary)]">file:</span>{" "}
            <span className="font-mono text-[var(--text-secondary)]">#tag</span>{" "}
            <span className="font-mono text-[var(--text-secondary)]">-exclude</span>{" "}
            <span className="font-mono text-[var(--text-secondary)]">is:orphan</span>{" "}
            <span className="font-mono text-[var(--text-secondary)]">is:deleted</span> ·{" "}
            <span className="font-mono text-[var(--text-secondary)]">ask:</span> cited answers ·{" "}
            <span className="font-mono text-[var(--text-secondary)]">&gt;</span> for commands
          </div>
        ) : null}

        <Command.List className="max-h-[min(480px,50dvh)] overflow-y-auto overscroll-contain p-2 pb-[max(8px,env(safe-area-inset-bottom))] sm:max-h-[min(480px,56vh)]">
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

          {askAnswer ? (
            <Command.Group heading="Ask your notes · local" className={GROUP_HEADING}>
              <div className="mb-1 rounded-[10px] border border-[var(--border)] bg-white/[0.02] px-3 py-2 text-[12.5px] leading-relaxed text-[var(--text-secondary)]">
                <p>{askAnswer.summary}</p>
                <p className="mt-1.5 text-[10.5px] text-[var(--text-muted)]">
                  Extractive citations from this vault — no cloud model.
                </p>
              </div>
              {askAnswer.citations.length === 0 ? (
                <>
                  <div className="mb-1 flex flex-wrap gap-1 px-1 py-1">
                    {ASK_OPS.map((op) => (
                      <button
                        key={op.label}
                        type="button"
                        className="rounded-full border border-[var(--border)] px-2 py-0.5 font-mono text-[10px] text-[var(--text-secondary)] hover:border-[var(--accent)] hover:text-[var(--accent)]"
                        onClick={() => setQuery(op.fill)}
                      >
                        {op.label}
                      </button>
                    ))}
                  </div>
                  {ASK_STARTERS.map((s) => (
                    <Command.Item
                      key={s.q}
                      value={s.q}
                      onSelect={() => setQuery(s.q)}
                      className={ITEM_CLASS}
                    >
                      <CircleHelp size={15} className="shrink-0 text-[var(--accent)]" />
                      <span>{s.label}</span>
                    </Command.Item>
                  ))}
                </>
              ) : (
                askAnswer.citations.map((c) => (
                  <Command.Item
                    key={`ask-${c.noteId}-${c.snippet.slice(0, 24)}`}
                    value={`ask-${c.noteId}-${c.title}`}
                    onSelect={() => {
                      setActiveNote(c.noteId, { heading: c.heading });
                      setCommandOpen(false);
                    }}
                    className={cn(ITEM_CLASS, "items-start")}
                  >
                    <FileText size={15} className="mt-0.5 shrink-0 text-[var(--accent)]" />
                    <div className="min-w-0 flex-1">
                      <div className="font-medium text-[var(--text-primary)]">
                        {c.title}
                        {c.heading ? (
                          <span className="font-normal text-[var(--text-muted)]">
                            {" "}
                            #{c.heading}
                          </span>
                        ) : null}
                      </div>
                      <div className="line-clamp-2 text-[11.5px] text-[var(--text-muted)]">
                        <HighlightedText text={c.snippet} query={askAnswer.question} />
                      </div>
                    </div>
                  </Command.Item>
                ))
              )}
            </Command.Group>
          ) : null}

          {savedSearches.length > 0 && (isEmptyQuery || /^save/i.test(raw) || raw === "/") ? (
            <Command.Group heading="Saved searches" className={GROUP_HEADING}>
              {savedSearches.map((s) => (
                <Command.Item
                  key={s.id}
                  value={`saved-${s.id}-${s.name}-${s.query}`}
                  onSelect={() => setQuery(s.query)}
                  className={ITEM_CLASS}
                >
                  <Bookmark size={15} className="shrink-0 text-[var(--accent)]" />
                  <span className="flex-1 truncate">{s.name}</span>
                  <span className="max-w-[40%] truncate font-mono text-[10px] text-[var(--text-muted)]">
                    {s.query}
                  </span>
                  <button
                    type="button"
                    className="rounded p-1 text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                    onClick={(e) => {
                      e.stopPropagation();
                      usePrefsStore.getState().updatePrefs({
                        savedSearches: savedSearches.filter((x) => x.id !== s.id),
                      });
                    }}
                    aria-label={`Delete saved search ${s.name}`}
                  >
                    <X size={12} />
                  </button>
                </Command.Item>
              ))}
            </Command.Group>
          ) : null}

          {!isCommandMode && searchText && hasPathFolderOp ? (
            <Command.Group heading="Search" className={GROUP_HEADING}>
              <Command.Item
                value={`save-search-${raw}`}
                onSelect={() => {
                  const name = window.prompt("Name this search", raw) || raw;
                  usePrefsStore.getState().updatePrefs({
                    savedSearches: [
                      {
                        id: `s_${Date.now().toString(36)}`,
                        name: name.trim() || raw,
                        query: raw,
                      },
                      ...savedSearches.filter((s) => s.query !== raw),
                    ].slice(0, 24),
                  });
                  setToast("Search saved");
                }}
                className={ITEM_CLASS}
              >
                <Bookmark size={15} className="shrink-0 text-[var(--accent)]" />
                <span className="flex-1">Save this search</span>
                <span className="font-mono text-[10px] text-[var(--text-muted)]">{raw}</span>
              </Command.Item>
            </Command.Group>
          ) : null}

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
                      <HighlightedText text={h.title} query={query} />
                    </div>
                    <div className="truncate text-[11px] text-[var(--text-muted)]">
                      {h.path}
                    </div>
                    {h.snippet && h.snippet !== h.path ? (
                      <div className="mt-0.5 line-clamp-2 text-[11.5px] leading-snug text-[var(--text-secondary)]">
                        <HighlightedText text={h.snippet} query={query} />
                      </div>
                    ) : null}
                  </div>
                  <span className="ml-auto shrink-0 rounded px-1.5 py-0.5 text-[10px] tracking-wide text-[var(--text-muted)] bg-[color-mix(in_srgb,var(--text-muted)_12%,transparent)]">
                    {MATCH_TYPE_LABEL[String(h.matchType)] ??
                      String(h.matchType)}
                  </span>
                </Command.Item>
              ))}
            </Command.Group>
          ) : null}

          {wantsDeleted ? (
            <Command.Group
              heading="Recently deleted"
              className={cn(GROUP_HEADING, "mt-1")}
            >
              {trashItems.length === 0 ? (
                <Command.Item
                  value="no-trash"
                  className={ITEM_CLASS}
                  onSelect={() => {}}
                >
                  <span className="text-[var(--text-muted)]">Trash is empty</span>
                </Command.Item>
              ) : null}
              {trashItems.map((t) => (
                <Command.Item
                  key={t.trashPath}
                  value={`trash-${t.trashPath}-${t.name}`}
                  onSelect={() => {
                    void restoreTrash(t.trashPath);
                    setCommandOpen(false);
                  }}
                  className={ITEM_CLASS}
                >
                  <RotateCcw size={15} className="shrink-0 text-[var(--accent)]" />
                  <div className="min-w-0 flex-1">
                    <div className="font-medium text-[var(--text-primary)]">
                      Restore {t.name.replace(/\.md$/i, "")}
                    </div>
                    <div className="truncate text-[11px] text-[var(--text-muted)]">
                      {t.originalPath}
                    </div>
                  </div>
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
          <div className="border-t border-[var(--border)] p-3 pb-[max(12px,env(safe-area-inset-bottom))] sm:hidden">
            <button
              type="button"
              className="primary-btn w-full justify-center py-3 text-[14px]"
              onClick={() => setCommandOpen(false)}
            >
              Close
            </button>
          </div>
      </Command>
      </div>
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
