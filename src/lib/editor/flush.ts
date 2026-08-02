/**
 * Pending editor flush registry.
 * Visual/Source editors register a sync flush so mode switches never lose content.
 */

type FlushFn = () => void;

let visualFlush: FlushFn | null = null;
let sourceFlush: FlushFn | null = null;

export function registerVisualFlush(fn: FlushFn | null): void {
  visualFlush = fn;
}

export function registerSourceFlush(fn: FlushFn | null): void {
  sourceFlush = fn;
}

/** Flush whichever editor is active — call before mode switches / note changes */
export function flushActiveEditors(): void {
  try {
    visualFlush?.();
  } catch {
    /* ignore */
  }
  try {
    sourceFlush?.();
  } catch {
    /* ignore */
  }
}
