/**
 * Platform boundary — browser (File System Access) or Tauri desktop shell.
 */

export type PlatformKind = "web" | "tauri" | "unknown";

export function detectPlatform(): PlatformKind {
  if (typeof window === "undefined") return "unknown";
  const w = window as unknown as {
    __TAURI__?: unknown;
    __TAURI_INTERNALS__?: unknown;
    isTauri?: boolean;
  };
  // withGlobalTauri + Tauri 2 internals
  if (w.__TAURI_INTERNALS__ || w.__TAURI__ || w.isTauri === true) return "tauri";
  // Some builds expose only a protocol handler
  try {
    if (typeof (window as unknown as { __TAURI_OS_PLUGIN_INTERNALS__?: unknown }).__TAURI_OS_PLUGIN_INTERNALS__ !== "undefined") {
      return "tauri";
    }
  } catch {
    /* ignore */
  }
  return "web";
}

export function isDesktopShell(): boolean {
  return detectPlatform() === "tauri";
}

/** Async confirm (preferred when opening vaults / menus) */
export async function confirmDesktopShell(): Promise<boolean> {
  if (isDesktopShell()) return true;
  try {
    const { isTauri } = await import("@tauri-apps/api/core");
    return isTauri();
  } catch {
    return false;
  }
}

/** Local filesystem folder open available on this runtime */
export function canOpenLocalVaultFolder(): boolean {
  if (typeof window === "undefined") return false;
  if (isDesktopShell()) return true;
  return "showDirectoryPicker" in window;
}

/**
 * Module map for desktop / web:
 * - src/lib/vault/fs-adapter.ts     → browser File System Access
 * - src/lib/vault/tauri-adapter.ts  → Tauri plugin-fs + dialog
 * - src/lib/markdown/*              → pure, platform-agnostic
 * - src/lib/graph/*                 → pure
 * - src/lib/search/*                → pure
 * - src/components/*                → UI only
 */
export const MODULE_BOUNDARIES = {
  vault: "src/lib/vault",
  markdown: "src/lib/markdown",
  graph: "src/lib/graph",
  search: "src/lib/search",
  platform: "src/lib/platform",
  desktop: "src/lib/desktop",
} as const;
