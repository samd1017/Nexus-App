/**
 * Which `.base` paths Bases can open. Listing and reading stay in `vault-bases.ts`.
 */

import { DEMO_VAULT_BASES } from "@/lib/vault/demo-bases";

export type VaultBaseEntry = { path: string; name: string };

type NodeLike = { path?: string; name?: string; kind?: string };

export function isVaultBasePath(path: string): boolean {
  return path.replace(/\\/g, "/").toLowerCase().endsWith(".base");
}

function entry(path: string, name?: string): VaultBaseEntry {
  const clean = path.replace(/\\/g, "/").replace(/^\/+/, "");
  return { path: clean, name: name?.trim() || clean.split("/").pop() || clean };
}

/** Unique vault-relative `.base` paths, nodes first, then disk, then demo fixtures. */
export function vaultBaseEntries(opts: {
  nodes: Record<string, NodeLike>;
  diskPaths?: string[];
  includeDemo?: boolean;
}): VaultBaseEntry[] {
  const seen = new Set<string>();
  const out: VaultBaseEntry[] = [];
  const add = (path: string, name?: string) => {
    const item = entry(path, name);
    const key = item.path.toLowerCase();
    if (!isVaultBasePath(item.path) || seen.has(key)) return;
    seen.add(key);
    out.push(item);
  };
  for (const node of Object.values(opts.nodes)) {
    if (!node?.path || node.kind === "folder") continue;
    add(node.path, node.name);
  }
  for (const path of opts.diskPaths ?? []) add(path);
  if (opts.includeDemo) {
    for (const file of DEMO_VAULT_BASES) add(file.path, file.name);
  }
  return out.sort((a, b) => a.path.localeCompare(b.path));
}
