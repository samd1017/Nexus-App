/**
 * Stable graph invalidation tick for GraphView.
 *
 * NEVER call ensureVaultIndex inside a Zustand selector — with Zustand v5
 * (useSyncExternalStore), a selector that mutates module globals or returns
 * a freshly derived unstable snapshot can force infinite re-renders
 * (Maximum update depth exceeded / forceStoreRerender).
 *
 * This module:
 *  - subscribes only via useVaultStore.subscribe (store notify)
 *  - reads primitive store fields + already-published index generations
 *  - syncs the structural index at most once per nodes-map identity
 *  - returns a cached string so consecutive getSnapshot calls are Object.is-equal
 */

import { useSyncExternalStore } from "react";
import { useVaultStore } from "@/lib/vault/store";
import { ensureVaultIndex, vaultIndex } from "@/lib/vault/indexes";
import { vaultLinkIndex } from "@/lib/vault/link-index";
import { shouldUseFolderGraph } from "@/lib/vault/scale-flags";

let cachedNodesRef: Record<string, unknown> | null = null;
let cachedTick = "0";

function syncIndexIfNeeded(): void {
  const nodes = useVaultStore.getState().nodes as Record<string, unknown>;
  if (nodes === cachedNodesRef) return;
  ensureVaultIndex(nodes as Parameters<typeof ensureVaultIndex>[0]);
  cachedNodesRef = nodes;
}

/** Pure-ish snapshot: may sync index once when nodes identity changes. */
export function getGraphTickSnapshot(): string {
  syncIndexIfNeeded();
  const s = useVaultStore.getState();
  const n = vaultIndex.noteCount;
  const large = shouldUseFolderGraph(n);
  const scope = s.graphScopeMode ?? "vault";
  const struct = vaultIndex.structureGeneration;
  const content = vaultIndex.contentGeneration;
  const links = vaultLinkIndex.generation;
  const browse = s.graphBrowsePath ?? "";
  const active = s.activeNoteId ?? "";

  let next: string;
  if (large && scope !== "ego") {
    next = `f:${struct}:${browse}:${scope}:${n}`;
  } else if (large) {
    next = `e:${links}:${active}:${n}`;
  } else {
    // structure + content + links — all primitives, no ensureVaultIndex in selector
    next = `full:${struct}:${content}:${links}`;
  }

  if (next === cachedTick) return cachedTick;
  cachedTick = next;
  return cachedTick;
}

export function subscribeGraphTick(onStoreChange: () => void): () => void {
  return useVaultStore.subscribe(onStoreChange);
}

/** React hook — stable graph tick from store + index generations. */
export function useGraphTick(): string {
  return useSyncExternalStore(
    subscribeGraphTick,
    getGraphTickSnapshot,
    () => "0",
  );
}

/** Test / vault-close helper */
export function resetGraphTickCache(): void {
  cachedNodesRef = null;
  cachedTick = "0";
}
