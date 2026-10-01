/** The note table is a view, not a vault setting. */

let open = false;
const listeners = new Set<() => void>();

export function basesIsOpen(): boolean {
  return open;
}

export function setBasesOpen(next: boolean): void {
  if (open === next) return;
  open = next;
  for (const listener of listeners) listener();
}

export function subscribeBases(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
