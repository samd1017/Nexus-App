/**
 * Wave C — Conflict Studio pairing helpers.
 * Detects .conflict-* siblings created by external dirty diverge shelving.
 */

import type { VaultNode } from "./types";
import { noteTitle } from "./types";

/** Matches Note.conflict-STAMP.md and Note.conflict-STAMP-N.md (and -mine-). */
export const CONFLICT_SIBLING_RE = /\.conflict-[^/]+\.md$/i;

export type ConflictSibling = {
  id: string;
  path: string;
  name: string;
  mtime: number;
};

export type ConflictPair = {
  primaryPath: string;
  primaryId: string | null;
  siblings: ConflictSibling[];
  latestSiblingPath: string | null;
  title: string;
};

export type ConflictListItem = ConflictPair & {
  key: string;
  sibling: ConflictSibling;
};

export function isConflictSiblingPath(path: string): boolean {
  return CONFLICT_SIBLING_RE.test(path);
}

/**
 * Note.conflict-STAMP.md → Note.md
 * Returns null if not a sibling path.
 */
export function primaryPathFromSibling(siblingPath: string): string | null {
  if (!isConflictSiblingPath(siblingPath)) return null;
  return siblingPath.replace(CONFLICT_SIBLING_RE, ".md");
}

export function conflictItemKey(
  primaryPath: string,
  siblingPath: string,
): string {
  return `${primaryPath}\0${siblingPath}`;
}

export function makeConflictSiblingPath(
  primaryPath: string,
  existingPaths: Set<string>,
  kind: "theirs" | "mine" = "theirs",
): string {
  const stamp = new Date()
    .toISOString()
    .replace(/[:.]/g, "-")
    .slice(0, 19);
  const base = primaryPath.replace(/\.md$/i, "");
  const mid = kind === "mine" ? "conflict-mine" : "conflict";
  let sibling = `${base}.${mid}-${stamp}.md`;
  let n = 1;
  while (existingPaths.has(sibling)) {
    sibling = `${base}.${mid}-${stamp}-${n}.md`;
    n++;
  }
  return sibling;
}

export function detectConflictPairs(
  nodes: Record<string, VaultNode>,
): ConflictPair[] {
  const byPrimary = new Map<string, ConflictSibling[]>();
  const pathToId = new Map<string, string>();

  for (const n of Object.values(nodes)) {
    if (n.kind !== "note") continue;
    pathToId.set(n.path, n.id);
    if (!isConflictSiblingPath(n.path)) continue;
    const primary = primaryPathFromSibling(n.path);
    if (!primary) continue;
    const list = byPrimary.get(primary) ?? [];
    list.push({
      id: n.id,
      path: n.path,
      name: n.name,
      mtime: n.mtime,
    });
    byPrimary.set(primary, list);
  }

  const pairs: ConflictPair[] = [];
  for (const [primaryPath, siblings] of byPrimary) {
    siblings.sort((a, b) => b.mtime - a.mtime);
    const primaryId = pathToId.get(primaryPath) ?? null;
    const primaryNode = primaryId ? nodes[primaryId] : undefined;
    pairs.push({
      primaryPath,
      primaryId,
      siblings,
      latestSiblingPath: siblings[0]?.path ?? null,
      title: primaryNode
        ? noteTitle(primaryNode)
        : primaryPath.split("/").pop()?.replace(/\.md$/i, "") || primaryPath,
    });
  }

  pairs.sort((a, b) => a.title.localeCompare(b.title));
  return pairs;
}

export function flattenConflictItems(
  pairs: ConflictPair[],
): ConflictListItem[] {
  const items: ConflictListItem[] = [];
  for (const pair of pairs) {
    for (const sibling of pair.siblings) {
      items.push({
        ...pair,
        sibling,
        key: conflictItemKey(pair.primaryPath, sibling.path),
      });
    }
  }
  return items;
}

export function filterDismissed(
  items: ConflictListItem[],
  dismissedKeys: ReadonlySet<string>,
): ConflictListItem[] {
  if (!dismissedKeys.size) return items;
  return items.filter((i) => !dismissedKeys.has(i.key));
}

export function pairForPath(
  nodes: Record<string, VaultNode>,
  path: string,
): ConflictPair | null {
  const pairs = detectConflictPairs(nodes);
  if (isConflictSiblingPath(path)) {
    const primary = primaryPathFromSibling(path);
    return pairs.find((p) => p.primaryPath === primary) ?? null;
  }
  return pairs.find((p) => p.primaryPath === path) ?? null;
}

/** Active note is primary with siblings or is a conflict sibling. */
export function conflictContextForActive(
  nodes: Record<string, VaultNode>,
  activeNoteId: string | null,
): {
  pair: ConflictPair;
  viewingSibling: boolean;
  sibling: ConflictSibling | null;
} | null {
  if (!activeNoteId) return null;
  const note = nodes[activeNoteId];
  if (!note || note.kind !== "note") return null;
  const pair = pairForPath(nodes, note.path);
  if (!pair || pair.siblings.length === 0) return null;
  const viewingSibling = isConflictSiblingPath(note.path);
  const sibling =
    pair.siblings.find((s) => s.path === note.path) ??
    pair.siblings[0] ??
    null;
  return { pair, viewingSibling, sibling };
}
