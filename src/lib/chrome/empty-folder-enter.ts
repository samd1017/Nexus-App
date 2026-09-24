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
  /**
   * The key landed on the page itself. The note had the cursor, then the
   * empty folder was focused, and focus fell through before Enter.
   */
  targetIdle?: boolean;
}): string | null {
  if (input.key !== "Enter" || input.meta || input.ctrl || input.alt || input.repeat || input.composing) {
    return null;
  }
  if (input.renameField) return null;
  if (input.fromTarget) return input.fromTarget;
  if (input.fromActive) return input.fromActive;
  if (input.treeHasKey && input.treeFolder) return input.treeFolder;
  if (input.armedFolder && (input.targetStole || input.targetIdle)) return input.armedFolder;
  return null;
}

/** Enter is not in a text field or a button. The empty-folder hold still owns it. */
export function isIdleEnterTarget(target: EventTarget | null): boolean {
  if (!target) return true;
  const el = target as HTMLElement;
  if (typeof document !== "undefined" && (el === document.body || el === document.documentElement)) {
    return true;
  }
  if (typeof el.closest !== "function") return false;
  if (el.closest("input, textarea, select, [contenteditable='true'], button, a, [role='dialog']")) {
    return false;
  }
  return true;
}

const STEAL_SELECTOR =
  "[data-graph-host], [aria-label='Folder map'], [aria-label='Folder map path'], [data-testid='nexus-editor'], .ProseMirror, .note-title-input, .daily-chip, [aria-label='Daily note'], [aria-label='Week days']";

/** Keep asking until the new note's rename field is actually on screen. */
// Notes whose name was set or cancelled. The retry below never reopens them.
const settledRenames = new Set<string>();

/** The name field for this note closed on purpose; stop any pending reopen. */
export function settleRename(noteId: string): void {
  settledRenames.add(noteId);
}

export function scheduleEmptyNoteRename(
  noteId: string,
  open: (id: string) => void,
  isOpenNow: () => boolean,
  frames = 24,
): void {
  settledRenames.delete(noteId);
  // A name that was set or cancelled is never reopened. A field that vanished
  // before that (a busy list recycling the row) is opened again.
  const isOpen = () => settledRenames.has(noteId) || isOpenNow();
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
  // A long vault can spend the animation frames before the new row exists,
  // and a 100k list can take a second or two more to show it.
  if (typeof setTimeout === "function") {
    let waits = 0;
    const slow = () => {
      if (isOpen() || waits >= 18) return;
      waits += 1;
      open(noteId);
      setTimeout(slow, waits < 8 ? 60 : 150);
    };
    setTimeout(slow, 60);
  }
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

/**
 * Keys typed after a note is created but before its name field is on screen.
 * The field takes them when it mounts, so a fast typist (or a script) does not
 * lose the first letters of the name.
 */
type RenameBuffer = { id: string; text: string; commit: boolean; until: number };
let renameBuffer: RenameBuffer | null = null;

export function startRenameBuffer(id: string, ms = 2600): void {
  renameBuffer = { id, text: "", commit: false, until: Date.now() + ms };
}

export function renameBufferActive(): RenameBuffer | null {
  if (!renameBuffer) return null;
  if (Date.now() > renameBuffer.until) {
    renameBuffer = null;
    return null;
  }
  return renameBuffer;
}

export function takeRenameBuffer(id: string): { text: string; commit: boolean } | null {
  const buf = renameBuffer;
  if (!buf || buf.id !== id) return null;
  renameBuffer = null;
  if (!buf.text && !buf.commit) return null;
  return { text: buf.text, commit: buf.commit };
}

/** Feed one keydown into the buffer. Returns true when the key was taken. */
export function bufferRenameKey(e: {
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
}): boolean {
  const buf = renameBufferActive();
  if (!buf || buf.commit) return false;
  if (e.ctrlKey || e.metaKey || e.altKey) return false;
  if (e.key === "Enter") {
    // Enter with nothing typed keeps the default name, and never makes a
    // second note behind the first.
    buf.commit = true;
    return true;
  }
  if (e.key === "Backspace") {
    buf.text = buf.text.slice(0, -1);
    return true;
  }
  if (e.key.length === 1) {
    buf.text += e.key;
    return true;
  }
  return false;
}
