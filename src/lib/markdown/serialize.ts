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

marked.setOptions({
  gfm: true,
  breaks: false,
});

const turndown = new TurndownService({
  headingStyle: "atx",
  codeBlockStyle: "fenced",
  bulletListMarker: "-",
  emDelimiter: "*",
  strongDelimiter: "**",
  hr: "---",
});

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
    // content includes nested block text; strip leading checkbox artifacts
    const body = content
      .replace(/^\s*\[[ xX]\]\s*/, "")
      .replace(/^\n+/, "")
      .replace(/\n+$/, "")
      .replace(/\n+/g, " ")
      .trim();
    return `- [${checked ? "x" : " "}] ${body}\n`;
  },
});

/** Cell → markdown with basic strong/em when present. */
function tableCellToMd(cell: Element): string {
  const clone = cell.cloneNode(true) as HTMLElement;
  // Inline strong/em first so textContent order is preserved after replace
  clone.querySelectorAll("strong, b").forEach((el) => {
    const t = (el.textContent ?? "").replace(/\n+/g, " ");
    el.replaceWith(`**${t}**`);
  });
  clone.querySelectorAll("em, i").forEach((el) => {
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

/** Convert GFM checkbox lists from marked into TipTap TaskList HTML */
function normalizeTaskListsForTipTap(html: string): string {
  if (typeof DOMParser === "undefined") return html;
  const doc = new DOMParser().parseFromString(
    `<div id="nx-root">${html}</div>`,
    "text/html",
  );
  const root = doc.getElementById("nx-root");
  if (!root) return html;

  root.querySelectorAll("ul").forEach((ul) => {
    const items = Array.from(ul.children).filter(
      (c) => c.tagName === "LI",
    ) as HTMLElement[];
    if (!items.length) return;
    const taskItems = items.filter((li) =>
      li.querySelector('input[type="checkbox"]'),
    );
    if (taskItems.length !== items.length) return;

    ul.setAttribute("data-type", "taskList");
    items.forEach((li) => {
      const input = li.querySelector(
        'input[type="checkbox"]',
      ) as HTMLInputElement | null;
      const checked = !!(
        input?.checked ||
        input?.hasAttribute("checked") ||
        li.getAttribute("data-checked") === "true"
      );
      // Remaining text/html after removing checkbox
      const clone = li.cloneNode(true) as HTMLElement;
      clone.querySelectorAll('input[type="checkbox"]').forEach((n) => n.remove());
      let inner = clone.innerHTML.trim();
      // marked often leaves leading space text nodes
      if (!inner.startsWith("<")) {
        inner = `<p>${inner || "<br>"}</p>`;
      } else if (!/^<(p|div|h[1-6]|ul|ol|pre|blockquote)\b/i.test(inner)) {
        inner = `<p>${inner}</p>`;
      }
      li.setAttribute("data-type", "taskItem");
      li.setAttribute("data-checked", checked ? "true" : "false");
      li.innerHTML = `<label contenteditable="false"><input type="checkbox"${checked ? " checked" : ""}><span></span></label><div>${inner}</div>`;
    });
  });

  return root.innerHTML;
}

/**
 * Markdown → HTML TipTap can parse (GFM tables, tasks, wikilink pills).
 * This is the Visual mode entry path — must not leave raw Markdown as text.
 */
export function markdownToHtml(md: string): string {
  const raw = (md || "").replace(/\r\n/g, "\n");
  if (!raw.trim()) return "<p></p>";

  // Wave 1: peel YAML frontmatter so marked never turns --- into <hr>
  let frontmatterHtml = "";
  let body = raw;
  const fm = raw.match(/^---\n([\s\S]*?)\n---\n?/);
  if (fm) {
    const yaml = fm[1] ?? "";
    frontmatterHtml = `<pre data-frontmatter="true" class="nexus-frontmatter"><code>${escapeHtml(yaml)}</code></pre>`;
    body = raw.slice(fm[0].length);
  }

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

  const placeholders: string[] = [];
  const protectedMd = withCodeHeld.replace(/\[\[([^\]]+)\]\]/g, (full) => {
    const i = placeholders.length;
    placeholders.push(full);
    return `%%WIKI${i}%%`;
  });

  // Restore code tokens before marked so fences parse correctly
  const forMarked = protectedMd.replace(/%%CODE(\d+)%%/g, (_, n) => {
    return codeHold[Number(n)] ?? "";
  });

  let html = marked.parse(forMarked, { async: false }) as string;
  // Normalize tasks while marked still has checkbox inputs, then sanitize
  // (sanitize allows input[type=checkbox] + label for TipTap task lists).
  html = normalizeTaskListsForTipTap(html);
  html = sanitizeNoteHtml(html);

  html = html.replace(/%%WIKI(\d+)%%/g, (_, n) => {
    const full = placeholders[Number(n)] ?? "";
    const inner = full.slice(2, -2);
    const pipe = inner.indexOf("|");
    const target = pipe >= 0 ? inner.slice(0, pipe).trim() : inner.trim();
    const alias = pipe >= 0 ? inner.slice(pipe + 1).trim() : target;
    return `<span data-wikilink="${escapeAttr(target)}" data-alias="${escapeAttr(alias)}" class="wikilink-pill">${escapeHtml(alias)}</span>`;
  });

  html = annotateBulletListsFromMarkdown(body, html);
  // Second pass after we inject wikilink HTML (keep allowlisted data-* only)
  html = sanitizeNoteHtml(html);

  if (frontmatterHtml) {
    return frontmatterHtml + (html || "<p></p>");
  }
  return html || "<p></p>";
}

/** Alias used by Visual editor */
export const markdownWithWikilinksToHtml = markdownToHtml;

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

/** Serialize live editor root element → Markdown */
export function htmlDocToMarkdown(root: HTMLElement): string {
  // Prefer walking a clone so we don't mutate the live editor
  const clone = root.cloneNode(true) as HTMLElement;
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
