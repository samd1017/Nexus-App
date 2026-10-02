/**
 * Graph nodes as small planets.
 * A lit face, a dark limb, and a cool atmosphere on the silhouette.
 * No bright core, and no plastic highlight.
 */

import * as THREE from "three";
import {
  cachedLabelTexture,
  rememberLabelTexture,
  unitSphere,
  type LabelSpec,
  type PlanetLod,
} from "./planet-lod";

export type InstrumentKind = "note" | "folder" | "aggregate";

export type InstrumentNodeInput = {
  id: string;
  name?: string;
  kind?: InstrumentKind;
  aggregate?: boolean;
  ghost?: boolean;
  folder?: string;
  tag?: string;
  degree?: number;
  val?: number;
  noteCount?: number;
};

/** 0–1 hash. */
function hashUnit(key: string): number {
  let h = 2166136261;
  const text = key || "__root__";
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (Math.abs(h) % 10000) / 10000;
}

/**
 * Deep teal through indigo. Mint and warm hues wash out or read as candy.
 */
function hashHue(key: string): number {
  return (188 + hashUnit(key) * 68) / 360;
}

/** Day-side albedo. High enough to read in the desktop window. The limb stays dark. */
function bodyColor(key: string, folder: boolean, active: boolean): THREE.Color {
  const light = active ? 0.78 : folder ? 0.74 : 0.68;
  const sat = active ? 0.52 : folder ? 0.58 : 0.5;
  return new THREE.Color().setHSL(hashHue(key), sat, light);
}

const BODY_VERT = `
varying vec3 vNormal;
varying vec3 vWorld;
void main() {
  vec4 world = modelMatrix * vec4(position, 1.0);
  vWorld = world.xyz;
  vNormal = normalize(mat3(modelMatrix) * normal);
  gl_Position = projectionMatrix * viewMatrix * world;
}
`;

/** Facing the camera is a little lighter. The limb of the body stays darker. */
const BODY_FRAG = `
uniform vec3 uColor;
uniform float uOpacity;
varying vec3 vNormal;
varying vec3 vWorld;
void main() {
  vec3 n = normalize(vNormal);
  vec3 viewDir = normalize(cameraPosition - vWorld);
  float facing = clamp(dot(n, viewDir), 0.0, 1.0);
  // Broad, dull sunlight. No specular hotspot.
  // Sun stays off to the side of the camera, so every view has a dark limb.
  vec3 up = vec3(0.0, 1.0, 0.0);
  vec3 side = cross(viewDir, up);
  if (dot(side, side) < 0.0001) side = cross(viewDir, vec3(1.0, 0.0, 0.0));
  side = normalize(side);
  vec3 sunDir = normalize(side * 0.9 + up * 0.42 + viewDir * 0.12);
  float key = clamp(dot(n, sunDir), 0.0, 1.0);
  float sun = pow(key, 0.9);
  float shade = mix(0.16, 1.0, sun);
  // Cool edge on the body, quieter under the title so the label stays readable.
  float air = pow(1.0 - facing, 1.7);
  float cap = smoothstep(0.48, 0.92, n.y);
  air *= mix(1.0, 0.4, cap);
  vec3 col = uColor * shade;
  col += vec3(0.1, 0.22, 0.42) * air;
  gl_FragColor = vec4(col, uOpacity);
}
`;

/** Atmosphere only at the silhouette. The face of the sphere stays clear. */
const LIMB_FRAG = `
uniform vec3 uColor;
uniform float uOpacity;
varying vec3 vNormal;
varying vec3 vWorld;
void main() {
  vec3 n = normalize(vNormal);
  vec3 viewDir = normalize(cameraPosition - vWorld);
  float facing = clamp(abs(dot(n, viewDir)), 0.0, 1.0);
  float rim = pow(1.0 - facing, 1.65);
  float band = smoothstep(0.04, 0.55, rim);
  // Keep the side crescent. Pull the haze back where the title sits.
  float cap = smoothstep(0.42, 0.9, n.y);
  float alpha = band * uOpacity * mix(1.0, 0.22, cap);
  if (alpha < 0.02) discard;
  gl_FragColor = vec4(uColor, alpha);
}
`;

const keepProgram = () => {};

/**
 * Node teardown disposes every material. Once the last planet of a level is
 * gone, three.js would free the shared shader program and the next level
 * would compile it again. Materials stay collectable; only that release is
 * skipped.
 */
function retainProgram<M extends THREE.Material>(material: M): M {
  material.dispose = keepProgram;
  return material;
}

function bodyMaterial(color: THREE.Color, opacity: number): THREE.ShaderMaterial {
  return retainProgram(
    new THREE.ShaderMaterial({
      uniforms: {
        uColor: { value: color.clone() },
        uOpacity: { value: opacity },
      },
      vertexShader: BODY_VERT,
      fragmentShader: BODY_FRAG,
      transparent: opacity < 0.98,
      depthWrite: opacity > 0.5,
      toneMapped: false,
    }),
  );
}

function limbMaterial(color: THREE.Color, opacity: number): THREE.ShaderMaterial {
  return retainProgram(
    new THREE.ShaderMaterial({
      uniforms: {
        uColor: { value: color.clone() },
        uOpacity: { value: opacity },
      },
      vertexShader: BODY_VERT,
      fragmentShader: LIMB_FRAG,
      transparent: true,
      depthWrite: false,
      toneMapped: false,
    }),
  );
}

function truncateLabel(name: string | undefined | null, max = 22): string {
  const clean = String(name ?? "Note").replace(/\s+/g, " ").trim() || "Note";
  if (clean.length <= max) return clean;
  return clean.slice(0, max - 1) + "…";
}

let fontRead: { at: number; stack: string } | null = null;

/** Read once per second at most; a rebuild of 400 plates must not restyle 400 times. */
function fontStack(): string {
  if (typeof document === "undefined") return "system-ui, sans-serif";
  const now = typeof performance !== "undefined" ? performance.now() : Date.now();
  if (fontRead && now - fontRead.at < 1000) return fontRead.stack;
  const stack = getComputedStyle(document.documentElement)
    .getPropertyValue("--font-sans")
    .trim();
  fontRead = { at: now, stack: stack || "system-ui, sans-serif" };
  return fontRead.stack;
}

type LabelRole = "active" | "hub" | "readout" | "idle";

function glyphWidths(ctx: CanvasRenderingContext2D, glyphs: string[]): number[] {
  return glyphs.map((glyph) => ctx.measureText(glyph).width);
}

function drawPlate(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  radius: number,
) {
  const r = Math.min(radius, h / 2 - 1, w / 2 - 1);
  ctx.beginPath();
  ctx.moveTo(r, 0.5);
  ctx.arcTo(w - 0.5, 0.5, w - 0.5, h - 0.5, r);
  ctx.arcTo(w - 0.5, h - 0.5, 0.5, h - 0.5, r);
  ctx.arcTo(0.5, h - 0.5, 0.5, 0.5, r);
  ctx.arcTo(0.5, 0.5, w - 0.5, 0.5, r);
  ctx.closePath();
  ctx.fillStyle = "rgba(7, 10, 16, 0.97)";
  ctx.fill();
  ctx.strokeStyle = "rgba(220, 228, 238, 0.82)";
  ctx.lineWidth = 1.75;
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(r + 2, 2);
  ctx.lineTo(w - r - 2, 2);
  ctx.strokeStyle = "rgba(255, 255, 255, 0.22)";
  ctx.lineWidth = 1;
  ctx.stroke();
}

/**
 * Instrument plate. Tracked type on a hairline steel tag, clear of the haze.
 * No outline around the glyphs.
 */
function makeLabel(
  text: string,
  opts: {
    active: boolean;
    hover: boolean;
    hub: boolean;
    readout: boolean;
    dim: boolean;
    full: boolean;
    radius: number;
  },
): THREE.Object3D {
  const { active, hover, hub, readout, dim, full, radius } = opts;
  const role: LabelRole = active || hover ? "active" : readout ? "readout" : hub ? "hub" : "idle";
  if (typeof document === "undefined") return new THREE.Object3D();

  const fontPx = 72;
  const trackingEm =
    role === "readout" ? 0.11 : text.length > 16 ? 0.028 : text.length > 10 ? 0.048 : 0.072;
  const weight = role === "active" ? "600" : "500";
  const fill = dim ? "#d5dee8" : role === "active" ? "#f7fbff" : "#eef3f8";
  const glyphs = Array.from(text);
  const font = `${weight} ${fontPx}px ${fontStack()}`;
  const tracking = fontPx * trackingEm;
  const metrics = plateMetrics(text, glyphs, font, fontPx, tracking);
  if (!metrics) return new THREE.Object3D();
  const { widths, textW, ascent, descent } = metrics;
  const padX = role === "readout" ? 16 : 14;
  const padY = 11;
  const rail = role === "active" ? 7 : role === "hub" ? 5 : 0;
  const boxW = Math.ceil(textW + padX * 2 + rail);
  const boxH = Math.ceil(ascent + descent + padY * 2);
  const bleed = 3;
  const scale = 2;
  const canvasW = Math.ceil((boxW + bleed * 2) * scale);
  const canvasH = Math.ceil((boxH + bleed * 2) * scale);

  const draw = (): THREE.Texture | null => {
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    canvas.width = canvasW;
    canvas.height = canvasH;
    ctx.setTransform(scale, 0, 0, scale, bleed * scale, bleed * scale);
    ctx.font = font;
    ctx.textBaseline = "alphabetic";

    drawPlate(ctx, boxW, boxH, 5);
    if (role === "active") {
      ctx.fillStyle = "rgba(232, 240, 248, 0.96)";
      ctx.fillRect(6, 8, 2.5, boxH - 16);
    } else if (role === "hub") {
      const mark = boxH * 0.36;
      ctx.fillStyle = "rgba(206, 220, 232, 0.88)";
      ctx.fillRect(6, (boxH - mark) / 2, 2, mark);
    }

    const baseline = (boxH - (ascent + descent)) / 2 + ascent;
    ctx.fillStyle = fill;
    let cursor = padX + rail + (boxW - padX * 2 - rail - textW) / 2;
    glyphs.forEach((glyph, i) => {
      ctx.fillText(glyph, cursor, baseline);
      cursor += widths[i] + tracking;
    });

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 8;
    texture.needsUpdate = true;
    return texture;
  };

  const key = `${role}|${dim ? 1 : 0}|${font}|${text}`;
  const always = role === "active";
  let map = cachedLabelTexture(key);
  if (!map && always) {
    map = draw();
    if (map) map = rememberLabelTexture(key, map);
  }
  const material = retainProgram(
    new THREE.SpriteMaterial({
      map,
      transparent: true,
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
      sizeAttenuation: true,
    }),
  );
  const sprite = new THREE.Sprite(material);
  const glyphH =
    role === "active"
      ? full ? 2.05 : 1.74
      : role === "hub"
        ? full ? 1.7 : 1.46
        : role === "readout"
          ? full ? 1.52 : 1.32
          : full ? 1.58 : 1.36;
  const worldH = glyphH * (boxH / fontPx);
  const worldW = worldH * (canvasW / canvasH);
  sprite.scale.set(worldW, worldH, 1);
  sprite.position.y = radius * 1.34 + worldH * 0.5 + 0.55;
  sprite.renderOrder = role === "active" ? 20 : 8;
  sprite.material.opacity = dim ? 0.88 : 1;
  sprite.visible = !!map;
  sprite.userData.nexusLabel = { key, draw, always } satisfies LabelSpec;
  return sprite;
}

type PlateMetrics = { widths: number[]; textW: number; ascent: number; descent: number };

const plateMetricCache = new Map<string, PlateMetrics>();
let measureCtx: CanvasRenderingContext2D | null | undefined;

function plateMetrics(
  text: string,
  glyphs: string[],
  font: string,
  fontPx: number,
  tracking: number,
): PlateMetrics | null {
  const key = `${font}\u0000${tracking}\u0000${text}`;
  const hit = plateMetricCache.get(key);
  if (hit) return hit;
  if (measureCtx === undefined) measureCtx = document.createElement("canvas").getContext("2d");
  if (!measureCtx) return null;
  measureCtx.font = font;
  const widths = glyphWidths(measureCtx, glyphs);
  const textW =
    widths.reduce((sum, w) => sum + w, 0) + tracking * Math.max(0, glyphs.length - 1);
  const sample = measureCtx.measureText(text || "N");
  const metrics: PlateMetrics = {
    widths,
    textW,
    ascent: sample.actualBoundingBoxAscent || fontPx * 0.74,
    descent: sample.actualBoundingBoxDescent || fontPx * 0.2,
  };
  if (plateMetricCache.size > 4000) plateMetricCache.clear();
  plateMetricCache.set(key, metrics);
  return metrics;
}

/**
 * One graph node. Lit planet, darker limb, visible atmosphere.
 */
export function createInstrumentNode(
  node: InstrumentNodeInput,
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
): THREE.Group {
  const group = new THREE.Group();
  void accent;
  if (!node?.id) return group;

  const isGhost = !!node.ghost;
  const isAggregate = node.kind === "aggregate" || !!node.aggregate;
  const isFolderNode = node.kind === "folder";
  const isActive = node.id === activeId;
  const isHover = node.id === hoverId;
  const isHub = !isGhost && !isAggregate && (node.degree ?? 0) >= 3;
  const inFocus =
    !focusId || node.id === focusId || (neighbors?.has(node.id) ?? false);
  const dim = !!focusId && !inFocus && dimStrength > 0;
  const full = mode === "fullscreen";

  const segs = lowDetail ? 18 : full ? 40 : 32;
  const sizeBoost = desktopBoost ? 1.08 : 1;
  const base = (full ? 2.7 : 2.15) * sizeBoost;
  const rank = isActive || isHover ? 1 : isHub || isFolderNode ? 0.86 : 0.7;
  const mass =
    typeof node.val === "number" && Number.isFinite(node.val) ? node.val : 1;
  const radius =
    base +
    Math.pow(Math.max(1, mass), 0.48) * (full ? 1.15 : 0.95) * rank;

  const tintKey =
    colorBy === "tag" && node.tag
      ? `tag:${node.tag}`
      : node.folder || "__root__";
  const tint = isGhost
    ? new THREE.Color(0x2a3340)
    : bodyColor(`${tintKey}:${node.id}`, isFolderNode, isActive || isHover);
  if (dim) tint.multiplyScalar(1 - dimStrength * 0.45);

  const bodyOpacity = dim
    ? Math.max(0.12, 0.92 * (1 - dimStrength * 0.7))
    : isGhost
      ? 0.28
      : isAggregate
        ? 0.55
        : 0.96;

  // Unit spheres scaled to size: the shaders normalize normals, so a scaled
  // unit sphere draws the same pixels as a sphere built at this radius.
  const body = new THREE.Mesh(unitSphere(segs, segs), bodyMaterial(tint, bodyOpacity));
  body.scale.setScalar(radius);
  body.userData.nexusCore = true;
  body.userData.nexusLod = { radius, topW: segs, topH: segs, current: segs } satisfies PlanetLod;
  body.renderOrder = 1;
  group.add(body);

  if (!isGhost) {
    const haze = new THREE.Color().setRGB(0.42, 0.68, 1.0);
    const limbMat = limbMaterial(haze, dim ? 0.28 : isActive ? 1 : 0.95);
    const atmoRadius = radius * 1.34;
    const atmoW = Math.max(20, segs - 2);
    const atmoH = Math.max(16, segs - 4);
    const atmo = new THREE.Mesh(unitSphere(atmoW, atmoH), limbMat);
    atmo.scale.setScalar(atmoRadius);
    atmo.userData.nexusLod = {
      radius: atmoRadius,
      topW: atmoW,
      topH: atmoH,
      current: atmoW,
    } satisfies PlanetLod;
    atmo.renderOrder = 2;
    group.add(atmo);
  }

  if (isActive || isHover) {
    const indicator = new THREE.Mesh(
      new THREE.TorusGeometry(radius * 1.2, Math.max(0.02, radius * 0.008), 4, full ? 56 : 40),
      retainProgram(
        new THREE.MeshBasicMaterial({
          color: new THREE.Color().setHex(0x6a7e92),
          transparent: true,
          opacity: 0.55,
          depthWrite: false,
        }),
      ),
    );
    indicator.rotation.x = Math.PI / 2;
    indicator.renderOrder = 3;
    group.add(indicator);
  }

  if (showLabel) {
    group.add(
      makeLabel(truncateLabel(node.name, full ? 24 : 18), {
        active: isActive,
        hover: isHover,
        hub: isHub || isFolderNode,
        readout: isAggregate,
        dim,
        full,
        radius,
      }),
    );
  }

  return group;
}
