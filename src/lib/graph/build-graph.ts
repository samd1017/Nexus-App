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
  const byNorm = new Map<string, VaultNode>();
  for (const n of notes) {
    byNorm.set(normalizeLinkTarget(noteTitle(n)), n);
    byNorm.set(normalizeLinkTarget(n.path.replace(/\.md$/i, "")), n);
    byNorm.set(normalizeLinkTarget(n.path), n);
  }

  const degree = new Map<string, number>();
  const edgeSet = new Set<string>();
  const edges: GraphEdge[] = [];

  const bump = (id: string) => degree.set(id, (degree.get(id) ?? 0) + 1);

  for (const n of notes) {
    const targets = extractWikilinkTargets(n.content ?? "");
    for (const t of targets) {
      const dest = byNorm.get(normalizeLinkTarget(t));
      if (!dest || dest.id === n.id) continue;
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

export function resolveWikilink(
  target: string,
  nodes: Record<string, VaultNode>,
): VaultNode | null {
  const notes = Object.values(nodes).filter((n) => n.kind === "note");
  const norm = normalizeLinkTarget(target);
  for (const n of notes) {
    if (normalizeLinkTarget(noteTitle(n)) === norm) return n;
    if (normalizeLinkTarget(n.path.replace(/\.md$/i, "")) === norm) return n;
    if (normalizeLinkTarget(n.path) === norm) return n;
    if (normalizeLinkTarget(n.name) === norm) return n;
  }
  // partial path match
  for (const n of notes) {
    if (normalizeLinkTarget(n.path).endsWith("/" + norm)) return n;
    if (normalizeLinkTarget(n.path).endsWith(norm + ".md")) return n;
  }
  return null;
}
