/**
 * Tree folder expansion — must stay O(depth), never O(vault), on note select.
 * Accordion (≥400 notes) only opens ancestors + the daily journal root.
 */

import type { VaultNode } from "./types";
import { dailyFolder } from "./templates";
import { ensureVaultIndex } from "./indexes";

/** Expand folder ancestors so the note is visible in the tree. */
export function expandPathToNote(
  nodes: Record<string, VaultNode>,
  noteId: string | null,
): string[] {
  if (!noteId) return [];
  const out: string[] = [];
  let cur = nodes[noteId]?.parentId ?? null;
  while (cur) {
    out.push(cur);
    cur = nodes[cur]?.parentId ?? null;
  }
  return out;
}

function journalRootId(nodes: Record<string, VaultNode>): string | null {
  const path = dailyFolder();
  const id = ensureVaultIndex(nodes).pathToId.get(path);
  if (!id) return null;
  const n = nodes[id];
  if (n?.kind === "folder" && n.parentId == null) return id;
  return null;
}

export function smartExpandedFolders(
  nodes: Record<string, VaultNode>,
  activeId: string | null,
): string[] {
  const out: string[] = [];
  const journal = journalRootId(nodes);
  if (journal) out.push(journal);
  let cur = activeId ? nodes[activeId] : null;
  while (cur?.parentId) {
    out.push(cur.parentId);
    cur = nodes[cur.parentId] ?? null;
  }
  return out;
}

export function sameExpandedFolders(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  if (a.length === 0) return true;
  const other = new Set(b);
  for (const id of a) {
    if (!other.has(id)) return false;
  }
  return true;
}
