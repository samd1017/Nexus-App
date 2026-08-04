/**
 * Persist main window size/position across sessions.
 * Desktop / Tauri only — no-op in the browser shell.
 * Wave Trust: flush dirty notes before quit.
 */

import { confirmDesktopShell } from "@/lib/platform";

const WINDOW_KEY = "nexus-window-v2";

type SavedWindow = {
  width: number;
  height: number;
  x?: number;
  y?: number;
  maximized?: boolean;
};

function loadSaved(): SavedWindow | null {
  try {
    const raw = localStorage.getItem(WINDOW_KEY);
    if (!raw) {
      // migrate v1
      const v1 = localStorage.getItem("nexus-window-v1");
      if (v1) {
        const v = JSON.parse(v1) as SavedWindow;
        if (typeof v.width === "number" && typeof v.height === "number") return v;
      }
      return null;
    }
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

function saveState(state: SavedWindow): void {
  try {
    localStorage.setItem(
      WINDOW_KEY,
      JSON.stringify({
        width: Math.round(state.width),
        height: Math.round(state.height),
        x: state.x != null ? Math.round(state.x) : undefined,
        y: state.y != null ? Math.round(state.y) : undefined,
        maximized: Boolean(state.maximized),
      } satisfies SavedWindow),
    );
  } catch {
    /* ignore */
  }
}

/**
 * Restore last size/position and save on resize / move / close.
 * Returns an unlisten cleanup.
 */
export async function bindWindowState(): Promise<() => void> {
  const desktop = await confirmDesktopShell();
  if (!desktop) return () => {};

  try {
    const { getCurrentWindow, LogicalSize, LogicalPosition } = await import(
      "@tauri-apps/api/window"
    );
    const win = getCurrentWindow();

    const saved = loadSaved();
    if (saved) {
      try {
        if (saved.maximized) {
          await win.maximize();
        } else {
          await win.setSize(new LogicalSize(saved.width, saved.height));
          if (typeof saved.x === "number" && typeof saved.y === "number") {
            await win.setPosition(new LogicalPosition(saved.x, saved.y));
          }
        }
      } catch {
        /* min-size / monitor constraints — ignore */
      }
    }

    let timer: ReturnType<typeof setTimeout> | null = null;
    const persist = async () => {
      try {
        const factor = await win.scaleFactor();
        const physical = await win.innerSize();
        const pos = await win.outerPosition();
        const maximized = await win.isMaximized();
        saveState({
          width: physical.width / factor,
          height: physical.height / factor,
          x: pos.x / factor,
          y: pos.y / factor,
          maximized,
        });
      } catch {
        /* ignore */
      }
    };
    const scheduleSave = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        void persist();
      }, 250);
    };

    const unResize = await win.onResized(() => scheduleSave());
    const unMove = await win.onMoved(() => scheduleSave());

    const unClose = await win.onCloseRequested(async (event) => {
      event.preventDefault();
      await persist();
      try {
        const { useVaultStore } = await import("@/lib/vault/store");
        await useVaultStore.getState().flushDirty();
      } catch (err) {
        console.warn("[nexus] quit flush failed", err);
      }
      try {
        await win.destroy();
      } catch {
        try {
          await win.close();
        } catch {
          /* ignore */
        }
      }
    });

    return () => {
      if (timer) clearTimeout(timer);
      unResize();
      unMove();
      unClose();
    };
  } catch (err) {
    console.warn("[nexus] window state bind failed", err);
    return () => {};
  }
}
