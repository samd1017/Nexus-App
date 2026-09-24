/**
 * focus() inside a capture focusin handler loses. The call that moved focus
 * finishes after those handlers, so the stealer stays put. Run again once
 * that call has returned, and once more on the next frame.
 */
export function reclaimAfterFocus(run: () => void): void {
  queueMicrotask(run);
  if (typeof requestAnimationFrame === "function") requestAnimationFrame(run);
}

/** Mark the keyboard-focused chrome control so the ring is queryable. */
export function markControlFocus(el: HTMLElement | null, doc: Document): void {
  doc.querySelectorAll('[data-keyboard-focus="control"]').forEach((node) => {
    if (node !== el) node.removeAttribute("data-keyboard-focus");
  });
  if (el) el.setAttribute("data-keyboard-focus", "control");
}

/**
 * Paint `data-keyboard-focus="control"` on the button or field reached by
 * the keyboard. Pointer clicks clear it. Tree rows paint their own ring.
 */
export function installKeyboardFocusRings(doc: Document): () => void {
  let fromKeyboard = false;
  const onKey = () => {
    fromKeyboard = true;
  };
  const onPointer = () => {
    fromKeyboard = false;
    doc.querySelectorAll('[data-keyboard-focus="control"]').forEach((node) => {
      node.removeAttribute("data-keyboard-focus");
    });
  };
  const onFocus = (e: Event) => {
    if (!fromKeyboard) return;
    const target = e.target as HTMLElement | null;
    const control = target?.closest?.(
      "button, a, input, select, textarea, [role='menuitem']",
    ) as HTMLElement | null;
    markControlFocus(control, doc);
  };
  doc.addEventListener("keydown", onKey, true);
  doc.addEventListener("pointerdown", onPointer, true);
  doc.addEventListener("focusin", onFocus, true);
  return () => {
    doc.removeEventListener("keydown", onKey, true);
    doc.removeEventListener("pointerdown", onPointer, true);
    doc.removeEventListener("focusin", onFocus, true);
  };
}
