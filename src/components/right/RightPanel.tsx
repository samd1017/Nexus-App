import { useMemo, useRef, useSyncExternalStore } from "react";
import { Activity, Link2, ListTree, Network, Unlink, Hash, Plus, Loader2 } from "lucide-react";
import { useVaultStore, type RightTab } from "@/lib/vault/store";
import { getBacklinks } from "@/lib/vault/backlinks";
import { getBrokenLinksForNote } from "@/lib/vault/broken-links";
import {
  extractTagsFromMarkdown,
  notesForTag,
} from "@/lib/vault/tags";
import { extractOutline } from "@/lib/markdown/serialize";
import { noteTitle } from "@/lib/vault/types";
import { jumpToOutlineHeading } from "@/lib/editor/outline-jump";
import { GraphView } from "@/components/graph/GraphView";
import { PulseRail } from "@/components/right/PulseRail";
import { ErrorBoundary } from "@/components/chrome/ErrorBoundary";
import { cn } from "@/lib/utils";
import { usePrefsStore } from "@/lib/prefs/preferences";
import { openCommandPalette } from "@/components/search/CommandPalette";
import { EmptyState } from "@/components/ui/EmptyState";
import { isContentLoaded } from "@/lib/vault/content";
import {
  getUnreadPulseCount,
  subscribePulse,
  getPulseVersion,
} from "@/lib/vault/pulse";

const DEFAULT_RIGHT_WIDTH = 340;

type GroupedBacklink = {
  fromId: string;
  fromPath: string;
  fromTitle: string;
  contexts: string[];
  count: number;
};

export function RightPanel() {
  const rightOpen = useVaultStore((s) => s.settings.rightOpen);
  const rightWidth = useVaultStore((s) => s.settings.rightWidth);
  const graphMode = useVaultStore((s) => s.settings.graphMode);
  const activeNoteId = useVaultStore((s) => s.activeNoteId);
  const nodes = useVaultStore((s) => s.nodes);
  const vaultId = useVaultStore((s) => s.vaultId);
  const mode = useVaultStore((s) => s.mode);
  const setActiveNote = useVaultStore((s) => s.setActiveNote);
  const setRightOpen = useVaultStore((s) => s.setRightOpen);
  const setRightWidth = useVaultStore((s) => s.setRightWidth);
  const setToast = useVaultStore((s) => s.setToast);
  const createNote = useVaultStore((s) => s.createNote);
  const focusMode = usePrefsStore((s) => s.focusMode);
  const tab = useVaultStore((s) => s.rightTab);
  const setRightTab = useVaultStore((s) => s.setRightTab);
  const openConflictCount = useVaultStore((s) => {
    // Depend on nodes + dismissals so badge updates live
    void s.nodes;
    void s.dismissedConflictKeys;
    return s.getOpenConflictCount();
  });
  // Re-render badge when pulse buffer changes
  useSyncExternalStore(subscribePulse, getPulseVersion, getPulseVersion);
  const unreadPulse = getUnreadPulseCount(vaultId);

  // R1.1: do NOT auto-open Graph on demo — GraphView must be user-initiated
  // until the panel is proven stable (avoids first-run crash path).
  const dragStartX = useRef(0);
  const dragStartWidth = useRef(0);

  const setTab = (id: RightTab) => setRightTab(id);

  const note = activeNoteId ? nodes[activeNoteId] : null;
  const bodyReady = !note || note.kind !== "note" || isContentLoaded(note);

  const backlinks = useMemo(() => {
    if (!note || note.kind !== "note") return [];
    return getBacklinks(note, nodes);
  }, [note, nodes]);

  /** Wave 4: group multi-mentions by source note, show count */
  const groupedBacklinks = useMemo((): GroupedBacklink[] => {
    const map = new Map<string, GroupedBacklink>();
    for (const b of backlinks) {
      const existing = map.get(b.fromId);
      if (existing) {
        existing.count += 1;
        if (b.context && !existing.contexts.includes(b.context)) {
          existing.contexts.push(b.context);
        }
      } else {
        map.set(b.fromId, {
          fromId: b.fromId,
          fromPath: b.fromPath,
          fromTitle: b.fromTitle,
          contexts: b.context ? [b.context] : [],
          count: 1,
        });
      }
    }
    return Array.from(map.values()).sort((a, b) =>
      a.fromTitle.localeCompare(b.fromTitle),
    );
  }, [backlinks]);

  const brokenLinks = useMemo(() => {
    if (!note || note.kind !== "note") return [];
    return getBrokenLinksForNote(note, nodes);
  }, [note, nodes]);

  const tags = useMemo(() => {
    if (!note || note.kind !== "note") return [];
    return extractTagsFromMarkdown(note.content ?? "");
  }, [note]);

  const outline = useMemo(() => {
    if (!note || note.kind !== "note") return [];
    return extractOutline(note.content ?? "");
  }, [note]);

  const handleTagClick = (tag: string) => {
    const hits = notesForTag(nodes, tag);
    if (hits[0]) setActiveNote(hits[0].id);
    setToast(`#${tag} · ${hits.length} note${hits.length === 1 ? "" : "s"}`);
    if (hits.length > 1) {
      openCommandPalette(`#${tag}`);
    }
  };

  const tabDefs = [
    ["backlinks", Link2, "Backlinks"],
    ["outline", ListTree, "Outline"],
    ["graph", Network, "Graph"],
    ["pulse", Activity, "Pulse"],
  ] as const;

  if (graphMode === "fullscreen") {
    return (
      <div className="absolute inset-0 z-30 flex flex-col bg-[var(--bg-deepest)]">
        <ErrorBoundary
          variant="panel"
          label="Graph"
          resetKeys={[vaultId, mode, "fullscreen"]}
        >
          <GraphView mode="fullscreen" className="h-full" />
        </ErrorBoundary>
      </div>
    );
  }

  if (focusMode) return null;

  if (!rightOpen) {
    return (
      <div className="hidden w-11 shrink-0 flex-col items-center gap-1 border-l border-[var(--border)] bg-[var(--bg-primary)] py-3 sm:w-12 lg:flex">
        {tabDefs.map(([id, Icon, label]) => (
          <button
            key={id}
            type="button"
            className="icon-btn relative"
            title={label}
            aria-label={label}
            onClick={() => {
              setTab(id);
              setRightOpen(true);
            }}
          >
            <Icon size={16} />
            {id === "pulse" && (openConflictCount > 0 || unreadPulse > 0) ? (
              <span className="absolute -right-0.5 -top-0.5 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-[var(--danger)] px-0.5 text-[9px] font-semibold text-white">
                {(() => {
                  const n = Math.max(openConflictCount, unreadPulse);
                  return n > 9 ? "9+" : n;
                })()}
              </span>
            ) : null}
          </button>
        ))}
      </div>
    );
  }

  return (
    <>
      <button
        type="button"
        className="fixed inset-0 z-20 bg-black/50 lg:hidden"
        aria-label="Close panel"
        onClick={() => setRightOpen(false)}
      />
      <aside
        className="panel-slide panel-solid absolute inset-y-0 right-0 z-30 flex h-full shrink-0 flex-col border-l border-[var(--border)] bg-[var(--panel-solid)] lg:relative lg:z-0"
        style={{ width: rightWidth }}
      >
        <div
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize right panel"
          title="Drag to resize · double-click to reset"
          className="panel-resize-handle titlebar-no-drag panel-resize-handle--left"
          onPointerDown={(e) => {
            e.preventDefault();
            dragStartX.current = e.clientX;
            dragStartWidth.current = rightWidth;
            e.currentTarget.setPointerCapture(e.pointerId);
          }}
          onPointerMove={(e) => {
            if (!e.currentTarget.hasPointerCapture(e.pointerId)) return;
            setRightWidth(
              dragStartWidth.current - (e.clientX - dragStartX.current),
            );
          }}
          onPointerUp={(e) => {
            if (e.currentTarget.hasPointerCapture(e.pointerId)) {
              e.currentTarget.releasePointerCapture(e.pointerId);
            }
          }}
          onDoubleClick={() => setRightWidth(DEFAULT_RIGHT_WIDTH)}
        />
        <div className="flex items-center gap-1 border-b border-[var(--border)] p-2">
          {tabDefs.map(([id, Icon, label]) => (
            <button
              key={id}
              type="button"
              className={cn(
                "chip-btn relative flex-1 justify-center",
                tab === id && "is-active",
              )}
              onClick={() => setTab(id)}
              title={label}
              aria-label={label}
              aria-selected={tab === id}
            >
              <Icon size={13} />
              <span className="hidden xl:inline">{label}</span>
              {id === "pulse" && (openConflictCount > 0 || unreadPulse > 0) ? (
                <span className="ml-1 rounded-full bg-[rgba(255,69,58,0.15)] px-1.5 text-[10px] font-semibold text-[var(--danger)]">
                  {Math.max(openConflictCount, unreadPulse)}
                </span>
              ) : null}
            </button>
          ))}
          <button
            type="button"
            className="icon-btn ml-1 h-7 w-7"
            onClick={() => setRightOpen(false)}
            title="Collapse panel"
            aria-label="Collapse panel"
          >
            ×
          </button>
        </div>

        <div
          className={cn(
            "min-h-0 flex-1",
            tab === "graph" ? "flex flex-col overflow-hidden" : "overflow-y-auto",
          )}
        >
          {tab === "backlinks" ? (
            <div className="flex flex-col gap-5 p-3">
              <section>
                <div className="mb-2 text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--text-muted)]">
                  Linked mentions
                </div>
                {groupedBacklinks.length === 0 ? (
                  <EmptyState
                    compact
                    icon={<Link2 size={18} />}
                    title="No backlinks yet"
                    description="Other notes that [[mention this]] will appear here."
                  />
                ) : (
                  <ul className="flex flex-col gap-1">
                    {groupedBacklinks.map((b) => (
                      <li key={b.fromId}>
                        <button
                          type="button"
                          className="tree-row w-full rounded-[10px] px-2.5 py-2 text-left hover:bg-white/[0.05]"
                          onClick={() => setActiveNote(b.fromId)}
                        >
                          <div className="flex items-center gap-1.5">
                            <div className="min-w-0 flex-1 truncate text-[13px] font-medium text-[var(--text-primary)]">
                              {b.fromTitle ||
                                noteTitle({
                                  name: b.fromPath,
                                  kind: "note",
                                } as never)}
                            </div>
                            {b.count > 1 ? (
                              <span
                                className="shrink-0 rounded-full bg-[var(--accent-dim)] px-1.5 py-0.5 text-[10px] font-medium text-[var(--accent)]"
                                title={`${b.count} mentions`}
                              >
                                ×{b.count}
                              </span>
                            ) : null}
                          </div>
                          {b.contexts.length > 0 ? (
                            <div className="mt-0.5 flex flex-col gap-0.5">
                              {b.contexts.slice(0, 3).map((ctx, i) => (
                                <div
                                  key={i}
                                  className="line-clamp-2 text-[11.5px] text-[var(--text-muted)]"
                                >
                                  {ctx}
                                </div>
                              ))}
                              {b.contexts.length > 3 ? (
                                <div className="text-[10px] text-[var(--text-muted)]">
                                  +{b.contexts.length - 3} more
                                </div>
                              ) : null}
                            </div>
                          ) : null}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              <section>
                <div className="mb-2 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--text-muted)]">
                  <Unlink size={11} className="opacity-70" />
                  Broken links
                  {brokenLinks.length > 0 ? (
                    <span className="ml-auto rounded-full bg-[rgba(255,69,58,0.15)] px-1.5 py-0.5 text-[10px] font-medium normal-case tracking-normal text-[var(--danger)]">
                      {brokenLinks.length}
                    </span>
                  ) : null}
                </div>
                {brokenLinks.length === 0 ? (
                  <p className="px-1 text-[11.5px] text-[var(--text-muted)]">
                    All [[wikilinks]] resolve.
                  </p>
                ) : (
                  <ul className="flex flex-col gap-1">
                    {brokenLinks.map((bl) => (
                      <li key={bl.target}>
                        <div className="tree-row flex w-full items-start gap-1 rounded-[10px] px-2.5 py-2 hover:bg-white/[0.04]">
                          <div className="min-w-0 flex-1 text-left">
                            <div className="truncate text-[13px] font-medium text-[var(--warning)]">
                              [[{bl.target}]]
                            </div>
                            <div className="mt-0.5 line-clamp-2 text-[11.5px] text-[var(--text-muted)]">
                              {bl.context}
                            </div>
                          </div>
                          <button
                            type="button"
                            className="icon-btn mt-0.5 h-6 w-6 shrink-0"
                            title={`Create note “${bl.target}”`}
                            aria-label={`Create note “${bl.target}”`}
                            onClick={() => {
                              createNote(null, bl.target);
                              setToast(`Created “${bl.target}”`);
                            }}
                          >
                            <Plus size={12} />
                          </button>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              <section>
                <div className="mb-2 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--text-muted)]">
                  <Hash size={11} className="opacity-70" />
                  Tags
                </div>
                {!bodyReady ? (
                  <p className="flex items-center gap-2 px-1 text-[11.5px] text-[var(--text-muted)]">
                    <Loader2 size={12} className="animate-spin text-[var(--accent)]" />
                    Loading note…
                  </p>
                ) : tags.length === 0 ? (
                  <p className="px-1 text-[11.5px] text-[var(--text-muted)]">
                    No #tags in this note.
                  </p>
                ) : (
                  <div className="flex flex-wrap gap-1.5">
                    {tags.map((tag) => (
                      <button
                        key={tag}
                        type="button"
                        className="chip-btn"
                        onClick={() => handleTagClick(tag)}
                        title={`Notes tagged #${tag}`}
                      >
                        #{tag}
                      </button>
                    ))}
                  </div>
                )}
              </section>
            </div>
          ) : null}

          {tab === "outline" ? (
            <div className="p-3">
              <div className="mb-2 text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--text-muted)]">
                Outline
              </div>
              {!bodyReady ? (
                <p className="flex items-center gap-2 px-1 text-[11.5px] text-[var(--text-muted)]">
                  <Loader2 size={12} className="animate-spin text-[var(--accent)]" />
                  Loading note…
                </p>
              ) : outline.length === 0 ? (
                <EmptyState
                  compact
                  title="No headings"
                  description="Use # headings to structure the note."
                />
              ) : (
                <ul className="flex flex-col gap-0.5">
                  {outline.map((h, i) => (
                    <li key={i}>
                      <button
                        type="button"
                        className="tree-row w-full truncate rounded-md px-2 py-1.5 text-left text-[12.5px] text-[var(--text-secondary)] hover:bg-white/[0.04] hover:text-[var(--text-primary)]"
                        style={{ paddingLeft: 8 + (h.level - 1) * 12 }}
                        onClick={() => jumpToOutlineHeading(h.text, h.level)}
                        title={`Jump to “${h.text}”`}
                      >
                        {h.text}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ) : null}

          {tab === "graph" ? (
            <div className="flex min-h-0 flex-1 flex-col">
              <ErrorBoundary
                variant="panel"
                label="Graph"
                resetKeys={[vaultId, mode, tab, activeNoteId]}
              >
                <GraphView mode="panel" className="h-full min-h-[280px]" />
              </ErrorBoundary>
            </div>
          ) : null}

          {tab === "pulse" ? <PulseRail /> : null}
        </div>
      </aside>
    </>
  );
}
