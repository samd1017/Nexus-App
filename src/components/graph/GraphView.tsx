import { useCallback, useEffect, useMemo, useRef, useState, useDeferredValue, type KeyboardEvent } from "react";
import ForceGraph3D, { type ForceGraph3DInstance } from "3d-force-graph";
import * as THREE from "three";
import SpriteText from "three-spritetext";
import { useVaultStore } from "@/lib/vault/store";
import { resolveGraphData, type GraphViewMode } from "@/lib/graph/build-graph";
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
import { inspectGraphNote } from "@/lib/graph/graph-inspect";
import {
  applyGraphFilters,
  filtersAreIdle,
  folderFilterOptions,
  scaleParticlesEnabled,
  tagFilterOptions,
  type GraphFilterState,
} from "@/lib/graph/graph-filters";
import { graphEmptyCopy } from "@/lib/graph/graph-empty";

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
  colorBy: "folder" | "tag" = "folder",
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

  let bodyColor =
    colorBy === "tag" && node.tag
      ? tagTintColor(node.tag, desktopBoost)
      : folderTintColor(node.folder, desktopBoost);
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
  const lastGraphTopoKeyRef = useRef<string | null>(null);
  const lastGraphDataRef = useRef<{ nodes: GNode[]; links: GLink[] } | null>(
    null,
  );
  const prevGraphScopeRef = useRef<string | null>(null);
  const graphScopeMode = useVaultStore((s) => s.graphScopeMode ?? "vault");
  const graphBrowsePath = useVaultStore((s) => s.graphBrowsePath ?? "");
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
  const desktopBoost = isDesktopShell();

  const vaultNoteCount = useMemo(() => {
    const idx = ensureVaultIndex(deferredNodes as Record<string, VaultNode>);
    return idx.noteCount;
  }, [deferredNodes]);

  const vaultFolderCount = useMemo(() => {
    const idx = ensureVaultIndex(deferredNodes as Record<string, VaultNode>);
    return idx.folderCount;
  }, [deferredNodes]);

  const particlesLive = scaleParticlesEnabled(
    vaultNoteCount,
    graphParticles,
    reducedMotion,
  );


  // Mode-gated fingerprint — folder uses O(level) child signature (not O(N) links,
  // and not structureGeneration which can bump on content-only body evicts).
  const graphStructureKey = useMemo(() => {
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
  ]);

  const resolved = useMemo(() => {
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
  }, [graphStructureKey, graphBrowsePath, graphScopeMode]);

  const graphModeResolved: GraphViewMode = resolved.mode;

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
        tag: tagByNote.get(n.id) || "",
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
  }, [resolved, colorBy, tagColorNodes]);

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

  const displayData = useMemo(() => {
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
    const particleCount = particlesLive
      ? mode === "panel"
        ? 1
        : 3
      : 0;

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
    restyleEdgesRef.current = () => {
      const g = graphRef.current;
      if (g) applyEdgeStyles(g);
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
      .cooldownTicks(desktopBoost ? 48 : 64)
      .warmupTicks(0)
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
        ensureVaultIndex(st.nodes);
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
        const g = graphRef.current;
        if (g) applyEdgeStyles(g);
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

    graphRef.current = graph;
    setEngineReady(true);

    const ro = new ResizeObserver(() => {
      if (!hostRef.current || !graphRef.current) return;
      const { width, height } = hostRef.current.getBoundingClientRect();
      graphRef.current.width(width).height(height);
    });
    ro.observe(el);
    const { width, height } = el.getBoundingClientRect();
    graph.width(width).height(height);
    graph.graphData(displayData);
    lastGraphTopoKeyRef.current = graphTopologyKey(
      displayData.nodes,
      displayData.links,
    );
    lastGraphDataRef.current = displayData;

    const fitMs = usePrefsStore.getState().reducedMotion ? 0 : 650;
    const zoomTimer = window.setTimeout(() => {
      try {
        graph.zoomToFit(fitMs, mode === "fullscreen" ? 70 : 48);
      } catch {
        /* ok */
      }
    }, usePrefsStore.getState().reducedMotion ? 80 : 900);

    teardown = () => {
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
      el.removeEventListener("pointercancel", clearPointerHover);
      el.removeEventListener("wheel", onWheelZoom, true);
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
    graphRef.current.graphData(merged);
    try {
      // Soft continue — do not reheat the whole simulation on every swap.
      const sim = graphRef.current as ForceGraph3DInstance & {
        d3Alpha?: (a: number) => ForceGraph3DInstance;
      };
      sim.d3Alpha?.(0.06);
    } catch {
      /* ok */
    }
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
        g.zoomToFit(420, mode === "fullscreen" ? 70 : 48);
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
        g.zoomToFit(280, mode === "fullscreen" ? 70 : 48);
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
    const particleCount = particlesLive
      ? mode === "panel"
        ? 1
        : 3
      : 0;

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
      if (activeRef.current) {
        const hot = s === activeRef.current || t === activeRef.current;
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
    restyleEdgesRef.current = () => {
      const g = graphRef.current;
      if (!g) return;
      g.linkColor((link) => edgeStyle(link as GLink).color)
        .linkWidth((link) => edgeStyle(link as GLink).width)
        .linkDirectionalParticles((link) => edgeStyle(link as GLink).particles);
    };
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
  const inspect = useMemo(
    () => inspectGraphNote(useVaultStore.getState().nodes, inspectId, 6),
    [inspectId, graphTick],
  );
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
          {stats.capped ? (
            <>
              <span className="mx-1.5 opacity-40">·</span>
              capped
            </>
          ) : null}
        </>
      ) : graphModeResolved === "ego" || isPartialVaultGraph ? (
        <>
          <span className="text-[var(--accent)] opacity-90">Near active</span>
          <span className="mx-1.5 opacity-40">·</span>
          {vaultLinkIndex.ready ? (
            <>
              {realNoteCount} note{realNoteCount === 1 ? "" : "s"}
              <span className="mx-1.5 opacity-40">·</span>
              {realLinkCount} link{realLinkCount === 1 ? "" : "s"}
              {vaultNoteCount > realNoteCount ? (
                <>
                  <span className="mx-1.5 opacity-40">·</span>
                  of {vaultNoteCount.toLocaleString()}
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
    linkIndexReady: vaultLinkIndex.ready,
    linkEdgeCount: vaultLinkIndex.stats().edgeCount,
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
          onClick={() => createNote(null, "Untitled")}
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
}
