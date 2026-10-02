/**
 * Default Wave E / scale vault location — under Documents so Tauri
 * capabilities (`$HOME/Documents/**`, `$DOCUMENT/**`) can read it
 * even before persisted-scope is granted. Do not default to `$HOME/nexus-scale-N`.
 */
import os from "node:os";
import path from "node:path";

export function documentsDir() {
  if (process.env.NEXUS_SCALE_DOCUMENTS) {
    return path.resolve(process.env.NEXUS_SCALE_DOCUMENTS);
  }
  if (process.env.XDG_DOCUMENTS_DIR) {
    return path.resolve(process.env.XDG_DOCUMENTS_DIR);
  }
  const home = process.env.USERPROFILE || os.homedir();
  return path.join(home, "Documents");
}

/** Folder name: `nexus-scale-100k`, not `nexus-scale-100000`. */
export function scaleVaultFolderName(notes) {
  const n = Number(notes);
  const label = Number.isFinite(n) && n > 0 ? n : 100000;
  if (label >= 1000 && label % 1000 === 0) return `nexus-scale-${label / 1000}k`;
  return `nexus-scale-${label}`;
}

/** `~/Documents/nexus-scale-100k` (Windows: %USERPROFILE%\\Documents\\nexus-scale-100k). */
export function defaultScaleVaultPath(notes) {
  if (process.env.NEXUS_SCALE_VAULT) {
    return path.resolve(process.env.NEXUS_SCALE_VAULT);
  }
  return path.join(documentsDir(), scaleVaultFolderName(notes));
}
