import Fuse from "fuse.js";
import type { SearchHit, VaultNode } from "@/lib/vault/types";
import { noteTitle } from "@/lib/vault/types";
import { previewSnippet } from "@/lib/markdown/serialize";

interface SearchDoc {
  id: string;
  path: string;
  title: string;
  content: string;
}

/** Cached Fuse index — rebuilt only when vault note set changes */
let cachedKey = "";
let cachedFuse: Fuse<SearchDoc> | null = null;
let cachedDocs: SearchDoc[] = [];

function vaultKey(nodes: Record<string, VaultNode>): string {
  // path + mtime + length — cheap, stable for incremental Hermes updates
  return Object.values(nodes)
    .filter((n) => n.kind === "note")
    .map((n) => `${n.id}:${n.mtime}:${(n.content ?? "").length}`)
    .sort()
    .join("|");
}

function getFuse(nodes: Record<string, VaultNode>): Fuse<SearchDoc> {
  const key = vaultKey(nodes);
  if (cachedFuse && cachedKey === key) return cachedFuse;

  cachedDocs = Object.values(nodes)
    .filter((n) => n.kind === "note")
    .map((n) => ({
      id: n.id,
      path: n.path,
      title: noteTitle(n),
      content: n.content ?? "",
    }));

  cachedFuse = new Fuse(cachedDocs, {
    keys: [
      { name: "title", weight: 0.55 },
      { name: "path", weight: 0.2 },
      { name: "content", weight: 0.25 },
    ],
    threshold: 0.38,
    includeScore: true,
    ignoreLocation: true,
    minMatchCharLength: 1,
  });
  cachedKey = key;
  return cachedFuse;
}

export function searchVault(
  nodes: Record<string, VaultNode>,
  query: string,
  limit = 20,
): SearchHit[] {
  const q = query.trim();
  if (!q) {
    // Empty query: recent notes by mtime
    return Object.values(nodes)
      .filter((n) => n.kind === "note")
      .sort((a, b) => b.mtime - a.mtime)
      .slice(0, limit)
      .map((n) => ({
        noteId: n.id,
        path: n.path,
        title: noteTitle(n),
        snippet: previewSnippet(n.content ?? "", 90),
        score: 1,
        matchType: "title" as const,
      }));
  }

  const fuse = getFuse(nodes);
  return fuse.search(q, { limit }).map((r) => {
    const score = 1 - (r.score ?? 0);
    const titleHit = r.item.title.toLowerCase().includes(q.toLowerCase());
    const snippet = titleHit
      ? previewSnippet(r.item.content, 100)
      : extractSnippet(r.item.content, q);
    return {
      noteId: r.item.id,
      path: r.item.path,
      title: r.item.title,
      snippet,
      score,
      matchType: titleHit ? ("title" as const) : ("content" as const),
    };
  });
}

function extractSnippet(content: string, query: string, radius = 50): string {
  const lower = content.toLowerCase();
  const i = lower.indexOf(query.toLowerCase());
  if (i < 0) return previewSnippet(content, 100);
  const from = Math.max(0, i - radius);
  const to = Math.min(content.length, i + query.length + radius);
  let s = content.slice(from, to).replace(/\s+/g, " ").trim();
  if (from > 0) s = "…" + s;
  if (to < content.length) s = s + "…";
  return s;
}

export function invalidateSearchCache(): void {
  cachedKey = "";
  cachedFuse = null;
  cachedDocs = [];
}
