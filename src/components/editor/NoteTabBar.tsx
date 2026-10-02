import { useRef } from "react";
import { X } from "lucide-react";
import { useVaultStore, type EditorPaneRole } from "@/lib/vault/store";
import { noteTitle } from "@/lib/vault/types";
import { focusEditorPane } from "@/lib/editor/pane-focus";
import { setFindFocusPane } from "@/lib/editor/find-target";
import { revealFileList } from "@/lib/chrome/reveal-list";
import { cn } from "@/lib/utils";

let dragging: { pane: EditorPaneRole; id: string } | null = null;

function focusAfterClose(pane: EditorPaneRole, nextId: string | null) {
  if (nextId) {
    focusEditorPane(pane);
    return;
  }
  if (pane === "secondary") {
    const primary = useVaultStore.getState().activeNoteId;
    if (primary) focusEditorPane("primary");
    else revealFileList((tree) => tree.focus({ preventScroll: true }));
    return;
  }
  revealFileList((tree) => tree.focus({ preventScroll: true }));
}

export function NoteTabBar({ pane }: { pane: EditorPaneRole }) {
  const tabs = useVaultStore((s) => (pane === "secondary" ? s.secondaryTabs : s.primaryTabs));
  const activeId = useVaultStore((s) =>
    pane === "secondary" ? s.secondaryNoteId : s.activeNoteId,
  );
  const label = useVaultStore((s) => {
    const ids = pane === "secondary" ? s.secondaryTabs : s.primaryTabs;
    let text = "";
    for (const id of ids) {
      const n = s.nodes[id];
      text += (n?.kind === "note" ? noteTitle(n) : "") + "\n";
    }
    return text;
  });
  const titles = label.split("\n");
  const stripRef = useRef<HTMLDivElement>(null);

  if (!tabs?.length) return null;

  const show = (id: string) => {
    setFindFocusPane(pane);
    const store = useVaultStore.getState();
    const current = pane === "secondary" ? store.secondaryNoteId : store.activeNoteId;
    if (current !== id) store.setActiveNote(id, { pane, silent: true });
  };

  const close = (id: string) => {
    const next = useVaultStore.getState().closeNoteTab(pane, id);
    focusAfterClose(pane, next);
  };

  return (
    <div
      ref={stripRef}
      role="tablist"
      aria-label={pane === "secondary" ? "Second pane notes" : "Open notes"}
      data-testid="note-tabbar"
      data-tab-pane={pane}
      className="flex h-9 shrink-0 items-end gap-0.5 overflow-x-auto border-b border-[var(--border)] bg-[var(--bg-deepest)] px-1"
    >
      {tabs.map((id, i) => {
        const title = titles[i] || "Note";
        const selected = id === activeId;
        return (
          <div
            key={id}
            role="tab"
            aria-selected={selected}
            tabIndex={selected ? 0 : -1}
            data-testid="note-tab"
            data-note-tab={id}
            data-tab-pane={pane}
            draggable
            title={title}
            onClick={() => {
              show(id);
              focusEditorPane(pane);
            }}
            onKeyDown={(e) => {
              if (e.key === "Delete" || e.key === "Backspace") {
                e.preventDefault();
                close(id);
                return;
              }
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                show(id);
                focusEditorPane(pane);
                return;
              }
              if (e.key !== "ArrowLeft" && e.key !== "ArrowRight" && e.key !== "Home" && e.key !== "End") {
                return;
              }
              e.preventDefault();
              const nextIndex =
                e.key === "Home"
                  ? 0
                  : e.key === "End"
                    ? tabs.length - 1
                    : e.key === "ArrowLeft"
                      ? Math.max(0, i - 1)
                      : Math.min(tabs.length - 1, i + 1);
              const next = tabs[nextIndex];
              if (!next) return;
              show(next);
              window.requestAnimationFrame(() => {
                stripRef.current
                  ?.querySelector<HTMLElement>(`[data-note-tab="${cssEscape(next)}"]`)
                  ?.focus({ preventScroll: true });
              });
            }}
            onAuxClick={(e) => {
              if (e.button !== 1) return;
              e.preventDefault();
              e.stopPropagation();
              close(id);
            }}
            onDragStart={(e) => {
              dragging = { pane, id };
              e.dataTransfer.setData("text/plain", id);
              e.dataTransfer.effectAllowed = "move";
            }}
            onDragEnd={() => {
              dragging = null;
            }}
            onDragOver={(e) => {
              if (!dragging || dragging.pane !== pane) return;
              e.preventDefault();
              e.dataTransfer.dropEffect = "move";
            }}
            onDrop={(e) => {
              e.preventDefault();
              const from = dragging?.pane === pane ? dragging.id : e.dataTransfer.getData("text/plain");
              dragging = null;
              if (!from || from === id) return;
              useVaultStore.getState().reorderNoteTabs(pane, from, id);
            }}
            className={cn(
              "group mb-0 flex h-7 min-w-[4.5rem] max-w-[11rem] shrink-0 cursor-pointer items-center gap-1 rounded-t-md px-2 text-[12px] outline-none",
              selected
                ? "bg-[var(--accent-dim)] text-[var(--text-primary)] shadow-[inset_0_-2px_0_var(--accent)]"
                : "text-[var(--text-secondary)] hover:bg-white/[0.04]",
              "focus-visible:ring-2 focus-visible:ring-[var(--accent)]",
            )}
          >
            <span className="min-w-0 flex-1 truncate">{title}</span>
            <button
              type="button"
              data-testid="note-tab-close"
              aria-label={`Close ${title}`}
              draggable={false}
              tabIndex={-1}
              className={cn(
                "inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-sm text-[var(--text-muted)] hover:bg-white/10 hover:text-[var(--text-primary)]",
                selected ? "opacity-100" : "opacity-0 group-hover:opacity-100 group-focus-within:opacity-100",
              )}
              onMouseDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                close(id);
              }}
            >
              <X size={12} />
            </button>
          </div>
        );
      })}
    </div>
  );
}

function cssEscape(id: string): string {
  if (typeof CSS !== "undefined" && typeof CSS.escape === "function") return CSS.escape(id);
  return id.replace(/["\\]/g, "\\$&");
}
