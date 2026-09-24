import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Code2,
  Columns2,
  Eye,
  Network,
  PanelLeftClose,
  PanelLeftOpen,
  PanelRightClose,
  PanelRightOpen,
  FilePlus2,
  CalendarDays,
  Focus,
  Loader2,
  AlertCircle,
  Search,
  X,
  ArrowLeftRight,
  Pin,
} from "lucide-react";
import { useVaultStore, getBreadcrumbTrail } from "@/lib/vault/store";
import { jumpToBlockRef, jumpToOutlineHeading } from "@/lib/editor/outline-jump";
import { isContentLoaded } from "@/lib/vault/content";
import { VisualEditor } from "./VisualEditor";
import { SourceEditor } from "./SourceEditor";
import { SourcePreview } from "./SourcePreview";
import { CanvasBoard } from "@/components/canvas/CanvasBoard";
import { isCanvasNote } from "@/lib/vault/canvas";
import { formatRelativeTime, cn } from "@/lib/utils";
import { NoteTitleInput } from "./NoteTitleInput";
import { EditorSaveChip } from "./EditorSaveChip";
import { EditorStatusBar } from "./EditorStatusBar";
import { NexusMark, NEXUS_TAGLINE } from "@/components/brand/NexusLogo";
import { usePrefsStore } from "@/lib/prefs/preferences";
import { setFocusMode } from "@/lib/prefs/focus-mode";
import { NewNoteMenu } from "@/components/vault/NewNoteMenu";
import { ConflictBanner } from "@/components/conflict/ConflictStudioHost";
import { formatShortcut } from "@/lib/platform";
import { FindInNoteBar } from "./FindInNoteBar";
import { FrontmatterEditor } from "./FrontmatterEditor";
import { setFindEditorMode, setFindFocusPane, getFindFocusPane } from "@/lib/editor/find-target";
import { toggleGraphForViewport } from "@/lib/layout/viewport";
import { revealFileList } from "@/lib/chrome/reveal-list";
import { scheduleEmptyNoteRename } from "@/lib/chrome/empty-folder-enter";
import {
  formatDateLong,
  isTodayDailyPath,
  isJournalDailyPath,
  parseJournalDailyDate,
} from "@/lib/vault/templates";

export function EditorPane({
  noteId,
  pane = "primary",
}: {
  noteId?: string | null;
  pane?: "primary" | "secondary";
} = {}) {
  const editorMode = useVaultStore((s) => s.settings.editorMode);
  const graphMode = useVaultStore((s) => s.settings.graphMode);
  const rightOpen = useVaultStore((s) => s.settings.rightOpen);
  const leftOpen = useVaultStore((s) => s.settings.leftOpen);
  const mode = useVaultStore((s) => s.mode);
  const rightTab = useVaultStore((s) => s.rightTab);
  const setRightOpen = useVaultStore((s) => s.setRightOpen);
  const setLeftOpen = useVaultStore((s) => s.setLeftOpen);
  const openDailyNote = useVaultStore((s) => s.openDailyNote);
  const setCommandOpen = useVaultStore((s) => s.setCommandOpen);
  const setEditorMode = useVaultStore((s) => s.setEditorMode);
  const workspaceSplit = useVaultStore((s) => s.settings.workspaceSplit);
  const toggleWorkspaceSplit = useVaultStore((s) => s.toggleWorkspaceSplit);
  const closeSecondaryPane = useVaultStore((s) => s.closeSecondaryPane);
  const swapWorkspacePanes = useVaultStore((s) => s.swapWorkspacePanes);
  const pendingJump = useVaultStore((s) => s.pendingJump);
  const togglePinnedNote = useVaultStore((s) => s.togglePinnedNote);
  const pinnedNotePaths = useVaultStore((s) => s.settings.pinnedNotePaths);
  const focusMode = usePrefsStore((s) => s.focusMode);
  const [findOpen, setFindOpen] = useState(false);
  const [findSeed, setFindSeed] = useState("");
  const [findReplace, setFindReplace] = useState(false);
  const resolvedId = useVaultStore((s) =>
    pane === "secondary" ? (noteId ?? s.secondaryNoteId) : (noteId ?? s.activeNoteId),
  );
  const note = useVaultStore((s) =>
    resolvedId ? (s.nodes[resolvedId] ?? null) : null,
  );
  const isSecondary = pane === "secondary";
  const ensureNoteBody = useVaultStore((s) => s.ensureNoteBody);
  const [hydrateError, setHydrateError] = useState(false);
  const [splitLive, setSplitLive] = useState<{ id: string; text: string } | null>(
    null,
  );

  useEffect(() => {
    setFindEditorMode(editorMode === "visual" ? "visual" : "source");
  }, [editorMode]);

  useEffect(() => {
    if (!workspaceSplit && pane === "primary") setFindFocusPane("primary");
  }, [workspaceSplit, pane]);

  useEffect(() => {
    // Close find when switching notes
    setFindOpen(false);
  }, [note?.id]);

  useEffect(() => {
    if (!pendingJump || !note?.id || pendingJump.noteId !== note.id) return;
    if (pendingJump.pane !== pane) return;
    const t = window.setTimeout(() => {
      if (pendingJump.heading) jumpToOutlineHeading(pendingJump.heading, 0, pane);
      if (pendingJump.blockId) jumpToBlockRef(pendingJump.blockId, pane);
      useVaultStore.getState().clearPendingJump?.();
    }, 90);
    return () => window.clearTimeout(t);
  }, [pendingJump, note?.id, note?.content, pane]);

  useEffect(() => {
    const onOpenFind = (e: Event) => {
      if (getFindFocusPane() !== pane) return;
      const detail = (e as CustomEvent<{ seed?: string; replace?: boolean }>)
        .detail;
      setFindSeed(detail?.seed ?? "");
      setFindReplace(Boolean(detail?.replace));
      setFindOpen(true);
    };
    const onCloseFind = () => setFindOpen(false);
    window.addEventListener("nexus:find-open", onOpenFind);
    window.addEventListener("nexus:find-close", onCloseFind);
    return () => {
      window.removeEventListener("nexus:find-open", onOpenFind);
      window.removeEventListener("nexus:find-close", onCloseFind);
    };
  }, [pane]);

  const crumbs = useMemo(
    () => getBreadcrumbTrail(note ?? null, useVaultStore.getState().nodes),
    [note],
  );

  const revealFolder = (id: string) => {
    const s = useVaultStore.getState();
    const folder = s.nodes[id];
    if (!folder) return;
    if (folder.kind === "note") {
      s.setActiveNote(id);
      return;
    }
    const ids = new Set(s.expandedFolders);
    ids.add(id);
    let cur = folder;
    while (cur?.parentId) {
      ids.add(cur.parentId);
      cur = s.nodes[cur.parentId];
    }
    s.setExpandedFolders([...ids]);
    s.setLeftOpen(true);
  };

  useEffect(() => {
    setHydrateError(false);
    if (note?.kind !== "note" || note.content !== undefined) return;
    let cancelled = false;
    // Read the file now. Fill keeps the catalog lock; this path does not
    // upsert into it, so the open note must not wait for the walk to finish.
    const id = note.id;
    const path = note.path;
    let retry = 0;
    void ensureNoteBody(id).then((body: string | null) => {
      if (cancelled || body !== null) return;
      // A remembered note whose file is gone (an old daily note, a file
      // removed outside Nexus) used to strand the pane on an error page.
      // Try once more, then let it go and hand the cursor to the list.
      retry = window.setTimeout(() => {
        void ensureNoteBody(id).then((again: string | null) => {
          if (cancelled || again !== null) return;
          const st = useVaultStore.getState();
          if (isSecondary || st.activeNoteId !== id || st.dirtyNoteIds.includes(id)) {
            setHydrateError(true);
            return;
          }
          useVaultStore.setState({
            activeNoteId: null,
            settings: { ...st.settings, lastNotePath: null },
            toast: `${path} is not on disk anymore. Pick a note in the list.`,
          });
          revealFileList((tree) => {
            const active = document.activeElement as HTMLElement | null;
            if (!active || active === document.body) tree.focus({ preventScroll: true });
          });
        });
      }, 400);
    });
    return () => {
      cancelled = true;
      window.clearTimeout(retry);
    };
  }, [note?.id, note?.path, note?.content, ensureNoteBody, isSecondary]);

  // While a note is open this stays -1, so catalog page reloads do not
  // re-render the editor. The empty state is the only reader of the count.
  const noteCount = useVaultStore((s) => {
    if (s.activeNoteId || (pane === "secondary" && s.secondaryNoteId)) return -1;
    if (s.shellCatalog) return s.catalogNoteCount;
    let n = 0;
    const nodes = s.nodes;
    for (const id in nodes) {
      if (nodes[id]?.kind === "note") n += 1;
    }
    return n;
  });
  const startFirstNote = useCallback(() => {
    const id = useVaultStore.getState().createNote(null, "Untitled");
    if (!id) return;
    const safe =
      typeof CSS !== "undefined" && typeof CSS.escape === "function"
        ? CSS.escape(id)
        : id.replace(/["\\]/g, "\\$&");
    scheduleEmptyNoteRename(
      id,
      (noteId) => {
        window.dispatchEvent(new CustomEvent("nexus-rename-node", { detail: noteId }));
      },
      () =>
        Boolean(
          document.querySelector(`[data-testid="tree-rename"][data-rename-for="${safe}"]`),
        ),
    );
  }, []);

  useEffect(() => {
    if (isSecondary || noteCount !== 0) return;
    const idleNow = () => {
      if (document.querySelector("[data-nexus-confirm], [role='dialog']")) return false;
      const active = document.activeElement as HTMLElement | null;
      return (
        !active ||
        active === document.body ||
        active === document.documentElement ||
        Boolean(active.closest?.("[data-editor-empty='vault']"))
      );
    };
    // A brand-new vault lands on the list, opening it if it was collapsed.
    const land = () => {
      if (!idleNow()) return;
      revealFileList((tree) => {
        if (idleNow()) tree.focus({ preventScroll: true });
      });
    };
    land();
    const later = window.setTimeout(land, 160);
    // Enter with nothing focused starts the first note too.
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Enter" || e.defaultPrevented || e.repeat || e.isComposing) return;
      if (e.metaKey || e.ctrlKey || e.altKey || e.shiftKey) return;
      const t = e.target as HTMLElement | null;
      if (t?.closest?.("[data-file-tree], button, a, input, textarea, select, [contenteditable='true']")) return;
      if (!idleNow() && !(t === document.body || t === document.documentElement)) return;
      e.preventDefault();
      startFirstNote();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.clearTimeout(later);
      window.removeEventListener("keydown", onKey);
    };
  }, [isSecondary, noteCount, startFirstNote]);

  if (!note || note.kind !== "note") {
    if (isSecondary) {
      return (
        <div
          className="flex h-full min-w-0 flex-1 flex-col items-center justify-center bg-[var(--bg-deepest)] px-6 text-center"
          data-editor-pane="secondary"
        >
          <p className="text-[14px] text-[var(--text-secondary)]">
            Open a second note
          </p>
          <p className="mt-1 text-[12px] text-[var(--text-muted)]">
            Alt-click a file or wikilink to park it here.
          </p>
          <button
            type="button"
            className="ghost-btn mt-3"
            onClick={() => closeSecondaryPane()}
          >
            Close pane
          </button>
        </div>
      );
    }
    const emptyVault = noteCount === 0;
    return (
      <div
        className="fade-in flex h-full flex-col items-center justify-center px-8 text-center"
        data-editor-empty={emptyVault ? "vault" : "note"}
      >
        <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-2xl border border-[rgba(0,200,255,0.25)] bg-[rgba(0,200,255,0.08)] text-[var(--accent)] shadow-[0_0_40px_rgba(0,200,255,0.12)]">
          <NexusMark size={36} className="text-[var(--text-primary)]" />
        </div>
        <h2 className="text-[22px] font-semibold tracking-tight">
          {emptyVault ? "Start your vault" : "Select a note"}
        </h2>
        <p
          role={emptyVault ? "status" : undefined}
          data-testid={emptyVault ? "vault-first-run" : undefined}
          className={cn(
            "mt-2 max-w-sm leading-relaxed",
            emptyVault
              ? "text-[22px] font-semibold text-white"
              : "text-[14px] text-[var(--text-secondary)]",
          )}
        >
          {emptyVault
            ? "Enter starts a note."
            : "Click a note in the list to open it."}
        </p>
        <p className="mt-2 text-[12px] tracking-wide text-[var(--text-muted)]">
          {NEXUS_TAGLINE}
        </p>
        <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
          {emptyVault ? (
            <button
              type="button"
              className="primary-btn"
              onClick={() => startFirstNote()}
            >
              <FilePlus2 size={16} />
              New note
            </button>
          ) : (
            <NewNoteMenu variant="primary" title="New note" align="left">
              <FilePlus2 size={16} />
              New note
            </NewNoteMenu>
          )}
          <button
            type="button"
            className="ghost-btn"
            onClick={() => openDailyNote()}
          >
            <CalendarDays size={16} />
            Today's note
          </button>
          <button
            type="button"
            className="ghost-btn"
            onClick={() => setCommandOpen(true)}
          >
            Search {formatShortcut("K")}
          </button>
        </div>
      </div>
    );
  }

  // Wave 1: never mount editors with empty body while unloaded
  if (!isContentLoaded(note)) {
    if (hydrateError) {
      return (
        <div
          className="flex h-full min-w-0 flex-1 flex-col items-center justify-center bg-[var(--bg-deepest)] px-6 text-center"
          data-active-note={note.id}
          data-body-error="true"
        >
          <AlertCircle
            size={28}
            className="mb-3 text-[var(--danger)]"
            aria-hidden
          />
          <p className="text-[14px] text-[var(--text-secondary)]" role="alert">
            {mode === "fsa" || mode === "desktop" || (mode as string) === "sandbox"
              ? "Couldn't load this note from disk"
              : mode === "demo"
                ? "Couldn't restore this demo note"
                : "Couldn't restore this note"}
          </p>
          <p className="mt-1 text-[12px] text-[var(--text-muted)]">{note.path}</p>
          <button
            type="button"
            className="ghost-btn mt-4"
            onClick={() => {
              setHydrateError(false);
              void ensureNoteBody(note.id).then((body: string | null) => {
                if (body === null) setHydrateError(true);
              });
            }}
          >
            Retry
          </button>
        </div>
      );
    }
    return (
      <div
        className="flex h-full min-w-0 flex-1 flex-col items-center justify-center bg-[var(--bg-deepest)]"
        data-active-note={note.id}
        data-editor-pane={pane}
        data-testid="nexus-editor"
        data-body-loading="true"
        role="status"
        aria-live="polite"
      >
        <Loader2
          size={28}
          className="mb-3 animate-spin text-[var(--accent)]"
          aria-hidden
        />
        <p className="text-[14px] text-[var(--text-secondary)]">Loading note…</p>
        <p className="mt-1 text-[12px] text-[var(--text-muted)]">{note.path}</p>
      </div>
    );
  }

  const body = note.content ?? "";
  const canvasNote = isCanvasNote(body);
  const editorKey = `${editorMode}::${canvasNote ? "canvas" : "note"}`;
  const previewBody = splitLive?.id === note.id ? splitLive.text : body;

  return (
    <div
      className="flex h-full min-w-0 flex-1 flex-col bg-[var(--bg-deepest)]"
      data-active-note={note.id}
      data-editor-pane={pane}
      data-testid="nexus-editor"
      onPointerDownCapture={() => setFindFocusPane(pane)}
    >
      <div className="flex h-12 shrink-0 items-center gap-1.5 border-b border-[var(--border)] px-2 sm:gap-2 sm:px-3 md:px-4">
        <div className="min-w-0 flex-1">
          {/* Parent path only — note title lives in NoteTitleInput (avoids Untitled / Untitled) */}
          {crumbs.length > 0 ? (
            <div
              className="hidden items-center gap-1.5 truncate text-[11px] text-[var(--text-muted)] sm:flex"
              title={crumbs.map((c) => c.name).join(" / ")}
            >
              {crumbs.map((c, i) => (
                <span key={`${c.id}-${i}`} className="flex min-w-0 items-center gap-1.5">
                  {i > 0 ? <span className="shrink-0 opacity-40">/</span> : null}
                  <button
                    type="button"
                    className="truncate rounded-sm hover:text-[var(--text-secondary)] hover:underline"
                    onClick={() => revealFolder(c.id)}
                  >
                    {c.name}
                  </button>
                </span>
              ))}
            </div>
          ) : (
            <div className="hidden text-[11px] text-[var(--text-muted)] sm:block">
              Vault root
            </div>
          )}
          <div className="flex min-w-0 items-center gap-2">
            <div className="min-w-0 flex-1">
              {(() => {
                const dailyDate = parseJournalDailyDate(note.path);
                return dailyDate ? (
                  <div
                    className="truncate text-[15px] font-semibold tracking-tight"
                    title={note.path}
                  >
                    {formatDateLong(dailyDate)}
                  </div>
                ) : (
                  <NoteTitleInput noteId={note.id} />
                );
              })()}
            </div>
            {isTodayDailyPath(note.path) ? (
              <span className="shrink-0 rounded-full border border-[color-mix(in_srgb,var(--accent)_40%,transparent)] bg-[var(--accent-dim)] px-1.5 py-px text-[10px] font-medium tracking-wide text-[var(--accent)]">
                Today
              </span>
            ) : isJournalDailyPath(note.path) ? (
              <span className="shrink-0 rounded-full border border-[var(--border)] px-1.5 py-px text-[10px] text-[var(--text-muted)]">
                Daily
              </span>
            ) : null}
            <button
              type="button"
              className={cn(
                "icon-btn h-7 w-7 shrink-0",
                (pinnedNotePaths ?? []).includes(note.path) && "text-[var(--accent)]",
              )}
              title={
                (pinnedNotePaths ?? []).includes(note.path)
                  ? "Unpin note"
                  : "Pin note"
              }
              aria-label={
                (pinnedNotePaths ?? []).includes(note.path)
                  ? "Unpin note"
                  : "Pin note"
              }
              aria-pressed={(pinnedNotePaths ?? []).includes(note.path)}
              onClick={() => togglePinnedNote(note.id)}
            >
              <Pin
                size={14}
                fill={(pinnedNotePaths ?? []).includes(note.path) ? "currentColor" : "none"}
              />
            </button>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-0.5 sm:gap-1">
          {focusMode ? (
            <button
              type="button"
              className="chip-btn is-active"
              title={`Exit focus mode (${formatShortcut(".")})`}
              onClick={() => setFocusMode(false)}
            >
              <Focus size={13} />
              <span className="hidden sm:inline">Exit focus</span>
            </button>
          ) : (
            <>
              <div className="mr-1.5">
                <EditorSaveChip />
              </div>
              <span className="mr-2 hidden text-[11px] text-[var(--text-muted)] lg:inline">
                {mode === "fsa" || mode === "desktop" || (mode as string) === "sandbox"
                  ? "on disk · "
                  : ""}
                {formatRelativeTime(note.mtime)}
              </span>
              <div
                className="editor-mode-cluster flex items-center gap-0.5 rounded-[10px] border border-[var(--border)] bg-white/[0.02] p-0.5"
                role="toolbar"
                aria-label="Editor tools"
              >
                <button
                  type="button"
                  className={cn("chip-btn !border-0", findOpen && "is-active")}
                  onClick={() => {
                    setFindFocusPane(pane);
                    if (findOpen) setFindOpen(false);
                    else {
                      const sel = window.getSelection()?.toString()?.trim() ?? "";
                      setFindSeed(sel.slice(0, 120));
                      setFindOpen(true);
                    }
                  }}
                  title={`Find in note (${formatShortcut("F")})`}
                  aria-pressed={findOpen}
                >
                  <Search size={13} />
                  <span className="hidden md:inline">Find</span>
                </button>
                <button
                  type="button"
                  className={cn(
                    "chip-btn !border-0",
                    editorMode === "visual" && "is-active",
                  )}
                  onClick={() => setEditorMode("visual")}
                  title="Visual mode"
                  aria-pressed={editorMode === "visual"}
                >
                  <Eye size={13} />
                  <span className="hidden md:inline">
                    {canvasNote ? "Tour board" : "Visual"}
                  </span>
                </button>
                <button
                  type="button"
                  className={cn(
                    "chip-btn !border-0",
                    editorMode === "source" && "is-active",
                  )}
                  onClick={() => setEditorMode("source")}
                  title={`Source mode (${formatShortcut("E")})`}
                  aria-pressed={editorMode === "source"}
                >
                  <Code2 size={13} />
                  <span className="hidden md:inline">Source</span>
                </button>
                {!canvasNote ? (
                  <button
                    type="button"
                    className={cn(
                      "chip-btn !border-0",
                      editorMode === "split" && "is-active",
                    )}
                    onClick={() => setEditorMode("split")}
                    title="Source + live preview of this note"
                    aria-pressed={editorMode === "split"}
                  >
                    <Columns2 size={13} />
                    <span className="hidden md:inline">Preview</span>
                  </button>
                ) : null}
                {!isSecondary ? (
                  <button
                    type="button"
                    className={cn(
                      "chip-btn !border-0 hidden sm:inline-flex",
                      workspaceSplit && "is-active",
                    )}
                    onClick={() => toggleWorkspaceSplit()}
                    title="Dual note workspace (⌘2)"
                    aria-pressed={workspaceSplit}
                  >
                    <Columns2 size={13} />
                    <span className="hidden md:inline">Pane</span>
                  </button>
                ) : (
                  <>
                    <button
                      type="button"
                      className="chip-btn !border-0 hidden sm:inline-flex"
                      onClick={() => swapWorkspacePanes()}
                      title="Swap panes"
                    >
                      <ArrowLeftRight size={13} />
                    </button>
                    <button
                      type="button"
                      className="chip-btn !border-0"
                      onClick={() => closeSecondaryPane()}
                      title="Close pane"
                    >
                      <X size={13} />
                    </button>
                  </>
                )}
                <button
                  type="button"
                  className={cn(
                    "chip-btn !border-0 hidden md:inline-flex",
                    (graphMode === "fullscreen" ||
                      (graphMode === "panel" &&
                        rightOpen &&
                        rightTab === "graph")) &&
                      "is-active",
                  )}
                  onClick={() => toggleGraphForViewport()}
                  title={`Fullscreen graph (${formatShortcut("G")}) — Esc or Exit to leave`}
                  aria-pressed={
                    graphMode === "fullscreen" ||
                    (graphMode === "panel" && rightOpen && rightTab === "graph")
                  }
                >
                  <Network size={13} />
                  <span className="hidden md:inline">Graph</span>
                </button>
              </div>
              <button
                type="button"
                className="icon-btn ml-0.5 hidden sm:inline-flex md:hidden"
                onClick={() => setLeftOpen(!leftOpen)}
                title="Toggle files"
                aria-label="Toggle files sidebar"
                aria-expanded={leftOpen}
              >
                {leftOpen ? (
                  <PanelLeftClose size={16} />
                ) : (
                  <PanelLeftOpen size={16} />
                )}
              </button>
              <button
                type="button"
                className="icon-btn hidden md:inline-flex"
                onClick={() => setRightOpen(!rightOpen)}
                title="Toggle right panel"
                aria-label="Toggle right panel"
                aria-expanded={rightOpen}
              >
                {rightOpen ? (
                  <PanelRightClose size={16} />
                ) : (
                  <PanelRightOpen size={16} />
                )}
              </button>
            </>
          )}
        </div>
      </div>

      <ConflictBanner />

      <FindInNoteBar
        open={findOpen}
        onOpenChange={setFindOpen}
        seedQuery={findSeed}
        replaceMode={findReplace}
        pane={pane}
      />

      <FrontmatterEditor noteId={note.id} content={body} />

      <div
        key={editorKey}
        className="editor-surface-enter flex min-h-0 flex-1 flex-col"
      >
        {editorMode === "visual" && canvasNote ? (
          <CanvasBoard noteId={note.id} content={body} />
        ) : editorMode === "visual" ? (
          <VisualEditor noteId={note.id} content={body} pane={pane} />
        ) : editorMode === "split" && !canvasNote ? (
          <div className="nexus-split">
            <div className="nexus-split-pane">
              <SourceEditor
                noteId={note.id}
                content={body}
                pane={pane}
                onLiveChange={(text) => setSplitLive({ id: note.id, text })}
              />
            </div>
            <div className="nexus-split-pane">
              <div className="shrink-0 border-b border-[var(--border)] px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--text-muted)]">
                Live preview
              </div>
              <SourcePreview content={previewBody} noteId={note.id} />
            </div>
          </div>
        ) : (
          <SourceEditor noteId={note.id} content={body} pane={pane} />
        )}
      </div>
      <EditorStatusBar noteId={note.id} />
    </div>
  );
}
