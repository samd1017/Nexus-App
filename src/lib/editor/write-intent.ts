/**
 * "Start writing in this note" after its name is set. Kept by path for a few
 * seconds: on the desktop the rename is also a file rename, and the folder
 * watcher can swap the note's identity and refill the editor after the first
 * focus. Whichever editor ends up showing that path takes the cursor.
 */
type WriteIntent = { path: string; until: number };
let intent: WriteIntent | null = null;

export function requestWriteFocus(path: string, ms = 2500): void {
  intent = { path, until: Date.now() + ms };
  window.dispatchEvent(new CustomEvent("nexus-write-note", { detail: path }));
}

/** True while a write focus for `path` is pending. Does not consume it. */
export function writeFocusPending(path: string | null | undefined): boolean {
  if (!intent || !path) return false;
  if (Date.now() > intent.until) {
    intent = null;
    return false;
  }
  return intent.path === path;
}

export function clearWriteFocus(): void {
  intent = null;
}
