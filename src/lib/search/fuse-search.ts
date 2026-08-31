import Fuse from "fuse.js";
import type { SearchHit, VaultNode } from "@/lib/vault/types";
import { noteTitle } from "@/lib/vault/types";
import { notesForTag } from "@/lib/vault/tags";
import { getOrphanNotes } from "@/lib/vault/broken-links";
import { ensureVaultIndex } from "@/lib/vault/indexes";
import { getDurableIndex } from "@/lib/vault/durable-index";
import { snippetForSearchHit } from "@/lib/search/snippets";

/** Cap Fuse content docs — full-body Bitap does not scale past ~1–2k notes. */
const FUSE_CONTENT_CAP = 1200;

interface SearchDoc {
  id: string;
  path: string;
  title: string;
  /** Truncated body for fuzzy content hits (Phase 1); Phase 4 replaces with FTS */
  content: string;
  mtime: number;
}

/** Cached Fuse index — invalidated by vaultIndex generation (not O(n) string keys) */
let cachedGen = -1;
let cachedFuse: Fuse<SearchDoc> | null = null;
let cachedDocs: SearchDoc[] = [];
/** Per-note signature so a single content edit can patch without full remap */
let cachedNoteSigs = new Map<string, string>();

function noteSig(n: VaultNode): string {
  // Title included so renames invalidate; content length + mtime catch edits
  return `${noteTitle(n)}\0${n.path}\0${n.mtime}\0${n.content === undefined ? "u" : n.content.length}`;
}

function truncateForIndex(content: string): string {
  if (content.length <= FUSE_CONTENT_CAP) return content;
  return content.slice(0, FUSE_CONTENT_CAP);
}

function rebuildFuse(docs: SearchDoc[]): Fuse<SearchDoc> {
  return new Fuse(docs, {
    keys: [
      { name: "title", weight: 0.6 },
      { name: "path", weight: 0.2 },
      { name: "content", weight: 0.2 },
    ],
    threshold: 0.34,
    includeScore: true,
    // ignoreLocation on full bodies was O(N·C·Q) — keep for truncated snippets only
    ignoreLocation: true,
    minMatchCharLength: 1,
  });
}

function getFuse(nodes: Record<string, VaultNode>): Fuse<SearchDoc> {
  const idx = ensureVaultIndex(nodes);
  const gen = idx.generation();
  if (cachedFuse && cachedGen === gen) return cachedFuse;

  const notes = Object.values(nodes).filter((n) => n.kind === "note");
  const nextSigs = new Map<string, string>();
  for (const n of notes) nextSigs.set(n.id, noteSig(n));

  // Incremental path: same note set + only one note's content/mtime changed → patch that doc
  if (
    cachedFuse &&
    cachedDocs.length === notes.length &&
    cachedNoteSigs.size === notes.length
  ) {
    const prevIds = new Set(cachedNoteSigs.keys());
    const nextIds = new Set(nextSigs.keys());
    let sameIds = prevIds.size === nextIds.size;
    if (sameIds) {
      for (const id of prevIds) {
        if (!nextIds.has(id)) {
          sameIds = false;
          break;
        }
      }
    }
    if (sameIds) {
      const changed: string[] = [];
      for (const [id, sig] of nextSigs) {
        if (cachedNoteSigs.get(id) !== sig) changed.push(id);
      }
      // Single-note content/title change: patch docs array and rebuild Fuse from it
      // (Fuse has no true incremental API; still cheaper than re-mapping every note from store)
      if (changed.length === 1) {
        const id = changed[0];
        const n = nodes[id];
        if (n && n.kind === "note") {
          const docIdx = cachedDocs.findIndex((d) => d.id === id);
          if (docIdx >= 0) {
            cachedDocs[docIdx] = {
              id: n.id,
              path: n.path,
              title: noteTitle(n),
              content: truncateForIndex(n.content ?? ""),
              mtime: n.mtime,
            };
            cachedFuse = rebuildFuse(cachedDocs);
            cachedGen = gen;
            cachedNoteSigs = nextSigs;
            return cachedFuse;
          }
        }
      }
    }
  }

  cachedDocs = notes.map((n) => ({
    id: n.id,
    path: n.path,
    title: noteTitle(n),
    content: truncateForIndex(n.content ?? ""),
    mtime: n.mtime,
  }));

  cachedFuse = rebuildFuse(cachedDocs);
  cachedGen = gen;
  cachedNoteSigs = nextSigs;
  return cachedFuse;
}

/**
 * Ranking: exact title > title starts-with > path > fuzzy content.
 * Recency is a light tie-breaker. `#tag` queries filter by tag.
 */
export function searchVault(
  nodes: Record<string, VaultNode>,
  query: string,
  limit = 20,
): SearchHit[] {
  const q = query.trim();
  const idx = ensureVaultIndex(nodes);

  if (!q) {
    // Prefer recent-by-mtime without sorting all notes when N is huge:
    // still O(n log n) but only on metadata; Phase 4 uses a recency heap/index.
    const durable = getDurableIndex();
    return Object.values(nodes)
      .filter((n) => n.kind === "note")
      .sort((a, b) => b.mtime - a.mtime)
      .slice(0, limit)
      .map((n) => ({
        noteId: n.id,
        path: n.path,
        title: noteTitle(n),
        snippet: snippetForSearchHit({
          path: n.path,
          content: n.content,
          durableBody:
            n.content === undefined
              ? durable?.getNoteMeta?.(n.id)?.bodySnippet
              : undefined,
          matchType: "title",
        }),
        score: 1,
        matchType: "title" as const,
      }));
  }

  // Tag search: #project or tag:project
  const tagMatch = /^#([\w/-]+)$/i.exec(q) || /^tag:([\w/-]+)$/i.exec(q);
  if (tagMatch) {
    return notesForTag(nodes, tagMatch[1])
      .slice(0, limit)
      .map((n) => ({
        noteId: n.id,
        path: n.path,
        title: noteTitle(n),
        snippet: `#${tagMatch[1].toLowerCase()}`,
        score: 1,
        matchType: "title" as const,
      }));
  }

  // Operators: is:orphan
  if (/^is:orphans?$/i.test(q) || /^orphans?$/i.test(q)) {
    return getOrphanNotes(nodes, limit).map((o) => ({
      noteId: o.id,
      path: o.path,
      title: o.title,
      snippet: "orphan",
      score: 1,
      matchType: "title" as const,
    }));
  }

  const lower = q.toLowerCase();

  // Exact / prefix title boosts via title index (metadata only)
  const exact: SearchHit[] = [];
  const prefix: SearchHit[] = [];
  const durable = getDurableIndex();
  const titleHits = idx.suggest(nodes, q, Math.max(limit * 4, 40));
  for (const h of titleHits) {
    if (h.kind !== "note") continue;
    const n = nodes[h.id];
    if (!n || n.kind !== "note") continue;
    const t = h.title.toLowerCase();
    const snip = snippetForSearchHit({
      path: n.path,
      content: n.content,
      durableBody:
        n.content === undefined
          ? durable?.getNoteMeta?.(n.id)?.bodySnippet
          : undefined,
      matchType: "title",
      query: q,
    });
    if (t === lower) {
      exact.push({
        noteId: n.id,
        path: n.path,
        title: h.title,
        snippet: snip,
        score: 100,
        matchType: "title",
      });
    } else if (t.startsWith(lower)) {
      prefix.push({
        noteId: n.id,
        path: n.path,
        title: h.title,
        snippet: snip,
        score: 80 + Math.min(10, n.mtime / 1e13),
        matchType: "title",
      });
    }
  }
  prefix.sort((a, b) => b.score - a.score);

  const fuse = getFuse(nodes);
  const fuzzy = fuse.search(q, { limit: limit * 2 }).map((r) => {
    const score = 1 - (r.score ?? 0);
    const titleHit = r.item.title.toLowerCase().includes(lower);
    const pathHit = r.item.path.toLowerCase().includes(lower);
    // Recency nudge (max ~0.05)
    const recency = Math.min(0.05, (r.item.mtime / Date.now()) * 0.05);
    const node = nodes[r.item.id];
    const loaded = node?.content;
    const durableBody =
      loaded === undefined
        ? durable?.getNoteMeta?.(r.item.id)?.bodySnippet
        : undefined;
    const matchType = (titleHit ? "title" : "content") as "title" | "content";
    const snippet = snippetForSearchHit({
      path: r.item.path,
      query: q,
      matchType,
      content: loaded ?? (r.item.content || undefined),
      durableBody,
    });
    return {
      noteId: r.item.id,
      path: r.item.path,
      title: r.item.title,
      snippet,
      score: score + recency + (titleHit ? 0.15 : 0) + (pathHit ? 0.08 : 0),
      matchType,
    };
  });

  const seen = new Set<string>();
  const out: SearchHit[] = [];
  for (const hit of [...exact, ...prefix, ...fuzzy.sort((a, b) => b.score - a.score)]) {
    if (seen.has(hit.noteId)) continue;
    seen.add(hit.noteId);
    out.push(hit);
    if (out.length >= limit) break;
  }
  return out;
}

export function invalidateSearchCache(): void {
  cachedGen = -1;
  cachedFuse = null;
  cachedDocs = [];
  cachedNoteSigs = new Map();
}
