/** Flat ring around the open note. Neighbors sit on one circle. */

export type LocalLayoutNode = {
  id: string;
  title: string;
  center: boolean;
};

export type LocalPoint = LocalLayoutNode & {
  x: number;
  y: number;
};

export function layoutLocalRing(
  nodes: LocalLayoutNode[],
  radius = 148,
): LocalPoint[] {
  const center = nodes.find((n) => n.center) ?? nodes[0];
  if (!center) return [];
  const rest = nodes.filter((n) => n.id !== center.id);
  const points: LocalPoint[] = [{ ...center, x: 0, y: 0, center: true }];
  const count = rest.length;
  rest.forEach((node, i) => {
    const angle = -Math.PI / 2 + (i * 2 * Math.PI) / Math.max(count, 1);
    points.push({
      ...node,
      center: false,
      x: Math.cos(angle) * radius,
      y: Math.sin(angle) * radius,
    });
  });
  return points;
}

/** Even grid for a vault overview. No center and no force simulation. */
export function layoutOverviewGrid(
  nodes: { id: string; title: string }[],
  gapX = 92,
  gapY = 64,
): { id: string; title: string; x: number; y: number }[] {
  const count = nodes.length;
  if (!count) return [];
  const cols = Math.ceil(Math.sqrt(count));
  const rows = Math.ceil(count / cols);
  return nodes.map((node, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    return {
      ...node,
      x: (col - (cols - 1) / 2) * gapX,
      y: (row - (rows - 1) / 2) * gapY,
    };
  });
}
