import { memo, useCallback, useEffect, useMemo, useRef, useState, useDeferredValue, type KeyboardEvent } from "react";
import ForceGraph3D, { type ForceGraph3DInstance } from "3d-force-graph";
import * as THREE from "three";
import { createInstrumentNode } from "@/lib/graph/instrument-node";
import { useVaultStore } from "@/lib/vault/store";
import { resolveGraphData, type GraphViewMode, type ResolvedGraphData } from "@/lib/graph/build-graph";
import { emptyShellGraph, graphFromShellEgo, graphFromShellLevel, pinFolderLayout } from "@/lib/graph/shell-graph";
import { fetchShellBacklinks, fetchShellEgo, fetchShellLevel } from "@/lib/vault/shell-catalog";
import { folderIdFromBrowsePath } from "@/lib/graph/folder-graph";
import { getContentLinkSig } from "@/lib/markdown/wikilinks";
import { shouldUseFolderGraph } from "@/lib/vault/scale-flags";
import { ensureVaultIndex, vaultIndex } from "@/lib/vault/indexes";
import { vaultLinkIndex } from "@/lib/vault/link-index";
import { useGraphTick } from "@/lib/graph/graph-tick";
import {
  EGO_REBUILD_DEBOUNCE_MS,
  FLY_DEBOUNCE_MS,
  decideActiveNoteFly,
  egoStructureKey,
  folderLevelFingerprint,
  graphTopologyKey,
  isAlreadyFramed,
  mergePreservedPositions,
  recentlyInteracted,
  shouldReplaceGraphData,
} from "@/lib/graph/graph-select";
import type { VaultNode } from "@/lib/vault/types";
import {
  Globe2,
  Link2,
  FilePlus2,
} from "lucide-react";
import { collectVaultTags } from "@/lib/vault/tags";
import { usePrefsStore, type PhysicsIntensity } from "@/lib/prefs/preferences";
import { isDesktopShell } from "@/lib/platform";
import {
  closeDrawersIfNarrow,
  exitGraphForViewport,
  isPhoneViewport,
} from "@/lib/layout/viewport";
import { GraphChrome } from "@/components/graph/GraphChrome";
import { inspectGraphNote, type GraphInspectLink } from "@/lib/graph/graph-inspect";
import {
  applyGraphFilters,
  filtersAreIdle,
  folderFilterOptions,
  scaleParticlesEnabled,
  tagFilterOptions,
  type GraphFilterState,
} from "@/lib/graph/graph-filters";
import { graphEmptyCopy } from "@/lib/graph/graph-empty";
import { startFirstNote } from "@/lib/vault/first-note";
import { clampToDrawBudget, drawnStats, recordDrawn } from "@/lib/graph/draw-budget";
import { clearLabelTextures, releaseSharedSpheres, updateGraphLod } from "@/lib/graph/planet-lod";
import { releaseLinkStyles } from "@/lib/graph/link-style";
import { LinkBatch } from "@/lib/graph/link-batch";
import { createRenderGovernor, type RenderGovernor } from "@/lib/graph/render-governor";

/** Stable empty map so a null store snapshot cannot throw during graph render. */
const EMPTY_GRAPH_NODES: Record<string, VaultNode> = {};

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
  folder: string;
  tag?: string;
  ghost?: boolean;
  ghostTarget?: string;
  kind?: "note" | "folder" | "aggregate";
  noteCount?: number;
  aggregate?: boolean;
  x?: number;
  y?: number;
  z?: number;
  fx?: number;
  fy?: number;
  fz?: number;
  __threeObj?: THREE.Object3D;
};

type NeighborhoodMode = "all" | "1hop" | "2hop" | "3hop";

/**
 * The open vault's total in the graph badge. The scene reads the count once
 * per render so fill ticks do not rebuild it; this line subscribes, so a vault
 * switch or a recount shows at once instead of the last vault's number.
 */
function VaultTotal({
  fallback,
  shown,
  kind,
}: {
  fallback: number;
  shown: number;
  kind: "in" | "of";
}) {
  const total = useVaultStore((s) => (s.shellCatalog ? s.catalogNoteCount : fallback));
  if (total <= shown) return null;
  return (
    <span data-testid="graph-vault-total">
      <span className="mx-1.5 opacity-40">·</span>
      {kind === "of" ? `of ${total.toLocaleString()}` : `${total.toLocaleString()} in vault`}
    </span>
  );
}

function hopCount(mode: NeighborhoodMode): 1 | 2 | 3 {
  if (mode === "2hop") return 2;
  if (mode === "3hop") return 3;
  return 1;
}

function cycleNeighborhood(mode: NeighborhoodMode): NeighborhoodMode {
  if (mode === "all") return "1hop";
  if (mode === "1hop") return "2hop";
  if (mode === "2hop") return "3hop";
  return "all";
}

function hopKeepSet(
  center: string,
  hops: number,
  neighborMap: Map<string, Set<string>>,
): Set<string> {
  const keep = new Set<string>([center]);
  let frontier = [center];
  for (let h = 0; h < hops; h++) {
    const next: string[] = [];
    for (const id of frontier) {
      for (const n of neighborMap.get(id) ?? []) {
        if (!keep.has(n)) {
          keep.add(n);
          next.push(n);
        }
      }
    }
    frontier = next;
  }
  return keep;
}

const LOD_SEGMENT_THRESHOLD = 250;
const LOD_CAP = 400;
const LINK_OPACITY = 0.95;
/** Idle orbit waits out the opening zoom-to-fit, then a short quiet. */
const IDLE_ORBIT_START_S = 3.2;
const IDLE_ORBIT_QUIET_MS = 1600;
const IDLE_ORBIT_SPEED = 0.55;

type GLink = {
  source: string | GNode;
  target: string | GNode;
  __lineObj?: THREE.Object3D;
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
  addPanel(0xc5ced8, 0.42, 18, 14, [20, 12, 10], -0.6);
  addPanel(0x6a7684, 0.28, 14, 12, [-18, 4, -8], 0.7);
  addPanel(0x3a4450, 0.18, 20, 8, [0, -14, 5], 0);

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
 * Stars as real points at three distances, in front of a dim galaxy shell.
 * Orbiting the map moves the near shell more than the far one.
 */
function starShell(
  count: number,
  radius: number,
  thickness: number,
  size: number,
  opacity: number,
): THREE.Points {
  const pos = new Float32Array(count * 3);
  const col = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const r = radius + (Math.random() - 0.5) * thickness;
    const th = Math.random() * Math.PI * 2;
    const ph = Math.acos(2 * Math.random() - 1);
    pos[i * 3] = r * Math.sin(ph) * Math.cos(th);
    pos[i * 3 + 1] = r * Math.sin(ph) * Math.sin(th) * 0.72;
    pos[i * 3 + 2] = r * Math.cos(ph);
    const roll = Math.random();
    const mag = 0.55 + Math.random() * 0.45;
    const blue = roll > 0.88;
    col[i * 3] = mag * (blue ? 0.72 : 0.9);
    col[i * 3 + 1] = mag * (blue ? 0.84 : 0.93);
    col[i * 3 + 2] = mag;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  geo.setAttribute("color", new THREE.BufferAttribute(col, 3));
  const pts = new THREE.Points(
    geo,
    new THREE.PointsMaterial({
      size,
      sizeAttenuation: true,
      vertexColors: true,
      transparent: true,
      opacity,
      depthWrite: false,
      fog: false,
    }),
  );
  pts.frustumCulled = false;
  pts.renderOrder = -20;
  return pts;
}

function buildSpaceBackdrop(
  scene: THREE.Scene,
  mode: "panel" | "fullscreen",
): { root: THREE.Group; layers: { obj: THREE.Object3D; speed: number }[] } {
  const root = new THREE.Group();
  const layers: { obj: THREE.Object3D; speed: number }[] = [];
  const full = mode === "fullscreen";

  const tex = paintGalaxyTexture(full);
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(full ? 4200 : 3400, 64, 40),
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
  layers.push({ obj: sky, speed: 0.00035 });

  // Outside the largest folder ring (radius grows with the page, up to ~800).
  const near = starShell(full ? 420 : 260, 1280, 220, full ? 7.5 : 6.2, 0.9);
  const mid = starShell(full ? 700 : 420, 1900, 280, full ? 5.2 : 4.4, 0.72);
  const far = starShell(full ? 900 : 520, 2700, 360, full ? 3.4 : 2.8, 0.55);
  root.add(near, mid, far);
  layers.push({ obj: near, speed: 0.008 });
  layers.push({ obj: mid, speed: 0.0032 });
  layers.push({ obj: far, speed: 0.0011 });

  scene.add(root);
  scene.fog = null;
  scene.background = new THREE.Color(0x02040a);
  return { root, layers };
}

/**
 * WebKit pointerup/pointercancel can reach OrbitControls with a tracked
 * pointer and no stored position. The control then throws on `position.x`
 * while React is committing the graph, and the panel becomes
 * "Graph hit a display error."
 */
function guardOrbitPointer(graph: ForceGraph3DInstance) {
  const controls = graph.controls() as {
    domElement?: HTMLElement | null;
    connect?: (element: HTMLElement) => void;
    disconnect?: () => void;
    _onPointerUp?: ((event: PointerEvent) => void) & { nexusGuard?: boolean };
    _getSecondPointerPosition?: ((event: PointerEvent) => { x: number; y: number }) & {
      nexusGuard?: boolean;
    };
    _pointers?: number[];
    _pointerPositions?: Record<number, { x: number; y: number } | undefined>;
  } | null;
  if (!controls) return;
  const el = controls.domElement ?? null;
  // connect() already bound pointercancel to the raw handler. Detach first
  // so the rebound listeners are the guards, not the throwing originals.
  let detached = false;
  if (el && typeof controls.disconnect === "function") {
    try {
      controls.disconnect();
      detached = true;
    } catch {
      detached = false;
    }
  }
  const originalSecond = controls._getSecondPointerPosition;
  if (originalSecond && !originalSecond.nexusGuard) {
    const wrappedSecond = function (
      this: {
        _pointers?: number[];
        _pointerPositions?: Record<number, { x: number; y: number } | undefined>;
      },
      event: PointerEvent,
    ) {
      const position = originalSecond.call(this, event);
      if (position && Number.isFinite(position.x) && Number.isFinite(position.y)) {
        return position;
      }
      return { x: event.pageX || 0, y: event.pageY || 0 };
    };
    wrappedSecond.nexusGuard = true;
    controls._getSecondPointerPosition = wrappedSecond;
  }
  const original = controls._onPointerUp;
  if (original && !original.nexusGuard) {
    const wrapped = function (
      this: {
        _pointers?: number[];
        _pointerPositions?: Record<number, { x: number; y: number } | undefined>;
      },
      event: PointerEvent,
    ) {
      const positions = this._pointerPositions;
      if (positions && this._pointers) {
        for (const id of this._pointers) {
          if (!positions[id]) {
            positions[id] = { x: event.pageX || 0, y: event.pageY || 0 };
          }
        }
      }
      try {
        original.call(this, event);
      } catch (err) {
        const name =
          err && typeof err === "object" && "name" in err ? String(err.name) : "";
        const message = err instanceof Error ? err.message : String(err);
        // Synthetic pointerup has no stored position (NotFoundError on capture,
        // TypeError on position.x). Swallow that miss; keep real faults.
        const knownMiss =
          name === "NotFoundError" ||
          (name === "TypeError" && /reading 'x'/.test(message));
        if (!knownMiss) console.warn("[nexus] graph pointer", err);
      }
    };
    wrapped.nexusGuard = true;
    controls._onPointerUp = wrapped;
  }
  if (detached && el && typeof controls.connect === "function") {
    try {
      controls.connect(el);
    } catch (err) {
      console.warn("[nexus] graph pointer", err);
    }
  }
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
  desktopBoost: boolean,
  lowDetail = false,
  colorBy: "folder" | "tag" = "folder",
): THREE.Object3D {
  return createInstrumentNode(
    node,
    activeId,
    hoverId,
    focusId,
    neighbors,
    dimStrength,
    mode,
    accent,
    showLabel,
    desktopBoost,
    lowDetail,
    colorBy,
  );
}

/** W5: mutate materials on existing orbs — avoids full nodeThreeObject rebuild on hover */
function tintOrbHover(
  obj: THREE.Object3D | undefined | null,
  on: boolean,
  accent: THREE.Color,
) {
  if (!obj) return;
  obj.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if (!mesh.isMesh || !mesh.userData.nexusCore) return;
    const mat = mesh.material as THREE.Material & {
      color?: THREE.Color;
      uniforms?: { uColor?: { value: THREE.Color } };
      userData: Record<string, unknown>;
    };
    const color = mat.uniforms?.uColor?.value ?? mat.color;
    if (!color) return;
    void accent;
    if (on) {
      if (mat.userData.__w5HoverBase == null) {
        mat.userData.__w5HoverBase = color.clone();
      }
      const base = mat.userData.__w5HoverBase as THREE.Color;
      color.copy(base).multiplyScalar(1.1);
    } else {
      const b = mat.userData.__w5HoverBase as THREE.Color | undefined;
      if (!b) return;
      color.copy(b);
      delete mat.userData.__w5HoverBase;
    }
  });
}

/** Soft spatial clustering by folder (no visible links required). */
function forceFolderCluster(strength = 0.055) {
  let nodes: Array<{
    folder?: string;
    x?: number;
    y?: number;
    z?: number;
    vx?: number;
    vy?: number;
    vz?: number;
  }> = [];

  function force(alpha: number) {
    if (!nodes.length) return;
    const groups = new Map<string, typeof nodes>();
    for (const n of nodes) {
      const key = n.folder || "";
      if (!key) continue;
      let g = groups.get(key);
      if (!g) {
        g = [];
        groups.set(key, g);
      }
      g.push(n);
    }
    const k = strength * alpha;
    for (const group of groups.values()) {
      if (group.length < 2) continue;
      let cx = 0,
        cy = 0,
        cz = 0;
      for (const n of group) {
        cx += n.x ?? 0;
        cy += n.y ?? 0;
        cz += n.z ?? 0;
      }
      const inv = 1 / group.length;
      cx *= inv;
      cy *= inv;
      cz *= inv;
      for (const n of group) {
        n.vx = (n.vx ?? 0) + (cx - (n.x ?? 0)) * k;
        n.vy = (n.vy ?? 0) + (cy - (n.y ?? 0)) * k;
        n.vz = (n.vz ?? 0) + (cz - (n.z ?? 0)) * k;
      }
    }
  }

  force.initialize = (initNodes: typeof nodes) => {
    nodes = initNodes;
  };
  return force;
}


/** G2 Soft 1-hop: keep all nodes, filter edges to neighborhood, dim outsiders */
function softNeighborhood(
  data: { nodes: GNode[]; links: GLink[] },
  mode: NeighborhoodMode,
  isolate: boolean,
  activeNoteId: string | null,
  neighborMap: Map<string, Set<string>>,
): { nodes: GNode[]; links: GLink[]; hopKeep: Set<string> | null } {
  if (mode === "all" || !activeNoteId) {
    return { nodes: data.nodes, links: data.links, hopKeep: null };
  }
  const keep = hopKeepSet(activeNoteId, hopCount(mode), neighborMap);
  const links = data.links.filter((l) => {
    const [s, t] = linkIds(l);
    return keep.has(s) && keep.has(t);
  });
  const nodes = isolate
    ? data.nodes.filter((n) => keep.has(n.id))
    : data.nodes;
  return { nodes, links, hopKeep: keep };
}

/** G5 LOD: max 400 highest-degree notes + active + neighbors */
function applyLodCap(
  data: { nodes: GNode[]; links: GLink[] },
  activeNoteId: string | null,
  neighborMap: Map<string, Set<string>>,
): { nodes: GNode[]; links: GLink[]; lowDetail: boolean } {
  const real = data.nodes.filter((n) => !n.ghost);
  const lowDetail = real.length > LOD_SEGMENT_THRESHOLD;
  if (real.length <= LOD_CAP) {
    return { nodes: data.nodes, links: data.links, lowDetail };
  }
  const must = new Set<string>();
  if (activeNoteId) {
    must.add(activeNoteId);
    const neigh = neighborMap.get(activeNoteId);
    if (neigh) for (const id of neigh) must.add(id);
  }
  const sorted = [...real].sort((a, b) => b.degree - a.degree);
  const keep = new Set(must);
  for (const n of sorted) {
    if (keep.size >= LOD_CAP) break;
    keep.add(n.id);
  }
  for (const l of data.links) {
    const [s, t] = linkIds(l);
    if (s.startsWith("ghost:") && keep.has(t)) keep.add(s);
    if (t.startsWith("ghost:") && keep.has(s)) keep.add(t);
  }
  const nodes = data.nodes.filter((n) => keep.has(n.id));
  const links = data.links.filter((l) => {
    const [s, t] = linkIds(l);
    return keep.has(s) && keep.has(t);
  });
  return { nodes, links, lowDetail: true };
}

/** GPU copies of shared planet, plate and link resources belong to one renderer. */
function releaseSharedGraphResources() {
  clearLabelTextures();
  releaseSharedSpheres();
  releaseLinkStyles();
}

function cancelCameraFly(graph: ForceGraph3DInstance | null) {
  if (!graph) return;
  try {
    const cam = graph.cameraPosition();
    graph.cameraPosition({ x: cam.x, y: cam.y, z: cam.z }, undefined, 0);
  } catch {
    /* ok */
  }
}

function flyCameraToNode(
  graph: ForceGraph3DInstance,
  node: { x?: number; y?: number; z?: number },
  durationMs: number,
  dist: number,
): boolean {
  if (node.x == null || node.y == null || node.z == null) return false;
  const lookAt = { x: node.x, y: node.y, z: node.z };
  let cam: { x: number; y: number; z: number };
  try {
    cam = graph.cameraPosition();
  } catch {
    return false;
  }
  if (isAlreadyFramed(cam, lookAt, dist)) return false;
  const dx = cam.x - lookAt.x;
  const dy = cam.y - lookAt.y;
  const dz = cam.z - lookAt.z;
  const len = Math.hypot(dx, dy, dz) || 1;
  const scale = dist / len;
  try {
    graph.cameraPosition(
      {
        x: lookAt.x + dx * scale,
        y: lookAt.y + dy * scale,
        z: lookAt.z + dz * scale,
      },
      lookAt,
      durationMs,
    );
  } catch {
    return false;
  }
  return true;
}

function findGraphNode(
  graph: ForceGraph3DInstance,
  id: string,
): GNode | undefined {
  const nodes = (graph.graphData()?.nodes ?? []) as GNode[];
  return nodes.find((n) => n.id === id);
}

function graphHintText(
  chromeMode: "panel" | "fullscreen",
  viewMode: GraphViewMode,
): string {
  const phone = isPhoneViewport();
  if (chromeMode === "fullscreen") {
    if (viewMode === "folder") {
      return phone
        ? "Pinch · Pan · Tap folder · Exit graph"
        : "Orbit · Zoom · Pan · Click folder · Esc / Exit graph";
    }
    return phone
      ? "Pinch · Pan · Tap a note · Exit graph"
      : "Orbit · Zoom · Pan · Click note · Esc / Exit graph";
  }
  if (viewMode === "folder") {
    return phone
      ? "Pinch · Pan · Tap folder or note"
      : "Orbit · Zoom · Pan · Click folder · Click note · Esc up";
  }
  return phone
    ? "Pinch · Pan · Tap to open"
    : "Orbit · Zoom · Pan · Hover for details · Click to open";
}

export const GraphView = memo(function GraphView({ mode, className }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const graphRef = useRef<ForceGraph3DInstance | null>(null);
  const activeRef = useRef<string | null>(null);
  const hoverRef = useRef<string | null>(null);
  const neighborMapRef = useRef<Map<string, Set<string>>>(new Map());
  // Stable tick via useSyncExternalStore — NEVER ensureVaultIndex in a Zustand selector
  // (that caused Maximum update depth / forceStoreRerender on demo open).
  const graphTick = useGraphTick();
  // Read nodes only on render forced by graphTick / other selectors — not a
  // continuous subscription to the whole map (avoids body-hydrate thrash).
  const rawNodes = useVaultStore.getState().nodes;
  const nodes =
    rawNodes && typeof rawNodes === "object" ? rawNodes : EMPTY_GRAPH_NODES;
  const deferredNodes = useDeferredValue(nodes);
  void graphTick;
  const activeNoteId = useVaultStore((s) => s.activeNoteId);
  const setActiveNote = useVaultStore((s) => s.setActiveNote);
  const setGraphMode = useVaultStore((s) => s.setGraphMode);
  const setLeftOpen = useVaultStore((s) => s.setLeftOpen);
  const setRightOpen = useVaultStore((s) => s.setRightOpen);
  const graphParticles = usePrefsStore((s) => s.graphParticles);
  const physicsIntensity = usePrefsStore((s) => s.physicsIntensity);
  const accentPreset = usePrefsStore((s) => s.accentPreset);
  const accentCustom = usePrefsStore((s) => s.accentCustom);
  const reducedMotion = usePrefsStore((s) => s.reducedMotion);
  const setCommandOpen = useVaultStore((s) => s.setCommandOpen);
  const [hoverName, setHoverName] = useState<string | null>(null);
  const [hoverTip, setHoverTip] = useState<{
    id: string;
    name: string;
    path: string;
    degree: number;
    kind: string;
    preview: string;
  } | null>(null);
  const [orphansOnly, setOrphansOnly] = useState(false);
  const [tagFilter, setTagFilter] = useState("");
  const [folderFilter, setFolderFilter] = useState("");
  const filterInputRef = useRef<HTMLInputElement>(null);
  const [hintVisible, setHintVisible] = useState(true);
  const [neighborhood, setNeighborhood] = useState<NeighborhoodMode>("all");
  const [isolateHops, setIsolateHops] = useState(false);
  const [graphQuery, setGraphQuery] = useState("");
  const [colorBy, setColorBy] = useState<"folder" | "tag">("folder");
  const [showGhosts, setShowGhosts] = useState(true);
  const hopKeepRef = useRef<Set<string> | null>(null);
  const neighborhoodRef = useRef<NeighborhoodMode>("all");
  const colorByRef = useRef<"folder" | "tag">("folder");
  const lowDetailRef = useRef(false);
  /** W5: nodeId → last Object3D from paintOrb (for hover material mutation) */
  const nodeObjMapRef = useRef<Map<string, THREE.Object3D>>(new Map());
  const hoverAppliedRef = useRef<string | null>(null);
  const hoverThrottleRef = useRef<number | null>(null);
  const prevActiveFlyRef = useRef<string | null | undefined>(undefined);
  const flyGenRef = useRef(0);
  const userInteractingRef = useRef(false);
  const lastInteractAtRef = useRef(0);
  const restyleEdgesRef = useRef<() => void>(() => {});
  const governorRef = useRef<RenderGovernor | null>(null);
  const linkBatchRef = useRef<LinkBatch<GLink> | null>(null);
  /** Zoom-to-fit when a new layout settles, not after every restyle. */
  const layoutFitPendingRef = useRef(false);
  const lastGraphTopoKeyRef = useRef<string | null>(null);
  const lastGraphDataRef = useRef<{ nodes: GNode[]; links: GLink[] } | null>(
    null,
  );
  const prevGraphScopeRef = useRef<string | null>(null);
  const graphScopeMode = useVaultStore((s) => s.graphScopeMode ?? "vault");
  const graphBrowsePath = useVaultStore((s) => s.graphBrowsePath ?? "");
  const shellCatalog = useVaultStore((s) => s.shellCatalog);
  // Read on this render only. Subscribing would rebuild the scene on every
  // fill tick. Scope changes and the idle refresh below re-render first.
  const catalogNoteCount = useVaultStore.getState().catalogNoteCount;
  const catalogFolderCount = useVaultStore.getState().catalogFolderCount;
  const shellDbPath = useVaultStore((s) => s.shellDbPath);
  const indexFillBusy = useVaultStore((s) => s.indexFillBusy);
  const [graphRefresh, setGraphRefresh] = useState(0);
  const fillWasBusyRef = useRef(false);
  const [shellResolved, setShellResolved] = useState<ResolvedGraphData | null>(null);
  const enterGraphFolder = useVaultStore((s) => s.enterGraphFolder);
  const enterGraphEgo = useVaultStore((s) => s.enterGraphEgo);
  const returnFromGraphEgo = useVaultStore((s) => s.returnFromGraphEgo);
  const resetGraphBrowse = useVaultStore((s) => s.resetGraphBrowse);
  const [liveRegion, setLiveRegion] = useState("");
  const [engineReady, setEngineReady] = useState(false);
  /** Skip first browse-path effect so it doesn't fight mount zoomToFit */
  const browsePathReadyRef = useRef(false);
  /** Debounced ego center — highlight uses live activeNoteId immediately. */
  const [egoCenterId, setEgoCenterId] = useState(activeNoteId);

  useEffect(() => {
    if (mode !== "fullscreen") return;
    useVaultStore.getState().setToast("Fullscreen graph · Esc or Exit to leave");
  }, [mode]);

  useEffect(() => {
    if (graphScopeMode !== "ego") {
      setEgoCenterId(activeNoteId);
      return;
    }
    const t = window.setTimeout(() => {
      setEgoCenterId(activeNoteId);
    }, EGO_REBUILD_DEBOUNCE_MS);
    return () => window.clearTimeout(t);
  }, [activeNoteId, graphScopeMode]);

  const markUserInteracted = useCallback((interacting: boolean) => {
    userInteractingRef.current = interacting;
    lastInteractAtRef.current = performance.now();
    if (interacting) {
      flyGenRef.current += 1;
    }
  }, []);

  activeRef.current = activeNoteId;
  neighborhoodRef.current = neighborhood;
  colorByRef.current = colorBy;
  // Dev probes can ask for the desktop shell's render settings in a browser.
  const desktopBoost =
    isDesktopShell() ||
    (import.meta.env.DEV &&
      typeof window !== "undefined" &&
      (window as unknown as { __NEXUS_GRAPH_DESKTOP__?: boolean }).__NEXUS_GRAPH_DESKTOP__ === true);

  const vaultNoteCount = useMemo(() => {
    if (shellCatalog) return catalogNoteCount;
    const idx = ensureVaultIndex(deferredNodes as Record<string, VaultNode>);
    return idx.noteCount;
  }, [deferredNodes, shellCatalog, catalogNoteCount]);

  const vaultFolderCount = useMemo(() => {
    if (shellCatalog) return catalogFolderCount;
    const idx = ensureVaultIndex(deferredNodes as Record<string, VaultNode>);
    return idx.folderCount;
  }, [deferredNodes, shellCatalog, catalogFolderCount]);

  const particlesLive = scaleParticlesEnabled(
    vaultNoteCount,
    graphParticles,
    reducedMotion,
  );


  // Mode-gated fingerprint — folder uses O(level) child signature (not O(N) links,
  // and not structureGeneration which can bump on content-only body evicts).
  const graphStructureKey = useMemo(() => {
    if (shellCatalog) {
      return `shell:${graphBrowsePath}:${graphScopeMode}:${egoCenterId ?? ""}:${graphRefresh}`;
    }
    const large = shouldUseFolderGraph(vaultNoteCount);
    const idx = ensureVaultIndex(deferredNodes as Record<string, VaultNode>);
    if (large && graphScopeMode !== "ego") {
      const levelId = folderIdFromBrowsePath(
        deferredNodes as Record<string, VaultNode>,
        idx,
        graphBrowsePath || "",
      );
      const childSig = idx.childSignature(
        deferredNodes as Record<string, VaultNode>,
        levelId ?? "__root__",
      );
      return folderLevelFingerprint(childSig, graphBrowsePath, graphScopeMode);
    }
    if (large && graphScopeMode === "ego") {
      return egoStructureKey(vaultLinkIndex.generation, egoCenterId ?? "");
    }
    // Full notes (demo / small vault)
    const parts: string[] = [`links:${vaultLinkIndex.generation}`];
    for (const n of Object.values(deferredNodes as Record<string, VaultNode>)) {
      if (n.kind === "note") {
        parts.push(
          `${n.id}\0${n.path}\0${n.name}\0${getContentLinkSig(n.content ?? "")}`,
        );
      } else {
        parts.push(`${n.id}\0${n.path}\0folder`);
      }
    }
    parts.sort();
    return parts.join("\n");
  }, [
    deferredNodes,
    vaultNoteCount,
    graphBrowsePath,
    graphScopeMode,
    egoCenterId,
    graphTick,
    shellCatalog,
    graphRefresh,
  ]);

  useEffect(() => {
    if (indexFillBusy) {
      fillWasBusyRef.current = true;
      return;
    }
    if (!fillWasBusyRef.current) return;
    fillWasBusyRef.current = false;
    setGraphRefresh((n) => n + 1);
  }, [indexFillBusy]);

  useEffect(() => {
    if (!shellCatalog || !shellDbPath) {
      setShellResolved(null);
      return;
    }
    let cancelled = false;
    const run = async () => {
      if (graphScopeMode === "ego" && egoCenterId) {
        const ego = await fetchShellEgo(shellDbPath, egoCenterId, 2, 400);
        if (cancelled || !ego) return;
        setShellResolved(graphFromShellEgo(ego, catalogNoteCount));
        return;
      }
      const level = await fetchShellLevel(shellDbPath, graphBrowsePath || "", 320);
      if (cancelled || !level) return;
      setShellResolved(graphFromShellLevel(level, catalogNoteCount));
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [shellCatalog, shellDbPath, graphBrowsePath, graphScopeMode, egoCenterId, graphRefresh]);

  const resolved = useMemo(() => {
    if (shellCatalog) return shellResolved ?? emptyShellGraph(catalogNoteCount);
    return resolveGraphData(deferredNodes as Record<string, VaultNode>, {
      noteCount: vaultNoteCount,
      activeNoteId: graphScopeMode === "ego" ? egoCenterId : activeNoteId,
      graphBrowsePath: graphBrowsePath || "",
      graphScopeMode: graphScopeMode || "vault",
      structuralIndex: ensureVaultIndex(
        deferredNodes as Record<string, VaultNode>,
      ),
    });
    // Folder/vault keys already ignore the active note; ego keys include it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [graphStructureKey, graphBrowsePath, graphScopeMode, shellCatalog, shellResolved, catalogNoteCount]);

  const graphModeResolved: GraphViewMode = resolved.mode;
  const graphModeRef = useRef(graphModeResolved);
  graphModeRef.current = graphModeResolved;

  const tagColorNodes =
    colorBy === "tag" || tagFilter ? deferredNodes : null;
  const data = useMemo(() => {
    const tagByNote = new Map<string, string>();
    // Folder/ego color-by-folder must not walk 45k tag metas.
    if (tagColorNodes) {
      const visible = new Set(resolved.nodes.map((n) => n.id));
      for (const t of collectVaultTags(tagColorNodes as Record<string, VaultNode>)) {
        for (const id of t.noteIds) {
          if (visible.has(id) && !tagByNote.has(id)) tagByNote.set(id, t.tag);
        }
      }
    }
    const nodes = resolved.nodes.map((n) => ({
      id: n.id,
      name: n.title,
      val:
        n.val ??
        Math.max(
          1,
          (n.noteCount ?? n.degree ?? 0) + (n.kind === "folder" ? 1 : 1),
        ),
      preview: n.preview,
      path: n.path,
      degree: n.degree,
      folder: n.folder ?? "",
      tag: tagByNote.get(n.id) || "",
      ghost: n.ghost,
      ghostTarget: n.ghostTarget,
      kind: n.kind,
      noteCount: n.noteCount,
      aggregate: n.aggregate,
    })) as GNode[];
    return {
      nodes:
        graphModeResolved === "folder" ? pinFolderLayout(nodes) : nodes,
      links: resolved.edges.map((e) => ({
        source: e.source,
        target: e.target,
      })) as GLink[],
    };
  }, [resolved, colorBy, tagColorNodes, graphModeResolved]);

  useEffect(() => {
    neighborMapRef.current = buildNeighbors(data.links);
  }, [data]);

  const stats = resolved.stats;
  const realNoteCount = useMemo(
    () =>
      data.nodes.filter((n) => !n.ghost && n.kind !== "aggregate").length,
    [data.nodes],
  );
  const realLinkCount = useMemo(
    () =>
      data.links.filter((l) => {
        const [s, t] = linkIds(l);
        return !s.startsWith("ghost:") && !t.startsWith("ghost:");
      }).length,
    [data.links],
  );
  const ghostCount = useMemo(
    () => data.nodes.filter((n) => n.ghost).length,
    [data.nodes],
  );
  const isPartialVaultGraph =
    graphModeResolved === "ego" ||
    (graphModeResolved === "folder" && stats.isPartialVault) ||
    (vaultNoteCount > 0 &&
      realNoteCount < vaultNoteCount &&
      graphModeResolved !== "full");

  const folderCrumbs = useMemo(() => {
    const path = stats.levelPath || graphBrowsePath || "";
    if (!path) return [] as string[];
    return path.split("/").filter(Boolean);
  }, [stats.levelPath, graphBrowsePath]);

  /** Active note exists but isn't among current folder-map nodes. */
  const activeNoteMissingFromFolderMap = useMemo(() => {
    if (graphModeResolved !== "folder" || !activeNoteId) return false;
    return !data.nodes.some((n) => n.id === activeNoteId);
  }, [graphModeResolved, activeNoteId, data.nodes]);

  // Honest folder badge totals: prefer true level children over drawn subset
  const badgeFolderCount =
    stats.childFolderCount || stats.shownFolderCount || 0;
  const badgeNoteCount = stats.childNoteCount || stats.shownNoteCount || 0;

  // Folder hues live on the orbs only — no multi-chip legend (clutters large vaults).

  const graphFilter: GraphFilterState = useMemo(
    () => ({
      query: graphQuery,
      showGhosts,
      orphansOnly: graphModeResolved === "folder" ? false : orphansOnly,
      tag: tagFilter,
      folderPrefix: folderFilter,
    }),
    [
      graphQuery,
      showGhosts,
      graphModeResolved,
      orphansOnly,
      tagFilter,
      folderFilter,
    ],
  );
  const filtersIdle = filtersAreIdle(graphFilter);

  const lodActiveId =
    graphModeResolved === "folder" ||
    (neighborhood === "all" && !isolateHops && filtersIdle)
      ? null
      : activeNoteId;

  const filteredData = useMemo(() => {
    let base: { nodes: GNode[]; links: GLink[] } = data;
    if (graphModeResolved === "folder") {
      hopKeepRef.current = null;
      lowDetailRef.current = false;
      if (filtersIdle) return data;
      return applyGraphFilters(data, graphFilter, activeNoteId);
    }
    if (!showGhosts) {
      base = {
        nodes: data.nodes.filter((n) => !n.ghost),
        links: data.links.filter((l) => {
          const [s, t] = linkIds(l);
          return !s.startsWith("ghost:") && !t.startsWith("ghost:");
        }),
      };
    }
    const lod = applyLodCap(base, lodActiveId, neighborMapRef.current);
    lowDetailRef.current = lod.lowDetail;
    const soft = softNeighborhood(
      { nodes: lod.nodes, links: lod.links },
      neighborhood,
      isolateHops,
      lodActiveId,
      neighborMapRef.current,
    );
    hopKeepRef.current = soft.hopKeep;
    return applyGraphFilters(
      { nodes: soft.nodes, links: soft.links },
      { ...graphFilter, showGhosts: true },
      lodActiveId ?? activeNoteId,
    );
  }, [
    data,
    neighborhood,
    isolateHops,
    lodActiveId,
    showGhosts,
    graphModeResolved,
    filtersIdle,
    graphFilter,
    activeNoteId,
  ]);

  const displayData = useMemo(
    () => clampToDrawBudget(filteredData, activeNoteId),
    [filteredData, activeNoteId],
  );
  // The engine starts a frame after its effect. Data that landed in between
  // skipped the push (no engine yet), so the engine seeds from the latest.
  const displayDataRef = useRef(displayData);
  displayDataRef.current = displayData;

  /** G1: 2x export with footer */
  const exportPng = useCallback(() => {
    const g = graphRef.current;
    const host = hostRef.current;
    if (!g || !host) return;
    try {
      const renderer = g.renderer() as THREE.WebGLRenderer;
      const { width, height } = host.getBoundingClientRect();
      if (width < 2 || height < 2) return;
      const prevPr = renderer.getPixelRatio();
      const exportW = Math.round(width * 2);
      const exportH = Math.round(height * 2);
      renderer.setPixelRatio(1);
      renderer.setSize(exportW, exportH, false);
      g.width(exportW).height(exportH);
      renderer.render(g.scene(), g.camera() as THREE.Camera);
      const src = renderer.domElement;
      const out = document.createElement("canvas");
      out.width = src.width;
      out.height = src.height;
      const ctx = out.getContext("2d");
      if (!ctx) throw new Error("2d");
      ctx.drawImage(src, 0, 0);
      const footerH = Math.max(32, Math.round(out.height * 0.04));
      ctx.fillStyle = "rgba(3, 5, 10, 0.78)";
      ctx.fillRect(0, out.height - footerH, out.width, footerH);
      ctx.fillStyle = "rgba(210, 218, 230, 0.92)";
      const fontPx = Math.max(13, Math.round(footerH * 0.42));
      ctx.font = `500 ${fontPx}px system-ui, -apple-system, Segoe UI, Arial, sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      const footer =
        graphModeResolved === "folder"
          ? `Nexus · folder map · ${badgeFolderCount} folders · ${badgeNoteCount} notes`
          : graphModeResolved === "ego" || isPartialVaultGraph
            ? `Nexus · ${realNoteCount} of ${vaultNoteCount} notes · near active`
            : vaultFolderCount > 0
              ? `Nexus · ${realNoteCount} notes · ${vaultFolderCount} folders · ${realLinkCount} links`
              : `Nexus · ${realNoteCount} notes · ${realLinkCount} links`;
      ctx.fillText(footer, out.width / 2, out.height - footerH / 2);
      const url = out.toDataURL("image/png");
      const a = document.createElement("a");
      a.href = url;
      a.download = "nexus-graph.png";
      a.rel = "noopener";
      document.body.appendChild(a);
      a.click();
      a.remove();
      renderer.setPixelRatio(prevPr);
      g.width(width).height(height);
      renderer.setSize(width, height, false);
      renderer.render(g.scene(), g.camera() as THREE.Camera);
    } catch {
      try {
        const { width, height } = host.getBoundingClientRect();
        g.width(width).height(height);
      } catch {
        /* ok */
      }
    }
  }, [
    realNoteCount,
    realLinkCount,
    graphModeResolved,
    isPartialVaultGraph,
    vaultNoteCount,
    vaultFolderCount,
    badgeFolderCount,
    badgeNoteCount,
  ]);

  useEffect(() => {
    setHintVisible(true);
    const t = window.setTimeout(() => setHintVisible(false), 4500);
    return () => window.clearTimeout(t);
  }, [mode]);

  const handleShowLinks = useCallback(() => {
    if (!activeNoteId) return;
    enterGraphEgo?.({ returnPath: graphBrowsePath || "" });
    setLiveRegion("Showing links near the active note");
  }, [activeNoteId, enterGraphEgo, graphBrowsePath]);

  useEffect(() => {
    let outerCancel = false;
    let teardown: (() => void) | undefined;
    const startId = window.requestAnimationFrame(() => {
    if (outerCancel || !hostRef.current) return;
    const el = hostRef.current;
    el.innerHTML = "";
    setEngineReady(false);

    const { r: ar, g: ag, b: ab } = accentRgb();
    const accent = new THREE.Color(ar / 255, ag / 255, ab / 255);
    const phys = physicsParams(physicsIntensity);

    const focusId = () => hoverRef.current || activeRef.current;
    const dimStrength = () => {
      if (hoverRef.current) return 1;
      if (neighborhoodRef.current !== "all" && activeRef.current) return 0.9;
      if (activeRef.current) return 0.35;
      return 0;
    };

    const neighborSet = (id: string | null): Set<string> | null => {
      if (!id) return null;
      if (neighborhoodRef.current !== "all" && hopKeepRef.current) {
        return hopKeepRef.current;
      }
      return neighborMapRef.current.get(id) ?? new Set();
    };

    const shouldShowLabel = (n: GNode) => {
      const f = focusId();
      const ns = neighborSet(f);
      if (n.id === activeRef.current || n.id === hoverRef.current) return true;
      if (f && ns?.has(n.id) && n.id !== f) return true;
      if (hoverRef.current) return false;
      if (n.ghost) return false;
      if (
        neighborhoodRef.current !== "all" &&
        hopKeepRef.current &&
        !hopKeepRef.current.has(n.id)
      ) {
        return false;
      }
      return n.degree >= 3;
    };

    const paintOrb = (n: GNode) => {
      const f = focusId();
      const obj = createOrb(
        n,
        activeRef.current,
        hoverRef.current,
        f,
        neighborSet(f),
        dimStrength(),
        mode,
        accent,
        shouldShowLabel(n),
        desktopBoost,
        lowDetailRef.current,
        colorByRef.current,
      );
      nodeObjMapRef.current.set(n.id, obj);
      return obj;
    };

    const edgeStyle = (
      link: GLink,
    ): { color: string; width: number; particles: number } => {
      const [s, t] = linkIds(link);
      const hover = hoverRef.current;
      const active = activeRef.current;
      const steel = "176,184,194";
      const thin = mode === "fullscreen" ? 0.26 : 0.18;

      if (hover) {
        const hot = s === hover || t === hover;
        if (hot) {
          return {
            color: `rgba(${ar},${ag},${ab},0.7)`,
            width: thin + 0.16,
            particles: 0,
          };
        }
        return {
          color: `rgba(${steel},0.14)`,
          width: thin * 0.55,
          particles: 0,
        };
      }

      if (active) {
        const hot = s === active || t === active;
        if (hot) {
          return {
            color: `rgba(${ar},${ag},${ab},0.5)`,
            width: thin + 0.08,
            particles: 0,
          };
        }
        return {
          color: `rgba(${steel},0.22)`,
          width: thin * 0.7,
          particles: 0,
        };
      }

      return {
        color: `rgba(${steel},${mode === "fullscreen" ? 0.46 : 0.4})`,
        width: thin,
        particles: 0,
      };
    };

    const applyEdgeStyles = (g: ForceGraph3DInstance) => {
      g.linkColor((link) => edgeStyle(link as GLink).color)
        .linkWidth((link) => edgeStyle(link as GLink).width)
        .linkDirectionalParticles((link) => edgeStyle(link as GLink).particles)
        .linkDirectionalParticleWidth(0.35)
        .linkDirectionalParticleSpeed(0.006)
        .linkDirectionalParticleColor(() => {
          const mix = (c: number) => Math.round(c * 0.45 + 255 * 0.55);
          return `rgb(${mix(ar)},${mix(ag)},${mix(ab)})`;
        });
    };
    restyleEdgesRef.current = () => {
      const g = graphRef.current;
      if (!g) return;
      linkBatchRef.current?.restyle((g.graphData()?.links ?? []) as GLink[]);
      governorRef.current?.kick();
    };

    const graph = new ForceGraph3D(el, {
      controlType: "orbit",
      rendererConfig: {
        antialias: !desktopBoost, // software GL + AA thrash feels "locked"
        alpha: true,
        powerPreference: desktopBoost ? "default" : "high-performance",
        // logarithmicDepthBuffer breaks PointsMaterial starfields
        logarithmicDepthBuffer: false,
      },
    })
      .backgroundColor("#03050a")
      .showNavInfo(false)
      .enableNodeDrag(true)
      .enableNavigationControls(true)
      .cooldownTicks(graphModeRef.current === "folder" ? 0 : desktopBoost ? 20 : 36)
      .warmupTicks(0)
      .nodeId("id")
      .nodeLabel(() => "")
      .nodeVal("val")
      .nodeRelSize(4)
      .nodeOpacity(1)
      .nodeThreeObject((n: object) => paintOrb(n as GNode))
      .nodeThreeObjectExtend(false)
      .linkOpacity(LINK_OPACITY)
      .onNodeClick((n: object) => {
        const node = n as GNode;
        if (!node?.id) return;
        setHintVisible(false);
        const st = useVaultStore.getState();
        if (node.kind === "aggregate" || node.aggregate) {
          // Honesty: never silent no-op when cap hides siblings
          const omitted = node.noteCount ?? 0;
          const folderPath = (node.path || "")
            .replace(/\\/g, "/")
            .replace(/^\/+|\/+$/g, "");
          const browsing = (st.graphBrowsePath || "")
            .replace(/\\/g, "/")
            .replace(/^\/+|\/+$/g, "");
          // Enter folder if aggregate points at a path we aren't browsing
          if (folderPath && folderPath !== browsing) {
            const hit = Object.values(st.nodes ?? {}).find(
              (x) => x.kind === "folder" && x.path === folderPath,
            );
            if (hit) {
              st.enterGraphFolder?.(folderPath);
              st.setToast?.(
                omitted > 0
                  ? `Entered folder · ${omitted} more on the next level`
                  : "Entered folder",
              );
              setLiveRegion(`Entered ${folderPath}`);
              return;
            }
          }
          st.setToast?.(
            omitted > 0
              ? `${omitted} more on this level. Enter a folder, or open a note to fly its links.`
              : "Enter a folder, or open a note to fly its links.",
          );
          setLiveRegion("Aggregate not expanded");
          return;
        }
        if (node.kind === "folder") {
          st.enterGraphFolder?.(node.path);
          setLiveRegion(
            `Entered ${node.name}. ${node.noteCount ?? 0} notes.`,
          );
          return;
        }
        if (node.ghost) {
          const title = node.ghostTarget || node.name;
          st.createNote(null, title);
          return;
        }
        if (isPhoneViewport()) {
          exitGraphForViewport();
          closeDrawersIfNarrow();
        } else {
          st.setGraphMode("panel");
          st.setLeftOpen(true);
          if (typeof window !== "undefined" && window.innerWidth >= 1200) {
            st.setRightOpen(true);
          }
        }
        ensureVaultIndex(st.nodes ?? {});
        const noteCount = vaultIndex.noteCount;
        if (shouldUseFolderGraph(noteCount)) {
          st.enterGraphEgo?.({ returnPath: st.graphBrowsePath || "" });
        }
        st.setActiveNote(node.id);
      })
      .onNodeHover((n: object | null) => {
        const node = n as GNode | null;
        const nextId = node?.id ?? null;
        // W5: skip if hover id unchanged (mousemove within same node)
        if (nextId === hoverRef.current) return;
        hoverRef.current = nextId;
        setHoverName(node?.name ?? null);
        if (node) {
          setHoverTip({
            id: node.id,
            name: node.name,
            path: node.path || "",
            degree: node.degree ?? 0,
            kind: node.kind || (node.ghost ? "missing" : "note"),
            preview: (node.preview || "").slice(0, 120),
          });
        } else {
          setHoverTip(null);
        }
        el.style.cursor = node ? "pointer" : "grab";

        // W5: throttle hover visuals to 50ms; mutate materials + link colors only
        const flushHover = () => {
          hoverThrottleRef.current = null;
          const g = graphRef.current;
          if (!g) return;
          const id = hoverRef.current;
          if (id === hoverAppliedRef.current) return;
          const prev = hoverAppliedRef.current;
          hoverAppliedRef.current = id;

          const resolveObj = (nid: string): THREE.Object3D | undefined => {
            const mapped = nodeObjMapRef.current.get(nid);
            if (mapped) return mapped;
            const nodes = (g.graphData()?.nodes ?? []) as GNode[];
            const hit = nodes.find((x) => x.id === nid);
            const obj = hit?.__threeObj;
            if (obj) nodeObjMapRef.current.set(nid, obj);
            return obj;
          };

          // Clear previous hover (+ light neighbor tint)
          const clearIds = new Set<string>();
          if (prev) {
            clearIds.add(prev);
            const pn = neighborMapRef.current.get(prev);
            if (pn) for (const x of pn) clearIds.add(x);
          }
          for (const cid of clearIds) {
            tintOrbHover(resolveObj(cid), false, accent);
          }
          // Apply new hover + neighbors
          if (id) {
            tintOrbHover(resolveObj(id), true, accent);
            const ns = neighborMapRef.current.get(id);
            if (ns) {
              for (const nid of ns) {
                if (nid === id) continue;
                tintOrbHover(resolveObj(nid), true, accent);
              }
            }
          }
          // Link colors only — do NOT reassign nodeThreeObject / full refresh
          restyleEdgesRef.current();
        };

        if (hoverThrottleRef.current != null) {
          window.clearTimeout(hoverThrottleRef.current);
        }
        hoverThrottleRef.current = window.setTimeout(flushHover, 50);
      })
      .onBackgroundClick(() => setHintVisible(false));

    const linkBatch = new LinkBatch<GLink>(graph.scene(), LINK_OPACITY, (link) => edgeStyle(link));
    linkBatchRef.current = linkBatch;
    graph
      .linkThreeObject(linkBatch.placeholder)
      .linkPositionUpdate((_obj, { start, end }, link) => linkBatch.place(link as GLink, start, end));

    guardOrbitPointer(graph);
    applyEdgeStyles(graph);
    // Oblique view so the orbit reads as depth. zoomToFit keeps this direction.
    try {
      graph.cameraPosition({ x: 95, y: 72, z: 168 }, { x: 0, y: 0, z: 0 }, 0);
    } catch {
      /* ok */
    }

    let envMap: THREE.Texture | null = null;
    try {
      const renderer = graph.renderer();
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1;
      renderer.setPixelRatio(
        Math.min(window.devicePixelRatio || 1, desktopBoost ? 1 : 2),
      );
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

      const ambI = desktopBoost ? 0.5 : 0.4;
      const hemiI = desktopBoost ? 0.28 : 0.22;
      const keyI = desktopBoost ? 0.62 : 0.52;
      const ambient = new THREE.AmbientLight(0x8a93a0, ambI);
      const hemi = new THREE.HemisphereLight(0x243040, 0x05070a, hemiI);
      const key = new THREE.DirectionalLight(0xd5dde6, keyI);
      key.position.set(60, 95, 45);
      const fill = new THREE.DirectionalLight(0x4a5a70, 0.24);
      fill.position.set(-55, 10, -40);
      const rim = new THREE.DirectionalLight(0x9aabbc, 0.14);
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
      graph.d3Force(
        "folder",
        forceFolderCluster(mode === "fullscreen" ? 0.055 : 0.07),
      );
      graph.d3AlphaDecay(phys.alpha);
      graph.d3VelocityDecay(phys.velocity);
    } catch {
      /* ok */
    }

    let interactCleanup: (() => void) | undefined;
    try {
      const controls = graph.controls() as {
        enableDamping?: boolean;
        dampingFactor?: number;
        rotateSpeed?: number;
        zoomSpeed?: number;
        panSpeed?: number;
        minDistance?: number;
        maxDistance?: number;
        addEventListener?: (ev: string, fn: () => void) => void;
        removeEventListener?: (ev: string, fn: () => void) => void;
      } | null;
      if (controls) {
        controls.enableDamping = true;
        controls.dampingFactor = 0.085;
        controls.rotateSpeed = 0.52;
        controls.zoomSpeed = 0.35;
        controls.panSpeed = 0.48;
        controls.minDistance = 10;
        controls.maxDistance = 900;
        const onStart = () => markUserInteracted(true);
        const onEnd = () => markUserInteracted(false);
        controls.addEventListener?.("start", onStart);
        controls.addEventListener?.("end", onEnd);
        interactCleanup = () => {
          controls.removeEventListener?.("start", onStart);
          controls.removeEventListener?.("end", onEnd);
        };
      }
    } catch {
      /* ok */
    }

    let raf = 0;
    let cancelled = false;
    const t0 = performance.now();
    const drift = () => {
      if (cancelled) return;
      const now = performance.now();
      const t = (now - t0) * 0.001;
      for (const layer of parallaxLayers) {
        layer.obj.rotation.y = t * layer.speed;
      }
      // The sky and the idle orbit move every frame here.
      governorRef.current?.kick();
      try {
        const controls = graph.controls() as {
          autoRotate?: boolean;
          autoRotateSpeed?: number;
        } | null;
        if (controls) {
          const idle =
            !userInteractingRef.current &&
            now - lastInteractAtRef.current > IDLE_ORBIT_QUIET_MS &&
            t > IDLE_ORBIT_START_S;
          controls.autoRotate = idle;
          if (idle) controls.autoRotateSpeed = IDLE_ORBIT_SPEED;
        }
      } catch {
        /* ok */
      }
      raf = requestAnimationFrame(drift);
    };
    // A side-panel graph that drifts every frame steals the editor's scroll.
    // Fullscreen can keep the sky moving. The panel stays still after layout.
    if (!usePrefsStore.getState().reducedMotion && mode === "fullscreen") {
      raf = requestAnimationFrame(drift);
    }

    const hideHint = () => {
      setHintVisible(false);
      lastInteractAtRef.current = performance.now();
    };
    const clearPointerHover = () => {
      // Orbit / trackpad pointercancel otherwise leaves stale hover chrome
      hoverRef.current = null;
      hoverAppliedRef.current = null;
      setHoverName(null);
      setHoverTip(null);
      el.style.cursor = "grab";
      try {
        restyleEdgesRef.current();
      } catch {
        /* ok */
      }
    };
    el.addEventListener("pointerdown", hideHint, { once: true });
    el.addEventListener("pointercancel", clearPointerHover);

    // Light zoom inertia — wheel adds a little coast, then decays.
    let zoomVel = 0;
    let zoomRaf = 0;
    const reducedZoom = usePrefsStore.getState().reducedMotion;
    const applyZoomStep = (impulse: number) => {
      try {
        const cam = graph.camera() as THREE.PerspectiveCamera;
        const ctl = graph.controls() as {
          target?: THREE.Vector3;
          update?: () => void;
        } | null;
        const target = ctl?.target;
        if (!cam || !target) return;
        const offset = cam.position.clone().sub(target);
        const dist = offset.length();
        if (dist < 0.001) return;
        const next = Math.min(900, Math.max(12, dist * (1 + impulse)));
        offset.setLength(next);
        cam.position.copy(target).add(offset);
        ctl?.update?.();
      } catch {
        /* ok */
      }
    };
    const tickZoom = () => {
      zoomRaf = 0;
      if (Math.abs(zoomVel) < 0.00035) {
        zoomVel = 0;
        return;
      }
      applyZoomStep(zoomVel);
      zoomVel *= 0.82;
      zoomRaf = requestAnimationFrame(tickZoom);
    };
    const onWheelZoom = (e: WheelEvent) => {
      lastInteractAtRef.current = performance.now();
      e.preventDefault();
      e.stopPropagation();
      const raw = e.deltaY;
      const unit = e.deltaMode === 1 ? raw * 16 : raw;
      const scale = e.ctrlKey ? 0.00032 : 0.00062;
      const impulse = Math.max(-0.09, Math.min(0.09, unit * scale));
      if (reducedZoom) {
        applyZoomStep(impulse);
        return;
      }
      zoomVel += impulse;
      zoomVel = Math.max(-0.18, Math.min(0.18, zoomVel));
      if (!zoomRaf) zoomRaf = requestAnimationFrame(tickZoom);
    };
    el.addEventListener("wheel", onWheelZoom, { passive: false, capture: true });

    const governor = createRenderGovernor({
      pause: () => graph.pauseAnimation(),
      resume: () => graph.resumeAnimation(),
    });
    governorRef.current = governor;
    const wake = () => governor.kick();
    const wakeEvents = ["pointerdown", "pointermove", "pointerup", "wheel", "touchstart", "touchmove"];
    for (const type of wakeEvents) {
      el.addEventListener(type, wake, { passive: true, capture: true });
    }
    // Camera moves, data swaps and rebuilds run inside the render loop, so
    // they restart it. Getters (no arguments) are read every frame and do not.
    const callable = graph as unknown as Record<string, (...args: unknown[]) => unknown>;
    for (const name of ["zoomToFit", "cameraPosition", "graphData", "refresh", "d3ReheatSimulation"]) {
      const original = callable[name];
      if (typeof original !== "function") continue;
      const always = name === "refresh" || name === "d3ReheatSimulation";
      callable[name] = function (this: unknown, ...args: unknown[]) {
        if (always || args.length > 0) governor.kick();
        return original.apply(this, args);
      };
    }
    graph.onEngineTick(() => governor.kick());
    const sceneForLod = graph.scene();
    sceneForLod.onBeforeRender = (renderer, _scene, camera) => {
      linkBatch.sync((graph.graphData()?.links ?? []) as GLink[]);
      const lod = updateGraphLod(
        (graph.graphData()?.nodes ?? []) as GNode[],
        camera,
        renderer.domElement.height,
      );
      governor.frame(camera.matrixWorld.elements, lod.labelsPending > 0);
    };

    graphRef.current = graph;
    setEngineReady(true);

    if (import.meta.env.DEV) {
      (window as unknown as { __NEXUS_GRAPH__?: unknown }).__NEXUS_GRAPH__ = {
        stats: () => {
          const r = graph.renderer() as THREE.WebGLRenderer;
          const d = graph.graphData();
          return {
            mode: graphModeRef.current,
            nodes: d.nodes.length,
            links: d.links.length,
            calls: r.info.render.calls,
            triangles: r.info.render.triangles,
            geometries: r.info.memory.geometries,
            textures: r.info.memory.textures,
            programs: r.info.programs?.length ?? 0,
            pixelRatio: r.getPixelRatio(),
            frame: r.info.render.frame,
            paused: governor.paused,
            drawn: drawnStats(),
          };
        },
        instance: graph,
        browse: (path: string) => useVaultStore.getState().enterGraphFolder?.(path),
        ego: (id: string) => {
          const st = useVaultStore.getState();
          st.setActiveNote(id);
          st.enterGraphEgo?.({ returnPath: st.graphBrowsePath || "" });
        },
      };
    }

    const ro = new ResizeObserver(() => {
      if (!hostRef.current || !graphRef.current) return;
      const { width, height } = hostRef.current.getBoundingClientRect();
      graphRef.current.width(width).height(height);
      governor.kick();
    });
    ro.observe(el);
    const { width, height } = el.getBoundingClientRect();
    graph.width(width).height(height);
    const seed = displayDataRef.current;
    try {
      layoutFitPendingRef.current = true;
      graph.graphData(seed);
      recordDrawn(seed.nodes.length, seed.links.length);
      if (graphModeRef.current === "folder") {
        const sim = graph as ForceGraph3DInstance & {
          d3Alpha?: (a: number) => ForceGraph3DInstance;
        };
        sim.cooldownTicks(0);
        sim.d3Alpha?.(0);
      }
    } catch (err) {
      console.warn("[nexus] graph data", err);
    }
    lastGraphTopoKeyRef.current = graphTopologyKey(seed.nodes, seed.links);
    lastGraphDataRef.current = seed;

    const fitMs = usePrefsStore.getState().reducedMotion ? 0 : 650;
    const zoomTimer = window.setTimeout(() => {
      try {
        graph.zoomToFit(fitMs, mode === "fullscreen" ? 120 : 72);
      } catch {
        /* ok */
      }
    }, usePrefsStore.getState().reducedMotion ? 80 : 900);

    let engineFitTimer = 0;
    graph.onEngineStop(() => {
      // Every prop change briefly resumes the engine; only a new layout fits.
      if (!layoutFitPendingRef.current) return;
      layoutFitPendingRef.current = false;
      // This runs inside the layout tick, before new orbs have been placed.
      // Measure the fit once this frame has positioned them.
      window.clearTimeout(engineFitTimer);
      engineFitTimer = window.setTimeout(() => {
        if (cancelled || userInteractingRef.current) return;
        if (recentlyInteracted(lastInteractAtRef.current, performance.now())) return;
        try {
          graph.scene().updateMatrixWorld();
          graph.zoomToFit(
            usePrefsStore.getState().reducedMotion ? 0 : 800,
            mode === "fullscreen" ? 140 : 88,
          );
        } catch {
          /* ok */
        }
      }, 0);
    });

    teardown = () => {
      cancelled = true;
      window.clearTimeout(zoomTimer);
      window.clearTimeout(engineFitTimer);
      cancelAnimationFrame(raf);


      if (hoverThrottleRef.current != null) {
        window.clearTimeout(hoverThrottleRef.current);
        hoverThrottleRef.current = null;
      }
      hoverAppliedRef.current = null;
      nodeObjMapRef.current.clear();
      el.removeEventListener("pointerdown", hideHint);
      el.removeEventListener("pointercancel", clearPointerHover);
      el.removeEventListener("wheel", onWheelZoom, true);
      for (const type of wakeEvents) el.removeEventListener(type, wake, true);
      governor.dispose();
      linkBatch.dispose();
      if (linkBatchRef.current === linkBatch) linkBatchRef.current = null;
      if (governorRef.current === governor) governorRef.current = null;
      sceneForLod.onBeforeRender = () => {};
      interactCleanup?.();
      flyGenRef.current += 1;
      if (zoomRaf) cancelAnimationFrame(zoomRaf);
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
        releaseSharedGraphResources();
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
    });
    return () => {
      outerCancel = true;
      window.cancelAnimationFrame(startId);
      teardown?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    mode,
    particlesLive,
    physicsIntensity,
    accentPreset,
    accentCustom,
  ]);

  useEffect(() => {
    if (!graphRef.current) return;
    const prev = lastGraphDataRef.current;
    if (
      prev &&
      prev.nodes === displayData.nodes &&
      prev.links === displayData.links
    ) {
      return;
    }
    const nextKey = graphTopologyKey(displayData.nodes, displayData.links);
    if (!shouldReplaceGraphData(lastGraphTopoKeyRef.current, nextKey)) {
      lastGraphDataRef.current = displayData;
      return;
    }
    const live = (graphRef.current.graphData()?.nodes ?? []) as GNode[];
    const merged = {
      nodes: mergePreservedPositions(live, displayData.nodes),
      links: displayData.links,
    };
    lastGraphDataRef.current = displayData;
    lastGraphTopoKeyRef.current = nextKey;
    const liveIds = new Set(merged.nodes.map((n) => n.id));
    for (const id of nodeObjMapRef.current.keys()) {
      if (!liveIds.has(id)) nodeObjMapRef.current.delete(id);
    }
    try {
      layoutFitPendingRef.current = true;
      graphRef.current.graphData(merged);
      recordDrawn(merged.nodes.length, merged.links.length);
    } catch (err) {
      console.warn("[nexus] graph data", err);
    }
    try {
      const sim = graphRef.current as ForceGraph3DInstance & {
        d3Alpha?: (a: number) => ForceGraph3DInstance;
        cooldownTicks?: (n: number) => ForceGraph3DInstance;
      };
      if (graphModeResolved === "folder") {
        sim.cooldownTicks?.(0);
        sim.d3Alpha?.(0);
      } else {
        sim.cooldownTicks?.(desktopBoost ? 20 : 36);
        sim.d3Alpha?.(0.08);
      }
    } catch {
      /* ok */
    }
  }, [displayData, graphModeResolved, desktopBoost]);

  /** Debounced zoomToFit after folder path / scope change (skip first mount) */
  useEffect(() => {
    if (graphModeResolved !== "folder") {
      browsePathReadyRef.current = false;
      return;
    }
    if (!browsePathReadyRef.current) {
      browsePathReadyRef.current = true;
      return;
    }
    const t = window.setTimeout(() => {
      const g = graphRef.current;
      if (!g) return;
      try {
        g.zoomToFit(420, mode === "fullscreen" ? 120 : 72);
      } catch {
        /* ok */
      }
    }, 450);
    return () => window.clearTimeout(t);
  }, [graphBrowsePath, graphScopeMode, graphModeResolved, mode]);

  /** One short fit when entering ego (Show links) — not on every note click. */
  useEffect(() => {
    const prev = prevGraphScopeRef.current;
    prevGraphScopeRef.current = graphScopeMode;
    if (graphModeResolved !== "ego" || prev === "ego") return;
    const t = window.setTimeout(() => {
      const g = graphRef.current;
      if (!g) return;
      try {
        g.zoomToFit(280, mode === "fullscreen" ? 120 : 72);
      } catch {
        /* ok */
      }
    }, 180);
    return () => window.clearTimeout(t);
  }, [graphModeResolved, graphScopeMode, mode]);

  /**
   * Coalesced camera fly-to on active note change.
   * Debounced, cancelable, skipped while the user is orbiting/zooming,
   * and skipped when the note is not in the current draw list (folder map).
   */
  useEffect(() => {
    const first = prevActiveFlyRef.current === undefined;
    const sameId = prevActiveFlyRef.current === activeNoteId;
    prevActiveFlyRef.current = activeNoteId;

    const visible =
      !!activeNoteId &&
      !(graphModeResolved === "folder" && activeNoteMissingFromFolderMap);

    const decision = decideActiveNoteFly({
      viewMode: graphModeResolved,
      activeNoteId,
      nodeIsVisible: visible,
      userInteracting: userInteractingRef.current,
      interactedRecently: recentlyInteracted(
        lastInteractAtRef.current,
        performance.now(),
      ),
      reducedMotion: usePrefsStore.getState().reducedMotion,
      isFirstActive: first,
      fullscreen: mode === "fullscreen",
    });

    if (!decision.fly || sameId) return;

    const gen = ++flyGenRef.current;
    const t = window.setTimeout(() => {
      if (gen !== flyGenRef.current) return;
      if (userInteractingRef.current) return;
      const graph = graphRef.current;
      if (!graph || !activeNoteId) return;
      if (
        recentlyInteracted(lastInteractAtRef.current, performance.now())
      ) {
        return;
      }
      const node = findGraphNode(graph, activeNoteId);
      if (!node) return;
      const dist = mode === "fullscreen" ? 160 : 110;
      flyCameraToNode(graph, node, decision.durationMs, dist);
    }, FLY_DEBOUNCE_MS);

    return () => {
      window.clearTimeout(t);
      if (gen === flyGenRef.current) {
        cancelCameraFly(graphRef.current);
      }
    };
  }, [activeNoteId, mode, graphModeResolved, activeNoteMissingFromFolderMap]);

  useEffect(() => {
    if (!graphRef.current) return;
    const { r: ar, g: ag, b: ab } = accentRgb();
    const accent = new THREE.Color(ar / 255, ag / 255, ab / 255);
    const focusId = () => hoverRef.current || activeRef.current;
    const dimStrength = () => {
      if (hoverRef.current) return 1;
      if (neighborhood !== "all" && activeRef.current) return 0.9;
      if (activeRef.current) return 0.35;
      return 0;
    };

    const neighborSet = (id: string | null): Set<string> | null => {
      if (!id) return null;
      if (neighborhood !== "all" && hopKeepRef.current) {
        return hopKeepRef.current;
      }
      return neighborMapRef.current.get(id) ?? new Set();
    };

    const shouldShowLabel = (n: GNode) => {
      const f = focusId();
      const ns = neighborSet(f);
      if (n.id === activeRef.current || n.id === hoverRef.current) return true;
      if (f && ns?.has(n.id) && n.id !== f) return true;
      if (hoverRef.current) return false;
      if (n.ghost) return false;
      if (
        neighborhood !== "all" &&
        hopKeepRef.current &&
        !hopKeepRef.current.has(n.id)
      ) {
        return false;
      }
      return n.degree >= 3;
    };

    const paintOrb = (n: GNode) => {
      const f = focusId();
      const obj = createOrb(
        n,
        activeRef.current,
        hoverRef.current,
        f,
        neighborSet(f),
        dimStrength(),
        mode,
        accent,
        shouldShowLabel(n),
        desktopBoost,
        lowDetailRef.current,
        colorBy,
      );
      nodeObjMapRef.current.set(n.id, obj);
      return obj;
    };

    const edgeStyle = (link: GLink) => {
      const [s, t] = linkIds(link);
      const hover = hoverRef.current;
      const steel = "176,184,194";
      const thin = mode === "fullscreen" ? 0.26 : 0.18;
      if (hover) {
        const hot = s === hover || t === hover;
        if (hot) {
          return {
            color: `rgba(${ar},${ag},${ab},0.7)`,
            width: thin + 0.16,
            particles: 0,
          };
        }
        return {
          color: `rgba(${steel},0.14)`,
          width: thin * 0.55,
          particles: 0,
        };
      }
      if (activeRef.current) {
        const hot = s === activeRef.current || t === activeRef.current;
        if (hot) {
          return {
            color: `rgba(${ar},${ag},${ab},0.5)`,
            width: thin + 0.08,
            particles: 0,
          };
        }
        return {
          color: `rgba(${steel},0.22)`,
          width: thin * 0.7,
          particles: 0,
        };
      }
      return {
        color: `rgba(${steel},${mode === "fullscreen" ? 0.46 : 0.4})`,
        width: thin,
        particles: 0,
      };
    };

    hoverAppliedRef.current = null;
    restyleEdgesRef.current = () => {
      const g = graphRef.current;
      if (!g) return;
      linkBatchRef.current?.restyle((g.graphData()?.links ?? []) as GLink[]);
      governorRef.current?.kick();
    };
    if (linkBatchRef.current) linkBatchRef.current.style = (link) => edgeStyle(link);
    graphRef.current
      .nodeThreeObject((n: object) => paintOrb(n as GNode))
      .linkColor((link) => edgeStyle(link as GLink).color)
      .linkWidth((link) => edgeStyle(link as GLink).width)
      .linkDirectionalParticles((link) => edgeStyle(link as GLink).particles)
      .refresh();
  }, [mode, accentPreset, accentCustom, particlesLive, desktopBoost, neighborhood, isolateHops, colorBy, showGhosts]);

  const prevActiveTintRef = useRef<string | null>(null);
  useEffect(() => {
    if (!graphRef.current) return;
    const prev = prevActiveTintRef.current;
    const next = activeNoteId;
    if (prev === next) return;
    const { r, g, b } = accentRgb();
    const accent = new THREE.Color(r / 255, g / 255, b / 255);
    if (prev) tintOrbHover(nodeObjMapRef.current.get(prev), false, accent);
    if (next) tintOrbHover(nodeObjMapRef.current.get(next), true, accent);
    prevActiveTintRef.current = next;
    // Light edge restyle only — never nodeThreeObject / graphData / refresh.
    try {
      restyleEdgesRef.current();
    } catch {
      /* ok */
    }
  }, [activeNoteId]);

  const inspectId = hoverTip?.id || activeNoteId;
  const baseInspect = useMemo(
    () =>
      inspectGraphNote(
        useVaultStore.getState().nodes ?? EMPTY_GRAPH_NODES,
        inspectId,
        6,
      ),
    [inspectId, graphTick],
  );
  const [shellInn, setShellInn] = useState<{ links: GraphInspectLink[]; total: number } | null>(null);
  useEffect(() => {
    if (!shellCatalog || !shellDbPath || !inspectId) {
      setShellInn(null);
      return;
    }
    let cancel = false;
    void fetchShellBacklinks(shellDbPath, inspectId).then((page) => {
      if (cancel) return;
      setShellInn({
        total: page?.total ?? 0,
        links: (page?.rows ?? []).slice(0, 6).map((row) => ({
          id: row.fromId,
          title: row.fromTitle,
          path: row.fromPath,
        })),
      });
    });
    return () => {
      cancel = true;
    };
  }, [shellCatalog, shellDbPath, inspectId]);
  const inspect =
    shellCatalog && baseInspect && shellInn
      ? { ...baseInspect, inn: shellInn.links, inCount: shellInn.total }
      : baseInspect;
  const tagOptions = useMemo(
    () => tagFilterOptions(displayData.nodes),
    [displayData.nodes],
  );
  const folderOptions = useMemo(
    () => folderFilterOptions(displayData.nodes),
    [displayData.nodes],
  );

  const cycleVisibleNote = useCallback(
    (dir: 1 | -1) => {
      const notes = displayData.nodes.filter(
        (n) => n.kind !== "folder" && n.kind !== "aggregate" && !n.ghost,
      );
      if (!notes.length) return;
      const ids = notes.map((n) => n.id);
      const cur = activeNoteId ? ids.indexOf(activeNoteId) : -1;
      const next = cur < 0 ? 0 : (cur + dir + ids.length) % ids.length;
      setActiveNote(ids[next]);
    },
    [displayData.nodes, activeNoteId, setActiveNote],
  );

  const fitView = useCallback(() => {
    try {
      graphRef.current?.zoomToFit(
        reducedMotion ? 0 : 420,
        mode === "fullscreen" ? 70 : 48,
      );
    } catch {
      /* ok */
    }
  }, [reducedMotion, mode]);

  const onGraphKey = useCallback(
    (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (
        t.tagName === "INPUT" ||
        t.tagName === "SELECT" ||
        t.tagName === "TEXTAREA"
      ) {
        if (e.key === "Escape") (t as HTMLInputElement).blur();
        return;
      }
      if (e.key === "/" && !e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault();
        filterInputRef.current?.focus();
        return;
      }
      if (e.key === "j" || e.key === "ArrowDown") {
        e.preventDefault();
        cycleVisibleNote(1);
        return;
      }
      if (e.key === "k" || e.key === "ArrowUp") {
        e.preventDefault();
        cycleVisibleNote(-1);
        return;
      }
      if (e.key === "1") setNeighborhood("1hop");
      if (e.key === "2") setNeighborhood("2hop");
      if (e.key === "3") setNeighborhood("3hop");
      if (e.key === "0") setNeighborhood("all");
      if (e.key === "f" && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        fitView();
      }
      if (e.key === "m") {
        if (returnFromGraphEgo) returnFromGraphEgo();
        else resetGraphBrowse?.();
      }
      if (e.key === "l") handleShowLinks();
    },
    [cycleVisibleNote, fitView, handleShowLinks, returnFromGraphEgo, resetGraphBrowse],
  );

  const badge = (
    <>
      {graphModeResolved === "folder" ? (
        <>
          <span className="text-[var(--accent)] opacity-90">Folder map</span>
          <span className="mx-1.5 opacity-40">·</span>
          {badgeFolderCount} folder{badgeFolderCount === 1 ? "" : "s"}
          <span className="mx-1.5 opacity-40">·</span>
          {badgeNoteCount} note{badgeNoteCount === 1 ? "" : "s"}
          {stats.levelPath ? (
            <>
              <span className="mx-1.5 opacity-40">·</span>
              {stats.levelPath.split("/").pop()}
            </>
          ) : (
            <>
              <span className="mx-1.5 opacity-40">·</span>
              this level
            </>
          )}
          <VaultTotal fallback={vaultNoteCount} shown={badgeNoteCount} kind="in" />
        </>
      ) : graphModeResolved === "ego" || isPartialVaultGraph ? (
        <>
          <span className="text-[var(--accent)] opacity-90">Near active</span>
          <span className="mx-1.5 opacity-40">·</span>
          {shellCatalog || vaultLinkIndex.ready ? (
            <>
              {realNoteCount} note{realNoteCount === 1 ? "" : "s"}
              <span className="mx-1.5 opacity-40">·</span>
              {realLinkCount} link{realLinkCount === 1 ? "" : "s"}
              <VaultTotal fallback={vaultNoteCount} shown={realNoteCount} kind="of" />
              {shellCatalog && realLinkCount === 0 && indexFillBusy ? (
                <>
                  <span className="mx-1.5 opacity-40">·</span>
                  links still filling
                </>
              ) : null}
            </>
          ) : (
            "Indexing links…"
          )}
        </>
      ) : (
        <>
          {vaultNoteCount || realNoteCount} notes
          <span className="mx-1.5 opacity-40">·</span>
          {realLinkCount} links
        </>
      )}
      {hoverName ? (
        <>
          <span className="mx-1.5 opacity-40">·</span>
          {hoverName}
        </>
      ) : null}
    </>
  );

  const empty = graphEmptyCopy({
    viewMode: graphModeResolved,
    vaultNoteCount,
    drawnNodeCount: displayData.nodes.length,
    activeNoteId,
    linkIndexReady: shellCatalog ? true : vaultLinkIndex.ready,
    linkEdgeCount: shellCatalog
      ? realLinkCount
      : vaultLinkIndex.stats().edgeCount,
    catalogBacked: shellCatalog,
    linksStillFilling: Boolean(shellCatalog && indexFillBusy),
    hasFilters: Boolean(graphQuery || tagFilter || folderFilter || orphansOnly),
    folderHasPath: Boolean(stats.levelPath || graphBrowsePath),
  });
  const emptyTitle = empty.title;
  const emptyDescription = empty.description;

  const emptyActions = (
    <>
      {vaultNoteCount === 0 ? (
        <button
          type="button"
          className="primary-btn min-h-8 px-3 text-[12px]"
          data-testid="graph-empty-new-note"
          onClick={() => startFirstNote()}
        >
          <FilePlus2 size={13} />
          New note
        </button>
      ) : null}
      {graphModeResolved === "folder" && activeNoteId && vaultNoteCount > 0 ? (
        <button
          type="button"
          className="primary-btn min-h-8 px-3 text-[12px]"
          onClick={handleShowLinks}
        >
          <Link2 size={13} />
          Show links
        </button>
      ) : null}
      {graphModeResolved === "ego" ? (
        <button
          type="button"
          className="ghost-btn min-h-8 px-3 text-[12px]"
          onClick={() => {
            if (returnFromGraphEgo) returnFromGraphEgo();
            else resetGraphBrowse?.();
          }}
        >
          <Globe2 size={13} />
          Folder map
        </button>
      ) : null}
      {(graphQuery || tagFilter || folderFilter || orphansOnly) &&
      displayData.nodes.length === 0 ? (
        <button
          type="button"
          className="ghost-btn min-h-8 px-3 text-[12px]"
          onClick={() => {
            setGraphQuery("");
            setTagFilter("");
            setFolderFilter("");
            setOrphansOnly(false);
            setShowGhosts(true);
          }}
        >
          Clear filters
        </button>
      ) : null}
    </>
  );

  return (
    <GraphChrome
      className={className}
      mode={mode}
      viewMode={graphModeResolved}
      engineReady={engineReady}
      largeVault={shouldUseFolderGraph(vaultNoteCount)}
      badge={badge}
      crumbs={folderCrumbs}
      query={graphQuery}
      onQuery={setGraphQuery}
      showGhosts={showGhosts}
      onToggleGhosts={() => setShowGhosts((v) => !v)}
      ghostCount={ghostCount}
      orphansOnly={orphansOnly}
      onToggleOrphans={() => setOrphansOnly((v) => !v)}
      orphansAvailable={graphModeResolved !== "folder"}
      tag={tagFilter}
      tagOptions={tagOptions}
      onTag={setTagFilter}
      folderPrefix={folderFilter}
      folderOptions={folderOptions}
      onFolder={setFolderFilter}
      colorBy={colorBy}
      onColorBy={setColorBy}
      hopsLabel={
        neighborhood === "all" || graphModeResolved === "folder"
          ? null
          : `${hopCount(neighborhood)}-hop${isolateHops ? " iso" : ""}`
      }
      onCycleHops={() => setNeighborhood(cycleNeighborhood)}
      isolateHops={isolateHops}
      onToggleIsolate={() => setIsolateHops((v) => !v)}
      hopsAvailable={graphModeResolved !== "folder"}
      inspect={inspect}
      onOpenInspectLink={(id) => setActiveNote(id)}
      onShowLinks={handleShowLinks}
      onVaultMap={() => {
        if (returnFromGraphEgo) returnFromGraphEgo();
        else resetGraphBrowse?.();
      }}
      onEnterFolder={(path) => enterGraphFolder?.(path)}
      onFit={fitView}
      onExport={exportPng}
      onExpand={() => setGraphMode("fullscreen")}
      empty={{
        show: empty.show,
        title: emptyTitle,
        description: emptyDescription,
        actions: emptyActions,
      }}
      hint={graphHintText(mode, graphModeResolved)}
      hintVisible={hintVisible}
      liveRegion={liveRegion}
      filterInputRef={filterInputRef}
      onKeyDown={onGraphKey}
    >
      <div
        ref={hostRef}
        className="relative z-[1] min-h-0 flex-1 touch-none outline-none"
        aria-hidden="true"
      />
    </GraphChrome>
  );
});
