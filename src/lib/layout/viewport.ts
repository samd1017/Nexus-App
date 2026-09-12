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
 * Phone: graph is fullscreen (the side panel is too cramped).
 * Desktop/tablet: panel first, second press expands.
 */
export function toggleGraphForViewport(): void {
  const s = useVaultStore.getState();
  const cur = s.settings.graphMode;
  if (isPhoneViewport()) {
    // Hidden — not panel — so we don't pop the cramped right drawer
    if (cur === "fullscreen") {
      s.setGraphMode("hidden");
    } else {
      if (s.settings.leftOpen) s.setLeftOpen(false);
      if (s.settings.rightOpen) s.setRightOpen(false);
      s.setGraphMode("fullscreen");
    }
    return;
  }
  const onGraphPanel =
    cur === "panel" && s.settings.rightOpen && s.rightTab === "graph";
  if (cur === "fullscreen") s.setGraphMode("panel");
  else if (onGraphPanel) s.setGraphMode("fullscreen");
  else s.setGraphMode("panel");
}

export function exitGraphForViewport(): void {
  const s = useVaultStore.getState();
  s.setGraphMode(isPhoneViewport() ? "hidden" : "panel");
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
