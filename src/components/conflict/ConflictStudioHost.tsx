/**
 * Wave C — Conflict Studio modal host + resolve workbench.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AlertTriangle, X } from "lucide-react";
import { ConfirmDialog } from "@/components/chrome/ConfirmDialog";
import { useVaultStore } from "@/lib/vault/store";
import { cn } from "@/lib/utils";

function previewBody(body: string | undefined): string {
  if (body === undefined) return "Loading…";
  if (!body.trim()) return "(empty)";
  return body.length > 12000 ? body.slice(0, 12000) + "\n…" : body;
}

export function ConflictStudioHost() {
  const open = useVaultStore((s) => s.conflictStudioOpen);
  const focus = useVaultStore((s) => s.conflictStudioFocus);
  const nodes = useVaultStore((s) => s.nodes);
  const dirtyNoteIds = useVaultStore((s) => s.dirtyNoteIds);
  const closeConflictStudio = useVaultStore((s) => s.closeConflictStudio);
  const setConflictStudioFocus = useVaultStore((s) => s.setConflictStudioFocus);
  const resolveConflictKeepMine = useVaultStore((s) => s.resolveConflictKeepMine);
  const resolveConflictTakeTheirs = useVaultStore(
    (s) => s.resolveConflictTakeTheirs,
  );
  const openConflictPair = useVaultStore((s) => s.openConflictPair);
  const dismissConflictFromList = useVaultStore((s) => s.dismissConflictFromList);
  const getConflictItems = useVaultStore((s) => s.getConflictItems);
  const dismissedConflictKeys = useVaultStore((s) => s.dismissedConflictKeys);
  const ensureNoteBody = useVaultStore((s) => s.ensureNoteBody);
  const setActiveNote = useVaultStore((s) => s.setActiveNote);

  const [items, setItems] = useState(() => getConflictItems());
  const [mobileSide, setMobileSide] = useState<"mine" | "theirs">("mine");
  const [confirmTake, setConfirmTake] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const prevFocusRef = useRef<HTMLElement | null>(null);

  // Resample when vault structure changes
  useEffect(() => {
    if (!open) return;
    setItems(getConflictItems());
  }, [open, nodes, getConflictItems, dismissedConflictKeys]);

  const activeItem = useMemo(() => {
    if (!focus) return items[0] ?? null;
    return (
      items.find(
        (i: any) =>
          i.primaryPath === focus.primaryPath &&
          i.sibling.path === focus.siblingPath,
      ) ??
      items[0] ??
      null
    );
  }, [items, focus]);

  const primaryId = activeItem?.primaryId ?? null;
  const siblingId = activeItem?.sibling.id ?? null;
  const primaryBody =
    primaryId && nodes[primaryId]?.kind === "note"
      ? nodes[primaryId].content
      : undefined;
  const siblingBody =
    siblingId && nodes[siblingId]?.kind === "note"
      ? nodes[siblingId].content
      : undefined;
  const primaryDirty =
    !!primaryId && dirtyNoteIds.includes(primaryId);

  useEffect(() => {
    if (!open || !activeItem) return;
    if (primaryId) void ensureNoteBody(primaryId);
    if (siblingId) void ensureNoteBody(siblingId);
  }, [open, activeItem, primaryId, siblingId, ensureNoteBody]);


  useEffect(() => {
    if (!open) return;
    prevFocusRef.current =
      typeof document !== "undefined"
        ? (document.activeElement as HTMLElement | null)
        : null;
    const root = panelRef.current;
    if (root) {
      root.tabIndex = -1;
      try {
        root.focus({ preventScroll: true });
      } catch {
        /* ignore */
      }
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Tab" || !panelRef.current || confirmTake) return;
      const focusable = panelRef.current.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
      );
      if (!focusable.length) return;
      const first = focusable[0]!;
      const last = focusable[focusable.length - 1]!;
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => {
      window.removeEventListener("keydown", onKey, true);
      const prev = prevFocusRef.current;
      if (prev && typeof prev.focus === "function") {
        try {
          prev.focus({ preventScroll: true });
        } catch {
          /* ignore */
        }
      }
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        if (confirmTake) setConfirmTake(false);
        else closeConflictStudio();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [open, confirmTake, closeConflictStudio]);

  if (!open || typeof document === "undefined") return null;

  const title = activeItem?.title ?? "Conflicts";

  return createPortal(
    <>
      <div
        className="fixed inset-0 z-[200] flex items-end justify-center bg-black/60 backdrop-blur-[2px] sm:items-center sm:p-4"
        role="presentation"
        onMouseDown={(e) => {
          if (e.target === e.currentTarget) closeConflictStudio();
        }}
      >
        <div
          ref={panelRef}
          role="dialog"
          aria-modal="true"
          aria-label="Conflict Studio"
          data-conflict-studio="true"
          className={cn(
            "glass-elevated flex w-full flex-col border border-[var(--border-strong)] bg-[var(--bg-elevated)] shadow-2xl",
            "h-[100dvh] max-h-[100dvh] rounded-none sm:h-auto sm:max-h-[min(720px,90dvh)] sm:max-w-[min(920px,96vw)] sm:rounded-[var(--radius-xl)]",
          )}
        >
          <header className="flex shrink-0 items-start gap-3 border-b border-[var(--border)] px-4 py-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-[rgba(255,69,58,0.35)] bg-[rgba(255,69,58,0.12)] text-[var(--danger)]">
              <AlertTriangle size={18} />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-[15px] font-semibold text-[var(--text-primary)]">
                Conflict Studio
              </div>
              <p className="truncate text-[12px] text-[var(--text-muted)]">
                {activeItem
                  ? `${activeItem.primaryPath} · ${items.length} open`
                  : "No open conflicts"}
              </p>
            </div>
            <button
              type="button"
              className="icon-btn"
              aria-label="Close"
              onClick={() => closeConflictStudio()}
            >
              <X size={16} />
            </button>
          </header>

          {items.length > 1 ? (
            <div className="flex shrink-0 gap-1 overflow-x-auto border-b border-[var(--border)] px-3 py-2">
              {items.map((it: any) => (
                <button
                  key={it.key}
                  type="button"
                  className={cn(
                    "shrink-0 rounded-full border px-2.5 py-1 text-[11px] font-medium transition",
                    activeItem?.key === it.key
                      ? "border-[rgba(0,200,255,0.4)] bg-[rgba(0,200,255,0.12)] text-[var(--accent)]"
                      : "border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--text-secondary)]",
                  )}
                  onClick={() =>
                    setConflictStudioFocus({
                      primaryPath: it.primaryPath,
                      siblingPath: it.sibling.path,
                    })
                  }
                >
                  {it.title}
                </button>
              ))}
            </div>
          ) : null}

          {!activeItem ? (
            <div className="flex flex-1 items-center justify-center p-8 text-[13px] text-[var(--text-muted)]">
              All conflicts resolved.
            </div>
          ) : (
            <>
              {/* Mobile side switcher */}
              <div className="flex shrink-0 gap-1 border-b border-[var(--border)] px-3 py-2 sm:hidden">
                {(["mine", "theirs"] as const).map((side) => (
                  <button
                    key={side}
                    type="button"
                    className={cn(
                      "flex-1 rounded-full border px-2 py-1.5 text-[12px] font-medium",
                      mobileSide === side
                        ? "border-[rgba(0,200,255,0.4)] bg-[rgba(0,200,255,0.12)] text-[var(--accent)]"
                        : "border-[var(--border)] text-[var(--text-muted)]",
                    )}
                    onClick={() => setMobileSide(side)}
                  >
                    {side === "mine" ? "Yours" : "Theirs"}
                  </button>
                ))}
              </div>

              <div className="grid min-h-0 flex-1 grid-cols-1 sm:grid-cols-2">
                <div
                  className={cn(
                    "flex min-h-0 flex-col border-[var(--border)] sm:border-r",
                    mobileSide !== "mine" && "hidden sm:flex",
                  )}
                >
                  <div className="flex items-center justify-between gap-2 px-3 py-2">
                    <span className="text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--accent)]">
                      Yours · kept
                      {primaryDirty ? " · unsaved" : ""}
                    </span>
                    <button
                      type="button"
                      className="text-[11px] text-[var(--text-muted)] hover:text-[var(--accent)]"
                      onClick={() => primaryId && setActiveNote(primaryId)}
                    >
                      Open
                    </button>
                  </div>
                  <pre className="min-h-0 flex-1 overflow-auto bg-[var(--bg-deepest)] p-3 font-mono text-[12.5px] leading-relaxed text-[var(--text-secondary)] whitespace-pre-wrap">
                    {previewBody(primaryBody)}
                  </pre>
                </div>
                <div
                  className={cn(
                    "flex min-h-0 flex-col",
                    mobileSide !== "theirs" && "hidden sm:flex",
                  )}
                >
                  <div className="flex items-center justify-between gap-2 px-3 py-2">
                    <span className="text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--warning)]">
                      From disk
                    </span>
                    <button
                      type="button"
                      className="text-[11px] text-[var(--text-muted)] hover:text-[var(--accent)]"
                      onClick={() => siblingId && setActiveNote(siblingId)}
                    >
                      Open
                    </button>
                  </div>
                  <pre className="min-h-0 flex-1 overflow-auto bg-[var(--bg-deepest)] p-3 font-mono text-[12.5px] leading-relaxed text-[var(--text-secondary)] whitespace-pre-wrap">
                    {previewBody(siblingBody)}
                  </pre>
                  <p className="truncate px-3 py-1 text-[10px] text-[var(--text-muted)]">
                    {activeItem.sibling.path}
                  </p>
                </div>
              </div>

              <footer className="flex shrink-0 flex-col gap-2 border-t border-[var(--border)] p-3 pb-[max(12px,env(safe-area-inset-bottom))] sm:flex-row sm:items-center sm:justify-between">
                <button
                  type="button"
                  className="ghost-btn order-4 sm:order-1"
                  onClick={() =>
                    dismissConflictFromList(
                      activeItem.primaryPath,
                      activeItem.sibling.path,
                    )
                  }
                >
                  Dismiss
                </button>
                <div className="flex flex-col gap-2 sm:order-2 sm:flex-row">
                  <button
                    type="button"
                    className="ghost-btn"
                    onClick={() =>
                      openConflictPair(
                        activeItem.primaryPath,
                        activeItem.sibling.path,
                      )
                    }
                  >
                    Open both
                  </button>
                  <button
                    type="button"
                    className="primary-btn"
                    onClick={() =>
                      void resolveConflictKeepMine(
                        activeItem.primaryPath,
                        activeItem.sibling.path,
                      )
                    }
                  >
                    Keep mine
                  </button>
                  <button
                    type="button"
                    className="primary-btn !bg-[var(--danger)] !text-white hover:!opacity-90"
                    disabled={!primaryId}
                    onClick={() => {
                      if (primaryDirty) setConfirmTake(true);
                      else
                        void resolveConflictTakeTheirs(
                          activeItem.primaryPath,
                          activeItem.sibling.path,
                        );
                    }}
                  >
                    Take theirs
                  </button>
                </div>
              </footer>
            </>
          )}
        </div>
      </div>

      <ConfirmDialog
        open={confirmTake}
        danger
        title="Replace your version?"
        message="Your unsaved edits will be saved as a conflict-mine copy first, then the primary note becomes the external version."
        confirmLabel="Take theirs"
        cancelLabel="Cancel"
        onCancel={() => setConfirmTake(false)}
        onConfirm={() => {
          setConfirmTake(false);
          if (activeItem) {
            void resolveConflictTakeTheirs(
              activeItem.primaryPath,
              activeItem.sibling.path,
            );
          }
        }}
      />
    </>,
    document.body,
  );
}

/** Compact banner under editor title when active note has conflict siblings. */
export function ConflictBanner() {
  const activeNoteId = useVaultStore((s) => s.activeNoteId);
  const nodes = useVaultStore((s) => s.nodes);
  const openConflictStudio = useVaultStore((s) => s.openConflictStudio);
  const dismissConflictFromList = useVaultStore((s) => s.dismissConflictFromList);
  const getConflictItems = useVaultStore((s) => s.getConflictItems);
  const dismissedConflictKeys = useVaultStore((s) => s.dismissedConflictKeys);

  const ctx = useMemo(() => {
    if (!activeNoteId) return null;
    const note = nodes[activeNoteId];
    if (!note || note.kind !== "note") return null;
    const items = getConflictItems();
    const hit = items.find(
      (i: any) =>
        i.primaryPath === note.path ||
        i.sibling.path === note.path ||
        i.primaryId === activeNoteId ||
        i.sibling.id === activeNoteId,
    );
    if (!hit) return null;
    const viewingSibling = hit.sibling.id === activeNoteId;
    return { hit, viewingSibling };
  }, [activeNoteId, nodes, getConflictItems, dismissedConflictKeys]);

  if (!ctx) return null;
  const { hit, viewingSibling } = ctx;

  return (
    <div
      className="flex shrink-0 flex-wrap items-center gap-2 border-b border-[rgba(255,69,58,0.22)] bg-[rgba(255,69,58,0.08)] px-3 py-2 text-[12px]"
      data-conflict-banner="true"
      role="status"
    >
      <span className="inline-block h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-[var(--danger)]" />
      <span className="min-w-0 flex-1 text-[var(--text-secondary)]">
        {viewingSibling
          ? `Conflict copy · primary is ${hit.title}`
          : `Conflict · ${hit.siblings.length} other version${hit.siblings.length === 1 ? "" : "s"} on disk`}
      </span>
      <button
        type="button"
        className="chip-btn shrink-0"
        onClick={() =>
          openConflictStudio({
            primaryPath: hit.primaryPath,
            siblingPath: hit.sibling.path,
          })
        }
      >
        Review
      </button>
      <button
        type="button"
        className="icon-btn shrink-0"
        aria-label="Dismiss"
        onClick={() =>
          dismissConflictFromList(hit.primaryPath, hit.sibling.path)
        }
      >
        <X size={14} />
      </button>
    </div>
  );
}
