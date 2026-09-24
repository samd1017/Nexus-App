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
  "[data-graph-host], [data-testid='nexus-editor'], .ProseMirror, .note-title-input, .daily-chip, [aria-label='Daily note'], [aria-label='Week days']";

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
