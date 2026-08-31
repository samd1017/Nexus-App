import { useEffect } from "react";
import { useVaultStore } from "@/lib/vault/store";
import { usePrefsStore } from "@/lib/prefs/preferences";
import { setFocusMode, toggleFocusMode } from "@/lib/prefs/focus-mode";
import {
  canGoBack,
  canGoForward,
  goBackLive,
  goForwardLive,
  withHistoryNav,
} from "@/lib/vault/nav-history";
import { isAppleModPlatform, isDesktopShell } from "@/lib/platform";

/** True if key matches letter (layout-safe: prefer e.code). */
function isModLetter(e: KeyboardEvent, letter: string): boolean {
  const code = `Key${letter.toUpperCase()}`;
  if (e.code === code) return true;
  return e.key.toLowerCase() === letter.toLowerCase();
}

/** Global macOS-style keyboard shortcuts */
export function KeyboardShortcuts() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Hold-repeat floods notes; IME composition should not fire chords
      if (e.repeat || e.isComposing || e.defaultPrevented) return;

      // On Apple, primary mod is ⌘ only (Ctrl+letter is often Emacs-style)
      const mod = isAppleModPlatform()
        ? e.metaKey
        : e.metaKey || e.ctrlKey;
      const store = useVaultStore.getState();
      const prefs = usePrefsStore.getState();
      const hasVault = Boolean(store.vaultId);
      const overlayOpen = store.commandOpen || prefs.settingsOpen;

      // Desktop SSOT: native menu accelerators + menu-bridge own these chords.
      if (
        isDesktopShell() &&
        mod &&
        !e.altKey &&
        (isModLetter(e, "o") ||
          isModLetter(e, "k") ||
          isModLetter(e, "n") ||
          isModLetter(e, "g") ||
          isModLetter(e, "e") ||
          isModLetter(e, "s") ||
          (e.shiftKey && isModLetter(e, "d")) ||
          e.key === "," ||
          e.code === "Comma")
      ) {
        return;
      }

      // ⌘, settings
      if (mod && (e.key === "," || e.code === "Comma")) {
        e.preventDefault();
        prefs.toggleSettings();
        return;
      }

      // ⌘. or ⌘⇧F — focus / zen mode
      if (
        mod &&
        (e.key === "." ||
          e.code === "Period" ||
          (e.shiftKey && isModLetter(e, "f")))
      ) {
        e.preventDefault();
        const next = toggleFocusMode();
        store.setToast(next ? "Focus mode on" : "Focus mode off");
        return;
      }

      // ⌘K search
      if (mod && isModLetter(e, "k")) {
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
        // Folder graph: up one level before exiting fullscreen
        if (
          typeof store.exitGraphFolder === "function" &&
          store.exitGraphFolder()
        ) {
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

      // ⌘[ note history back / ⌘] forward — skip dead ids
      if (
        mod &&
        (e.key === "[" || e.code === "BracketLeft") &&
        !e.shiftKey &&
        !e.altKey
      ) {
        e.preventDefault();
        if (!canGoBack()) return;
        const isLive = (id: string) => store.nodes[id]?.kind === "note";
        const id = goBackLive(isLive);
        if (id) {
          withHistoryNav(() => store.setActiveNote(id));
        }
        return;
      }
      if (
        mod &&
        (e.key === "]" || e.code === "BracketRight") &&
        !e.shiftKey &&
        !e.altKey
      ) {
        e.preventDefault();
        if (!canGoForward()) return;
        const isLive = (id: string) => store.nodes[id]?.kind === "note";
        const id = goForwardLive(isLive);
        if (id) {
          withHistoryNav(() => store.setActiveNote(id));
        }
        return;
      }

      // ⌘⇧D / Ctrl+Shift+D — explore demo vault (also native menu on desktop)
      if (mod && e.shiftKey && isModLetter(e, "d") && !e.altKey) {
        if (!isDesktopShell()) {
          e.preventDefault();
          store.openDemoVault();
        }
        return;
      }

      // ⌘O open vault — ignore while another open is in flight
      if (mod && isModLetter(e, "o") && !e.shiftKey) {
        e.preventDefault();
        if (useVaultStore.getState().connecting) return;
        void store.openFolderAsVault();
        return;
      }

      // Vault-scoped actions below — no-op without vault or while overlays open
      if (!hasVault) return;

      // ⌘E editor mode
      if (mod && isModLetter(e, "e")) {
        if (overlayOpen) return;
        e.preventDefault();
        store.toggleEditorMode();
        return;
      }

      // ⌘\ left sidebar / ⌘⌥\ right — ignore while focused (true zen)
      // Note: Visual/Source is ⌘E only (menu + keyboard aligned)
      if (mod && (e.key === "\\" || e.code === "Backslash")) {
        if (overlayOpen || prefs.focusMode) return;
        e.preventDefault();
        if (e.altKey) store.toggleRight();
        else store.toggleLeft();
        return;
      }

      // ⌘G graph
      if (mod && isModLetter(e, "g")) {
        if (overlayOpen || prefs.focusMode) return;
        e.preventDefault();
        store.toggleGraphFullscreen();
        return;
      }

      // ⌘N new note
      if (mod && isModLetter(e, "n")) {
        if (overlayOpen) return;
        e.preventDefault();
        store.createNote(null);
        return;
      }

      // ⌘D today's daily note
      if (mod && isModLetter(e, "d")) {
        if (overlayOpen) return;
        e.preventDefault();
        store.openDailyNote();
        return;
      }

      // ⌘S flush dirty (auto-save already on)
      if (mod && isModLetter(e, "s")) {
        if (overlayOpen) return;
        e.preventDefault();
        void store.flushDirty();
        return;
      }

      // Delete active note (not while typing)
      // Mac: ⌘⌫ only; other platforms: Delete or Ctrl+Backspace
      const isDeleteChord =
        e.key === "Delete" ||
        (e.key === "Backspace" &&
          (isAppleModPlatform() ? e.metaKey : mod));
      if (isDeleteChord) {
        if (isAppleModPlatform() && e.key === "Delete" && !mod) {
          // Bare forward-delete is rare on Mac laptops — still allow if not editable
        }
        const t = e.target as HTMLElement | null;
        const tag = t?.tagName?.toLowerCase();
        const editable =
          tag === "input" ||
          tag === "textarea" ||
          Boolean(t?.isContentEditable) ||
          Boolean(t?.closest?.('[contenteditable="true"]'));
        if (editable) return;
        if (store.pendingDelete || store.commandOpen || prefs.settingsOpen)
          return;
        const id = store.activeNoteId;
        if (!id) return;
        // On Apple require ⌘ for Backspace; bare Delete still ok
        if (isAppleModPlatform() && e.key === "Backspace" && !e.metaKey)
          return;
        e.preventDefault();
        store.requestDelete(id);
      }
    };

    window.addEventListener("keydown", onKey, { capture: true });
    return () => window.removeEventListener("keydown", onKey, { capture: true });
  }, []);

  return null;
}
