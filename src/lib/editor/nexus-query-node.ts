import { Node, mergeAttributes } from "@tiptap/core";
import { ReactNodeViewRenderer } from "@tiptap/react";
import { NexusQueryView } from "@/components/editor/NexusQueryView";

export const NexusQueryBlock = Node.create({
  name: "nexusQueryBlock",
  group: "block",
  atom: true,
  selectable: true,
  draggable: false,

  addAttributes() {
    return {
      query: {
        default: "",
        parseHTML: (el) => el.getAttribute("data-query") || "",
        renderHTML: (attrs) => ({ "data-query": attrs.query || "" }),
      },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-type="nexus-query"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "div",
      mergeAttributes(HTMLAttributes, {
        "data-type": "nexus-query",
        class: "nexus-note-list",
      }),
    ];
  },

  addNodeView() {
    return ReactNodeViewRenderer(NexusQueryView, {
      as: "div",
      attrs: ({ node }) => ({
        "data-type": "nexus-query",
        "data-query": String(node.attrs.query ?? ""),
        class: "nexus-note-list",
      }),
    });
  },
});
