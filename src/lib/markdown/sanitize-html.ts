/**
 * Wave A — sanitize HTML before TipTap Visual mode.
 * Strips scripts, event handlers, javascript: URLs, dangerous tags,
 * and every style attribute (no CSS url/data/expression allowlist).
 * Browser path uses DOMParser; SSR/tests fall back to regex strip.
 */

const ALLOWED_TAGS = new Set([
  "p",
  "br",
  "hr",
  "div",
  "span",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "strong",
  "b",
  "em",
  "i",
  "u",
  "s",
  "del",
  "code",
  "pre",
  "blockquote",
  "ul",
  "ol",
  "li",
  "a",
  "img",
  "table",
  "thead",
  "tbody",
  "tr",
  "th",
  "td",
  "colgroup",
  "col",
  "sup",
  "sub",
  "mark",
  // TipTap task lists (normalizeTaskListsForTipTap injects checkbox + label)
  "input",
  "label",
]);

const ALLOWED_ATTR = new Set([
  "href",
  "src",
  "alt",
  "title",
  "class",
  "id",
  "width",
  "height",
  "colspan",
  "rowspan",
  "align",
  "data-wikilink",
  "data-alias",
  "data-type",
  "data-checked",
  "data-status",
  "data-frontmatter",
  "data-vault-src",
  "data-align",
  "data-width",
  "data-bullet",
  "data-source",
  "data-tex",
  "data-embed-target",
  "data-query",
  "data-lang",
  "type",
  "checked",
  "contenteditable",
]);

const DROP_TAGS = new Set([
  "script",
  "style",
  "iframe",
  "object",
  "embed",
  "link",
  "meta",
  "base",
  "form",
  "button",
  "textarea",
  "select",
  "svg",
  "math",
]);

function isSafeUrl(value: string): boolean {
  const v = value.trim().toLowerCase();
  if (!v) return true;
  if (
    v.startsWith("javascript:") ||
    v.startsWith("vbscript:") ||
    v.startsWith("data:text/html")
  ) {
    return false;
  }
  if (v.startsWith("data:") && !v.startsWith("data:image/")) return false;
  return true;
}

function isHtmlSpace(c: string): boolean {
  return c === " " || c === "\n" || c === "\r" || c === "\t" || c === "\f";
}

/** Index of the tag's closing `>`, ignoring `>` inside quoted attributes. */
function indexOfTagEnd(html: string, from: number): number {
  let quote = "";
  for (let i = from; i < html.length; i++) {
    const c = html[i];
    if (quote) {
      if (c === quote) quote = "";
      continue;
    }
    if (c === '"' || c === "'") {
      quote = c;
      continue;
    }
    if (c === ">") return i;
  }
  return -1;
}

/** Drop a `style` attribute. Other attributes, including values that mention style, stay. */
function stripStyleAttrFromTag(tag: string): string {
  let out = "";
  let i = 0;
  if (tag[i] === "<") out += tag[i++];
  if (tag[i] === "/") out += tag[i++];
  while (
    i < tag.length &&
    tag[i] !== ">" &&
    tag[i] !== "/" &&
    !isHtmlSpace(tag[i])
  ) {
    out += tag[i++];
  }
  while (i < tag.length) {
    const wsStart = i;
    while (i < tag.length && isHtmlSpace(tag[i])) i++;
    if (i >= tag.length || tag[i] === ">") {
      out += tag.slice(wsStart);
      break;
    }
    // `<div/style=...>` — a solidus before `>` is self-closing; otherwise keep scanning.
    if (tag[i] === "/") {
      let j = i + 1;
      while (j < tag.length && isHtmlSpace(tag[j])) j++;
      if (j >= tag.length || tag[j] === ">") {
        out += tag.slice(wsStart);
        break;
      }
      i += 1;
      continue;
    }
    const attrStart = i;
    while (
      i < tag.length &&
      !isHtmlSpace(tag[i]) &&
      tag[i] !== "=" &&
      tag[i] !== ">" &&
      tag[i] !== "/"
    ) {
      i++;
    }
    const name = tag.slice(attrStart, i);
    const afterName = i;
    while (i < tag.length && isHtmlSpace(tag[i])) i++;
    if (tag[i] === "=") {
      i++;
      while (i < tag.length && isHtmlSpace(tag[i])) i++;
      if (tag[i] === '"' || tag[i] === "'") {
        const q = tag[i++];
        while (i < tag.length && tag[i] !== q) i++;
        if (i < tag.length) i++;
      } else {
        while (i < tag.length && !isHtmlSpace(tag[i]) && tag[i] !== ">") i++;
      }
    } else {
      i = afterName;
    }
    if (name.toLowerCase() === "style") continue;
    out += tag.slice(wsStart, i);
  }
  return out;
}

function stripStyleAttributes(html: string): string {
  let out = "";
  let i = 0;
  while (i < html.length) {
    if (html[i] !== "<") {
      out += html[i++];
      continue;
    }
    if (html.startsWith("<!--", i)) {
      const end = html.indexOf("-->", i + 4);
      if (end < 0) {
        out += html.slice(i);
        break;
      }
      out += html.slice(i, end + 3);
      i = end + 3;
      continue;
    }
    const tagEnd = indexOfTagEnd(html, i + 1);
    if (tagEnd < 0) {
      out += html.slice(i);
      break;
    }
    out += stripStyleAttrFromTag(html.slice(i, tagEnd + 1));
    i = tagEnd + 1;
  }
  return out;
}

function stripDangerousRegex(html: string): string {
  return stripStyleAttributes(html)
    .replace(/<script\b[\s\S]*?<\/script>/gi, "")
    .replace(/<style\b[\s\S]*?<\/style>/gi, "")
    .replace(/<iframe\b[\s\S]*?<\/iframe>/gi, "")
    .replace(/<object\b[\s\S]*?<\/object>/gi, "")
    .replace(/<embed\b[^>]*>/gi, "")
    .replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "")
    .replace(/(href|src)\s*=\s*(['"])\s*javascript:[^'"]*\2/gi, '$1=""');
}

function sanitizeElementAttrs(el: Element): void {
  for (const attr of Array.from(el.attributes)) {
    const name = attr.name.toLowerCase();
    if (
      name.startsWith("on") ||
      name === "srcdoc" ||
      name === "formaction" ||
      name === "style"
    ) {
      el.removeAttribute(attr.name);
      continue;
    }
    if (!ALLOWED_ATTR.has(name) && !name.startsWith("data-")) {
      el.removeAttribute(attr.name);
      continue;
    }
    if (
      (name === "href" || name === "src" || name === "data-vault-src") &&
      !isSafeUrl(attr.value)
    ) {
      el.removeAttribute(attr.name);
    }
  }
}

/**
 * Full tree walk that re-processes after unwrap so nested
 * <section><img onerror=…> cannot bypass attr stripping.
 */
function walkSanitize(root: Element): void {
  let el: Element | null = root.firstElementChild;
  while (el) {
    const next = el.nextElementSibling;
    const tag = el.tagName.toLowerCase();

    if (DROP_TAGS.has(tag)) {
      el.remove();
      el = next;
      continue;
    }

    if (!ALLOWED_TAGS.has(tag)) {
      // Unwrap unknown wrappers; children stay as siblings for re-scan
      const parent = el.parentNode;
      if (parent) {
        while (el.firstChild) parent.insertBefore(el.firstChild, el);
        parent.removeChild(el);
      }
      // Restart from first child of root-ish parent so moved nodes are visited
      el = root.firstElementChild;
      continue;
    }

    // Only checkbox inputs for task lists — drop any other input type
    if (tag === "input") {
      const t = (el.getAttribute("type") || "").toLowerCase();
      if (t !== "checkbox") {
        el.remove();
        el = next;
        continue;
      }
      for (const attr of Array.from(el.attributes)) {
        const name = attr.name.toLowerCase();
        if (name !== "type" && name !== "checked") {
          el.removeAttribute(attr.name);
        }
      }
      el = next;
      continue;
    }

    sanitizeElementAttrs(el);
    walkSanitize(el);
    el = next;
  }
}

export function sanitizeNoteHtml(html: string): string {
  if (!html || !html.trim()) return html || "";
  if (typeof DOMParser === "undefined") {
    return stripDangerousRegex(html);
  }
  try {
    const doc = new DOMParser().parseFromString(
      `<div id="nexus-sanitize-root">${html}</div>`,
      "text/html",
    );
    const root = doc.getElementById("nexus-sanitize-root");
    if (!root) return stripDangerousRegex(html);
    // Multiple passes until stable (handles nested unwrap)
    for (let i = 0; i < 8; i++) {
      const before = root.innerHTML;
      walkSanitize(root);
      if (root.innerHTML === before) break;
    }
    // Final global strip of any residual on* that slipped via malformed HTML
    return stripDangerousRegex(root.innerHTML);
  } catch {
    return stripDangerousRegex(html);
  }
}
