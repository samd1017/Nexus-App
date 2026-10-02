import { create } from "zustand";
import { persist } from "zustand/middleware";
import { accentInk, onAccentHex } from "@/lib/appearance/accent-chrome";
import { applyScaleSafeDefaults } from "@/lib/vault/scale-flags";
import {
  listShortcutRows,
  sanitizeHotkeyOverrides,
  type HotkeyOverrides,
} from "@/lib/prefs/hotkeys";

export type AccentPreset =
  | "cyan"
  | "violet"
  | "emerald"
  | "amber"
  | "rose"
  | "custom";

export type Density = "comfortable" | "compact";
export type PhysicsIntensity = "calm" | "standard" | "energetic";
export type DefaultEditorMode = "visual" | "source" | "split";
export type SavedSearch = { id: string; name: string; query: string };
export type DefaultGraphView = "panel" | "hidden";
/** Local 2D neighborhood is the note-context default. 3D is opt-in Explore. */
export type GraphSurface = "local" | "explore" | "overview";

export function graphSurfaceOf(value: unknown): GraphSurface {
  return value === "explore" || value === "overview" ? value : "local";
}
/** Which note to open when a vault mounts */
export type LaunchNoteMode = "today" | "last" | "smart";
export type ThemeMode = "dark" | "light" | "system" | "midnight" | "paper";
export type ThemeVariant = "midnight" | "paper";

export type ThemeChoice = {
  id: ThemeMode;
  label: string;
  hint: string;
  /** Page, panel, text, and border colors for the picker swatch. */
  swatch: [string, string, string, string];
};

/** Built-in themes. Midnight and Paper repaint chrome; the 3D graph keeps its own look. */
export const THEME_CHOICES: ThemeChoice[] = [
  { id: "dark", label: "Dark", hint: "Nexus graphite", swatch: ["#050507", "#16161a", "#f2f2f7", "#2a2a30"] },
  { id: "light", label: "Light", hint: "Clean paper white", swatch: ["#eef0f4", "#ffffff", "#12141a", "#d5d8e0"] },
  { id: "midnight", label: "Midnight", hint: "Navy ink, low glare", swatch: ["#070a14", "#111829", "#e8ecfa", "#26304a"] },
  { id: "paper", label: "Paper", hint: "Warm sepia for long reads", swatch: ["#ece4d4", "#fbf7ef", "#2a2219", "#d8ccb5"] },
  { id: "system", label: "System", hint: "Follows your OS", swatch: ["#050507", "#eef0f4", "#12141a", "#9898a6"] },
];

const THEME_META_COLOR: Record<"dark" | "light" | ThemeVariant, string> = {
  dark: "#050507",
  light: "#eef0f4",
  midnight: "#070a14",
  paper: "#ece4d4",
};

export function themeModeOf(value: unknown): ThemeMode {
  return value === "light" || value === "system" || value === "midnight" || value === "paper" ? value : "dark";
}

export function themeVariantOf(theme: ThemeMode | undefined): ThemeVariant | null {
  return theme === "midnight" || theme === "paper" ? theme : null;
}

export function themeLabel(theme: ThemeMode | undefined): string {
  return THEME_CHOICES.find((choice) => choice.id === themeModeOf(theme))?.label ?? "Dark";
}

export interface NexusPrefs {
  accentPreset: AccentPreset;
  accentCustom: string;
  density: Density;
  graphParticles: boolean;
  defaultEditorMode: DefaultEditorMode;
  editorFontSize: number;
  spellCheck: boolean;
  defaultGraphView: DefaultGraphView;
  /** Flat neighborhood around the open note, or the 3D graph. */
  graphSurface: GraphSurface;
  physicsIntensity: PhysicsIntensity;
  confirmDelete: boolean;
  openLastVault: boolean;
  /** Open today's daily note when a vault opens (legacy; prefer launchNoteMode) */
  openTodayOnLaunch: boolean;
  /**
   * Launch note preference:
   * - today: always open today's daily page
   * - last: keep restored last note
   * - smart: open today when no active note or last was a prior daily
   */
  launchNoteMode: LaunchNoteMode;
  /** Top-level vault folder for daily notes (single segment, e.g. Journal). */
  dailyFolder: string;
  /** Distraction-free: hide side panels */
  focusMode: boolean;
  /** Reduce UI motion (animations / transitions) */
  reducedMotion: boolean;
  /** Left sidebar: Recent section expanded */
  sidebarRecentOpen: boolean;
  /** Left sidebar: Tags section expanded */
  sidebarTagsOpen: boolean;
  /** Color theme. System follows OS. */
  theme: ThemeMode;
  /** Remapped chords (factory defaults when omitted). */
  hotkeyOverrides: HotkeyOverrides;
  /** Command-palette saved searches (path:/#tag/-exclude). */
  savedSearches: SavedSearch[];
  /**
   * @deprecated Single-path scale is always on for disk vaults.
   * Kept so older localStorage prefs rehydrate without error.
   */
  largeVaultMode?: boolean;
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

function osPrefersReducedMotion(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return false;
  }
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
}

export const DEFAULT_PREFS: NexusPrefs = {
  accentPreset: "cyan",
  accentCustom: "#00C8FF",
  density: "comfortable",
  graphParticles: true,
  defaultEditorMode: "visual",
  editorFontSize: 15,
  spellCheck: false,
  defaultGraphView: "panel",
  graphSurface: "local",
  physicsIntensity: "standard",
  confirmDelete: true,
  openLastVault: true,
  openTodayOnLaunch: true,
  launchNoteMode: "today",
  dailyFolder: "Journal",
  focusMode: false,
  // Seeded from OS on first load when not yet persisted
  reducedMotion: false,
  sidebarRecentOpen: false,
  sidebarTagsOpen: false,
  theme: "dark",
  hotkeyOverrides: {},
  savedSearches: [],
};

export const NEXUS_VERSION = "0.1.1-alpha";

/** Platform-aware keyboard shortcut list for Settings (⌘ vs Ctrl). */
export function getShortcuts(): { keys: string; action: string }[] {
  const overrides =
    typeof usePrefsStore === "undefined"
      ? undefined
      : usePrefsStore.getState().hotkeyOverrides;
  return listShortcutRows(overrides).map(({ keys, action }) => ({
    keys,
    action,
  }));
}

function readSystemTheme(): "dark" | "light" {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return "dark";
  }
  try {
    return window.matchMedia("(prefers-color-scheme: light)").matches
      ? "light"
      : "dark";
  } catch {
    return "dark";
  }
}

// System is read once, then only moved by a settled change. Every prefs write
// repaints the theme, and a desktop that briefly reports the other scheme would
// otherwise flash the whole window mid-session.
let settledSystemTheme: "dark" | "light" | null = null;

export function settleSystemTheme(): "dark" | "light" {
  settledSystemTheme = readSystemTheme();
  return settledSystemTheme;
}

export function resolveTheme(theme: ThemeMode | undefined): "dark" | "light" {
  if (theme === "light" || theme === "paper") return "light";
  if (theme === "dark" || theme === "midnight") return "dark";
  if (settledSystemTheme === null) settledSystemTheme = readSystemTheme();
  return settledSystemTheme;
}

/** @deprecated Prefer getShortcuts() so labels match current platform. */
export const SHORTCUTS: { keys: string; action: string }[] = listShortcutRows().map(
  ({ keys, action }) => ({ keys, action }),
);

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
  root.dataset.reducedMotion = prefs.reducedMotion ? "true" : "false";
  root.dataset.focusMode = prefs.focusMode ? "true" : "false";

  const resolvedTheme = resolveTheme(prefs.theme);
  const variant = themeVariantOf(prefs.theme);
  root.dataset.theme = resolvedTheme;
  if (variant) root.dataset.themeVariant = variant;
  else delete root.dataset.themeVariant;
  root.style.colorScheme = resolvedTheme;
  // Obsidian snippets scope colors to body.theme-dark / body.theme-light.
  document.body?.classList.toggle("theme-dark", resolvedTheme === "dark");
  document.body?.classList.toggle("theme-light", resolvedTheme === "light");
  if (resolvedTheme === "light") {
    root.style.setProperty(
      "--accent-dim",
      `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.12)`,
    );
    root.style.setProperty(
      "--shadow-elevated",
      `0 10px 36px rgba(16, 18, 28, 0.08), 0 0 0 1px rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.08)`,
    );
  }
  try {
    const meta = document.querySelector('meta[name="theme-color"]');
    meta?.setAttribute("content", THEME_META_COLOR[variant ?? resolvedTheme]);
  } catch {
    /* ignore */
  }

  // Selection bars, focus rings, and active icons. Light/paper darken the
  // accent until it clears pale surfaces; dark islands keep the bright ink.
  const ink = accentInk(hex, resolvedTheme);
  const inkOnDark = accentInk(hex, "dark");
  root.style.setProperty("--accent-ink", ink);
  root.style.setProperty("--accent-ink-on-dark", inkOnDark);
  root.style.setProperty("--focus-ring", ink);
  root.style.setProperty("--focus-ring-on-dark", inkOnDark);
  root.style.setProperty("--on-accent", onAccentHex(hex));

  // Keep Tailwind theme token in sync where used
  root.style.setProperty("--color-accent", hex.toLowerCase());
}

/** @deprecated Alias — scale is always single-path for disk vaults. */
export function applyLargeVaultScaleFlags(_on?: boolean): void {
  applyScaleSafeDefaults();
}

interface PrefsStore extends NexusPrefs {
  settingsOpen: boolean;
  setSettingsOpen: (open: boolean) => void;
  toggleSettings: () => void;
  updatePrefs: (patch: Partial<NexusPrefs>) => void;
  resetPrefs: () => void;
}

function snapshotPrefs(s: NexusPrefs): NexusPrefs {
  return {
    accentPreset: s.accentPreset,
    accentCustom: s.accentCustom,
    density: s.density,
    graphParticles: s.graphParticles,
    defaultEditorMode: s.defaultEditorMode,
    editorFontSize: s.editorFontSize,
    spellCheck: s.spellCheck,
    defaultGraphView: s.defaultGraphView,
    graphSurface: graphSurfaceOf(s.graphSurface),
    physicsIntensity: s.physicsIntensity,
    confirmDelete: s.confirmDelete,
    openLastVault: s.openLastVault,
    openTodayOnLaunch: s.openTodayOnLaunch,
    launchNoteMode: s.launchNoteMode,
    dailyFolder: s.dailyFolder,
    focusMode: s.focusMode,
    reducedMotion: s.reducedMotion,
    sidebarRecentOpen: s.sidebarRecentOpen,
    sidebarTagsOpen: s.sidebarTagsOpen,
    theme: themeModeOf(s.theme),
    hotkeyOverrides: sanitizeHotkeyOverrides(s.hotkeyOverrides),
    savedSearches: Array.isArray(s.savedSearches)
      ? s.savedSearches
          .filter((x) => x && typeof x.query === "string" && x.query.trim())
          .map((x) => ({
            id: typeof x.id === "string" && x.id ? x.id : `s_${Math.random().toString(36).slice(2, 8)}`,
            name: typeof x.name === "string" && x.name.trim() ? x.name.trim() : x.query,
            query: x.query.trim(),
          }))
          .slice(0, 24)
      : [],
  };
}

function normalizeLaunchNoteMode(
  raw: unknown,
  openTodayOnLaunch: boolean,
): LaunchNoteMode {
  if (raw === "today" || raw === "last" || raw === "smart") return raw;
  // Migrate legacy boolean when launchNoteMode was never set
  return openTodayOnLaunch ? "today" : "last";
}

if (typeof window !== "undefined") {
  applyScaleSafeDefaults();
}

export const usePrefsStore = create<PrefsStore>()(
  persist(
    (set, get) => ({
      ...DEFAULT_PREFS,
      settingsOpen: false,

      setSettingsOpen: (open) => set({ settingsOpen: open }),
      toggleSettings: () => set({ settingsOpen: !get().settingsOpen }),

      updatePrefs: (patch) => {
        const nextPatch: Partial<NexusPrefs> = { ...patch };
        // Legacy field ignored — single path is automatic
        delete nextPatch.largeVaultMode;
        if (patch.launchNoteMode != null && patch.openTodayOnLaunch == null) {
          nextPatch.openTodayOnLaunch =
            patch.launchNoteMode === "today" || patch.launchNoteMode === "smart";
        }
        if (patch.openTodayOnLaunch != null && patch.launchNoteMode == null) {
          nextPatch.launchNoteMode = patch.openTodayOnLaunch ? "today" : "last";
        }
        if (patch.hotkeyOverrides != null) {
          nextPatch.hotkeyOverrides = sanitizeHotkeyOverrides(
            patch.hotkeyOverrides,
          );
        }
        if (patch.theme != null) nextPatch.theme = themeModeOf(patch.theme);
        if (patch.dailyFolder != null) {
          const cleaned = String(patch.dailyFolder)
            .trim()
            .replace(/\\/g, "/")
            .replace(/^\/+|\/+$/g, "")
            .split("/")[0]
            ?.replace(/[<>:"|?*]/g, "")
            .trim();
          nextPatch.dailyFolder =
            cleaned && cleaned !== "." && cleaned !== ".."
              ? cleaned.slice(0, 64)
              : DEFAULT_PREFS.dailyFolder;
        }
        if (patch.theme === "system") settleSystemTheme();
        set(nextPatch);
        const next = { ...get(), ...nextPatch };
        applyPrefsToDom(next);
        applyScaleSafeDefaults();
      },

      resetPrefs: () => {
        applyScaleSafeDefaults();
        set({ ...DEFAULT_PREFS });
        applyPrefsToDom(DEFAULT_PREFS);
      },
    }),
    {
      name: "nexus-prefs-v1",
      partialize: (s) => snapshotPrefs(s),
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<NexusPrefs> & Record<string, unknown>;
        // Seed reducedMotion from OS on first load if never persisted
        const hasReduced =
          persisted != null &&
          typeof persisted === "object" &&
          "reducedMotion" in (persisted as object);
        const reducedMotion = hasReduced
          ? Boolean((p as NexusPrefs).reducedMotion)
          : osPrefersReducedMotion();
        const openTodayOnLaunch =
          p.openTodayOnLaunch != null
            ? Boolean(p.openTodayOnLaunch)
            : DEFAULT_PREFS.openTodayOnLaunch;
        const launchNoteMode = normalizeLaunchNoteMode(
          p.launchNoteMode,
          openTodayOnLaunch,
        );
        const dailyFolder =
          typeof p.dailyFolder === "string" && p.dailyFolder.trim()
            ? p.dailyFolder.trim().replace(/\\/g, "/").split("/")[0] ||
              DEFAULT_PREFS.dailyFolder
            : DEFAULT_PREFS.dailyFolder;
        return {
          ...current,
          ...p,
          reducedMotion,
          openTodayOnLaunch,
          launchNoteMode,
          dailyFolder,
          sidebarRecentOpen:
            p.sidebarRecentOpen != null
              ? Boolean(p.sidebarRecentOpen)
              : DEFAULT_PREFS.sidebarRecentOpen,
          sidebarTagsOpen:
            p.sidebarTagsOpen != null
              ? Boolean(p.sidebarTagsOpen)
              : DEFAULT_PREFS.sidebarTagsOpen,
          theme: p.theme != null ? themeModeOf(p.theme) : DEFAULT_PREFS.theme,
          graphSurface: graphSurfaceOf(p.graphSurface),
          hotkeyOverrides: sanitizeHotkeyOverrides(p.hotkeyOverrides),
          savedSearches: Array.isArray(p.savedSearches)
            ? (p.savedSearches as SavedSearch[])
            : DEFAULT_PREFS.savedSearches,
        };
      },
      onRehydrateStorage: () => (state) => {
        if (state) {
          applyPrefsToDom(state);
          applyScaleSafeDefaults();
        }
      },
    },
  ),
);

/** Snapshot helpers for non-React code */
export function getPrefs(): NexusPrefs {
  return snapshotPrefs(usePrefsStore.getState());
}
