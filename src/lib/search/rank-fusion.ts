/**
 * Lexical hybrid ranking — BM25/FTS hits fused with recency, title, and structure.
 * No embeddings required; this is the daily-driver leap over raw token match.
 */

import type { SearchHit } from "@/lib/vault/types";

export type RankSignals = {
  recentIds?: string[];
  activeNoteId?: string | null;
  neighborIds?: string[];
};

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

export function fuseSearchHits(
  hits: SearchHit[],
  signals: RankSignals = {},
): SearchHit[] {
  if (!hits.length) return hits;
  const recent = signals.recentIds ?? [];
  const neighbors = new Set(signals.neighborIds ?? []);
  const maxScore = Math.max(...hits.map((h) => h.score || 0), 1);

  return hits
    .map((h) => {
      const bm25 = clamp01((h.score || 0) / maxScore);
      const titleBoost = h.matchType === "title" ? 0.22 : 0;
      const recentIdx = recent.indexOf(h.noteId);
      const recency = recentIdx >= 0 ? 0.18 * (1 - recentIdx / Math.max(recent.length, 1)) : 0;
      const nearActive =
        h.noteId === signals.activeNoteId ? 0.08 : neighbors.has(h.noteId) ? 0.12 : 0;
      const pathBoost = /(?:daily|journal|inbox|readme|welcome)/i.test(h.path)
        ? 0.04
        : 0;
      const fused = bm25 * 0.62 + titleBoost + recency + nearActive + pathBoost;
      return { ...h, score: Math.round(fused * 1000) / 1000 };
    })
    .sort((a, b) => b.score - a.score || a.title.localeCompare(b.title));
}
