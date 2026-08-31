/**
 * Scale-safe search snippets.
 * Prefer loaded note body → durable FTS body → path. Never return empty
 * for ranked hits when any source text exists (unloaded large-vault rows).
 */

import { previewSnippet } from "@/lib/markdown/serialize";

/** Contextual excerpt around the first query match. */
export function extractMatchSnippet(
  content: string,
  query: string,
  radius = 50,
  max = 120,
): string {
  const plain = content.replace(/\s+/g, " ").trim();
  if (!plain) return "";
  const q = query.trim();
  if (!q) return previewSnippet(plain, max);
  const lower = plain.toLowerCase();
  const needle = q.toLowerCase();
  let i = lower.indexOf(needle);
  if (i < 0) {
    // Multi-token: find first token hit
    const token = needle
      .split(/[^a-z0-9_\u00c0-\u024f]+/i)
      .find((t) => t.length >= 2);
    if (token) i = lower.indexOf(token);
  }
  if (i < 0) return previewSnippet(plain, max);
  const from = Math.max(0, i - radius);
  const to = Math.min(plain.length, i + Math.max(needle.length, 2) + radius);
  let s = plain.slice(from, to).trim();
  if (from > 0) s = "…" + s;
  if (to < plain.length) s = s + "…";
  if (s.length > max) s = s.slice(0, max - 1) + "…";
  return s;
}

/**
 * Build a display snippet for a search/MRU row.
 * - Content matches: contextual extract from loaded or durable body
 * - Title/path matches: short body preview when available, else path
 * - Never returns "" when path or body text exists
 */
export function snippetForSearchHit(opts: {
  path: string;
  query?: string;
  matchType?: "title" | "content" | "tag";
  /** Loaded store body (undefined = unloaded) */
  content?: string;
  /** Durable FTS body when store body is unloaded */
  durableBody?: string;
}): string {
  const loaded =
    opts.content !== undefined && opts.content.length > 0
      ? opts.content
      : undefined;
  const durable =
    opts.durableBody && opts.durableBody.length > 0
      ? opts.durableBody
      : undefined;
  const body = loaded ?? durable ?? "";
  const path = opts.path || "";

  if (opts.matchType === "tag") {
    return opts.query?.startsWith("#") ? opts.query : path;
  }

  if (opts.matchType === "content" && body) {
    return (
      extractMatchSnippet(body, opts.query ?? "", 50, 120) ||
      previewSnippet(body, 120) ||
      path
    );
  }

  if (body) {
    const preview = previewSnippet(body, 90);
    if (preview) return preview;
  }

  return path;
}
