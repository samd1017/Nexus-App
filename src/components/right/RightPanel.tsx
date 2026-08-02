import { useMemo, useState } from "react";
import { Link2, ListTree, Network } from "lucide-react";
import { useVaultStore } from "@/lib/vault/store";
import { getBacklinks } from "@/lib/vault/backlinks";
import { extractOutline } from "@/lib/markdown/serialize";
import { noteTitle } from "@/lib/vault/types";
import { GraphView } from "@/components/graph/GraphView";
import { cn } from "@/lib/utils";

type Tab = "backlinks" | "outline" | "graph";

export function RightPanel() {
  const rightOpen = useVaultStore((s) => s.settings.rightOpen);
  const rightWidth = useVaultStore((s) => s.settings.rightWidth);
  const graphMode = useVaultStore((s) => s.settings.graphMode);
  const activeNoteId = useVaultStore((s) => s.activeNoteId);
  const nodes = useVaultStore((s) => s.nodes);
  const setActiveNote = useVaultStore((s) => s.setActiveNote);
  const setRightOpen = useVaultStore((s) => s.setRightOpen);
  const [tab, setTab] = useState<Tab>("backlinks");

  const note = activeNoteId ? nodes[activeNoteId] : null;

  const backlinks = useMemo(() => {
    if (!note || note.kind !== "note") return [];
    return getBacklinks(note, nodes);
  }, [note, nodes]);

  const outline = useMemo(() => {
    if (!note || note.kind !== "note") return [];
    return extractOutline(note.content ?? "");
  }, [note]);

  if (graphMode === "fullscreen") {
    return (
      <div className="absolute inset-0 z-30 flex flex-col bg-[var(--bg-deepest)]">
        <GraphView mode="fullscreen" className="h-full" />
      </div>
    );
  }

  if (!rightOpen) return null;

  return (
    <>
      <button
        type="button"
        className="fixed inset-0 z-20 bg-black/50 lg:hidden"
        aria-label="Close panel"
        onClick={() => setRightOpen(false)}
      />
      <aside
        className="panel-slide glass-panel absolute inset-y-0 right-0 z-30 flex h-full shrink-0 flex-col border-l border-[var(--border)] bg-[rgba(15,15,18,0.94)] lg:relative lg:z-0 lg:bg-[rgba(15,15,18,0.78)]"
        style={{ width: Math.min(rightWidth, 360) }}
      >
        <div className="flex items-center gap-1 border-b border-[var(--border)] p-2">
          {(
            [
              ["backlinks", Link2, "Backlinks"],
              ["outline", ListTree, "Outline"],
              ["graph", Network, "Graph"],
            ] as const
          ).map(([id, Icon, label]) => (
            <button
              key={id}
              type="button"
              className={cn("chip-btn flex-1 justify-center", tab === id && "is-active")}
              onClick={() => setTab(id)}
            >
              <Icon size={13} />
              <span className="hidden xl:inline">{label}</span>
            </button>
          ))}
          <button
            type="button"
            className="icon-btn ml-1 h-7 w-7"
            onClick={() => setRightOpen(false)}
            title="Collapse panel"
          >
            ×
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {tab === "backlinks" ? (
            <div className="p-3">
              <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-[0.1em] text-[var(--text-muted)]">
                Linked mentions
              </h3>
              {!note ? (
                <Empty text="Open a note to see backlinks." />
              ) : backlinks.length === 0 ? (
                <Empty text="No backlinks yet. Link other notes with [[wikilinks]]." />
              ) : (
                <ul className="space-y-1.5">
                  {backlinks.map((b) => (
                    <li key={b.fromId}>
                      <button
                        type="button"
                        onClick={() => setActiveNote(b.fromId)}
                        className="w-full rounded-[12px] border border-[var(--border)] bg-white/[0.02] px-3 py-2.5 text-left transition-[border-color,background,transform] duration-200 hover:scale-[1.01] hover:border-[rgba(0,200,255,0.28)] hover:bg-[rgba(0,200,255,0.06)]"
                      >
                        <div className="text-[13px] font-medium text-[var(--text-primary)]">
                          {b.fromTitle}
                        </div>
                        <div className="mt-1 line-clamp-2 text-[11.5px] leading-snug text-[var(--text-muted)]">
                          {b.context}
                        </div>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ) : null}

          {tab === "outline" ? (
            <div className="p-3">
              <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-[0.1em] text-[var(--text-muted)]">
                Outline
              </h3>
              {!note ? (
                <Empty text="Open a note to see its outline." />
              ) : outline.length === 0 ? (
                <Empty text="No headings in this note." />
              ) : (
                <ul className="space-y-0.5">
                  {outline.map((h, i) => (
                    <li key={i}>
                      <div
                        className="rounded-lg px-2 py-1.5 text-[13px] text-[var(--text-secondary)]"
                        style={{ paddingLeft: 8 + (h.level - 1) * 12 }}
                      >
                        <span className="mr-2 text-[10px] text-[var(--text-muted)]">H{h.level}</span>
                        {h.text}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
              {note ? (
                <p className="mt-4 px-2 text-[11px] text-[var(--text-muted)]">
                  Viewing {noteTitle(note)}
                </p>
              ) : null}
            </div>
          ) : null}

          {tab === "graph" ? (
            <div className="flex h-full min-h-[280px] flex-col">
              <GraphView mode="panel" className="min-h-[320px] flex-1" />
            </div>
          ) : null}
        </div>

        {tab !== "graph" ? (
          <div className="hidden h-[180px] shrink-0 border-t border-[var(--border)] lg:block">
            <GraphView mode="panel" className="h-full" />
          </div>
        ) : null}
      </aside>
    </>
  );
}

function Empty({ text }: { text: string }) {
  return (
    <p className="rounded-[12px] border border-dashed border-[var(--border)] px-3 py-6 text-center text-[12.5px] leading-relaxed text-[var(--text-muted)]">
      {text}
    </p>
  );
}
