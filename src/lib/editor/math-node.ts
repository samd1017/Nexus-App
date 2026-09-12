import { Node, mergeAttributes } from "@tiptap/core";
import { ReactNodeViewRenderer } from "@tiptap/react";
import { MathView } from "@/components/editor/MathView";

function mathAttrs() {
  return {
    tex: {
      default: "",
      parseHTML: (el: HTMLElement) =>
        el.getAttribute("data-tex") || el.textContent || "",
      renderHTML: (attrs: { tex?: string }) => ({
        "data-tex": attrs.tex || "",
      }),
    },
  };
}

export const MathBlock = Node.create({
  name: "mathBlock",
  group: "block",
  atom: true,
  selectable: true,
  addAttributes() {
    return mathAttrs();
  },
  parseHTML() {
    return [{ tag: 'div[data-type="math-block"]' }];
  },
  renderHTML({ HTMLAttributes }) {
    return [
      "div",
      mergeAttributes(HTMLAttributes, {
        "data-type": "math-block",
        class: "nexus-math nexus-math-block",
      }),
    ];
  },
  addNodeView() {
    return ReactNodeViewRenderer(MathView, {
      as: "div",
      attrs: ({ node }) => ({
        "data-type": "math-block",
        "data-tex": String(node.attrs.tex ?? ""),
        class: "nexus-math nexus-math-block",
      }),
    });
  },
});

export const MathInline = Node.create({
  name: "mathInline",
  group: "inline",
  inline: true,
  atom: true,
  selectable: true,
  addAttributes() {
    return mathAttrs();
  },
  parseHTML() {
    return [{ tag: 'span[data-type="math-inline"]' }];
  },
  renderHTML({ HTMLAttributes }) {
    return [
      "span",
      mergeAttributes(HTMLAttributes, {
        "data-type": "math-inline",
        class: "nexus-math nexus-math-inline",
      }),
    ];
  },
  addNodeView() {
    return ReactNodeViewRenderer(MathView, {
      as: "span",
      attrs: ({ node }) => ({
        "data-type": "math-inline",
        "data-tex": String(node.attrs.tex ?? ""),
        class: "nexus-math nexus-math-inline",
      }),
    });
  },
});
