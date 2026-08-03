import { useEffect } from "react";
import { useVaultStore } from "@/lib/vault/store";
import { usePrefsStore } from "@/lib/prefs/preferences";
import { setFocusMode, toggleFocusMode } from "@/lib/prefs/focus-mode";
import {
  canGoBack,
  canGoForward,
  goBack,
  goForward,
  withHistoryNav,
} from "@/lib/vault/nav-history";

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

      // ⌘. or ⌘⇧F — focus / zen mode
      if (
        mod &&
        (e.key === "." || e.code === "Period" || (e.shiftKey && e.key.toLowerCase() === "f"))
      ) {
        e.preventDefault();
        const next = toggleFocusMode();
        store.setToast(next ? "Focus mode on" : "Focus mode off");
        return;
      }

      // ⌘K search
      if (mod && e.key.toLowerCase() === "k") {
        e.preventDefault();
        store.setCommandOpen(!store.commandOpen);
        return;
      }

      // Escape closes overlays / exits focus
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
        if (prefs.focusMode) {
          setFocusMode(false);
          store.setToast("Focus mode off");
          return;
        }
      }

      // ⌘[ note history back / ⌘] forward
      if (mod && (e.key === "[" || e.code === "BracketLeft") && !e.shiftKey && !e.altKey) {
        e.preventDefault();
        if (!canGoBack()) return;
        const id = goBack();
        if (id && store.nodes[id]?.kind === "note") {
          withHistoryNav(() => store.setActiveNote(id));
        }
        return;
      }
      if (mod && (e.key === "]" || e.code === "BracketRight") && !e.shiftKey && !e.altKey) {
        e.preventDefault();
        if (!canGoForward()) return;
        const id = goForward();
        if (id && store.nodes[id]?.kind === "note") {
          withHistoryNav(() => store.setActiveNote(id));
        }
        return;
      }

      // ⌘O open vault
      if (mod && e.key.toLowerCase() === "o") {
        e.preventDefault();
        void store.openFolderAsVault();
        return;
      }

      // ⌘E editor mode
      if (mod && e.key.toLowerCase() === "e") {
        e.preventDefault();
        store.toggleEditorMode();
        return;
      }

      // ⌘\ left sidebar / ⌘⌥\ right — ignore while focused (true zen)
      // Note: Visual/Source is ⌘E only (menu + keyboard aligned)
      if (mod && e.key === "\\") {
        e.preventDefault();
        if (prefs.focusMode) return;
        if (e.altKey) store.toggleRight();
        else store.toggleLeft();
        return;
      }

      // ⌘G graph
      if (mod && e.key.toLowerCase() === "g") {
        e.preventDefault();
        if (prefs.focusMode) return;
        store.toggleGraphFullscreen();
        return;
      }

      // ⌘N new note
      if (mod && e.key.toLowerCase() === "n") {
        e.preventDefault();
        store.createNote(null);
        return;
      }

      // ⌘D today's daily note
      if (mod && e.key.toLowerCase() === "d") {
        e.preventDefault();
        store.openDailyNote();
        return;
      }

      // ⌘S flush dirty (auto-save already on)
      if (mod && e.key.toLowerCase() === "s") {
        e.preventDefault();
        void store.flushDirty();
        return;
      }

      // Delete active note (not while typing)
      if (e.key === "Delete" || (e.key === "Backspace" && mod)) {
        const t = e.target as HTMLElement | null;
        const tag = t?.tagName?.toLowerCase();
        const editable =
          tag === "input" ||
          tag === "textarea" ||
          Boolean(t?.isContentEditable) ||
          Boolean(t?.closest?.('[contenteditable="true"]'));
        if (editable) return;
        if (store.pendingDelete || store.commandOpen || prefs.settingsOpen) return;
        const id = store.activeNoteId;
        if (!id) return;
        e.preventDefault();
        store.requestDelete(id);
      }
    };

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return null;
}
