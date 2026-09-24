/**
 * Desktop launch paints the saved page before the rest of the app loads.
 * The editor bundle is not on that clock. This module stays free of the store.
 */

export const SAVED_PAGE_READY_MESSAGE = "Ready · titles and open notes";

export const DESKTOP_ROOT_STORAGE_KEY = "nexus-desktop-vault-root";
export const DESKTOP_PREFS_STORAGE_KEY = "nexus-prefs-v1";
export const DESKTOP_VAULT_STORAGE_KEY = "nexus-vault-v1";

export function readOpenLastVault(raw: string | null): boolean {
  if (!raw) return true;
  try {
    const parsed = JSON.parse(raw) as { state?: { openLastVault?: boolean } };
    return parsed?.state?.openLastVault !== false;
  } catch {
    return true;
  }
}

export function readLastNotePath(raw: string | null): string | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as {
      state?: { settings?: { lastNotePath?: unknown } };
    };
    const path = parsed?.state?.settings?.lastNotePath;
    return typeof path === "string" && path.trim() ? path : null;
  } catch {
    return null;
  }
}

export function shouldPrefetchSavedPage(opts: {
  inTauri: boolean;
  root: string | null;
  openLastVault: boolean;
}): boolean {
  return opts.inTauri && Boolean(opts.root) && opts.openLastVault;
}

/** A mount can be drawn before the index file opens. */
export function savedPageTitlesLive(mount: {
  titlesLive?: boolean;
  titles_live?: boolean;
  pending?: boolean;
  rows?: unknown[] | null;
} | null | undefined): boolean {
  if (!mount || mount.pending) return false;
  const live = mount.titlesLive === true || mount.titles_live === true;
  return live && Array.isArray(mount.rows) && mount.rows.length > 0;
}

type BootSlot = {
  root?: string;
  mount?: unknown;
  mountMs?: number;
};

function bootSlot(): BootSlot | null {
  const win = (globalThis as { window?: { __NEXUS_BOOT__?: BootSlot } }).window;
  if (!win) return null;
  return win.__NEXUS_BOOT__ ?? null;
}

/** One-shot. The shell mount must not be read twice. */
export function takePrefetchedDesktopShell(root: string): unknown | null {
  const boot = bootSlot();
  if (!boot || boot.root !== root || boot.mount == null) return null;
  const mount = boot.mount;
  boot.mount = undefined;
  return mount;
}
