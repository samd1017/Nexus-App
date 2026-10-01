import { layoutOverviewGrid } from "@/lib/graph/local-layout";

export type OverviewForce = {
  /** Pull toward the middle, 0–100. */
  center: number;
  /** Preferred length of a link. */
  link: number;
  /** Push nodes apart, 0–100. */
  repulsion: number;
};

export const DEFAULT_OVERVIEW_FORCE: OverviewForce = {
  center: 35,
  link: 140,
  repulsion: 45,
};

/**
 * A short force pass seeded by the overview grid.
 * Same inputs always land in the same places.
 */
export function layoutOverviewForces(
  nodes: { id: string; title: string }[],
  edges: { source: string; target: string }[],
  force: OverviewForce,
): { id: string; title: string; x: number; y: number }[] {
  const start = layoutOverviewGrid(nodes);
  if (start.length <= 1) return start;
  const pos = new Map(start.map((point) => [point.id, { x: point.x, y: point.y }]));
  const ids = start.map((point) => point.id);
  const centerK = Math.max(0, Math.min(100, force.center)) / 100;
  const linkDist = Math.max(24, force.link);
  const repel = Math.max(0, force.repulsion) * 90;
  for (let step = 0; step < 40; step++) {
    const disp = new Map(ids.map((id) => [id, { x: 0, y: 0 }]));
    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < ids.length; j++) {
        const a = pos.get(ids[i]);
        const b = pos.get(ids[j]);
        if (!a || !b) continue;
        let dx = a.x - b.x;
        let dy = a.y - b.y;
        const dist = Math.hypot(dx, dy) || 0.01;
        const push = repel / (dist * dist);
        dx /= dist;
        dy /= dist;
        const da = disp.get(ids[i]);
        const db = disp.get(ids[j]);
        if (!da || !db) continue;
        da.x += dx * push;
        da.y += dy * push;
        db.x -= dx * push;
        db.y -= dy * push;
      }
    }
    for (const edge of edges) {
      const a = pos.get(edge.source);
      const b = pos.get(edge.target);
      const da = disp.get(edge.source);
      const db = disp.get(edge.target);
      if (!a || !b || !da || !db) continue;
      let dx = b.x - a.x;
      let dy = b.y - a.y;
      const dist = Math.hypot(dx, dy) || 0.01;
      const delta = (dist - linkDist) * 0.12;
      dx /= dist;
      dy /= dist;
      da.x += dx * delta;
      da.y += dy * delta;
      db.x -= dx * delta;
      db.y -= dy * delta;
    }
    for (const id of ids) {
      const point = pos.get(id);
      const delta = disp.get(id);
      if (!point || !delta) continue;
      delta.x -= point.x * centerK * 0.2;
      delta.y -= point.y * centerK * 0.2;
      point.x += delta.x * 0.85;
      point.y += delta.y * 0.85;
    }
  }
  return start.map((node) => {
    const point = pos.get(node.id);
    return { ...node, x: point?.x ?? 0, y: point?.y ?? 0 };
  });
}

export function meanRadius(points: { x: number; y: number }[]): number {
  if (!points.length) return 0;
  const sum = points.reduce((n, point) => n + Math.hypot(point.x, point.y), 0);
  return sum / points.length;
}

export function meanPairDistance(points: { x: number; y: number }[]): number {
  if (points.length < 2) return 0;
  let sum = 0;
  let count = 0;
  for (let i = 0; i < points.length; i++) {
    for (let j = i + 1; j < points.length; j++) {
      const a = points[i];
      const b = points[j];
      if (!a || !b) continue;
      sum += Math.hypot(a.x - b.x, a.y - b.y);
      count += 1;
    }
  }
  return count ? sum / count : 0;
}
