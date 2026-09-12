/**
 * Grounded "Ask your notes" — extractive answers with citations.
 * No cloud LLM. Retrieves FTS hits, then lifts overlapping sentences.
 */

import type { SearchHit, VaultNode } from "@/lib/vault/types";
import { noteTitle } from "@/lib/vault/types";
import { sliceMarkdownByHeading } from "@/lib/markdown/note-slice";
import { parseSearchOps } from "./query-ops";
import { searchWithBackend, searchWithPathFolderOps } from "./search-backend";
import { fuseSearchHits, type RankSignals } from "./rank-fusion";
import { snippetForSearchHit } from "./snippets";

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

const STOP = new Set([
  "the",
  "a",
  "an",
  "and",
  "or",
  "of",
  "to",
  "in",
  "on",
  "for",
  "is",
  "are",
  "was",
  "were",
  "be",
  "as",
  "at",
  "by",
  "it",
  "this",
  "that",
  "with",
  "from",
  "what",
  "which",
  "who",
  "how",
  "why",
  "when",
  "where",
  "does",
  "do",
  "did",
  "can",
  "could",
  "should",
  "about",
  "your",
  "notes",
  "note",
]);

export function askQueryTokens(question: string): string[] {
  return question
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter((t) => t.length >= 2 && !STOP.has(t));
}

function sentencesFromMarkdown(md: string): string[] {
  const plain = (md || "")
    .replace(/^---[\s\S]*?---\n/, "")
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/!\[[^\]]*\]\([^)]+\)/g, " ")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/!?\[\[([^\]|#]+)(?:#[^\]|]+)?(?:\|[^\]]+)?\]\]/g, "$1")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/[>*_`#]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!plain) return [];
  return plain
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length >= 24);
}

function scoreSentence(sentence: string, tokens: string[]): number {
  const lower = sentence.toLowerCase();
  let hits = 0;
  for (const t of tokens) {
    if (lower.includes(t)) hits += 1;
  }
  if (!hits) return 0;
  return hits / tokens.length + Math.min(sentence.length, 220) / 800;
}

export function buildAskAnswer(
  question: string,
  hits: SearchHit[],
  nodes: Record<string, VaultNode>,
): AskAnswer {
  const tokens = askQueryTokens(question);
  const citations: AskCitation[] = [];
  const picked: string[] = [];

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
      const sc = tokens.length ? scoreSentence(s, tokens) : 0;
      if (sc > bestScore) {
        bestScore = sc;
        best = s;
      }
    }
    const snippet =
      best ||
      h.snippet ||
      (body
        ? snippetForSearchHit({
            content: body,
            query: question,
            path: h.path,
            matchType: "content",
          })
        : "");
    if (!snippet) continue;
    citations.push({
      noteId: h.noteId,
      path: h.path,
      title: h.title || (node ? noteTitle(node) : h.path),
      snippet: snippet.slice(0, 280),
      score: h.score,
      heading: headingHint(body, snippet),
    });
    if (best && picked.length < 3) picked.push(best);
  }

  const summary = picked.length
    ? picked.join(" ")
    : citations.length
      ? `Found ${citations.length} note${citations.length === 1 ? "" : "s"} that match “${question.trim()}”. Open a citation to read the source.`
      : `No matching notes for “${question.trim()}”. Try fewer words or a path: / folder: filter.`;

  return {
    question: question.trim(),
    summary,
    citations,
    mode: "extractive",
  };
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
  return fuseSearchHits(fallback, signals).slice(0, limit);
}

/** Prefer a heading-scoped body when the question names a section. */
export function scopedBodyForCitation(
  body: string,
  heading: string | null | undefined,
): string {
  if (!heading) return body;
  return sliceMarkdownByHeading(body, heading) ?? body;
}
