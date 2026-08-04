/**
 * Browser-style note navigation stack for ⌘[ / ⌘] back/forward.
 * Separate from MRU visits (note-visits / visit-history).
 */

const MAX = 50;

let stack: string[] = [];
let index = -1;
/** When true, setActiveNote must not push (history traversal). */
let suppressPush = false;

export function pushNav(noteId: string | null | undefined): void {
  if (suppressPush) return;
  if (!noteId) return;
  if (stack[index] === noteId) return;
  // Drop any forward entries after a branch
  if (index >= 0 && index < stack.length - 1) {
    stack = stack.slice(0, index + 1);
  }
  stack.push(noteId);
  if (stack.length > MAX) {
    stack = stack.slice(stack.length - MAX);
  }
  index = stack.length - 1;
}

export function canGoBack(): boolean {
  return index > 0;
}

export function canGoForward(): boolean {
  return index >= 0 && index < stack.length - 1;
}

export function goBack(): string | null {
  if (!canGoBack()) return null;
  index -= 1;
  return stack[index] ?? null;
}

export function goForward(): string | null {
  if (!canGoForward()) return null;
  index += 1;
  return stack[index] ?? null;
}

/**
 * Walk back until a note id still exists in `isLive`, or stack is exhausted.
 * Skips deleted / foreign-vault dead ids without burning extra keypresses.
 */
export function goBackLive(
  isLive: (id: string) => boolean,
): string | null {
  while (canGoBack()) {
    const id = goBack();
    if (id && isLive(id)) return id;
  }
  return null;
}

/** Walk forward until a live note id, or exhaust forward stack. */
export function goForwardLive(
  isLive: (id: string) => boolean,
): string | null {
  while (canGoForward()) {
    const id = goForward();
    if (id && isLive(id)) return id;
  }
  return null;
}

/** Run a navigation that should not append to the history stack. */
export function withHistoryNav<T>(fn: () => T): T {
  suppressPush = true;
  try {
    return fn();
  } finally {
    suppressPush = false;
  }
}

/** Test / reset helper */
export function resetNavHistory(): void {
  stack = [];
  index = -1;
  suppressPush = false;
}
