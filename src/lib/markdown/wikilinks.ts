/** [[wikilink]] parsing and resolution — clean CommonMark + wikilinks on disk. */

const WIKILINK_RE = /\[\[([^\]]+)\]\]/g;

export interface WikilinkParts {
  /** Full target as written, including `#Heading` / `#^block` */
  target: string;
  /** Note path/title only — empty for same-note `[[#Heading]]` */
  noteTarget: string;
  heading: string | null;
  blockId: string | null;
  alias: string | null;
}

export interface ParsedWikilink extends WikilinkParts {
  raw: string;
  start: number;
  end: number;
}

/** Parse `Note#Heading`, `Note#^block`, `#Heading`, `^block`, plus `|alias`. */
export function parseWikilinkInner(inner: string): WikilinkParts {
  const pipe = inner.indexOf("|");
  const rawTarget = (pipe >= 0 ? inner.slice(0, pipe) : inner).trim();
  const alias = pipe >= 0 ? inner.slice(pipe + 1).trim() || null : null;

  const blockAt = rawTarget.indexOf("#^");
  if (blockAt >= 0) {
    return {
      target: rawTarget,
      noteTarget: rawTarget.slice(0, blockAt).trim(),
      heading: null,
      blockId: rawTarget.slice(blockAt + 2).trim() || null,
      alias,
    };
  }

  if (rawTarget.startsWith("^") && !rawTarget.includes("#")) {
    return {
      target: rawTarget,
      noteTarget: "",
      heading: null,
      blockId: rawTarget.slice(1).trim() || null,
      alias,
    };
  }

  const hash = rawTarget.indexOf("#");
  if (hash >= 0) {
    return {
      target: rawTarget,
      noteTarget: rawTarget.slice(0, hash).trim(),
      heading: rawTarget.slice(hash + 1).trim() || null,
      blockId: null,
      alias,
    };
  }

  return {
    target: rawTarget,
    noteTarget: rawTarget,
    heading: null,
    blockId: null,
    alias,
  };
}

/**
 * Wave A: strip fenced + inline code so `[[Example]]` in docs/snippets
 * does not pollute graph, orphans, broken links, or reverse maps.
 */
export function stripCodeForLinkScan(markdown: string): string {
  return (markdown || "")
    .replace(/```[\s\S]*?```/g, (full) => " ".repeat(full.length))
    .replace(/`[^`\n]+`/g, (full) => " ".repeat(full.length));
}

export function extractWikilinks(markdown: string): ParsedWikilink[] {
  const out: ParsedWikilink[] = [];
  const source = stripCodeForLinkScan(markdown);
  const re = new RegExp(WIKILINK_RE.source, "g");
  let m: RegExpExecArray | null;
  while ((m = re.exec(source)) !== null) {
    const raw = m[0];
    const parts = parseWikilinkInner(m[1] ?? "");
    if (!parts.target && !parts.heading && !parts.blockId) continue;
    out.push({
      raw,
      ...parts,
      start: m.index,
      end: m.index + raw.length,
    });
  }
  return out;
}

export function extractWikilinkTargets(markdown: string): string[] {
  const seen = new Set<string>();
  for (const w of extractWikilinks(markdown)) {
    if (w.noteTarget) seen.add(w.noteTarget);
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

/**
 * Turn a raw mention snippet into a sentence a person can scan.
 * Wikilinks become their visible label. Heading marks, emphasis, and
 * table pipes stay out of the way.
 */
export function presentLinkContext(raw: string): string {
  let s = raw.replace(
    /!?\[\[([^\]|#]+)(?:#[^\]|]+)?(?:\|([^\]]+))?\]\]/g,
    (_m, target: string, alias?: string) => (alias || target).trim(),
  );
  // A snippet window can slice a wikilink in half. Drop the dangling half.
  s = s.replace(/!?\[\[[^\]]*$/g, "");
  s = s.replace(/^…?\[[^\]]*\]\]\s*/g, "…");
  s = s.replace(/^[^[]*\]\]\s*/g, "");
  s = s.replace(/#{1,6}\s+/g, "");
  s = s.replace(/>\s*\[![A-Za-z]+\]\s*/g, "");
  s = s.replace(/(^|\s)>\s+/g, "$1");
  s = s.replace(/\s+[-–]\s+/g, " · ");
  s = s.replace(/\*\*|__|~~|`/g, "");
  s = s.replace(/(^|\s)[*_](.+?)[*_](?=\s|$)/g, "$1$2");
  s = s.replace(/\s*\|\s*/g, " · ");
  s = s.replace(/(^|[·\s])[-+]\s+/g, "$1");
  s = s.replace(/\s+/g, " ").replace(/\s*·\s*·\s*/g, " · ").trim();
  return s.replace(/^[·\s]+|[·\s]+$/g, "");
}
