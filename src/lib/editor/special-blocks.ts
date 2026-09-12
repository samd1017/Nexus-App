/** Promote mermaid fences + $math$ after marked, before TipTap parse. */

function escapeAttr(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export function promoteQueryBlocks(html: string): string {
  if (!html || !/query/i.test(html)) return html;
  if (typeof DOMParser === "undefined") return html;
  try {
    const doc = new DOMParser().parseFromString(
      `<div id="nexus-q-root">${html}</div>`,
      "text/html",
    );
    const root = doc.getElementById("nexus-q-root");
    if (!root) return html;
    root.querySelectorAll("pre code").forEach((code) => {
      const cls = `${code.className} ${code.getAttribute("class") || ""}`;
      const lang = (code.getAttribute("data-language") || "").toLowerCase();
      if (!/\bquery\b/.test(cls) && lang !== "query") return;
      const src = (code.textContent || "").replace(/\n$/, "");
      const wrap = doc.createElement("div");
      wrap.setAttribute("data-type", "query");
      wrap.setAttribute("data-query", src);
      wrap.className = "nexus-query";
      const pre = code.closest("pre");
      (pre ?? code).replaceWith(wrap);
    });
    return root.innerHTML;
  } catch {
    return html;
  }
}

export function promoteMermaidBlocks(html: string): string {
  if (!html || !/mermaid/i.test(html)) return html;
  if (typeof DOMParser === "undefined") return html;
  try {
    const doc = new DOMParser().parseFromString(
      `<div id="nexus-mmd-root">${html}</div>`,
      "text/html",
    );
    const root = doc.getElementById("nexus-mmd-root");
    if (!root) return html;
    root.querySelectorAll("pre code").forEach((code) => {
      const cls = `${code.className} ${code.getAttribute("class") || ""}`;
      const lang = (code.getAttribute("data-language") || "").toLowerCase();
      if (!/mermaid/.test(cls) && lang !== "mermaid") return;
      const src = (code.textContent || "").replace(/\n$/, "");
      const wrap = doc.createElement("div");
      wrap.setAttribute("data-type", "mermaid");
      wrap.setAttribute("data-source", src);
      wrap.className = "nexus-mermaid";
      const pre = code.closest("pre");
      (pre ?? code).replaceWith(wrap);
    });
    return root.innerHTML;
  } catch {
    return html;
  }
}

export function holdMathTokens(md: string): {
  md: string;
  hold: { block: boolean; tex: string }[];
} {
  const hold: { block: boolean; tex: string }[] = [];
  let next = md.replace(/\$\$([\s\S]+?)\$\$/g, (_full, tex: string) => {
    const i = hold.length;
    hold.push({ block: true, tex: String(tex).trim() });
    return `%%MATH${i}%%`;
  });
  next = next.replace(/\$([^$\n]{1,400})\$/g, (full, tex: string, offset: number) => {
    const before = next.slice(Math.max(0, offset - 6), offset);
    if (before.includes("%%MATH")) return full;
    const i = hold.length;
    hold.push({ block: false, tex: String(tex).trim() });
    return `%%MATH${i}%%`;
  });
  return { md: next, hold };
}

function mathHtml(item: { block: boolean; tex: string }): string {
  const kind = item.block ? "math-block" : "math-inline";
  const tag = item.block ? "div" : "span";
  return `<${tag} data-type="${kind}" data-tex="${escapeAttr(item.tex)}" class="nexus-math"></${tag}>`;
}

export function restoreMathTokens(
  html: string,
  hold: { block: boolean; tex: string }[],
): string {
  if (!hold.length) return html;
  let next = html.replace(/<p>\s*%%MATH(\d+)%%\s*<\/p>/g, (_full, n: string) => {
    const item = hold[Number(n)];
    return item ? mathHtml(item) : "";
  });
  next = next.replace(/%%MATH(\d+)%%/g, (_full, n: string) => {
    const item = hold[Number(n)];
    return item ? mathHtml(item) : "";
  });
  return next;
}
