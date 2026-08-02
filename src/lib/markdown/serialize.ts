/**
 * Clean Markdown serialization helpers.
 * On-disk format: CommonMark + GFM + [[wikilinks]] — never proprietary HTML.
 */

import { marked } from "marked";
import TurndownService from "turndown";
export { preferCleanWrite, normalizeMarkdown, markdownFingerprint } from "./purity";

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
  filter: (node) =>
    node.nodeName === "LI" &&
    (node as HTMLElement).getAttribute("data-type") === "taskItem",
  replacement: (content, node) => {
    const checked =
      (node as HTMLElement).getAttribute("data-checked") === "true";
    const body = content.replace(/^\n+/, "").replace(/\n+$/, "\n").trim();
    return `- [${checked ? "x" : " "}] ${body}\n`;
  },
});

const AMP = "&" + "amp;";
const LT = "&" + "lt;";
const GT = "&" + "gt;";
const QUOT = "&" + "quot;";

function escapeHtml(s: string): string {
  return s.split("&").join(AMP).split("<").join(LT).split(">").join(GT).split('"').join(QUOT);
}

function escapeAttr(s: string): string {
  return s.split("&").join(AMP).split('"').join(QUOT).split("<").join(LT);
}

function unescapeAttr(s: string): string {
  return s.split(QUOT).join('"').split(LT).join("<").split(AMP).join("&");
}

export function markdownToHtml(md: string): string {
  const placeholders: string[] = [];
  const protectedMd = md.replace(/\[\[([^\]]+)\]\]/g, (full) => {
    const i = placeholders.length;
    placeholders.push(full);
    return `%%WIKI${i}%%`;
  });
  let html = marked.parse(protectedMd, { async: false }) as string;
  html = html.replace(/%%WIKI(\d+)%%/g, (_, n) => {
    const raw = placeholders[Number(n)] ?? "";
    const inner = raw.slice(2, -2);
    const pipe = inner.indexOf("|");
    const target = pipe >= 0 ? inner.slice(0, pipe).trim() : inner.trim();
    const alias = pipe >= 0 ? inner.slice(pipe + 1).trim() : target;
    return `<span data-wikilink="${escapeAttr(target)}" data-alias="${escapeAttr(alias)}" class="wikilink-pill">${escapeHtml(alias)}</span>`;
  });
  return html;
}

export function htmlToMarkdown(html: string): string {
  const withMarkers = html.replace(
    /<span[^>]*data-wikilink="([^"]*)"[^>]*data-alias="([^"]*)"[^>]*>.*?<\/span>/gi,
    (_m, target, alias) => {
      const t = unescapeAttr(target);
      const a = unescapeAttr(alias);
      if (a && a !== t) return `[[${t}|${a}]]`;
      return `[[${t}]]`;
    },
  );
  return turndown.turndown(withMarkers).trim() + "\n";
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
