/**
 * Detect open [[query]] while typing — shared by Visual editor autocomplete.
 */

import type { Editor } from "@tiptap/react";
import type { VaultNode } from "@/lib/vault/types";
import { noteTitle } from "@/lib/vault/types";
import { normalizeLinkTarget } from "@/lib/markdown/wikilinks";

export type WikilinkSuggestItem = {
  id: string;
  kind: "note" | "folder";
  title: string;
  path: string;
  /** Value inserted as [[target]] */
  target: string;
};

export type WikilinkSuggestState = {
  active: boolean;
  query: string;
  /** Absolute document position of the opening `[[` */
  from: number;
  /** Cursor position (end of query) */
  to: number;
  items: WikilinkSuggestItem[];
  selected: number;
  /** Viewport coords for the popup */
  rect: { left: number; top: number; bottom: number };
};

export function buildSuggestItems(
  nodes: Record<string, VaultNode>,
  query: string,
  limit = 40,
): WikilinkSuggestItem[] {
  const q = normalizeLinkTarget(query);
  const list: WikilinkSuggestItem[] = [];
  for (const n of Object.values(nodes)) {
    const title = n.kind === "note" ? noteTitle(n) : n.name;
    const pathNoMd = n.path.replace(/\.md$/i, "");
    const hay = `${title} ${pathNoMd}`.toLowerCase();
    if (q && !hay.includes(q) && !normalizeLinkTarget(title).includes(q)) {
      continue;
    }
    list.push({
      id: n.id,
      kind: n.kind,
      title,
      path: n.path,
      // Prefer title for notes, path for folders / nested notes with collisions
      target: n.kind === "note" ? title : pathNoMd,
    });
  }
  list.sort((a, b) => {
    // Prefer notes, then prefix match, then alpha
    if (a.kind !== b.kind) return a.kind === "note" ? -1 : 1;
    const aq = normalizeLinkTarget(a.title).startsWith(q) ? 0 : 1;
    const bq = normalizeLinkTarget(b.title).startsWith(q) ? 0 : 1;
    if (aq !== bq) return aq - bq;
    return a.title.localeCompare(b.title);
  });
  return list.slice(0, limit);
}

/** Scan text before cursor for an unfinished `[[query` (no closing ]]). */
export function detectOpenWikilink(
  editor: Editor,
): Omit<WikilinkSuggestState, "items" | "selected" | "rect"> | null {
  const { state } = editor;
  const { from } = state.selection;
  if (!state.selection.empty) return null;
  // Look back up to 80 chars in the same parent textblock
  const $from = state.selection.$from;
  const parentStart = $from.start();
  const textBefore = $from.parent.textBetween(
    Math.max(0, $from.parentOffset - 80),
    $from.parentOffset,
    "\0",
    "\0",
  );
  // Match last [[... without ]] 
  const m = textBefore.match(/\[\[([^\]\n]*)$/);
  if (!m) return null;
  const query = m[1] ?? "";
  // Don't trigger on completed links typed elsewhere
  if (query.includes("\0")) return null;
  const openAt = from - query.length - 2; // position of '[' of '[['
  if (openAt < parentStart - 1) return null;
  return {
    active: true,
    query,
    from: openAt,
    to: from,
  };
}

export function coordsAtPos(editor: Editor, pos: number) {
  try {
    const coords = editor.view.coordsAtPos(pos);
    return {
      left: coords.left,
      top: coords.top,
      bottom: coords.bottom,
    };
  } catch {
    return { left: 24, top: 120, bottom: 140 };
  }
}

/** Replace [[query with a wikilink mark pill */
export function insertWikilinkSuggestion(
  editor: Editor,
  range: { from: number; to: number },
  item: WikilinkSuggestItem,
) {
  const alias = item.title;
  const target = item.target;
  editor
    .chain()
    .focus()
    .deleteRange(range)
    .insertContent({
      type: "text",
      text: alias,
      marks: [
        {
          type: "wikilink",
          attrs: { target, alias },
        },
      ],
    })
    .insertContent(" ")
    .run();
}
