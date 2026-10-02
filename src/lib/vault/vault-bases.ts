/**
 * `.base` files that already live in the vault. Opening one loads its views
 * through the same reader as Import. Nexus still saves views to the live
 * file (`Nexus Bases.base`, or browser storage), not back into the file opened.
 */

import { DEMO_VAULT_ID, demoBaseFile } from "@/lib/vault/demo-bases";
import { listFsaBaseFiles, readNoteFile } from "@/lib/vault/fs-adapter";
import { getDesktopRoot, getFsaRoot, useVaultStore } from "@/lib/vault/store";
import { listDesktopBaseFiles, readDesktopNote } from "@/lib/vault/tauri-adapter";
import { vaultBaseEntries, type VaultBaseEntry } from "@/lib/vault/vault-base-list";

export type { VaultBaseEntry } from "@/lib/vault/vault-base-list";
export { vaultBaseEntries } from "@/lib/vault/vault-base-list";

export async function listVaultBaseFiles(): Promise<VaultBaseEntry[]> {
  const state = useVaultStore.getState();
  const desktop = getDesktopRoot();
  const fsa = desktop ? null : getFsaRoot();
  let diskPaths: string[] = [];
  try {
    if (desktop) diskPaths = await listDesktopBaseFiles(desktop);
    else if (fsa) diskPaths = await listFsaBaseFiles(fsa);
  } catch {
    diskPaths = [];
  }
  return vaultBaseEntries({
    nodes: state.nodes,
    diskPaths,
    includeDemo: state.vaultId === DEMO_VAULT_ID,
  });
}

/** Body of a vault `.base`. Demo fixtures count when the file is not a real note. */
export async function readVaultBaseText(path: string): Promise<string> {
  const clean = path.replace(/\\/g, "/").replace(/^\/+/, "");
  const state = useVaultStore.getState();
  for (const node of Object.values(state.nodes)) {
    if (node.kind === "folder" || !node.path) continue;
    if (node.path.replace(/\\/g, "/") !== clean) continue;
    if (typeof node.content === "string") return node.content;
  }
  const desktop = getDesktopRoot();
  if (desktop) return readDesktopNote(desktop, clean);
  const fsa = desktop ? null : getFsaRoot();
  if (fsa) return readNoteFile(fsa, clean);
  if (state.vaultId === DEMO_VAULT_ID) {
    const demo = demoBaseFile(clean);
    if (demo) return demo.text;
  }
  throw new Error(`${clean} is not in this vault.`);
}
