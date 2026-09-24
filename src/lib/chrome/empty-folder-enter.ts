/**
 * Enter on an empty folder creates the note there.
 * Folder map, daily chips, and the open Journal note must not take that key.
 */

export function claimEmptyFolderEnter(input: {
  key: string;
  meta?: boolean;
  ctrl?: boolean;
  alt?: boolean;
  repeat?: boolean;
  composing?: boolean;
  renameField?: boolean;
  fromTarget: string | null;
  fromActive: string | null;
  /** The file-tree container itself has the key, and it is sitting on an empty folder. */
  treeHasKey: boolean;
  treeFolder: string | null;
  /** Empty folder the user focused, still armed if a later control stole focus. */
  armedFolder: string | null;
  /** Key target is Folder map, a daily control, or the open note. */
  targetStole: boolean;
}): string | null {
  if (input.key !== "Enter" || input.meta || input.ctrl || input.alt || input.repeat || input.composing) {
    return null;
  }
  if (input.renameField) return null;
  if (input.fromTarget) return input.fromTarget;
  if (input.fromActive) return input.fromActive;
  if (input.treeHasKey && input.treeFolder) return input.treeFolder;
  if (input.armedFolder && input.targetStole) return input.armedFolder;
  return null;
}

const STEAL_SELECTOR =
  "[data-graph-host], [aria-label='Folder map'], [aria-label='Folder map path'], [data-testid='nexus-editor'], .ProseMirror, .note-title-input, .daily-chip, [aria-label='Daily note'], [aria-label='Week days']";

/** Keep asking until the new note's rename field is actually on screen. */
export function scheduleEmptyNoteRename(
  noteId: string,
  open: (id: string) => void,
  isOpen: () => boolean,
  frames = 8,
): void {
  const later =
    typeof requestAnimationFrame === "function"
      ? requestAnimationFrame
      : (cb: () => void) => {
          setTimeout(cb, 0);
        };
  const tick = (left: number) => {
    if (isOpen()) return;
    open(noteId);
    if (left <= 0) return;
    later(() => tick(left - 1));
  };
  tick(frames);
}

/** True when a control took focus without a click while an empty folder was armed. */
export function isProgrammaticFocusSteal(
  next: EventTarget | null,
  holding: boolean,
  fromPointer: boolean,
): boolean {
  if (!holding || fromPointer) return false;
  const el = next as HTMLElement | null;
  if (!el || typeof el.closest !== "function") return false;
  if (el.closest("[data-folder-empty='1'], [data-file-tree]")) return false;
  return Boolean(el.closest(STEAL_SELECTOR));
}
