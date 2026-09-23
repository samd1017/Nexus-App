/**
 * Graph nodes as dark glass spheres.
 * Light sits inside the volume. The shell stays soft — no clearcoat hotspot.
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

const SHELL = new THREE.Color(0x10161e);

function hashHue(key: string): number {
  let h = 2166136261;
  const text = key || "__root__";
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  const hues = [200, 168, 218, 26, 188, 242, 12, 152];
  return hues[Math.abs(h) % hues.length] / 360;
}

function coreTint(key: string, folder: boolean): THREE.Color {
  return new THREE.Color().setHSL(hashHue(key), folder ? 0.42 : 0.28, folder ? 0.46 : 0.4);
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

/** Unlit shell. A lit glass shader puts a hard specular dot on the sphere. */
function glassShell(opacity: number, tint: THREE.Color): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({
    color: SHELL.clone().lerp(tint, 0.22),
    transparent: true,
    opacity,
    depthWrite: false,
  });
}

/**
 * One graph node. A dim glass shell around a soft core, for folders,
 * notes, aggregates, and missing links.
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
  const glow = isGhost
    ? new THREE.Color(0x3a4452)
    : coreTint(tintKey, isFolderNode).lerp(accent, isActive || isHover ? 0.28 : 0.08);
  if (dim) glow.multiplyScalar(1 - dimStrength * 0.55);

  const shellOpacity = dim
    ? Math.max(0.08, 0.34 * (1 - dimStrength * 0.75))
    : isGhost
      ? 0.22
      : isAggregate
        ? 0.26
        : 0.34;

  if (!isGhost) {
    const coreScale = isAggregate ? 0.46 : 0.58;
    const core = new THREE.Mesh(
      new THREE.SphereGeometry(radius * coreScale, Math.max(16, segs - 8), Math.max(12, segs - 10)),
      new THREE.MeshBasicMaterial({
        color: glow.clone().multiplyScalar(isActive ? 1.15 : isHover ? 1.0 : isFolderNode ? 0.85 : 0.7),
      }),
    );
    core.userData.nexusCore = true;
    core.renderOrder = 1;
    group.add(core);

    const haze = new THREE.Mesh(
      new THREE.SphereGeometry(radius * 0.84, Math.max(16, segs - 6), Math.max(12, segs - 8)),
      new THREE.MeshBasicMaterial({
        color: glow,
        transparent: true,
        opacity: dim ? 0.06 : isActive ? 0.22 : 0.16,
        depthWrite: false,
        blending: THREE.NormalBlending,
      }),
    );
    haze.renderOrder = 2;
    group.add(haze);
  }

  const shell = new THREE.Mesh(
    new THREE.SphereGeometry(radius, segs, segs),
    glassShell(shellOpacity, glow),
  );
  shell.renderOrder = 3;
  group.add(shell);

  const rim = new THREE.Mesh(
    new THREE.SphereGeometry(radius * 1.015, Math.max(16, segs - 4), Math.max(12, segs - 6)),
    new THREE.MeshBasicMaterial({
      color: glow.clone().lerp(new THREE.Color(0xd5dbe3), 0.35),
      transparent: true,
      opacity: dim ? 0.03 : 0.07,
      side: THREE.BackSide,
      depthWrite: false,
    }),
  );
  rim.renderOrder = 0;
  group.add(rim);

  if (isActive || isHover) {
    const indicator = new THREE.Mesh(
      new THREE.TorusGeometry(radius * 1.12, Math.max(0.025, radius * 0.01), 6, full ? 64 : 48),
      new THREE.MeshStandardMaterial({
        color: accent.clone().lerp(new THREE.Color(0xd5dbe3), 0.2),
        roughness: 0.55,
        metalness: 0.15,
        emissive: accent,
        emissiveIntensity: 0.06,
        envMapIntensity: 0.05,
      }),
    );
    indicator.rotation.x = Math.PI / 2;
    indicator.renderOrder = 4;
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
