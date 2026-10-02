/** Scroll the open note to a task line. Best effort after the editor paints. */

export function jumpToTaskText(text: string, pane: "primary" | "secondary" = "primary"): boolean {
  if (typeof document === "undefined") return false;
  const needle = text.trim().slice(0, 80);
  if (!needle) return false;
  const root = document.querySelector(`[data-editor-pane="${pane}"]`) ?? document;
  const items = root.querySelectorAll("[data-type='taskItem'], li");
  const lower = needle.toLowerCase();
  for (const item of Array.from(items)) {
    const label = (item.textContent || "").replace(/\s+/g, " ").trim().toLowerCase();
    if (!label.includes(lower)) continue;
    (item as HTMLElement).scrollIntoView({ block: "center" });
    return true;
  }
  const ta = root.querySelector(
    'textarea[aria-label="Markdown source"]',
  ) as HTMLTextAreaElement | null;
  if (!ta) return false;
  const lines = ta.value.split("\n");
  let pos = 0;
  for (const line of lines) {
    if (/^[\s>]*(?:[-*+]|\d{1,9}[.)])\s+\[[^\]]\]/.test(line) && line.toLowerCase().includes(lower)) {
      ta.focus();
      ta.setSelectionRange(pos, pos + line.length);
      const lineCount = ta.value.slice(0, pos).split("\n").length;
      const lineHeight = parseFloat(getComputedStyle(ta).lineHeight) || 24;
      ta.scrollTop = Math.max(0, (lineCount - 3) * lineHeight);
      return true;
    }
    pos += line.length + 1;
  }
  return false;
}
