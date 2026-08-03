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
 * Wikilink mark — pill in visual mode, serializes to [[target]] / [[target|alias]].
 * Click handling uses DOM events (WKWebView / Mac app friendly).
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
    const openFromEvent = (event: Event): boolean => {
      if (!onOpen) return false;
      const t = event.target as HTMLElement | null;
      const el = t?.closest?.("span[data-wikilink], .wikilink-pill") as
        | HTMLElement
        | null;
      if (!el) return false;
      const target =
        el.getAttribute("data-wikilink") ||
        el.getAttribute("data-alias") ||
        el.textContent?.trim();
      if (!target) return false;
      event.preventDefault();
      event.stopPropagation();
      onOpen(target);
      return true;
    };

    return [
      new Plugin({
        key: new PluginKey("wikilink-click"),
        props: {
          // Primary path — ProseMirror click
          handleClick: (_view, _pos, event) => openFromEvent(event),
          // WKWebView / Tauri often misses handleClick — use DOM events
          handleDOMEvents: {
            click: (_view, event) => openFromEvent(event),
            // Mac / WKWebView: mousedown + click both; preventDefault on mousedown keeps focus behavior sane
            mousedown: (_view, event) => {
              const t = event.target as HTMLElement | null;
              if (t?.closest?.("span[data-wikilink], .wikilink-pill")) {
                // Don't steal focus unnecessarily; navigation on click
                return false;
              }
              return false;
            },
          },
        },
      }),
    ];
  },
});

export {
  markdownToHtml as markdownWithWikilinksToHtml,
  htmlDocToMarkdown,
  htmlToMarkdown,
  markdownToHtml,
} from "./serialize";
