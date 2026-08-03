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
    let pos = 0;
    const prefix = "#".repeat(Math.min(6, Math.max(1, level))) + " ";
    for (const line of lines) {
      const m = /^(#{1,6})\s+(.+)$/.exec(line);
      if (m && m[2].trim().toLowerCase() === needle) {
        ta.focus();
        ta.setSelectionRange(pos, pos + line.length);
        // Approximate scroll
        const ratio = pos / Math.max(1, ta.value.length);
        ta.scrollTop = ratio * ta.scrollHeight - ta.clientHeight / 3;
        return true;
      }
      // Also match any level with same text
      if (m && m[2].trim().toLowerCase() === needle) {
        void prefix;
      }
      pos += line.length + 1;
    }
    // Fallback: any heading text match
    pos = 0;
    for (const line of lines) {
      const m = /^(#{1,6})\s+(.+)$/.exec(line);
      if (m && m[2].trim().toLowerCase() === needle) {
        ta.focus();
        ta.setSelectionRange(pos, pos + line.length);
        const ratio = pos / Math.max(1, ta.value.length);
        ta.scrollTop = ratio * ta.scrollHeight - ta.clientHeight / 3;
        return true;
      }
      pos += line.length + 1;
    }
  }

  return false;
}
