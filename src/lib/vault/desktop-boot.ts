/**
 * Desktop launch paints the saved page before the rest of the app loads.
 * The editor bundle is not on that clock. This module stays free of the store.
 */

export const SAVED_PAGE_READY_MESSAGE = "Ready · titles and open notes";

export const DESKTOP_ROOT_STORAGE_KEY = "nexus-desktop-vault-root";
export const DESKTOP_PREFS_STORAGE_KEY = "nexus-prefs-v1";
export const DESKTOP_VAULT_STORAGE_KEY = "nexus-vault-v1";
/** Last titles-live page. Names only — the catalog stays on disk. */
export const DESKTOP_SAVED_PAGE_KEY = "nexus-desktop-saved-page";
export const SAVED_PAGE_NAME_CAP = 12;

export type SavedPageRecord = {
  root: string;
  names: string[];
};

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

export function namesFromPageRows(
  rows: Array<{ name?: unknown; path?: unknown }> | null | undefined,
): string[] {
  const names: string[] = [];
  for (const row of rows ?? []) {
    let name = typeof row?.name === "string" ? row.name.trim() : "";
    if (!name && typeof row?.path === "string") {
      const path = row.path.replace(/\\/g, "/");
      name = path.split("/").filter(Boolean).pop() || "";
    }
    if (!name) continue;
    names.push(name);
    if (names.length >= SAVED_PAGE_NAME_CAP) break;
  }
  return names;
}

/** A real saved page: this vault, and at least one name. */
export function savedPageRecord(
  root: string | null | undefined,
  rows: Array<{ name?: unknown }> | null | undefined,
): SavedPageRecord | null {
  const trimmed = typeof root === "string" ? root.trim() : "";
  const names = namesFromPageRows(rows);
  if (!trimmed || names.length === 0) return null;
  return { root: trimmed, names };
}

export function readSavedPage(raw: string | null): SavedPageRecord | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as { root?: unknown; names?: unknown };
    if (typeof parsed?.root !== "string" || !Array.isArray(parsed.names)) return null;
    return savedPageRecord(parsed.root, parsed.names.map((name) => ({ name })));
  } catch {
    return null;
  }
}

/** Slash and trailing-slash differences are the same vault. */
export function vaultRootsMatch(
  a: string | null | undefined,
  b: string | null | undefined,
): boolean {
  const norm = (value: string | null | undefined) =>
    String(value || "")
      .replace(/\\/g, "/")
      .replace(/\/+$/, "");
  const left = norm(a);
  return left.length > 0 && left === norm(b);
}

export function savedPageMatchesLaunch(
  page: SavedPageRecord | null,
  root: string | null,
  openLastVault: boolean,
): boolean {
  if (!page || !openLastVault || !root) return false;
  return vaultRootsMatch(page.root, root) && page.names.length > 0;
}

type BannerHost = {
  hidden?: boolean;
  textContent?: string | null;
};

/**
 * The document already drew the saved page. Leave that line up until the
 * shell is showing the same Ready. An error must not take it down.
 */
export function savedPageBannerUp(): boolean {
  const doc = (globalThis as { document?: { getElementById?: (id: string) => BannerHost | null } })
    .document;
  const host = doc?.getElementById?.("nexus-boot-banner");
  if (!host || host.hidden) return false;
  return (host.textContent ?? "").includes(SAVED_PAGE_READY_MESSAGE);
}

type PageStorage = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
};

type BootMark = { savedPageWrite?: "ok" | "failed" };

function bootMark(): BootMark | null {
  const win = (globalThis as { window?: { __NEXUS_BOOT__?: BootMark } }).window;
  if (!win) return null;
  return (win.__NEXUS_BOOT__ ??= {});
}

/** Cookie copy of the saved page. The parse-time script can read it with no module. */
export function readSavedPageCookie(cookie: string | null | undefined): string | null {
  if (!cookie) return null;
  const prefix = `${DESKTOP_SAVED_PAGE_KEY}=`;
  for (const part of cookie.split(";")) {
    const trimmed = part.trim();
    if (!trimmed.startsWith(prefix)) continue;
    try {
      return decodeURIComponent(trimmed.slice(prefix.length));
    } catch {
      return null;
    }
  }
  return null;
}

function writeSavedPageCookie(payload: string): boolean {
  const doc = (globalThis as { document?: { cookie?: string } }).document;
  if (!doc) return false;
  try {
    const encoded = encodeURIComponent(payload);
    doc.cookie = `${DESKTOP_SAVED_PAGE_KEY}=${encoded}; Path=/; Max-Age=31536000; SameSite=Lax`;
    return readSavedPageCookie(doc.cookie) === payload || (doc.cookie ?? "").includes(encoded);
  } catch {
    return false;
  }
}

/**
 * Remember a titles-live page so the next window can draw it before any module.
 * Returns false when neither store kept the page — the next launch would wait
 * on the shell. Callers surface that; this does not hide it.
 */
export function rememberSavedPage(
  root: string,
  rows: Array<{ name?: unknown; path?: unknown }> | null | undefined,
): boolean {
  const record = savedPageRecord(root, rows);
  const mark = (ok: boolean) => {
    const boot = bootMark();
    if (boot) boot.savedPageWrite = ok ? "ok" : "failed";
    return ok;
  };
  if (!record) return mark(false);
  const payload = JSON.stringify(record);
  let ok = false;
  const storage = (globalThis as { localStorage?: PageStorage }).localStorage;
  if (storage) {
    for (let attempt = 0; attempt < 2 && !ok; attempt += 1) {
      try {
        storage.setItem(DESKTOP_SAVED_PAGE_KEY, payload);
        ok = storage.getItem(DESKTOP_SAVED_PAGE_KEY) === payload;
      } catch {
        ok = false;
      }
    }
  }
  if (writeSavedPageCookie(payload)) ok = true;
  return mark(ok);
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
