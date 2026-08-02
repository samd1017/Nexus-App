import { useEffect, useMemo, useRef, useState } from "react";
import ForceGraph from "force-graph";
import { useVaultStore } from "@/lib/vault/store";
import { buildGraph } from "@/lib/graph/build-graph";
import { Maximize2, Minimize2, Network, Sparkles } from "lucide-react";
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
  degree: number;
  x?: number;
  y?: number;
};

type FGLink = {
  source: string | FGNode;
  target: string | FGNode;
};

type GraphApi = InstanceType<typeof ForceGraph>;

function paintPremiumNode(
  node: FGNode,
  ctx: CanvasRenderingContext2D,
  globalScale: number,
  activeId: string | null,
  mode: "panel" | "fullscreen",
) {
  if (node.x == null || node.y == null) return;
  const isActive = node.id === activeId;
  const isHub = node.degree >= 3;
  const r = 3.2 + Math.sqrt(node.val) * (mode === "fullscreen" ? 3.4 : 2.6);
  const fontSize = Math.max((mode === "fullscreen" ? 12 : 10.5) / globalScale, 2.2);

  const outerR = r * (isActive ? 4.2 : isHub ? 3.4 : 2.8);
  const bloom = ctx.createRadialGradient(node.x, node.y, 0, node.x, node.y, outerR);
  if (isActive) {
    bloom.addColorStop(0, "rgba(0,200,255,0.55)");
    bloom.addColorStop(0.35, "rgba(0,200,255,0.18)");
    bloom.addColorStop(0.7, "rgba(123,97,255,0.08)");
    bloom.addColorStop(1, "rgba(0,200,255,0)");
  } else if (isHub) {
    bloom.addColorStop(0, "rgba(123,97,255,0.28)");
    bloom.addColorStop(0.5, "rgba(0,200,255,0.1)");
    bloom.addColorStop(1, "rgba(0,0,0,0)");
  } else {
    bloom.addColorStop(0, "rgba(0,200,255,0.22)");
    bloom.addColorStop(0.55, "rgba(0,200,255,0.06)");
    bloom.addColorStop(1, "rgba(0,0,0,0)");
  }
  ctx.fillStyle = bloom;
  ctx.beginPath();
  ctx.arc(node.x, node.y, outerR, 0, Math.PI * 2);
  ctx.fill();

  ctx.beginPath();
  ctx.arc(node.x, node.y, r + 1.6 / globalScale, 0, Math.PI * 2);
  ctx.strokeStyle = isActive ? "rgba(255,255,255,0.35)" : "rgba(255,255,255,0.08)";
  ctx.lineWidth = 1 / globalScale;
  ctx.stroke();

  const core = ctx.createRadialGradient(
    node.x - r * 0.3,
    node.y - r * 0.35,
    0,
    node.x,
    node.y,
    r,
  );
  if (isActive) {
    core.addColorStop(0, "#c8f7ff");
    core.addColorStop(0.4, "#00d4ff");
    core.addColorStop(1, "#0088b8");
  } else if (isHub) {
    core.addColorStop(0, "#b8a8ff");
    core.addColorStop(0.45, "#7b61ff");
    core.addColorStop(1, "#4a38b0");
  } else {
    core.addColorStop(0, "#7ae8ff");
    core.addColorStop(0.5, "#00b4e6");
    core.addColorStop(1, "#007a9e");
  }

  ctx.beginPath();
  ctx.arc(node.x, node.y, r, 0, Math.PI * 2);
  ctx.fillStyle = core;
  ctx.shadowColor = isActive
    ? "rgba(0,200,255,0.9)"
    : isHub
      ? "rgba(123,97,255,0.55)"
      : "rgba(0,200,255,0.45)";
  ctx.shadowBlur = isActive ? 26 : isHub ? 16 : 10;
  ctx.fill();
  ctx.shadowBlur = 0;

  ctx.beginPath();
  ctx.arc(node.x - r * 0.28, node.y - r * 0.3, r * 0.28, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(255,255,255,0.35)";
  ctx.fill();

  if (globalScale > 0.45 || isActive || mode === "fullscreen") {
    ctx.font = `${isActive ? 600 : 500} ${fontSize}px Inter, system-ui, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    ctx.fillStyle = isActive ? "rgba(248,248,252,0.98)" : "rgba(230,230,238,0.82)";
    ctx.shadowColor = "rgba(0,0,0,0.65)";
    ctx.shadowBlur = 4;
    ctx.fillText(node.name, node.x, node.y + r + 3.5);
    ctx.shadowBlur = 0;
  }
}

function linkIds(link: FGLink): [string, string] {
  const s = typeof link.source === "object" ? link.source.id : String(link.source);
  const t = typeof link.target === "object" ? link.target.id : String(link.target);
  return [s, t];
}

export function GraphView({ mode, className }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const graphRef = useRef<GraphApi | null>(null);
  const activeRef = useRef<string | null>(null);
  const nodes = useVaultStore((s) => s.nodes);
  const activeNoteId = useVaultStore((s) => s.activeNoteId);
  const setActiveNote = useVaultStore((s) => s.setActiveNote);
  const setGraphMode = useVaultStore((s) => s.setGraphMode);
  const setLeftOpen = useVaultStore((s) => s.setLeftOpen);
  const setRightOpen = useVaultStore((s) => s.setRightOpen);
  const [tooltip, setTooltip] = useState<{
    x: number;
    y: number;
    title: string;
    path: string;
    preview: string;
    degree: number;
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
        degree: n.degree,
      })) as FGNode[],
      links: g.edges.map((e) => ({
        source: e.source,
        target: e.target,
      })) as FGLink[],
    };
  }, [nodes]);

  useEffect(() => {
    if (!hostRef.current) return;

    const openNoteFromGraph = (id: string) => {
      // Exit fullscreen so the editor shell is visible again
      setGraphMode("panel");
      setLeftOpen(true);
      if (typeof window !== "undefined" && window.innerWidth >= 1200) {
        setRightOpen(true);
      }
      setActiveNote(id);
    };

    const graph = new ForceGraph(hostRef.current)
      .backgroundColor("rgba(0,0,0,0)")
      .nodeId("id")
      .nodeLabel(() => "")
      .nodeVal("val")
      .nodeRelSize(5)
      .linkColor((link) => {
        const [s, t] = linkIds(link as FGLink);
        const active = activeRef.current;
        if (active && (s === active || t === active)) {
          return "rgba(0, 200, 255, 0.5)";
        }
        return mode === "fullscreen"
          ? "rgba(0, 200, 255, 0.18)"
          : "rgba(0, 200, 255, 0.12)";
      })
      .linkWidth((link) => {
        const [s, t] = linkIds(link as FGLink);
        const active = activeRef.current;
        if (active && (s === active || t === active)) {
          return mode === "fullscreen" ? 1.8 : 1.4;
        }
        return mode === "fullscreen" ? 1.05 : 0.85;
      })
      .linkDirectionalParticles(mode === "fullscreen" ? 2 : 1)
      .linkDirectionalParticleWidth(1.6)
      .linkDirectionalParticleSpeed(0.0055)
      .linkDirectionalParticleColor(() => "rgba(0,220,255,0.7)")
      .enableNodeDrag(true)
      .cooldownTicks(140)
      .d3AlphaDecay(0.022)
      .d3VelocityDecay(0.32)
      .nodeCanvasObject((node, ctx, globalScale) => {
        paintPremiumNode(node as FGNode, ctx, globalScale, activeRef.current, mode);
      })
      .nodePointerAreaPaint((node, color, ctx) => {
        const n = node as FGNode;
        if (n.x == null || n.y == null) return;
        const r = 6 + Math.sqrt(n.val) * 3;
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(n.x, n.y, r, 0, Math.PI * 2);
        ctx.fill();
      })
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
          path: n.path,
          preview: n.preview,
          degree: n.degree,
        });
      })
      .onNodeClick((node) => {
        if (!node) return;
        openNoteFromGraph((node as FGNode).id);
      })
      .onBackgroundClick(() => setTooltip(null));

    try {
      const charge = graph.d3Force("charge") as
        | { strength?: (n: number) => unknown }
        | undefined;
      charge?.strength?.(mode === "fullscreen" ? -180 : -120);
      const link = graph.d3Force("link") as
        | { distance?: (n: number) => unknown }
        | undefined;
      link?.distance?.(mode === "fullscreen" ? 72 : 48);
    } catch {
      /* ignore force API variance */
    }

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
  }, [setActiveNote, setGraphMode, setLeftOpen, setRightOpen, mode]);

  useEffect(() => {
    if (!graphRef.current) return;
    graphRef.current.graphData(data);
  }, [data]);

  useEffect(() => {
    if (!graphRef.current) return;
    graphRef.current
      .nodeCanvasObject((node, ctx, globalScale) => {
        paintPremiumNode(node as FGNode, ctx, globalScale, activeNoteId, mode);
      })
      .linkColor((link) => {
        const [s, t] = linkIds(link as FGLink);
        if (activeNoteId && (s === activeNoteId || t === activeNoteId)) {
          return "rgba(0, 200, 255, 0.5)";
        }
        return mode === "fullscreen"
          ? "rgba(0, 200, 255, 0.18)"
          : "rgba(0, 200, 255, 0.12)";
      });
  }, [activeNoteId, mode]);

  return (
    <div
      className={cn(
        "graph-host relative flex min-h-0 flex-col",
        mode === "fullscreen" &&
          "bg-[radial-gradient(ellipse_at_center,rgb(12,16,22)_0%,#050507_68%)]",
        className,
      )}
    >
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.04]"
        style={{
          backgroundImage:
            "radial-gradient(circle at 1px 1px, rgba(255,255,255,0.5) 1px, transparent 0)",
          backgroundSize: "28px 28px",
        }}
      />

      <div className="absolute left-3 right-3 top-3 z-10 flex items-center justify-between">
        <div className="flex items-center gap-2 rounded-full border border-[var(--border)] bg-[rgba(10,10,12,0.82)] px-3 py-1.5 shadow-[0_4px_24px_rgba(0,0,0,0.35)] backdrop-blur-md">
          <Network size={13} className="text-[var(--accent)]" />
          <span className="text-[11px] font-medium tracking-wide text-[var(--text-secondary)]">
            {data.nodes.length} notes
            <span className="mx-1.5 text-[var(--text-muted)]">·</span>
            {data.links.length} links
          </span>
        </div>
        <button
          type="button"
          className="icon-btn glass-panel pointer-events-auto h-8 w-8"
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
            left: Math.min(tooltip.x + 16, (hostRef.current?.clientWidth ?? 320) - 220),
            top: Math.max(12, tooltip.y - 12),
          }}
        >
          <div className="flex items-start justify-between gap-2">
            <div className="text-[13px] font-semibold tracking-tight text-[var(--text-primary)]">
              {tooltip.title}
            </div>
            {tooltip.degree > 0 ? (
              <span className="shrink-0 rounded-full bg-[rgba(0,200,255,0.12)] px-1.5 py-0.5 text-[10px] font-medium text-[var(--accent)]">
                {tooltip.degree}×
              </span>
            ) : null}
          </div>
          <div className="mt-0.5 truncate font-mono text-[10px] text-[var(--text-muted)]">
            {tooltip.path}
          </div>
          <div className="mt-2 text-[12px] leading-snug text-[var(--text-secondary)]">
            {tooltip.preview || "Empty note"}
          </div>
          <div className="mt-2 text-[10px] text-[var(--text-muted)]">Click to open</div>
        </div>
      ) : null}

      {data.nodes.length === 0 ? (
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center px-6 text-center">
          <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl border border-[rgba(0,200,255,0.2)] bg-[rgba(0,200,255,0.08)] text-[var(--accent)]">
            <Sparkles size={20} />
          </div>
          <p className="text-[14px] font-medium text-[var(--text-primary)]">
            Graph is waiting for links
          </p>
          <p className="mt-1 max-w-[240px] text-[12.5px] leading-snug text-[var(--text-muted)]">
            Connect notes with <span className="text-[var(--accent)]">[[wikilinks]]</span> to
            grow the map.
          </p>
        </div>
      ) : null}
    </div>
  );
}
