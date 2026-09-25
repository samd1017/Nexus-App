/**
 * Screen-size level of detail for graph planets and their title plates.
 *
 * A planet keeps exactly the tessellation it was built with whenever it is
 * large on screen. When it is small, its sphere drops to the fewest segments
 * whose silhouette stays within a fifth of a pixel of the true circle, so the
 * picture does not change while the triangle count follows the pixels on
 * screen instead of the number of orbs. Title plates too small to read are
 * skipped, and their textures are drawn only when first needed, a few per
 * frame, from a cache shared across rebuilds.
 */

import * as THREE from "three";

/** Largest silhouette error a reduced sphere may show, in device pixels. */
export const LOD_SAG_PX = 0.2;
/** Off-axis spheres project up to ~1.25× larger than their on-axis estimate. */
const OFF_AXIS = 1.25;
/** Drop a level only once the planet is well inside the lower level's range. */
const DOWNGRADE_MARGIN = 1.3;
const LADDER = [6, 8, 10, 12, 14, 16, 18, 20, 24, 28, 32, 36, 40] as const;

/** Plates shorter than this on screen cannot be read; they are not drawn. */
export const LABEL_MIN_PX = 7;
const LABEL_HIDE_PX = 6;
/** New plate textures drawn per frame, so zooming into a cluster never hitches. */
export const LABEL_BUILDS_PER_FRAME = 6;
const LABEL_CACHE_MAX = 192;

/** Width segments needed so a sphere of this screen radius stays round. */
export function segmentsForRadius(radiusPx: number, topSegs: number): number {
  const top = Math.max(3, Math.floor(topSegs));
  // Unknown size, or the camera is inside the sphere: keep the full sphere.
  if (!(radiusPx > 0) || !Number.isFinite(radiusPx)) return top;
  const ratio = LOD_SAG_PX / radiusPx;
  if (ratio >= 1) return Math.min(LADDER[0], top);
  const need = Math.PI / Math.acos(1 - ratio);
  for (const s of LADDER) {
    if (s >= need) return Math.min(s, top);
  }
  return top;
}

/** Height segments for a reduced level, in the same proportion as the top level. */
export function heightForLevel(width: number, topW: number, topH: number): number {
  if (width >= topW) return topH;
  return Math.max(3, Math.round((width * topH) / topW));
}

/**
 * Pick a level with hysteresis. Upgrades happen as soon as they are needed;
 * downgrades wait until the planet is clearly smaller, so a planet at a
 * boundary does not flip every frame.
 */
export function pickLevel(radiusPx: number, current: number, topW: number): number {
  const want = segmentsForRadius(radiusPx * OFF_AXIS, topW);
  if (want >= current) return want;
  const relaxed = segmentsForRadius(radiusPx * OFF_AXIS * DOWNGRADE_MARGIN, topW);
  return relaxed < current ? relaxed : current;
}

class SharedSphereGeometry extends THREE.SphereGeometry {
  // Graph node teardown disposes every child geometry; shared ones stay live.
  override dispose(): void {}
  release(): void {
    super.dispose();
  }
}

const spheres = new Map<string, SharedSphereGeometry>();

/** Free GPU buffers for a renderer that is going away; the next one re-uploads. */
export function releaseSharedSpheres(): void {
  for (const geo of spheres.values()) geo.release();
}

/** One unit sphere per tessellation, shared by every planet that uses it. */
export function unitSphere(widthSegs: number, heightSegs: number): THREE.SphereGeometry {
  const key = `${widthSegs}x${heightSegs}`;
  let geo = spheres.get(key);
  if (!geo) {
    geo = new SharedSphereGeometry(1, widthSegs, heightSegs);
    spheres.set(key, geo);
  }
  return geo;
}

export type PlanetLod = {
  /** World radius of this mesh (its scale). */
  radius: number;
  topW: number;
  topH: number;
  current: number;
};

export type LabelSpec = {
  key: string;
  draw: () => THREE.Texture | null;
  /** Active and hovered plates always show. */
  always: boolean;
};

type CachedLabel = { texture: THREE.Texture; release: () => void };
const labelTextures = new Map<string, CachedLabel>();

function touchLabel(key: string, entry: CachedLabel): void {
  labelTextures.delete(key);
  labelTextures.set(key, entry);
  while (labelTextures.size > LABEL_CACHE_MAX) {
    const oldest = labelTextures.keys().next().value as string;
    labelTextures.get(oldest)?.release();
    labelTextures.delete(oldest);
  }
}

/** A cached plate texture, if one was drawn for this key already. */
export function cachedLabelTexture(key: string): THREE.Texture | null {
  const hit = labelTextures.get(key);
  if (!hit) return null;
  touchLabel(key, hit);
  return hit.texture;
}

/** Store a plate texture; node teardown can no longer dispose it. */
export function rememberLabelTexture(key: string, texture: THREE.Texture): THREE.Texture {
  const release = texture.dispose.bind(texture);
  texture.dispose = () => {};
  touchLabel(key, { texture, release });
  return texture;
}

export function clearLabelTextures(): void {
  for (const entry of labelTextures.values()) entry.release();
  labelTextures.clear();
}

const noRaycast = () => {};
const _pos = new THREE.Vector3();

export type LodFrameStats = {
  meshes: number;
  swapped: number;
  labels: number;
  labelsShown: number;
  labelsPending: number;
};

/**
 * Called once per frame before projection. Swaps each planet mesh to the
 * level its screen size needs and shows or hides title plates.
 */
export function updateGraphLod(
  nodes: ReadonlyArray<{ __threeObj?: THREE.Object3D }>,
  camera: THREE.Camera,
  drawingBufferHeight: number,
): LodFrameStats {
  const stats: LodFrameStats = { meshes: 0, swapped: 0, labels: 0, labelsShown: 0, labelsPending: 0 };
  const persp = camera as THREE.PerspectiveCamera;
  const fov = persp.isPerspectiveCamera ? persp.fov : 50;
  const focal = drawingBufferHeight / 2 / Math.tan((fov * Math.PI) / 360);
  const view = camera.matrixWorldInverse;
  let builds = LABEL_BUILDS_PER_FRAME;

  for (let i = 0; i < nodes.length; i++) {
    const root = nodes[i]?.__threeObj;
    if (!root) continue;
    for (const child of root.children) {
      const data = child.userData as { nexusLod?: PlanetLod; nexusLabel?: LabelSpec | true };
      const lod = data.nexusLod;
      const label = data.nexusLabel;
      if (!lod && !(label && label !== true)) continue;
      _pos.setFromMatrixPosition(child.matrixWorld).applyMatrix4(view);
      const depth = -_pos.z;

      if (lod) {
        stats.meshes += 1;
        const mesh = child as THREE.Mesh;
        const radiusPx = depth > lod.radius ? (lod.radius * focal) / depth : Infinity;
        const next = pickLevel(radiusPx, lod.current, lod.topW);
        if (next !== lod.current) {
          lod.current = next;
          mesh.geometry = unitSphere(next, heightForLevel(next, lod.topW, lod.topH));
          stats.swapped += 1;
        }
        continue;
      }

      const spec = label as LabelSpec;
      const sprite = child as THREE.Sprite;
      stats.labels += 1;
      const heightPx = depth > 0 ? (sprite.scale.y * focal) / depth : Infinity;
      const wasShown = sprite.visible;
      const show = spec.always || heightPx >= (wasShown ? LABEL_HIDE_PX : LABEL_MIN_PX);
      if (show && !sprite.material.map) {
        const cached = cachedLabelTexture(spec.key);
        if (cached) {
          sprite.material.map = cached;
          sprite.material.needsUpdate = true;
        } else if (builds > 0 || spec.always) {
          builds -= 1;
          const tex = spec.draw();
          if (tex) {
            sprite.material.map = rememberLabelTexture(spec.key, tex);
            sprite.material.needsUpdate = true;
          }
        } else {
          stats.labelsPending += 1;
        }
      }
      const visible = show && !!sprite.material.map;
      if (visible !== wasShown) {
        sprite.visible = visible;
        sprite.raycast = visible ? THREE.Sprite.prototype.raycast : noRaycast;
      }
      if (visible) stats.labelsShown += 1;
    }
  }
  return stats;
}
