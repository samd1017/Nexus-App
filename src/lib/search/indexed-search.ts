/**
 * Wave 2 — In-process inverted index for large vaults.
 * Title/path always indexed; body only when loaded (lazy-safe).
 * Token queries use AND (intersection) of postings.
 * Incremental upsert/remove when generation unchanged; full rebuild on gen bump.
 */

import type { SearchHit, VaultNode } from "@/lib/vault/types";
import { noteTitle } from "@/lib/vault/types";
import { ensureVaultIndex } from "@/lib/vault/indexes";
import { getDurableIndex } from "@/lib/vault/durable-index";
import { snippetForSearchHit } from "@/lib/search/snippets";

const BODY_CAP = 4000;

type Doc = {
  id: string;
  path: string;
  title: string;
  body: string;
  mtime: number;
  tokens: Set<string>;
};

let cachedGen = -1;
let docs = new Map<string, Doc>();
/** token → note ids */
let inv = new Map<string, Set<string>>();

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9_\u00c0-\u024f]+/i)
    .filter((t) => t.length >= 2);
}

function addToInv(id: string, tokens: Set<string>) {
  for (const t of tokens) {
    let set = inv.get(t);
    if (!set) {
      set = new Set();
      inv.set(t, set);
    }
    set.add(id);
  }
}

function removeFromInv(id: string, tokens: Set<string>) {
  for (const t of tokens) {
    const set = inv.get(t);
    if (!set) continue;
    set.delete(id);
    if (set.size === 0) inv.delete(t);
  }
}

function buildDoc(n: VaultNode): Doc {
  const title = noteTitle(n);
  const body =
    n.content !== undefined ? n.content.slice(0, BODY_CAP) : "";
  const tokens = new Set(tokenize(`${title} ${n.path} ${body}`));
  return {
    id: n.id,
    path: n.path,
    title,
    body,
    mtime: n.mtime,
    tokens,
  };
}

function rebuild(nodes: Record<string, VaultNode>) {
  docs = new Map();
  inv = new Map();
  for (const n of Object.values(nodes)) {
    if (n.kind !== "note") continue;
    const d = buildDoc(n);
    docs.set(d.id, d);
    addToInv(d.id, d.tokens);
  }
  cachedGen = ensureVaultIndex(nodes).generation();
}

/** Incremental patch when structural gen matches */
export function upsertIndexedNote(n: VaultNode): void {
  if (n.kind !== "note") return;
  const prev = docs.get(n.id);
  if (prev) removeFromInv(n.id, prev.tokens);
  const d = buildDoc(n);
  docs.set(d.id, d);
  addToInv(d.id, d.tokens);
}

export function removeIndexedNote(id: string): void {
  const prev = docs.get(id);
  if (!prev) return;
  removeFromInv(id, prev.tokens);
  docs.delete(id);
}

function ensureIndex(nodes: Record<string, VaultNode>) {
  const gen = ensureVaultIndex(nodes).generation();
  if (gen !== cachedGen || docs.size === 0) {
    rebuild(nodes);
    return;
  }
  // Patch new/changed notes without full rebuild when gen stable
  const noteIds = new Set<string>();
  for (const n of Object.values(nodes)) {
    if (n.kind !== "note") continue;
    noteIds.add(n.id);
    const prev = docs.get(n.id);
    const body =
      n.content !== undefined ? n.content.slice(0, BODY_CAP) : "";
    if (
      !prev ||
      prev.mtime !== n.mtime ||
      prev.path !== n.path ||
      prev.body !== body ||
      prev.title !== noteTitle(n)
    ) {
      upsertIndexedNote(n);
    }
  }
  for (const id of [...docs.keys()]) {
    if (!noteIds.has(id)) removeIndexedNote(id);
  }
}

export function invalidateIndexedSearch(): void {
  cachedGen = -1;
  docs = new Map();
  inv = new Map();
}

/**
 * Ranked search over inverted index.
 * Multi-token queries = AND (intersection) of postings from rarest token.
 */
export function indexedSearch(
  nodes: Record<string, VaultNode>,
  query: string,
  limit = 40,
): SearchHit[] {
  ensureIndex(nodes);
  const q = query.trim();
  if (!q) {
    // Recency heap without full sort of 500k: partial top-k
    const all = [...docs.values()];
    if (all.length <= limit * 4) {
      return all
        .sort((a, b) => b.mtime - a.mtime)
        .slice(0, limit)
        .map((d) => ({
          noteId: d.id,
          path: d.path,
          title: d.title,
          snippet: snippetForSearchHit({
            path: d.path,
            content: d.body || undefined,
            durableBody: !d.body
              ? getDurableIndex()?.getNoteMeta?.(d.id)?.bodySnippet
              : undefined,
            matchType: "title",
          }),
          score: 1,
          matchType: "title" as const,
        }));
    }
    // Approximate: sample by iterating and keeping top-k
    const top: Doc[] = [];
    for (const d of all) {
      if (top.length < limit) {
        top.push(d);
        if (top.length === limit) top.sort((a, b) => a.mtime - b.mtime);
        continue;
      }
      if (d.mtime > top[0].mtime) {
        top[0] = d;
        // bubble
        let i = 0;
        while (true) {
          const l = 2 * i + 1;
          const r = l + 1;
          let s = i;
          if (l < top.length && top[l].mtime < top[s].mtime) s = l;
          if (r < top.length && top[r].mtime < top[s].mtime) s = r;
          if (s === i) break;
          [top[i], top[s]] = [top[s], top[i]];
          i = s;
        }
      }
    }
    return top
      .sort((a, b) => b.mtime - a.mtime)
      .map((d) => ({
        noteId: d.id,
        path: d.path,
        title: d.title,
        snippet: snippetForSearchHit({
          path: d.path,
          content: d.body || undefined,
          durableBody: !d.body
            ? getDurableIndex()?.getNoteMeta?.(d.id)?.bodySnippet
            : undefined,
          matchType: "title",
        }),
        score: 1,
        matchType: "title" as const,
      }));
  }

  const qLower = q.toLowerCase();
  const qTokens = tokenize(q);
  let candidateIds: Set<string> | null = null;

  if (qTokens.length === 0) {
    candidateIds = new Set<string>();
    for (const d of docs.values()) {
      if (
        d.title.toLowerCase().includes(qLower) ||
        d.path.toLowerCase().includes(qLower)
      ) {
        candidateIds.add(d.id);
      }
    }
  } else {
    // AND intersection starting from rarest token
    const sorted = [...qTokens].sort(
      (a, b) => (inv.get(a)?.size ?? Infinity) - (inv.get(b)?.size ?? Infinity),
    );
    const first = inv.get(sorted[0]);
    if (!first || first.size === 0) {
      candidateIds = new Set();
    } else {
      candidateIds = new Set(first);
      for (const t of sorted.slice(1)) {
        const set = inv.get(t);
        if (!set) {
          candidateIds = new Set();
          break;
        }
        for (const id of [...candidateIds]) {
          if (!set.has(id)) candidateIds.delete(id);
        }
        if (candidateIds.size === 0) break;
      }
    }
    // Title substring boost when few candidates
    if (candidateIds.size < limit) {
      for (const d of docs.values()) {
        if (d.title.toLowerCase().includes(qLower)) candidateIds.add(d.id);
      }
    }
  }

  const hits: SearchHit[] = [];
  const durable = getDurableIndex();
  for (const id of candidateIds) {
    const d = docs.get(id);
    if (!d) continue;
    const titleL = d.title.toLowerCase();
    const pathL = d.path.toLowerCase();
    let score = 0;
    let matchType: "title" | "content" = "title";
    if (titleL === qLower) score = 120;
    else if (titleL.startsWith(qLower)) score = 100;
    else if (titleL.includes(qLower)) score = 80;
    else if (pathL.includes(qLower)) score = 60;
    else {
      let overlap = 0;
      for (const t of qTokens) {
        if (d.tokens.has(t)) overlap += 1;
      }
      if (overlap === 0) continue;
      // Prefer full AND satisfaction
      score = 20 + overlap * 15 + (overlap === qTokens.length ? 20 : 0);
      if (d.body && d.body.toLowerCase().includes(qLower)) {
        score += 10;
        matchType = "content";
      }
    }
    const bodyHit = d.body && d.body.toLowerCase().includes(qLower);
    if (bodyHit && score < 80) matchType = "content";
    const durableBody = !d.body
      ? durable?.getNoteMeta?.(id)?.bodySnippet
      : undefined;
    // Body token hits with unloaded store body still count as content
    if (
      !d.body &&
      durableBody &&
      matchType === "title" &&
      score < 60 &&
      durableBody.toLowerCase().includes(qLower)
    ) {
      matchType = "content";
      score += 10;
    }
    hits.push({
      noteId: d.id,
      path: d.path,
      title: d.title,
      snippet: snippetForSearchHit({
        path: d.path,
        query: q,
        matchType,
        content: d.body || undefined,
        durableBody,
      }),
      score,
      matchType,
    });
  }
  hits.sort((a, b) => b.score - a.score || a.title.localeCompare(b.title));
  return hits.slice(0, limit);
}

/** Bench helper — force rebuild */
export function rebuildIndexedSearch(nodes: Record<string, VaultNode>): number {
  const t0 = performance.now();
  rebuild(nodes);
  return performance.now() - t0;
}
