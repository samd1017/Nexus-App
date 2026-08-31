import { useCallback, useEffect, useMemo, useRef, useState, useDeferredValue } from "react";
import ForceGraph3D, { type ForceGraph3DInstance } from "3d-force-graph";
import * as THREE from "three";
import SpriteText from "three-spritetext";
import { useVaultStore } from "@/lib/vault/store";
import { resolveGraphData, type GraphViewMode } from "@/lib/graph/build-graph";
import { getContentLinkSig } from "@/lib/markdown/wikilinks";
import { shouldUseFolderGraph } from "@/lib/vault/scale-flags";
import { ensureVaultIndex } from "@/lib/vault/indexes";
import { vaultLinkIndex } from "@/lib/vault/link-index";
import { useGraphTick } from "@/lib/graph/graph-tick";
import type { VaultNode } from "@/lib/vault/types";
import {
  Maximize2,
  Minimize2,
  Network,
  Download,
  Focus,
  Globe2,
  Ghost,
  Link2,
  Scan,
  FilePlus2,
  Search,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { usePrefsStore, type PhysicsIntensity } from "@/lib/prefs/preferences";
import { isDesktopShell, formatShortcut } from "@/lib/platform";
import { EmptyState } from "@/components/ui/EmptyState";

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
  ghost?: boolean;
  ghostTarget?: string;
  kind?: "note" | "folder" | "aggregate";
  noteCount?: number;
  aggregate?: boolean;
  x?: number;
  y?: number;
  z?: number;
  __threeObj?: THREE.Object3D;
};

type NeighborhoodMode = "all" | "1hop";

const LOD_SEGMENT_THRESHOLD = 250;
const LOD_CAP = 400;

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


/** G3: stronger folder hue separation via distinct HSL palette slots */
function folderTintColor(folder: string, desktopBoost: boolean): THREE.Color {
  let h = 2166136261;
  const key = folder || "__root__";
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  const hues = [205, 160, 285, 35, 125, 330, 50, 240, 15, 175];
  const hue = hues[Math.abs(h) % hues.length] / 360;
  const sat = desktopBoost ? 0.42 : 0.36;
  const light = desktopBoost ? 0.4 : 0.34;
  return new THREE.Color().setHSL(hue, sat, light);
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

  label.fontFace =
    typeof document !== "undefined"
      ? getComputedStyle(document.documentElement).getPropertyValue("--font-sans").trim() ||
        "system-ui, sans-serif"
      : "system-ui, sans-serif";
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
  desktopBoost: boolean,
  lowDetail = false,
): THREE.Object3D {
  const group = new THREE.Group();
  const isGhost = !!node.ghost;
  const isAggregate = node.kind === "aggregate" || !!node.aggregate;
  const isFolderNode = node.kind === "folder";
  const isActive = node.id === activeId;
  const isHover = node.id === hoverId;
  const isHub = !isGhost && !isAggregate && node.degree >= 3;
  const inFocus =
    !focusId || node.id === focusId || (neighbors?.has(node.id) ?? false);
  const dim = !!focusId && !inFocus && dimStrength > 0;
  const full = mode === "fullscreen";
  const panel = mode === "panel";
  // G5 LOD segments
  const segs = lowDetail
    ? isGhost
      ? 12
      : full
        ? 28
        : 20
    : isGhost
      ? full
        ? 32
        : 24
      : full
        ? 72
        : 56;
  const sizeBoost = desktopBoost ? 1.14 : 1;

  const base = (full ? 3.15 : panel ? 2.55 : 2.4) * sizeBoost;
  const rank = isActive || isHover ? 1 : isHub || isFolderNode ? 0.84 : 0.68;
  const radius =
    base +
    Math.pow(Math.max(1, node.val), 0.55) * (full ? 1.75 : 1.4) * rank +
    (isActive || isHover ? 0.5 : 0);

  let bodyColor = folderTintColor(node.folder, desktopBoost);
  if (node.ghost) {
    bodyColor = new THREE.Color(desktopBoost ? 0x2a323c : 0x222830);
  } else if (isAggregate) {
    bodyColor = bodyColor.clone().multiplyScalar(0.55);
  } else if (isActive || isHover) {
    bodyColor = bodyColor
      .clone()
      .lerp(new THREE.Color(desktopBoost ? 0x5c6678 : 0x4a5260), 0.55);
  } else if (isHub || isFolderNode) {
    bodyColor = bodyColor
      .clone()
      .lerp(new THREE.Color(desktopBoost ? 0x4a5466 : 0x3c4452), 0.35);
  }

  if (dim) {
    bodyColor.multiplyScalar(1 - dimStrength * 0.5);
  }

  const bodyOpacity = dim
    ? Math.max(0.08, 1 - dimStrength * 0.92)
    : isGhost
      ? 0.38
      : isAggregate
        ? 0.48
        : 1;

  let emissive = accent.clone().multiplyScalar(desktopBoost ? 0.22 : 0.12);
  let emissiveIntensity = desktopBoost ? 0.055 : 0.028;
  if (isActive || isHover) {
    emissive = accent.clone();
    emissiveIntensity = desktopBoost ? 0.16 : 0.1;
  } else if (neighbors?.has(node.id)) {
    emissive = accent.clone().multiplyScalar(0.55);
    emissiveIntensity = desktopBoost ? 0.1 : 0.055;
  }

  const body = new THREE.Mesh(
    new THREE.SphereGeometry(radius, segs, segs),
    new THREE.MeshPhysicalMaterial({
      color: bodyColor,
      metalness: desktopBoost ? 0.88 : 0.94,
      roughness: isActive || isHover
        ? 0.14
        : isHub || isFolderNode
          ? 0.22
          : 0.3,
      clearcoat: isActive || isHover
        ? 0.75
        : isFolderNode
          ? Math.min(0.72, (desktopBoost ? 0.55 : 0.42) + 0.08)
          : desktopBoost
            ? 0.55
            : 0.42,
      clearcoatRoughness: isActive || isHover ? 0.06 : 0.16,
      transparent: dim || isGhost || isAggregate,
      opacity: bodyOpacity,
      depthWrite: !(dim || isGhost || isAggregate),
      transmission: 0,
      specularIntensity: isActive || isHover ? 1.5 : desktopBoost ? 1.35 : 1.15,
      specularColor: new THREE.Color(0xe8eef6),
      emissive,
      emissiveIntensity,
      envMapIntensity: isActive || isHover
        ? desktopBoost
          ? 1.85
          : 1.55
        : isHub
          ? desktopBoost
            ? 1.45
            : 1.2
          : desktopBoost
            ? 1.3
            : 1.05,
      side: THREE.FrontSide,
    }),
  );
  body.renderOrder = dim && dimStrength > 0.5 ? 0 : 1;
  group.add(body);

  if (!dim || dimStrength < 0.4) {
    const shell = new THREE.Mesh(
      new THREE.SphereGeometry(
        radius * 1.045,
        Math.min(segs, 48),
        Math.min(segs, 48),
      ),
      new THREE.MeshBasicMaterial({
        color: accent.clone().multiplyScalar(desktopBoost ? 0.55 : 0.35),
        transparent: true,
        opacity: desktopBoost ? 0.09 : 0.05,
        depthWrite: false,
        side: THREE.BackSide,
      }),
    );
    shell.renderOrder = 0;
    group.add(shell);
  }

  if (isActive || isHover) {
    const tube = radius * 0.014;
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(radius * 1.08, tube, 12, full ? 88 : 64),
      new THREE.MeshPhysicalMaterial({
        color: accent.clone().lerp(new THREE.Color(0xd0d8e4), 0.3),
        metalness: 0.92,
        roughness: 0.14,
        emissive: accent.clone(),
        emissiveIntensity: isHover && !isActive ? 0.32 : 0.24,
        envMapIntensity: 1.25,
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


/** W5: mutate materials on existing orbs — avoids full nodeThreeObject rebuild on hover */
function tintOrbHover(
  obj: THREE.Object3D | undefined | null,
  on: boolean,
  accent: THREE.Color,
) {
  if (!obj) return;
  obj.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if (!mesh.isMesh) return;
    const mat = mesh.material as THREE.MeshPhysicalMaterial & {
      userData: Record<string, unknown>;
    };
    if (!mat || typeof mat.emissiveIntensity !== "number") return;
    if (on) {
      if (mat.userData.__w5HoverBase == null) {
        mat.userData.__w5HoverBase = {
          ei: mat.emissiveIntensity,
          rough: mat.roughness,
          er: mat.emissive?.r ?? 0,
          eg: mat.emissive?.g ?? 0,
          eb: mat.emissive?.b ?? 0,
        };
      }
      mat.emissiveIntensity = Math.max(mat.emissiveIntensity, 0.14);
      if (mat.emissive) mat.emissive.copy(accent);
      if (typeof mat.roughness === "number") {
        mat.roughness = Math.min(mat.roughness, 0.16);
      }
      mat.needsUpdate = true;
    } else {
      const b = mat.userData.__w5HoverBase as
        | { ei: number; rough: number; er: number; eg: number; eb: number }
        | undefined;
      if (!b) return;
      mat.emissiveIntensity = b.ei;
      if (mat.emissive) mat.emissive.setRGB(b.er, b.eg, b.eb);
      if (typeof mat.roughness === "number") mat.roughness = b.rough;
      delete mat.userData.__w5HoverBase;
      mat.needsUpdate = true;
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
  activeNoteId: string | null,
  neighborMap: Map<string, Set<string>>,
): { nodes: GNode[]; links: GLink[]; hopKeep: Set<string> | null } {
  if (mode !== "1hop" || !activeNoteId) {
    return { nodes: data.nodes, links: data.links, hopKeep: null };
  }
  const neigh = neighborMap.get(activeNoteId);
  const keep = new Set<string>([activeNoteId, ...(neigh ?? [])]);
  const links = data.links.filter((l) => {
    const [s, t] = linkIds(l);
    return keep.has(s) && keep.has(t);
  });
  return { nodes: data.nodes, links, hopKeep: keep };
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

export function GraphView({ mode, className }: Props) {
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
  const nodes = useVaultStore.getState().nodes;
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
  const createNote = useVaultStore((s) => s.createNote);
  const setCommandOpen = useVaultStore((s) => s.setCommandOpen);
  const [hoverName, setHoverName] = useState<string | null>(null);
  const [hoverTip, setHoverTip] = useState<{
    name: string;
    path: string;
    degree: number;
    kind: string;
    preview: string;
  } | null>(null);
  const [hintVisible, setHintVisible] = useState(true);
  const [neighborhood, setNeighborhood] = useState<NeighborhoodMode>("all");
  const [showGhosts, setShowGhosts] = useState(true);
  const hopKeepRef = useRef<Set<string> | null>(null);
  const neighborhoodRef = useRef<NeighborhoodMode>("all");
  const lowDetailRef = useRef(false);
  /** W5: nodeId → last Object3D from paintOrb (for hover material mutation) */
  const nodeObjMapRef = useRef<Map<string, THREE.Object3D>>(new Map());
  const hoverAppliedRef = useRef<string | null>(null);
  const hoverThrottleRef = useRef<number | null>(null);
  const prevActiveFlyRef = useRef<string | null | undefined>(undefined);
  const graphScopeMode = useVaultStore((s) => s.graphScopeMode ?? "vault");
  const graphBrowsePath = useVaultStore((s) => s.graphBrowsePath ?? "");
  const enterGraphFolder = useVaultStore((s) => s.enterGraphFolder);
  const enterGraphEgo = useVaultStore((s) => s.enterGraphEgo);
  const returnFromGraphEgo = useVaultStore((s) => s.returnFromGraphEgo);
  const resetGraphBrowse = useVaultStore((s) => s.resetGraphBrowse);
  const [liveRegion, setLiveRegion] = useState("");
  /** Skip first browse-path effect so it doesn't fight mount zoomToFit */
  const browsePathReadyRef = useRef(false);

  activeRef.current = activeNoteId;
  neighborhoodRef.current = neighborhood;
  const desktopBoost = isDesktopShell();

  const vaultNoteCount = useMemo(() => {
    const idx = ensureVaultIndex(deferredNodes as Record<string, VaultNode>);
    return idx.noteCount;
  }, [deferredNodes]);

  const vaultFolderCount = useMemo(() => {
    const idx = ensureVaultIndex(deferredNodes as Record<string, VaultNode>);
    return idx.folderCount;
  }, [deferredNodes]);


  // Mode-gated fingerprint — folder mode is O(1) structure gen + path (not O(N) links)
  const graphStructureKey = useMemo(() => {
    const large = shouldUseFolderGraph(vaultNoteCount);
    const idx = ensureVaultIndex(deferredNodes as Record<string, VaultNode>);
    if (large && graphScopeMode !== "ego") {
      return `folder:${idx.structureGeneration}:${graphBrowsePath}:${graphScopeMode}`;
    }
    if (large && graphScopeMode === "ego") {
      return `ego:${vaultLinkIndex.generation}:${activeNoteId}`;
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
    activeNoteId,
    graphTick,
  ]);

  const resolved = useMemo(() => {
    return resolveGraphData(deferredNodes as Record<string, VaultNode>, {
      noteCount: vaultNoteCount,
      activeNoteId,
      graphBrowsePath: graphBrowsePath || "",
      graphScopeMode: graphScopeMode || "vault",
      structuralIndex: ensureVaultIndex(
        deferredNodes as Record<string, VaultNode>,
      ),
    });
  }, [graphStructureKey, activeNoteId, graphBrowsePath, graphScopeMode]);

  const graphModeResolved: GraphViewMode = resolved.mode;

  const data = useMemo(() => {
    return {
      nodes: resolved.nodes.map((n) => ({
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
        ghost: n.ghost,
        ghostTarget: n.ghostTarget,
        kind: n.kind,
        noteCount: n.noteCount,
        aggregate: n.aggregate,
      })) as GNode[],
      links: resolved.edges.map((e) => ({
        source: e.source,
        target: e.target,
      })) as GLink[],
    };
  }, [resolved]);

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

  const displayData = useMemo(() => {
    let base: { nodes: GNode[]; links: GLink[] } = data;
    if (graphModeResolved === "folder") {
      // Builder already capped; skip LOD that would cull degree-0 folders
      hopKeepRef.current = null;
      lowDetailRef.current = false;
      return { nodes: base.nodes, links: base.links };
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
    const lod = applyLodCap(base, activeNoteId, neighborMapRef.current);
    lowDetailRef.current = lod.lowDetail;
    const soft = softNeighborhood(
      { nodes: lod.nodes, links: lod.links },
      neighborhood,
      activeNoteId,
      neighborMapRef.current,
    );
    hopKeepRef.current = soft.hopKeep;
    return { nodes: soft.nodes, links: soft.links };
  }, [data, neighborhood, activeNoteId, showGhosts, graphModeResolved]);

  const shownNoteCount = useMemo(
    () => displayData.nodes.filter((n) => !n.ghost).length,
    [displayData.nodes],
  );

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
    if (!hostRef.current) return;
    const el = hostRef.current;
    el.innerHTML = "";

    const { r: ar, g: ag, b: ab } = accentRgb();
    const accent = new THREE.Color(ar / 255, ag / 255, ab / 255);
    const phys = physicsParams(physicsIntensity);
    const particleCount =
      graphParticles && !usePrefsStore.getState().reducedMotion
        ? mode === "panel"
          ? 1
          : 3
        : 0;

    const focusId = () => hoverRef.current || activeRef.current;
    const dimStrength = () => {
      if (hoverRef.current) return 1;
      if (neighborhoodRef.current === "1hop" && activeRef.current) return 0.9;
      if (activeRef.current) return 0.35;
      return 0;
    };

    const neighborSet = (id: string | null): Set<string> | null => {
      if (!id) return null;
      if (neighborhoodRef.current === "1hop" && hopKeepRef.current) {
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
        neighborhoodRef.current === "1hop" &&
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
      .cooldownTicks(desktopBoost ? 90 : 120)
      .warmupTicks(desktopBoost ? 20 : 40)
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
            const hit = Object.values(st.nodes).find(
              (x) => x.kind === "folder" && x.path === folderPath,
            );
            if (hit) {
              st.enterGraphFolder?.(folderPath);
              st.setToast?.(
                omitted > 0
                  ? `Entered folder · ${omitted}+ items may still be capped`
                  : "Entered folder",
              );
              setLiveRegion(`Entered ${folderPath}`);
              return;
            }
          }
          st.setToast?.(
            omitted > 0
              ? `Not expanded — ${omitted} more item${omitted === 1 ? "" : "s"} hidden by the folder map cap. Enter a folder or open a note for links.`
              : "Not expanded — folder map is capped. Enter a folder or open a note for links.",
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
        st.setGraphMode("panel");
        st.setLeftOpen(true);
        if (typeof window !== "undefined" && window.innerWidth >= 1200) {
          st.setRightOpen(true);
        }
        const noteCount = Object.values(st.nodes).filter(
          (x) => x.kind === "note",
        ).length;
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
          applyEdgeStyles(g);
        };

        if (hoverThrottleRef.current != null) {
          window.clearTimeout(hoverThrottleRef.current);
        }
        hoverThrottleRef.current = window.setTimeout(flushHover, 50);
      })
      .onBackgroundClick(() => setHintVisible(false));

    applyEdgeStyles(graph);

    let envMap: THREE.Texture | null = null;
    try {
      const renderer = graph.renderer();
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = desktopBoost ? 1.32 : 1.12;
      renderer.setPixelRatio(
        Math.min(
          Math.max(window.devicePixelRatio || 1, desktopBoost ? 1.5 : 1),
          2.5,
        ),
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

      const ambI = desktopBoost ? 0.28 : 0.14;
      const hemiI = desktopBoost ? 0.55 : 0.38;
      const keyI = desktopBoost ? 1.45 : 1.15;
      const ambient = new THREE.AmbientLight(0x5a6474, ambI);
      const hemi = new THREE.HemisphereLight(0x2a3a50, 0x03050a, hemiI);
      const key = new THREE.DirectionalLight(0xf0f4f8, keyI);
      key.position.set(60, 95, 45);
      const fill = new THREE.DirectionalLight(
        0x4a5a70,
        desktopBoost ? 0.58 : 0.42,
      );
      fill.position.set(-55, 10, -40);
      const rim = new THREE.DirectionalLight(
        0xb0c8e0,
        desktopBoost ? 0.48 : 0.32,
      );
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
    // Honor reduced motion — skip sky drift animation
    if (!usePrefsStore.getState().reducedMotion) {
      raf = requestAnimationFrame(drift);
    }

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
    graph.graphData(displayData);

    const fitMs = usePrefsStore.getState().reducedMotion ? 0 : 650;
    const zoomTimer = window.setTimeout(() => {
      try {
        graph.zoomToFit(fitMs, mode === "fullscreen" ? 70 : 48);
      } catch {
        /* ok */
      }
    }, usePrefsStore.getState().reducedMotion ? 80 : 900);

    return () => {
      cancelled = true;
      window.clearTimeout(zoomTimer);
      cancelAnimationFrame(raf);


      if (hoverThrottleRef.current != null) {
        window.clearTimeout(hoverThrottleRef.current);
        hoverThrottleRef.current = null;
      }
      hoverAppliedRef.current = null;
      nodeObjMapRef.current.clear();
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
  ]);

  useEffect(() => {
    if (!graphRef.current) return;
    graphRef.current.graphData(displayData);
  }, [displayData]);

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
        g.zoomToFit(650, mode === "fullscreen" ? 70 : 48);
      } catch {
        /* ok */
      }
    }, 450);
    return () => window.clearTimeout(t);
  }, [graphBrowsePath, graphScopeMode, graphModeResolved, mode]);

  /** Fit camera when entering ego scope (including same-id Show links) */
  useEffect(() => {
    if (graphModeResolved !== "ego" || !activeNoteId) return;
    const t = window.setTimeout(() => {
      const g = graphRef.current;
      if (!g) return;
      try {
        const nodes = (g.graphData()?.nodes ?? []) as GNode[];
        const node = nodes.find((n) => n.id === activeNoteId);
        if (node?.x != null && node.y != null && node.z != null) {
          const lookAt = { x: node.x, y: node.y, z: node.z };
          const dist = 180;
          g.cameraPosition(
            { x: lookAt.x, y: lookAt.y + dist * 0.35, z: lookAt.z + dist },
            lookAt,
            650,
          );
        } else {
          g.zoomToFit(650, mode === "fullscreen" ? 70 : 48);
        }
      } catch {
        /* ok */
      }
    }, 200);
    return () => window.clearTimeout(t);
  }, [graphModeResolved, graphStructureKey, activeNoteId, mode]);

  /** W5: camera fly-to when activeNoteId changes (not on hover) */
  useEffect(() => {
    const g = graphRef.current;
    if (!g || !activeNoteId) {
      prevActiveFlyRef.current = activeNoteId;
      return;
    }
    // Skip first mount / same id (avoid fighting zoomToFit)
    if (prevActiveFlyRef.current === undefined) {
      prevActiveFlyRef.current = activeNoteId;
      return;
    }
    if (prevActiveFlyRef.current === activeNoteId) return;
    prevActiveFlyRef.current = activeNoteId;

    const fly = () => {
      const graph = graphRef.current;
      if (!graph) return;
      const nodes = (graph.graphData()?.nodes ?? []) as GNode[];
      const node = nodes.find((n) => n.id === activeNoteId);
      if (!node || node.x == null || node.y == null || node.z == null) return;

      const lookAt = { x: node.x, y: node.y, z: node.z };
      let cam: { x: number; y: number; z: number };
      try {
        cam = graph.cameraPosition();
      } catch {
        return;
      }
      const dx = cam.x - lookAt.x;
      const dy = cam.y - lookAt.y;
      const dz = cam.z - lookAt.z;
      const len = Math.hypot(dx, dy, dz) || 1;
      const dist = mode === "fullscreen" ? 160 : 110;
      // Keep roughly same viewing angle, pull in/out to target distance
      const scale = dist / len;
      try {
        graph.cameraPosition(
          {
            x: lookAt.x + dx * scale,
            y: lookAt.y + dy * scale,
            z: lookAt.z + dz * scale,
          },
          lookAt,
          750,
        );
      } catch {
        /* ok */
      }
    };

    // Wait a frame so graphData / layout coords settle after active change
    const t = window.setTimeout(fly, 80);
    return () => window.clearTimeout(t);
  }, [activeNoteId, mode]);

  useEffect(() => {
    if (!graphRef.current) return;
    const { r: ar, g: ag, b: ab } = accentRgb();
    const accent = new THREE.Color(ar / 255, ag / 255, ab / 255);
    const particleCount =
      graphParticles && !usePrefsStore.getState().reducedMotion
        ? mode === "panel"
          ? 1
          : 3
        : 0;

    const focusId = () => hoverRef.current || activeNoteId;
    const dimStrength = () => {
      if (hoverRef.current) return 1;
      if (neighborhood === "1hop" && activeNoteId) return 0.9;
      if (activeNoteId) return 0.35;
      return 0;
    };

    const neighborSet = (id: string | null): Set<string> | null => {
      if (!id) return null;
      if (neighborhood === "1hop" && hopKeepRef.current) {
        return hopKeepRef.current;
      }
      return neighborMapRef.current.get(id) ?? new Set();
    };

    const shouldShowLabel = (n: GNode) => {
      const f = focusId();
      const ns = neighborSet(f);
      if (n.id === activeNoteId || n.id === hoverRef.current) return true;
      if (f && ns?.has(n.id) && n.id !== f) return true;
      if (hoverRef.current) return false;
      if (n.ghost) return false;
      if (
        neighborhood === "1hop" &&
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
        activeNoteId,
        hoverRef.current,
        f,
        neighborSet(f),
        dimStrength(),
        mode,
        accent,
        shouldShowLabel(n),
        desktopBoost,
        lowDetailRef.current,
      );
      nodeObjMapRef.current.set(n.id, obj);
      return obj;
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

    hoverAppliedRef.current = null;
    graphRef.current
      .nodeThreeObject((n: object) => paintOrb(n as GNode))
      .linkColor((link) => edgeStyle(link as GLink).color)
      .linkWidth((link) => edgeStyle(link as GLink).width)
      .linkDirectionalParticles((link) => edgeStyle(link as GLink).particles)
      .refresh();
  }, [activeNoteId, mode, accentPreset, accentCustom, graphParticles, desktopBoost, neighborhood, showGhosts]);

  return (
    <div
      className={cn(
        "graph-host relative flex min-h-0 flex-col overflow-hidden bg-[var(--graph-void,#03050a)]",
        className,
      )}
      role="region"
      aria-label={
        graphModeResolved === "folder"
          ? "Folder map"
          : graphModeResolved === "ego"
            ? "Link neighborhood graph"
            : "Note graph"
      }
    >
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background: `
            radial-gradient(ellipse 90% 75% at 50% 40%, color-mix(in srgb, var(--accent) 6%, #0e1622) 0%, #0a1018 40%, #05080e 68%, var(--graph-void, #03050a) 100%)
          `,
        }}
      />

      <div className="absolute left-3 right-3 top-3 z-10 flex items-center justify-between gap-2">
        <div className="flex min-w-0 flex-col gap-1.5">
          <div className="flex min-w-0 items-center gap-2 rounded-full border border-white/[0.06] bg-black/40 px-3 py-1.5 backdrop-blur-sm">
            <Network
              size={12}
              className="shrink-0 text-[var(--accent)] opacity-70"
            />
            <span className="truncate text-[11px] font-medium tracking-wide text-[var(--text-muted)]">
              {graphModeResolved === "folder" ? (
                <>
                  {badgeFolderCount} folders
                  <span className="mx-1.5 opacity-50">·</span>
                  {badgeNoteCount} notes
                  <span className="mx-1.5 opacity-50">·</span>
                  <span className="text-[var(--accent)] opacity-80">
                    {stats.levelPath
                      ? `in ${stats.levelPath.split("/").pop()}`
                      : "whole vault"}
                  </span>
                  {stats.capped ? (
                    <>
                      <span className="mx-1.5 opacity-50">·</span>
                      <span className="opacity-70">
                        Showing{" "}
                        {stats.shownNoteCount + stats.shownFolderCount} of{" "}
                        {stats.childFolderCount + stats.childNoteCount}
                      </span>
                    </>
                  ) : null}
                </>
              ) : graphModeResolved === "ego" || isPartialVaultGraph ? (
                <>
                  {realNoteCount} of {vaultNoteCount} notes
                  <span className="mx-1.5 opacity-50">·</span>
                  {realLinkCount} links
                  <span className="mx-1.5 opacity-50">·</span>
                  <span
                    className="text-[var(--accent)] opacity-80"
                    title="Showing links near the active note (large vault)"
                  >
                    near active
                  </span>
                </>
              ) : (
                <>
                  {vaultNoteCount || realNoteCount} notes
                  {vaultFolderCount > 0 ? (
                    <>
                      <span className="mx-1.5 opacity-50">·</span>
                      {vaultFolderCount} folder
                      {vaultFolderCount === 1 ? "" : "s"}
                    </>
                  ) : null}
                  <span className="mx-1.5 opacity-50">·</span>
                  {realLinkCount} link{realLinkCount === 1 ? "" : "s"}
                  {ghostCount > 0 ? (
                    <>
                      <span className="mx-1.5 opacity-50">·</span>
                      <span className="opacity-70">
                        {showGhosts ? ghostCount : 0}/{ghostCount} missing
                      </span>
                    </>
                  ) : null}
                </>
              )}
              {neighborhood === "1hop" && graphModeResolved !== "folder" ? (
                <>
                  <span className="mx-1.5 opacity-50">·</span>
                  <span className="text-[var(--accent)] opacity-80">1-hop</span>
                </>
              ) : null}
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
          {folderCrumbs.length > 0 || graphModeResolved === "folder" ? (
            <nav
              data-graph-breadcrumb
              className="pointer-events-auto flex min-w-0 flex-wrap items-center gap-1 rounded-full border border-white/[0.06] bg-black/40 px-2.5 py-1 backdrop-blur-sm"
              aria-label="Folder map path"
            >
              <button
                type="button"
                className="rounded px-1.5 text-[10px] font-medium tracking-wide text-[var(--accent)] hover:bg-white/5"
                onClick={() => resetGraphBrowse?.()}
              >
                Vault
              </button>
              {folderCrumbs.map((seg, i) => {
                const path = folderCrumbs.slice(0, i + 1).join("/");
                return (
                  <span key={path} className="flex items-center gap-1">
                    <span className="opacity-40">·</span>
                    <button
                      type="button"
                      className="max-w-[88px] truncate rounded px-1.5 text-[10px] font-medium tracking-wide text-[var(--text-secondary)] hover:bg-white/5 hover:text-[var(--text-primary)]"
                      onClick={() => enterGraphFolder?.(path)}
                    >
                      {seg}
                    </button>
                  </span>
                );
              })}
              {activeNoteId ? (
                <>
                  <span className="opacity-40">·</span>
                  <button
                    type="button"
                    className={cn(
                      "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium tracking-wide",
                      activeNoteMissingFromFolderMap
                        ? "border-[var(--accent)]/30 bg-[var(--accent)]/10 text-[var(--accent)] hover:bg-[var(--accent)]/20"
                        : "border-[var(--border)] bg-white/[0.03] text-[var(--text-secondary)] hover:bg-white/[0.06] hover:text-[var(--text-primary)]",
                    )}
                    title="Show wikilink neighborhood for the active note"
                    aria-label="Show links near active note"
                    onClick={handleShowLinks}
                  >
                    <Link2 size={10} className="shrink-0 opacity-80" />
                    Show links
                  </button>
                </>
              ) : null}
            </nav>
          ) : null}
          {realNoteCount > LOD_CAP && graphModeResolved !== "folder" ? (
            <div className="pointer-events-none px-1 text-[10px] tracking-wide text-[var(--text-muted)] opacity-70">
              Showing {shownNoteCount} of {realNoteCount} notes
            </div>
          ) : null}
        </div>
        <div className="pointer-events-auto flex shrink-0 items-center gap-0.5 rounded-full border border-white/[0.08] bg-black/45 p-1 shadow-[0_8px_28px_rgba(0,0,0,0.35)] backdrop-blur-md">
          {graphModeResolved === "ego" ? (
            <button
              type="button"
              className="icon-btn h-8 w-8 text-[var(--accent)]"
              title="Vault folder map"
              aria-label="Vault folder map"
              onClick={() => {
                if (returnFromGraphEgo) returnFromGraphEgo();
                else resetGraphBrowse?.();
              }}
            >
              <Globe2 size={14} />
            </button>
          ) : null}
          {ghostCount > 0 && graphModeResolved !== "folder" ? (
            <button
              type="button"
              className={cn(
                "icon-btn h-8 w-8",
                showGhosts ? "is-active" : "opacity-70",
              )}
              title={showGhosts ? "Hide missing (ghost) nodes" : "Show missing (ghost) nodes"}
              aria-label={showGhosts ? "Hide missing (ghost) nodes" : "Show missing (ghost) nodes"}
              aria-pressed={showGhosts}
              onClick={() => setShowGhosts((v) => !v)}
            >
              <Ghost size={14} />
            </button>
          ) : null}
          {graphModeResolved !== "folder" ? (
            <button
              type="button"
              className={cn(
                "icon-btn h-8 w-8",
                neighborhood === "1hop" && "is-active",
              )}
              title={
                neighborhood === "1hop"
                  ? "Show full graph"
                  : "Neighborhood: soft 1-hop (dim outsiders)"
              }
              aria-label={
                neighborhood === "1hop"
                  ? "Show full graph"
                  : "Neighborhood: soft 1-hop (dim outsiders)"
              }
              aria-pressed={neighborhood === "1hop"}
              onClick={() =>
                setNeighborhood((m) => (m === "all" ? "1hop" : "all"))
              }
            >
              {neighborhood === "1hop" ? (
                <Focus size={14} />
              ) : (
                <Globe2 size={14} />
              )}
            </button>
          ) : null}
          <button
            type="button"
            className="icon-btn h-8 w-8"
            title="Fit graph in view"
            aria-label="Fit graph in view"
            onClick={() => {
              try {
                graphRef.current?.zoomToFit(
                  reducedMotion ? 0 : 420,
                  mode === "fullscreen" ? 70 : 48,
                );
              } catch {
                /* ok */
              }
            }}
          >
            <Scan size={14} />
          </button>
          <button
            type="button"
            className="icon-btn h-8 w-8"
            title="Export graph PNG"
            aria-label="Export graph PNG"
            onClick={exportPng}
          >
            <Download size={14} />
          </button>
          {mode === "fullscreen" ? (
            <button
              type="button"
              className="ml-0.5 flex h-8 shrink-0 items-center gap-1.5 rounded-full border border-[color-mix(in_srgb,var(--accent)_45%,transparent)] bg-[var(--accent-dim)] px-2.5 text-[12px] font-medium text-[var(--accent)] shadow-[0_0_20px_rgba(0,200,255,0.12)] hover:brightness-110"
              title="Exit fullscreen graph (Esc or Ctrl+G)"
              aria-label="Exit fullscreen graph"
              onClick={() => setGraphMode("panel")}
            >
              <Minimize2 size={14} />
              <span className="hidden sm:inline">Exit</span>
              <kbd className="ml-0.5 hidden rounded border border-white/10 bg-black/30 px-1 py-px text-[10px] text-[var(--text-muted)] sm:inline">
                Esc
              </kbd>
            </button>
          ) : (
            <button
              type="button"
              className="icon-btn h-8 w-8"
              title="Expand graph"
              aria-label="Expand graph"
              onClick={() => setGraphMode("fullscreen")}
            >
              <Maximize2 size={14} />
            </button>
          )}
        </div>
      </div>

      <div
        ref={hostRef}
        className="relative z-[1] min-h-0 flex-1 touch-none"
        aria-hidden="true"
      />

      <div className="sr-only" role="status" aria-live="polite">
        {liveRegion}
      </div>

      {hintVisible ? (
        <div className="pointer-events-none absolute bottom-3 left-0 right-0 z-10 flex justify-center px-3">
          <div className="rounded-full border border-white/[0.08] bg-black/50 px-3 py-1.5 text-[10px] tracking-wide text-[var(--text-muted)] shadow-[0_8px_24px_rgba(0,0,0,0.35)] backdrop-blur-md">
            {mode === "fullscreen"
              ? graphModeResolved === "folder"
                ? "Orbit · Zoom · Pan · Click folder · Esc / Exit"
                : `Orbit · Zoom · Pan · Click note · Esc or ${formatShortcut("G")}`
              : graphModeResolved === "folder"
                ? "Orbit · Zoom · Pan · Click folder · Click note · Esc up"
                : "Orbit · Zoom · Pan · Hover for details · Click to open"}
          </div>
        </div>
      ) : mode === "fullscreen" ? (
        <div className="pointer-events-none absolute bottom-3 left-0 right-0 z-10 flex justify-center px-3">
          <div className="rounded-full border border-white/[0.08] bg-black/50 px-3 py-1.5 text-[10px] text-[var(--text-muted)] backdrop-blur-md">
            Esc or <span className="text-[var(--accent)]">Exit</span> to leave
            fullscreen
          </div>
        </div>
      ) : null}

      {hoverTip && displayData.nodes.length > 0 ? (
        <div
          className="graph-tooltip pointer-events-none absolute bottom-12 left-1/2 z-20 w-[min(260px,70vw)] -translate-x-1/2"
          role="tooltip"
        >
          <div className="text-[12px] font-semibold tracking-wide text-[var(--text-primary)]">
            {hoverTip.name}
          </div>
          {hoverTip.path ? (
            <div className="mt-0.5 truncate text-[10.5px] text-[var(--text-muted)]">
              {hoverTip.path}
            </div>
          ) : null}
          <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[10px] text-[var(--text-secondary)]">
            <span className="rounded-full border border-white/10 bg-white/[0.04] px-1.5 py-px capitalize">
              {hoverTip.kind}
            </span>
            {hoverTip.kind === "note" || hoverTip.kind === "missing" ? (
              <span>
                {hoverTip.degree} link{hoverTip.degree === 1 ? "" : "s"}
              </span>
            ) : null}
          </div>
          {hoverTip.preview ? (
            <p className="mt-1.5 line-clamp-2 text-[11px] leading-snug text-[var(--text-muted)]">
              {hoverTip.preview}
            </p>
          ) : null}
          <p className="mt-2 text-[10px] text-[var(--accent)]/80">
            Click to open
          </p>
        </div>
      ) : null}

      {displayData.nodes.length === 0 ? (
        <div className="absolute inset-0 z-10 flex items-center justify-center px-6">
          <EmptyState
            icon={<Network size={16} />}
            title={
              graphModeResolved === "folder"
                ? !(stats.levelPath || graphBrowsePath)
                  ? "Empty vault"
                  : "Empty folder"
                : graphModeResolved === "ego"
                  ? "No neighborhood"
                  : vaultNoteCount === 0
                    ? "No notes yet"
                    : "No graph nodes"
            }
            description={
              graphModeResolved === "folder"
                ? !(stats.levelPath || graphBrowsePath)
                  ? "Add folders or notes to map structure."
                  : "This level has no notes or subfolders yet."
                : graphModeResolved === "ego"
                  ? activeNoteId
                    ? "This note has no resolved [[wikilinks]] in range."
                    : "Open a note to see links near it."
                  : vaultNoteCount === 0
                    ? "Create a note to begin."
                    : "Add [[wikilinks]] between notes to map structure."
            }
            className="pointer-events-auto max-w-[300px] border-[var(--border)] bg-[var(--glass-bg)] shadow-[0_16px_48px_rgba(0,0,0,0.45)] backdrop-blur-md"
          >
            <div className="flex flex-wrap items-center justify-center gap-2">
              {vaultNoteCount === 0 ||
              (graphModeResolved === "folder" &&
                !(stats.levelPath || graphBrowsePath)) ? (
                <button
                  type="button"
                  className="primary-btn min-h-8 px-3 text-[12px]"
                  onClick={() => createNote(null, "Untitled")}
                >
                  <FilePlus2 size={13} />
                  New note
                </button>
              ) : null}
              {graphModeResolved === "ego" && activeNoteId ? (
                <button
                  type="button"
                  className="ghost-btn min-h-8 px-3 text-[12px]"
                  onClick={() => resetGraphBrowse?.()}
                >
                  <Globe2 size={13} />
                  Vault map
                </button>
              ) : null}
              {graphModeResolved === "ego" && !activeNoteId ? (
                <button
                  type="button"
                  className="primary-btn min-h-8 px-3 text-[12px]"
                  onClick={() => setCommandOpen(true)}
                >
                  <Search size={13} />
                  Find a note
                </button>
              ) : null}
              {graphModeResolved !== "ego" &&
              graphModeResolved !== "folder" &&
              vaultNoteCount > 0 ? (
                <button
                  type="button"
                  className="ghost-btn min-h-8 px-3 text-[12px]"
                  onClick={() => setCommandOpen(true)}
                >
                  <Search size={13} />
                  Search notes
                </button>
              ) : null}
              {graphModeResolved === "folder" &&
              (stats.levelPath || graphBrowsePath) ? (
                <button
                  type="button"
                  className="ghost-btn min-h-8 px-3 text-[12px]"
                  onClick={() => resetGraphBrowse?.()}
                >
                  <Globe2 size={13} />
                  Back to vault
                </button>
              ) : null}
            </div>
          </EmptyState>
        </div>
      ) : null}
    </div>
  );
}
