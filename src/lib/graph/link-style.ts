/**
 * Link tube cylinders and materials, built exactly as three-forcegraph
 * builds them for a color and width, and shared by every link that uses
 * the same style.
 */

import * as THREE from "three";

/** three-forcegraph's default linkResolution (radial segments per tube). */
const LINK_RESOLUTION = 6;

export type LinkStyle = { color: string; width: number };

class SharedCylinderGeometry extends THREE.CylinderGeometry {
  // Link teardown disposes geometry; cached cylinders stay live.
  override dispose(): void {}
  release(): void {
    super.dispose();
  }
}

const cylinders = new Map<number, SharedCylinderGeometry>();
const materials = new Map<string, { material: THREE.MeshLambertMaterial; release: () => void }>();

/** Free GPU resources for a renderer that is going away; the next one re-uploads. */
export function releaseLinkStyles(): void {
  for (const geo of cylinders.values()) geo.release();
  for (const entry of materials.values()) entry.release();
}

function parseRgba(color: string): { hex: number; alpha: number } | null {
  const m = /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+)\s*)?\)$/i.exec(
    color.trim(),
  );
  if (!m) return null;
  const c = (v: string) => Math.max(0, Math.min(255, Math.round(Number(v))));
  const alpha = m[4] === undefined ? 1 : Math.max(0, Math.min(1, Number(m[4])));
  return { hex: (c(m[1]) << 16) | (c(m[2]) << 8) | c(m[3]), alpha };
}

/** Same rounding three-forcegraph applies before it builds a tube. */
export function roundedLinkWidth(width: number): number {
  return Math.ceil(width * 10) / 10;
}

export function linkCylinder(width: number): THREE.CylinderGeometry {
  const w = roundedLinkWidth(width);
  let geo: SharedCylinderGeometry | undefined = cylinders.get(w);
  if (!geo) {
    const r = w / 2;
    geo = new SharedCylinderGeometry(r, r, 1, LINK_RESOLUTION, 1, false);
    geo.applyMatrix4(new THREE.Matrix4().makeTranslation(0, 1 / 2, 0));
    geo.applyMatrix4(new THREE.Matrix4().makeRotationX(Math.PI / 2));
    cylinders.set(w, geo);
  }
  return geo;
}

export function linkMaterial(color: string, linkOpacity: number): THREE.MeshLambertMaterial | null {
  const key = `${linkOpacity}|${color}`;
  const hit = materials.get(key);
  if (hit) return hit.material;
  const parsed = parseRgba(color);
  if (!parsed) return null;
  const opacity = linkOpacity * parsed.alpha;
  const mat = new THREE.MeshLambertMaterial({
    color: new THREE.Color(parsed.hex),
    transparent: opacity < 1,
    opacity,
    depthWrite: opacity >= 1,
  });
  const release = mat.dispose.bind(mat);
  // Link teardown disposes materials; cached ones stay live.
  mat.dispose = () => {};
  materials.set(key, { material: mat, release });
  return mat;
}
