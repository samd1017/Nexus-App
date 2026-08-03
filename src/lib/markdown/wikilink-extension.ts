import { Mark, mergeAttributes, InputRule } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";

export interface WikilinkOptions {
  onOpen?: (target: string) => void;
  HTMLAttributes: Record<string, unknown>;
}

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    wikilink: {
      setWikilink: (attrs: { target: string; alias?: string }) => ReturnType;
    };
  }
}

/**
 * Wikilink mark — renders as pill in visual mode, serializes to [[target]] / [[target|alias]].
 */
export const Wikilink = Mark.create<WikilinkOptions>({
  name: "wikilink",
  inclusive: false,
  excludes: "_",

  addOptions() {
    return {
      onOpen: undefined,
      HTMLAttributes: {},
    };
  },

  addAttributes() {
    return {
      target: {
        default: null,
        parseHTML: (el) => el.getAttribute("data-wikilink"),
        renderHTML: (attrs) => ({ "data-wikilink": attrs.target }),
      },
      alias: {
        default: null,
        parseHTML: (el) => el.getAttribute("data-alias"),
        renderHTML: (attrs) =>
          attrs.alias ? { "data-alias": attrs.alias } : {},
      },
    };
  },

  parseHTML() {
    return [{ tag: "span[data-wikilink]" }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "span",
      mergeAttributes(this.options.HTMLAttributes, HTMLAttributes, {
        class: "wikilink-pill",
      }),
      0,
    ];
  },

  addCommands() {
    return {
      setWikilink:
        (attrs) =>
        ({ commands }) =>
          commands.setMark(this.name, attrs),
    };
  },

  addInputRules() {
    return [
      new InputRule({
        find: /\[\[([^\]|]+)(?:\|([^\]]+))?\]\]$/,
        handler: ({ range, match, chain }) => {
          const target = (match[1] ?? "").trim();
          const alias = (match[2] ?? "").trim() || target;
          if (!target) return;
          chain()
            .deleteRange(range)
            .insertContent({
              type: "text",
              text: alias,
              marks: [{ type: this.name, attrs: { target, alias } }],
            })
            .run();
        },
      }),
    ];
  },

  addProseMirrorPlugins() {
    const onOpen = this.options.onOpen;
    return [
      new Plugin({
        key: new PluginKey("wikilink-click"),
        props: {
          handleClick: (_view, _pos, event) => {
            const el = (event.target as HTMLElement)?.closest?.(
              "span[data-wikilink]",
            ) as HTMLElement | null;
            if (!el) return false;
            const target = el.getAttribute("data-wikilink");
            if (target && onOpen) {
              event.preventDefault();
              onOpen(target);
              return true;
            }
            return false;
          },
        },
      }),
    ];
  },
});

// Round-trip converters live in serialize.ts (GFM tables + tasks)
export {
  markdownToHtml as markdownWithWikilinksToHtml,
  htmlDocToMarkdown,
  htmlToMarkdown,
  markdownToHtml,
} from "./serialize";
