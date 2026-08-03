/**
 * Persist main window size across sessions (Wave S7).
 * Desktop / Tauri only — no-op in the browser shell.
 */

import { confirmDesktopShell } from "@/lib/platform";

const WINDOW_KEY = "nexus-window-v1";

type SavedWindow = {
  width: number;
  height: number;
};

function loadSaved(): SavedWindow | null {
  try {
    const raw = localStorage.getItem(WINDOW_KEY);
    if (!raw) return null;
    const v = JSON.parse(raw) as SavedWindow;
    if (
      typeof v.width === "number" &&
      typeof v.height === "number" &&
      v.width >= 600 &&
      v.height >= 400
    ) {
      return v;
    }
  } catch {
    /* ignore */
  }
  return null;
}

function saveSize(width: number, height: number): void {
  try {
    localStorage.setItem(
      WINDOW_KEY,
      JSON.stringify({
        width: Math.round(width),
        height: Math.round(height),
      } satisfies SavedWindow),
    );
  } catch {
    /* ignore */
  }
}

/**
 * Restore last size and save on resize / close.
 * Returns an unlisten cleanup.
 */
export async function bindWindowState(): Promise<() => void> {
  const desktop = await confirmDesktopShell();
  if (!desktop) return () => {};

  try {
    const { getCurrentWindow, LogicalSize } = await import(
      "@tauri-apps/api/window"
    );
    const win = getCurrentWindow();

    const saved = loadSaved();
    if (saved) {
      try {
        await win.setSize(new LogicalSize(saved.width, saved.height));
      } catch {
        /* min-size / monitor constraints — ignore */
      }
    }

    let timer: ReturnType<typeof setTimeout> | null = null;
    const scheduleSave = (w: number, h: number) => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => saveSize(w, h), 250);
    };

    const unResize = await win.onResized(async () => {
      try {
        const factor = await win.scaleFactor();
        const physical = await win.innerSize();
        scheduleSave(physical.width / factor, physical.height / factor);
      } catch {
        /* ignore */
      }
    });

    const unClose = await win.onCloseRequested(async () => {
      try {
        const factor = await win.scaleFactor();
        const physical = await win.innerSize();
        saveSize(physical.width / factor, physical.height / factor);
      } catch {
        /* ignore */
      }
    });

    return () => {
      if (timer) clearTimeout(timer);
      unResize();
      unClose();
    };
  } catch (err) {
    console.warn("[nexus] window state bind failed", err);
    return () => {};
  }
}
