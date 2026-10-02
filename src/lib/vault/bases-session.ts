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

/** One-shot: Bases should list vault `.base` files as soon as it is open. */
let wantVaultBases = false;
const vaultBaseListeners = new Set<() => void>();

export function requestOpenVaultBase(): void {
  wantVaultBases = true;
  if (open) {
    for (const listener of vaultBaseListeners) listener();
  } else {
    setBasesOpen(true);
  }
}

export function takeVaultBaseRequest(): boolean {
  const wanted = wantVaultBases;
  wantVaultBases = false;
  return wanted;
}

export function subscribeVaultBaseRequest(listener: () => void): () => void {
  vaultBaseListeners.add(listener);
  return () => vaultBaseListeners.delete(listener);
}
