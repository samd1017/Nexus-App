/**
 * Jump editor scroll to a heading from the outline panel.
 * Works for Visual (ProseMirror DOM) and Source (textarea).
 */

export function jumpToOutlineHeading(text: string, level: number): boolean {
  if (typeof document === "undefined") return false;
  const needle = text.trim().toLowerCase();
  if (!needle) return false;

  // Visual mode: TipTap headings
  const editor = document.querySelector(".note-editor");
  if (editor) {
    const headings = editor.querySelectorAll("h1,h2,h3,h4,h5,h6");
    for (const h of Array.from(headings)) {
      const t = (h.textContent || "").trim().toLowerCase();
      if (t === needle || t.startsWith(needle)) {
        h.scrollIntoView({ behavior: "smooth", block: "center" });
        h.classList.add("outline-flash");
        window.setTimeout(() => h.classList.remove("outline-flash"), 900);
        return true;
      }
    }
  }

  // Source mode: textarea
  const ta = document.querySelector(
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
          m[1].length === wantLevel && m[2].trim().toLowerCase() === needle,
      )
    ) {
      return true;
    }
    if (
      tryJump((m) => {
        const t = m[2].trim().toLowerCase();
        return t === needle || t.startsWith(needle);
      })
    ) {
      return true;
    }
  }

  return false;
}
