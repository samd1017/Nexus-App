/**
 * Scale-safe search snippets.
 * Prefer loaded note body → durable FTS body → path. Never return empty
 * for ranked hits when any source text exists (unloaded large-vault rows).
 *
 * Kept free of TipTap/turndown so DurableIndex benches can bundle cleanly.
 */

/** Light plain-text preview (no TipTap deps). */
export function lightPreview(md: string, max = 120): string {
  const plain = md
    .replace(/^#+\s+/gm, "")
    .replace(/\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/g, "$1")
    .replace(/!\[[^\]]*\]\([^)]+\)/g, "")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/[`*_~>#-]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (plain.length <= max) return plain;
  return plain.slice(0, max - 1) + "…";
}

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
  if (!q) return lightPreview(plain, max);
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
  if (i < 0) return lightPreview(plain, max);
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
      lightPreview(body, 120) ||
      path
    );
  }

  if (body) {
    const preview = lightPreview(body, 90);
    if (preview) return preview;
  }

  return path;
}

export type HighlightPart = { text: string; match: boolean };

/**
 * Split `text` into parts with query-token matches marked.
 * Case-insensitive; longest tokens first to reduce overlap noise.
 */
export function highlightParts(text: string, query: string): HighlightPart[] {
  const raw = text ?? "";
  if (!raw) return [];
  const q = (query ?? "").trim();
  if (!q) return [{ text: raw, match: false }];

  const tokens = [
    ...new Set(
      q
        .toLowerCase()
        .split(/[^a-z0-9_\u00c0-\u024f#+.-]+/i)
        .map((t) => t.replace(/^#+/, ""))
        .filter((t) => t.length >= 2),
    ),
  ].sort((a, b) => b.length - a.length);

  if (!tokens.length) return [{ text: raw, match: false }];

  const lower = raw.toLowerCase();
  const ranges: Array<{ start: number; end: number }> = [];
  for (const token of tokens) {
    let from = 0;
    while (from < lower.length) {
      const i = lower.indexOf(token, from);
      if (i < 0) break;
      ranges.push({ start: i, end: i + token.length });
      from = i + token.length;
    }
  }
  if (!ranges.length) return [{ text: raw, match: false }];

  ranges.sort((a, b) => a.start - b.start || b.end - a.end);
  const merged: Array<{ start: number; end: number }> = [];
  for (const r of ranges) {
    const last = merged[merged.length - 1];
    if (last && r.start <= last.end) {
      last.end = Math.max(last.end, r.end);
    } else {
      merged.push({ ...r });
    }
  }

  const parts: HighlightPart[] = [];
  let cursor = 0;
  for (const r of merged) {
    if (r.start > cursor) {
      parts.push({ text: raw.slice(cursor, r.start), match: false });
    }
    parts.push({ text: raw.slice(r.start, r.end), match: true });
    cursor = r.end;
  }
  if (cursor < raw.length) {
    parts.push({ text: raw.slice(cursor), match: false });
  }
  return parts;
}
