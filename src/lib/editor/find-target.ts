/**
 * Find-in-note target registry (Visual TipTap / Source textarea).
 * FindInNoteBar drives this; editors register while mounted.
 */

export type FindMatch = { from: number; to: number };

export type FindAdapter = {
  /** Collect all matches for the query (case-insensitive). */
  findAll: (query: string) => FindMatch[];
  /** Select / scroll to one match. */
  reveal: (match: FindMatch, index: number, total: number) => void;
  /** Clear any find decorations / selection chrome. */
  clear: () => void;
  /** Replace one match; returns whether the document changed. */
  replace?: (match: FindMatch, text: string) => boolean;
  /** Replace every match of query; returns count replaced. */
  replaceAll?: (query: string, text: string) => number;
};

let visualAdapter: FindAdapter | null = null;
let sourceAdapter: FindAdapter | null = null;
let mode: "visual" | "source" = "visual";

export function registerVisualFindAdapter(adapter: FindAdapter | null): void {
  visualAdapter = adapter;
}

export function registerSourceFindAdapter(adapter: FindAdapter | null): void {
  sourceAdapter = adapter;
}

export function setFindEditorMode(next: "visual" | "source"): void {
  mode = next;
}

export function getActiveFindAdapter(): FindAdapter | null {
  return mode === "source" ? sourceAdapter : visualAdapter;
}

/** Dev/test hook — active find adapter presence. */
export function __debugFindTarget(): {
  mode: "visual" | "source";
  hasVisual: boolean;
  hasSource: boolean;
} {
  return {
    mode,
    hasVisual: Boolean(visualAdapter),
    hasSource: Boolean(sourceAdapter),
  };
}

/** Collect case-insensitive substring matches in plain text. */
export function collectPlainMatches(
  text: string,
  query: string,
): FindMatch[] {
  const q = query.trim();
  if (!q || !text) return [];
  const lower = text.toLowerCase();
  const needle = q.toLowerCase();
  const out: FindMatch[] = [];
  let from = 0;
  while (from <= lower.length - needle.length) {
    const i = lower.indexOf(needle, from);
    if (i < 0) break;
    out.push({ from: i, to: i + needle.length });
    from = i + Math.max(1, needle.length);
  }
  return out;
}
