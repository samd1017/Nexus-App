/**
 * Note-select policy for GraphView — keep folder maps stable and tame camera
 * motion when the active note changes. Pure helpers (no THREE / React).
 *
 * Folder browse must not tear down graphData() on select: highlight + light
 * edge restyle only. Ego may rebuild a capped neighborhood, but hops stay
 * bounded and rapid clicks coalesce.
 */

export const EGO_MAX_HOPS = 2;
export const EGO_MAX_NODES = 400;
export const EGO_REBUILD_DEBOUNCE_MS = 110;

export const FLY_DEBOUNCE_MS = 130;
export const USER_INTERACT_QUIET_MS = 520;

export const FLY_MS = {
  folder: 220,
  ego: 280,
  full: 280,
  fullscreenBonus: 40,
} as const;

export type GraphSelectViewMode = "full" | "folder" | "ego";

export type GraphSelectFlyDecision = {
  fly: boolean;
  durationMs: number;
  reason:
    | "no-active"
    | "first-mount"
    | "reduced-motion"
    | "user-interacting"
    | "recent-interact"
    | "not-visible"
    | "already-framed"
    | "focus-active";
};

export function clampEgoHops(hops: number): number {
  if (!Number.isFinite(hops) || hops < 0) return 0;
  return Math.min(EGO_MAX_HOPS, Math.floor(hops));
}

export function clampEgoNodeCap(maxNodes: number): number {
  if (!Number.isFinite(maxNodes) || maxNodes < 1) return 1;
  return Math.min(EGO_MAX_NODES, Math.floor(maxNodes));
}

export function composeGraphTick(input: {
  large: boolean;
  scope: "vault" | "folder" | "ego";
  structureGeneration: number;
  contentGeneration: number;
  linkGeneration: number;
  browsePath: string;
  activeNoteId: string;
  noteCount: number;
}): string {
  const {
    large,
    scope,
    structureGeneration: struct,
    contentGeneration: content,
    linkGeneration: links,
    browsePath: browse,
    activeNoteId: active,
    noteCount: n,
  } = input;
  if (large && scope !== "ego") {
    // Folder / vault map: active note must not invalidate the tick.
    return `f:${struct}:${browse}:${scope}:${n}`;
  }
  if (large) {
    return `e:${links}:${active}:${n}`;
  }
  return `full:${struct}:${content}:${links}`;
}

export function folderLevelFingerprint(
  childSignature: string,
  browsePath: string,
  scope: string,
): string {
  return `folder:${childSignature}:${browsePath}:${scope}`;
}

export function egoStructureKey(linkGeneration: number, centerId: string): string {
  return `ego:${linkGeneration}:${centerId}`;
}

function linkEndpointId(end: unknown): string {
  if (end && typeof end === "object" && "id" in end) {
    return String((end as { id: unknown }).id);
  }
  return String(end ?? "");
}

/** Stable topology key — same ids/edges ⇒ do not re-feed ForceGraph3D. */
export function graphTopologyKey(
  nodes: Array<{ id: string }>,
  links: Array<{ source?: unknown; target?: unknown }>,
): string {
  const ids = nodes.map((n) => n.id).sort();
  const edges: string[] = [];
  for (const l of links) {
    const s = linkEndpointId(l.source);
    const t = linkEndpointId(l.target);
    edges.push(s < t ? `${s}>${t}` : `${t}>${s}`);
  }
  edges.sort();
  return `${ids.join(",")}|${edges.join(",")}`;
}

export function shouldReplaceGraphData(
  prevKey: string | null | undefined,
  nextKey: string,
): boolean {
  if (!prevKey) return true;
  return prevKey !== nextKey;
}

export function mergePreservedPositions<
  T extends { id: string; x?: number; y?: number; z?: number },
>(prev: T[] | null | undefined, next: T[]): T[] {
  if (!prev?.length) return next;
  const byId = new Map<string, T>();
  for (const n of prev) byId.set(n.id, n);
  for (const n of next) {
    const p = byId.get(n.id);
    if (p && p.x != null && p.y != null && p.z != null) {
      n.x = p.x;
      n.y = p.y;
      n.z = p.z;
    }
  }
  return next;
}

export function flyDurationMs(
  viewMode: GraphSelectViewMode,
  fullscreen: boolean,
): number {
  const base =
    viewMode === "folder"
      ? FLY_MS.folder
      : viewMode === "ego"
        ? FLY_MS.ego
        : FLY_MS.full;
  return fullscreen ? base + FLY_MS.fullscreenBonus : base;
}

export function isAlreadyFramed(
  cam: { x: number; y: number; z: number },
  lookAt: { x: number; y: number; z: number },
  targetDist: number,
): boolean {
  const dist = Math.hypot(cam.x - lookAt.x, cam.y - lookAt.y, cam.z - lookAt.z);
  if (dist < 1) return true;
  const want = Math.max(1, targetDist);
  const ratio = dist / want;
  return ratio > 0.72 && ratio < 1.38;
}

export function decideActiveNoteFly(opts: {
  viewMode: GraphSelectViewMode;
  activeNoteId: string | null;
  nodeIsVisible: boolean;
  userInteracting: boolean;
  interactedRecently: boolean;
  reducedMotion: boolean;
  isFirstActive: boolean;
  alreadyFramed?: boolean;
  fullscreen?: boolean;
}): GraphSelectFlyDecision {
  if (!opts.activeNoteId) {
    return { fly: false, durationMs: 0, reason: "no-active" };
  }
  if (opts.isFirstActive) {
    return { fly: false, durationMs: 0, reason: "first-mount" };
  }
  if (opts.reducedMotion) {
    return { fly: false, durationMs: 0, reason: "reduced-motion" };
  }
  if (opts.userInteracting) {
    return { fly: false, durationMs: 0, reason: "user-interacting" };
  }
  if (opts.interactedRecently) {
    return { fly: false, durationMs: 0, reason: "recent-interact" };
  }
  if (!opts.nodeIsVisible) {
    return { fly: false, durationMs: 0, reason: "not-visible" };
  }
  if (opts.alreadyFramed) {
    return { fly: false, durationMs: 0, reason: "already-framed" };
  }
  return {
    fly: true,
    durationMs: flyDurationMs(opts.viewMode, !!opts.fullscreen),
    reason: "focus-active",
  };
}

export function recentlyInteracted(
  lastInteractAt: number,
  now: number,
  quietMs = USER_INTERACT_QUIET_MS,
): boolean {
  return now - lastInteractAt < quietMs;
}
