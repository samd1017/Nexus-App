/**
 * Narrow / mobile viewport helpers for layout chrome.
 */

import { useVaultStore } from "@/lib/vault/store";

const NARROW_MQ = "(max-width: 899px)";
const PHONE_MQ = "(max-width: 640px)";

export function isNarrowViewport(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.matchMedia(NARROW_MQ).matches;
  } catch {
    return window.innerWidth < 900;
  }
}

export function isPhoneViewport(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.matchMedia(PHONE_MQ).matches;
  } catch {
    return window.innerWidth < 640;
  }
}

/** Close drawer panels after navigation on narrow screens. */
export function closeDrawersIfNarrow(): void {
  if (!isNarrowViewport()) return;
  const s = useVaultStore.getState();
  if (s.settings.leftOpen) s.setLeftOpen(false);
  // On phone, note open should focus the editor — close right drawer too
  if (isPhoneViewport() && s.settings.rightOpen) s.setRightOpen(false);
}

/**
 * ⌘G / Graph toolbar: always enter fullscreen (idempotent).
 * A second press must not bounce the demo back to the editor — leave via
 * Esc or Exit graph only (`exitGraphForViewport`).
 */
export function enterGraphFullscreen(): void {
  const s = useVaultStore.getState();
  if (isPhoneViewport()) {
    if (s.settings.leftOpen) s.setLeftOpen(false);
    if (s.settings.rightOpen) s.setRightOpen(false);
  }
  if (s.settings.graphMode !== "fullscreen") {
    s.setGraphMode("fullscreen");
  }
}

/** @deprecated Use enterGraphFullscreen — kept so older call sites stay enter-only. */
export function toggleGraphForViewport(): void {
  enterGraphFullscreen();
}

export function exitGraphForViewport(): void {
  const s = useVaultStore.getState();
  s.setGraphMode(isPhoneViewport() ? "hidden" : "panel");
  // Leave the graph surface — do not remount ForceGraph3D in the side panel
  // (that 3D init was stealing the next note-create / note-switch frame).
  if (s.rightTab === "graph") s.setRightTab("backlinks");
}

/** Phone: open/close the backlinks drawer. */
export function toggleLinksForViewport(): void {
  const s = useVaultStore.getState();
  const linksOpen =
    s.settings.rightOpen &&
    (s.rightTab === "backlinks" || s.rightTab === "outline");
  if (linksOpen) {
    s.setRightOpen(false);
    return;
  }
  if (s.settings.leftOpen) s.setLeftOpen(false);
  s.setRightTab("backlinks");
  s.setRightOpen(true);
}
