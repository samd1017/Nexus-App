/**
 * TipTap / ProseMirror plugin: highlight all find-in-note matches.
 */

import { Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import type { FindMatch } from "@/lib/editor/find-target";

export type FindHighlightState = {
  matches: FindMatch[];
  activeIndex: number;
};

const FIND_HL_KEY = new PluginKey<FindHighlightState>("nexusFindHighlight");

export function getFindHighlightState(
  state: import("@tiptap/pm/state").EditorState,
): FindHighlightState | undefined {
  return FIND_HL_KEY.getState(state);
}

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    findHighlight: {
      setFindHighlights: (
        matches: FindMatch[],
        activeIndex?: number,
      ) => ReturnType;
      clearFindHighlights: () => ReturnType;
    };
  }
}

export const FindHighlight = Extension.create({
  name: "findHighlight",

  addCommands() {
    return {
      setFindHighlights:
        (matches, activeIndex = 0) =>
        ({ tr, dispatch }) => {
          if (dispatch) {
            tr.setMeta(FIND_HL_KEY, {
              matches,
              activeIndex: matches.length
                ? Math.max(0, Math.min(activeIndex, matches.length - 1))
                : 0,
            });
            dispatch(tr);
          }
          return true;
        },
      clearFindHighlights:
        () =>
        ({ tr, dispatch }) => {
          if (dispatch) {
            tr.setMeta(FIND_HL_KEY, { matches: [], activeIndex: 0 });
            dispatch(tr);
          }
          return true;
        },
    };
  },

  addProseMirrorPlugins() {
    return [
      new Plugin<FindHighlightState>({
        key: FIND_HL_KEY,
        state: {
          init: () => ({ matches: [], activeIndex: 0 }),
          apply(tr, value) {
            const meta = tr.getMeta(FIND_HL_KEY) as
              | FindHighlightState
              | undefined;
            if (meta) return meta;
            if (!tr.docChanged || !value.matches.length) return value;
            // Drop highlights on doc change — FindInNoteBar will recompute
            return { matches: [], activeIndex: 0 };
          },
        },
        props: {
          decorations(state) {
            const data = FIND_HL_KEY.getState(state);
            if (!data?.matches.length) return null;
            const decos = data.matches.map((m, i) =>
              Decoration.inline(m.from, m.to, {
                class:
                  i === data.activeIndex
                    ? "nexus-find-match nexus-find-match-active"
                    : "nexus-find-match",
              }),
            );
            return DecorationSet.create(state.doc, decos);
          },
        },
      }),
    ];
  },
});
