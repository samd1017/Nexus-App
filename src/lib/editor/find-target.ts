/**
 * Find-in-note target registry (Visual TipTap / Source textarea).
 * FindInNoteBar drives this; editors register while mounted.
 * Adapters are keyed by pane so dual-pane find does not steal the other note.
 */

export type FindMatch = { from: number; to: number };
export type FindPane = "primary" | "secondary";

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

const visualAdapters = new Map<FindPane, FindAdapter>();
const sourceAdapters = new Map<FindPane, FindAdapter>();
let mode: "visual" | "source" = "visual";
let focusedPane: FindPane = "primary";

export function registerVisualFindAdapter(
  adapter: FindAdapter | null,
  pane: FindPane = "primary",
): void {
  if (adapter) visualAdapters.set(pane, adapter);
  else visualAdapters.delete(pane);
}

export function registerSourceFindAdapter(
  adapter: FindAdapter | null,
  pane: FindPane = "primary",
): void {
  if (adapter) sourceAdapters.set(pane, adapter);
  else sourceAdapters.delete(pane);
}

export function setFindEditorMode(next: "visual" | "source"): void {
  mode = next;
}

export function setFindFocusPane(pane: FindPane): void {
  focusedPane = pane;
}

export function getFindFocusPane(): FindPane {
  return focusedPane;
}

export function getActiveFindAdapter(pane?: FindPane): FindAdapter | null {
  const key = pane ?? focusedPane;
  const map = mode === "source" ? sourceAdapters : visualAdapters;
  return map.get(key) ?? null;
}

/** Dev/test hook — active find adapter presence. */
export function __debugFindTarget(): {
  mode: "visual" | "source";
  hasVisual: boolean;
  hasSource: boolean;
} {
  return {
    mode,
    hasVisual: visualAdapters.size > 0,
    hasSource: sourceAdapters.size > 0,
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
