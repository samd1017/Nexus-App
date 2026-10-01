import { buildWikilinkIndex, resolveWikilink } from "@/lib/graph/build-graph";
import { extractWikilinkTargets } from "@/lib/markdown/wikilinks";
import { isCanvasPath } from "@/lib/vault/canvas";
import { getDurableIndex } from "@/lib/vault/durable-index";
import { vaultLinkIndex } from "@/lib/vault/link-index";
import { extractTagsFromMarkdown } from "@/lib/vault/tags";
import { noteTitle, type VaultNode } from "@/lib/vault/types";

export const OVERVIEW_CAP = 80;

export type OverviewNote = {
  id: string;
  title: string;
  path: string;
  folder: string;
  tags: string[];
};

export type OverviewEdge = { source: string; target: string };

export const OVERVIEW_GROUP_COLORS = [
  "#5b8def",
  "#3dbe8b",
  "#e0a045",
  "#d46a8c",
  "#8b7cf6",
  "#4ec4d4",
  "#c4b15a",
];

export function overviewGroupKey(note: OverviewNote, mode: "folder" | "tag"): string {
  if (mode === "folder") return note.folder || "(vault root)";
  return note.tags[0] || "(no tag)";
}

export function overviewGroupColor(key: string, keys: readonly string[]): string {
  const index = Math.max(0, keys.indexOf(key));
  return OVERVIEW_GROUP_COLORS[index % OVERVIEW_GROUP_COLORS.length] ?? "#8b7cf6";
}

function folderOf(path: string): string {
  const i = path.lastIndexOf("/");
  return i <= 0 ? "" : path.slice(0, i);
}

function inFolder(path: string, prefix: string): boolean {
  const pre = prefix.trim().replace(/\\/g, "/").replace(/^\/+|\/+$/g, "").toLowerCase();
  if (!pre) return true;
  const p = path.replace(/\\/g, "/").toLowerCase();
  return p === pre || p.startsWith(`${pre}/`);
}

export function tagsForNote(node: VaultNode): string[] {
  const tags = new Set<string>();
  if (node.kind === "note" && typeof node.content === "string") {
    for (const tag of extractTagsFromMarkdown(node.content)) tags.add(tag.toLowerCase());
  }
  const meta = getDurableIndex()?.getNoteMeta(node.id);
  for (const tag of meta?.tags ?? []) tags.add(String(tag).replace(/^#/, "").toLowerCase());
  return [...tags];
}

function tagNeedle(raw: string): string {
  return raw.trim().replace(/^#/, "").toLowerCase();
}

/** Notes in the vault that match a folder prefix and one tag. Canvas files stay off this map. */
export function selectOverviewNotes(
  nodes: Record<string, VaultNode>,
  opts?: { folder?: string; tag?: string; cap?: number },
): { notes: OverviewNote[]; total: number; truncated: boolean } {
  const cap = opts?.cap ?? OVERVIEW_CAP;
  const needle = tagNeedle(opts?.tag ?? "");
  const matched: OverviewNote[] = [];
  for (const node of Object.values(nodes)) {
    if (node.kind !== "note" || !node.path || isCanvasPath(node.path)) continue;
    if (!inFolder(node.path, opts?.folder ?? "")) continue;
    const tags = tagsForNote(node);
    if (needle && !tags.includes(needle)) continue;
    matched.push({
      id: node.id,
      title: noteTitle(node),
      path: node.path,
      folder: folderOf(node.path),
      tags,
    });
  }
  matched.sort((a, b) => a.path.localeCompare(b.path));
  return {
    notes: matched.slice(0, cap),
    total: matched.length,
    truncated: matched.length > cap,
  };
}

/** Links among the selected notes only. */
export function overviewEdges(
  nodes: Record<string, VaultNode>,
  notes: OverviewNote[],
): OverviewEdge[] {
  const keep = new Set(notes.map((n) => n.id));
  const index = buildWikilinkIndex(nodes);
  const seen = new Set<string>();
  const edges: OverviewEdge[] = [];
  for (const note of notes) {
    const node = nodes[note.id];
    const targets =
      node?.kind === "note" && typeof node.content === "string"
        ? extractWikilinkTargets(node.content)
        : (vaultLinkIndex.outgoing.get(note.id) ?? []);
    for (const target of targets) {
      const dest = resolveWikilink(target, nodes, index);
      if (!dest || dest.kind !== "note" || !keep.has(dest.id) || dest.id === note.id) continue;
      const key = [note.id, dest.id].sort().join("→");
      if (seen.has(key)) continue;
      seen.add(key);
      edges.push({ source: note.id, target: dest.id });
    }
  }
  return edges;
}
