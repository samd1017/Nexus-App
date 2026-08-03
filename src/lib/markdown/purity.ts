/**
 * Markdown purity — never rewrite Hermes/external notes without real user edits.
 */

/** Canonical normalize for equality (line endings + trailing space) */
export function normalizeMarkdown(s: string): string {
  return s.replace(/\r\n/g, "\n").replace(/[ \t]+\n/g, "\n").replace(/\n+$/g, "") + "\n";
}

/**
 * Semantic fingerprint: collapses whitespace noise so round-trip
 * serialization noise doesn't force disk writes.
 * Does NOT lowercase — case-only edits must still count as real changes.
 */
export function markdownFingerprint(s: string): string {
  return normalizeMarkdown(s)
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * Prefer previous on-disk markdown when next is only a formatter rewrite.
 * Returns previous if fingerprints match; otherwise normalized next.
 *
 * Do NOT use this for explicit Source-mode user edits — intentional blank
 * lines / spacing would be dropped. Use normalizeLineEndings instead.
 */
export function preferCleanWrite(previous: string, next: string): string {
  if (!previous && !next) return "\n";
  if (!previous) return normalizeMarkdown(next);
  if (normalizeMarkdown(previous) === normalizeMarkdown(next)) return previous;
  if (markdownFingerprint(previous) === markdownFingerprint(next)) {
    // Round-trip noise only — keep original formatting (Hermes-friendly)
    return previous;
  }
  return normalizeMarkdown(next);
}

/** True when visual serialization would rewrite file without user intent */
export function isOnlySerializationNoise(previous: string, next: string): boolean {
  return markdownFingerprint(previous) === markdownFingerprint(next);
}

/** Source-mode: keep user spacing, only unify line endings */
export function normalizeLineEndings(s: string): string {
  return (s || "").replace(/\r\n/g, "\n");
}
