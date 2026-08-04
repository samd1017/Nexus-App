import type { Backlink, VaultNode } from "./types";
import { noteTitle } from "./types";
import {
  extractWikilinks,
  normalizeLinkTarget,
  wikilinkContext,
} from "@/lib/markdown/wikilinks";
import { buildReverseIndex, noteTargetKeys } from "./backlink-index";
import { vaultLinkIndex } from "./link-index";
import { buildWikilinkIndex, resolveWikilink } from "@/lib/graph/build-graph";

/**
 * Backlinks for a note.
 * Wave B: prefer link maps for source id discovery; body scan only for snippets.
 */
export function getBacklinks(
  targetNote: VaultNode,
  nodes: Record<string, VaultNode>,
): Backlink[] {
  const targets = new Set(noteTargetKeys(targetNote));
  const fromIds = new Set<string>();

  // Fast path: reverse map by raw targets + resolve via title index
  const widx = buildWikilinkIndex(nodes);
  const titleKeys = [
    normalizeLinkTarget(noteTitle(targetNote)),
    normalizeLinkTarget(targetNote.name),
    normalizeLinkTarget(targetNote.path),
    normalizeLinkTarget(targetNote.path.replace(/\.md$/i, "")),
  ].filter(Boolean);

  for (const key of titleKeys) {
    for (const src of vaultLinkIndex.getBacklinkSources(key)) {
      if (src !== targetNote.id) fromIds.add(src);
    }
  }
  // Wave 2: also reverse-map raw keys from noteTargetKeys (no full edge dump)
  for (const key of targets) {
    for (const src of vaultLinkIndex.getBacklinkSources(key)) {
      if (src !== targetNote.id) fromIds.add(src);
    }
  }

  // Fallback: classic reverse index when link map empty (cold open / small vault)
  if (fromIds.size === 0 && vaultLinkIndex.stats().edgeCount === 0) {
    const index = buildReverseIndex(nodes);
    for (const key of targets) {
      const list = index.get(key);
      if (!list) continue;
      for (const id of list) {
        if (id !== targetNote.id) fromIds.add(id);
      }
    }
  }

  const out: Backlink[] = [];
  for (const fromId of fromIds) {
    const n = nodes[fromId];
    if (!n || n.kind !== "note") continue;
    // Unloaded body: still list link without rich context
    if (n.content === undefined) {
      out.push({
        fromId: n.id,
        fromPath: n.path,
        fromTitle: noteTitle(n),
        context: "(body not loaded)",
      });
      continue;
    }
    const content = n.content;
    const links = extractWikilinks(content);
    let mentionCount = 0;
    const mentions: Backlink[] = [];
    for (const link of links) {
      if (!targets.has(normalizeLinkTarget(link.target))) {
        // also accept resolve match
        const dest = resolveWikilink(link.target, nodes, widx);
        if (dest?.id !== targetNote.id) continue;
      }
      mentionCount += 1;
      mentions.push({
        fromId: n.id,
        fromPath: n.path,
        fromTitle: noteTitle(n),
        context: wikilinkContext(content, link.start, link.end),
      });
    }
    if (mentions.length === 0) {
      out.push({
        fromId: n.id,
        fromPath: n.path,
        fromTitle: noteTitle(n),
        context: "",
      });
    } else {
      for (const m of mentions) {
        out.push({
          ...m,
          count: mentionCount > 1 ? mentionCount : undefined,
        });
      }
    }
  }
  return out.sort((a, b) => a.fromTitle.localeCompare(b.fromTitle));
}
