import { useMemo } from "react";
import {
  Code2,
  Eye,
  Network,
  PanelRightClose,
  PanelRightOpen,
  FilePlus2,
} from "lucide-react";
import { useVaultStore, getBreadcrumbs, getNoteDisplayTitle } from "@/lib/vault/store";
import { VisualEditor } from "./VisualEditor";
import { SourceEditor } from "./SourceEditor";
import { formatRelativeTime, cn } from "@/lib/utils";

export function EditorPane() {
  const activeNoteId = useVaultStore((s) => s.activeNoteId);
  const nodes = useVaultStore((s) => s.nodes);
  const editorMode = useVaultStore((s) => s.settings.editorMode);
  const graphMode = useVaultStore((s) => s.settings.graphMode);
  const rightOpen = useVaultStore((s) => s.settings.rightOpen);
  const mode = useVaultStore((s) => s.mode);
  const toggleGraphFullscreen = useVaultStore((s) => s.toggleGraphFullscreen);
  const setRightOpen = useVaultStore((s) => s.setRightOpen);
  const renameNode = useVaultStore((s) => s.renameNode);
  const createNote = useVaultStore((s) => s.createNote);
  const setCommandOpen = useVaultStore((s) => s.setCommandOpen);
  const setEditorMode = useVaultStore((s) => s.setEditorMode);

  const note = activeNoteId ? nodes[activeNoteId] : null;
  const crumbs = useMemo(() => getBreadcrumbs(note ?? null, nodes), [note, nodes]);

  if (!note || note.kind !== "note") {
    return (
      <div className="fade-in flex h-full flex-col items-center justify-center px-8 text-center">
        <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-2xl border border-[rgba(0,200,255,0.25)] bg-[rgba(0,200,255,0.08)] text-[var(--accent)] shadow-[0_0_40px_rgba(0,200,255,0.12)]">
          <Eye size={28} />
        </div>
        <h2 className="text-[22px] font-semibold tracking-tight">Select a note</h2>
        <p className="mt-2 max-w-sm text-[14px] leading-relaxed text-[var(--text-secondary)]">
          Choose a file from the vault, search with ⌘K, or create a note. Writing surface stays calm —
          power features live in the edges.
        </p>
        <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
          <button
            type="button"
            className="primary-btn"
            onClick={() => createNote(null, "Untitled")}
          >
            <FilePlus2 size={16} />
            New note
          </button>
          <button
            type="button"
            className="ghost-btn"
            onClick={() => setCommandOpen(true)}
          >
            Search ⌘K
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full min-w-0 flex-1 flex-col bg-[var(--bg-deepest)]">
      <div className="flex h-12 shrink-0 items-center gap-2 border-b border-[var(--border)] px-3 md:px-4">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 text-[11px] text-[var(--text-muted)]">
            {crumbs.map((c, i) => (
              <span key={i} className="flex items-center gap-1.5">
                {i > 0 ? <span className="opacity-40">/</span> : null}
                <span
                  className={cn(
                    i === crumbs.length - 1 && "text-[var(--text-secondary)]",
                  )}
                >
                  {c}
                </span>
              </span>
            ))}
          </div>
          <input
            key={note.id}
            className="w-full bg-transparent text-[15px] font-semibold tracking-tight text-[var(--text-primary)] outline-none"
            defaultValue={getNoteDisplayTitle(note)}
            onBlur={(e) => {
              const v = e.target.value.trim();
              if (v && v !== getNoteDisplayTitle(note)) renameNode(note.id, v);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") (e.target as HTMLInputElement).blur();
            }}
            aria-label="Note title"
          />
        </div>

        <div className="flex shrink-0 items-center gap-1">
          <span className="mr-2 hidden text-[11px] text-[var(--text-muted)] sm:inline">
            {mode === "fsa" ? "on disk · " : ""}
            {formatRelativeTime(note.mtime)}
          </span>
          <button
            type="button"
            className={cn("chip-btn", editorMode === "visual" && "is-active")}
            onClick={() => setEditorMode("visual")}
            title="Visual mode"
          >
            <Eye size={13} />
            <span className="hidden sm:inline">Visual</span>
          </button>
          <button
            type="button"
            className={cn("chip-btn", editorMode === "source" && "is-active")}
            onClick={() => setEditorMode("source")}
            title="Source mode (⌘E)"
          >
            <Code2 size={13} />
            <span className="hidden sm:inline">Source</span>
          </button>
          <button
            type="button"
            className={cn("chip-btn", graphMode === "fullscreen" && "is-active")}
            onClick={toggleGraphFullscreen}
            title="Graph (⌘G)"
          >
            <Network size={13} />
            <span className="hidden sm:inline">Graph</span>
          </button>
          <button
            type="button"
            className="icon-btn ml-1"
            onClick={() => setRightOpen(!rightOpen)}
            title="Toggle right panel"
          >
            {rightOpen ? <PanelRightClose size={16} /> : <PanelRightOpen size={16} />}
          </button>
        </div>
      </div>

      {editorMode === "visual" ? (
        <VisualEditor noteId={note.id} content={note.content ?? ""} />
      ) : (
        <SourceEditor noteId={note.id} content={note.content ?? ""} />
      )}
    </div>
  );
}
