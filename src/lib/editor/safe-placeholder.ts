/**
 * Placeholder decorations rebuilt from the current document.
 *
 * The includeChildren path in @tiptap/extension-placeholder stores a
 * DecorationSet and maps it on every transaction. Replacing the slash
 * token with a nested block (callout, list, quote) — or undoing that —
 * maps a node decoration to position -1. ProseMirror then throws
 * `RangeError: Position -1 outside of fragment` from NodeType.valid,
 * and the transaction never lands. Rebuilding from the doc skips that map.
 */

import { Extension, isNodeEmpty } from "@tiptap/core";
import type { Editor } from "@tiptap/core";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";

export type SafePlaceholderProps = {
  editor: Editor;
  node: ProseMirrorNode;
  pos: number;
  hasAnchor: boolean;
};

export type SafePlaceholderOptions = {
  emptyEditorClass: string;
  emptyNodeClass: string;
  placeholder: string | ((props: SafePlaceholderProps) => string);
  showOnlyWhenEditable: boolean;
  showOnlyCurrent: boolean;
  includeChildren: boolean;
};

const PLACEHOLDER_KEY = new PluginKey("nexusSafePlaceholder");

function placeholderText(
  placeholder: SafePlaceholderOptions["placeholder"],
  props: SafePlaceholderProps,
): string {
  return typeof placeholder === "function" ? placeholder(props) : placeholder;
}

export const SafePlaceholder = Extension.create<SafePlaceholderOptions>({
  name: "placeholder",

  addOptions() {
    return {
      emptyEditorClass: "is-editor-empty",
      emptyNodeClass: "is-empty",
      placeholder: "Write something …",
      showOnlyWhenEditable: true,
      showOnlyCurrent: true,
      includeChildren: true,
    };
  },

  addProseMirrorPlugins() {
    const editor = this.editor;
    const options = this.options;

    return [
      new Plugin({
        key: PLACEHOLDER_KEY,
        props: {
          decorations(state) {
            if (editor.isDestroyed) return null;
            if (options.showOnlyWhenEditable && !editor.isEditable) return null;

            const { doc, selection } = state;
            const anchor = selection.anchor;
            const isEmptyDoc = isNodeEmpty(doc);
            const decorations: Decoration[] = [];

            const push = (node: ProseMirrorNode, pos: number) => {
              const hasAnchor = anchor >= pos && anchor <= pos + node.nodeSize;
              if (!options.showOnlyCurrent || hasAnchor) {
                if (!node.type.isTextblock || !isNodeEmpty(node)) return;
                const classes = [options.emptyNodeClass];
                if (isEmptyDoc) classes.push(options.emptyEditorClass);
                decorations.push(
                  Decoration.node(pos, pos + node.nodeSize, {
                    class: classes.join(" "),
                    "data-placeholder": placeholderText(options.placeholder, {
                      editor,
                      node,
                      pos,
                      hasAnchor,
                    }),
                  }),
                );
              }
            };

            if (options.showOnlyCurrent && !options.includeChildren) {
              const $pos = doc.resolve(Math.max(0, Math.min(anchor, doc.content.size)));
              const node = $pos.depth > 0 ? $pos.node(1) : $pos.nodeAfter;
              const pos = $pos.depth > 0 ? $pos.before(1) : anchor;
              if (node) push(node, pos);
            } else {
              doc.descendants((node, pos) => {
                if (!node.type.isTextblock) return options.includeChildren;
                push(node, pos);
                return false;
              });
            }

            return decorations.length
              ? DecorationSet.create(doc, decorations)
              : DecorationSet.empty;
          },
        },
      }),
    ];
  },
});
