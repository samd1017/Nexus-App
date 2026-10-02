import { useMemo } from "react";
import { useVaultStore } from "@/lib/vault/store";
import { buildEgoGraph } from "@/lib/graph/build-graph";
import { layoutLocalRing } from "@/lib/graph/local-layout";
import { cn } from "@/lib/utils";

const NEIGHBOR_CAP = 24;

type Props = {
  className?: string;
};

export function LocalGraph2D({ className }: Props) {
  const nodes = useVaultStore((s) => s.nodes);
  const activeNoteId = useVaultStore((s) => s.activeNoteId);
  const setActiveNote = useVaultStore((s) => s.setActiveNote);
  const active = activeNoteId ? nodes[activeNoteId] : null;

  const model = useMemo(() => {
    if (!active || active.kind !== "note") return null;
    const ego = buildEgoGraph(nodes, active.id, 1, NEIGHBOR_CAP + 1);
    const listed = ego.nodes.filter((n) => n.kind !== "folder");
    const center = listed.find((n) => n.id === active.id);
    const neighbors = listed.filter((n) => n.id !== active.id).slice(0, NEIGHBOR_CAP);
    const keep = new Set([active.id, ...neighbors.map((n) => n.id)]);
    const points = layoutLocalRing([
      {
        id: active.id,
        title: center?.title || active.name.replace(/\.md$/i, ""),
        center: true,
      },
      ...neighbors.map((n) => ({ id: n.id, title: n.title, center: false })),
    ]);
    const edges = ego.edges.filter((e) => keep.has(e.source) && keep.has(e.target));
    return {
      points,
      edges,
      truncated: listed.length > NEIGHBOR_CAP + 1,
      neighborCount: neighbors.length,
    };
  }, [nodes, active]);

  if (!model) {
    return (
      <div
        className={cn(
          "flex h-full min-h-[220px] items-center justify-center px-6 text-center text-[13px] text-[var(--text-muted)]",
          className,
        )}
        data-testid="local-graph-empty"
      >
        Open a note to see the notes it links.
      </div>
    );
  }

  const byId = new Map(model.points.map((p) => [p.id, p]));

  return (
    <div className={cn("flex h-full min-h-[220px] flex-col", className)} data-testid="local-graph">
      <p className="shrink-0 px-3 pt-2 text-[12px] text-[var(--text-muted)]">
        {model.neighborCount === 0
          ? "This note has no links yet."
          : model.truncated
            ? `Showing ${model.neighborCount} linked notes.`
            : `${model.neighborCount} linked note${model.neighborCount === 1 ? "" : "s"}.`}
      </p>
      <svg
        className="min-h-0 w-full flex-1"
        viewBox="-280 -240 560 480"
        role="img"
        aria-label="Local link map"
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
            <circle
              r={p.center ? 16 : 9}
              fill={p.center ? "#00c8ff" : "#1a2430"}
              stroke={p.center ? "#9aeeff" : "rgba(210,220,232,0.7)"}
              strokeWidth={p.center ? 2 : 1.25}
            />
            <text
              y={p.center ? 30 : 22}
              textAnchor="middle"
              fill="#f2f6fb"
              fontSize={p.center ? 13 : 11}
              fontFamily="inherit"
            >
              {p.title.length > 28 ? `${p.title.slice(0, 26)}…` : p.title}
            </text>
            <circle
              r={28}
              fill="transparent"
              className="cursor-pointer"
              role="button"
              aria-label={p.center ? p.title : `Open ${p.title}`}
              onClick={() => setActiveNote(p.id)}
            >
              <title>{p.title}</title>
            </circle>
          </g>
        ))}
      </svg>
    </div>
  );
}
