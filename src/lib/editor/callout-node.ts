import { Node, mergeAttributes } from "@tiptap/core";
import {
  CALLOUT_LABELS,
  normalizeCalloutKind,
  type CalloutKind,
} from "./callout";

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    callout: {
      setCallout: (kind: CalloutKind) => ReturnType;
      unsetCallout: () => ReturnType;
    };
  }
}

export const Callout = Node.create({
  name: "callout",
  group: "block",
  content: "block+",
  defining: true,

  addAttributes() {
    return {
      kind: {
        default: "note" as CalloutKind,
        parseHTML: (element) =>
          normalizeCalloutKind(element.getAttribute("data-callout") || "note"),
        renderHTML: (attributes) => ({
          "data-callout": attributes.kind || "note",
        }),
      },
      title: {
        default: "",
        parseHTML: (element) => element.getAttribute("data-callout-title") || "",
        renderHTML: (attributes) =>
          attributes.title
            ? { "data-callout-title": attributes.title }
            : {},
      },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-type="callout"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    const kind = normalizeCalloutKind(
      String(HTMLAttributes["data-callout"] || HTMLAttributes.kind || "note"),
    );
    return [
      "div",
      mergeAttributes(HTMLAttributes, {
        "data-type": "callout",
        "data-callout": kind,
        "data-callout-label": CALLOUT_LABELS[kind],
        class: "nexus-callout",
      }),
      0,
    ];
  },

  addCommands() {
    return {
      setCallout:
        (kind) =>
        ({ commands, editor }) => {
          if (editor.isActive("callout")) {
            return commands.updateAttributes("callout", { kind });
          }
          if (commands.wrapIn(this.name, { kind })) return true;
          return commands.insertContent({
            type: this.name,
            attrs: { kind },
            content: [{ type: "paragraph" }],
          });
        },
      unsetCallout:
        () =>
        ({ commands }) =>
          commands.lift(this.name),
    };
  },
});
