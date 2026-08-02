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

export function searchVault(
  nodes: Record<string, VaultNode>,
  query: string,
  limit = 20,
): SearchHit[] {
  const q = query.trim();
  if (!q) return [];

  const docs: SearchDoc[] = Object.values(nodes)
    .filter((n) => n.kind === "note")
    .map((n) => ({
      id: n.id,
      path: n.path,
      title: noteTitle(n),
      content: n.content ?? "",
    }));

  const fuse = new Fuse(docs, {
    keys: [
      { name: "title", weight: 0.55 },
      { name: "path", weight: 0.2 },
      { name: "content", weight: 0.25 },
    ],
    threshold: 0.42,
    includeScore: true,
    ignoreLocation: true,
    minMatchCharLength: 1,
  });

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
