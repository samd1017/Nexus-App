/**
 * Pending editor flush registry.
 * Visual/Source register a sync flush so mode/note switches never lose content.
 */

type FlushFn = () => void;

let visualFlush: FlushFn | null = null;
let sourceFlush: FlushFn | null = null;
let flushing = false;

export function registerVisualFlush(fn: FlushFn | null): void {
  visualFlush = fn;
}

export function registerSourceFlush(fn: FlushFn | null): void {
  sourceFlush = fn;
}

/** Flush active editors — must run before mode or note switches */
export function flushActiveEditors(): void {
  // Snapshot handlers so concurrent unregister during flush cannot drop a write
  if (flushing) return;
  flushing = true;
  const v = visualFlush;
  const s = sourceFlush;
  try {
    try {
      v?.();
    } catch {
      /* ignore */
    }
    try {
      s?.();
    } catch {
      /* ignore */
    }
  } finally {
    flushing = false;
  }
}
