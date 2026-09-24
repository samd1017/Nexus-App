import { lazy, Suspense, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { Activity, History, Link2, ListTree, Network, Paperclip, Unlink, Hash, Plus, Loader2 } from "lucide-react";
import { useVaultStore, type RightTab } from "@/lib/vault/store";
import { getBacklinks } from "@/lib/vault/backlinks";
import { fetchShellBacklinks, fetchShellKnownNorms, fetchShellMentions } from "@/lib/vault/shell-catalog";
import type { Backlink } from "@/lib/vault/types";
import {
  getUnlinkedMentions,
  unlinkedFromHeads,
  wrapUnlinkedMention,
} from "@/lib/vault/unlinked-mentions";
import { getBrokenLinksForNote } from "@/lib/vault/broken-links";
import {
  extractTagsFromMarkdown,
  notesForTag,
} from "@/lib/vault/tags";
import { extractOutline } from "@/lib/markdown/serialize";
import { noteTitle } from "@/lib/vault/types";
import { extractWikilinkTargets, normalizeLinkTarget, presentLinkContext } from "@/lib/markdown/wikilinks";
import { jumpToOutlineHeading } from "@/lib/editor/outline-jump";
import { PulseRail } from "@/components/right/PulseRail";
import { AttachmentsRail } from "@/components/right/AttachmentsRail";
import { HistoryRail } from "@/components/right/HistoryRail";
import { ErrorBoundary } from "@/components/chrome/ErrorBoundary";

const GraphView = lazy(async () => {
  const m = await import("@/components/graph/GraphView");
  return { default: m.GraphView };
});
import { cn } from "@/lib/utils";
import { usePrefsStore } from "@/lib/prefs/preferences";
import { openCommandPalette } from "@/components/search/CommandPalette";
import { getBodyGen, isContentLoaded, subscribeBodyGen } from "@/lib/vault/content";
import {
  getUnreadPulseCount,
  subscribePulse,
  getPulseVersion,
} from "@/lib/vault/pulse";

const DEFAULT_RIGHT_WIDTH = 340;
const OPEN_NOTE_HINT = "Open a note. Enter starts a note in the list.";

function PanelStatus({ kind, children }: { kind: string; children: string }) {
  return (
    <p
      role="status"
      data-panel-empty={kind}
      className="px-1 text-[12.5px] leading-snug text-[var(--text-secondary)]"
    >
      {children}
    </p>
  );
}
/** Shell page reloads must not re-render the panel or the graph host. */
const SHELL_PANEL_NODES: Record<string, import("@/lib/vault/types").VaultNode> = {};

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
  const note = useVaultStore((s) =>
    s.activeNoteId ? (s.nodes[s.activeNoteId] ?? null) : null,
  );
  const nodes = useVaultStore((s) =>
    s.shellCatalog ? SHELL_PANEL_NODES : s.nodes,
  );
  const vaultId = useVaultStore((s) => s.vaultId);
  const mode = useVaultStore((s) => s.mode);
  const setActiveNote = useVaultStore((s) => s.setActiveNote);
  const setRightOpen = useVaultStore((s) => s.setRightOpen);
  const setRightWidth = useVaultStore((s) => s.setRightWidth);
  const setToast = useVaultStore((s) => s.setToast);
  const createNote = useVaultStore((s) => s.createNote);
  const updateNoteContent = useVaultStore((s) => s.updateNoteContent);
  const ensureNoteBody = useVaultStore((s) => s.ensureNoteBody);
  const focusMode = usePrefsStore((s) => s.focusMode);
  const tab = useVaultStore((s) => s.rightTab);
  const setRightTab = useVaultStore((s) => s.setRightTab);
  const shellCatalog = useVaultStore((s) => s.shellCatalog);
  const shellDbPath = useVaultStore((s) => s.shellDbPath);
  const [shellBacklinks, setShellBacklinks] = useState<Backlink[] | null>(null);
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
  // Warm the chunk after first paint so selecting Graph is not a parse hitch.
  useEffect(() => {
    const ric = window.requestIdleCallback;
    if (typeof ric === "function") {
      const id = ric(() => {
        void import("@/components/graph/GraphView");
      });
      return () => window.cancelIdleCallback(id);
    }
    const t = window.setTimeout(() => {
      void import("@/components/graph/GraphView");
    }, 800);
    return () => window.clearTimeout(t);
  }, []);
  const dragStartX = useRef(0);
  const dragStartWidth = useRef(0);

  const setTab = (id: RightTab) => setRightTab(id);

  // Lazy hydrate writes into the same nodes object. This tick is the re-render.
  const bodyGen = useSyncExternalStore(subscribeBodyGen, getBodyGen, getBodyGen);
  const bodyReady = !note || note.kind !== "note" || isContentLoaded(note);

  useEffect(() => {
    if (!shellCatalog || !shellDbPath || tab !== "backlinks" || !note || note.kind !== "note") {
      setShellBacklinks(null);
      return;
    }
    let cancel = false;
    const id = note.id;
    void fetchShellBacklinks(shellDbPath, id).then((page) => {
      if (cancel) return;
      setShellBacklinks(
        (page?.rows ?? []).map((row) => ({
          fromId: row.fromId,
          fromPath: row.fromPath,
          fromTitle: row.fromTitle,
          context: "",
        })),
      );
    });
    return () => {
      cancel = true;
    };
  }, [shellCatalog, shellDbPath, tab, note?.id]);

  const backlinks = useMemo(() => {
    if (tab !== "backlinks" || !note || note.kind !== "note") return [];
    if (shellCatalog) return shellBacklinks ?? [];
    return getBacklinks(note, nodes);
  }, [tab, note, nodes, bodyGen, shellCatalog, shellBacklinks]);

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

  // One incoming mention should show the sentence, not "(body not loaded)".
  useEffect(() => {
    if (tab !== "backlinks") return;
    const pending = groupedBacklinks
      .filter((b) => b.contexts.some((c) => c.includes("body not loaded")))
      .slice(0, 8);
    for (const b of pending) void ensureNoteBody(b.fromId);
  }, [tab, groupedBacklinks, ensureNoteBody]);

  const [shellBrokenTargets, setShellBrokenTargets] = useState<string[] | null>(null);
  const [shellMentions, setShellMentions] = useState<ReturnType<typeof unlinkedFromHeads> | null>(null);
  useEffect(() => {
    if (!shellCatalog || !shellDbPath || shellDbPath === "browser" || tab !== "backlinks" || !note || note.kind !== "note") {
      setShellBrokenTargets(null);
      setShellMentions(null);
      return;
    }
    const db = shellDbPath;
    const noteId = note.id;
    const title = noteTitle(note);
    const content = note.content ?? "";
    let cancel = false;
    const run = () => {
      const norms = [...new Set(extractWikilinkTargets(content).map((target) => normalizeLinkTarget(target)).filter(Boolean))];
      void fetchShellKnownNorms(db, norms).then((known) => {
        if (cancel || !known) return;
        const have = new Set(known);
        setShellBrokenTargets(norms.filter((norm) => !have.has(norm)));
      });
      void fetchShellMentions(db, title, 24).then((heads) => {
        if (cancel || !heads) return;
        setShellMentions(unlinkedFromHeads(title, heads, noteId));
      });
    };
    run();
    const unsub = useVaultStore.subscribe((state, prev) => {
      if (cancel || state.shellLiveTick === prev.shellLiveTick) return;
      run();
    });
    return () => {
      cancel = true;
      unsub();
    };
  }, [shellCatalog, shellDbPath, tab, note, bodyGen]);

  const brokenLinks = useMemo(() => {
    if (tab !== "backlinks" || !note || note.kind !== "note") return [];
    if (shellCatalog && shellDbPath && shellDbPath !== "browser") {
      return (shellBrokenTargets ?? []).map((target) => ({ target, context: "" }));
    }
    return getBrokenLinksForNote(note, nodes);
  }, [tab, note, nodes, bodyGen, shellCatalog, shellDbPath, shellBrokenTargets]);

  const unlinkedMentions = useMemo(() => {
    if (tab !== "backlinks" || !note || note.kind !== "note") return [];
    if (shellCatalog && shellDbPath && shellDbPath !== "browser") return shellMentions ?? [];
    return getUnlinkedMentions(note, nodes);
  }, [tab, note, nodes, bodyGen, shellCatalog, shellDbPath, shellMentions]);

  const tags = useMemo(() => {
    if (!note || note.kind !== "note") return [];
    return extractTagsFromMarkdown(note.content ?? "");
  }, [note, bodyGen]);

  const outline = useMemo(() => {
    if (!note || note.kind !== "note") return [];
    return extractOutline(note.content ?? "");
  }, [note, bodyGen]);

  const handleTagClick = (tag: string) => {
    if (shellCatalog) {
      openCommandPalette(`#${tag}`);
      return;
    }
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
    ["attachments", Paperclip, "Files"],
    ["history", History, "History"],
  ] as const;

  if (graphMode === "fullscreen") {
    return (
      <div
        className="absolute inset-0 z-30 flex flex-col bg-[var(--bg-deepest)]"
        data-graph-host
      >
        <ErrorBoundary
          variant="panel"
          label="Graph"
          resetKeys={[vaultId, mode, "fullscreen"]}
        >
          <Suspense
            fallback={
              <div
                className="flex h-full items-center justify-center text-[12px] text-[var(--text-muted)]"
                data-graph-progress
              >
                Building graph…
              </div>
            }
          >
            <GraphView mode="fullscreen" className="h-full" />
          </Suspense>
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
        data-right-panel
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
        <div className="flex items-center gap-0.5 border-b border-[var(--border)] px-1.5 py-1.5">
          {tabDefs.map(([id, Icon, label]) => (
            <button
              key={id}
              type="button"
              className={cn(
                "icon-btn relative h-7 w-7 shrink-0",
                tab === id && "is-active",
              )}
              onClick={() => setTab(id)}
              title={label}
              aria-label={label}
              aria-selected={tab === id}
            >
              <Icon size={14} />
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
          <span className="min-w-0 flex-1 truncate px-1.5 text-[12px] font-medium tracking-tight text-[var(--text-secondary)]">
            {tabDefs.find(([id]) => id === tab)?.[2] ?? ""}
          </span>
          <button
            type="button"
            className="icon-btn h-7 w-7 shrink-0"
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
            !note || note.kind !== "note" ? (
            <div className="p-3">
              <PanelStatus kind="note">{OPEN_NOTE_HINT}</PanelStatus>
            </div>
            ) : (
            <div className="flex flex-col gap-5 p-3">
              <section>
                <div className="mb-2 text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--text-muted)]">
                  Linked mentions
                </div>
                {groupedBacklinks.length === 0 ? (
                  <PanelStatus kind="backlinks">
                    No backlinks yet. Other notes that mention this one show up here.
                  </PanelStatus>
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
                                <MentionLine
                                  key={i}
                                  text={presentLinkContext(ctx)}
                                  highlight={note ? noteTitle(note) : ""}
                                />
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
                <div className="mb-2 text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--text-muted)]">
                  Unlinked mentions
                </div>
                {unlinkedMentions.length === 0 ? (
                  <PanelStatus kind="unlinked">
                    No other notes say this title in plain text.
                  </PanelStatus>
                ) : (
                  <ul className="flex flex-col gap-1">
                    {unlinkedMentions.map((u) => (
                      <li key={`${u.fromId}:${u.title}`}>
                        <div className="tree-row flex w-full items-start gap-1 rounded-[10px] px-2.5 py-2 hover:bg-white/[0.04]">
                          <button
                            type="button"
                            className="min-w-0 flex-1 text-left"
                            onClick={() => setActiveNote(u.fromId)}
                          >
                            <div className="truncate text-[13px] font-medium text-[var(--text-primary)]">
                              {u.fromTitle}
                            </div>
                            <MentionLine
                              text={presentLinkContext(u.context)}
                              highlight={u.title}
                            />
                          </button>
                          <button
                            type="button"
                            className="icon-btn mt-0.5 h-6 shrink-0 px-1.5 text-[10px]"
                            title={`Link “${u.title}” in ${u.fromTitle}`}
                            aria-label={`Create wikilink in ${u.fromTitle}`}
                            onClick={() => {
                              void (async () => {
                                await ensureNoteBody(u.fromId);
                                const src = useVaultStore.getState().nodes[u.fromId];
                                if (!src || src.kind !== "note" || src.content == null) {
                                  setToast("Could not load that note to link");
                                  return;
                                }
                                const { next, did } = wrapUnlinkedMention(src.content, u.title);
                                if (!did) {
                                  setToast("Could not wrap that mention");
                                  return;
                                }
                                updateNoteContent(u.fromId, next, { source: true });
                                setToast(`Linked [[${u.title}]] in ${u.fromTitle}`);
                              })();
                            }}
                          >
                            Link
                          </button>
                        </div>
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
                  <PanelStatus kind="broken">
                    All wikilinks in this note resolve.
                  </PanelStatus>
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
                  <PanelStatus kind="tags">
                    No tags in this note.
                  </PanelStatus>
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
            )
          ) : null}

          {tab === "outline" ? (
            !note || note.kind !== "note" ? (
            <div className="p-3">
              <PanelStatus kind="note">{OPEN_NOTE_HINT}</PanelStatus>
            </div>
            ) : (
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
                <PanelStatus kind="outline">
                  No headings yet. A # heading in the note shows up here.
                </PanelStatus>
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
            )
          ) : null}

          {tab === "graph" ? (
            <div className="flex min-h-0 flex-1 flex-col">
              <ErrorBoundary
                variant="panel"
                label="Graph"
                resetKeys={[vaultId, mode, tab]}
              >
                <Suspense fallback={<div className="flex min-h-[280px] items-center justify-center text-[12px] text-[var(--text-muted)]">Loading graph…</div>}>
                  <GraphView mode="panel" className="h-full min-h-[280px]" />
                </Suspense>
              </ErrorBoundary>
            </div>
          ) : null}

          {tab === "pulse" ? <PulseRail /> : null}
          {tab === "attachments" ? <AttachmentsRail /> : null}
          {tab === "history" ? <HistoryRail /> : null}
        </div>
      </aside>
    </>
  );
}

/** One mention sentence, with this note's name lifted out of the gray. */
function MentionLine({ text, highlight }: { text: string; highlight: string }) {
  const needle = highlight.trim();
  const at = needle ? text.toLowerCase().indexOf(needle.toLowerCase()) : -1;
  const body =
    at < 0 ? (
      text
    ) : (
      <>
        {text.slice(0, at)}
        <span className="text-[var(--text-primary)]">
          {text.slice(at, at + needle.length)}
        </span>
        {text.slice(at + needle.length)}
      </>
    );
  return (
    <div className="mt-0.5 line-clamp-2 text-[11.5px] leading-snug text-[var(--text-muted)]">
      {body}
    </div>
  );
}
