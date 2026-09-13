/**
 * Desktop FS scope helpers — no Tauri imports (unit-testable).
 *
 * Dialog-picked folders are added to plugin-fs persisted-scope automatically.
 * Programmatic opens (Wave E / soak / reopen-by-path) must register the same
 * way. Capability JSON still does not allow all of $HOME.
 */

export const DESKTOP_FS_FORBIDDEN_PREFIX =
  "Cannot read vault folder (desktop FS scope denied)";

export function isForbiddenFsError(err: unknown): boolean {
  const msg = (err instanceof Error ? err.message : String(err ?? "")).toLowerCase();
  if (!msg) return false;
  if (msg.includes("forbidden path") || msg.includes("forbidden:")) return true;
  if (msg.includes("path not allowed")) return true;
  if (msg.includes("not allowed on the configured scope")) return true;
  if (msg.includes("scope denied") || msg.includes("fs scope")) return true;
  if (msg.includes("desktop fs scope denied")) return true;
  if (
    (msg.includes("denied") || msg.includes("unauthorized") || msg.includes("authorization")) &&
    (msg.includes("path") || msg.includes("scope") || msg.includes("permission") || msg.includes("fs"))
  ) {
    return true;
  }
  return false;
}

export function desktopFsForbiddenMessage(root: string): string {
  return `${DESKTOP_FS_FORBIDDEN_PREFIX}: ${root}. Open the folder with Open folder, or put the vault under Documents, Desktop, or Downloads.`;
}

export class DesktopFsForbiddenError extends Error {
  readonly root: string;
  constructor(root: string, cause?: unknown) {
    super(desktopFsForbiddenMessage(root));
    this.name = "DesktopFsForbiddenError";
    this.root = root;
    if (cause !== undefined) {
      (this as Error & { cause?: unknown }).cause = cause;
    }
  }
}
