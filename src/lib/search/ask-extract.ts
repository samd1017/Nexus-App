/**
 * Extractive Ask helpers — sentence split + scoring, no search backend.
 * Tables and "try this command" catalog lines are treated as noise.
 */

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

export function isAskCatalogNoise(sentence: string): boolean {
  const s = sentence || "";
  if ((s.match(/\|/g) || []).length >= 2) return true;
  if (/ask:\s|⌘k then|ctrl\/?⌘?k then|try it/i.test(s)) return true;
  if ((s.match(/\s[·•]\s/g) || []).length >= 3) return true;
  return false;
}

export function markdownToAskPlain(md: string): string {
  return (md || "")
    .replace(/^---[\s\S]*?---\n/, "")
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/^\s*\|?[-:| ]+\|?\s*$/gm, " ")
    .replace(/^\|.+\|$/gm, " ")
    .replace(/^\s*#[\w/-]+(?:\s+#[\w/-]+)*\s*$/gm, " ")
    .replace(/!\[[^\]]*\]\([^)]+\)/g, " ")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/!?\[\[([^\]|#]+)(?:#[^\]|]+)?(?:\|[^\]]+)?\]\]/g, "$1")
    .replace(/^#{1,6}\s+(.+)$/gm, "$1.")
    .replace(/^\s*[-*+]\s+(.+)$/gm, "$1.")
    .replace(/[>*_`#]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function sentencesFromMarkdown(md: string): string[] {
  const plain = markdownToAskPlain(md);
  if (!plain) return [];
  return plain
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length >= 24 && !isAskCatalogNoise(s));
}

export function scoreAskSentence(
  sentence: string,
  tokens: string[],
  phrase: string,
  baseTokens: string[] = [],
): number {
  if (isAskCatalogNoise(sentence)) return 0;
  const lower = sentence.toLowerCase();
  const grounded = /\b(agents?|hermes|grok|share|vault|files?)\b/i.test(sentence);
  if (
    baseTokens.length &&
    !baseTokens.some((t) => t.length >= 3 && lower.includes(t)) &&
    !grounded
  ) {
    return 0;
  }
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
  const instructional = /ask:|type `|press ⌘|⌘k →|try this/i.test(sentence);
  const phraseBoost =
    !instructional && phrase.length >= 8 && lower.includes(phrase) ? 0.35 : 0;
  const answerBoost =
    /\b(same files|same folder|ordinary|markdown|disk|watcher|external)\b/i.test(
      sentence,
    )
      ? 0.2
      : 0;
  return (
    hits / Math.max(tokens.length, 1) +
    consecutive * 0.08 +
    phraseBoost +
    answerBoost +
    Math.min(sentence.length, 220) / 900
  );
}

export function askContentTokens(question: string): string[] {
  return question
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter((t) => t.length >= 2 && !STOP.has(t));
}
