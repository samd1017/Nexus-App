import { Node, mergeAttributes } from "@tiptap/core";
import { ReactNodeViewRenderer } from "@tiptap/react";
import { EmbedView } from "@/components/editor/EmbedView";

export const Embed = Node.create({
  name: "embed",
  group: "block",
  atom: true,
  selectable: true,
  draggable: false,

  addAttributes() {
    return {
      target: {
        default: "",
        parseHTML: (el) => el.getAttribute("data-embed-target") || "",
        renderHTML: (attrs) => ({ "data-embed-target": attrs.target || "" }),
      },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-type="embed"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "div",
      mergeAttributes(HTMLAttributes, {
        "data-type": "embed",
        class: "nexus-embed",
      }),
    ];
  },

  addNodeView() {
    return ReactNodeViewRenderer(EmbedView, {
      as: "div",
      attrs: ({ node }) => ({
        "data-type": "embed",
        "data-embed-target": String(node.attrs.target ?? ""),
        class: "nexus-embed",
      }),
    });
  },
});
