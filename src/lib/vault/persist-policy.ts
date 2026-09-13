/**
 * localStorage partialize policy — single source of truth for store + tests.
 *
 * Hard caps (browser):
 * - Never persist note bodies / node maps above PARTIALIZE_NODE_CAP (QuotaExceeded).
 * - Disk vaults never persist nodes (markdown on disk is canonical).
 * - Large in-memory seeds (45k / soak-*) persist a remount ticket instead of nodes
 *   so reload can restore last note + dual-pane without blowing quota.
 * - Session creates/edits on those seeds go to IndexedDB overlay
 *   (`large-vault-overlay.ts`), not this localStorage slice.
 */

import { isLargeMemoryVault } from "./scale-flags";
import { isSyntheticSoakVault, parseSoakNoteCount } from "./synthetic-vault";
import type { VaultMode, VaultSettings } from "./types";

/** Persist full node map only at or below this count (strict > empties). */
export const PARTIALIZE_NODE_CAP = 2500;

export type ScaleRemount = {
  kind: "soak" | "large-test";
  vaultId: string;
  vaultName: string;
  noteCount: number | null;
  lastNotePath: string | null;
  lastSecondaryNotePath: string | null;
  workspaceSplit: boolean;
};

export type PersistSlice = {
  vaultId: string | null;
  vaultName: string;
  vaultPath: string;
  mode: VaultMode | "demo";
  nodes: Record<string, unknown>;
  rootIds: string[];
  activeNoteId: string | null;
  secondaryNoteId: string | null;
  settings: VaultSettings | Record<string, unknown>;
  expandedFolders: string[];
  scaleRemount: ScaleRemount | null;
};

export type PersistInput = {
  mode?: string;
  vaultId?: string | null;
  vaultName?: string;
  vaultPath?: string;
  nodes?: Record<string, unknown>;
  rootIds?: string[];
  activeNoteId?: string | null;
  secondaryNoteId?: string | null;
  settings?: VaultSettings | Record<string, unknown>;
  expandedFolders?: string[];
  scaleRemount?: ScaleRemount | null;
};

function settingsOf(s: PersistInput): Record<string, unknown> {
  return (s.settings ?? {}) as Record<string, unknown>;
}

export function buildScaleRemount(s: PersistInput): ScaleRemount | null {
  const id = s.vaultId ?? null;
  if (!isLargeMemoryVault(id)) return s.scaleRemount ?? null;
  const st = settingsOf(s);
  const soakN =
    (typeof st.soakNoteCount === "number" ? st.soakNoteCount : null) ??
    parseSoakNoteCount(id);
  return {
    kind: isSyntheticSoakVault(id) ? "soak" : "large-test",
    vaultId: id!,
    vaultName: s.vaultName || (isSyntheticSoakVault(id) ? `Soak ${soakN}` : "Large Test Vault"),
    noteCount: soakN,
    lastNotePath: (st.lastNotePath as string | null) ?? null,
    lastSecondaryNotePath: (st.lastSecondaryNotePath as string | null) ?? null,
    workspaceSplit: Boolean(st.workspaceSplit),
  };
}

export function partializeVaultPersist(s: PersistInput): PersistSlice {
  const disk = s.mode === "fsa" || s.mode === "desktop";
  const isLarge = isLargeMemoryVault(s.vaultId);
  // Skip Object.keys on 45k–500k maps — persist fires on every store set.
  const nodeCount =
    disk || isLarge ? 0 : s.nodes ? Object.keys(s.nodes).length : 0;
  const tooBig = isLarge || nodeCount > PARTIALIZE_NODE_CAP;
  const st = settingsOf(s);
  const remount = tooBig || isLarge ? buildScaleRemount(s) : null;

  if (disk || tooBig) {
    return {
      vaultId: null,
      vaultName: "",
      vaultPath: "",
      mode: "demo",
      nodes: {},
      rootIds: [],
      activeNoteId: null,
      secondaryNoteId: null,
      settings: {
        ...st,
        // Keep session intent; remount reapplies split after nodes exist.
        workspaceSplit: remount?.workspaceSplit ?? Boolean(st.workspaceSplit),
        lastNotePath: remount?.lastNotePath ?? (st.lastNotePath as string | null) ?? null,
        lastSecondaryNotePath:
          remount?.lastSecondaryNotePath ??
          (st.lastSecondaryNotePath as string | null) ??
          null,
        soakNoteCount: remount?.noteCount ?? st.soakNoteCount ?? null,
      },
      expandedFolders: [],
      scaleRemount: remount,
    };
  }

  return {
    vaultId: s.vaultId ?? null,
    vaultName: s.vaultName ?? "",
    vaultPath: s.vaultPath ?? "",
    mode: (s.mode as VaultMode) ?? "demo",
    nodes: s.nodes ?? {},
    rootIds: s.rootIds ?? [],
    activeNoteId: s.activeNoteId ?? null,
    secondaryNoteId: s.secondaryNoteId ?? null,
    settings: s.settings ?? {},
    expandedFolders: s.expandedFolders ?? [],
    scaleRemount: null,
  };
}
