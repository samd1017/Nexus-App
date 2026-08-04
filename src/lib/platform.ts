/**
 * Platform boundary — browser (File System Access), Tauri desktop, or Tauri mobile.
 */

export type PlatformKind = "web" | "tauri" | "tauri-mobile" | "unknown";

export function detectPlatform(): PlatformKind {
  if (typeof window === "undefined") return "unknown";
  const w = window as unknown as {
    __TAURI__?: unknown;
    __TAURI_INTERNALS__?: unknown;
    isTauri?: boolean;
  };
  const isTauri =
    !!(w.__TAURI_INTERNALS__ || w.__TAURI__ || w.isTauri === true);
  if (isTauri) {
    // Wave 4: mobile shell detection (Tauri Mobile / small viewport shell)
    try {
      const ua = navigator.userAgent || "";
      if (/Android|iPhone|iPad|iPod/i.test(ua)) return "tauri-mobile";
    } catch {
      /* ignore */
    }
    return "tauri";
  }
  try {
    if (
      typeof (window as unknown as { __TAURI_OS_PLUGIN_INTERNALS__?: unknown })
        .__TAURI_OS_PLUGIN_INTERNALS__ !== "undefined"
    ) {
      return "tauri";
    }
  } catch {
    /* ignore */
  }
  return "web";
}

export function isDesktopShell(): boolean {
  const p = detectPlatform();
  return p === "tauri" || p === "tauri-mobile";
}

export function isMobileShell(): boolean {
  if (detectPlatform() === "tauri-mobile") return true;
  if (typeof window === "undefined") return false;
  try {
    return window.matchMedia("(max-width: 768px)").matches;
  } catch {
    return false;
  }
}

/** True for macOS desktop (not iOS/iPad) — traffic lights, overlay titlebar. */
export function isMacOS(): boolean {
  if (typeof navigator === "undefined") return false;
  // Prefer userAgentData when available
  try {
    const uad = (
      navigator as Navigator & { userAgentData?: { platform?: string } }
    ).userAgentData;
    if (uad?.platform) {
      return /mac/i.test(uad.platform);
    }
  } catch {
    /* ignore */
  }
  const p = navigator.platform || "";
  const ua = navigator.userAgent || "";
  if (/iPhone|iPad|iPod/i.test(ua) || /iPhone|iPad|iPod/i.test(p)) return false;
  return /Mac/i.test(p) || /Mac OS X/i.test(ua);
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

/** True when UI should show Apple-style ⌘ shortcuts (Mac/iOS). */
export function isAppleModPlatform(): boolean {
  if (typeof navigator === "undefined") return false;
  try {
    const uad = (
      navigator as Navigator & { userAgentData?: { platform?: string } }
    ).userAgentData;
    if (uad?.platform) {
      return /mac|iphone|ipad|ipod/i.test(uad.platform);
    }
  } catch {
    /* ignore */
  }
  const p = navigator.platform || "";
  const ua = navigator.userAgent || "";
  return /Mac|iPhone|iPad|iPod/i.test(p) || /Mac OS X|iPhone|iPad|iPod/i.test(ua);
}

/** Modifier symbol for display: ⌘ on Apple, Ctrl on Windows/Linux. */
export function modSymbol(): string {
  return isAppleModPlatform() ? "⌘" : "Ctrl";
}

/**
 * Format a shortcut for UI.
 * Examples: formatShortcut("K") → "⌘K" or "Ctrl+K"
 * formatShortcut("\\") → "⌘\\" or "Ctrl+\\"
 * formatShortcut(",", { alt: true }) → "⌘⌥," / "Ctrl+Alt+,"
 * formatShortcut("⌫") for delete
 */
export function formatShortcut(
  key: string,
  opts?: { alt?: boolean; shift?: boolean; noMod?: boolean },
): string {
  if (opts?.noMod) return key;
  const apple = isAppleModPlatform();
  const parts: string[] = [];
  if (apple) {
    parts.push("⌘");
    if (opts?.alt) parts.push("⌥");
    if (opts?.shift) parts.push("⇧");
    parts.push(key);
    return parts.join("");
  }
  parts.push("Ctrl");
  if (opts?.alt) parts.push("Alt");
  if (opts?.shift) parts.push("Shift");
  parts.push(key);
  return parts.join("+");
}
