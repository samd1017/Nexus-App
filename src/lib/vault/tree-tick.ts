/**
 * Stable FileTree structure tick — mirrors graph-tick.ts.
 *
 * NEVER call ensureVaultIndex inside a Zustand selector. Zustand v5
 * (useSyncExternalStore) + a selector that mutates module globals can force
 * Maximum update depth / forceStoreRerender (seen under Graph + heavy vault).
 */

import { useSyncExternalStore } from "react";
import { useVaultStore } from "@/lib/vault/store";
import { ensureVaultIndex, vaultIndex } from "@/lib/vault/indexes";

let cachedNodesRef: Record<string, unknown> | null = null;
let cachedTick = "0";

function syncIndexIfNeeded(): void {
  const nodes = useVaultStore.getState().nodes as Record<string, unknown>;
  if (nodes === cachedNodesRef) return;
  ensureVaultIndex(nodes as Parameters<typeof ensureVaultIndex>[0]);
  cachedNodesRef = nodes;
}

export function getTreeStructureTickSnapshot(): string {
  syncIndexIfNeeded();
  const s = useVaultStore.getState();
  const struct = vaultIndex.structureGeneration;
  const count = vaultIndex.nodeCount;
  // rootIds identity matters for flatten; join is cheap vs scanning nodes
  const roots = s.rootIds.join("\0");
  const next = `${struct}:${count}:${roots}`;
  if (next === cachedTick) return cachedTick;
  cachedTick = next;
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
  cachedNodesRef = null;
  cachedTick = "0";
}
