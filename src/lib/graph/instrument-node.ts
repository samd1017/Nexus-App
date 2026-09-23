/**
 * Graph nodes as small planets in a starfield.
 * A lit face, a darker limb, and a visible cool atmosphere on the silhouette.
 * No bright core, and no plastic highlight.
 */

import * as THREE from "three";
import SpriteText from "three-spritetext";

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

/**
 * Cool teal through lavender. Warm hues read as a beige lamp.
 */
function hashHue(key: string): number {
  let h = 2166136261;
  const text = key || "__root__";
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  const hues = [168, 186, 198, 214, 232, 252];
  return hues[Math.abs(h) % hues.length] / 360;
}

/**
 * Written straight to the framebuffer. The desktop window shows these
 * quieter than a browser still of the same numbers, so the face sits
 * high enough to stay colorful there.
 */
function bodyColor(key: string, folder: boolean, active: boolean): THREE.Color {
  const light = active ? 0.66 : folder ? 0.6 : 0.54;
  const sat = active ? 0.5 : folder ? 0.56 : 0.48;
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
  float key = clamp(dot(n, normalize(vec3(-0.45, 0.42, 0.55))), 0.0, 1.0);
  float wrap = clamp(key * 0.75 + 0.25, 0.0, 1.0);
  float shade = mix(0.5, 1.0, pow(wrap, 0.8));
  float edge = pow(1.0 - facing, 3.2);
  vec3 col = uColor * shade;
  col += vec3(0.05, 0.09, 0.14) * edge;
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
  float rim = pow(1.0 - facing, 3.4);
  float band = smoothstep(0.32, 0.9, rim);
  float alpha = band * uOpacity;
  if (alpha < 0.02) discard;
  gl_FragColor = vec4(uColor, alpha);
}
`;

function bodyMaterial(color: THREE.Color, opacity: number): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      uColor: { value: color.clone() },
      uOpacity: { value: opacity },
    },
    vertexShader: BODY_VERT,
    fragmentShader: BODY_FRAG,
    transparent: opacity < 0.98,
    depthWrite: opacity > 0.5,
    toneMapped: false,
  });
}

function limbMaterial(color: THREE.Color, opacity: number): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      uColor: { value: color.clone() },
      uOpacity: { value: opacity },
    },
    vertexShader: BODY_VERT,
    fragmentShader: LIMB_FRAG,
    transparent: true,
    depthWrite: false,
    toneMapped: false,
  });
}

function truncateLabel(name: string | undefined | null, max = 22): string {
  const clean = String(name ?? "Note").replace(/\s+/g, " ").trim() || "Note";
  if (clean.length <= max) return clean;
  return clean.slice(0, max - 1) + "…";
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
  label.fontWeight = active || hover ? "600" : "500";
  label.fontSize = 96;
  label.color = active ? "#e7edf4" : hover ? "#d5dbe3" : dim ? "#6a7280" : "#b7c0cc";
  label.backgroundColor = "rgba(0,0,0,0)";
  label.padding = 1;
  label.borderWidth = 0;
  label.borderRadius = 0;
  label.strokeWidth = 0.16;
  label.strokeColor = "#05070a";
  const th = active ? (full ? 2.4 : 1.85) : full ? 1.7 : 1.35;
  label.textHeight = th;
  label.position.y = radius + th * 0.72 + 0.3;
  label.renderOrder = active || hover ? 20 : 8;
  label.material.depthTest = false;
  label.material.depthWrite = false;
  label.material.transparent = true;
  label.material.opacity = active ? 1 : hover ? 0.96 : dim ? 0.4 : 0.78;
  label.material.sizeAttenuation = true;
  return label;
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
    : bodyColor(tintKey, isFolderNode, isActive || isHover);
  if (dim) tint.multiplyScalar(1 - dimStrength * 0.45);

  const bodyOpacity = dim
    ? Math.max(0.12, 0.92 * (1 - dimStrength * 0.7))
    : isGhost
      ? 0.28
      : isAggregate
        ? 0.55
        : 0.96;

  const body = new THREE.Mesh(
    new THREE.SphereGeometry(radius, segs, segs),
    bodyMaterial(tint, bodyOpacity),
  );
  body.userData.nexusCore = true;
  body.renderOrder = 1;
  group.add(body);

  if (!isGhost) {
    const haze = tint.clone().lerp(new THREE.Color().setRGB(0.42, 0.6, 0.88), 0.4);
    const limbMat = limbMaterial(haze, dim ? 0.16 : isActive ? 0.72 : 0.58);
    const atmo = new THREE.Mesh(
      new THREE.SphereGeometry(radius * 1.16, Math.max(16, segs - 4), Math.max(14, segs - 6)),
      limbMat,
    );
    atmo.renderOrder = 2;
    group.add(atmo);
  }

  if (isActive || isHover) {
    const indicator = new THREE.Mesh(
      new THREE.TorusGeometry(radius * 1.2, Math.max(0.02, radius * 0.008), 4, full ? 56 : 40),
      new THREE.MeshBasicMaterial({
        color: new THREE.Color().setHex(0x9eb0c4),
        transparent: true,
        opacity: 0.7,
        depthWrite: false,
      }),
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
        dim,
        full,
        radius,
      }),
    );
  }

  return group;
}
