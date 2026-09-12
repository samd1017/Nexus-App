import { Node, mergeAttributes } from "@tiptap/core";
import { ReactNodeViewRenderer } from "@tiptap/react";
import { QueryView } from "@/components/editor/QueryView";

export const QueryBlock = Node.create({
  name: "queryBlock",
  group: "block",
  atom: true,
  selectable: true,
  draggable: false,

  addAttributes() {
    return {
      query: {
        default: "",
        parseHTML: (el) => el.getAttribute("data-query") || el.textContent || "",
        renderHTML: (attrs) => ({ "data-query": attrs.query || "" }),
      },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-type="query"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "div",
      mergeAttributes(HTMLAttributes, {
        "data-type": "query",
        class: "nexus-query",
      }),
    ];
  },

  addNodeView() {
    return ReactNodeViewRenderer(QueryView, {
      as: "div",
      attrs: ({ node }) => ({
        "data-type": "query",
        "data-query": String(node.attrs.query ?? ""),
        class: "nexus-query",
      }),
    });
  },
});
