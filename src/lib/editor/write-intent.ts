/**
 * "Start writing in this note" after its name is set. Kept by path for a few
 * seconds: on the desktop the rename is also a file rename, and the folder
 * watcher can swap the note's identity and refill the editor after the first
 * focus. Whichever editor ends up showing that path takes the cursor.
 *
 * Until an editor has the cursor, typing and pasting that land outside any
 * field (the list, the page) are held for that note and handed to its editor,
 * so the first words after naming a note are never dropped. Moving away (a
 * click elsewhere, Esc, Tab, arrows) ends the request.
 */
type WriteIntent = { path: string; until: number };
let intent: WriteIntent | null = null;
let held: { path: string; text: string; until: number } | null = null;
let listening = false;

export const WRITE_FOCUS_MS = 6000;
const HELD_TEXT_MS = 30_000;

export function requestWriteFocus(path: string, ms = WRITE_FOCUS_MS): void {
  intent = { path, until: Date.now() + ms };
  listen();
  window.dispatchEvent(new CustomEvent("nexus-write-note", { detail: path }));
}

/** True while a write focus for `path` is pending. Does not consume it. */
export function writeFocusPending(path: string | null | undefined): boolean {
  const live = livePath();
  return Boolean(path && live === path);
}

export function clearWriteFocus(): void {
  intent = null;
}

// Notes made moments ago whose name is still to be set. Kept here rather than
// in the list, which may still be mounting (or remount) when the note is made.
const created = new Map<string, number>();
const CREATED_MS = 120_000;

export function markJustCreated(id: string | null | undefined): void {
  if (id) created.set(id, Date.now());
}

/** True, once, when `id` was made moments ago: naming it goes on to writing. */
export function takeJustCreated(id: string | null | undefined): boolean {
  if (!id) return false;
  const at = created.get(id);
  created.delete(id);
  return at !== undefined && Date.now() - at <= CREATED_MS;
}

/** For the soak probe: which note is waiting for the cursor, and what is held. */
export function writeIntentState(): { path: string | null; heldChars: number } {
  const path = livePath();
  const live = held && Date.now() <= held.until ? held : null;
  return { path, heldChars: live?.text.length ?? 0 };
}

/** Text typed or pasted for `path` before its editor could take it. */
export function takeHeldWrite(path: string | null | undefined): string | null {
  if (!held || !path) return null;
  if (Date.now() > held.until) {
    held = null;
    return null;
  }
  if (held.path !== path) return null;
  const text = held.text;
  held = null;
  return text;
}

function livePath(): string | null {
  if (!intent) return null;
  if (Date.now() > intent.until) {
    intent = null;
    return null;
  }
  return intent.path;
}

function leaveAlone(t: EventTarget | null): boolean {
  const el = t as HTMLElement | null;
  if (!el?.closest) return false;
  return Boolean(
    el.closest(
      "input, textarea, select, button, a[href], [contenteditable='true'], [role='dialog'], [data-nexus-confirm], [cmdk-root]",
    ),
  );
}

/** Text is still held for this note: what is typed in its editor goes after it. */
function queuedBehind(path: string, t: EventTarget | null): boolean {
  if (!held || held.path !== path || Date.now() > held.until) return false;
  return Boolean((t as HTMLElement | null)?.closest?.(".ProseMirror"));
}

function hold(path: string, text: string): void {
  if (held && held.path === path && Date.now() <= held.until) held.text += text;
  else held = { path, text, until: Date.now() + HELD_TEXT_MS };
  window.dispatchEvent(new CustomEvent("nexus-write-note", { detail: path }));
}

const MOVE_KEYS = new Set([
  "Escape",
  "Tab",
  "ArrowUp",
  "ArrowDown",
  "ArrowLeft",
  "ArrowRight",
  "PageUp",
  "PageDown",
  "Home",
  "End",
]);

function onKey(e: KeyboardEvent): void {
  const path = livePath();
  if (!path || e.isComposing || e.defaultPrevented) return;
  if (leaveAlone(e.target) && !queuedBehind(path, e.target)) return;
  if (MOVE_KEYS.has(e.key) || /^F\d{1,2}$/.test(e.key)) {
    clearWriteFocus();
    return;
  }
  if (e.metaKey || e.ctrlKey) {
    // The paste itself runs after keydown, into whatever has focus by then.
    if (!e.altKey && e.key.toLowerCase() === "v") {
      window.dispatchEvent(new CustomEvent("nexus-write-note", { detail: path }));
    }
    return;
  }
  if (e.altKey) return;
  if (e.key !== "Enter" && e.key.length !== 1) return;
  e.preventDefault();
  e.stopImmediatePropagation();
  hold(path, e.key === "Enter" ? "\n" : e.key);
}

function onPaste(e: ClipboardEvent): void {
  const path = livePath();
  if (!path || e.defaultPrevented) return;
  if (leaveAlone(e.target) && !queuedBehind(path, e.target)) return;
  const text = e.clipboardData?.getData("text/plain") ?? "";
  if (!text) return;
  e.preventDefault();
  e.stopImmediatePropagation();
  hold(path, text);
}

function onPointer(e: PointerEvent): void {
  if (!livePath()) return;
  const el = e.target as HTMLElement | null;
  if (el?.closest?.("[data-editor-pane]")) return;
  clearWriteFocus();
}

function listen(): void {
  if (listening || typeof window === "undefined") return;
  listening = true;
  window.addEventListener("keydown", onKey, true);
  window.addEventListener("paste", onPaste, true);
  window.addEventListener("pointerdown", onPointer, true);
}
