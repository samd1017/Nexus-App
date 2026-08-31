/**
 * Single-path scale flags — one scale-safe architecture for all disk vaults.
 * Demo/local stay eager (mode gate). No user toggle / no size-based mode flip.
 */

export type SearchBackendKind = "fuse" | "worker" | "fts5";

export interface ScaleFlags {
  /** Always virtualize file tree (cheap at small N; required at large N) */
  virtualTree: boolean;
  /** Meta-only open + LRU bodies for disk backends */
  lazyBodies: boolean;
  /** Search engine — DurableIndex FTS (memory mirror; SQLite on desktop) */
  searchBackend: SearchBackendKind;
  /** Prefer ego/map-first graph when vault is large enough */
  egoGraph: boolean;
  /** Hierarchical folder map for large vaults */
  folderGraph: boolean;
  /** Prefer native Rust bulk meta when available */
  nativeVaultIndex: boolean;
  /** Kept for debug overrides; default 0 = always virtual */
  virtualTreeMinNodes: number;
  /**
   * Below this note count, always build the full graph so the demo and
   * small vaults show every note. At/above this size, ego (2-hop) is used.
   */
  egoGraphMinNotes: number;
  /** Same threshold as ego — folder map kicks in at this size */
  folderGraphMinNotes: number;
  /** Hard draw budget for folder-browse levels */
  folderMaxNodes: number;
  /** LRU body cache size when lazyBodies on */
  bodyLruSize: number;
}

/** Production defaults: one scale-safe path for every real vault. */
const DEFAULTS: ScaleFlags = {
  virtualTree: true,
  lazyBodies: true,
  searchBackend: "fts5",
  egoGraph: true,
  folderGraph: true,
  nativeVaultIndex: true,
  virtualTreeMinNodes: 0,
  egoGraphMinNotes: 400,
  folderGraphMinNotes: 400,
  folderMaxNodes: 320,
  bodyLruSize: 120,
};

let overrides: Partial<ScaleFlags> = {};

export function getScaleFlags(): ScaleFlags {
  return { ...DEFAULTS, ...overrides };
}

export function setScaleFlags(partial: Partial<ScaleFlags>): void {
  overrides = { ...overrides, ...partial };
}

/** Apply the universal scale-safe flag kit (call on boot / reset). */
export function applyScaleSafeDefaults(): void {
  overrides = {};
  setScaleFlags({ ...DEFAULTS });
}

export function shouldVirtualizeTree(_nodeCount: number): boolean {
  return getScaleFlags().virtualTree;
}

export function shouldUseEgoGraph(noteCount: number): boolean {
  const f = getScaleFlags();
  if (!f.egoGraph) return false;
  const min = f.egoGraphMinNotes > 0 ? f.egoGraphMinNotes : 400;
  return noteCount >= min;
}

/** Large vaults use folder map (when folderGraph enabled). */
export function shouldUseFolderGraph(noteCount: number): boolean {
  const f = getScaleFlags();
  if (!f.folderGraph) return false;
  const min = f.folderGraphMinNotes > 0 ? f.folderGraphMinNotes : 400;
  return noteCount >= min;
}

import { LARGE_TEST_VAULT_ID } from "./large-test-vault";

/**
 * In-browser 45k seed uses mode "local" but must behave like a disk vault:
 * meta-only store + body archive + durable FTS. Demo/other local stay eager.
 */
export function isLargeMemoryVault(vaultId: string | null | undefined): boolean {
  return vaultId === LARGE_TEST_VAULT_ID;
}

/**
 * Disk vaults always lazy-load bodies. Demo + ordinary local stay eager.
 * Large-test local (vaultId) is the exception — bodies live in the archive.
 */
export function shouldLazyBodies(mode: string, vaultId?: string | null): boolean {
  const f = getScaleFlags();
  if (!f.lazyBodies) return false;
  if (isLargeMemoryVault(vaultId)) return true;
  return mode === "fsa" || mode === "desktop" || mode === "sandbox";
}

/**
 * Durable FTS for disk modes. Large-test local also opts in so search stays
 * scale-safe without flipping the whole "local" persist contract.
 */
export function shouldUseDurableIndex(mode: string, vaultId?: string | null): boolean {
  if (isLargeMemoryVault(vaultId)) return true;
  return mode === "fsa" || mode === "desktop" || mode === "sandbox";
}
