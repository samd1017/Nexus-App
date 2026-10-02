/**
 * Hard draw budget for the 3D graph. Every draw list passes through here
 * right before it reaches ForceGraph3D, whichever path built it (full note
 * graph, folder map, ego, native catalog page). Nothing past the budget is
 * ever handed to the renderer, so no vault size can paint one orb per note.
 *
 * The builders already stay far inside it (folder map 320, ego 400, small
 * vault 400 plus its missing-note ghosts); this is the ceiling that holds
 * even if one of them regresses.
 */

export const GRAPH_NODE_BUDGET = 800;
export const GRAPH_LINK_BUDGET = 2400;

type BudgetNode = { id: string; ghost?: boolean; degree?: number; kind?: string };
type BudgetLink = { source: unknown; target: unknown };

function endId(end: unknown): string {
  if (end && typeof end === "object" && "id" in end) return String((end as { id: unknown }).id);
  return String(end ?? "");
}

/**
 * Trim a draw list to the budget. Keeps the active note, then folders and
 * the "+N more" orb, then notes in builder order, then missing-note ghosts
 * by degree. Links keep those touching the active note first. Returns the
 * input untouched when it already fits.
 */
export function clampToDrawBudget<N extends BudgetNode, L extends BudgetLink>(
  data: { nodes: N[]; links: L[] },
  keepId: string | null,
  budget: { nodes: number; links: number } = {
    nodes: GRAPH_NODE_BUDGET,
    links: GRAPH_LINK_BUDGET,
  },
): { nodes: N[]; links: L[] } {
  let nodes = data.nodes;
  let links = data.links;
  if (nodes.length > budget.nodes) {
    const keep = new Set<string>();
    if (keepId && nodes.some((n) => n.id === keepId)) keep.add(keepId);
    for (const n of nodes) {
      if (keep.size >= budget.nodes) break;
      if (n.kind === "folder" || n.kind === "aggregate") keep.add(n.id);
    }
    for (const n of nodes) {
      if (keep.size >= budget.nodes) break;
      if (!n.ghost) keep.add(n.id);
    }
    if (keep.size < budget.nodes) {
      const ghosts = nodes
        .filter((n) => n.ghost && !keep.has(n.id))
        .sort((a, b) => (b.degree ?? 0) - (a.degree ?? 0));
      for (const g of ghosts) {
        if (keep.size >= budget.nodes) break;
        keep.add(g.id);
      }
    }
    nodes = nodes.filter((n) => keep.has(n.id));
    links = links.filter((l) => keep.has(endId(l.source)) && keep.has(endId(l.target)));
  }
  if (links.length > budget.links) {
    const hot: L[] = [];
    const rest: L[] = [];
    for (const l of links) {
      if (keepId && (endId(l.source) === keepId || endId(l.target) === keepId)) hot.push(l);
      else rest.push(l);
    }
    links = hot.concat(rest).slice(0, budget.links);
  }
  if (nodes === data.nodes && links === data.links) return data;
  return { nodes, links };
}

let drawnHighWater = { nodes: 0, links: 0 };
let lastDrawn = { nodes: 0, links: 0 };

export function recordDrawn(nodes: number, links: number): void {
  lastDrawn = { nodes, links };
  if (nodes > drawnHighWater.nodes) drawnHighWater = { ...drawnHighWater, nodes };
  if (links > drawnHighWater.links) drawnHighWater = { ...drawnHighWater, links };
}

export function drawnStats(): {
  last: { nodes: number; links: number };
  highWater: { nodes: number; links: number };
  budget: { nodes: number; links: number };
} {
  return {
    last: { ...lastDrawn },
    highWater: { ...drawnHighWater },
    budget: { nodes: GRAPH_NODE_BUDGET, links: GRAPH_LINK_BUDGET },
  };
}

export function resetDrawnStats(): void {
  drawnHighWater = { nodes: 0, links: 0 };
  lastDrawn = { nodes: 0, links: 0 };
}
