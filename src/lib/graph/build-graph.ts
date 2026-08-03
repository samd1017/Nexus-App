import type { GraphEdge, GraphNode, VaultNode } from "@/lib/vault/types";
import { noteTitle } from "@/lib/vault/types";
import { extractWikilinkTargets } from "@/lib/markdown/wikilinks";
import { normalizeLinkTarget } from "@/lib/markdown/wikilinks";
import { previewSnippet } from "@/lib/markdown/serialize";

export function buildGraph(nodes: Record<string, VaultNode>): {
  nodes: GraphNode[];
  edges: GraphEdge[];
} {
  const notes = Object.values(nodes).filter((n) => n.kind === "note");
  const degree = new Map<string, number>();
  const edgeSet = new Set<string>();
  const edges: GraphEdge[] = [];

  const bump = (id: string) => degree.set(id, (degree.get(id) ?? 0) + 1);

  for (const n of notes) {
    const targets = extractWikilinkTargets(n.content ?? "");
    for (const t of targets) {
      const dest = resolveWikilink(t, nodes);
      if (!dest || dest.kind !== "note" || dest.id === n.id) continue;
      const key = [n.id, dest.id].sort().join("→");
      if (edgeSet.has(key)) continue;
      edgeSet.add(key);
      edges.push({ source: n.id, target: dest.id });
      bump(n.id);
      bump(dest.id);
    }
  }

  const gNodes: GraphNode[] = notes.map((n) => ({
    id: n.id,
    title: noteTitle(n),
    path: n.path,
    degree: degree.get(n.id) ?? 0,
    preview: previewSnippet(n.content ?? "", 100),
  }));

  return { nodes: gNodes, edges };
}

/**
 * Resolve a wikilink target to a note or folder.
 * Matches title, filename, full path, and partial path suffixes.
 */
export function resolveWikilink(
  target: string,
  nodes: Record<string, VaultNode>,
): VaultNode | null {
  const all = Object.values(nodes);
  const notes = all.filter((n) => n.kind === "note");
  const folders = all.filter((n) => n.kind === "folder");
  const norm = normalizeLinkTarget(target);
  if (!norm) return null;

  const scoreNote = (n: VaultNode): number => {
    const title = normalizeLinkTarget(noteTitle(n));
    const path = normalizeLinkTarget(n.path);
    const pathNo = normalizeLinkTarget(n.path.replace(/\.md$/i, ""));
    const name = normalizeLinkTarget(n.name);
    if (title === norm) return 100;
    if (name === norm || name === `${norm}.md`) return 95;
    if (pathNo === norm || path === norm) return 90;
    if (pathNo.endsWith("/" + norm)) return 80;
    if (path.endsWith(norm + ".md")) return 75;
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
