/**
 * Tree folder expansion — must stay O(depth), never O(vault), on note select.
 * Accordion (≥400 notes) only opens ancestors + the daily journal root.
 */

import type { VaultNode } from "./types";
import { ensureVaultIndex } from "./indexes";

/** Fallback when caller does not pass `dailyFolder()`. Avoids prefs on this path. */
export const DEFAULT_JOURNAL_FOLDER = "Journal";

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

function journalRootId(
  nodes: Record<string, VaultNode>,
  journalPath: string,
): string | null {
  const path = journalPath || DEFAULT_JOURNAL_FOLDER;
  const id = ensureVaultIndex(nodes).pathToId.get(path);
  if (!id) return null;
  const n = nodes[id];
  if (n?.kind === "folder" && n.parentId == null) return id;
  return null;
}

export function smartExpandedFolders(
  nodes: Record<string, VaultNode>,
  activeId: string | null,
  journalPath: string = DEFAULT_JOURNAL_FOLDER,
): string[] {
  const out: string[] = [];
  const journal = journalRootId(nodes, journalPath);
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
