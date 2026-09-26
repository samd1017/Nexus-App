/**
 * Grounded "Ask your notes" — extractive answers with citations.
 * No cloud LLM. Retrieves FTS hits, then lifts overlapping sentences.
 */

import type { SearchHit, VaultNode } from "@/lib/vault/types";
import { noteTitle } from "@/lib/vault/types";
import { sliceMarkdownByHeading } from "@/lib/markdown/note-slice";
import { filterHitsByOps, hasSearchOps, parseSearchOps, searchWithOps } from "./query-ops";
import { searchWithBackend, searchWithPathFolderOps } from "./search-backend";
import { fuseSearchHits, type RankSignals } from "./rank-fusion";
import { snippetForSearchHit } from "./snippets";
import {
  askContentTokens,
  isAskCatalogNoise,
  scoreAskSentence,
  sentencesFromMarkdown,
} from "./ask-extract";

export type AskCitation = {
  noteId: string;
  path: string;
  title: string;
  snippet: string;
  score: number;
  heading?: string | null;
};

export type AskAnswer = {
  question: string;
  summary: string;
  citations: AskCitation[];
  mode: "extractive";
};

const SYNONYMS: Record<string, string[]> = {
  agent: ["pulse", "automation", "script"],
  agents: ["pulse", "automation"],
  share: ["folder", "vault", "disk", "markdown"],
  vault: ["folder", "notes", "markdown"],
  conflict: ["studio", "keep", "theirs", "mine"],
  write: ["save", "edit", "pulse"],
  link: ["wikilink", "backlink", "mention"],
  search: ["ask", "find", "palette"],
  decision: ["log", "adr", "meeting"],
  meeting: ["sync", "standup", "notes"],
  design: ["spec", "review", "plan"],
  spec: ["design", "plan"],
  daily: ["journal", "today"],
  pin: ["star", "bookmark"],
};

export function askQueryTokens(question: string): string[] {
  const base = askContentTokens(question);
  const extra: string[] = [];
  for (const t of base) {
    const syn = SYNONYMS[t];
    if (syn) extra.push(...syn);
  }
  return [...new Set([...base, ...extra])];
}

export function buildAskAnswer(
  question: string,
  hits: SearchHit[],
  nodes: Record<string, VaultNode>,
): AskAnswer {
  const tokens = askQueryTokens(question);
  const phrase = question
    .replace(/^(ask:|\?)\s*/i, "")
    .toLowerCase()
    .trim();
  const ranked: {
    citation: AskCitation;
    extract: number;
    sentence: string;
  }[] = [];

  for (const h of hits.slice(0, 8)) {
    const node = nodes[h.noteId];
    const body =
      node?.kind === "note" && typeof node.content === "string"
        ? node.content
        : "";
    const sents = sentencesFromMarkdown(body);
    let best = "";
    let bestScore = 0;
    for (const s of sents) {
      const sc = tokens.length
        ? scoreAskSentence(s, tokens, phrase, askContentTokens(phrase))
        : 0;
      if (sc > bestScore) {
        bestScore = sc;
        best = s;
      }
    }
    const fallback =
      h.snippet && !isAskCatalogNoise(h.snippet)
        ? h.snippet
        : body
          ? snippetForSearchHit({
              content: body,
              query: question,
              path: h.path,
              matchType: "content",
            })
          : "";
    const snippet = best || fallback;
    if (!snippet || isAskCatalogNoise(snippet)) continue;
    const title = h.title || (node ? noteTitle(node) : h.path);
    ranked.push({
      extract: bestScore,
      sentence: best,
      citation: {
        noteId: h.noteId,
        path: h.path,
        title,
        snippet: snippet.slice(0, 280),
        score: h.score + bestScore,
        heading: headingHint(body, snippet),
      },
    });
  }

  ranked.sort((a, b) => b.extract - a.extract || b.citation.score - a.citation.score);
  const strong = ranked.filter((r) => r.extract >= 0.18).slice(0, 5);
  const usable = strong.length ? strong : ranked.slice(0, 3);
  const citations = usable.map((r) => r.citation);
  const picked = usable
    .filter((r) => r.sentence)
    .slice(0, 3)
    .map((r) => ({ text: r.sentence, title: r.citation.title }));

  const summary = composeAskSummary(question, picked, citations.length);

  return {
    question: question.trim(),
    summary,
    citations,
    mode: "extractive",
  };
}

function composeAskSummary(
  question: string,
  picked: { text: string; title: string }[],
  citationCount: number,
): string {
  if (picked.length) {
    const names = [...new Set(picked.map((p) => p.title))];
    const from =
      names.length === 1
        ? names[0]
        : names.length === 2
          ? `${names[0]} and ${names[1]}`
          : `${names[0]}, ${names[1]}, and ${names.length - 2} more`;
    return `From ${from}: ${picked.map((p) => p.text).join(" ")}`;
  }
  if (citationCount) {
    return `Found ${citationCount} note${citationCount === 1 ? "" : "s"} that match “${question.trim()}”. Open a citation to read the source.`;
  }
  const q = question.replace(/^(ask:|\?)\s*/i, "").trim();
  if (!q) {
    return "Ask your vault locally — no cloud. Try a starter below, or add path: folder: #tag −exclude.";
  }
  return `No matching notes for “${q}”. Narrow with path:Systems, folder:Research, #agents, or −welcome.`;
}

function headingHint(body: string, snippet: string): string | null {
  if (!body || !snippet) return null;
  const idx = body.toLowerCase().indexOf(snippet.slice(0, 40).toLowerCase());
  if (idx < 0) return null;
  const before = body.slice(0, idx);
  const heads = [...before.matchAll(/^#{1,6}\s+(.+)$/gm)];
  const last = heads[heads.length - 1];
  return last?.[1]?.trim() ?? null;
}

export function retrieveForAsk(
  nodes: Record<string, VaultNode>,
  question: string,
  signals: RankSignals,
  limit = 8,
): SearchHit[] {
  const stripped = question.replace(/^(ask:|\?)\s*/i, "").trim();
  const ops = parseSearchOps(stripped);
  const free = ops.rest || stripped;
  const raw = ops.fileFilter
    ? []
    : hasSearchOps(ops)
      ? searchWithOps(nodes, stripped, Math.max(limit * 3, 24))
      : searchWithPathFolderOps(
          nodes,
          free,
          ops.pathFilter,
          ops.folderFilter,
          Math.max(limit * 3, 24),
        );
  const fallback = raw.length
    ? raw
    : searchWithBackend(nodes, free, Math.max(limit * 3, 24));
  const baseTokens = new Set(askContentTokens(free));
  const extraHits: SearchHit[] = [];
  for (const syn of askQueryTokens(free)) {
    if (baseTokens.has(syn)) continue;
    extraHits.push(...searchWithBackend(nodes, syn, 8));
  }
  const byId = new Map<string, SearchHit>();
  for (const h of [...fallback, ...extraHits]) {
    const prev = byId.get(h.noteId);
    if (!prev || (h.score || 0) > (prev.score || 0)) byId.set(h.noteId, h);
  }
  const mentionsWelcome = /\bwelcome\b/i.test(free);
  const fused = fuseSearchHits([...byId.values()], {
    ...signals,
    queryText: free,
  }).filter((h) => {
    if (mentionsWelcome) return true;
    return !/(?:^|\/)welcome\.md$/i.test(h.path);
  });
  return filterHitsByOps(fused, ops, nodes).slice(0, limit);
}

/** Prefer a heading-scoped body when the question names a section. */
export function scopedBodyForCitation(
  body: string,
  heading: string | null | undefined,
): string {
  if (!heading) return body;
  return sliceMarkdownByHeading(body, heading) ?? body;
}
