/**
 * Reverse backlink index — target key → note ids that link to it.
 * Built once per vault snapshot (cached by structure/content signature).
 */

import type { VaultNode } from "./types";
import { noteTitle } from "./types";
import {
  extractWikilinks,
  normalizeLinkTarget,
} from "@/lib/markdown/wikilinks";

let cachedSig = "";
let cachedIndex: Map<string, string[]> | null = null;

function vaultSig(nodes: Record<string, VaultNode>): string {
  return Object.values(nodes)
    .filter((n) => n.kind === "note")
    .map(
      (n) =>
        `${n.id}\0${n.path}\0${n.mtime}\0${(n.content ?? "").length}`,
    )
    .sort()
    .join("|");
}

/**
 * Map of normalized wikilink target keys → source note ids (unique, insertion order).
 * Keys include title, path (with/without .md), and basename forms emitted by notes.
 */
export function buildReverseIndex(
  nodes: Record<string, VaultNode>,
): Map<string, string[]> {
  const sig = vaultSig(nodes);
  if (cachedIndex && cachedSig === sig) return cachedIndex;

  const index = new Map<string, string[]>();

  const add = (key: string, fromId: string) => {
    if (!key) return;
    let list = index.get(key);
    if (!list) {
      list = [];
      index.set(key, list);
    }
    if (!list.includes(fromId)) list.push(fromId);
  };

  for (const n of Object.values(nodes)) {
    if (n.kind !== "note") continue;
    const content = n.content ?? "";
    for (const link of extractWikilinks(content)) {
      const target = normalizeLinkTarget(link.target);
      if (!target) continue;
      add(target, n.id);
    }
  }

  cachedSig = sig;
  cachedIndex = index;
  return index;
}

/** Target keys a note may be linked as (title, path, name variants). */
export function noteTargetKeys(note: VaultNode): string[] {
  return [
    normalizeLinkTarget(noteTitle(note)),
    normalizeLinkTarget(note.path.replace(/\.md$/i, "")),
    normalizeLinkTarget(note.path),
    normalizeLinkTarget(note.name),
  ].filter(Boolean);
}

export function invalidateBacklinkIndex(): void {
  cachedSig = "";
  cachedIndex = null;
}
