import type {
  GraphEdge,
  GraphNode,
  GraphScopeMode,
  VaultNode,
} from "@/lib/vault/types";
import { noteTitle } from "@/lib/vault/types";
import { extractWikilinkTargets } from "@/lib/markdown/wikilinks";
import { normalizeLinkTarget } from "@/lib/markdown/wikilinks";
import { previewSnippet } from "@/lib/markdown/serialize";
import { vaultLinkIndex } from "@/lib/vault/link-index";
import {
  shouldUseEgoGraph,
  shouldUseFolderGraph,
  getScaleFlags,
} from "@/lib/vault/scale-flags";
import {
  buildFolderGraph,
  folderIdFromBrowsePath,
  type FolderGraphStats,
} from "@/lib/graph/folder-graph";
import {
  ensureVaultIndex,
  type VaultStructuralIndex,
} from "@/lib/vault/indexes";

export function parentFolderOf(path: string): string {
  const parts = path.replace(/\\/g, "/").split("/").filter(Boolean);
  parts.pop();
  return parts.join("/");
}

/**
 * Map-based wikilink index: normalized title / name / path → node id.
 * Built once per resolve pass so graph builds stay O(links) not O(links × notes).
 */
export function buildWikilinkIndex(
  nodes: Record<string, VaultNode>,
): Map<string, string> {
  const index = new Map<string, string>();
  const setIfAbsent = (key: string, id: string) => {
    if (key && !index.has(key)) index.set(key, id);
  };

  for (const n of Object.values(nodes)) {
    if (n.kind !== "note") continue;
    const title = normalizeLinkTarget(noteTitle(n));
    const name = normalizeLinkTarget(n.name);
    const path = normalizeLinkTarget(n.path);
    const pathNo = normalizeLinkTarget(n.path.replace(/\.md$/i, ""));
    setIfAbsent(title, n.id);
    setIfAbsent(name, n.id);
    setIfAbsent(pathNo, n.id);
    setIfAbsent(path, n.id);
  }

  for (const f of Object.values(nodes)) {
    if (f.kind !== "folder") continue;
    setIfAbsent(normalizeLinkTarget(f.name), f.id);
    setIfAbsent(normalizeLinkTarget(f.path), f.id);
  }

  return index;
}

function targetsForNote(n: VaultNode): string[] {
  if (vaultLinkIndex.outgoing.has(n.id)) {
    return vaultLinkIndex.getOutgoing(n.id);
  }
  if (n.content !== undefined) return extractWikilinkTargets(n.content);
  return [];
}

/**
 * Wave B — Resolved id adjacency from link maps (and loaded bodies as fallback).
 * Used for map-first ego without full edge materialization.
 */
export function buildResolvedAdjacency(
  nodes: Record<string, VaultNode>,
  index?: Map<string, string>,
): {
  out: Map<string, string[]>;
  inn: Map<string, string[]>;
  wikilinkIndex: Map<string, string>;
} {
  const wikilinkIndex = index ?? buildWikilinkIndex(nodes);
  const out = new Map<string, string[]>();
  const inn = new Map<string, string[]>();
  const add = (map: Map<string, string[]>, k: string, v: string) => {
    let list = map.get(k);
    if (!list) {
      list = [];
      map.set(k, list);
    }
    if (!list.includes(v)) list.push(v);
  };

  for (const n of Object.values(nodes)) {
    if (n.kind !== "note") continue;
    const targets = targetsForNote(n);
    for (const t of targets) {
      const dest = resolveWikilink(t, nodes, wikilinkIndex);
      if (dest && dest.kind === "note" && dest.id !== n.id) {
        add(out, n.id, dest.id);
        add(inn, dest.id, n.id);
      }
    }
  }
  return { out, inn, wikilinkIndex };
}

/**
 * Wave 2 — Ego subgraph from link maps only (2 hops default).
 * BFS from center using vaultLinkIndex; does NOT build full-vault adjacency.
 */
export function buildEgoGraph(
  nodes: Record<string, VaultNode>,
  centerId: string,
  hops = 2,
): {
  nodes: GraphNode[];
  edges: GraphEdge[];
  ego: true;
} {
  const widx = buildWikilinkIndex(nodes);
  const resolveOut = (id: string): string[] => {
    const targets = targetsForNote(nodes[id] ?? ({} as VaultNode));
    const dests: string[] = [];
    for (const t of targets) {
      const dest = resolveWikilink(t, nodes, widx);
      if (dest && dest.kind === "note" && dest.id !== id) dests.push(dest.id);
    }
    return dests;
  };
  /** Reverse neighbors: only resolve reverse-map keys that hit this note */
  const reverseFor = (id: string): string[] => {
    const n = nodes[id];
    if (!n || n.kind !== "note") return [];
    const keys = [
      normalizeLinkTarget(noteTitle(n)),
      normalizeLinkTarget(n.name),
      normalizeLinkTarget(n.path),
      normalizeLinkTarget(n.path.replace(/\.md$/i, "")),
    ].filter(Boolean);
    const srcs = new Set<string>();
    for (const key of keys) {
      for (const src of vaultLinkIndex.getBacklinkSources(key)) {
        if (src !== id) srcs.add(src);
      }
    }
    return [...srcs];
  };

  const keep = new Set<string>([centerId]);
  let frontier = [centerId];
  const outLocal = new Map<string, string[]>();
  for (let h = 0; h < hops; h++) {
    const next: string[] = [];
    for (const id of frontier) {
      if (!nodes[id]) continue;
      const outs = resolveOut(id);
      outLocal.set(id, outs);
      for (const x of outs) {
        if (!keep.has(x)) {
          keep.add(x);
          next.push(x);
        }
      }
      for (const x of reverseFor(id)) {
        if (!keep.has(x)) {
          keep.add(x);
          next.push(x);
        }
        // ensure reverse edge appears when we materialize
        const list = outLocal.get(x) ?? resolveOut(x);
        outLocal.set(x, list);
      }
    }
    frontier = next;
  }
  // Ensure outs for all kept nodes
  for (const id of keep) {
    if (!outLocal.has(id)) outLocal.set(id, resolveOut(id));
  }

  const degree = new Map<string, number>();
  const edges: GraphEdge[] = [];
  const edgeSet = new Set<string>();
  for (const id of keep) {
    for (const dest of outLocal.get(id) ?? []) {
      if (!keep.has(dest)) continue;
      const key = [id, dest].sort().join("→");
      if (edgeSet.has(key)) continue;
      edgeSet.add(key);
      edges.push({ source: id, target: dest });
      degree.set(id, (degree.get(id) ?? 0) + 1);
      degree.set(dest, (degree.get(dest) ?? 0) + 1);
    }
  }

  const gNodes: GraphNode[] = [];
  for (const id of keep) {
    const n = nodes[id];
    if (!n || n.kind !== "note") continue;
    gNodes.push({
      id: n.id,
      title: noteTitle(n),
      path: n.path,
      degree: degree.get(n.id) ?? 0,
      preview: previewSnippet(n.content ?? "", 100),
      folder: parentFolderOf(n.path),
      kind: "note",
    });
  }

  return { nodes: gNodes, edges, ego: true };
}

export function buildGraph(
  nodes: Record<string, VaultNode>,
  opts?: { egoCenterId?: string | null; forceFull?: boolean },
): {
  nodes: GraphNode[];
  edges: GraphEdge[];
  ego?: boolean;
} {
  const notes = Object.values(nodes).filter((n) => n.kind === "note");
  let center = opts?.egoCenterId ?? null;
  // Large vaults: ego from active (or most-recent) center so we never
  // materialize hundreds of thousands of orbs. Small vaults: full graph.
  // When folder graph is enabled, product path uses resolveGraphData instead;
  // keep buildGraph ego fallback when folderGraph kill-switch is off.
  if (
    !center &&
    !opts?.forceFull &&
    notes.length > 0 &&
    shouldUseEgoGraph(notes.length) &&
    !shouldUseFolderGraph(notes.length)
  ) {
    let best = notes[0];
    for (const n of notes) {
      if ((n.mtime | 0) > (best.mtime | 0)) best = n;
    }
    center = best.id;
  }
  const useEgo =
    !opts?.forceFull &&
    !!center &&
    shouldUseEgoGraph(notes.length) &&
    !shouldUseFolderGraph(notes.length);

  // Wave B: map-first ego — never materialize all vault edges first
  if (useEgo && center && nodes[center]) {
    return buildEgoGraph(nodes, center, 2);
  }

  const degree = new Map<string, number>();
  const edgeSet = new Set<string>();
  const edges: GraphEdge[] = [];
  const index = buildWikilinkIndex(nodes);

  const ghosts = new Map<
    string,
    { id: string; title: string; ghostTarget: string; sources: string[] }
  >();

  const bump = (id: string) => degree.set(id, (degree.get(id) ?? 0) + 1);

  for (const n of notes) {
    const targets = targetsForNote(n);
    for (const t of targets) {
      const dest = resolveWikilink(t, nodes, index);
      if (dest && dest.kind === "note" && dest.id !== n.id) {
        const key = [n.id, dest.id].sort().join("→");
        if (edgeSet.has(key)) continue;
        edgeSet.add(key);
        edges.push({ source: n.id, target: dest.id });
        bump(n.id);
        bump(dest.id);
        continue;
      }
      if (dest) continue;

      const norm = normalizeLinkTarget(t);
      if (!norm) continue;
      const gid = `ghost:${norm}`;
      let g = ghosts.get(gid);
      if (!g) {
        g = {
          id: gid,
          title: t.trim().replace(/\.md$/i, "") || norm,
          ghostTarget: t.trim(),
          sources: [],
        };
        ghosts.set(gid, g);
      }
      if (!g.sources.includes(n.id)) g.sources.push(n.id);
      const gKey = [n.id, gid].sort().join("→");
      if (edgeSet.has(gKey)) continue;
      edgeSet.add(gKey);
      edges.push({ source: n.id, target: gid });
      bump(n.id);
      bump(gid);
    }
  }

  const gNodes: GraphNode[] = notes.map((n) => ({
    id: n.id,
    title: noteTitle(n),
    path: n.path,
    degree: degree.get(n.id) ?? 0,
    preview: previewSnippet(n.content ?? "", 100),
    folder: parentFolderOf(n.path),
    kind: "note" as const,
  }));

  for (const g of ghosts.values()) {
    gNodes.push({
      id: g.id,
      title: g.title,
      path: "",
      degree: degree.get(g.id) ?? g.sources.length,
      preview: "Missing note — click to create",
      folder: "",
      ghost: true,
      ghostTarget: g.ghostTarget,
      kind: "note",
    });
  }

  return { nodes: gNodes, edges };
}

export type GraphViewMode = "full" | "folder" | "ego";

export type ResolveGraphDataOpts = {
  noteCount: number;
  activeNoteId: string | null;
  graphBrowsePath: string;
  graphScopeMode: GraphScopeMode;
  forceFull?: boolean;
  maxFolderNodes?: number;
  structuralIndex?: VaultStructuralIndex;
};

export type GraphResolveStats = {
  vaultNoteCount: number;
  shownNoteCount: number;
  shownFolderCount: number;
  linkCount: number;
  ghostCount: number;
  levelPath: string;
  omittedCount: number;
  isPartialVault: boolean;
  childFolderCount: number;
  childNoteCount: number;
  capped: boolean;
};

export type ResolvedGraphData = {
  mode: GraphViewMode;
  nodes: GraphNode[];
  edges: GraphEdge[];
  ego?: boolean;
  capped: boolean;
  stats: GraphResolveStats;
  folderStats?: FolderGraphStats;
};

/**
 * Single facade for GraphView — derives display mode (never stored).
 */
export function resolveGraphData(
  nodes: Record<string, VaultNode>,
  opts: ResolveGraphDataOpts,
): ResolvedGraphData {
  const noteCount =
    opts.noteCount ||
    Object.values(nodes).filter((n) => n.kind === "note").length;
  const vaultNoteCount = noteCount;
  const flags = getScaleFlags();
  const folderEnabled = flags.folderGraph;
  const large = shouldUseFolderGraph(noteCount) || shouldUseEgoGraph(noteCount);

  // Small vaults / tests: full note graph
  if (opts.forceFull || !large || noteCount < (flags.folderGraphMinNotes || 400)) {
    const g = buildGraph(nodes, { forceFull: true });
    const ghostCount = g.nodes.filter((n) => n.ghost).length;
    const shownNoteCount = g.nodes.filter((n) => !n.ghost).length;
    return {
      mode: "full",
      nodes: g.nodes,
      edges: g.edges,
      capped: false,
      stats: {
        vaultNoteCount,
        shownNoteCount,
        shownFolderCount: 0,
        linkCount: g.edges.filter((e) => {
          const s = e.source;
          const t = e.target;
          return !String(s).startsWith("ghost:") && !String(t).startsWith("ghost:");
        }).length,
        ghostCount,
        levelPath: "",
        omittedCount: 0,
        isPartialVault: false,
        childFolderCount: 0,
        childNoteCount: 0,
        capped: false,
      },
    };
  }

  // Large + ego intent + active note
  if (
    opts.graphScopeMode === "ego" &&
    opts.activeNoteId &&
    nodes[opts.activeNoteId]?.kind === "note"
  ) {
    const g = buildEgoGraph(nodes, opts.activeNoteId, 2);
    return {
      mode: "ego",
      nodes: g.nodes,
      edges: g.edges,
      ego: true,
      capped: false,
      stats: {
        vaultNoteCount,
        shownNoteCount: g.nodes.length,
        shownFolderCount: 0,
        linkCount: g.edges.length,
        ghostCount: 0,
        levelPath: "",
        omittedCount: 0,
        isPartialVault: g.nodes.length < vaultNoteCount,
        childFolderCount: 0,
        childNoteCount: 0,
        capped: false,
      },
    };
  }

  // Folder browse (default for large vaults when folder graph on)
  if (folderEnabled) {
    const index = opts.structuralIndex ?? ensureVaultIndex(nodes);
    const levelId = folderIdFromBrowsePath(
      nodes,
      index,
      opts.graphBrowsePath || "",
    );
    const fg = buildFolderGraph(nodes, index, {
      levelFolderId: levelId,
      maxNodes: opts.maxFolderNodes ?? flags.folderMaxNodes,
    });
    const shownFolderCount = fg.nodes.filter((n) => n.kind === "folder").length;
    const shownNoteCount = fg.nodes.filter(
      (n) => n.kind === "note" || (!n.kind && !n.aggregate),
    ).length;
    // exclude aggregates from note count
    const realNotes = fg.nodes.filter((n) => n.kind === "note").length;
    return {
      mode: "folder",
      nodes: fg.nodes,
      edges: fg.edges,
      capped: fg.stats.capped,
      folderStats: fg.stats,
      stats: {
        vaultNoteCount,
        shownNoteCount: realNotes,
        shownFolderCount,
        linkCount: 0,
        ghostCount: 0,
        levelPath: fg.stats.levelPath,
        omittedCount: fg.stats.omittedCount,
        isPartialVault: true,
        childFolderCount: fg.stats.childFolderCount,
        childNoteCount: fg.stats.childNoteCount,
        capped: fg.stats.capped,
      },
    };
  }

  // Kill switch: folderGraph false → ego fallback
  let center = opts.activeNoteId;
  if (!center || !nodes[center]) {
    const notes = Object.values(nodes).filter((n) => n.kind === "note");
    let best = notes[0];
    for (const n of notes) {
      if (n && best && (n.mtime | 0) > (best.mtime | 0)) best = n;
    }
    center = best?.id ?? null;
  }
  if (center && nodes[center]) {
    const g = buildEgoGraph(nodes, center, 2);
    return {
      mode: "ego",
      nodes: g.nodes,
      edges: g.edges,
      ego: true,
      capped: false,
      stats: {
        vaultNoteCount,
        shownNoteCount: g.nodes.length,
        shownFolderCount: 0,
        linkCount: g.edges.length,
        ghostCount: 0,
        levelPath: "",
        omittedCount: 0,
        isPartialVault: g.nodes.length < vaultNoteCount,
        childFolderCount: 0,
        childNoteCount: 0,
        capped: false,
      },
    };
  }

  return {
    mode: "full",
    nodes: [],
    edges: [],
    capped: false,
    stats: {
      vaultNoteCount,
      shownNoteCount: 0,
      shownFolderCount: 0,
      linkCount: 0,
      ghostCount: 0,
      levelPath: "",
      omittedCount: 0,
      isPartialVault: false,
      childFolderCount: 0,
      childNoteCount: 0,
      capped: false,
    },
  };
}

/**
 * Resolve a wikilink target to a note or folder.
 * Uses an optional prebuilt index for exact title/path matches;
 * falls back to suffix / partial matching for fuzzy targets.
 */
export function resolveWikilink(
  target: string,
  nodes: Record<string, VaultNode>,
  index?: Map<string, string>,
): VaultNode | null {
  const norm = normalizeLinkTarget(target);
  if (!norm) return null;

  const idx = index ?? buildWikilinkIndex(nodes);

  const exactId = idx.get(norm);
  if (exactId && nodes[exactId]) return nodes[exactId];

  const notes = Object.values(nodes).filter((n) => n.kind === "note");
  const folders = Object.values(nodes).filter((n) => n.kind === "folder");

  const scoreNote = (n: VaultNode): number => {
    const title = normalizeLinkTarget(noteTitle(n));
    const path = normalizeLinkTarget(n.path);
    const pathNo = normalizeLinkTarget(n.path.replace(/\.md$/i, ""));
    if (pathNo.endsWith("/" + norm)) return 80;
    if (path.endsWith(norm + ".md") || pathNo.endsWith(norm)) return 75;
    if (title.includes(norm) && norm.length >= 3) return 40;
    return 0;
  };

  let best: VaultNode | null = null;
  let bestScore = 0;
  for (const n of notes) {
    const s = scoreNote(n);
    if (s > bestScore) {
      bestScore = s;
      best = n;
    }
  }
  if (best && bestScore >= 75) return best;

  for (const f of folders) {
    const name = normalizeLinkTarget(f.name);
    const path = normalizeLinkTarget(f.path);
    if (name === norm || path === norm || path.endsWith("/" + norm)) {
      return f;
    }
  }

  return null;
}
