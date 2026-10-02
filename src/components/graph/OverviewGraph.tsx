import { useMemo, useRef, useState } from "react";
import { DEFAULT_OVERVIEW_FORCE, layoutOverviewForces, type OverviewForce } from "@/lib/graph/overview-layout";
import {
  overviewEdges,
  overviewGroupColor,
  overviewGroupKey,
  selectOverviewNotes,
} from "@/lib/graph/overview";
import { exitGraphForViewport } from "@/lib/layout/viewport";
import { useVaultStore } from "@/lib/vault/store";
import { cn } from "@/lib/utils";

type Props = { className?: string };
type ColorMode = "off" | "folder" | "tag";
type Pin = { x: number; y: number };

const DRAG_PX = 5;

/** Flat vault map. Folder Map keeps the 3D planets; this does not restyle them. */
export function OverviewGraph({ className }: Props) {
  const nodes = useVaultStore((s) => s.nodes);
  const setActiveNote = useVaultStore((s) => s.setActiveNote);
  const [folder, setFolder] = useState("");
  const [tag, setTag] = useState("");
  const [force, setForce] = useState<OverviewForce>(DEFAULT_OVERVIEW_FORCE);
  const [colorMode, setColorMode] = useState<ColorMode>("folder");
  const [hidden, setHidden] = useState<string[]>([]);
  const [pins, setPins] = useState<Record<string, Pin>>({});
  const svgRef = useRef<SVGSVGElement | null>(null);
  const dragRef = useRef<{ id: string; pointerId: number; x: number; y: number; moved: boolean } | null>(null);
  const openTimer = useRef<number | null>(null);

  const pinMap = useMemo(() => {
    const map = new Map<string, Pin>();
    for (const id of Object.keys(pins)) {
      const pin = pins[id];
      if (pin) map.set(id, pin);
    }
    return map;
  }, [pins]);

  const model = useMemo(() => {
    const selected = selectOverviewNotes(nodes, { folder, tag });
    const grouped = selected.notes.map((note) => ({
      ...note,
      group: colorMode === "off" ? "" : overviewGroupKey(note, colorMode),
    }));
    const visible = colorMode === "off" ? grouped : grouped.filter((note) => !hidden.includes(note.group));
    const keys = [...new Set(grouped.map((note) => note.group).filter(Boolean))].sort();
    const points = layoutOverviewForces(
      visible.map((note) => ({ id: note.id, title: note.title })),
      overviewEdges(nodes, visible),
      force,
      pinMap,
    );
    return {
      ...selected,
      visible,
      keys,
      points,
      edges: overviewEdges(nodes, visible),
    };
  }, [nodes, folder, tag, force, colorMode, hidden, pinMap]);

  const clientToSvg = (clientX: number, clientY: number): Pin | null => {
    const svg = svgRef.current;
    if (!svg) return null;
    const pt = svg.createSVGPoint();
    pt.x = clientX;
    pt.y = clientY;
    const ctm = svg.getScreenCTM();
    if (!ctm) return null;
    const at = pt.matrixTransform(ctm.inverse());
    return { x: at.x, y: at.y };
  };

  const unpin = (id: string) => {
    setPins((prev) => {
      if (!prev[id]) return prev;
      const next = { ...prev };
      delete next[id];
      return next;
    });
  };

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
            ? `Showing ${model.visible.length} of ${model.total} notes`
            : `${model.visible.length} note${model.visible.length === 1 ? "" : "s"}`}
        </p>
        <label className="flex items-center gap-1 text-[11px] text-[var(--text-muted)]">
          Center
          <input
            type="range"
            min={0}
            max={100}
            value={force.center}
            data-testid="graph-overview-center"
            onChange={(e) => setForce((prev) => ({ ...prev, center: Number(e.target.value) }))}
          />
        </label>
        <label className="flex items-center gap-1 text-[11px] text-[var(--text-muted)]">
          Link
          <input
            type="range"
            min={40}
            max={280}
            value={force.link}
            data-testid="graph-overview-link"
            onChange={(e) => setForce((prev) => ({ ...prev, link: Number(e.target.value) }))}
          />
        </label>
        <label className="flex items-center gap-1 text-[11px] text-[var(--text-muted)]">
          Repulsion
          <input
            type="range"
            min={0}
            max={100}
            value={force.repulsion}
            data-testid="graph-overview-repulsion"
            onChange={(e) => setForce((prev) => ({ ...prev, repulsion: Number(e.target.value) }))}
          />
        </label>
      </div>
      <div className="flex shrink-0 flex-wrap items-center gap-1 px-3 pt-1">
        {(["folder", "tag", "off"] as const).map((mode) => (
          <button
            key={mode}
            type="button"
            data-testid="graph-overview-color"
            data-color-mode={mode}
            aria-pressed={colorMode === mode}
            className={cn(
              "rounded-full px-2 py-0.5 text-[11px]",
              colorMode === mode ? "bg-[var(--accent)] text-black" : "text-[var(--text-secondary)] hover:bg-white/5",
            )}
            onClick={() => {
              setColorMode(mode);
              setHidden([]);
            }}
          >
            {mode === "off" ? "No color" : mode === "folder" ? "Color by folder" : "Color by tag"}
          </button>
        ))}
        <button
          type="button"
          data-testid="graph-overview-clear-pins"
          className="rounded-full px-2 py-0.5 text-[11px] text-[var(--text-secondary)] hover:bg-white/5"
          onClick={() => setPins({})}
        >
          Clear pins
        </button>
        {model.keys.map((key) => (
          <button
            key={key}
            type="button"
            data-testid="graph-overview-group"
            data-group={key}
            aria-pressed={!hidden.includes(key)}
            className={cn("rounded-full px-2 py-0.5 text-[11px]", hidden.includes(key) && "opacity-40")}
            style={{ boxShadow: `inset 0 0 0 2px ${overviewGroupColor(key, model.keys)}` }}
            onClick={() =>
              setHidden((prev) => (prev.includes(key) ? prev.filter((item) => item !== key) : [...prev, key]))
            }
          >
            {key}
          </button>
        ))}
      </div>
      <p className="shrink-0 px-3 pt-1 text-[11px] text-[var(--text-muted)]" data-testid="graph-overview-disclosure">
        Vault overview. Drag a note to pin it here. Still missing: saved group queries.
      </p>
      {model.visible.length === 0 ? (
        <p className="px-3 py-6 text-[12px] text-[var(--text-muted)]">No notes match this folder or tag.</p>
      ) : (
        <svg
          ref={svgRef}
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
          {model.points.map((p) => {
            const note = model.visible.find((item) => item.id === p.id);
            const fill = note?.group ? overviewGroupColor(note.group, model.keys) : "#1a2430";
            return (
            <g key={p.id} transform={`translate(${p.x} ${p.y})`}>
              <circle r={8} fill={fill} stroke="rgba(210,220,232,0.75)" strokeWidth={1.25} data-color={fill} />
              <text y={20} textAnchor="middle" fill="#f2f6fb" fontSize={11} fontFamily="inherit">
                {p.title.length > 22 ? `${p.title.slice(0, 20)}…` : p.title}
              </text>
              <circle
                r={22}
                fill="transparent"
                className="cursor-pointer"
                data-testid="graph-overview-node"
                data-note-id={p.id}
                data-group={note?.group || ""}
                data-pinned={pins[p.id] ? "true" : "false"}
                role="button"
                aria-label={`Open ${p.title}`}
                onPointerDown={(event) => {
                  if (event.button !== 0) return;
                  event.currentTarget.setPointerCapture(event.pointerId);
                  dragRef.current = {
                    id: p.id,
                    pointerId: event.pointerId,
                    x: event.clientX,
                    y: event.clientY,
                    moved: false,
                  };
                }}
                onPointerMove={(event) => {
                  const drag = dragRef.current;
                  if (!drag || drag.pointerId !== event.pointerId || drag.id !== p.id) return;
                  if (!drag.moved && Math.hypot(event.clientX - drag.x, event.clientY - drag.y) < DRAG_PX) return;
                  drag.moved = true;
                  const at = clientToSvg(event.clientX, event.clientY);
                  if (!at) return;
                  setPins((prev) => ({ ...prev, [p.id]: at }));
                }}
                onPointerUp={(event) => {
                  const drag = dragRef.current;
                  if (!drag || drag.pointerId !== event.pointerId || drag.id !== p.id) return;
                  dragRef.current = null;
                  if (drag.moved) return;
                  if (pins[p.id]) {
                    if (openTimer.current != null) window.clearTimeout(openTimer.current);
                    openTimer.current = window.setTimeout(() => openNote(p.id), 250);
                    return;
                  }
                  openNote(p.id);
                }}
                onDoubleClick={(event) => {
                  if (!pins[p.id]) return;
                  event.preventDefault();
                  event.stopPropagation();
                  if (openTimer.current != null) window.clearTimeout(openTimer.current);
                  unpin(p.id);
                }}
              >
                <title>{p.title}</title>
              </circle>
            </g>
            );
          })}
        </svg>
      )}
    </div>
  );
}
