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
import { openFindInNote, closeFindInNote } from "@/components/editor/FindInNoteBar";
import { openCommandPalette } from "@/components/search/CommandPalette";
import { requestInsertWikilink } from "@/lib/editor/insert-wikilink";
import { isAppleModPlatform, isDesktopShell } from "@/lib/platform";
import { exitGraphForViewport, toggleGraphForViewport } from "@/lib/layout/viewport";
import {
  matchHotkey,
  type HotkeyId,
} from "@/lib/prefs/hotkeys";

/** True if key matches letter (layout-safe: prefer e.code). */
function isModLetter(e: KeyboardEvent, letter: string): boolean {
  const code = `Key${letter.toUpperCase()}`;
  if (e.code === code) return true;
  return e.key.toLowerCase() === letter.toLowerCase();
}

function isFactoryDesktopChord(e: KeyboardEvent): boolean {
  const mod = isAppleModPlatform() ? e.metaKey : e.metaKey || e.ctrlKey;
  if (!mod || e.altKey) return false;
  return (
    isModLetter(e, "o") ||
    isModLetter(e, "k") ||
    isModLetter(e, "n") ||
    isModLetter(e, "g") ||
    isModLetter(e, "e") ||
    isModLetter(e, "s") ||
    (e.shiftKey && isModLetter(e, "d")) ||
    e.key === "," ||
    e.code === "Comma"
  );
}

function runHotkey(id: HotkeyId): boolean {
  const store = useVaultStore.getState();
  const prefs = usePrefsStore.getState();
  const hasVault = Boolean(store.vaultId);
  const overlayOpen = store.commandOpen || prefs.settingsOpen;

  switch (id) {
    case "settings":
      prefs.toggleSettings();
      return true;
    case "focusMode": {
      const next = toggleFocusMode();
      store.setToast(next ? "Focus mode on" : "Focus mode off");
      return true;
    }
    case "search":
      store.setCommandOpen(!store.commandOpen);
      return true;
    case "find": {
      if (!hasVault || !store.activeNoteId || overlayOpen) return false;
      const sel = window.getSelection()?.toString()?.trim() ?? "";
      openFindInNote(sel);
      return true;
    }
    case "replace": {
      if (!hasVault || !store.activeNoteId || overlayOpen) return false;
      const sel = window.getSelection()?.toString()?.trim() ?? "";
      openFindInNote(sel, { replace: true });
      return true;
    }
    case "back": {
      if (!canGoBack()) return true;
      const isLive = (nid: string) => store.nodes[nid]?.kind === "note";
      const nid = goBackLive(isLive);
      if (nid) withHistoryNav(() => store.setActiveNote(nid));
      return true;
    }
    case "forward": {
      if (!canGoForward()) return true;
      const isLive = (nid: string) => store.nodes[nid]?.kind === "note";
      const nid = goForwardLive(isLive);
      if (nid) withHistoryNav(() => store.setActiveNote(nid));
      return true;
    }
    case "demo":
      if (!isDesktopShell()) store.openDemoVault();
      return true;
    case "openVault":
      if (useVaultStore.getState().connecting) return true;
      void store.openFolderAsVault();
      return true;
    case "toggleEditor":
      if (!hasVault || overlayOpen) return false;
      store.toggleEditorMode();
      return true;
    case "leftSidebar":
      if (!hasVault || overlayOpen || prefs.focusMode) return false;
      store.toggleLeft();
      return true;
    case "rightPanel":
      if (!hasVault || overlayOpen || prefs.focusMode) return false;
      store.toggleRight();
      return true;
    case "graph":
      if (!hasVault || overlayOpen || prefs.focusMode) return false;
      toggleGraphForViewport();
      return true;
    case "newNote":
      if (!hasVault || overlayOpen) return false;
      store.createNote(null);
      return true;
    case "daily":
      if (!hasVault || overlayOpen) return false;
      store.openDailyNote();
      return true;
    case "save":
      if (!hasVault || overlayOpen) return false;
      void store.flushDirty();
      return true;
    case "splitPane":
      if (!hasVault || overlayOpen) return false;
      store.toggleWorkspaceSplit();
      return true;
    case "askNotes":
      if (!hasVault) return false;
      openCommandPalette("ask: ");
      return true;
    case "pinNote":
      if (!hasVault || overlayOpen || !store.activeNoteId) return false;
      store.togglePinnedNote(store.activeNoteId);
      return true;
    case "insertWikilink":
      if (!hasVault || overlayOpen || !store.activeNoteId) return false;
      return requestInsertWikilink();
    default:
      return false;
  }
}

/** Global macOS-style keyboard shortcuts */
export function KeyboardShortcuts() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Hold-repeat floods notes; IME composition should not fire chords
      if (e.repeat || e.isComposing || e.defaultPrevented) return;
      if (document.documentElement.dataset.nexusHotkeyCapture === "1") return;

      const store = useVaultStore.getState();
      const prefs = usePrefsStore.getState();

      // Desktop SSOT: native menu accelerators own factory chords unless remapped.
      const remapped = prefs.hotkeyOverrides ?? {};
      const matched = matchHotkey(e, remapped);
      if (
        isDesktopShell() &&
        isFactoryDesktopChord(e) &&
        (!matched || !remapped[matched])
      ) {
        return;
      }

      if (matched) {
        const ok = runHotkey(matched);
        if (ok) e.preventDefault();
        return;
      }

      // Escape closes overlays / exits focus
      if (e.key === "Escape") {
        if (document.documentElement.dataset.nexusShortcuts === "1") {
          return;
        }
        if (document.querySelector("[data-find-open='1']")) {
          closeFindInNote();
          return;
        }
        if (prefs.settingsOpen) {
          prefs.setSettingsOpen(false);
          return;
        }
        if (store.commandOpen) {
          store.setCommandOpen(false);
          return;
        }
        if (
          typeof store.exitGraphFolder === "function" &&
          store.exitGraphFolder()
        ) {
          return;
        }
        if (store.settings.graphMode === "fullscreen") {
          exitGraphForViewport();
          return;
        }
        if (prefs.focusMode) {
          setFocusMode(false);
          store.setToast("Focus mode off");
          return;
        }
      }

      // Delete active note (not while typing)
      const mod = isAppleModPlatform()
        ? e.metaKey
        : e.metaKey || e.ctrlKey;
      const isDeleteChord =
        e.key === "Delete" ||
        (e.key === "Backspace" &&
          (isAppleModPlatform() ? e.metaKey : mod));
      if (isDeleteChord) {
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
