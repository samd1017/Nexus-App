/**
 * Focus / zen mode — hide side panels and restore prior panel state on exit.
 */
import { usePrefsStore } from "@/lib/prefs/preferences";
import { useVaultStore } from "@/lib/vault/store";

let panelSnapshot: { leftOpen: boolean; rightOpen: boolean } | null = null;

/** Enter or exit focus mode, snapshotting left/right panel openness. */
export function setFocusMode(on: boolean): void {
  const prefs = usePrefsStore.getState();
  if (on === prefs.focusMode) return;

  if (on) {
    const settings = useVaultStore.getState().settings;
    panelSnapshot = {
      leftOpen: settings.leftOpen,
      rightOpen: settings.rightOpen,
    };
    prefs.updatePrefs({ focusMode: true });
    useVaultStore.getState().setLeftOpen(false);
    useVaultStore.getState().setRightOpen(false);
  } else {
    prefs.updatePrefs({ focusMode: false });
    if (panelSnapshot) {
      useVaultStore.getState().setLeftOpen(panelSnapshot.leftOpen);
      useVaultStore.getState().setRightOpen(panelSnapshot.rightOpen);
      panelSnapshot = null;
    }
  }
}

export function toggleFocusMode(): boolean {
  const next = !usePrefsStore.getState().focusMode;
  setFocusMode(next);
  return next;
}
