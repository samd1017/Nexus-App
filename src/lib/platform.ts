/**
 * Platform boundary — browser today, Tauri-ready tomorrow.
 * Desktop shell can inject APIs without rewriting vault domain logic.
 */

export type PlatformKind = "web" | "tauri" | "unknown";

export function detectPlatform(): PlatformKind {
  if (typeof window === "undefined") return "unknown";
  // Future: window.__TAURI_INTERNALS__ or import("@tauri-apps/api")
  const w = window as unknown as { __TAURI__?: unknown; __TAURI_INTERNALS__?: unknown };
  if (w.__TAURI__ || w.__TAURI_INTERNALS__) return "tauri";
  return "web";
}

export function isDesktopShell(): boolean {
  return detectPlatform() === "tauri";
}

/** Local filesystem capabilities available on this runtime */
export function canOpenLocalVaultFolder(): boolean {
  return typeof window !== "undefined" && "showDirectoryPicker" in window;
}

/**
 * Module map for a future Tauri port:
 * - src/lib/vault/*   → domain + FS adapter (swap FSA for tauri-plugin-fs)
 * - src/lib/markdown/* → pure, platform-agnostic
 * - src/lib/graph/*    → pure
 * - src/lib/search/*   → pure
 * - src/lib/cloud/*    → optional synced-folder prefs
 * - src/components/*   → UI only
 */
export const MODULE_BOUNDARIES = {
  vault: "src/lib/vault",
  markdown: "src/lib/markdown",
  graph: "src/lib/graph",
  search: "src/lib/search",
  platform: "src/lib/platform",
} as const;
