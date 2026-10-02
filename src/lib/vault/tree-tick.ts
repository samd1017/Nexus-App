/**
 * Stable FileTree structure tick.
 *
 * getSnapshot must be pure. Calling ensureVaultIndex here mutates
 * structureGeneration between React's render read and the passive
 * useSyncExternalStore check, which forceStoreRerenders until
 * "Maximum update depth" (hot 45k open, FileTree already mounted).
 * Flatten and the editor note-count memo index on their own.
 */

import { useSyncExternalStore } from "react";
import { useVaultStore } from "@/lib/vault/store";

let seenNodes: object | null = null;
let seenRoots: string[] | null = null;
let epoch = 0;
let cachedTick = "0";

export function getTreeStructureTickSnapshot(): string {
  const s = useVaultStore.getState();
  if (s.nodes === seenNodes && s.rootIds === seenRoots) return cachedTick;
  seenNodes = s.nodes;
  seenRoots = s.rootIds;
  epoch += 1;
  cachedTick = String(epoch);
  return cachedTick;
}

export function subscribeTreeStructureTick(onStoreChange: () => void): () => void {
  return useVaultStore.subscribe(onStoreChange);
}

/** React hook — structure tick for FileTree flatten invalidation. */
export function useTreeStructureTick(): string {
  return useSyncExternalStore(
    subscribeTreeStructureTick,
    getTreeStructureTickSnapshot,
    () => "0",
  );
}

export function resetTreeTickCache(): void {
  seenNodes = null;
  seenRoots = null;
  epoch = 0;
  cachedTick = "0";
}
