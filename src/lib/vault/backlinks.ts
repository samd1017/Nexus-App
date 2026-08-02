import type { Backlink, VaultNode } from "./types";
import { noteTitle } from "./types";
import { extractWikilinks, normalizeLinkTarget, wikilinkContext } from "@/lib/markdown/wikilinks";

export function getBacklinks(
  targetNote: VaultNode,
  nodes: Record<string, VaultNode>,
): Backlink[] {
  const targets = new Set([
    normalizeLinkTarget(noteTitle(targetNote)),
    normalizeLinkTarget(targetNote.path.replace(/\.md$/i, "")),
    normalizeLinkTarget(targetNote.path),
    normalizeLinkTarget(targetNote.name),
  ]);

  const out: Backlink[] = [];
  for (const n of Object.values(nodes)) {
    if (n.kind !== "note" || n.id === targetNote.id) continue;
    const content = n.content ?? "";
    const links = extractWikilinks(content);
    for (const link of links) {
      if (!targets.has(normalizeLinkTarget(link.target))) continue;
      out.push({
        fromId: n.id,
        fromPath: n.path,
        fromTitle: noteTitle(n),
        context: wikilinkContext(content, link.start, link.end),
      });
      break;
    }
  }
  return out.sort((a, b) => a.fromTitle.localeCompare(b.fromTitle));
}
