/**
 * Listen for native Tauri menu events and map them to store actions.
 */

import { confirmDesktopShell } from "@/lib/platform";

type MenuHandlers = {
  openVault: () => void;
  closeVault: () => void;
  settings: () => void;
  search: () => void;
  newNote: () => void;
  save: () => void;
  toggleGraph: () => void;
  toggleSource: () => void;
};

export async function bindDesktopMenu(
  handlers: MenuHandlers,
): Promise<() => void> {
  const desktop = await confirmDesktopShell();
  if (!desktop) return () => {};
  try {
    const { listen } = await import("@tauri-apps/api/event");
    const un = await listen<string>("nexus-menu", (ev) => {
      const id = String(ev.payload ?? "");
      switch (id) {
        case "open_vault":
          handlers.openVault();
          break;
        case "close_vault":
          handlers.closeVault();
          break;
        case "settings":
          handlers.settings();
          break;
        case "search":
          handlers.search();
          break;
        case "new_note":
          handlers.newNote();
          break;
        case "save":
          handlers.save();
          break;
        case "toggle_graph":
          handlers.toggleGraph();
          break;
        case "toggle_source":
          handlers.toggleSource();
          break;
        default:
          break;
      }
    });
    return () => {
      void un();
    };
  } catch (err) {
    console.warn("[nexus] menu bridge failed", err);
    return () => {};
  }
}
