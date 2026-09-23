/**
 * Reverse backlink index — target key → note ids that link to it.
 * Phase 1: generation-based cache (no O(n) vaultSig string joins).
 * Phase 4: true single-note incremental patch on save.
 */

import type { VaultNode } from "./types";
import { noteTitle } from "./types";
import {
  extractWikilinks,
  normalizeLinkTarget,
} from "@/lib/markdown/wikilinks";
import { ensureVaultIndex } from "./indexes";

let cachedGen = -1;
let cachedIndex: Map<string, string[]> | null = null;

/**
 * Map of normalized wikilink target keys → source note ids (unique, insertion order).
 * Keys include title, path (with/without .md), and basename forms emitted by notes.
 */
export function buildReverseIndex(
  nodes: Record<string, VaultNode>,
): Map<string, string[]> {
  // Structure only — body hydrate bumps contentGeneration and must not
  // rescan 45k notes on every switch. Live links go through vaultLinkIndex.
  const gen = ensureVaultIndex(nodes).structureGeneration;
  if (cachedIndex && cachedGen === gen) return cachedIndex;

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
      // [[Note#Heading]] and [[Note#^block]] are mentions of the note.
      // Keying the full target hid those sources whenever the link map
      // did not already cover the vault.
      const note = link.noteTarget;
      if (!note) continue;
      const target = normalizeLinkTarget(note);
      if (!target) continue;
      add(target, n.id);
    }
  }

  cachedGen = gen;
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
  cachedGen = -1;
  cachedIndex = null;
}
