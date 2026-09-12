/** Obsidian-style `> [!note]` callouts — plain Markdown on disk. */

export const CALLOUT_KINDS = [
  "note",
  "tip",
  "info",
  "warning",
  "danger",
  "success",
] as const;

export type CalloutKind = (typeof CALLOUT_KINDS)[number];

export const CALLOUT_LABELS: Record<CalloutKind, string> = {
  note: "Note",
  tip: "Tip",
  info: "Info",
  warning: "Warning",
  danger: "Danger",
  success: "Success",
};

const HEADER_RE = /^\[!([A-Za-z][\w-]*)\]([+-])?\s*(.*)$/;

function decodeEntities(s: string): string {
  return s
    .replace(/&nbsp;/g, " ")
    .replace(/&gt;/g, ">")
    .replace(/&lt;/g, "<")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"');
}

export function isCalloutKind(v: string): v is CalloutKind {
  return (CALLOUT_KINDS as readonly string[]).includes(v);
}

export function normalizeCalloutKind(raw: string): CalloutKind {
  const k = raw.toLowerCase();
  if (k === "warn") return "warning";
  if (k === "error" || k === "fail" || k === "failure" || k === "bug") {
    return "danger";
  }
  if (k === "check" || k === "done" || k === "ok") return "success";
  if (k === "abstract" || k === "summary" || k === "tldr" || k === "todo") {
    return "info";
  }
  if (k === "question" || k === "help" || k === "faq") return "tip";
  if (isCalloutKind(k)) return k;
  return "note";
}

function stripTags(html: string): string {
  return html.replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").trim();
}

/**
 * Turn `<blockquote>` whose first line is `[!TYPE]` into a callout div.
 */
export function promoteCalloutBlockquotes(html: string): string {
  if (!html || !html.includes("[!")) return html;
  if (typeof DOMParser === "undefined") return html;
  try {
    const doc = new DOMParser().parseFromString(
      `<div id="nexus-callout-root">${html}</div>`,
      "text/html",
    );
    const root = doc.getElementById("nexus-callout-root");
    if (!root) return html;

    root.querySelectorAll("blockquote").forEach((bq) => {
      const first = bq.firstElementChild;
      if (!first || first.tagName.toLowerCase() !== "p") return;

      const parts = first.innerHTML.split(/<br\s*\/?>/i);
      const firstText = decodeEntities(stripTags(parts[0] ?? "")).replace(
        /\s+/g,
        " ",
      ).trim();
      const m = HEADER_RE.exec(firstText);
      if (!m) return;

      const kind = normalizeCalloutKind(m[1] ?? "note");
      const afterTag = (m[3] ?? "").trim();
      const restFirst = parts.slice(1).join("<br>").trim();
      const extras = Array.from(bq.children).slice(1);
      const hasFollowing = Boolean(restFirst) || extras.length > 0;
      // marked often flattens `> [!WARN]\n> body` into one line — that's body, not a title
      let title = hasFollowing ? afterTag : "";
      let bodyFromHeader = hasFollowing ? "" : afterTag;
      if (!hasFollowing && afterTag) {
        const titled = /^([A-Za-z][\w-]{0,31})\s+(.+)$/.exec(afterTag);
        if (titled) {
          title = titled[1] ?? "";
          bodyFromHeader = titled[2] ?? "";
        }
      }

      const wrap = doc.createElement("div");
      wrap.setAttribute("data-type", "callout");
      wrap.setAttribute("data-callout", kind);
      if (title) wrap.setAttribute("data-callout-title", title);
      wrap.className = "nexus-callout";

      if (restFirst) {
        const p = doc.createElement("p");
        p.innerHTML = restFirst;
        wrap.appendChild(p);
      } else if (bodyFromHeader) {
        const p = doc.createElement("p");
        p.textContent = bodyFromHeader;
        wrap.appendChild(p);
      }
      extras.forEach((el) => wrap.appendChild(el));
      if (!wrap.childElementCount) {
        const p = doc.createElement("p");
        p.appendChild(doc.createElement("br"));
        wrap.appendChild(p);
      }
      bq.replaceWith(wrap);
    });

    return root.innerHTML;
  } catch {
    return html;
  }
}
