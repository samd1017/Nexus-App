import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Command } from "cmdk";
import { holdOpenFocus, restoreFocusOrList } from "@/lib/chrome/focus-ring";
import { revealInFlight } from "@/lib/chrome/reveal-list";
import { folderForEnter } from "@/lib/search/folder-enter";
import { paletteEnterOpensNow } from "@/lib/search/palette-enter";
import { focusEditorPane } from "@/lib/editor/pane-focus";
import { getFindFocusPane } from "@/lib/editor/find-target";
import { focusedEmptyFolderId } from "@/lib/vault/empty-folder-target";
import { requestOpenVaultBase, setBasesOpen } from "@/lib/vault/bases-session";
import { setSwitcherOpen } from "@/lib/search/switcher-session";
import { isCanvasPath } from "@/lib/vault/canvas";
import { requestWriteFocus } from "@/lib/editor/write-intent";
import {
  FolderOpen,
  FolderPlus,
  Network,
  ArrowUpRight,
  ListChecks,
  Table2,
  LayoutGrid,
  BookOpen,
  Code2,
  Eye,
  FilePlus,
  Search,
  Sparkles,
  CalendarDays,
  Clock,
  Lightbulb,
  Users,
  FolderKanban,
  Trash2,
  PanelLeft,
  PanelRight,
  Settings,
  Save,
  ExternalLink,
  RotateCcw,
  Focus,
  CircleHelp,
  Database,
  X,
  Pin,
  Paperclip,
  Palette,
  LayoutTemplate,
} from "lucide-react";
import { useVaultStore } from "@/lib/vault/store";
import { THEME_CHOICES, usePrefsStore } from "@/lib/prefs/preferences";
import { useCssSnippetStore } from "@/lib/appearance/snippets";
import { describeSearchEngine } from "@/lib/search/search-backend";
import { NOTE_TEMPLATES } from "@/lib/vault/templates";
import { insertCurrentMoment, newNoteFromStarter, openTemplatePicker } from "@/lib/vault/template-session";
import type { NoteTemplateId } from "@/lib/vault/templates";
import { noteTitle } from "@/lib/vault/types";
import {
  recentCommandIds,
  trackCommand,
  takePendingCommandQuery,
  setPendingCommandQuery,
} from "@/lib/vault/session-recents";
import {
  getOpenProgress,
  subscribeOpenProgress,
} from "@/lib/vault/native-index";
import {
  getSearchIndexState,
  isTitleSearchLive,
  memorySearchIsPartial,
  searchEmptyStatus,
} from "@/lib/vault/sqlite-fill-progress";
import { toggleFocusMode } from "@/lib/prefs/focus-mode";
import { formatShortcut, isAppleModPlatform } from "@/lib/platform";
import { formatChord, resolveChord } from "@/lib/prefs/hotkeys";
import { openSettingsSection } from "@/lib/prefs/settings-section";
import { toggleGraphForViewport } from "@/lib/layout/viewport";
import { Hint, PaletteResults, type ActionDef } from "@/components/search/palette-results";
import {
  matchesQuery,
  PALETTE_RESULT_LIMIT,
  revealSearchedFolder,
  usePaletteSearch,
} from "@/components/search/palette-search";

const TEMPLATE_ICONS: Partial<Record<NoteTemplateId, ReactNode>> = {
  daily: <CalendarDays size={15} />,
  meeting: <Users size={15} />,
  idea: <Lightbulb size={15} />,
  project: <FolderKanban size={15} />,
};

/** Open command palette, optionally with a prefilled query. */
export function openCommandPalette(query?: string) {
  setSwitcherOpen(false);
  setPendingCommandQuery(query ?? null);
  useVaultStore.getState().setCommandOpen(true);
}

function wrapRun(id: string, run: () => void): () => void {
  return () => {
    trackCommand(id);
    run();
  };
}

/** cmdk runs onSelect from this event and from a real click. */
const PALETTE_ITEM_SELECT = "cmdk-item-select";

function openPaletteRow(row: HTMLElement): void {
  const before = useVaultStore.getState().activeNoteId;
  row.dispatchEvent(new Event(PALETTE_ITEM_SELECT));
  const st = useVaultStore.getState();
  const opened = Boolean(row.getAttribute("data-note-id")) || (st.activeNoteId != null && st.activeNoteId !== before);
  if (!opened || !st.activeNoteId) return;
  const split = Boolean(st.settings.workspaceSplit && st.secondaryNoteId);
  focusEditorPane(split ? getFindFocusPane() : "primary");
}

function focusOpenedHit(): void {
  const st = useVaultStore.getState();
  if (!st.activeNoteId) return;
  const split = Boolean(st.settings.workspaceSplit && st.secondaryNoteId);
  focusEditorPane(split ? getFindFocusPane() : "primary");
}

let openedWith: { q: string; at: number } | null = null;

// Where the cursor was before search opened. The field takes focus on mount,
// so this is tracked all the time rather than read when search opens.
let focusBeforeSearch: HTMLElement | null = null;

export function CommandPalette() {
  const open = useVaultStore((s) => s.commandOpen);
  useEffect(() => {
    const onFocusIn = (e: FocusEvent) => {
      const t = e.target as HTMLElement | null;
      if (!t || t.closest?.("[aria-label='Command palette']")) return;
      focusBeforeSearch = t;
    };
    document.addEventListener("focusin", onFocusIn, true);
    return () => document.removeEventListener("focusin", onFocusIn, true);
  }, []);
  if (!open) return null;
  return <CommandPaletteOpen />;
}

function CommandPaletteOpen() {
  const [openProgress, setOpenProgressUi] = useState(getOpenProgress);
  useEffect(() => subscribeOpenProgress(setOpenProgressUi), []);
  const searchIndexState = getSearchIndexState();
  const titleSearchLive = isTitleSearchLive(searchIndexState);
  const searchIndexing =
    !titleSearchLive &&
    (openProgress.phase === "indexing" || openProgress.phase === "walking");
  const open = useVaultStore((s) => s.commandOpen);
  const vaultId = useVaultStore((s) => s.vaultId);
  const setCommandOpen = useVaultStore((s) => s.setCommandOpen);
  const nodesTick = useVaultStore((s) => s.activeNoteId);
  const nodes = useVaultStore.getState().nodes;
  void nodesTick;
  const setActiveNote = useVaultStore((s) => s.setActiveNote);
  const createNote = useVaultStore((s) => s.createNote);
  const openDailyNote = useVaultStore((s) => s.openDailyNote);
  const requestDelete = useVaultStore((s) => s.requestDelete);
  const activeNoteId = useVaultStore((s) => s.activeNoteId);
  const shellCatalog = useVaultStore((s) => s.shellCatalog);
  const shellLiveTick = useVaultStore((s) => s.shellLiveTick);
  const shellDbPath = useVaultStore((s) => s.shellDbPath);
  const toggleLeft = useVaultStore((s) => s.toggleLeft);
  const toggleRight = useVaultStore((s) => s.toggleRight);
  const toggleEditorMode = useVaultStore((s) => s.toggleEditorMode);
  const toggleReadingView = useVaultStore((s) => s.toggleReadingView);
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
  const hotkeyOverrides = usePrefsStore((s) => s.hotkeyOverrides);
  const [query, setQuery] = useState("");
  const [recentTick, setRecentTick] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (open) {
      // Held for a moment: a second run of this effect (React's dev check)
      // would otherwise find it taken and clear the ">" or "ask:" it opened with.
      const taken = takePendingCommandQuery();
      if (taken != null) openedWith = { q: taken, at: Date.now() };
      const pending = taken ?? (openedWith && Date.now() - openedWith.at < 100 ? openedWith.q : null);
      if (pending != null) {
        setQuery(pending);
      } else {
        setQuery("");
      }
      const prev = focusBeforeSearch;
      // Keystrokes land in the field even if the note takes the cursor after paint.
      const root = inputRef.current?.closest("[role='dialog']") as HTMLElement | null;
      if (!root) return;
      const release = holdOpenFocus(root, () => inputRef.current, () => false, true);
      return () => {
        release();
        // Closing search goes back where you were, or to the list. A folder
        // picked in search is landing in the list: the list takes the cursor.
        requestAnimationFrame(() => restoreFocusOrList(revealInFlight() ? null : prev));
      };
    } else {
      setQuery("");
    }
  }, [open]);

  const {
    trashItems,
    raw,
    isCommandMode,
    q,
    pathFolderOps,
    searchText,
    qLower,
    isTagBrowse,
    tagPartial,
    exactTagQuery,
    wantsOrphans,
    wantsBroken,
    wantsDeleted,
    hasPathFolderOp,
    hasOr,
    unsupportedHint,
    scopeHint,
    showAllActions,
    actionQuery,
    isEmptyQuery,
    isAskMode,
    hits,
    noteSearchPending,
    noteSearchFailed,
    folderHits,
    pendingFolderEnterRef,
    runHeldEnter,
    catalogFolderPending,
    askAnswer,
    tags,
    orphans,
    brokenLinks,
    brokenCreateTargets,
  } = usePaletteSearch({
    open,
    query,
    nodes,
    vaultId,
    activeNoteId,
    shellCatalog,
    shellDbPath,
    shellLiveTick,
    searchIndexState,
    inputRef,
    listTrash,
    trashTick,
  });

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
          id: "new-canvas",
          label: "New canvas",
          keywords: ["canvas", "board", "create"],
          icon: <LayoutGrid size={15} />,
          shortcut: undefined as string | undefined,
          run: wrapRun("new-canvas", () => {
            const st = useVaultStore.getState();
            const active = st.activeNoteId ? st.nodes[st.activeNoteId] : null;
            const parent = focusedEmptyFolderId() ?? active?.parentId ?? null;
            st.createCanvas(parent, "Untitled");
            setCommandOpen(false);
          }),
        },
        {
          id: "open-canvas",
          label: "Open canvas",
          keywords: ["canvas", "board", "open"],
          icon: <LayoutGrid size={15} />,
          shortcut: undefined as string | undefined,
          run: wrapRun("open-canvas", () => {
            const canvases = Object.values(useVaultStore.getState().nodes)
              .filter((n) => n.kind === "note" && isCanvasPath(n.path))
              .sort((a, b) => noteTitle(a).localeCompare(noteTitle(b)));
            if (canvases.length === 0) {
              useVaultStore.getState().setToast("No canvas files yet. New canvas creates one.");
              setCommandOpen(false);
              return;
            }
            if (canvases.length === 1) {
              useVaultStore.getState().setActiveNote(canvases[0].id);
              setCommandOpen(false);
              return;
            }
            setQuery("open canvas ");
          }),
        },
        ...(actionQuery.trim().toLowerCase().startsWith("open canvas")
          ? Object.values(nodes)
              .filter((n) => n.kind === "note" && isCanvasPath(n.path))
              .sort((a, b) => noteTitle(a).localeCompare(noteTitle(b)))
              .slice(0, 30)
              .map((n) => ({
                id: `open-canvas-${n.id}`,
                label: `Open canvas: ${noteTitle(n)}`,
                keywords: ["canvas", n.path],
                icon: <LayoutGrid size={15} />,
                shortcut: undefined as string | undefined,
                run: wrapRun(`open-canvas-${n.id}`, () => {
                  useVaultStore.getState().setActiveNote(n.id);
                  setCommandOpen(false);
                }),
              }))
          : []),
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
              setCommandOpen(false);
              void newNoteFromStarter(t.id);
            }),
          }),
        ),
        {
          id: "insert-template",
          label: "Insert template…",
          keywords: ["template", "templates", "insert", "templater", "snippet"],
          icon: <LayoutTemplate size={15} />,
          shortcut: formatChord(resolveChord("insertTemplate", hotkeyOverrides)) as string | undefined,
          run: wrapRun("insert-template", () => {
            setCommandOpen(false);
            openTemplatePicker("insert");
          }),
        },
        {
          id: "new-from-template",
          label: "New note from template…",
          keywords: ["template", "templates", "create", "new", "templater"],
          icon: <LayoutTemplate size={15} />,
          shortcut: formatChord(resolveChord("newFromTemplate", hotkeyOverrides)) as string | undefined,
          run: wrapRun("new-from-template", () => {
            setCommandOpen(false);
            openTemplatePicker("new");
          }),
        },
        {
          id: "insert-date",
          label: "Insert current date",
          keywords: ["template", "templates", "date", "today", "insert", "timestamp"],
          icon: <CalendarDays size={15} />,
          shortcut: formatChord(resolveChord("insertDate", hotkeyOverrides)) as string | undefined,
          run: wrapRun("insert-date", () => {
            setCommandOpen(false);
            insertCurrentMoment("date");
          }),
        },
        {
          id: "insert-time",
          label: "Insert current time",
          keywords: ["template", "templates", "time", "now", "insert", "timestamp"],
          icon: <Clock size={15} />,
          shortcut: formatChord(resolveChord("insertTime", hotkeyOverrides)) as string | undefined,
          run: wrapRun("insert-time", () => {
            setCommandOpen(false);
            insertCurrentMoment("time");
          }),
        },
        {
          id: "template-settings",
          label: "Template settings",
          keywords: ["template", "templates", "folder", "date format", "hotkey", "templater"],
          icon: <Settings size={15} />,
          shortcut: undefined as string | undefined,
          run: wrapRun("template-settings", () => {
            setCommandOpen(false);
            openSettingsSection("templates");
          }),
        },
      ].filter((a) => matchesQuery(a.label, a.keywords, actionQuery)),
    [actionQuery, nodes, createNote, openDailyNote, setCommandOpen, setQuery, hotkeyOverrides],
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
          id: "toggle-reading-view",
          label: "Toggle reading view",
          keywords: ["reading", "read", "preview", "edit", "view", "obsidian"],
          icon: <BookOpen size={15} />,
          shortcut: formatShortcut("E"),
          run: wrapRun("toggle-reading-view", () => {
            toggleReadingView();
            setCommandOpen(false);
          }),
        },
        {
          id: "toggle-editor",
          label: "Cycle Visual / Source / Split",
          keywords: ["editor", "source", "visual", "split", "mode", "markdown"],
          icon: editorMode === "visual" ? <Code2 size={15} /> : <Eye size={15} />,
          shortcut: undefined as string | undefined,
          run: wrapRun("toggle-editor", () => {
            toggleEditorMode();
            setCommandOpen(false);
          }),
        },
        {
          id: "open-outgoing",
          label: "Outgoing links",
          keywords: ["outgoing", "links", "unresolved", "wikilink"],
          icon: <ArrowUpRight size={15} />,
          run: wrapRun("open-outgoing", () => {
            useVaultStore.getState().setRightTab("outgoing");
            useVaultStore.getState().setRightOpen(true);
            setCommandOpen(false);
          }),
        },
        {
          id: "open-tasks",
          label: "Tasks",
          keywords: ["tasks", "todo", "checkbox", "due"],
          icon: <ListChecks size={15} />,
          run: wrapRun("open-tasks", () => {
            useVaultStore.getState().setRightTab("tasks");
            useVaultStore.getState().setRightOpen(true);
            setCommandOpen(false);
          }),
        },
        {
          id: "open-bases",
          label: "Bases",
          keywords: ["bases", "note table", "properties", "frontmatter", "table"],
          icon: <Table2 size={15} />,
          run: wrapRun("open-bases", () => {
            setBasesOpen(true);
            setCommandOpen(false);
          }),
        },
        {
          id: "open-vault-base",
          label: "Open .base from vault",
          keywords: ["bases", "base", "obsidian", "import", "views"],
          icon: <Table2 size={15} />,
          run: wrapRun("open-vault-base", () => {
            requestOpenVaultBase();
            setCommandOpen(false);
          }),
        },
        {
          id: "open-graph-overview",
          label: "Graph overview",
          keywords: ["graph", "overview", "vault", "folder", "tag", "filters"],
          icon: <Network size={15} />,
          run: wrapRun("open-graph-overview", () => {
            usePrefsStore.getState().updatePrefs({ graphSurface: "overview" });
            const store = useVaultStore.getState();
            store.setRightOpen(true);
            store.setRightTab("graph");
            store.setGraphMode("fullscreen");
            setCommandOpen(false);
          }),
        },
        {
          id: "toggle-graph",
          label: "Open Local graph",
          keywords: ["graph", "fullscreen", "local", "network", "orbit"],
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
        ...THEME_CHOICES.map((choice) => ({
          id: `theme-${choice.id}`,
          label: `Theme: ${choice.label}`,
          keywords: ["theme", "appearance", "color", "dark", "light", choice.label.toLowerCase()],
          icon: <Palette size={15} />,
          run: wrapRun(`theme-${choice.id}`, () => {
            usePrefsStore.getState().updatePrefs({ theme: choice.id });
            setToast(`Theme: ${choice.label}`);
            setCommandOpen(false);
          }),
        })),
        {
          id: "snippets-off",
          label: "Turn off CSS snippets",
          keywords: ["css", "snippets", "appearance", "theme", "reset", "safe"],
          icon: <Palette size={15} />,
          run: wrapRun("snippets-off", () => {
            const on = useCssSnippetStore.getState().enabled.length;
            useCssSnippetStore.getState().disableAll();
            setToast(on ? "CSS snippets off" : "No CSS snippets were on");
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
      toggleReadingView,
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
            id: `scale-vault-${n}`,
            label: `Open large test vault (${n.toLocaleString()} notes)`,
            keywords: ["scale", "stress", "synthetic", String(n), "large"],
            icon: <Database size={15} />,
            shortcut: undefined as string | undefined,
            run: wrapRun(`scale-vault-${n}`, () => {
              void openSyntheticVault(n);
              setCommandOpen(false);
            }),
          })),
        ] : []),
        {
          id: "agent-sim",
          label: "Simulate agent write",
          keywords: ["agent", "external", "simulate", "pulse", "automation"],
          icon: <Sparkles size={15} />,
          shortcut: undefined as string | undefined,
          run: wrapRun("agent-sim", () => {
            simulateHermesWrite();
            setCommandOpen(false);
          }),
        },
        {
          id: "agent-conflict",
          label: "Practice agent conflict",
          keywords: ["conflict", "studio", "agent", "practice", "external"],
          icon: <Sparkles size={15} />,
          shortcut: undefined as string | undefined,
          run: wrapRun("agent-conflict", () => {
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
        id: "new-canvas",
        label: "New canvas",
        icon: <LayoutGrid size={15} />,
        shortcut: undefined as string | undefined,
        run: wrapRun("new-canvas", () => {
          const st = useVaultStore.getState();
          const active = st.activeNoteId ? st.nodes[st.activeNoteId] : null;
          const parent = focusedEmptyFolderId() ?? active?.parentId ?? null;
          st.createCanvas(parent, "Untitled");
          setCommandOpen(false);
          setRecentTick((t) => t + 1);
        }),
      },
      {
        id: "open-canvas",
        label: "Open canvas",
        icon: <LayoutGrid size={15} />,
        shortcut: undefined as string | undefined,
        run: wrapRun("open-canvas", () => {
          const canvases = Object.values(useVaultStore.getState().nodes)
            .filter((n) => n.kind === "note" && isCanvasPath(n.path))
            .sort((a, b) => noteTitle(a).localeCompare(noteTitle(b)));
          if (canvases.length === 0) {
            useVaultStore.getState().setToast("No canvas files yet. New canvas creates one.");
            setCommandOpen(false);
            return;
          }
          if (canvases.length === 1) {
            useVaultStore.getState().setActiveNote(canvases[0].id);
            setCommandOpen(false);
            return;
          }
          setQuery("open canvas ");
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
            setCommandOpen(false);
            setRecentTick((t) => t + 1);
            void newNoteFromStarter(t.id);
          }),
        }),
      ),
      {
        id: "insert-template",
        label: "Insert template…",
        icon: <LayoutTemplate size={15} />,
        shortcut: undefined as string | undefined,
        run: wrapRun("insert-template", () => {
          setCommandOpen(false);
          setRecentTick((t) => t + 1);
          openTemplatePicker("insert");
        }),
      },
      {
        id: "new-from-template",
        label: "New note from template…",
        icon: <LayoutTemplate size={15} />,
        shortcut: undefined as string | undefined,
        run: wrapRun("new-from-template", () => {
          setCommandOpen(false);
          setRecentTick((t) => t + 1);
          openTemplatePicker("new");
        }),
      },
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
        id: "toggle-reading-view",
        label: "Toggle reading view",
        icon: <BookOpen size={15} />,
        shortcut: formatShortcut("E") as string | undefined,
        run: wrapRun("toggle-reading-view", () => {
          toggleReadingView();
          setCommandOpen(false);
          setRecentTick((t) => t + 1);
        }),
      },
      {
        id: "toggle-editor",
        label: "Cycle Visual / Source / Split",
        icon: editorMode === "visual" ? <Code2 size={15} /> : <Eye size={15} />,
        shortcut: undefined as string | undefined,
        run: wrapRun("toggle-editor", () => {
          toggleEditorMode();
          setCommandOpen(false);
          setRecentTick((t) => t + 1);
        }),
      },
      {
        id: "open-outgoing",
        label: "Outgoing links",
        icon: <ArrowUpRight size={15} />,
        shortcut: undefined as string | undefined,
        run: wrapRun("open-outgoing", () => {
          useVaultStore.getState().setRightTab("outgoing");
          useVaultStore.getState().setRightOpen(true);
          setCommandOpen(false);
          setRecentTick((t) => t + 1);
        }),
      },
      {
        id: "open-tasks",
        label: "Tasks",
        icon: <ListChecks size={15} />,
        shortcut: undefined as string | undefined,
        run: wrapRun("open-tasks", () => {
          useVaultStore.getState().setRightTab("tasks");
          useVaultStore.getState().setRightOpen(true);
          setCommandOpen(false);
          setRecentTick((t) => t + 1);
        }),
      },
      {
        id: "open-bases",
        label: "Bases",
        icon: <Table2 size={15} />,
        shortcut: undefined as string | undefined,
        run: wrapRun("open-bases", () => {
          setBasesOpen(true);
          setCommandOpen(false);
          setRecentTick((t) => t + 1);
        }),
      },
      {
        id: "open-vault-base",
        label: "Open .base from vault",
        icon: <Table2 size={15} />,
        shortcut: undefined as string | undefined,
        run: wrapRun("open-vault-base", () => {
          requestOpenVaultBase();
          setCommandOpen(false);
          setRecentTick((t) => t + 1);
        }),
      },
      {
        id: "open-graph-overview",
        label: "Graph overview",
        icon: <Network size={15} />,
        shortcut: undefined as string | undefined,
        run: wrapRun("open-graph-overview", () => {
          usePrefsStore.getState().updatePrefs({ graphSurface: "overview" });
          const store = useVaultStore.getState();
          store.setRightOpen(true);
          store.setRightTab("graph");
          store.setGraphMode("fullscreen");
          setCommandOpen(false);
          setRecentTick((t) => t + 1);
        }),
      },
      {
        id: "toggle-graph",
        label: "Open Local graph",
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
    toggleLeft,
    toggleRight,
    toggleEditorMode,
    toggleReadingView,
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
  // The query names the note, as in Obsidian's quick switcher. Start writing.
  const createFromQuery = () => {
    const title = (searchText || q).trim() || "Untitled";
    const id = createNote(null, title);
    setCommandOpen(false);
    const path = id ? useVaultStore.getState().nodes[id]?.path : null;
    if (path) requestWriteFocus(path);
  };
  const emptyStatus = searchEmptyStatus({
    titleSearchLive,
    memorySearch: searchEngine.id !== "sqlite-fts5-bm25",
    failed: searchIndexState === "error" || noteSearchFailed,
    pending: noteSearchPending,
  });
  const engineBit = searchEngine.uiLabel;
  const memoryCapped = searchEngine.id === "memory-fts-capped";
  const memoryPartial = memorySearchIsPartial({
    engineId: searchEngine.id,
    hitCount: hits.length,
    pageLimit: PALETTE_RESULT_LIMIT,
  });
  const notesHeading = isEmptyQuery
    ? "Recent notes"
    : hasPathFolderOp
      ? [
          pathFolderOps.pathFilter ? `path:${pathFolderOps.pathFilter}` : null,
          pathFolderOps.folderFilter
            ? `folder:${pathFolderOps.folderFilter}`
            : null,
          engineBit,
        ]
          .filter(Boolean)
          .join(" · ")
      : q
        ? isTagBrowse
          ? `Tagged #${tagPartial}`
          : hits.length > 0
            ? `Notes · ${hits.length}${hits.length >= PALETTE_RESULT_LIMIT ? "+" : ""} · ${engineBit}`
            : searchIndexing
              ? `Notes · ${engineBit} · indexing…`
              : `Notes · ${engineBit} · no matches`
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
        className="nexus-dialog-in w-full max-w-xl"
        onClick={(e) => e.stopPropagation()}
      >
      <Command
        className="nexus-dark-island glass-elevated max-h-[min(92dvh,720px)] w-full overflow-hidden rounded-t-[var(--radius-xl,16px)] shadow-[var(--shadow-elevated)] sm:max-h-none sm:rounded-[var(--radius-xl,16px)] sm:shadow-[0_28px_90px_rgba(0,0,0,0.6),0_0_0_1px_color-mix(in_srgb,var(--accent)_12%,transparent)]"
        label="Command palette"
        shouldFilter={false}
      >
        <div className="flex justify-center pt-2 sm:hidden" aria-hidden>
          <div className="h-1 w-10 rounded-full bg-white/15" />
        </div>
        <div
          className="nexus-search-field flex items-center gap-2.5 border-b border-[var(--border)] px-4"
          data-testid="search-field"
          onFocusCapture={(e) => {
            e.currentTarget.setAttribute("data-keyboard-focus", "control");
          }}
          data-search-engine={searchEngine.id}
          data-search-engine-label={searchEngine.shortLabel}
          data-search-index-state={searchEngine.indexState}
          title={searchEngine.uiLabel}
        >
          <Search size={16} className="shrink-0 text-[var(--accent)]" />
          <Command.Input
            ref={inputRef}
            value={query}
            onValueChange={setQuery}
            placeholder={isCommandMode ? "Select a command…" : "Find or create a note…"}
            aria-label="Search notes"
            className="nexus-search-input h-12 w-full bg-transparent text-[15px] text-white placeholder:text-[var(--text-muted)]"
            autoFocus
            onFocus={(e) => {
              e.currentTarget
                .closest("[data-testid='search-field']")
                ?.setAttribute("data-keyboard-focus", "control");
            }}
            onKeyDownCapture={(e) => {
              if (e.key !== "Enter" || e.nativeEvent.isComposing) return;
              // Shift+Enter makes a note with this name, even when notes match.
              if (e.shiftKey && !e.metaKey && !e.ctrlKey && !e.altKey) {
                if (!q || isAskMode || isCommandMode || isTagBrowse || hasPathFolderOp || hasOr) return;
                if (qLower.startsWith("is:") || wantsOrphans || wantsBroken) return;
                e.preventDefault();
                e.stopPropagation();
                createFromQuery();
                return;
              }
              const root = e.currentTarget.closest("[cmdk-root]");
              const selected = root?.querySelector<HTMLElement>(
                "[cmdk-item][aria-selected='true'], [cmdk-item][data-selected='true']",
              );
              const top = hits[0];
              const want = q.trim().toLowerCase();
              const exactNote = hits.some((h) => h.title.trim().toLowerCase() === want);
              const enterNow = paletteEnterOpensNow({
                hasSelection: Boolean(selected),
                selectedIsFolder: selected?.getAttribute("data-testid") === "search-folder-hit",
                selectedIsCreate: selected?.getAttribute("data-testid") === "search-create-note",
                hitCount: hits.length,
                catalogPending: catalogFolderPending,
                exactNote,
                commandMode: isCommandMode,
                askMode: isAskMode,
                tagBrowse: isTagBrowse,
              });
              if (enterNow === "selected" && selected) {
                e.preventDefault();
                e.stopPropagation();
                openPaletteRow(selected);
                return;
              }
              if (enterNow === "first-hit" && top) {
                e.preventDefault();
                e.stopPropagation();
                setActiveNote(top.noteId);
                setCommandOpen(false);
                focusOpenedHit();
                return;
              }
              if (selected?.getAttribute("data-testid") === "search-folder-hit") return;
              if (!q || isAskMode || isCommandMode || isTagBrowse) return;
              if (pendingFolderEnterRef.current?.q === q) {
                e.preventDefault();
                e.stopPropagation();
                return;
              }
              // A folder found after the list settled may not be selected, so
              // Enter would do nothing and leave search holding the keyboard.
              // A folder named exactly what was typed wins, unless a note is too.
              const found = folderForEnter(folderHits, q);
              const folder =
                found && (found.exact ? !exactNote : hits.length === 0 && !selected) ? found : null;
              if (folder) {
                e.preventDefault();
                e.stopPropagation();
                revealSearchedFolder(folder.id);
                return;
              }
              // The catalog has not answered yet. What is selected now is
              // "Create note" or a note that only shares the words; either
              // would skip a folder with exactly this name.
              if (!folder && !exactNote && catalogFolderPending) {
                e.preventDefault();
                e.stopPropagation();
                pendingFolderEnterRef.current = { q, timer: window.setTimeout(runHeldEnter, 4000) };
                return;
              }
              if (selected) return;
              if (top) {
                e.preventDefault();
                e.stopPropagation();
                setActiveNote(top.noteId);
                setCommandOpen(false);
                return;
              }
              // Nothing matched and nothing is still looking: Enter makes it.
              if (emptyStatus === "miss" && showCreateNote) {
                e.preventDefault();
                e.stopPropagation();
                createFromQuery();
              }
            }}
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
            Esc
          </kbd>
        </div>
        {!query.trim() ? (
          <div className="border-b border-[var(--border)] px-4 py-1.5 text-[11px] text-[var(--text-muted)]">
            Tips: <span className="font-mono text-[var(--text-secondary)]">path:</span>{" "}
            <span className="font-mono text-[var(--text-secondary)]">file:</span>{" "}
            <span className="font-mono text-[var(--text-secondary)]">#tag</span>{" "}
            <span className="font-mono text-[var(--text-secondary)]">tag:</span>{" "}
            <span className="font-mono text-[var(--text-secondary)]">OR</span>{" "}
            <span className="font-mono text-[var(--text-secondary)]">-exclude</span>{" "}
            <span className="font-mono text-[var(--text-secondary)]">is:orphan</span>{" "}
            <span className="font-mono text-[var(--text-secondary)]">is:deleted</span> ·{" "}
            <span className="font-mono text-[var(--text-secondary)]">ask:</span> cited answers ·{" "}
            <span className="font-mono text-[var(--text-secondary)]">&gt;</span> for commands.
            {" "}
            <span className="font-mono text-[var(--text-secondary)]">line:</span> and{" "}
            <span className="font-mono text-[var(--text-secondary)]">section:</span> filter loaded notes.
          </div>
        ) : null}
        {unsupportedHint ? (
          <div
            className="border-b border-[var(--border)] px-4 py-1.5 text-[11px] text-[var(--text-secondary)]"
            role="status"
            data-testid="search-unsupported-hint"
          >
            {unsupportedHint}
          </div>
        ) : null}
        {scopeHint ? (
          <div
            className="border-b border-[var(--border)] px-4 py-1.5 text-[11px] text-[var(--text-secondary)]"
            role="status"
            data-testid="search-scope-hint"
          >
            {scopeHint}
          </div>
        ) : null}

        <Command.List className="max-h-[min(480px,50dvh)] overflow-y-auto overscroll-contain p-2 pb-[max(8px,env(safe-area-inset-bottom))] sm:max-h-[min(480px,56vh)]">
          <PaletteResults
            q={q}
            isAskMode={isAskMode}
            isCommandMode={isCommandMode}
            isTagBrowse={isTagBrowse}
            exactTagQuery={exactTagQuery}
            hits={hits}
            nodes={nodes}
            showCreateNote={showCreateNote}
            searchText={searchText}
            createFromQuery={createFromQuery}
            createNote={createNote}
            setCommandOpen={setCommandOpen}
            askAnswer={askAnswer}
            setQuery={setQuery}
            setActiveNote={setActiveNote}
            savedSearches={savedSearches}
            isEmptyQuery={isEmptyQuery}
            raw={raw}
            hasPathFolderOp={hasPathFolderOp}
            hasOr={hasOr}
            setToast={setToast}
            recentCommands={recentCommands}
            runTracked={runTracked}
            tags={tags}
            emptyStatus={emptyStatus}
            memoryCapped={memoryCapped}
            notesHeading={notesHeading}
            titleSearchLive={titleSearchLive}
            searchEngine={searchEngine}
            searchIndexState={searchIndexState}
            shellCatalog={shellCatalog}
            shellDbPath={shellDbPath}
            noteSearchFailed={noteSearchFailed}
            noteSearchPending={noteSearchPending}
            inputRef={inputRef}
            memoryPartial={memoryPartial}
            query={query}
            folderHits={folderHits}
            wantsDeleted={wantsDeleted}
            trashItems={trashItems}
            restoreTrash={restoreTrash}
            wantsOrphans={wantsOrphans}
            orphans={orphans}
            wantsBroken={wantsBroken}
            brokenLinks={brokenLinks}
            brokenCreateTargets={brokenCreateTargets}
            showAllActions={showAllActions}
            emptyTopActions={emptyTopActions}
            setRecentTick={setRecentTick}
            createActions={createActions}
            navigateActions={navigateActions}
            noteOps={noteOps}
            vaultActions={vaultActions}
          />
        </Command.List>

        <div className="flex items-center gap-3.5 border-t border-[var(--border)] px-3.5 py-2 text-[10.5px] text-[var(--text-muted)]">
          <Hint keys="↑↓" label="navigate" />
          <Hint keys="↵" label="open" />
          <Hint keys="Esc" label="close" />
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

