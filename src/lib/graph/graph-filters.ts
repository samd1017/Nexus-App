/**
 * Graph display filters — O(drawn) only, never a full-vault walk.
 * Used by GraphView so tag / folder / orphan / ghost filters stay cheap
 * at 100k (folder ≤320, ego ≤400).
 */

export type GraphFilterState = {
  query: string;
  showGhosts: boolean;
  orphansOnly: boolean;
  tag: string;
  folderPrefix: string;
};

export type FilterableNode = {
  id: string;
  name: string;
  path: string;
  tag?: string;
  ghost?: boolean;
  degree: number;
  kind?: "note" | "folder" | "aggregate";
};

export type FilterableLink = {
  source?: unknown;
  target?: unknown;
};

export function filtersAreIdle(f: GraphFilterState): boolean {
  return (
    !f.query.trim() &&
    f.showGhosts &&
    !f.orphansOnly &&
    !f.tag.trim() &&
    !f.folderPrefix.trim()
  );
}

export function scaleParticlesEnabled(
  noteCount: number,
  graphParticles: boolean,
  reducedMotion: boolean,
): boolean {
  if (!graphParticles || reducedMotion) return false;
  // Large vaults: folder/ego already capped — particles read as a storm.
  if (noteCount >= 400) return false;
  return true;
}

function endpointId(end: unknown): string {
  if (end && typeof end === "object" && "id" in end) {
    return String((end as { id: unknown }).id);
  }
  return String(end ?? "");
}

export function nodeMatchesFilter(
  n: FilterableNode,
  f: GraphFilterState,
): boolean {
  if (!f.showGhosts && n.ghost) return false;
  if (n.kind === "aggregate") return !f.orphansOnly && !f.tag.trim();
  if (f.orphansOnly) {
    if (n.kind === "folder" || n.ghost) return false;
    if ((n.degree | 0) > 0) return false;
  }
  const q = f.query.trim().toLowerCase();
  if (q) {
    const hay = `${n.name} ${n.path} ${n.tag ?? ""}`.toLowerCase();
    if (!hay.includes(q)) return false;
  }
  const tag = f.tag.trim().toLowerCase();
  if (tag && (n.tag ?? "").toLowerCase() !== tag) return false;
  const folder = f.folderPrefix.trim().replace(/\\/g, "/").replace(/^\/+|\/+$/g, "");
  if (folder) {
    const path = (n.path || "").replace(/\\/g, "/");
    if (path !== folder && !path.startsWith(`${folder}/`)) return false;
  }
  return true;
}

export function applyGraphFilters<
  N extends FilterableNode,
  L extends FilterableLink,
>(
  data: { nodes: N[]; links: L[] },
  filter: GraphFilterState,
  keepId: string | null = null,
): { nodes: N[]; links: L[] } {
  if (filtersAreIdle(filter)) return data;
  const keep = new Set<string>();
  for (const n of data.nodes) {
    if (nodeMatchesFilter(n, filter)) keep.add(n.id);
  }
  if (keepId) keep.add(keepId);
  const nodes = data.nodes.filter((n) => keep.has(n.id));
  const links = data.links.filter((l) => {
    const s = endpointId(l.source);
    const t = endpointId(l.target);
    return keep.has(s) && keep.has(t);
  });
  return { nodes, links };
}

/** Distinct folder prefixes from the current draw list — O(k). */
export function folderFilterOptions(
  nodes: FilterableNode[],
  limit = 16,
): string[] {
  const set = new Set<string>();
  for (const n of nodes) {
    const path = (n.path || "").replace(/\\/g, "/");
    if (n.kind === "folder" && path) {
      set.add(path);
      continue;
    }
    const slash = path.lastIndexOf("/");
    if (slash > 0) set.add(path.slice(0, slash));
  }
  return [...set].sort((a, b) => a.localeCompare(b)).slice(0, limit);
}

export function tagFilterOptions(
  nodes: FilterableNode[],
  limit = 16,
): string[] {
  const set = new Set<string>();
  for (const n of nodes) {
    if (n.tag) set.add(n.tag);
  }
  return [...set].sort((a, b) => a.localeCompare(b)).slice(0, limit);
}
