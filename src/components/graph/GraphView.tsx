import { useEffect, useMemo, useRef, useState } from "react";
import ForceGraph from "force-graph";
import { useVaultStore } from "@/lib/vault/store";
import { buildGraph } from "@/lib/graph/build-graph";
import { Maximize2, Minimize2, Network } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  mode: "panel" | "fullscreen";
  className?: string;
}

type FGNode = {
  id: string;
  name: string;
  val: number;
  preview: string;
  path: string;
  x?: number;
  y?: number;
};

type FGLink = { source: string | FGNode; target: string | FGNode };
type GraphApi = InstanceType<typeof ForceGraph>;

export function GraphView({ mode, className }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const graphRef = useRef<GraphApi | null>(null);
  const activeRef = useRef<string | null>(null);
  const nodes = useVaultStore((s) => s.nodes);
  const activeNoteId = useVaultStore((s) => s.activeNoteId);
  const setActiveNote = useVaultStore((s) => s.setActiveNote);
  const setGraphMode = useVaultStore((s) => s.setGraphMode);
  const [tooltip, setTooltip] = useState<{
    x: number;
    y: number;
    title: string;
    preview: string;
  } | null>(null);

  activeRef.current = activeNoteId;

  const data = useMemo(() => {
    const g = buildGraph(nodes);
    return {
      nodes: g.nodes.map((n) => ({
        id: n.id,
        name: n.title,
        val: Math.max(1, n.degree + 1),
        preview: n.preview,
        path: n.path,
      })) as FGNode[],
      links: g.edges.map((e) => ({
        source: e.source,
        target: e.target,
      })) as FGLink[],
    };
  }, [nodes]);

  useEffect(() => {
    if (!hostRef.current) return;

    const paintNode = (
      node: object,
      ctx: CanvasRenderingContext2D,
      globalScale: number,
    ) => {
      const n = node as FGNode;
      if (n.x == null || n.y == null) return;
      const label = n.name;
      const fontSize = Math.max(11 / globalScale, 2.4);
      const r = 3.6 + Math.sqrt(n.val) * 2.8;
      const isActive = n.id === activeRef.current;

      // soft outer bloom
      const bloom = ctx.createRadialGradient(n.x, n.y, 0, n.x, n.y, r * 3.2);
      bloom.addColorStop(0, isActive ? "rgba(0,200,255,0.45)" : "rgba(0,200,255,0.22)");
      bloom.addColorStop(0.45, isActive ? "rgba(0,200,255,0.12)" : "rgba(0,200,255,0.06)");
      bloom.addColorStop(1, "rgba(0,200,255,0)");
      ctx.fillStyle = bloom;
      ctx.beginPath();
      ctx.arc(n.x, n.y, r * 3.2, 0, Math.PI * 2);
      ctx.fill();

      // core
      const core = ctx.createRadialGradient(n.x - r * 0.25, n.y - r * 0.25, 0, n.x, n.y, r);
      core.addColorStop(0, isActive ? "#9aeeff" : "#5adfff");
      core.addColorStop(0.55, isActive ? "#00c8ff" : "#00b4e6");
      core.addColorStop(1, isActive ? "#0090c0" : "#007aa3");
      ctx.beginPath();
      ctx.arc(n.x, n.y, r, 0, Math.PI * 2);
      ctx.fillStyle = core;
      ctx.shadowColor = "rgba(0,200,255,0.75)";
      ctx.shadowBlur = isActive ? 22 : 12;
      ctx.fill();
      ctx.shadowBlur = 0;

      ctx.strokeStyle = isActive ? "rgba(255,255,255,0.65)" : "rgba(255,255,255,0.16)";
      ctx.lineWidth = (isActive ? 1.4 : 1) / globalScale;
      ctx.stroke();

      if (globalScale > 0.5 || isActive || mode === "fullscreen") {
        ctx.font = `500 ${fontSize}px Inter, system-ui, sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "top";
        ctx.fillStyle = isActive ? "rgba(242,242,247,0.98)" : "rgba(242,242,247,0.78)";
        ctx.fillText(label, n.x, n.y + r + 3);
      }
    };

    const graph = new ForceGraph(hostRef.current)
      .backgroundColor("rgba(0,0,0,0)")
      .nodeId("id")
      .nodeLabel(() => "")
      .nodeVal("val")
      .nodeRelSize(5)
      .linkColor(() =>
        mode === "fullscreen" ? "rgba(0, 200, 255, 0.22)" : "rgba(0, 200, 255, 0.16)",
      )
      .linkWidth(() => (mode === "fullscreen" ? 1.15 : 0.9))
      .linkDirectionalParticles(mode === "fullscreen" ? 1 : 0)
      .linkDirectionalParticleWidth(1.4)
      .linkDirectionalParticleSpeed(0.004)
      .linkDirectionalParticleColor(() => "rgba(0,200,255,0.55)")
      .enableNodeDrag(true)
      .cooldownTicks(100)
      .d3AlphaDecay(0.028)
      .d3VelocityDecay(0.28)
      .nodeCanvasObject(paintNode)
      .onNodeHover((node) => {
        if (!hostRef.current) return;
        if (!node) {
          setTooltip(null);
          hostRef.current.style.cursor = "grab";
          return;
        }
        const n = node as FGNode;
        hostRef.current.style.cursor = "pointer";
        if (n.x == null || n.y == null) return;
        const coords = graph.graph2ScreenCoords(n.x, n.y);
        setTooltip({
          x: coords.x,
          y: coords.y,
          title: n.name,
          preview: n.preview,
        });
      })
      .onNodeClick((node) => {
        if (!node) return;
        setActiveNote((node as FGNode).id);
        if (mode === "fullscreen") {
          // keep immersive; user can exit
        }
      });

    graphRef.current = graph;

    const ro = new ResizeObserver(() => {
      if (!hostRef.current || !graphRef.current) return;
      const { width, height } = hostRef.current.getBoundingClientRect();
      graphRef.current.width(width).height(height);
    });
    ro.observe(hostRef.current);
    const { width, height } = hostRef.current.getBoundingClientRect();
    graph.width(width).height(height);

    return () => {
      ro.disconnect();
      if (hostRef.current) hostRef.current.innerHTML = "";
      graphRef.current = null;
    };
  }, [setActiveNote, mode]);

  useEffect(() => {
    if (!graphRef.current) return;
    graphRef.current.graphData(data);
  }, [data]);

  useEffect(() => {
    if (!graphRef.current) return;
    graphRef.current.nodeCanvasObject((node, ctx, globalScale) => {
      const n = node as FGNode;
      if (n.x == null || n.y == null) return;
      const label = n.name;
      const fontSize = Math.max(11 / globalScale, 2.4);
      const r = 3.6 + Math.sqrt(n.val) * 2.8;
      const isActive = n.id === activeNoteId;
      const bloom = ctx.createRadialGradient(n.x, n.y, 0, n.x, n.y, r * 3.2);
      bloom.addColorStop(0, isActive ? "rgba(0,200,255,0.45)" : "rgba(0,200,255,0.22)");
      bloom.addColorStop(0.45, isActive ? "rgba(0,200,255,0.12)" : "rgba(0,200,255,0.06)");
      bloom.addColorStop(1, "rgba(0,200,255,0)");
      ctx.fillStyle = bloom;
      ctx.beginPath();
      ctx.arc(n.x, n.y, r * 3.2, 0, Math.PI * 2);
      ctx.fill();
      const core = ctx.createRadialGradient(n.x - r * 0.25, n.y - r * 0.25, 0, n.x, n.y, r);
      core.addColorStop(0, isActive ? "#9aeeff" : "#5adfff");
      core.addColorStop(0.55, isActive ? "#00c8ff" : "#00b4e6");
      core.addColorStop(1, isActive ? "#0090c0" : "#007aa3");
      ctx.beginPath();
      ctx.arc(n.x, n.y, r, 0, Math.PI * 2);
      ctx.fillStyle = core;
      ctx.shadowColor = "rgba(0,200,255,0.75)";
      ctx.shadowBlur = isActive ? 22 : 12;
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.strokeStyle = isActive ? "rgba(255,255,255,0.65)" : "rgba(255,255,255,0.16)";
      ctx.lineWidth = (isActive ? 1.4 : 1) / globalScale;
      ctx.stroke();
      if (globalScale > 0.5 || isActive) {
        ctx.font = `500 ${fontSize}px Inter, system-ui, sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "top";
        ctx.fillStyle = isActive ? "rgba(242,242,247,0.98)" : "rgba(242,242,247,0.78)";
        ctx.fillText(label, n.x, n.y + r + 3);
      }
    });
  }, [activeNoteId]);

  return (
    <div
      className={cn(
        "graph-host relative flex min-h-0 flex-col",
        mode === "fullscreen" && "bg-[radial-gradient(ellipse_at_center,rgba(15,18,24)_0%,#050507_70%)]",
        className,
      )}
    >
      <div className="absolute left-3 right-3 top-3 z-10 flex items-center justify-between">
        <div className="flex items-center gap-2 rounded-full border border-[var(--border)] bg-[rgba(15,15,18,0.8)] px-3 py-1 backdrop-blur-md">
          <Network size={13} className="text-[var(--accent)]" />
          <span className="text-[11px] font-medium text-[var(--text-secondary)]">
            {data.nodes.length} notes · {data.links.length} links
          </span>
        </div>
        <button
          type="button"
          className="icon-btn glass-panel h-8 w-8"
          title={mode === "fullscreen" ? "Exit fullscreen graph" : "Expand graph"}
          onClick={() => setGraphMode(mode === "fullscreen" ? "panel" : "fullscreen")}
        >
          {mode === "fullscreen" ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
        </button>
      </div>

      <div ref={hostRef} className="min-h-0 flex-1" />

      {tooltip ? (
        <div
          className="graph-tooltip"
          style={{
            left: Math.min(
              tooltip.x + 14,
              (hostRef.current?.clientWidth ?? 300) - 200,
            ),
            top: Math.max(8, tooltip.y - 10),
          }}
        >
          <div className="text-[12.5px] font-semibold text-[var(--text-primary)]">
            {tooltip.title}
          </div>
          <div className="mt-1 text-[11.5px] leading-snug text-[var(--text-secondary)]">
            {tooltip.preview || "No preview"}
          </div>
        </div>
      ) : null}

      {data.nodes.length === 0 ? (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <p className="text-[13px] text-[var(--text-muted)]">
            Link notes with [[wikilinks]] to grow the graph
          </p>
        </div>
      ) : null}
    </div>
  );
}
