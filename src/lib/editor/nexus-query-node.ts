import { Node, mergeAttributes } from "@tiptap/core";
import { ReactNodeViewRenderer } from "@tiptap/react";
import { NexusQueryView } from "@/components/editor/NexusQueryView";

/** Fence names this block reads and writes back unchanged. */
export type NexusQueryFence = "nexus-query" | "dataview" | "tasks";

export function queryFence(value: unknown): NexusQueryFence {
  return value === "dataview" || value === "tasks" ? value : "nexus-query";
}

function fenceAttr(value: unknown): Record<string, string> {
  const fence = queryFence(value);
  return fence === "nexus-query" ? {} : { "data-lang": fence };
}

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
      lang: {
        default: "nexus-query",
        parseHTML: (el) => queryFence(el.getAttribute("data-lang")),
        renderHTML: (attrs) => fenceAttr(attrs.lang),
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
        ...fenceAttr(node.attrs.lang),
        class: "nexus-note-list",
      }),
    });
  },
});
