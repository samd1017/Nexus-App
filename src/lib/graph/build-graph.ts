import type { GraphEdge, GraphNode, VaultNode } from "@/lib/vault/types";
import { noteTitle } from "@/lib/vault/types";
import { extractWikilinkTargets } from "@/lib/markdown/wikilinks";
import { normalizeLinkTarget } from "@/lib/markdown/wikilinks";
import { previewSnippet } from "@/lib/markdown/serialize";

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

  // Notes first so titles win over folder name collisions
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

export function buildGraph(nodes: Record<string, VaultNode>): {
  nodes: GraphNode[];
  edges: GraphEdge[];
} {
  const notes = Object.values(nodes).filter((n) => n.kind === "note");
  const degree = new Map<string, number>();
  const edgeSet = new Set<string>();
  const edges: GraphEdge[] = [];
  const index = buildWikilinkIndex(nodes);

  /** Unresolved wikilink targets → ghost node meta */
  const ghosts = new Map<
    string,
    { id: string; title: string; ghostTarget: string; sources: string[] }
  >();

  const bump = (id: string) => degree.set(id, (degree.get(id) ?? 0) + 1);

  for (const n of notes) {
    const targets = extractWikilinkTargets(n.content ?? "");
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
      if (dest) continue; // folder or self — not a ghost

      // Ghost: unresolved wikilink target
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
    });
  }

  return { nodes: gNodes, edges };
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

  // Exact hit via index (title, name, full path)
  const exactId = idx.get(norm);
  if (exactId && nodes[exactId]) return nodes[exactId];

  // Path-suffix and soft partial matches (uncommon; linear scan only on miss)
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

  if (best && bestScore >= 40) return best;
  return null;
}
