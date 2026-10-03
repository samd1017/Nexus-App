/**
 * Clean Markdown serialization helpers.
 * On-disk format: CommonMark + GFM + [[wikilinks]] — never proprietary HTML.
 * Used for Visual ↔ Source round-trips (must stay lossless for tables/tasks).
 */

import { marked } from "marked";
import TurndownService from "turndown";
export {
  preferCleanWrite,
  normalizeMarkdown,
  markdownFingerprint,
  normalizeLineEndings,
} from "./purity";
import {
  styleFromMarker,
  markerForStyle,
  isBulletStyle,
  type BulletStyle,
} from "./bullet-styles";
import { sanitizeNoteHtml } from "./sanitize-html";
import {
  CALLOUT_LABELS,
  normalizeCalloutKind,
  promoteCalloutBlockquotes,
} from "@/lib/editor/callout";
import {
  holdMathTokens,
  promoteMermaidBlocks,
  promoteNexusQueryBlocks,
  promoteQueryBlocks,
  restoreMathTokens,
} from "@/lib/editor/special-blocks";
import { splitFrontmatter } from "@/lib/editor/frontmatter";

marked.setOptions({
  gfm: true,
  breaks: false,
});

/**
 * Atom blocks reach turndown as empty placeholders. Turndown skips empty
 * elements before rules run, so these types must bypass that or they vanish.
 */
const ATOM_BLOCK_TYPES = new Set(["mermaid", "embed", "nexus-query", "query", "math-block", "math-inline"]);

type TurndownNode = HTMLElement & { isBlank?: boolean; isBlock?: boolean };

const turndown: TurndownService = new TurndownService({
  headingStyle: "atx",
  codeBlockStyle: "fenced",
  bulletListMarker: "-",
  emDelimiter: "*",
  strongDelimiter: "**",
  hr: "---",
  blankReplacement: (content, node) => {
    const el = node as TurndownNode;
    const type = typeof el.getAttribute === "function" ? el.getAttribute("data-type") : null;
    if (type && ATOM_BLOCK_TYPES.has(type)) {
      el.isBlank = false;
      const rules = (turndown as unknown as { rules: { forNode(n: Node): TurndownService.Rule } }).rules;
      const rule = rules.forNode(el);
      if (typeof rule.replacement === "function") return rule.replacement(content, el, turndown.options);
    }
    return el.isBlock ? "\n\n" : "";
  },
});

/**
 * Turndown escapes every bracket, which turns `[due:: 2026-10-03]` and `[/]`
 * into `\[…\]` on each Visual save. A bracket pair that cannot start a link
 * (not followed by `(`, `[`, or `:`) reads as plain text either way, so it is
 * written as typed.
 */
const escapeText = turndown.escape.bind(turndown);
turndown.escape = (text: string) =>
  escapeText(text).replace(/\\\[((?:[^[\]\\\n]|\\[^[\]\n])*)\\\](?![([:])/g, "[$1]");

turndown.addRule("frontmatter", {
  filter: (node) =>
    node.nodeName === "PRE" &&
    (node as HTMLElement).getAttribute("data-frontmatter") === "true",
  replacement: (_content, node) => {
    const code = (node as HTMLElement).querySelector("code");
    const yaml = code?.textContent ?? (node as HTMLElement).textContent ?? "";
    return `---\n${yaml.replace(/\n+$/, "")}\n---\n\n`;
  },
});

turndown.addRule("highlight", {
  filter: (node) =>
    node.nodeName === "MARK" ||
    (node as HTMLElement).classList?.contains("nexus-highlight"),
  replacement: (content) => `==${content}==`,
});

turndown.addRule("mermaid", {
  filter: (node) =>
    node.nodeName === "DIV" &&
    (node as HTMLElement).getAttribute("data-type") === "mermaid",
  replacement: (_content, node) => {
    const src = (node as HTMLElement).getAttribute("data-source") || "";
    return `\n\`\`\`mermaid\n${src.replace(/\n+$/, "")}\n\`\`\`\n\n`;
  },
});

turndown.addRule("embed", {
  filter: (node) =>
    node.nodeName === "DIV" &&
    (node as HTMLElement).getAttribute("data-type") === "embed",
  replacement: (_content, node) => {
    const el = node as HTMLElement;
    const target =
      el.getAttribute("data-embed-target") ||
      [el.getAttribute("data-embed-note"), el.getAttribute("data-embed-heading") ? `#${el.getAttribute("data-embed-heading")}` : "", el.getAttribute("data-embed-block") ? `#^${el.getAttribute("data-embed-block")}` : ""]
        .filter(Boolean)
        .join("") ||
      "";
    return `\n\n![[${target}]]\n\n`;
  },
});

turndown.addRule("nexusQueryBlock", {
  filter: (node) =>
    node.nodeName === "DIV" &&
    (node as HTMLElement).getAttribute("data-type") === "nexus-query",
  replacement: (_content, node) => {
    const q = (node as HTMLElement).getAttribute("data-query") || "";
    const fence = (node as HTMLElement).getAttribute("data-lang") === "dataview" ? "dataview" : "nexus-query";
    return `\n\`\`\`${fence}\n${q.replace(/\n+$/, "")}\n\`\`\`\n\n`;
  },
});

turndown.addRule("queryBlock", {
  filter: (node) =>
    node.nodeName === "DIV" &&
    (node as HTMLElement).getAttribute("data-type") === "query",
  replacement: (_content, node) => {
    const q = (node as HTMLElement).getAttribute("data-query") || "";
    return `\n\`\`\`query\n${q.replace(/\n+$/, "")}\n\`\`\`\n\n`;
  },
});

turndown.addRule("mathBlock", {
  filter: (node) =>
    node.nodeName === "DIV" &&
    (node as HTMLElement).getAttribute("data-type") === "math-block",
  replacement: (_content, node) => {
    const tex = (node as HTMLElement).getAttribute("data-tex") || "";
    return `\n$$\n${tex}\n$$\n\n`;
  },
});

turndown.addRule("mathInline", {
  filter: (node) =>
    node.nodeName === "SPAN" &&
    (node as HTMLElement).getAttribute("data-type") === "math-inline",
  replacement: (_content, node) => {
    const tex = (node as HTMLElement).getAttribute("data-tex") || "";
    return `$${tex}$`;
  },
});

turndown.addRule("callout", {
  filter: (node) =>
    node.nodeName === "DIV" &&
    (node as HTMLElement).getAttribute("data-type") === "callout",
  replacement: (content, node) => {
    const el = node as HTMLElement;
    const kind = normalizeCalloutKind(el.getAttribute("data-callout") || "note");
    const title =
      el.getAttribute("data-callout-title") ||
      (el.getAttribute("data-callout-label") !== CALLOUT_LABELS[kind]
        ? el.getAttribute("data-callout-label")
        : "") ||
      "";
    const body = content.replace(/^\n+/, "").replace(/\n+$/, "");
    const header = title
      ? `> [!${kind.toUpperCase()}] ${title}`
      : `> [!${kind.toUpperCase()}]`;
    const quoted = body
      .split("\n")
      .map((line) => (line.length ? `> ${line}` : ">"))
      .join("\n");
    return `\n\n${header}\n${quoted}\n\n`;
  },
});

turndown.addRule("wikilink", {
  filter: (node) =>
    node.nodeName === "SPAN" &&
    (node as HTMLElement).getAttribute("data-wikilink") != null,
  replacement: (_content, node) => {
    const el = node as HTMLElement;
    const target = el.getAttribute("data-wikilink") || el.textContent || "";
    const alias = el.getAttribute("data-alias");
    if (alias && alias !== target) return `[[${target}|${alias}]]`;
    return `[[${target}]]`;
  },
});

turndown.addRule("taskListItem", {
  filter: (node) => {
    const el = node as HTMLElement;
    if (el.nodeName !== "LI") return false;
    if (el.getAttribute("data-type") === "taskItem") return true;
    return !!el.querySelector?.(':scope > label input[type="checkbox"]');
  },
  replacement: (content, node) => {
    const el = node as HTMLElement;
    const input =
      (el.querySelector(
        'input[type="checkbox"]',
      ) as HTMLInputElement | null) ?? null;
    const checked =
      el.getAttribute("data-checked") === "true" ||
      !!input?.checked ||
      input?.hasAttribute("checked");
    const status = el.getAttribute("data-status");
    // A ticked box writes x; unticking an in-progress or other custom box puts its symbol back.
    const mark = checked ? "x" : status || " ";
    // Preserve nested task lists / paragraphs. Flattening every newline
    // to a space was dropping Obsidian-style subtasks on Visual → disk.
    const raw = content
      .replace(/^\s*\[[ xX]\]\s*/, "")
      .replace(/^\n+/, "")
      .replace(/\n+$/, "");
    const lines = raw.split("\n");
    const first = (lines[0] ?? "").trim();
    const rest = lines
      .slice(1)
      .map((line) => {
        if (!line.trim()) return "";
        // Nested list lines keep their own indent, so a sub-subtask stays two levels down.
        if (/^\s*[-*+]/.test(line) || /^\s*\d+\./.test(line)) {
          return `  ${line.replace(/^\n+/, "")}`;
        }
        return `  ${line.trim()}`;
      })
      .filter(Boolean);
    const body = rest.length ? `${first}\n${rest.join("\n")}` : first;
    return `- [${mark}] ${body}\n`;
  },
});

/** `1. item` as people type it (turndown's default writes `1.  item`). */
turndown.addRule("orderedListItem", {
  filter: (node) => node.nodeName === "LI" && node.parentNode?.nodeName === "OL",
  replacement: (content, node) => {
    const el = node as HTMLElement;
    const list = el.parentElement as HTMLElement;
    const start = Number(list.getAttribute("start") || 1);
    const prefix = `${start + Array.prototype.indexOf.call(list.children, el)}. `;
    const body = content
      .replace(/^\n+/, "")
      .replace(/\n+$/, "\n")
      .replace(/\n(?=[^\n])/g, `\n${" ".repeat(prefix.length)}`);
    return prefix + body + (el.nextSibling && !/\n$/.test(body) ? "\n" : "");
  },
});

/** Cell → markdown with basic strong/em when present. */
function tableCellToMd(cell: Element): string {
  const clone = cell.cloneNode(true) as HTMLElement;
  const each = (selector: string, fn: (el: Element) => void) => Array.from(clone.querySelectorAll(selector)).forEach(fn);
  each("code", (el) => {
    el.replaceWith(`\`${(el.textContent ?? "").replace(/\n+/g, " ")}\``);
  });
  each("[data-wikilink]", (el) => {
    const target = el.getAttribute("data-wikilink") || el.textContent || "";
    const alias = el.getAttribute("data-alias");
    el.replaceWith(alias && alias !== target ? `[[${target}|${alias}]]` : `[[${target}]]`);
  });
  each("a[href]", (el) => {
    el.replaceWith(`[${el.textContent ?? ""}](${el.getAttribute("href")})`);
  });
  each("mark", (el) => {
    el.replaceWith(`==${el.textContent ?? ""}==`);
  });
  // Inline strong/em first so textContent order is preserved after replace
  each("strong, b", (el) => {
    const t = (el.textContent ?? "").replace(/\n+/g, " ");
    el.replaceWith(`**${t}**`);
  });
  each("em, i", (el) => {
    const t = (el.textContent ?? "").replace(/\n+/g, " ");
    el.replaceWith(`*${t}*`);
  });
  const t = (clone.textContent ?? "").replace(/\n+/g, " ").trim();
  return t.replace(/\|/g, "\\|");
}

turndown.addRule("table", {
  filter: "table",
  replacement: (_content, node) => {
    const table = node as HTMLTableElement;
    const rows = Array.from(table.querySelectorAll("tr"));
    if (!rows.length) return "";
    const lines: string[] = [];
    rows.forEach((row, ri) => {
      const cells = Array.from(row.querySelectorAll("th,td")).map((c) =>
        tableCellToMd(c),
      );
      if (!cells.length) return;
      lines.push("| " + cells.join(" | ") + " |");
      if (ri === 0) {
        lines.push("| " + cells.map(() => "---").join(" | ") + " |");
      }
    });
    return "\n\n" + lines.join("\n") + "\n\n";
  },
});


turndown.addRule("styledListItem", {
  filter: (node) => {
    if (node.nodeName !== "LI") return false;
    const el = node as HTMLElement;
    if (el.getAttribute("data-type") === "taskItem") return false;
    if (el.querySelector?.(':scope > label input[type="checkbox"]')) return false;
    const parent = el.parentElement;
    return !!(parent && parent.nodeName === "UL" && parent.getAttribute("data-type") !== "taskList");
  },
  replacement: (content, node) => {
    const el = node as HTMLElement;
    const parent = el.parentElement as HTMLElement | null;
    const styleAttr = parent?.getAttribute("data-bullet") || "disc";
    const style: BulletStyle = isBulletStyle(styleAttr) ? styleAttr : "disc";
    const marker = markerForStyle(style);
    const body = content
      .replace(/^\n+/, "")
      .replace(/\n+$/, "")
      .replace(/\n/g, "\n    ")
      .trim();
    return `${marker} ${body}\n`;
  },
});


turndown.addRule("vaultImage", {
  filter: "img",
  replacement: (_content, node) => {
    const img = node as HTMLElement;
    const vault = img.getAttribute("data-vault-src");
    let src = vault || img.getAttribute("src") || "";
    // never write blob: into markdown
    if (src.startsWith("blob:") && vault) src = vault;
    if (src.startsWith("blob:")) return "";
    const alt = img.getAttribute("alt") || "";
    const widthRaw =
      img.getAttribute("width") ||
      img.getAttribute("data-width") ||
      (img.style?.width ? String(parseInt(img.style.width, 10)) : "");
    const wNum = widthRaw ? parseInt(String(widthRaw), 10) : NaN;
    const wrap = img.closest?.(".nexus-image-wrap") as HTMLElement | null;
    const align =
      img.getAttribute("data-align") ||
      wrap?.getAttribute("data-align") ||
      "center";
    if (!src) return "";
    // Sized or non-default align → HTML so layout survives round-trip
    if ((Number.isFinite(wNum) && wNum > 0) || (align && align !== "center")) {
      const wAttr =
        Number.isFinite(wNum) && wNum > 0 ? ` width="${wNum}"` : "";
      const aAttr =
        align && align !== "center" ? ` data-align="${escapeAttr(align)}"` : "";
      const vAttr = vault ? ` data-vault-src="${escapeAttr(vault)}"` : "";
      return `\n\n<img src="${escapeAttr(src)}" alt="${escapeAttr(alt)}"${wAttr}${aAttr}${vAttr} />\n\n`;
    }
    return `![${alt.replace(/[[\]]/g, "")}](${src})`;
  },
});

const AMP = "&" + "amp;";
const LT = "&" + "lt;";
const GT = "&" + "gt;";
const QUOT = "&" + "quot;";

function escapeHtml(s: string): string {
  return s
    .split("&")
    .join(AMP)
    .split("<")
    .join(LT)
    .split(">")
    .join(GT)
    .split('"')
    .join(QUOT);
}

function escapeAttr(s: string): string {
  return s.split("&").join(AMP).split('"').join(QUOT).split("<").join(LT);
}

function unescapeAttr(s: string): string {
  return s.split(QUOT).join('"').split(LT).join("<").split(AMP).join("&");
}


/** Tag top-level <ul> with data-bullet from Markdown markers (- * +). */
function annotateBulletListsFromMarkdown(md: string, html: string): string {
  if (typeof DOMParser === "undefined") return html;
  const markers: BulletStyle[] = [];
  const lines = md.replace(/\r\n/g, "\n").split("\n");
  let inCode = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.trimStart().startsWith("```")) {
      inCode = !inCode;
      continue;
    }
    if (inCode) continue;
    if (/^\s*[-*+]\s+\[[ xX]\]\s+/.test(line)) continue;
    const m = /^([-*+])\s+/.exec(line);
    if (!m) continue;
    const prev = i > 0 ? lines[i - 1] : "";
    const prevIsList =
      /^[-*+]\s+/.test(prev) && !/^\s*[-*+]\s+\[[ xX]\]\s+/.test(prev);
    if (!prevIsList) markers.push(styleFromMarker(m[1]));
  }

  const doc = new DOMParser().parseFromString(
    `<div id="nx-root">${html}</div>`,
    "text/html",
  );
  const root = doc.getElementById("nx-root");
  if (!root) return html;
  let mi = 0;
  root.querySelectorAll("ul").forEach((ul) => {
    if (ul.getAttribute("data-type") === "taskList") return;
    const parentUl = ul.parentElement?.closest("ul");
    if (parentUl && parentUl.getAttribute("data-type") !== "taskList") {
      if (!ul.getAttribute("data-bullet")) ul.setAttribute("data-bullet", "circle");
      return;
    }
    ul.setAttribute("data-bullet", markers[mi++] ?? "disc");
  });
  return root.innerHTML;
}

/** `[/] `, `[-] `, `[>] `: a task status marked does not draw as a checkbox. */
const STATUS_PREFIX = /^\s*\[([^\]\s])\][ \t]+/;
const BLOCK_TAG = /^(P|DIV|H[1-6]|UL|OL|PRE|BLOCKQUOTE|TABLE|HR)$/;

function firstContent(el: Element): ChildNode | null {
  for (const n of Array.from(el.childNodes)) {
    if (n.nodeType === 3 && !(n.textContent ?? "").trim()) continue;
    return n;
  }
  return null;
}

/** Where an item's checkbox and text start: its first paragraph in a loose list, else the item. */
function itemHead(li: Element): Element {
  const first = firstContent(li);
  return first instanceof Element && first.tagName === "P" ? first : li;
}

function itemBox(li: Element): HTMLInputElement | null {
  const first = firstContent(itemHead(li));
  return first instanceof Element && first.tagName === "INPUT" && first.getAttribute("type") === "checkbox"
    ? (first as HTMLInputElement)
    : null;
}

function itemStatus(li: Element): { text: Text; status: string } | null {
  const first = firstContent(itemHead(li));
  if (!first || first.nodeType !== 3) return null;
  const m = STATUS_PREFIX.exec(first.textContent ?? "");
  return m ? { text: first as Text, status: m[1] as string } : null;
}

function toTaskItem(li: HTMLElement): void {
  const doc = li.ownerDocument;
  const box = itemBox(li);
  let checked = false;
  let status: string | null = null;
  if (box) {
    checked = box.checked || box.hasAttribute("checked");
    box.remove();
  } else {
    const found = itemStatus(li);
    if (found) {
      status = found.status;
      found.text.textContent = (found.text.textContent ?? "").replace(STATUS_PREFIX, "");
    }
  }
  const head = itemHead(li);
  if (head !== li) head.replaceWith(...Array.from(head.childNodes));
  const inline: ChildNode[] = [];
  const blocks: ChildNode[] = [];
  for (const n of Array.from(li.childNodes)) {
    if (!blocks.length && !(n instanceof Element && BLOCK_TAG.test(n.tagName))) inline.push(n);
    else blocks.push(n);
  }
  const body = doc.createElement("div");
  const para = doc.createElement("p");
  inline.forEach((n) => para.appendChild(n));
  const lead = para.firstChild;
  if (lead?.nodeType === 3) lead.textContent = (lead.textContent ?? "").replace(/^\s+/, "");
  body.appendChild(para);
  blocks.forEach((n) => {
    if (n.nodeType === 3 && !(n.textContent ?? "").trim()) return;
    body.appendChild(n);
  });
  const label = doc.createElement("label");
  label.setAttribute("contenteditable", "false");
  const input = doc.createElement("input");
  input.setAttribute("type", "checkbox");
  if (checked) input.setAttribute("checked", "");
  label.append(input, doc.createElement("span"));
  li.replaceChildren(label, body);
  li.setAttribute("data-type", "taskItem");
  li.setAttribute("data-checked", checked ? "true" : "false");
  if (status) li.setAttribute("data-status", status);
}

/**
 * Turn checkbox lists from marked into TipTap task lists, innermost first so a
 * subtask keeps its box. A list of only tasks (any status) becomes a task list.
 * In a list that also has plain bullets, or a numbered list, TipTap has no
 * checkbox to show; for the editor the box stays as `[ ]` text so a save
 * writes it back unchanged.
 */
function normalizeTaskListsForTipTap(html: string, editor: boolean): string {
  if (typeof DOMParser === "undefined") return html;
  const doc = new DOMParser().parseFromString(
    `<div id="nx-root">${html}</div>`,
    "text/html",
  );
  const root = doc.getElementById("nx-root");
  if (!root) return html;

  for (const list of Array.from(root.querySelectorAll("ul, ol")).reverse()) {
    const items = Array.from(list.children).filter((c) => c.tagName === "LI") as HTMLElement[];
    if (!items.length) continue;
    const allTasks = list.tagName === "UL" && items.every((li) => itemBox(li) || itemStatus(li));
    if (allTasks) {
      list.setAttribute("data-type", "taskList");
      items.forEach(toTaskItem);
      continue;
    }
    if (!editor) continue;
    for (const li of items) {
      const box = itemBox(li);
      if (box) box.replaceWith(doc.createTextNode(box.checked || box.hasAttribute("checked") ? "[x]" : "[ ]"));
    }
  }

  return root.innerHTML;
}

/**
 * Markdown → HTML TipTap can parse (GFM tables, tasks, wikilink pills).
 * This is the Visual mode entry path — must not leave raw Markdown as text.
 */
export function markdownToHtml(md: string, opts: { editor?: boolean } = {}): string {
  const raw = (md || "").replace(/\r\n/g, "\n");
  if (!raw.trim()) return "<p></p>";

  // Properties live in the properties bar. Leaving them in the doc makes
  // TipTap store them as a code block and the note opens on a config dump.
  const body = splitFrontmatter(raw).body;

  // Protect fenced + inline code from wikilink promotion
  const codeHold: string[] = [];
  const withCodeHeld = body
    .replace(/```[\s\S]*?```/g, (full) => {
      const i = codeHold.length;
      codeHold.push(full);
      return `%%CODE${i}%%`;
    })
    .replace(/`[^`\n]+`/g, (full) => {
      const i = codeHold.length;
      codeHold.push(full);
      return `%%CODE${i}%%`;
    });

  const embeds: string[] = [];
  const withEmbedsHeld = withCodeHeld.replace(
    /!\[\[([^\]]+)\]\]/g,
    (_full, inner: string) => {
      const i = embeds.length;
      const pipe = inner.indexOf("|");
      embeds.push((pipe >= 0 ? inner.slice(0, pipe) : inner).trim());
      return `%%EMBED${i}%%`;
    },
  );

  const placeholders: string[] = [];
  const protectedMd = withEmbedsHeld.replace(/\[\[([^\]]+)\]\]/g, (full) => {
    const i = placeholders.length;
    placeholders.push(full);
    return `%%WIKI${i}%%`;
  });

  // Restore code tokens before marked so fences parse correctly
  const highlightHold: string[] = [];
  const withHighlights = protectedMd.replace(
    /==([^=\n]{1,400})==/g,
    (_full, inner: string) => {
      const i = highlightHold.length;
      highlightHold.push(inner);
      return `%%HL${i}%%`;
    },
  );

  const { md: withMathHeld, hold: mathHold } = holdMathTokens(withHighlights);

  const forMarked = withMathHeld.replace(/%%CODE(\d+)%%/g, (_, n) => {
    return codeHold[Number(n)] ?? "";
  });

  let html = marked.parse(forMarked, { async: false }) as string;
  // Normalize tasks while marked still has checkbox inputs, then sanitize
  // (sanitize allows input[type=checkbox] + label for TipTap task lists).
  html = normalizeTaskListsForTipTap(html, opts.editor === true);
  html = sanitizeNoteHtml(html);

  html = html.replace(/%%HL(\d+)%%/g, (_, n) => {
    const inner = highlightHold[Number(n)] ?? "";
    return `<mark class="nexus-highlight">${escapeHtml(inner)}</mark>`;
  });

  html = html.replace(/%%WIKI(\d+)%%/g, (_, n) => {
    const full = placeholders[Number(n)] ?? "";
    const inner = full.slice(2, -2);
    const pipe = inner.indexOf("|");
    const target = pipe >= 0 ? inner.slice(0, pipe).trim() : inner.trim();
    const alias = pipe >= 0 ? inner.slice(pipe + 1).trim() : target;
    return `<span data-wikilink="${escapeAttr(target)}" data-alias="${escapeAttr(alias)}" class="wikilink-pill">${escapeHtml(alias)}</span>`;
  });

  const embedHtml = (target: string) =>
    `<div data-type="embed" data-embed-target="${escapeAttr(target)}" class="nexus-embed"></div>`;
  html = html.replace(/<p>\s*%%EMBED(\d+)%%\s*<\/p>/g, (_full, n: string) => {
    const target = embeds[Number(n)] ?? "";
    return embedHtml(target);
  });
  html = html.replace(/%%EMBED(\d+)%%/g, (_full, n: string) => {
    const target = embeds[Number(n)] ?? "";
    return embedHtml(target);
  });

  html = annotateBulletListsFromMarkdown(body, html);
  html = promoteMermaidBlocks(html);
  html = promoteNexusQueryBlocks(html);
  html = promoteQueryBlocks(html);
  html = restoreMathTokens(html, mathHold);
  html = promoteCalloutBlockquotes(html);
  // Second pass after we inject wikilink HTML (keep allowlisted data-* only)
  html = sanitizeNoteHtml(html);

  return html || "<p></p>";
}

/** Markdown → HTML for the Visual editor, whose save writes it back. */
export function markdownWithWikilinksToHtml(md: string): string {
  return markdownToHtml(md, { editor: true });
}

/**
 * TipTap DOM / HTML → clean Markdown for Source + disk.
 */
export function htmlToMarkdown(html: string): string {
  if (!html || !html.trim()) return "\n";
  // Strip tip-tap trailing breaks noise
  const cleaned = html
    .replace(/<p><\/p>/g, "")
    .replace(/<br\s*class="ProseMirror-trailingBreak"\s*\/?>/gi, "");
  const md = turndown.turndown(cleaned);
  return md.replace(/\n{3,}/g, "\n\n").trimEnd() + "\n";
}

function flattenSpecialEditorBlocks(root: HTMLElement): void {
  const doc = root.ownerDocument;
  root.querySelectorAll("[data-type='mermaid'], .nexus-mermaid").forEach((el) => {
    if (!(el instanceof HTMLElement)) return;
    if (el.parentElement?.closest("[data-type='mermaid'], .nexus-mermaid")) return;
    const src =
      el.getAttribute("data-source") ||
      el.querySelector("[data-source]")?.getAttribute("data-source") ||
      "";
    const next = doc.createElement("div");
    next.setAttribute("data-type", "mermaid");
    next.setAttribute("data-source", src);
    el.replaceWith(next);
  });
  root.querySelectorAll("[data-type='math-block'], .nexus-math-block").forEach((el) => {
    if (!(el instanceof HTMLElement)) return;
    if (el.parentElement?.closest("[data-type='math-block'], .nexus-math-block")) return;
    const tex =
      el.getAttribute("data-tex") ||
      el.querySelector("[data-tex]")?.getAttribute("data-tex") ||
      "";
    const next = doc.createElement("div");
    next.setAttribute("data-type", "math-block");
    next.setAttribute("data-tex", tex);
    el.replaceWith(next);
  });
  root.querySelectorAll("[data-type='math-inline'], .nexus-math-inline").forEach((el) => {
    if (!(el instanceof HTMLElement)) return;
    if (el.parentElement?.closest("[data-type='math-inline'], .nexus-math-inline")) return;
    const tex =
      el.getAttribute("data-tex") ||
      el.querySelector("[data-tex]")?.getAttribute("data-tex") ||
      "";
    const next = doc.createElement("span");
    next.setAttribute("data-type", "math-inline");
    next.setAttribute("data-tex", tex);
    el.replaceWith(next);
  });
  root.querySelectorAll("[data-type='embed'], .nexus-embed").forEach((el) => {
    if (!(el instanceof HTMLElement)) return;
    if (el.parentElement?.closest("[data-type='embed'], .nexus-embed")) return;
    const target =
      el.getAttribute("data-embed-target") ||
      el.querySelector("[data-embed-target]")?.getAttribute("data-embed-target") ||
      "";
    const next = doc.createElement("div");
    next.setAttribute("data-type", "embed");
    next.setAttribute("data-embed-target", target);
    el.replaceWith(next);
  });
  root.querySelectorAll("[data-type='nexus-query']").forEach((el) => {
    if (!(el instanceof HTMLElement)) return;
    if (el.parentElement?.closest("[data-type='nexus-query']")) return;
    const query =
      el.getAttribute("data-query") ||
      el.querySelector("[data-query]")?.getAttribute("data-query") ||
      "";
    const fence =
      el.getAttribute("data-lang") || el.querySelector("[data-lang]")?.getAttribute("data-lang") || "";
    const next = doc.createElement("div");
    next.setAttribute("data-type", "nexus-query");
    next.setAttribute("data-query", query);
    if (fence === "dataview") next.setAttribute("data-lang", fence);
    el.replaceWith(next);
  });
  root.querySelectorAll("[data-type='query'], .nexus-query").forEach((el) => {
    if (!(el instanceof HTMLElement)) return;
    if (el.parentElement?.closest("[data-type='query'], .nexus-query")) return;
    const query =
      el.getAttribute("data-query") ||
      el.querySelector("[data-query]")?.getAttribute("data-query") ||
      "";
    const next = doc.createElement("div");
    next.setAttribute("data-type", "query");
    next.setAttribute("data-query", query);
    el.replaceWith(next);
  });
}

/** Serialize live editor root element → Markdown */
export function htmlDocToMarkdown(root: HTMLElement): string {
  // Prefer walking a clone so we don't mutate the live editor
  const clone = root.cloneNode(true) as HTMLElement;
  flattenSpecialEditorBlocks(clone);
  clone
    .querySelectorAll(".ProseMirror-trailingBreak, .ProseMirror-separator")
    .forEach((n) => n.remove());
  // Strip image chrome so resize handles/toolbars never hit disk
  clone
    .querySelectorAll(
      ".nexus-image-toolbar, .nexus-image-handle, .nexus-image-resize",
    )
    .forEach((n) => n.remove());
  clone.querySelectorAll(".nexus-image-wrap").forEach((wrap) => {
    const img = wrap.querySelector("img");
    if (img && wrap.parentNode) wrap.parentNode.replaceChild(img, wrap);
  });
  // Keep checkbox state in data-checked for turndown
  clone.querySelectorAll('li[data-type="taskItem"]').forEach((li) => {
    const input = li.querySelector(
      'input[type="checkbox"]',
    ) as HTMLInputElement | null;
    if (input) {
      li.setAttribute("data-checked", input.checked ? "true" : "false");
    }
    // The checkbox label carries screen-reader text ("Task item checkbox for …").
    // Keep the input itself: it is what keeps an empty task from reading as blank.
    li.querySelectorAll(":scope > label > :not(input)").forEach((n) => n.remove());
  });
  return htmlToMarkdown(clone.innerHTML);
}

export function extractTitleFromMarkdown(md: string, fallback: string): string {
  const m = md.match(/^#\s+(.+)$/m);
  if (m?.[1]) return m[1].trim();
  return fallback;
}

export function extractOutline(
  md: string,
): { level: number; text: string; pos: number }[] {
  const lines = md.split("\n");
  const out: { level: number; text: string; pos: number }[] = [];
  let pos = 0;
  for (const line of lines) {
    const m = /^(#{1,6})\s+(.+)$/.exec(line);
    if (m) out.push({ level: m[1].length, text: m[2].trim(), pos });
    pos += line.length + 1;
  }
  return out;
}

export function previewSnippet(md: string, max = 120): string {
  const plain = md
    .replace(/^#+\s+/gm, "")
    .replace(/\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/g, "$1")
    .replace(/!\[[^\]]*\]\([^)]+\)/g, "")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/[`*_~>#-]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (plain.length <= max) return plain;
  return plain.slice(0, max - 1) + "…";
}
