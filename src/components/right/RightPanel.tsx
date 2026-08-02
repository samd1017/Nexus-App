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
              <div className="mb-2 text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--text-muted)]">
                Linked mentions
              </div>
              {backlinks.length === 0 ? (
                <div className="rounded-[12px] border border-dashed border-[var(--border)] px-3 py-6 text-center">
                  <p className="text-[13px] text-[var(--text-secondary)]">No backlinks yet</p>
                  <p className="mt-1 text-[11.5px] leading-snug text-[var(--text-muted)]">
                    Other notes that [[mention this]] will appear here.
                  </p>
                </div>
              ) : (
                <ul className="flex flex-col gap-1">
                  {backlinks.map((b) => (
                    <li key={b.fromId}>
                      <button
                        type="button"
                        className="tree-row w-full rounded-[10px] px-2.5 py-2 text-left hover:bg-white/[0.05]"
                        onClick={() => setActiveNote(b.fromId)}
                      >
                        <div className="text-[13px] font-medium text-[var(--text-primary)]">
                          {b.fromTitle || noteTitle({ name: b.fromPath, kind: "note" } as never)}
                        </div>
                        <div className="mt-0.5 line-clamp-2 text-[11.5px] text-[var(--text-muted)]">
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
              <div className="mb-2 text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--text-muted)]">
                Outline
              </div>
              {outline.length === 0 ? (
                <div className="rounded-[12px] border border-dashed border-[var(--border)] px-3 py-6 text-center">
                  <p className="text-[13px] text-[var(--text-secondary)]">No headings</p>
                  <p className="mt-1 text-[11.5px] text-[var(--text-muted)]">
                    Use # headings to structure the note.
                  </p>
                </div>
              ) : (
                <ul className="flex flex-col gap-0.5">
                  {outline.map((h, i) => (
                    <li
                      key={i}
                      className="truncate rounded-md px-2 py-1.5 text-[12.5px] text-[var(--text-secondary)] hover:bg-white/[0.04] hover:text-[var(--text-primary)]"
                      style={{ paddingLeft: 8 + (h.level - 1) * 12 }}
                    >
                      {h.text}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ) : null}

          {tab === "graph" ? (
            <div className="flex h-[min(420px,50vh)] min-h-[280px] flex-col">
              <GraphView mode="panel" className="h-full min-h-[280px]" />
            </div>
          ) : null}
        </div>
      </aside>
    </>
  );
}
