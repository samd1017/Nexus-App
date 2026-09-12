import { useCallback, useEffect, useMemo, useRef, useState, useDeferredValue } from "react";
import ForceGraph3D, { type ForceGraph3DInstance } from "3d-force-graph";
import * as THREE from "three";
import SpriteText from "three-spritetext";
import { useVaultStore } from "@/lib/vault/store";
import { resolveGraphData, type GraphViewMode } from "@/lib/graph/build-graph";
import { getContentLinkSig } from "@/lib/markdown/wikilinks";
import { shouldUseFolderGraph } from "@/lib/vault/scale-flags";
import { ensureVaultIndex, vaultIndex } from "@/lib/vault/indexes";
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
  Hash,
  Link2,
  Scan,
  FilePlus2,
  Search,
  Filter,
} from "lucide-react";
import { collectVaultTags } from "@/lib/vault/tags";
import { cn } from "@/lib/utils";
import { usePrefsStore, type PhysicsIntensity } from "@/lib/prefs/preferences";
import { isDesktopShell, formatShortcut } from "@/lib/platform";
import {
  closeDrawersIfNarrow,
  exitGraphForViewport,
  isPhoneViewport,
} from "@/lib/layout/viewport";
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
  tag?: string;
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

type NeighborhoodMode = "all" | "1hop" | "2hop" | "3hop";

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
function tagTintColor(tag: string, desktopBoost: boolean): THREE.Color {
  return folderTintColor(`tag:${tag || "__none__"}`, desktopBoost);
}

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
  return clean.slice(0, max - 1) + "\u2026";
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
