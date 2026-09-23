/**
 * Graph nodes as machined instrument tokens.
 * Matte gunmetal discs — no clearcoat spheres, no glow shells.
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

const GUNMETAL = new THREE.Color(0x12161b);
const FACE = new THREE.Color(0x3c444e);
const LIP = new THREE.Color(0x6a7380);
const STEEL = new THREE.Color(0x2a313a);

function hashHue(key: string): number {
  let h = 2166136261;
  const text = key || "__root__";
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  const hues = [205, 168, 222, 28, 132, 188, 248, 12];
  return hues[Math.abs(h) % hues.length] / 360;
}

/** A small index pip so folders stay distinguishable without painting the token. */
function indexTint(key: string): THREE.Color {
  return new THREE.Color().setHSL(hashHue(key), 0.28, 0.42);
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
  label.position.y = radius * 0.22 + th * 0.85 + 0.35;
  label.renderOrder = active || hover ? 20 : 8;
  label.material.depthTest = false;
  label.material.depthWrite = false;
  label.material.transparent = true;
  label.material.opacity = active ? 1 : hover ? 0.96 : dim ? 0.4 : 0.78;
  label.material.sizeAttenuation = true;
  return label;
}

function metal(
  color: THREE.Color,
  roughness: number,
  metalness = 0.78,
): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color,
    roughness,
    metalness,
    envMapIntensity: 0.28,
    emissive: new THREE.Color(0x000000),
    emissiveIntensity: 0,
  });
}

/**
 * One graph node. Folder, note, aggregate, and missing-link tokens share
 * the same machined disc so the map reads as one instrument.
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

  const segs = lowDetail ? 18 : full ? 36 : 28;
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
  const pip = indexTint(tintKey);

  const opacity = dim
    ? Math.max(0.12, 1 - dimStrength * 0.88)
    : isGhost
      ? 0.45
      : isAggregate
        ? 0.72
        : 1;
  const transparent = dim || isGhost || isAggregate;

  const height = Math.max(0.28, radius * 0.14);
  const faceLift = height * 0.5 + 0.02;

  if (!isGhost && !isAggregate) {
    const bodyColor = GUNMETAL.clone();
    if (dim) bodyColor.multiplyScalar(1 - dimStrength * 0.45);
    const body = new THREE.Mesh(
      new THREE.CylinderGeometry(radius, radius, height, segs, 1),
      metal(bodyColor, 0.78, 0.62),
    );
    body.userData.nexusBody = true;
    body.castShadow = false;
    body.receiveShadow = false;
    body.renderOrder = 1;
    const bodyMat = body.material as THREE.MeshStandardMaterial;
    bodyMat.transparent = transparent;
    bodyMat.opacity = opacity;
    bodyMat.depthWrite = !transparent;
    group.add(body);

    const faceColor = FACE.clone().lerp(pip, isFolderNode ? 0.16 : 0.06);
    if (isActive || isHover) faceColor.lerp(new THREE.Color(0xc5ced8), 0.12);
    if (dim) faceColor.multiplyScalar(1 - dimStrength * 0.4);
    const face = new THREE.Mesh(
      new THREE.CylinderGeometry(radius * 0.94, radius * 0.94, 0.06, segs, 1),
      metal(faceColor, 0.84, 0.35),
    );
    face.position.y = faceLift;
    face.renderOrder = 2;
    const faceMat = face.material as THREE.MeshStandardMaterial;
    faceMat.transparent = transparent;
    faceMat.opacity = opacity;
    faceMat.depthWrite = !transparent;
    group.add(face);

    const lip = new THREE.Mesh(
      new THREE.TorusGeometry(radius * 0.995, Math.max(0.02, radius * 0.012), 5, segs),
      metal(LIP, 0.55, 0.72),
    );
    lip.rotation.x = Math.PI / 2;
    lip.position.y = height * 0.5;
    lip.renderOrder = 3;
    const lipMat = lip.material as THREE.MeshStandardMaterial;
    lipMat.transparent = transparent;
    lipMat.opacity = dim ? opacity : 0.95;
    group.add(lip);

    if (isFolderNode) {
      const groove = new THREE.Mesh(
        new THREE.TorusGeometry(radius * 0.62, Math.max(0.02, radius * 0.008), 4, segs),
        metal(STEEL, 0.64, 0.7),
      );
      groove.rotation.x = Math.PI / 2;
      groove.position.y = faceLift + height * 0.05;
      groove.renderOrder = 3;
      group.add(groove);
    }

    const mark = new THREE.Mesh(
      new THREE.BoxGeometry(radius * 0.08, height * 0.16, radius * 0.22),
      metal(pip, 0.5, 0.4),
    );
    mark.position.set(radius * 0.78, height * 0.42, 0);
    mark.renderOrder = 4;
    group.add(mark);
  } else {
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(
        radius,
        Math.max(0.04, radius * 0.02),
        6,
        segs,
      ),
      metal(isGhost ? STEEL : LIP, 0.5, 0.75),
    );
    ring.rotation.x = Math.PI / 2;
    ring.renderOrder = 2;
    const ringMat = ring.material as THREE.MeshStandardMaterial;
    ringMat.transparent = true;
    ringMat.opacity = opacity;
    ringMat.depthWrite = false;
    group.add(ring);
    if (isAggregate) {
      const inner = new THREE.Mesh(
        new THREE.TorusGeometry(radius * 0.72, Math.max(0.02, radius * 0.01), 4, segs),
        metal(STEEL, 0.6, 0.6),
      );
      inner.rotation.x = Math.PI / 2;
      inner.renderOrder = 2;
      const innerMat = inner.material as THREE.MeshStandardMaterial;
      innerMat.transparent = true;
      innerMat.opacity = opacity * 0.7;
      innerMat.depthWrite = false;
      group.add(inner);
    }
  }

  if (isActive || isHover) {
    const indicator = new THREE.Mesh(
      new THREE.TorusGeometry(radius * 1.08, Math.max(0.03, radius * 0.012), 6, full ? 64 : 48),
      new THREE.MeshStandardMaterial({
        color: accent.clone().lerp(new THREE.Color(0xd5dbe3), 0.25),
        roughness: 0.42,
        metalness: 0.7,
        emissive: accent,
        emissiveIntensity: isHover && !isActive ? 0.05 : 0.035,
        envMapIntensity: 0.2,
      }),
    );
    indicator.rotation.x = Math.PI / 2;
    indicator.position.y = isGhost || isAggregate ? 0 : height * 0.5;
    indicator.renderOrder = 5;
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
