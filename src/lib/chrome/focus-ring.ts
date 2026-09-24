/**
 * focus() inside a capture focusin handler loses. The call that moved focus
 * finishes after those handlers, so the stealer stays put. Run again once
 * that call has returned, and once more on the next frame.
 */
export function reclaimAfterFocus(run: () => void): void {
  queueMicrotask(run);
  if (typeof requestAnimationFrame === "function") requestAnimationFrame(run);
}

/**
 * Keep a dialog's landing control focused while it is open.
 * A busy vault can move the cursor to the note after paint; that loses.
 * Returns a cleanup. `pause` skips the hold (a confirm owns the cursor).
 */
export function holdOpenFocus(
  root: HTMLElement,
  landing: () => HTMLElement | null,
  pause: () => boolean = () => false,
  /** Search keeps the text field. Settings keeps whichever section has the cursor. */
  preferLanding = false,
): () => void {
  let remembered: HTMLElement | null = null;
  const choose = () => (remembered?.isConnected ? remembered : landing());
  const mark = (el: HTMLElement | null) => {
    if (!el || document.activeElement !== el) return;
    const section = el.getAttribute("data-settings-nav");
    if (section) {
      remembered = el;
      root.setAttribute("data-settings-landed", section);
    }
    const field = el.closest?.("[data-testid='search-field']");
    if (field) {
      field.setAttribute("data-keyboard-focus", "control");
      el.setAttribute("data-search-caret", "1");
      root.setAttribute("data-search-focused", "1");
    }
  };
  const apply = () => {
    if (!root.isConnected || pause()) return;
    const active = document.activeElement;
    const el = choose();
    if (!preferLanding && active && root.contains(active) && active !== root) {
      mark(active as HTMLElement);
      return;
    }
    if (preferLanding && el && active === el) {
      mark(el);
      return;
    }
    if (!el?.isConnected) return;
    try {
      el.focus({ preventScroll: true });
    } catch {
      return;
    }
    mark(el);
  };
  apply();
  const raf =
    typeof requestAnimationFrame === "function"
      ? requestAnimationFrame(apply)
      : 0;
  const soon = window.setTimeout(apply, 0);
  const later = window.setTimeout(apply, 48);
  const onFocusIn = (e: FocusEvent) => {
    if (!root.isConnected || pause()) return;
    const next = e.target as HTMLElement | null;
    if (
      next?.getAttribute?.("data-settings-nav") ||
      next?.hasAttribute?.("data-settings-rebuild")
    ) {
      remembered = next;
    }
    if (next && root.contains(next) && next !== root) {
      mark(next);
      return;
    }
    reclaimAfterFocus(apply);
  };
  document.addEventListener("focusin", onFocusIn, true);
  return () => {
    if (typeof cancelAnimationFrame === "function") cancelAnimationFrame(raf);
    window.clearTimeout(soon);
    window.clearTimeout(later);
    document.removeEventListener("focusin", onFocusIn, true);
  };
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
