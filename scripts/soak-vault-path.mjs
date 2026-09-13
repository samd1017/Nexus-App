/**
 * Default Wave E / soak vault location — under Documents so Tauri
 * capabilities (`$HOME/Documents/**`, `$DOCUMENT/**`) can read it
 * even before persisted-scope is granted. Do not default to `$HOME/nexus-soak-N`.
 */
import os from "node:os";
import path from "node:path";

export function documentsDir() {
  if (process.env.NEXUS_SOAK_DOCUMENTS) {
    return path.resolve(process.env.NEXUS_SOAK_DOCUMENTS);
  }
  if (process.env.XDG_DOCUMENTS_DIR) {
    return path.resolve(process.env.XDG_DOCUMENTS_DIR);
  }
  const home = process.env.USERPROFILE || os.homedir();
  return path.join(home, "Documents");
}

/** Folder name matching docs / Tower soak: `nexus-soak-100k`, not `nexus-soak-100000`. */
export function soakVaultFolderName(notes) {
  const n = Number(notes);
  const label = Number.isFinite(n) && n > 0 ? n : 100000;
  if (label >= 1000 && label % 1000 === 0) return `nexus-soak-${label / 1000}k`;
  return `nexus-soak-${label}`;
}

/** `~/Documents/nexus-soak-100k` (Windows: %USERPROFILE%\\Documents\\nexus-soak-100k). */
export function defaultSoakVaultPath(notes) {
  if (process.env.NEXUS_SOAK_VAULT) {
    return path.resolve(process.env.NEXUS_SOAK_VAULT);
  }
  return path.join(documentsDir(), soakVaultFolderName(notes));
}
