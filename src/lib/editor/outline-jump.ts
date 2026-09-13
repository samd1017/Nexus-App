/**
 * Jump editor scroll to a heading from the outline panel.
 * Works for Visual (ProseMirror DOM) and Source (textarea).
 */

import { headingsMatch, normalizeBlockId } from "@/lib/markdown/note-slice";

function paneRoot(pane?: string | null): ParentNode {
  if (typeof document === "undefined") return { querySelector: () => null, querySelectorAll: () => [] } as unknown as ParentNode;
  if (pane && pane !== "solo") {
    const scoped = document.querySelector(`[data-editor-pane="${pane}"]`);
    if (scoped) return scoped;
  }
  return document;
}

export function jumpToOutlineHeading(
  text: string,
  level: number,
  pane?: string | null,
): boolean {
  if (typeof document === "undefined") return false;
  const needle = text.trim();
  if (!needle) return false;
  const root = paneRoot(pane);

  // Visual mode: TipTap headings
  const editor = root.querySelector(".note-editor:not(.nexus-source-preview)");
  if (editor) {
    const headings = editor.querySelectorAll("h1,h2,h3,h4,h5,h6");
    for (const h of Array.from(headings)) {
      const t = (h.textContent || "").trim();
      if (headingsMatch(t, needle) || t.toLowerCase().startsWith(needle.toLowerCase())) {
        h.scrollIntoView({ behavior: "smooth", block: "center" });
        h.classList.add("outline-flash");
        window.setTimeout(() => h.classList.remove("outline-flash"), 900);
        return true;
      }
    }
  }

  // Source mode: textarea
  const ta = root.querySelector(
    'textarea[aria-label="Markdown source"]',
  ) as HTMLTextAreaElement | null;
  if (ta) {
    const lines = ta.value.split("\n");
    const wantLevel = Math.min(6, Math.max(1, level));
    const tryJump = (matchLine: (m: RegExpExecArray, line: string) => boolean) => {
      let pos = 0;
      for (const line of lines) {
        const m = /^(#{1,6})\s+(.+)$/.exec(line);
        if (m && matchLine(m, line)) {
          ta.focus();
          ta.setSelectionRange(pos, pos + line.length);
          const before = ta.value.slice(0, pos);
          const lineCount = before.split("\n").length;
          const lineHeight = parseFloat(getComputedStyle(ta).lineHeight) || 24;
          ta.scrollTop = Math.max(0, (lineCount - 3) * lineHeight);
          return true;
        }
        pos += line.length + 1;
      }
      return false;
    };
    if (
      tryJump(
        (m) =>
          m[1].length === wantLevel && headingsMatch(m[2].trim(), needle),
      )
    ) {
      return true;
    }
    if (tryJump((m) => headingsMatch(m[2].trim(), needle))) {
      return true;
    }
  }

  return false;
}

export function jumpToBlockRef(
  blockId: string,
  pane?: string | null,
): boolean {
  if (typeof document === "undefined") return false;
  const id = normalizeBlockId(blockId);
  if (!id) return false;
  const root = paneRoot(pane);
  const needle = `^${id}`;

  const editor = root.querySelector(".note-editor:not(.nexus-source-preview)");
  if (editor) {
    const walker = document.createTreeWalker(editor, NodeFilter.SHOW_TEXT);
    let node: Node | null;
    while ((node = walker.nextNode())) {
      if ((node.textContent || "").includes(needle)) {
        const el =
          (node.parentElement as HTMLElement | null) ??
          (editor as HTMLElement);
        el.scrollIntoView({ behavior: "smooth", block: "center" });
        el.classList.add("outline-flash");
        window.setTimeout(() => el.classList.remove("outline-flash"), 900);
        return true;
      }
    }
  }

  const ta = root.querySelector(
    'textarea[aria-label="Markdown source"]',
  ) as HTMLTextAreaElement | null;
  if (ta) {
    const idx = ta.value.indexOf(needle);
    if (idx >= 0) {
      ta.focus();
      ta.setSelectionRange(idx, idx + needle.length);
      const lineCount = ta.value.slice(0, idx).split("\n").length;
      const lineHeight = parseFloat(getComputedStyle(ta).lineHeight) || 24;
      ta.scrollTop = Math.max(0, (lineCount - 3) * lineHeight);
      return true;
    }
  }
  return false;
}
