/**
 * Put the cursor in the note that is showing, without moving it to the
 * start of the file and without arming the "start writing" hold buffer.
 */
export function focusEditorPane(pane: "primary" | "secondary"): void {
  const run = () => {
    const own = document.querySelector<HTMLElement>(`[data-editor-pane="${pane}"]`);
    if (!own) return;
    const target =
      own.querySelector<HTMLElement>(".ProseMirror") ||
      own.querySelector<HTMLElement>("textarea[aria-label='Markdown source']") ||
      own.querySelector<HTMLElement>("[data-reading-view] .nexus-source-preview") ||
      own;
    if (document.activeElement === target) return;
    try {
      target.focus({ preventScroll: true });
    } catch {
      /* the pane unmounted between frames */
    }
  };
  window.requestAnimationFrame(run);
}
