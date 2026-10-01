import { useMemo, useState } from "react";
import { layoutOverviewGrid } from "@/lib/graph/local-layout";
import { overviewEdges, selectOverviewNotes } from "@/lib/graph/overview";
import { exitGraphForViewport } from "@/lib/layout/viewport";
import { useVaultStore } from "@/lib/vault/store";
import { cn } from "@/lib/utils";

type Props = { className?: string };

/** Flat vault map. Folder Map keeps the 3D planets; this does not restyle them. */
export function OverviewGraph({ className }: Props) {
  const nodes = useVaultStore((s) => s.nodes);
  const setActiveNote = useVaultStore((s) => s.setActiveNote);
  const [folder, setFolder] = useState("");
  const [tag, setTag] = useState("");

  const model = useMemo(() => {
    const selected = selectOverviewNotes(nodes, { folder, tag });
    const points = layoutOverviewGrid(selected.notes.map((n) => ({ id: n.id, title: n.title })));
    return {
      ...selected,
      points,
      edges: overviewEdges(nodes, selected.notes),
    };
  }, [nodes, folder, tag]);

  const byId = new Map(model.points.map((p) => [p.id, p]));
  const xs = model.points.map((p) => p.x);
  const ys = model.points.map((p) => p.y);
  const minX = Math.min(-160, ...(xs.length ? xs : [0])) - 80;
  const minY = Math.min(-120, ...(ys.length ? ys : [0])) - 48;
  const maxX = Math.max(160, ...(xs.length ? xs : [0])) + 80;
  const maxY = Math.max(120, ...(ys.length ? ys : [0])) + 48;

  const openNote = (id: string) => {
    setActiveNote(id);
    if (useVaultStore.getState().settings.graphMode === "fullscreen") exitGraphForViewport();
  };

  return (
    <div className={cn("flex h-full min-h-[220px] flex-col", className)} data-testid="graph-overview">
      <div className="flex shrink-0 flex-wrap items-center gap-2 px-3 pt-2">
        <input
          value={folder}
          onChange={(e) => setFolder(e.target.value)}
          placeholder="Folder"
          className="nexus-field h-7 w-28 rounded-md border border-[var(--border)] bg-transparent px-2 text-[12px]"
          data-testid="graph-overview-folder"
        />
        <input
          value={tag}
          onChange={(e) => setTag(e.target.value)}
          placeholder="Tag"
          className="nexus-field h-7 w-24 rounded-md border border-[var(--border)] bg-transparent px-2 text-[12px]"
          data-testid="graph-overview-tag"
        />
        <p className="text-[12px] text-[var(--text-muted)]" data-testid="graph-overview-count">
          {model.truncated
            ? `Showing ${model.notes.length} of ${model.total} notes`
            : `${model.notes.length} note${model.notes.length === 1 ? "" : "s"}`}
        </p>
      </div>
      <p className="shrink-0 px-3 pt-1 text-[11px] text-[var(--text-muted)]" data-testid="graph-overview-disclosure">
        Vault overview. Still missing: force sliders and color groups.
      </p>
      {model.notes.length === 0 ? (
        <p className="px-3 py-6 text-[12px] text-[var(--text-muted)]">No notes match this folder or tag.</p>
      ) : (
        <svg
          className="min-h-0 w-full flex-1"
          viewBox={`${minX} ${minY} ${maxX - minX} ${maxY - minY}`}
          role="img"
          aria-label="Vault graph overview"
        >
          {model.edges.map((e) => {
            const a = byId.get(e.source);
            const b = byId.get(e.target);
            if (!a || !b) return null;
            return (
              <line
                key={`${e.source}-${e.target}`}
                x1={a.x}
                y1={a.y}
                x2={b.x}
                y2={b.y}
                stroke="rgba(210,220,232,0.45)"
                strokeWidth={1.25}
              />
            );
          })}
          {model.points.map((p) => (
            <g key={p.id} transform={`translate(${p.x} ${p.y})`}>
              <circle r={8} fill="#1a2430" stroke="rgba(210,220,232,0.75)" strokeWidth={1.25} />
              <text y={20} textAnchor="middle" fill="#f2f6fb" fontSize={11} fontFamily="inherit">
                {p.title.length > 22 ? `${p.title.slice(0, 20)}…` : p.title}
              </text>
              <circle
                r={22}
                fill="transparent"
                className="cursor-pointer"
                data-testid="graph-overview-node"
                data-note-id={p.id}
                role="button"
                aria-label={`Open ${p.title}`}
                onClick={() => openNote(p.id)}
              >
                <title>{p.title}</title>
              </circle>
            </g>
          ))}
        </svg>
      )}
    </div>
  );
}
