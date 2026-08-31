import { useEffect, useMemo, useState } from "react";
import {
  Code2,
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
} from "lucide-react";
import { useVaultStore, getBreadcrumbs } from "@/lib/vault/store";
import { isContentLoaded } from "@/lib/vault/content";
import { VisualEditor } from "./VisualEditor";
import { SourceEditor } from "./SourceEditor";
import { formatRelativeTime, cn } from "@/lib/utils";
import { NoteTitleInput } from "./NoteTitleInput";
import { EditorSaveChip } from "./EditorSaveChip";
import { NexusMark, NEXUS_TAGLINE } from "@/components/brand/NexusLogo";
import { usePrefsStore } from "@/lib/prefs/preferences";
import { setFocusMode } from "@/lib/prefs/focus-mode";
import { NewNoteMenu } from "@/components/vault/NewNoteMenu";
import { ConflictBanner } from "@/components/conflict/ConflictStudioHost";
import { formatShortcut } from "@/lib/platform";

export function EditorPane() {
  const nodes = useVaultStore((s) => s.nodes);
  const editorMode = useVaultStore((s) => s.settings.editorMode);
  const graphMode = useVaultStore((s) => s.settings.graphMode);
  const rightOpen = useVaultStore((s) => s.settings.rightOpen);
  const leftOpen = useVaultStore((s) => s.settings.leftOpen);
  const mode = useVaultStore((s) => s.mode);
  const toggleGraphFullscreen = useVaultStore((s) => s.toggleGraphFullscreen);
  const setRightOpen = useVaultStore((s) => s.setRightOpen);
  const setLeftOpen = useVaultStore((s) => s.setLeftOpen);
  const openDailyNote = useVaultStore((s) => s.openDailyNote);
  const setCommandOpen = useVaultStore((s) => s.setCommandOpen);
  const setEditorMode = useVaultStore((s) => s.setEditorMode);
  const focusMode = usePrefsStore((s) => s.focusMode);

  const note = useVaultStore((s) =>
    s.activeNoteId ? (s.nodes[s.activeNoteId] ?? null) : null,
  );
  const ensureNoteBody = useVaultStore((s) => s.ensureNoteBody);
  const [hydrateError, setHydrateError] = useState(false);
  const crumbs = useMemo(
    () => getBreadcrumbs(note ?? null, nodes),
    [note, nodes],
  );

  useEffect(() => {
    setHydrateError(false);
    if (note?.kind === "note" && note.content === undefined) {
      let cancelled = false;
      void ensureNoteBody(note.id).then((body: string | null) => {
        if (cancelled) return;
        if (body === null) setHydrateError(true);
      });
      return () => {
        cancelled = true;
      };
    }
  }, [note?.id, note?.content, ensureNoteBody]);

  const noteCount = useMemo(
    () => Object.values(nodes).filter((n) => n.kind === "note").length,
    [nodes],
  );
  const createNote = useVaultStore((s) => s.createNote);

  if (!note || note.kind !== "note") {
    const emptyVault = noteCount === 0;
    return (
      <div className="fade-in flex h-full flex-col items-center justify-center px-8 text-center">
        <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-2xl border border-[rgba(0,200,255,0.25)] bg-[rgba(0,200,255,0.08)] text-[var(--accent)] shadow-[0_0_40px_rgba(0,200,255,0.12)]">
          <NexusMark size={36} className="text-[var(--text-primary)]" />
        </div>
        <h2 className="text-[22px] font-semibold tracking-tight">
          {emptyVault ? "Start your vault" : "Select a note"}
        </h2>
        <p className="mt-2 max-w-sm text-[14px] leading-relaxed text-[var(--text-secondary)]">
          {emptyVault
            ? "Create your first note, open today's daily page, or search anytime."
            : `Choose a file from the vault, search with ${formatShortcut("K")}, or create a note.`}
        </p>
        <p className="mt-2 text-[12px] tracking-wide text-[var(--text-muted)]">
          {NEXUS_TAGLINE}
        </p>
        <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
          {emptyVault ? (
            <button
              type="button"
              className="primary-btn"
              onClick={() => createNote(null)}
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
            className="mb-3 text-[var(--accent)]"
            aria-hidden
          />
          <p className="text-[14px] text-[var(--text-secondary)]">
            Couldn't load this note from disk
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
        data-body-loading="true"
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
  const editorKey = `${note.id}::${editorMode}`;

  return (
    <div
      className="flex h-full min-w-0 flex-1 flex-col bg-[var(--bg-deepest)]"
      data-active-note={note.id}
    >
      <div className="flex h-12 shrink-0 items-center gap-2 border-b border-[var(--border)] px-3 md:px-4">
        <div className="min-w-0 flex-1">
          {/* Parent path only — note title lives in NoteTitleInput (avoids Untitled / Untitled) */}
          {crumbs.length > 0 ? (
            <div
              className="flex items-center gap-1.5 truncate text-[11px] text-[var(--text-muted)]"
              title={crumbs.join(" / ")}
            >
              {crumbs.map((c, i) => (
                <span key={`${c}-${i}`} className="flex min-w-0 items-center gap-1.5">
                  {i > 0 ? <span className="shrink-0 opacity-40">/</span> : null}
                  <span className="truncate">{c}</span>
                </span>
              ))}
            </div>
          ) : (
            <div className="text-[11px] text-[var(--text-muted)]">Vault root</div>
          )}
          <NoteTitleInput noteId={note.id} />
        </div>

        <div className="flex shrink-0 items-center gap-1">
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
              <div className="mr-1.5 hidden sm:block">
                <EditorSaveChip />
              </div>
              <span className="mr-2 hidden text-[11px] text-[var(--text-muted)] lg:inline">
                {mode === "fsa" || mode === "desktop" || (mode as string) === "sandbox"
                  ? "on disk · "
                  : ""}
                {formatRelativeTime(note.mtime)}
              </span>
              <button
                type="button"
                className={cn("chip-btn", editorMode === "visual" && "is-active")}
                onClick={() => setEditorMode("visual")}
                title="Visual mode"
                aria-pressed={editorMode === "visual"}
              >
                <Eye size={13} />
                <span className="hidden sm:inline">Visual</span>
              </button>
              <button
                type="button"
                className={cn("chip-btn", editorMode === "source" && "is-active")}
                onClick={() => setEditorMode("source")}
                title={`Source mode (${formatShortcut("E")})`}
                aria-pressed={editorMode === "source"}
              >
                <Code2 size={13} />
                <span className="hidden sm:inline">Source</span>
              </button>
              <button
                type="button"
                className={cn("chip-btn", graphMode === "fullscreen" && "is-active")}
                onClick={toggleGraphFullscreen}
                title={`Graph (${formatShortcut("G")})`}
                aria-pressed={graphMode === "fullscreen"}
              >
                <Network size={13} />
                <span className="hidden sm:inline">Graph</span>
              </button>
              <button
                type="button"
                className="icon-btn ml-1 md:hidden"
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
                className="icon-btn ml-1"
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

      <div
        key={editorKey}
        className="editor-surface-enter flex min-h-0 flex-1 flex-col"
      >
        {editorMode === "visual" ? (
          <VisualEditor noteId={note.id} content={body} />
        ) : (
          <SourceEditor noteId={note.id} content={body} />
        )}
      </div>
    </div>
  );
}
