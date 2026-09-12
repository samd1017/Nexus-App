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

const SYNONYMS: Record<string, string[]> = {
  agent: ["hermes", "grok", "pulse", "bot"],
  agents: ["hermes", "grok", "pulse"],
  grok: ["hermes", "agent", "pulse"],
  hermes: ["agent", "grok", "pulse"],
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
  const base = question
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter((t) => t.length >= 2 && !STOP.has(t));
  const extra: string[] = [];
  for (const t of base) {
    const syn = SYNONYMS[t];
    if (syn) extra.push(...syn);
  }
  return [...new Set([...base, ...extra])];
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

function scoreSentence(sentence: string, tokens: string[], phrase: string): number {
  const lower = sentence.toLowerCase();
  let hits = 0;
  let consecutive = 0;
  let run = 0;
  for (const t of tokens) {
    if (lower.includes(t)) {
      hits += 1;
      run += 1;
      consecutive = Math.max(consecutive, run);
    } else {
      run = 0;
    }
  }
  if (!hits) return 0;
  const phraseBoost = phrase.length >= 8 && lower.includes(phrase) ? 0.35 : 0;
  return (
    hits / Math.max(tokens.length, 1) +
    consecutive * 0.08 +
    phraseBoost +
    Math.min(sentence.length, 220) / 900
  );
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
  const citations: AskCitation[] = [];
  const picked: { text: string; title: string }[] = [];

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
      const sc = tokens.length ? scoreSentence(s, tokens, phrase) : 0;
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
    if (best && picked.length < 3) {
      picked.push({
        text: best,
        title: h.title || (node ? noteTitle(node) : h.path),
      });
    }
  }

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
  return `No matching notes for “${question.trim()}”. Try fewer words or a path: / folder: filter.`;
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
  return fuseSearchHits(fallback, { ...signals, queryText: free }).slice(0, limit);
}

/** Prefer a heading-scoped body when the question names a section. */
export function scopedBodyForCitation(
  body: string,
  heading: string | null | undefined,
): string {
  if (!heading) return body;
  return sliceMarkdownByHeading(body, heading) ?? body;
}
