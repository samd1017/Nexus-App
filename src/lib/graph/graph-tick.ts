/**
 * Stable graph invalidation tick for GraphView.
 *
 * getSnapshot must be pure. Indexing or reading structureGeneration here
 * races the render: GraphView's memos call ensureVaultIndex on a deferred
 * nodes map, which bumps the generation before the passive
 * useSyncExternalStore check. React then forceStoreRerenders until
 * "Maximum update depth" (hot 45k open with the graph panel still mounted).
 *
 * The tick changes only when vault inputs change. GraphView memos index
 * and build from the nodes map on that render.
 */

import { useSyncExternalStore } from "react";
import { useVaultStore } from "@/lib/vault/store";

const EMPTY_TICK_NODES: Record<string, unknown> = {};

let seenNodes: object = EMPTY_TICK_NODES;
let seenScope = "";
let seenBrowse = "";
let seenActive = "";
let epoch = 0;
let cachedTick = "0";

/** Pure snapshot: store identity only. Never touches the vault index. */
export function getGraphTickSnapshot(): string {
  const s = useVaultStore.getState();
  const raw = s.nodes as object | null | undefined;
  const nodes = raw && typeof raw === "object" ? raw : EMPTY_TICK_NODES;
  const scope = s.graphScopeMode ?? "vault";
  const browse = s.graphBrowsePath ?? "";
  const active = s.activeNoteId ?? "";
  if (
    nodes === seenNodes &&
    scope === seenScope &&
    browse === seenBrowse &&
    active === seenActive
  ) {
    return cachedTick;
  }
  seenNodes = nodes;
  seenScope = scope;
  seenBrowse = browse;
  seenActive = active;
  epoch += 1;
  cachedTick = `${epoch}|${scope}|${browse}|${active}`;
  return cachedTick;
}

export function subscribeGraphTick(onStoreChange: () => void): () => void {
  return useVaultStore.subscribe(onStoreChange);
}

/** React hook — stable graph tick from store inputs. */
export function useGraphTick(): string {
  return useSyncExternalStore(
    subscribeGraphTick,
    getGraphTickSnapshot,
    () => "0",
  );
}

/** Test / vault-close helper */
export function resetGraphTickCache(): void {
  seenNodes = EMPTY_TICK_NODES;
  seenScope = "";
  seenBrowse = "";
  seenActive = "";
  epoch = 0;
  cachedTick = "0";
}
