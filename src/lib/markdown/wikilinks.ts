/** [[wikilink]] parsing and resolution — clean CommonMark + wikilinks on disk. */

const WIKILINK_RE = /\[\[([^\]]+)\]\]/g;

export interface ParsedWikilink {
  raw: string;
  target: string;
  alias: string | null;
  start: number;
  end: number;
}

export function parseWikilinkInner(inner: string): { target: string; alias: string | null } {
  const pipe = inner.indexOf("|");
  if (pipe >= 0) {
    return {
      target: inner.slice(0, pipe).trim(),
      alias: inner.slice(pipe + 1).trim() || null,
    };
  }
  return { target: inner.trim(), alias: null };
}

export function extractWikilinks(markdown: string): ParsedWikilink[] {
  const out: ParsedWikilink[] = [];
  const re = new RegExp(WIKILINK_RE.source, "g");
  let m: RegExpExecArray | null;
  while ((m = re.exec(markdown)) !== null) {
    const raw = m[0];
    const { target, alias } = parseWikilinkInner(m[1] ?? "");
    if (!target) continue;
    out.push({ raw, target, alias, start: m.index, end: m.index + raw.length });
  }
  return out;
}

export function extractWikilinkTargets(markdown: string): string[] {
  const seen = new Set<string>();
  for (const w of extractWikilinks(markdown)) {
    seen.add(w.target);
  }
  return [...seen];
}

/**
 * Stable fingerprint of wikilink targets in a note body.
 * Used by GraphView to skip rebuilds when only non-link content changes (Wave S1).
 */
export function getContentLinkSig(markdown: string): string {
  return extractWikilinkTargets(markdown).join("\0");
}

/** Normalize a note title / path for fuzzy wikilink matching */
export function normalizeLinkTarget(target: string): string {
  return target
    .trim()
    .replace(/\.md$/i, "")
    .replace(/\\/g, "/")
    .toLowerCase();
}

export function wikilinkContext(markdown: string, start: number, end: number, radius = 60): string {
  const from = Math.max(0, start - radius);
  const to = Math.min(markdown.length, end + radius);
  let s = markdown.slice(from, to).replace(/\s+/g, " ").trim();
  if (from > 0) s = "…" + s;
  if (to < markdown.length) s = s + "…";
  return s;
}
