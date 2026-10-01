/** Dedicated Ctrl/Cmd+O switcher. Not the Ctrl+K palette. */

let open = false;
let openedAt = 0;
const listeners = new Set<() => void>();

export function switcherIsOpen(): boolean {
  return open;
}

export function setSwitcherOpen(next: boolean): void {
  if (open === next) return;
  open = next;
  if (next) openedAt = Date.now();
  for (const listener of listeners) listener();
}

export function subscribeSwitcher(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/**
 * Open the switcher. A second chord in the same instant (menu + key) does not
 * close it. A later Ctrl/Cmd+O toggles it shut.
 */
export function toggleQuickSwitcher(): void {
  const now = Date.now();
  if (open && now - openedAt < 120) return;
  setSwitcherOpen(!open);
}
