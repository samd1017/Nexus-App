/**
 * Light tag support — plain #tags in Markdown (Hermes-safe, no proprietary DB).
 * Tags are extracted from note bodies; optional YAML-ish frontmatter tags: too.
 *
 * collectVaultTags is generation-cached (VaultStructuralIndex.generation() when
 * available; else nodes-map identity + noteCount fingerprint) so sidebar / cmdk
 * re-renders don't re-scan every note body.
 *
 * Large/lazy vaults: when note bodies are stripped, seed from DurableIndex
 * listNoteMeta().tags (populated before strip at open).
 */

import type { VaultNode } from "./types";
import { noteTitle } from "./types";
import { ensureVaultIndex } from "./indexes";
import { getDurableIndex } from "./durable-index";

const TAG_RE = /(?:^|[\s([{])#([a-zA-Z][\w/-]{0,48})\b/g;
const FRONTMATTER_TAGS =
  /^---\r?\n([\s\S]*?)\r?\n---/;

/** Strip fenced code so # in code isn't a tag */
function stripCode(md: string): string {
  return md
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`[^`\n]+`/g, " ");
}

export function extractTagsFromMarkdown(markdown: string): string[] {
  const tags = new Set<string>();
  const fm = FRONTMATTER_TAGS.exec(markdown);
  if (fm) {
    const block = fm[1];
    const tagsLine = /^tags:\s*(.+)$/im.exec(block);
    if (tagsLine) {
      const raw = tagsLine[1].trim();
      if (raw.startsWith("[")) {
        for (const m of raw.matchAll(/["']?([a-zA-Z][\w/-]*)["']?/g)) {
          if (m[1] && m[1].toLowerCase() !== "tags") tags.add(m[1].toLowerCase());
        }
      } else {
        for (const part of raw.split(/[,\s]+/)) {
          const t = part.replace(/^#/, "").trim();
          if (t) tags.add(t.toLowerCase());
        }
      }
    }
  }
  const body = stripCode(markdown);
  TAG_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = TAG_RE.exec(body))) {
    tags.add(m[1].toLowerCase());
  }
  return Array.from(tags).sort();
}

export function noteHasTag(content: string, tag: string): boolean {
  const needle = tag.replace(/^#/, "").toLowerCase();
  return extractTagsFromMarkdown(content).includes(needle);
}

export type TagHit = {
  tag: string;
  count: number;
  noteIds: string[];
};

// ── Generation / identity cache ──────────────────────────────────────────────

let cachedTags: TagHit[] | null = null;
/** tag → TagHit from last collect (for notesForTag O(1) noteIds) */
let cachedByTag: Map<string, TagHit> | null = null;
let cachedGen = -1;
let cachedNodesRef: Record<string, VaultNode> | null = null;
let cachedNoteCount = -1;
let cachedNodeKeyCount = -1;

function tagHitCmp(a: TagHit, b: TagHit): number {
  return b.count - a.count || a.tag.localeCompare(b.tag);
}

/** Prefer structural index generation; fall back to noteCount + map size. */
function tagsCacheKey(nodes: Record<string, VaultNode>): {
  gen: number;
  noteCount: number;
  nodeKeyCount: number;
} {
  try {
    const idx = ensureVaultIndex(nodes);
    return {
      gen: idx.generation(),
      noteCount: idx.noteCount,
      nodeKeyCount: idx.nodeCount,
    };
  } catch {
    let noteCount = 0;
    let nodeKeyCount = 0;
    for (const n of Object.values(nodes)) {
      nodeKeyCount += 1;
      if (n.kind === "note") noteCount += 1;
    }
    return { gen: -1, noteCount, nodeKeyCount };
  }
}

function isTagsCacheValid(nodes: Record<string, VaultNode>): boolean {
  if (!cachedTags) return false;
  if (cachedNodesRef === nodes) return true;
  const { gen, noteCount, nodeKeyCount } = tagsCacheKey(nodes);
  if (gen >= 0 && cachedGen === gen) return true;
  // Fallback fingerprint when generation unavailable
  if (
    gen < 0 &&
    cachedGen < 0 &&
    cachedNoteCount === noteCount &&
    cachedNodeKeyCount === nodeKeyCount
  ) {
    return true;
  }
  return false;
}

function storeTagsCache(
  tags: TagHit[],
  nodes: Record<string, VaultNode>,
  key: { gen: number; noteCount: number; nodeKeyCount: number },
): void {
  cachedTags = tags;
  cachedByTag = new Map(tags.map((t) => [t.tag, t]));
  cachedGen = key.gen;
  cachedNodesRef = nodes;
  cachedNoteCount = key.noteCount;
  cachedNodeKeyCount = key.nodeKeyCount;
}

/** Aggregate TagHits from durable meta.tags when note bodies are unloaded. */
function buildTagHitsFromDurable(): TagHit[] | null {
  const idx = getDurableIndex();
  if (!idx?.ready) return null;
  const map = new Map<string, Set<string>>();
  for (const m of idx.listNoteMeta()) {
    if (!m.tags?.length) continue;
    for (const t of m.tags) {
      const tag = t.toLowerCase();
      let set = map.get(tag);
      if (!set) {
        set = new Set();
        map.set(tag, set);
      }
      set.add(m.id);
    }
  }
  if (map.size === 0) return null;
  return Array.from(map.entries()).map(([tag, ids]) => ({
    tag,
    count: ids.size,
    noteIds: Array.from(ids),
  }));
}

/** True when vault notes have no in-memory bodies (lazy / stripped large vault). */
function vaultBodiesStripped(nodes: Record<string, VaultNode>): boolean {
  let notes = 0;
  let withBody = 0;
  for (const id in nodes) {
    const n = nodes[id];
    if (!n || n.kind !== "note") continue;
    notes += 1;
    if (n.content !== undefined) withBody += 1;
    // Early exit: enough samples with zero bodies → stripped
    if (notes >= 48 && withBody === 0) return true;
    // Early exit: mixed load (some bodies present) → not fully stripped
    if (withBody > 0 && notes >= 48) return false;
  }
  return notes > 0 && withBody === 0;
}

/**
 * Hybrid: durable tags for unloaded notes + body extract for loaded ones.
 * Prefer pure durable aggregate when every body is stripped (fast path).
 */
function buildTagHitsUnsorted(nodes: Record<string, VaultNode>): TagHit[] {
  if (vaultBodiesStripped(nodes)) {
    const fromDurable = buildTagHitsFromDurable();
    if (fromDurable) return fromDurable;
  }

  // Hybrid: prefer body extract when present; else durable meta tags
  const durableTags = new Map<string, string[]>();
  const idx = getDurableIndex();
  if (idx?.ready) {
    for (const m of idx.listNoteMeta()) {
      if (m.tags?.length) durableTags.set(m.id, m.tags);
    }
  }

  const map = new Map<string, Set<string>>();
  for (const id in nodes) {
    const n = nodes[id];
    if (!n || n.kind !== "note") continue;
    let tags: string[];
    if (n.content !== undefined) {
      tags = extractTagsFromMarkdown(n.content);
    } else {
      tags = durableTags.get(n.id) ?? [];
    }
    for (const t of tags) {
      let set = map.get(t);
      if (!set) {
        set = new Set();
        map.set(t, set);
      }
      set.add(n.id);
    }
  }
  return Array.from(map.entries()).map(([tag, ids]) => ({
    tag,
    count: ids.size,
    noteIds: Array.from(ids),
  }));
}

/**
 * Partial top-K by count (then tag name). Selection of first `limit` slots —
 * O(n·k) and skips sorting the tail when k ≪ n.
 */
function partialTopK(hits: TagHit[], limit: number): TagHit[] {
  const k = Math.min(limit, hits.length);
  for (let i = 0; i < k; i++) {
    let best = i;
    for (let j = i + 1; j < hits.length; j++) {
      if (tagHitCmp(hits[j], hits[best]) < 0) best = j;
    }
    if (best !== i) {
      const tmp = hits[i]!;
      hits[i] = hits[best]!;
      hits[best] = tmp;
    }
  }
  return hits.slice(0, k);
}

/** Aggregate tags across the vault (sorted by count desc, tag asc). Cached. */
export function collectVaultTags(
  nodes: Record<string, VaultNode>,
): TagHit[] {
  if (isTagsCacheValid(nodes)) {
    cachedNodesRef = nodes;
    return cachedTags!;
  }

  const key = tagsCacheKey(nodes);
  const hits = buildTagHitsUnsorted(nodes);
  hits.sort(tagHitCmp);
  storeTagsCache(hits, nodes, key);
  return hits;
}

/**
 * Alias for collectVaultTags — same generation-cached implementation.
 * Kept for callers (LeftSidebar, etc.) that already import the cached name.
 */
export const collectVaultTagsCached = collectVaultTags;


/**
 * Top K vault tags by frequency. Uses generation cache when warm;
 * otherwise builds unsorted hits and only partially sorts top K when easy
 * (limit much smaller than tag count).
 */
export function getTopVaultTags(
  nodes: Record<string, VaultNode>,
  limit: number,
): TagHit[] {
  if (limit <= 0) return [];

  if (isTagsCacheValid(nodes)) {
    cachedNodesRef = nodes;
    return cachedTags!.length <= limit
      ? cachedTags!
      : cachedTags!.slice(0, limit);
  }

  const key = tagsCacheKey(nodes);
  const hits = buildTagHitsUnsorted(nodes);

  // Full sort is cheap when few tags or we need most of them
  if (hits.length <= limit || limit * 4 >= hits.length) {
    hits.sort(tagHitCmp);
    storeTagsCache(hits, nodes, key);
    return hits.length <= limit ? hits : hits.slice(0, limit);
  }

  // Early-exit: select top K only (do not store partial as full collect cache)
  return partialTopK(hits, limit);
}

export function notesForTag(
  nodes: Record<string, VaultNode>,
  tag: string,
): VaultNode[] {
  const needle = tag.replace(/^#/, "").toLowerCase();

  // Prefer cached TagHit.noteIds from last collect (avoids re-extracting tags)
  let hit: TagHit | undefined;
  if (isTagsCacheValid(nodes) && cachedByTag) {
    hit = cachedByTag.get(needle);
  } else {
    // Warm cache (same work callers often do via collectVaultTags anyway)
    collectVaultTags(nodes);
    hit = cachedByTag?.get(needle);
  }

  if (hit) {
    const out: VaultNode[] = [];
    for (const id of hit.noteIds) {
      const n = nodes[id];
      if (n?.kind === "note") out.push(n);
    }
    out.sort((a, b) => noteTitle(a).localeCompare(noteTitle(b)));
    return out;
  }

  // Tag absent from vault (or empty cache miss) — no full re-scan of bodies
  if (cachedByTag) return [];

  // Defensive fallback if cache unavailable
  return Object.values(nodes)
    .filter(
      (n) =>
        n.kind === "note" &&
        extractTagsFromMarkdown(n.content ?? "").includes(needle),
    )
    .sort((a, b) => noteTitle(a).localeCompare(noteTitle(b)));
}

/** Test / vault-close helper */
export function invalidateVaultTagsCache(): void {
  cachedTags = null;
  cachedByTag = null;
  cachedGen = -1;
  cachedNodesRef = null;
  cachedNoteCount = -1;
  cachedNodeKeyCount = -1;
}
