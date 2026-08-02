import { useEffect, useMemo, useRef, useState } from "react";
import ForceGraph3D, { type ForceGraph3DInstance } from "3d-force-graph";
import * as THREE from "three";
import SpriteText from "three-spritetext";
import { useVaultStore } from "@/lib/vault/store";
import { buildGraph } from "@/lib/graph/build-graph";
import { Maximize2, Minimize2, Network } from "lucide-react";
import { cn } from "@/lib/utils";
import { usePrefsStore, type PhysicsIntensity } from "@/lib/prefs/preferences";

interface Props {
  mode: "panel" | "fullscreen";
  className?: string;
}

type GNode = {
  id: string;
  name: string;
  val: number;
  preview: string;
  path: string;
  degree: number;
  x?: number;
  y?: number;
  z?: number;
};

type GLink = {
  source: string | GNode;
  target: string | GNode;
};

function accentRgb(): { r: number; g: number; b: number } {
  if (typeof document === "undefined") return { r: 0, g: 200, b: 255 };
  const raw = getComputedStyle(document.documentElement)
    .getPropertyValue("--accent")
    .trim();
  const m = /^#?([0-9a-f]{6})$/i.exec(raw);
  if (!m) return { r: 0, g: 200, b: 255 };
  const n = parseInt(m[1], 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

function physicsParams(intensity: PhysicsIntensity) {
  if (intensity === "calm") {
    return { charge: -48, distance: 42, velocity: 0.42, alpha: 0.03 };
  }
  if (intensity === "energetic") {
    return { charge: -130, distance: 28, velocity: 0.22, alpha: 0.015 };
  }
  return { charge: -85, distance: 36, velocity: 0.3, alpha: 0.02 };
}

function buildStudioEnv(renderer: THREE.WebGLRenderer): THREE.Texture {
  const pmrem = new THREE.PMREMGenerator(renderer);
  pmrem.compileEquirectangularShader();
  const scene = new THREE.Scene();

  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(50, 32, 32),
    new THREE.MeshBasicMaterial({ side: THREE.BackSide, depthWrite: false }),
  );
  const geo = sky.geometry as THREE.SphereGeometry;
  const cols = new Float32Array(geo.attributes.position.count * 3);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i) / 50;
    const t = (y + 1) * 0.5;
    cols[i * 3] = 0.14 + t * 0.5;
    cols[i * 3 + 1] = 0.16 + t * 0.52;
    cols[i * 3 + 2] = 0.2 + t * 0.55;
  }
  geo.setAttribute("color", new THREE.BufferAttribute(cols, 3));
  (sky.material as THREE.MeshBasicMaterial).vertexColors = true;
  scene.add(sky);

  const addPanel = (
    color: number,
    intensity: number,
    w: number,
    h: number,
    p: [number, number, number],
    rotY = 0,
  ) => {
    const m = new THREE.Mesh(
      new THREE.PlaneGeometry(w, h),
      new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide }),
    );
    m.position.set(...p);
    m.rotation.y = rotY;
    (m.material as THREE.MeshBasicMaterial).color.multiplyScalar(intensity);
    scene.add(m);
  };
  addPanel(0xe8eef6, 1.8, 18, 14, [20, 12, 10], -0.6);
  addPanel(0x7a8a9e, 0.75, 14, 12, [-18, 4, -8], 0.7);
  addPanel(0x4a5a6a, 0.45, 20, 8, [0, -14, 5], 0);

  const env = pmrem.fromScene(scene, 0.03).texture;
  pmrem.dispose();
  scene.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (mesh.geometry) mesh.geometry.dispose();
    if (mesh.material) (mesh.material as THREE.Material).dispose();
  });
  return env;
}

/** Deep-space sky: fine dust stars + soft nebulae (not chunky sparkles) */
function paintGalaxyTexture(full: boolean): THREE.CanvasTexture {
  const size = full ? 2048 : 1536;
  const c = document.createElement("canvas");
  c.width = size;
  c.height = size;
  const ctx = c.getContext("2d")!;

  // Near-black void
  ctx.fillStyle = "#02040a";
  ctx.fillRect(0, 0, size, size);

  // Subtle large-scale gradient (depth, not a blob)
  const base = ctx.createRadialGradient(
    size * 0.5,
    size * 0.48,
    size * 0.05,
    size * 0.5,
    size * 0.48,
    size * 0.72,
  );
  base.addColorStop(0, "rgba(12, 22, 40, 0.55)");
  base.addColorStop(0.45, "rgba(6, 12, 24, 0.25)");
  base.addColorStop(1, "rgba(2, 4, 10, 0)");
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, size, size);

  // Soft nebula washes — restrained, SpaceX-dark
  const blobs: Array<{
    x: number;
    y: number;
    r: number;
    color: string;
    a: number;
  }> = [
    { x: 0.3, y: 0.4, r: 0.42, color: "30,70,110", a: full ? 0.22 : 0.16 },
    { x: 0.7, y: 0.36, r: 0.36, color: "55,40,95", a: full ? 0.17 : 0.12 },
    { x: 0.52, y: 0.58, r: 0.48, color: "14,48,88", a: full ? 0.16 : 0.11 },
    { x: 0.38, y: 0.7, r: 0.3, color: "28,72,88", a: full ? 0.14 : 0.1 },
    { x: 0.62, y: 0.32, r: 0.24, color: "70,100,130", a: full ? 0.12 : 0.08 },
  ];
  for (const b of blobs) {
    const x = b.x * size;
    const y = b.y * size;
    const r = b.r * size;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, `rgba(${b.color},${b.a})`);
    g.addColorStop(0.5, `rgba(${b.color},${b.a * 0.28})`);
    g.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
  }

  // Thin milky-way style band
  ctx.save();
  ctx.translate(size / 2, size / 2);
  ctx.rotate(-0.42);
  const band = ctx.createLinearGradient(0, -size * 0.1, 0, size * 0.1);
  band.addColorStop(0, "rgba(70,100,140,0)");
  band.addColorStop(0.5, full ? "rgba(90,120,160,0.09)" : "rgba(90,120,160,0.07)");
  band.addColorStop(1, "rgba(70,100,140,0)");
  ctx.fillStyle = band;
  ctx.fillRect(-size, -size * 0.12, size * 2, size * 0.24);

  // Band dust — pinpricks only
  for (let i = 0; i < (full ? 1100 : 650); i++) {
    const x = (Math.random() - 0.5) * size * 1.6;
    const y = (Math.random() - 0.5) * size * 0.09;
    const mag = Math.pow(Math.random(), 2.8);
    const r = 0.15 + mag * 0.4;
    const a = 0.08 + mag * 0.28;
    ctx.beginPath();
    ctx.fillStyle = `rgba(220,230,245,${a})`;
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();

  // Field stars — dense pinpricks, hard dots (less fuzzy)
  const n = full ? 5000 : 3200;
  for (let i = 0; i < n; i++) {
    const x = Math.random() * size;
    const y = Math.random() * size;
    const mag = Math.pow(Math.random(), 3.1);
    // Smaller, sharper — no soft fat discs
    const r = 0.12 + mag * (full ? 0.55 : 0.45);
    const a = 0.1 + mag * 0.48;
    const roll = Math.random();
    let col: string;
    if (roll < 0.1) col = `rgba(170,200,255,${a})`;
    else if (roll > 0.93) col = `rgba(255,230,200,${a * 0.85})`;
    else col = `rgba(230,235,245,${a})`;
    ctx.beginPath();
    ctx.fillStyle = col;
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }

  // Very few brighter pinpoints — no glow halos (fuzzy look)
  const bright = full ? 18 : 10;
  for (let i = 0; i < bright; i++) {
    const x = Math.random() * size;
    const y = Math.random() * size;
    const r = 0.35 + Math.random() * 0.3;
    ctx.beginPath();
    ctx.fillStyle = "rgba(245,248,255,0.78)";
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  tex.needsUpdate = true;
  return tex;
}

/**
 * Single sky sphere — fine galaxy field, slow drift.
 * Dual shells doubled noise and made stars look chunky.
 */
function buildSpaceBackdrop(
  scene: THREE.Scene,
  mode: "panel" | "fullscreen",
): { root: THREE.Group; layers: { obj: THREE.Object3D; speed: number }[] } {
  const root = new THREE.Group();
  const layers: { obj: THREE.Object3D; speed: number }[] = [];
  const full = mode === "fullscreen";

  const tex = paintGalaxyTexture(full);
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(full ? 3000 : 2400, 64, 40),
    new THREE.MeshBasicMaterial({
      map: tex,
      side: THREE.BackSide,
      depthWrite: false,
      depthTest: false,
      transparent: false,
      fog: false,
    }),
  );
  sky.renderOrder = -50;
  sky.frustumCulled = false;
  root.add(sky);
  layers.push({ obj: sky, speed: 0.0009 });

  scene.add(root);
  scene.fog = null;
  scene.background = new THREE.Color(0x02040a);
  return { root, layers };
}

function truncateLabel(name: string, max = 22): string {
  const clean = name.replace(/\s+/g, " ").trim();
  if (clean.length <= max) return clean;
  return clean.slice(0, max - 1) + "…";
}

function linkIds(link: GLink): [string, string] {
  const s =
    typeof link.source === "object" ? link.source.id : String(link.source);
  const t =
    typeof link.target === "object" ? link.target.id : String(link.target);
  return [s, t];
}

function buildNeighbors(links: GLink[]): Map<string, Set<string>> {
  const m = new Map<string, Set<string>>();
  const add = (a: string, b: string) => {
    if (!m.has(a)) m.set(a, new Set());
    m.get(a)!.add(b);
  };
  for (const l of links) {
    const [s, t] = linkIds(l);
    add(s, t);
    add(t, s);
  }
  return m;
}

function makeLabel(
  text: string,
  opts: {
    active: boolean;
    hover: boolean;
    dim: boolean;
    full: boolean;
    radius: number;
  },
): THREE.Object3D {
  const { active, hover, dim, full, radius } = opts;
  const label = new SpriteText(text) as SpriteText & {
    position: THREE.Vector3;
    material: THREE.SpriteMaterial;
  };

  label.fontFace = "Arial";
  label.fontWeight = active || hover ? "bold" : "normal";
  label.fontSize = 120;
  label.color = active
    ? "#f4f7fb"
    : hover
      ? "#e8eef6"
      : dim
        ? "#6a7280"
        : "#c0c8d4";
  label.backgroundColor = "rgba(0,0,0,0)";
  label.padding = 2;
  label.borderWidth = 0;
  label.borderRadius = 0;
  label.strokeWidth = active || hover ? 0.28 : 0.2;
  label.strokeColor = "#000000";

  const th = active
    ? full
      ? 3.2
      : 2.4
    : hover
      ? full
        ? 2.8
        : 2.1
      : full
        ? 2.2
        : 1.7;
  label.textHeight = th;
  label.position.y = radius + th * 0.65 + (full ? 0.4 : 0.25);
  label.renderOrder = active || hover ? 20 : 8;
  label.material.depthTest = false;
  label.material.depthWrite = false;
  label.material.transparent = true;
  label.material.opacity = active ? 1 : hover ? 0.98 : dim ? 0.45 : 0.82;
  label.material.sizeAttenuation = true;

  return label;
}

function createOrb(
  node: GNode,
  activeId: string | null,
  hoverId: string | null,
  focusId: string | null,
  neighbors: Set<string> | null,
  dimStrength: number,
  mode: "panel" | "fullscreen",
  accent: THREE.Color,
  showLabel: boolean,
): THREE.Object3D {
  const group = new THREE.Group();
  const isActive = node.id === activeId;
  const isHover = node.id === hoverId;
  const isHub = node.degree >= 3;
  const inFocus =
    !focusId || node.id === focusId || (neighbors?.has(node.id) ?? false);
  const dim = !!focusId && !inFocus && dimStrength > 0;
  const full = mode === "fullscreen";
  const panel = mode === "panel";
  const segs = full ? 72 : 56;

  const base = full ? 3.0 : panel ? 2.4 : 2.3;
  const rank = isActive || isHover ? 1 : isHub ? 0.82 : 0.62;
  const radius =
    base +
    Math.pow(Math.max(1, node.val), 0.55) * (full ? 1.7 : 1.35) * rank +
    (isActive || isHover ? 0.45 : 0);

  const bodyColor =
    isActive || isHover
      ? new THREE.Color(0x4a5260)
      : isHub
        ? new THREE.Color(0x3c4452)
        : new THREE.Color(0x343c48);

  if (dim) {
    const mul = 1 - dimStrength * 0.55;
    bodyColor.multiplyScalar(mul);
  }

  const bodyOpacity = dim ? 1 - dimStrength * 0.55 : 1;

  const body = new THREE.Mesh(
    new THREE.SphereGeometry(radius, segs, segs),
    new THREE.MeshPhysicalMaterial({
      color: bodyColor,
      metalness: 0.96,
      roughness: isActive || isHover ? 0.12 : isHub ? 0.2 : 0.28,
      clearcoat: isActive || isHover ? 0.8 : 0.45,
      clearcoatRoughness: isActive || isHover ? 0.05 : 0.14,
      transparent: dim && dimStrength > 0.5,
      opacity: bodyOpacity,
      depthWrite: !(dim && dimStrength > 0.5),
      transmission: 0,
      specularIntensity: isActive || isHover ? 1.45 : 1.15,
      specularColor: new THREE.Color(0xe8eef6),
      emissive:
        isActive || isHover
          ? accent.clone()
          : neighbors?.has(node.id)
            ? accent.clone().multiplyScalar(0.35)
            : new THREE.Color(0x000000),
      emissiveIntensity:
        isActive || isHover ? 0.08 : neighbors?.has(node.id) ? 0.04 : 0,
      envMapIntensity: isActive || isHover ? 1.55 : isHub ? 1.2 : 1.05,
      side: THREE.FrontSide,
    }),
  );
  body.renderOrder = dim && dimStrength > 0.5 ? 0 : 1;
  group.add(body);

  if (isActive || isHover) {
    const tube = radius * 0.013;
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(radius * 1.08, tube, 12, full ? 88 : 64),
      new THREE.MeshPhysicalMaterial({
        color: accent.clone().lerp(new THREE.Color(0xd0d8e4), 0.3),
        metalness: 0.95,
        roughness: 0.14,
        emissive: accent.clone(),
        emissiveIntensity: isHover && !isActive ? 0.28 : 0.2,
        envMapIntensity: 1.2,
      }),
    );
    ring.rotation.x = Math.PI / 2;
    ring.renderOrder = 2;
    group.add(ring);
  }

  if (showLabel) {
    group.add(
      makeLabel(truncateLabel(node.name, full ? 24 : 18), {
        active: isActive,
        hover: isHover,
        dim,
        full,
        radius,
      }),
    );
  }

  return group;
}

export function GraphView({ mode, className }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const graphRef = useRef<ForceGraph3DInstance | null>(null);
  const activeRef = useRef<string | null>(null);
  const hoverRef = useRef<string | null>(null);
  const neighborMapRef = useRef<Map<string, Set<string>>>(new Map());
  const nodes = useVaultStore((s) => s.nodes);
  const activeNoteId = useVaultStore((s) => s.activeNoteId);
  const setActiveNote = useVaultStore((s) => s.setActiveNote);
  const setGraphMode = useVaultStore((s) => s.setGraphMode);
  const setLeftOpen = useVaultStore((s) => s.setLeftOpen);
  const setRightOpen = useVaultStore((s) => s.setRightOpen);
  const graphParticles = usePrefsStore((s) => s.graphParticles);
  const physicsIntensity = usePrefsStore((s) => s.physicsIntensity);
  const accentPreset = usePrefsStore((s) => s.accentPreset);
  const accentCustom = usePrefsStore((s) => s.accentCustom);
  const [hoverName, setHoverName] = useState<string | null>(null);
  const [hintVisible, setHintVisible] = useState(true);

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
      })) as GNode[],
      links: g.edges.map((e) => ({
        source: e.source,
        target: e.target,
      })) as GLink[],
    };
  }, [nodes]);

  useEffect(() => {
    neighborMapRef.current = buildNeighbors(data.links);
  }, [data]);

  useEffect(() => {
    setHintVisible(true);
    const t = window.setTimeout(() => setHintVisible(false), 4500);
    return () => window.clearTimeout(t);
  }, [mode]);

  useEffect(() => {
    if (!hostRef.current) return;
    const el = hostRef.current;
    el.innerHTML = "";

    const { r: ar, g: ag, b: ab } = accentRgb();
    const accent = new THREE.Color(ar / 255, ag / 255, ab / 255);
    const phys = physicsParams(physicsIntensity);
    const particleCount = graphParticles ? (mode === "panel" ? 1 : 3) : 0;

    const focusId = () => hoverRef.current || activeRef.current;
    const dimStrength = () =>
      hoverRef.current ? 1 : activeRef.current ? 0.35 : 0;

    const neighborSet = (id: string | null): Set<string> | null => {
      if (!id) return null;
      return neighborMapRef.current.get(id) ?? new Set();
    };

    const shouldShowLabel = (n: GNode) => {
      const f = focusId();
      const ns = neighborSet(f);
      if (n.id === activeRef.current || n.id === hoverRef.current) return true;
      if (f && ns?.has(n.id)) return true;
      if (hoverRef.current) return false;
      return n.degree >= 3;
    };

    const paintOrb = (n: GNode) => {
      const f = focusId();
      return createOrb(
        n,
        activeRef.current,
        hoverRef.current,
        f,
        neighborSet(f),
        dimStrength(),
        mode,
        accent,
        shouldShowLabel(n),
      );
    };

    const edgeStyle = (
      link: GLink,
    ): { color: string; width: number; particles: number } => {
      const [s, t] = linkIds(link);
      const hover = hoverRef.current;
      const active = activeRef.current;

      if (hover) {
        const hot = s === hover || t === hover;
        if (hot) {
          return {
            color: `rgba(${ar},${ag},${ab},0.92)`,
            width: mode === "fullscreen" ? 1.35 : 1.0,
            particles: particleCount > 0 ? particleCount + 1 : 0,
          };
        }
        return {
          color: `rgba(${ar},${ag},${ab},0.05)`,
          width: mode === "fullscreen" ? 0.2 : 0.14,
          particles: 0,
        };
      }

      if (active) {
        const hot = s === active || t === active;
        if (hot) {
          return {
            color: `rgba(${ar},${ag},${ab},0.62)`,
            width: mode === "fullscreen" ? 0.9 : 0.65,
            particles: particleCount,
          };
        }
        return {
          color:
            mode === "fullscreen"
              ? `rgba(${ar},${ag},${ab},0.14)`
              : `rgba(${ar},${ag},${ab},0.11)`,
          width: mode === "fullscreen" ? 0.36 : 0.28,
          particles: 0,
        };
      }

      return {
        color:
          mode === "fullscreen"
            ? `rgba(${ar},${ag},${ab},0.28)`
            : `rgba(${ar},${ag},${ab},0.2)`,
        width: mode === "fullscreen" ? 0.48 : 0.36,
        particles: 0,
      };
    };

    const applyEdgeStyles = (g: ForceGraph3DInstance) => {
      g.linkColor((link) => edgeStyle(link as GLink).color)
        .linkWidth((link) => edgeStyle(link as GLink).width)
        .linkDirectionalParticles((link) => edgeStyle(link as GLink).particles)
        .linkDirectionalParticleWidth(0.55)
        .linkDirectionalParticleSpeed(0.004)
        .linkDirectionalParticleColor(() => {
          const mix = (c: number) => Math.round(c * 0.45 + 255 * 0.55);
          return `rgb(${mix(ar)},${mix(ag)},${mix(ab)})`;
        });
    };

    const graph = new ForceGraph3D(el, {
      controlType: "orbit",
      rendererConfig: {
        antialias: true,
        alpha: true,
        powerPreference: "high-performance",
        // logarithmicDepthBuffer breaks PointsMaterial starfields
        logarithmicDepthBuffer: false,
      },
    })
      .backgroundColor("#03050a")
      .showNavInfo(false)
      .enableNodeDrag(true)
      .enableNavigationControls(true)
      .nodeId("id")
      .nodeLabel(() => "")
      .nodeVal("val")
      .nodeRelSize(4)
      .nodeOpacity(1)
      .nodeThreeObject((n: object) => paintOrb(n as GNode))
      .nodeThreeObjectExtend(false)
      .linkOpacity(0.95)
      .onNodeClick((n: object) => {
        const node = n as GNode;
        if (!node?.id) return;
        setHintVisible(false);
        setGraphMode("panel");
        setLeftOpen(true);
        if (typeof window !== "undefined" && window.innerWidth >= 1200) {
          setRightOpen(true);
        }
        setActiveNote(node.id);
      })
      .onNodeHover((n: object | null) => {
        const node = n as GNode | null;
        hoverRef.current = node?.id ?? null;
        setHoverName(node?.name ?? null);
        el.style.cursor = node ? "pointer" : "grab";
        if (graphRef.current) {
          applyEdgeStyles(graphRef.current);
          graphRef.current
            .nodeThreeObject((nn: object) => paintOrb(nn as GNode))
            .refresh();
        }
      })
      .onBackgroundClick(() => setHintVisible(false));

    applyEdgeStyles(graph);

    let envMap: THREE.Texture | null = null;
    try {
      const renderer = graph.renderer();
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.12;
      if ("outputColorSpace" in renderer) {
        (renderer as THREE.WebGLRenderer).outputColorSpace =
          THREE.SRGBColorSpace;
      }
      envMap = buildStudioEnv(renderer);
      graph.scene().environment = envMap;
    } catch {
      /* ok */
    }

    try {
      const cam = graph.camera() as THREE.PerspectiveCamera;
      if (cam) {
        cam.near = 0.1;
        cam.far = 8000;
        cam.updateProjectionMatrix();
      }
    } catch {
      /* ok */
    }

    let spaceRoot: THREE.Group | null = null;
    let parallaxLayers: { obj: THREE.Object3D; speed: number }[] = [];
    try {
      const scene = graph.scene();
      const remove: THREE.Object3D[] = [];
      scene.traverse((obj: THREE.Object3D) => {
        if ((obj as THREE.Light).isLight) remove.push(obj);
      });
      remove.forEach((l) => scene.remove(l));

      const ambient = new THREE.AmbientLight(0x4a5260, 0.14);
      const hemi = new THREE.HemisphereLight(0x1c2a3c, 0x03050a, 0.38);
      const key = new THREE.DirectionalLight(0xf0f4f8, 1.15);
      key.position.set(60, 95, 45);
      const fill = new THREE.DirectionalLight(0x3a4a5c, 0.42);
      fill.position.set(-55, 10, -40);
      const rim = new THREE.DirectionalLight(0xb0c8e0, 0.32);
      rim.position.set(-40, 30, -60);

      scene.add(ambient, hemi, key, fill, rim);
      graph.lights([ambient, hemi, key, fill, rim]);

      const space = buildSpaceBackdrop(scene, mode);
      spaceRoot = space.root;
      parallaxLayers = space.layers;
    } catch {
      /* ok */
    }

    try {
      const charge = graph.d3Force("charge") as
        | { strength?: (n: number) => unknown }
        | undefined;
      charge?.strength?.(phys.charge);
      const linkF = graph.d3Force("link") as
        | { distance?: (n: number) => unknown }
        | undefined;
      linkF?.distance?.(phys.distance);
      graph.d3AlphaDecay(phys.alpha);
      graph.d3VelocityDecay(phys.velocity);
    } catch {
      /* ok */
    }

    try {
      const controls = graph.controls() as {
        enableDamping?: boolean;
        dampingFactor?: number;
        rotateSpeed?: number;
        zoomSpeed?: number;
        panSpeed?: number;
        minDistance?: number;
        maxDistance?: number;
      } | null;
      if (controls) {
        controls.enableDamping = true;
        controls.dampingFactor = 0.07;
        controls.rotateSpeed = 0.55;
        controls.zoomSpeed = 0.9;
        controls.panSpeed = 0.5;
        controls.minDistance = 10;
        controls.maxDistance = 900;
      }
    } catch {
      /* ok */
    }

    let raf = 0;
    let cancelled = false;
    const t0 = performance.now();
    const drift = () => {
      if (cancelled) return;
      const t = (performance.now() - t0) * 0.001;
      for (const layer of parallaxLayers) {
        layer.obj.rotation.y = t * layer.speed;
      }
      raf = requestAnimationFrame(drift);
    };
    raf = requestAnimationFrame(drift);

    const hideHint = () => setHintVisible(false);
    el.addEventListener("pointerdown", hideHint, { once: true });
    graphRef.current = graph;

    const ro = new ResizeObserver(() => {
      if (!hostRef.current || !graphRef.current) return;
      const { width, height } = hostRef.current.getBoundingClientRect();
      graphRef.current.width(width).height(height);
    });
    ro.observe(el);
    const { width, height } = el.getBoundingClientRect();
    graph.width(width).height(height);
    graph.graphData(data);

    window.setTimeout(() => {
      try {
        graph.zoomToFit(650, mode === "fullscreen" ? 70 : 48);
      } catch {
        /* ok */
      }
    }, 900);

    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      el.removeEventListener("pointerdown", hideHint);
      ro.disconnect();
      try {
        if (envMap) {
          graph.scene().environment = null;
          envMap.dispose();
        }
      } catch {
        /* ok */
      }
      try {
        if (spaceRoot) {
          graph.scene().remove(spaceRoot);
          spaceRoot.traverse((obj) => {
            const mesh = obj as THREE.Mesh;
            if (mesh.geometry) mesh.geometry.dispose();
            const mat = mesh.material as THREE.Material | THREE.Material[];
            if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
            else if (mat) mat.dispose();
          });
        }
      } catch {
        /* ok */
      }
      try {
        graph._destructor();
      } catch {
        /* ok */
      }
      graphRef.current = null;
      el.innerHTML = "";
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    mode,
    graphParticles,
    physicsIntensity,
    accentPreset,
    accentCustom,
    setActiveNote,
    setGraphMode,
    setLeftOpen,
    setRightOpen,
  ]);

  useEffect(() => {
    if (!graphRef.current) return;
    graphRef.current.graphData(data);
  }, [data]);

  useEffect(() => {
    if (!graphRef.current) return;
    const { r: ar, g: ag, b: ab } = accentRgb();
    const accent = new THREE.Color(ar / 255, ag / 255, ab / 255);
    const particleCount = graphParticles ? (mode === "panel" ? 1 : 3) : 0;

    const focusId = () => hoverRef.current || activeNoteId;
    const dimStrength = () =>
      hoverRef.current ? 1 : activeNoteId ? 0.35 : 0;

    const neighborSet = (id: string | null): Set<string> | null => {
      if (!id) return null;
      return neighborMapRef.current.get(id) ?? new Set();
    };

    const shouldShowLabel = (n: GNode) => {
      const f = focusId();
      const ns = neighborSet(f);
      if (n.id === activeNoteId || n.id === hoverRef.current) return true;
      if (f && ns?.has(n.id)) return true;
      if (hoverRef.current) return false;
      return n.degree >= 3;
    };

    const paintOrb = (n: GNode) => {
      const f = focusId();
      return createOrb(
        n,
        activeNoteId,
        hoverRef.current,
        f,
        neighborSet(f),
        dimStrength(),
        mode,
        accent,
        shouldShowLabel(n),
      );
    };

    const edgeStyle = (link: GLink) => {
      const [s, t] = linkIds(link);
      const hover = hoverRef.current;
      if (hover) {
        const hot = s === hover || t === hover;
        if (hot) {
          return {
            color: `rgba(${ar},${ag},${ab},0.92)`,
            width: mode === "fullscreen" ? 1.35 : 1.0,
            particles: particleCount > 0 ? particleCount + 1 : 0,
          };
        }
        return {
          color: `rgba(${ar},${ag},${ab},0.05)`,
          width: mode === "fullscreen" ? 0.2 : 0.14,
          particles: 0,
        };
      }
      if (activeNoteId) {
        const hot = s === activeNoteId || t === activeNoteId;
        if (hot) {
          return {
            color: `rgba(${ar},${ag},${ab},0.62)`,
            width: mode === "fullscreen" ? 0.9 : 0.65,
            particles: particleCount,
          };
        }
        return {
          color:
            mode === "fullscreen"
              ? `rgba(${ar},${ag},${ab},0.14)`
              : `rgba(${ar},${ag},${ab},0.11)`,
          width: mode === "fullscreen" ? 0.36 : 0.28,
          particles: 0,
        };
      }
      return {
        color:
          mode === "fullscreen"
            ? `rgba(${ar},${ag},${ab},0.28)`
            : `rgba(${ar},${ag},${ab},0.2)`,
        width: mode === "fullscreen" ? 0.48 : 0.36,
        particles: 0,
      };
    };

    graphRef.current
      .nodeThreeObject((n: object) => paintOrb(n as GNode))
      .linkColor((link) => edgeStyle(link as GLink).color)
      .linkWidth((link) => edgeStyle(link as GLink).width)
      .linkDirectionalParticles((link) => edgeStyle(link as GLink).particles)
      .refresh();
  }, [activeNoteId, mode, accentPreset, accentCustom, graphParticles]);

  return (
    <div
      className={cn(
        "graph-host relative flex min-h-0 flex-col overflow-hidden bg-[#03050a]",
        className,
      )}
    >
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background: `
            radial-gradient(ellipse 90% 75% at 50% 40%, #0e1622 0%, #0a1018 40%, #05080e 68%, #03050a 100%)
          `,
        }}
      />

      <div className="absolute left-3 right-3 top-3 z-10 flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2 rounded-full border border-white/[0.06] bg-black/40 px-3 py-1.5 backdrop-blur-sm">
          <Network
            size={12}
            className="shrink-0 text-[var(--accent)] opacity-70"
          />
          <span className="truncate text-[11px] font-medium tracking-wide text-[var(--text-muted)]">
            {data.nodes.length} notes
            <span className="mx-1.5 opacity-50">·</span>
            {data.links.length} links
            {hoverName ? (
              <>
                <span className="mx-1.5 opacity-50">·</span>
                <span className="text-[var(--text-secondary)] transition-opacity duration-200">
                  {hoverName}
                </span>
              </>
            ) : null}
          </span>
        </div>
        <button
          type="button"
          className="icon-btn pointer-events-auto h-8 w-8 shrink-0 border border-white/[0.06] bg-black/40"
          title={
            mode === "fullscreen" ? "Exit fullscreen graph" : "Expand graph"
          }
          onClick={() =>
            setGraphMode(mode === "fullscreen" ? "panel" : "fullscreen")
          }
        >
          {mode === "fullscreen" ? (
            <Minimize2 size={14} />
          ) : (
            <Maximize2 size={14} />
          )}
        </button>
      </div>

      <div ref={hostRef} className="relative z-[1] min-h-0 flex-1 touch-none" />

      {hintVisible ? (
        <div className="pointer-events-none absolute bottom-3 left-0 right-0 z-10 flex justify-center px-3">
          <div className="text-[10px] tracking-wide text-[var(--text-muted)] opacity-50">
            Orbit · Zoom · Pan · Hover links · Click to open
          </div>
        </div>
      ) : null}

      {data.nodes.length === 0 ? (
        <div className="pointer-events-none absolute inset-0 z-10 flex flex-col items-center justify-center px-6 text-center">
          <Network
            size={16}
            className="mb-3 text-[var(--text-muted)] opacity-40"
          />
          <p className="text-[13px] font-medium text-[var(--text-secondary)]">
            No linked notes
          </p>
          <p className="mt-1 max-w-[240px] text-[12px] leading-snug text-[var(--text-muted)]">
            Add [[wikilinks]] between notes to map structure.
          </p>
        </div>
      ) : null}
    </div>
  );
}
