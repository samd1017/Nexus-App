import { Node, mergeAttributes } from "@tiptap/core";
import { ReactNodeViewRenderer } from "@tiptap/react";
import { MermaidView } from "@/components/editor/MermaidView";

export const Mermaid = Node.create({
  name: "mermaid",
  group: "block",
  atom: true,
  selectable: true,
  draggable: false,

  addAttributes() {
    return {
      source: {
        default: "",
        parseHTML: (el) => el.getAttribute("data-source") || el.textContent || "",
        renderHTML: (attrs) => ({ "data-source": attrs.source || "" }),
      },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-type="mermaid"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "div",
      mergeAttributes(HTMLAttributes, {
        "data-type": "mermaid",
        class: "nexus-mermaid",
      }),
    ];
  },

  addNodeView() {
    return ReactNodeViewRenderer(MermaidView, {
      as: "div",
      attrs: ({ node }) => ({
        "data-type": "mermaid",
        "data-source": String(node.attrs.source ?? ""),
        class: "nexus-mermaid",
      }),
    });
  },
});
