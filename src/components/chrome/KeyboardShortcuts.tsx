import { useEffect } from "react";
import { useVaultStore } from "@/lib/vault/store";
import { usePrefsStore } from "@/lib/prefs/preferences";

/** Global macOS-style keyboard shortcuts */
export function KeyboardShortcuts() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      const store = useVaultStore.getState();
      const prefs = usePrefsStore.getState();

      // ⌘, settings
      if (mod && (e.key === "," || e.code === "Comma")) {
        e.preventDefault();
        prefs.toggleSettings();
        return;
      }

      // ⌘K search
      if (mod && e.key.toLowerCase() === "k") {
        e.preventDefault();
        store.setCommandOpen(!store.commandOpen);
        return;
      }

      // Escape closes overlays
      if (e.key === "Escape") {
        if (prefs.settingsOpen) {
          prefs.setSettingsOpen(false);
          return;
        }
        if (store.commandOpen) {
          store.setCommandOpen(false);
          return;
        }
        if (store.settings.graphMode === "fullscreen") {
          store.setGraphMode("panel");
          return;
        }
      }

      // ⌘E editor mode
      if (mod && e.key.toLowerCase() === "e") {
        e.preventDefault();
        store.toggleEditorMode();
        return;
      }

      // ⌘\ left sidebar
      if (mod && e.key === "\\") {
        e.preventDefault();
        if (e.altKey) store.toggleRight();
        else store.toggleLeft();
        return;
      }

      // ⌘G graph
      if (mod && e.key.toLowerCase() === "g") {
        e.preventDefault();
        store.toggleGraphFullscreen();
        return;
      }

      // ⌘N new note
      if (mod && e.key.toLowerCase() === "n") {
        e.preventDefault();
        store.createNote(null);
        return;
      }

      // ⌘S flush dirty (auto-save already on)
      if (mod && e.key.toLowerCase() === "s") {
        e.preventDefault();
        store.flushDirty();
        store.setToast("Saved");
        return;
      }
    };

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return null;
}
