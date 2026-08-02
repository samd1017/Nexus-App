/**
 * Pending editor flush registry.
 * Visual/Source register a sync flush so mode/note switches never lose content.
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

/** Flush active editors — must run before mode or note switches */
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
