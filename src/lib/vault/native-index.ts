/**
 * Native vault index contract (Rust/SQLite path).
 * JS walk remains fallback; native methods optional when Tauri commands exist.
 * Mobile + desktop share vault_meta_walk / vault_index_ping command names.
 */

import type { VaultNode } from "./types";
import type { VaultScan } from "./fs-adapter";
import type { NodeMeta } from "./backend";
import { getScaleFlags } from "./scale-flags";

export type NativeIndexStatus =
  | { available: false; reason: string }
  | { available: true; version: string };

/** Probe whether Rust bulk meta / FTS commands are registered. */
export async function probeNativeVaultIndex(): Promise<NativeIndexStatus> {
  if (!getScaleFlags().nativeVaultIndex) {
    return { available: false, reason: "flag_off" };
  }
  try {
    const { invoke } = await import("@tauri-apps/api/core");
    const version = await invoke<string>("vault_index_ping");
    if (version) {
      return { available: true, version };
    }
    return { available: false, reason: "empty_ping" };
  } catch {
    return { available: false, reason: "not_tauri_or_commands_missing" };
  }
}

/**
 * Bulk meta listing — uses native when available, else null (caller uses JS walk).
 */
export async function nativeMetaWalk(
  root: string,
): Promise<NodeMeta[] | null> {
  const status = await probeNativeVaultIndex();
  if (!status.available) return null;
  try {
    const { invoke } = await import("@tauri-apps/api/core");
    const raw = await invoke<
      Array<{
        path: string;
        name: string;
        kind: string;
        mtime: number;
        size?: number | null;
      }>
    >("vault_meta_walk", { root });
    if (!raw || !Array.isArray(raw) || raw.length === 0) return null;
    return raw.map((r) => ({
      path: r.path.replace(/\\/g, "/"),
      name: r.name,
      kind: r.kind === "folder" ? ("folder" as const) : ("note" as const),
      mtime: Number(r.mtime) || Date.now(),
      size: r.size != null ? Number(r.size) : undefined,
    }));
  } catch {
    return null;
  }
}

function nodeIdFromPath(path: string): string {
  return "desk_" + path.replace(/[^a-zA-Z0-9._/-]+/g, "_");
}

/**
 * Convert native/JS NodeMeta list into a meta-only VaultScan (no bodies).
 * Ensures parent folders exist even if the walker only emitted notes.
 */
export function vaultScanFromNodeMeta(items: NodeMeta[]): VaultScan {
  const nodes: Record<string, VaultNode> = {};
  const signatures: Record<string, string> = {};
  const pathToId = new Map<string, string>();
  const rootIds: string[] = [];

  // Ensure every parent folder path exists as a meta entry
  const byPath = new Map<string, NodeMeta>();
  for (const m of items) {
    const p = m.path.replace(/\\/g, "/").replace(/^\/+/, "");
    if (!p) continue;
    byPath.set(p, { ...m, path: p });
    if (m.kind === "note") {
      const parts = p.split("/");
      let acc = "";
      for (let i = 0; i < parts.length - 1; i++) {
        acc = acc ? `${acc}/${parts[i]}` : parts[i];
        if (!byPath.has(acc)) {
          byPath.set(acc, {
            path: acc,
            name: parts[i],
            kind: "folder",
            mtime: m.mtime,
          });
        }
      }
    }
  }

  const sorted = [...byPath.values()].sort(
    (a, b) =>
      a.path.split("/").length - b.path.split("/").length ||
      a.path.localeCompare(b.path),
  );

  for (const m of sorted) {
    const id = nodeIdFromPath(m.path);
    pathToId.set(m.path, id);
    const slash = m.path.lastIndexOf("/");
    const parentPath = slash >= 0 ? m.path.slice(0, slash) : "";
    const parentId = parentPath ? pathToId.get(parentPath) ?? null : null;
    nodes[id] = {
      id,
      path: m.path,
      name: m.name,
      kind: m.kind === "folder" ? "folder" : "note",
      parentId,
      mtime: m.mtime,
      // notes: content omitted (meta-only)
      ...(m.kind === "note" ? {} : {}),
    };
    if (m.kind === "note") {
      signatures[m.path] = `${m.mtime}:${m.size ?? 0}`;
    }
    if (!parentPath) rootIds.push(id);
  }

  rootIds.sort((a, b) => {
    const na = nodes[a];
    const nb = nodes[b];
    if (na.kind !== nb.kind) return na.kind === "folder" ? -1 : 1;
    return na.name.localeCompare(nb.name);
  });

  return { nodes, rootIds, signatures };
}

export type OpenProgress = {
  phase: "idle" | "walking" | "indexing" | "ready" | "error";
  scanned: number;
  totalHint: number | null;
  message: string;
};

let progressListeners = new Set<(p: OpenProgress) => void>();
let lastProgress: OpenProgress = {
  phase: "idle",
  scanned: 0,
  totalHint: null,
  message: "",
};

export function getOpenProgress(): OpenProgress {
  return lastProgress;
}

export function setOpenProgress(p: Partial<OpenProgress>): void {
  lastProgress = { ...lastProgress, ...p };
  for (const l of progressListeners) l(lastProgress);
}

export function subscribeOpenProgress(
  fn: (p: OpenProgress) => void,
): () => void {
  progressListeners.add(fn);
  return () => progressListeners.delete(fn);
}
