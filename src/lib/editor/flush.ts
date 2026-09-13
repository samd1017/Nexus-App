/**
 * Pending editor flush registry.
 * Visual/Source register a sync flush so mode/note switches never lose content.
 * Keyed by pane so dual-pane never drops the other editor's buffer.
 */

type FlushFn = () => void;
export type FlushPane = "primary" | "secondary";

const visualFlushes = new Map<FlushPane, FlushFn>();
const sourceFlushes = new Map<FlushPane, FlushFn>();
let flushing = false;

export function registerVisualFlush(
  fn: FlushFn | null,
  pane: FlushPane = "primary",
): void {
  if (fn) visualFlushes.set(pane, fn);
  else visualFlushes.delete(pane);
}

export function registerSourceFlush(
  fn: FlushFn | null,
  pane: FlushPane = "primary",
): void {
  if (fn) sourceFlushes.set(pane, fn);
  else sourceFlushes.delete(pane);
}

/** Flush every mounted editor — must run before mode or note switches */
export function flushActiveEditors(): void {
  if (flushing) return;
  flushing = true;
  const vs = [...visualFlushes.values()];
  const ss = [...sourceFlushes.values()];
  try {
    for (const v of vs) {
      try {
        v();
      } catch {
        /* ignore */
      }
    }
    for (const s of ss) {
      try {
        s();
      } catch {
        /* ignore */
      }
    }
  } finally {
    flushing = false;
  }
}
