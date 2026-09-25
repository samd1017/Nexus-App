/**
 * Graph links drawn as a handful of instanced tubes, one per link style,
 * instead of one mesh (and one draw call) per link.
 *
 * ForceGraph3D keeps an empty stand-in object per link and calls back with
 * the link's endpoints on every layout tick. Each tube gets exactly the
 * transform three-forcegraph gives its own straight tubes (start point,
 * length along +Z, turned to face the end), with the same cylinder and
 * Lambert material, so the lines look the same while a 1,500-link
 * neighborhood costs a few draw calls. Restyling (hover, the active note)
 * only regroups instances.
 */

import * as THREE from "three";
import { linkCylinder, linkMaterial, roundedLinkWidth, type LinkStyle } from "./link-style";

type Endpoint = { x?: number; y?: number; z?: number };
type Bucket = { mesh: THREE.InstancedMesh; used: number };

const HIDDEN = new THREE.Matrix4().makeScale(0, 0, 0);
const noRaycast = () => {};
const _tube = new THREE.Object3D();
const _end = new THREE.Vector3();

export class LinkBatch<L extends { __lineObj?: THREE.Object3D }> {
  private readonly root = new THREE.Group();
  private readonly buckets = new Map<string, Bucket>();
  private readonly matrices = new WeakMap<L, THREE.Matrix4>();
  private readonly slots = new WeakMap<L, { bucket: Bucket; index: number }>();
  private dirty = true;

  constructor(
    parent: THREE.Object3D,
    private readonly linkOpacity: number,
    public style: (link: L) => LinkStyle,
  ) {
    parent.add(this.root);
  }

  /** ForceGraph3D linkThreeObject: the library's per-link object; the tube is drawn here. */
  readonly placeholder = (): THREE.Object3D => {
    this.dirty = true;
    return new THREE.Object3D();
  };

  /** ForceGraph3D linkPositionUpdate for a straight link. */
  readonly place = (link: L, start: Endpoint, end: Endpoint): boolean => {
    _tube.position.set(start.x ?? 0, start.y ?? 0, start.z ?? 0);
    _end.set(end.x ?? 0, end.y ?? 0, end.z ?? 0);
    _tube.scale.set(1, 1, _tube.position.distanceTo(_end));
    _tube.lookAt(_end);
    _tube.updateMatrix();
    let m = this.matrices.get(link);
    if (!m) {
      m = new THREE.Matrix4();
      this.matrices.set(link, m);
    }
    m.copy(_tube.matrix);
    const slot = this.slots.get(link);
    if (slot) {
      slot.bucket.mesh.setMatrixAt(slot.index, m);
      slot.bucket.mesh.instanceMatrix.needsUpdate = true;
    }
    return true;
  };

  /** Regroup once the library has digested a new link list. */
  sync(links: readonly L[]): void {
    if (this.dirty) this.restyle(links);
  }

  /** Put every live link in the bucket its current style asks for. */
  restyle(links: readonly L[]): void {
    this.dirty = false;
    const plan = new Map<string, { style: LinkStyle; links: L[] }>();
    for (const link of links) {
      if (!link.__lineObj) {
        this.slots.delete(link);
        continue;
      }
      const s = this.style(link);
      const width = roundedLinkWidth(s.width);
      if (!(width > 0)) {
        this.slots.delete(link);
        continue;
      }
      const key = `${width}|${s.color}`;
      let group = plan.get(key);
      if (!group) {
        group = { style: { color: s.color, width }, links: [] };
        plan.set(key, group);
      }
      group.links.push(link);
    }
    for (const bucket of this.buckets.values()) bucket.used = 0;
    for (const [key, group] of plan) {
      const bucket = this.bucketFor(key, group.style, group.links.length);
      if (!bucket) continue;
      group.links.forEach((link, i) => {
        bucket.mesh.setMatrixAt(i, this.matrices.get(link) ?? HIDDEN);
        this.slots.set(link, { bucket, index: i });
      });
      bucket.used = group.links.length;
    }
    for (const bucket of this.buckets.values()) {
      bucket.mesh.count = bucket.used;
      bucket.mesh.visible = bucket.used > 0;
      bucket.mesh.instanceMatrix.needsUpdate = true;
    }
  }

  private bucketFor(key: string, style: LinkStyle, need: number): Bucket | null {
    const existing = this.buckets.get(key);
    if (existing && existing.mesh.instanceMatrix.count >= need) return existing;
    const material = linkMaterial(style.color, this.linkOpacity);
    if (!material) return null;
    const capacity = Math.max(32, need, existing ? existing.mesh.instanceMatrix.count * 2 : 0);
    const mesh = new THREE.InstancedMesh(linkCylinder(style.width), material, capacity);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    // three-forcegraph draws links after the orbs; instances move every tick,
    // so a cached bounding sphere would cull them wrongly.
    mesh.renderOrder = 10;
    mesh.frustumCulled = false;
    mesh.raycast = noRaycast;
    if (existing) {
      this.root.remove(existing.mesh);
      existing.mesh.dispose();
    }
    this.root.add(mesh);
    const bucket = { mesh, used: 0 };
    this.buckets.set(key, bucket);
    return bucket;
  }

  dispose(): void {
    for (const bucket of this.buckets.values()) bucket.mesh.dispose();
    this.buckets.clear();
    this.root.removeFromParent();
  }
}
