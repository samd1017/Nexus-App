import { create } from "zustand";
import { persist } from "zustand/middleware";

export type AccentPreset =
  | "cyan"
  | "violet"
  | "emerald"
  | "amber"
  | "rose"
  | "custom";

export type Density = "comfortable" | "compact";
export type PhysicsIntensity = "calm" | "standard" | "energetic";
export type DefaultEditorMode = "visual" | "source";
export type DefaultGraphView = "panel" | "hidden";

export interface NexusPrefs {
  accentPreset: AccentPreset;
  accentCustom: string;
  density: Density;
  graphParticles: boolean;
  defaultEditorMode: DefaultEditorMode;
  editorFontSize: number;
  spellCheck: boolean;
  defaultGraphView: DefaultGraphView;
  physicsIntensity: PhysicsIntensity;
  confirmDelete: boolean;
  openLastVault: boolean;
}

export const ACCENT_PRESETS: Record<
  Exclude<AccentPreset, "custom">,
  { label: string; hex: string }
> = {
  cyan: { label: "Cyan", hex: "#00C8FF" },
  violet: { label: "Violet", hex: "#7B61FF" },
  emerald: { label: "Emerald", hex: "#30D158" },
  amber: { label: "Amber", hex: "#FF9F0A" },
  rose: { label: "Rose", hex: "#FF453A" },
};

export const DEFAULT_PREFS: NexusPrefs = {
  accentPreset: "cyan",
  accentCustom: "#00C8FF",
  density: "comfortable",
  graphParticles: true,
  defaultEditorMode: "visual",
  editorFontSize: 15,
  spellCheck: false,
  defaultGraphView: "panel",
  physicsIntensity: "standard",
  confirmDelete: true,
  openLastVault: true,
};

export const NEXUS_VERSION = "1.0.0";

export const SHORTCUTS: { keys: string; action: string }[] = [
  { keys: "⌘ K", action: "Search / command palette" },
  { keys: "⌘ ,", action: "Open Settings" },
  { keys: "⌘ E", action: "Toggle Visual / Source" },
  { keys: "⌘ G", action: "Toggle graph fullscreen" },
  { keys: "⌘ N", action: "New note" },
  { keys: "⌘ S", action: "Save (flush)" },
  { keys: "⌘ \\", action: "Toggle left sidebar" },
  { keys: "⌘ ⌥ \\", action: "Toggle right panel" },
  { keys: "Esc", action: "Close overlay / exit graph" },
];

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

export function resolveAccentHex(prefs: Pick<NexusPrefs, "accentPreset" | "accentCustom">): string {
  if (prefs.accentPreset === "custom") {
    const rgb = hexToRgb(prefs.accentCustom);
    return rgb ? normalizeHex(prefs.accentCustom) : ACCENT_PRESETS.cyan.hex;
  }
  return ACCENT_PRESETS[prefs.accentPreset].hex;
}

function normalizeHex(hex: string): string {
  const h = hex.trim();
  if (h.startsWith("#")) return h.toUpperCase();
  return `#${h.toUpperCase()}`;
}

export function isValidHex(hex: string): boolean {
  return Boolean(hexToRgb(hex));
}

/** Apply prefs to CSS variables on :root for live theming */
export function applyPrefsToDom(prefs: NexusPrefs): void {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  const hex = resolveAccentHex(prefs);
  const rgb = hexToRgb(hex) ?? { r: 0, g: 200, b: 255 };

  root.style.setProperty("--accent", hex);
  root.style.setProperty(
    "--accent-dim",
    `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.15)`,
  );
  root.style.setProperty(
    "--accent-glow",
    `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.35)`,
  );
  root.style.setProperty(
    "--shadow-elevated",
    `0 8px 32px rgba(0, 0, 0, 0.45), 0 0 0 1px rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.04)`,
  );
  root.style.setProperty("--editor-font-size", `${prefs.editorFontSize}px`);
  root.style.setProperty(
    "--ui-density",
    prefs.density === "compact" ? "0.85" : "1",
  );
  root.style.setProperty(
    "--tree-item-pad-y",
    prefs.density === "compact" ? "3px" : "5px",
  );
  root.dataset.density = prefs.density;

  // Keep Tailwind theme token in sync where used
  root.style.setProperty("--color-accent", hex.toLowerCase());
}

interface PrefsStore extends NexusPrefs {
  settingsOpen: boolean;
  setSettingsOpen: (open: boolean) => void;
  toggleSettings: () => void;
  updatePrefs: (patch: Partial<NexusPrefs>) => void;
  resetPrefs: () => void;
}

export const usePrefsStore = create<PrefsStore>()(
  persist(
    (set, get) => ({
      ...DEFAULT_PREFS,
      settingsOpen: false,

      setSettingsOpen: (open) => set({ settingsOpen: open }),
      toggleSettings: () => set({ settingsOpen: !get().settingsOpen }),

      updatePrefs: (patch) => {
        set(patch);
        const next = { ...get(), ...patch };
        applyPrefsToDom(next);
      },

      resetPrefs: () => {
        set({ ...DEFAULT_PREFS });
        applyPrefsToDom(DEFAULT_PREFS);
      },
    }),
    {
      name: "nexus-prefs-v1",
      partialize: (s) => ({
        accentPreset: s.accentPreset,
        accentCustom: s.accentCustom,
        density: s.density,
        graphParticles: s.graphParticles,
        defaultEditorMode: s.defaultEditorMode,
        editorFontSize: s.editorFontSize,
        spellCheck: s.spellCheck,
        defaultGraphView: s.defaultGraphView,
        physicsIntensity: s.physicsIntensity,
        confirmDelete: s.confirmDelete,
        openLastVault: s.openLastVault,
      }),
      onRehydrateStorage: () => (state) => {
        if (state) applyPrefsToDom(state);
      },
    },
  ),
);

/** Snapshot helpers for non-React code */
export function getPrefs(): NexusPrefs {
  const s = usePrefsStore.getState();
  return {
    accentPreset: s.accentPreset,
    accentCustom: s.accentCustom,
    density: s.density,
    graphParticles: s.graphParticles,
    defaultEditorMode: s.defaultEditorMode,
    editorFontSize: s.editorFontSize,
    spellCheck: s.spellCheck,
    defaultGraphView: s.defaultGraphView,
    physicsIntensity: s.physicsIntensity,
    confirmDelete: s.confirmDelete,
    openLastVault: s.openLastVault,
  };
}
