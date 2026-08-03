import type { Backlink, VaultNode } from "./types";
import { noteTitle } from "./types";
import { extractWikilinks, normalizeLinkTarget, wikilinkContext } from "@/lib/markdown/wikilinks";
import { buildReverseIndex, noteTargetKeys } from "./backlink-index";

export function getBacklinks(
  targetNote: VaultNode,
  nodes: Record<string, VaultNode>,
): Backlink[] {
  const index = buildReverseIndex(nodes);
  const targets = new Set(noteTargetKeys(targetNote));

  const fromIds = new Set<string>();
  for (const key of targets) {
    const list = index.get(key);
    if (!list) continue;
    for (const id of list) {
      if (id !== targetNote.id) fromIds.add(id);
    }
  }

  const out: Backlink[] = [];
  for (const fromId of fromIds) {
    const n = nodes[fromId];
    if (!n || n.kind !== "note") continue;
    const content = n.content ?? "";
    const links = extractWikilinks(content);
    // Wave 4: emit every mention from a source (not just the first)
    let mentionCount = 0;
    const mentions: Backlink[] = [];
    for (const link of links) {
      if (!targets.has(normalizeLinkTarget(link.target))) continue;
      mentionCount += 1;
      mentions.push({
        fromId: n.id,
        fromPath: n.path,
        fromTitle: noteTitle(n),
        context: wikilinkContext(content, link.start, link.end),
      });
    }
    for (const m of mentions) {
      out.push({
        ...m,
        count: mentionCount > 1 ? mentionCount : undefined,
      });
    }
  }
  return out.sort((a, b) => a.fromTitle.localeCompare(b.fromTitle));
}
