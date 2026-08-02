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

const AMP = "&" + "amp;";
const LT = "&" + "lt;";
const GT = "&" + "gt;";
const QUOT = "&" + "quot;";

function escapeAttr(s: string): string {
  return s.split("&").join(AMP).split('"').join(QUOT).split("<").join(LT);
}

function escapeText(s: string): string {
  return s.split("&").join(AMP).split("<").join(LT).split(">").join(GT);
}

function escapeCode(s: string): string {
  return s.split("&").join(AMP).split("<").join(LT);
}

/** Convert markdown with [[wikilinks]] into HTML TipTap can parse */
export function markdownWithWikilinksToHtml(md: string): string {
  const lines = md.replace(/\r\n/g, "\n").split("\n");
  const htmlParts: string[] = [];
  let inCode = false;
  let codeBuf: string[] = [];
  let listType: "ul" | "ol" | null = null;

  const flushList = () => {
    if (listType) {
      htmlParts.push(`</${listType}>`);
      listType = null;
    }
  };

  const inline = (text: string) => {
    let t = escapeText(text);
    t = t.replace(/`([^`]+)`/g, "<code>$1</code>");
    t = t.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
    t = t.replace(/\*([^*]+)\*/g, "<em>$1</em>");
    t = t.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<img src="$2" alt="$1" />');
    t = t.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');
    t = t.replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_m, target, alias) => {
      const a = (alias ?? target).trim();
      const tg = target.trim();
      return `<span data-wikilink="${escapeAttr(tg)}" data-alias="${escapeAttr(a)}" class="wikilink-pill">${escapeText(a)}</span>`;
    });
    return t;
  };

  for (const line of lines) {
    if (line.startsWith("```")) {
      if (inCode) {
        htmlParts.push(`<pre><code>${escapeCode(codeBuf.join("\n"))}</code></pre>`);
        codeBuf = [];
        inCode = false;
      } else {
        flushList();
        inCode = true;
      }
      continue;
    }
    if (inCode) {
      codeBuf.push(line);
      continue;
    }

    if (/^---+$/.test(line.trim())) {
      flushList();
      htmlParts.push("<hr>");
      continue;
    }

    const heading = /^(#{1,6})\s+(.+)$/.exec(line);
    if (heading) {
      flushList();
      const level = heading[1].length;
      htmlParts.push(`<h${level}>${inline(heading[2])}</h${level}>`);
      continue;
    }

    const task = /^[-*]\s+\[([ xX])\]\s+(.+)$/.exec(line);
    if (task) {
      if (listType !== "ul") {
        flushList();
        htmlParts.push("<ul>");
        listType = "ul";
      }
      const checked = task[1].toLowerCase() === "x";
      htmlParts.push(
        `<li data-type="taskItem" data-checked="${checked}"><label><input type="checkbox" ${checked ? "checked" : ""}/></label><div>${inline(task[2])}</div></li>`,
      );
      continue;
    }

    const ul = /^[-*]\s+(.+)$/.exec(line);
    if (ul) {
      if (listType !== "ul") {
        flushList();
        htmlParts.push("<ul>");
        listType = "ul";
      }
      htmlParts.push(`<li><p>${inline(ul[1])}</p></li>`);
      continue;
    }

    const ol = /^(\d+)\.\s+(.+)$/.exec(line);
    if (ol) {
      if (listType !== "ol") {
        flushList();
        htmlParts.push("<ol>");
        listType = "ol";
      }
      htmlParts.push(`<li><p>${inline(ol[2])}</p></li>`);
      continue;
    }

    if (line.startsWith("> ")) {
      flushList();
      htmlParts.push(`<blockquote><p>${inline(line.slice(2))}</p></blockquote>`);
      continue;
    }

    if (!line.trim()) {
      flushList();
      continue;
    }

    flushList();
    htmlParts.push(`<p>${inline(line)}</p>`);
  }
  flushList();
  if (inCode) {
    htmlParts.push(`<pre><code>${escapeCode(codeBuf.join("\n"))}</code></pre>`);
  }
  return htmlParts.join("") || "<p></p>";
}

/** Serialize TipTap HTML-ish document content back to clean markdown */
export function htmlDocToMarkdown(root: HTMLElement): string {
  const parts: string[] = [];

  const walkInline = (node: Node): string => {
    if (node.nodeType === Node.TEXT_NODE) return node.textContent ?? "";
    if (node.nodeType !== Node.ELEMENT_NODE) return "";
    const el = node as HTMLElement;
    const tag = el.tagName.toLowerCase();
    const inner = Array.from(el.childNodes).map(walkInline).join("");

    if (el.hasAttribute("data-wikilink")) {
      const target = el.getAttribute("data-wikilink") || inner;
      const alias = el.getAttribute("data-alias");
      if (alias && alias !== target) return `[[${target}|${alias}]]`;
      return `[[${target}]]`;
    }
    if (tag === "strong" || tag === "b") return `**${inner}**`;
    if (tag === "em" || tag === "i") return `*${inner}*`;
    if (tag === "code") return "`" + inner + "`";
    if (tag === "a") {
      const href = el.getAttribute("href") || "";
      return `[${inner}](${href})`;
    }
    if (tag === "br") return "\n";
    return inner;
  };

  const walkBlock = (el: HTMLElement) => {
    const tag = el.tagName.toLowerCase();
    if (tag === "h1") parts.push(`# ${walkInline(el)}`);
    else if (tag === "h2") parts.push(`## ${walkInline(el)}`);
    else if (tag === "h3") parts.push(`### ${walkInline(el)}`);
    else if (tag === "h4") parts.push(`#### ${walkInline(el)}`);
    else if (tag === "h5") parts.push(`##### ${walkInline(el)}`);
    else if (tag === "h6") parts.push(`###### ${walkInline(el)}`);
    else if (tag === "p") parts.push(walkInline(el));
    else if (tag === "blockquote") {
      const text = walkInline(el);
      parts.push(text.split("\n").map((l) => `> ${l}`).join("\n"));
    } else if (tag === "pre") {
      const code = el.textContent ?? "";
      parts.push("```\n" + code.replace(/\n$/, "") + "\n```");
    } else if (tag === "hr") parts.push("---");
    else if (tag === "ul" || tag === "ol") {
      let i = 1;
      for (const child of Array.from(el.children)) {
        if (child.tagName.toLowerCase() !== "li") continue;
        const li = child as HTMLElement;
        if (li.getAttribute("data-type") === "taskItem") {
          const checked = li.getAttribute("data-checked") === "true";
          const text = walkInline(li).replace(/^\s*/, "");
          parts.push(`- [${checked ? "x" : " "}] ${text}`);
        } else {
          const prefix = tag === "ol" ? `${i}. ` : "- ";
          parts.push(prefix + walkInline(li).trim());
          i++;
        }
      }
    } else if (tag === "table") {
      const rows = Array.from(el.querySelectorAll("tr"));
      rows.forEach((row, ri) => {
        const cells = Array.from(row.querySelectorAll("th,td")).map((c) =>
          (c.textContent ?? "").trim(),
        );
        parts.push("| " + cells.join(" | ") + " |");
        if (ri === 0) {
          parts.push("| " + cells.map(() => "---").join(" | ") + " |");
        }
      });
    } else if (tag === "img") {
      const alt = el.getAttribute("alt") || "";
      const src = el.getAttribute("src") || "";
      parts.push(`![${alt}](${src})`);
    } else {
      for (const child of Array.from(el.children)) {
        walkBlock(child as HTMLElement);
      }
    }
  };

  for (const child of Array.from(root.childNodes)) {
    if (child.nodeType === Node.ELEMENT_NODE) walkBlock(child as HTMLElement);
  }

  const out: string[] = [];
  for (let i = 0; i < parts.length; i++) {
    const p = parts[i];
    out.push(p);
    const next = parts[i + 1];
    if (!next) continue;
    const listish = (s: string) => /^(- |\d+\. )/.test(s);
    if (listish(p) && listish(next)) continue;
    out.push("");
  }
  return out.join("\n").replace(/\n{3,}/g, "\n\n").trimEnd() + "\n";
}
