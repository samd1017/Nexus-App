/**
 * Remappable app chords. Desktop native menus keep factory accelerators;
 * remaps apply inside the webview.
 */

import { formatShortcut, isAppleModPlatform } from "@/lib/platform";

export type HotkeyId =
  | "search"
  | "quickSwitcher"
  | "commandPalette"
  | "searchVault"
  | "openVault"
  | "settings"
  | "focusMode"
  | "toggleEditor"
  | "graph"
  | "newNote"
  | "daily"
  | "find"
  | "replace"
  | "save"
  | "leftSidebar"
  | "rightPanel"
  | "back"
  | "forward"
  | "demo"
  | "splitPane"
  | "askNotes"
  | "pinNote"
  | "insertWikilink";

export type HotkeyChord = {
  key: string;
  shift?: boolean;
  alt?: boolean;
};

export type HotkeyOverrides = Partial<Record<HotkeyId, HotkeyChord>>;

export const HOTKEY_IDS: HotkeyId[] = [
  "search",
  "quickSwitcher",
  "commandPalette",
  "searchVault",
  "openVault",
  "settings",
  "focusMode",
  "toggleEditor",
  "graph",
  "newNote",
  "daily",
  "find",
  "replace",
  "save",
  "leftSidebar",
  "rightPanel",
  "back",
  "forward",
  "demo",
  "splitPane",
  "askNotes",
  "pinNote",
  "insertWikilink",
];

// Obsidian's everyday chords where they exist: Ctrl/Cmd+O finds a note,
// Ctrl/Cmd+P runs a command, Ctrl/Cmd+Shift+F searches the vault.
export const DEFAULT_HOTKEYS: Record<HotkeyId, HotkeyChord> = {
  search: { key: "k" },
  quickSwitcher: { key: "o" },
  commandPalette: { key: "p" },
  searchVault: { key: "f", shift: true },
  openVault: { key: "o", shift: true },
  settings: { key: "," },
  focusMode: { key: "." },
  toggleEditor: { key: "e" },
  graph: { key: "g" },
  newNote: { key: "n" },
  daily: { key: "d" },
  find: { key: "f" },
  replace: { key: "h" },
  save: { key: "s" },
  leftSidebar: { key: "\\" },
  rightPanel: { key: "\\", alt: true },
  back: { key: "[" },
  forward: { key: "]" },
  demo: { key: "d", shift: true },
  splitPane: { key: "2" },
  askNotes: { key: "/", shift: true },
  pinNote: { key: "p", shift: true },
  insertWikilink: { key: "l", shift: true },
};

/** Second default chords, as in Obsidian. A remap of the action replaces them. */
export const HOTKEY_ALIASES: Partial<Record<HotkeyId, HotkeyChord[]>> = {
  back: [{ key: "arrowleft", alt: true }],
  forward: [{ key: "arrowright", alt: true }],
};

export const HOTKEY_LABELS: Record<HotkeyId, string> = {
  search: "Search notes",
  quickSwitcher: "Quick switcher (go to note)",
  commandPalette: "Command palette",
  searchVault: "Search in all notes",
  openVault: "Open vault folder",
  settings: "Open Settings",
  focusMode: "Focus / zen mode",
  toggleEditor: "Toggle Visual / Source / Preview",
  graph: "Fullscreen graph (Esc / Exit to leave)",
  newNote: "New note",
  daily: "Today's daily note",
  find: "Find in note",
  replace: "Find and replace in note",
  save: "Save (flush)",
  leftSidebar: "Toggle left sidebar",
  rightPanel: "Toggle right panel",
  back: "Note history back",
  forward: "Note history forward",
  demo: "Explore demo vault",
  splitPane: "Dual-note workspace",
  askNotes: "Ask your notes",
  pinNote: "Pin / unpin current note",
  insertWikilink: "Insert wikilink ([[)",
};

const ID_SET = new Set<string>(HOTKEY_IDS);

export function isHotkeyId(v: string): v is HotkeyId {
  return ID_SET.has(v);
}

export function resolveChord(
  id: HotkeyId,
  overrides?: HotkeyOverrides | null,
): HotkeyChord {
  return overrides?.[id] ?? DEFAULT_HOTKEYS[id];
}

export function chordsEqual(a: HotkeyChord, b: HotkeyChord): boolean {
  return (
    normalizeKey(a.key) === normalizeKey(b.key) &&
    Boolean(a.shift) === Boolean(b.shift) &&
    Boolean(a.alt) === Boolean(b.alt)
  );
}

export function formatChord(chord: HotkeyChord): string {
  const key = displayKey(chord.key);
  return formatShortcut(key, { shift: Boolean(chord.shift), alt: Boolean(chord.alt) });
}

export function listShortcutRows(
  overrides?: HotkeyOverrides | null,
): { id: HotkeyId; keys: string; action: string; remapped: boolean }[] {
  return HOTKEY_IDS.map((id) => ({
    id,
    keys: formatChord(resolveChord(id, overrides)),
    action: HOTKEY_LABELS[id],
    remapped: Boolean(overrides?.[id]),
  }));
}

export function sanitizeHotkeyOverrides(raw: unknown): HotkeyOverrides {
  if (!raw || typeof raw !== "object") return {};
  const out: HotkeyOverrides = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (!isHotkeyId(k) || !v || typeof v !== "object") continue;
    const rec = v as { key?: unknown; shift?: unknown; alt?: unknown };
    if (typeof rec.key !== "string" || !rec.key.trim()) continue;
    out[k] = {
      key: normalizeKey(rec.key),
      ...(rec.shift ? { shift: true } : {}),
      ...(rec.alt ? { alt: true } : {}),
    };
  }
  return out;
}

export function eventToChord(e: KeyboardEvent): HotkeyChord | null {
  if (e.key === "Escape" || e.key === "Tab" || e.key === "Shift") return null;
  const apple = isAppleModPlatform();
  const mod = apple ? e.metaKey : e.metaKey || e.ctrlKey;
  if (!mod) return null;
  const key = keyFromEvent(e);
  if (!key) return null;
  return {
    key,
    ...(e.shiftKey ? { shift: true } : {}),
    ...(e.altKey ? { alt: true } : {}),
  };
}

export function chordMatches(e: KeyboardEvent, chord: HotkeyChord): boolean {
  const apple = isAppleModPlatform();
  const mod = apple ? e.metaKey : e.metaKey || e.ctrlKey;
  if (!mod) return false;
  if (Boolean(chord.shift) !== e.shiftKey) return false;
  if (Boolean(chord.alt) !== e.altKey) return false;
  return keyMatches(e, chord.key);
}

export function matchHotkey(
  e: KeyboardEvent,
  overrides?: HotkeyOverrides | null,
): HotkeyId | null {
  for (const id of HOTKEY_IDS) {
    if (chordMatches(e, resolveChord(id, overrides))) return id;
  }
  for (const id of HOTKEY_IDS) {
    if (overrides?.[id]) continue;
    for (const chord of HOTKEY_ALIASES[id] ?? []) {
      if (chordMatches(e, chord)) return id;
    }
  }
  return null;
}

export function conflictingHotkeyId(
  id: HotkeyId,
  chord: HotkeyChord,
  overrides?: HotkeyOverrides | null,
): HotkeyId | null {
  for (const other of HOTKEY_IDS) {
    if (other === id) continue;
    if (chordsEqual(resolveChord(other, overrides), chord)) return other;
  }
  return null;
}

function normalizeKey(key: string): string {
  const k = key.trim();
  if (k.length === 1) return k.toLowerCase();
  if (k === "Comma" || k === ",") return ",";
  if (k === "Period" || k === ".") return ".";
  if (k === "Backslash" || k === "\\") return "\\";
  if (k === "BracketLeft" || k === "[") return "[";
  if (k === "BracketRight" || k === "]") return "]";
  if (k === "Backspace" || k === "⌫") return "backspace";
  return k.toLowerCase();
}

function displayKey(key: string): string {
  const k = normalizeKey(key);
  if (k === "backspace") return "⌫";
  if (k === "arrowleft") return "←";
  if (k === "arrowright") return "→";
  if (k.length === 1) return k.toUpperCase();
  return k;
}

function keyFromEvent(e: KeyboardEvent): string | null {
  if (e.code.startsWith("Key") && e.code.length === 4) {
    return e.code.slice(3).toLowerCase();
  }
  if (e.code === "Comma" || e.key === ",") return ",";
  if (e.code === "Period" || e.key === ".") return ".";
  if (e.code === "Backslash" || e.key === "\\") return "\\";
  if (e.code === "BracketLeft" || e.key === "[") return "[";
  if (e.code === "BracketRight" || e.key === "]") return "]";
  if (e.key === "Backspace") return "backspace";
  if (e.key.startsWith("Arrow")) return e.key.toLowerCase();
  if (e.key.length === 1) return e.key.toLowerCase();
  return null;
}

function keyMatches(e: KeyboardEvent, key: string): boolean {
  const want = normalizeKey(key);
  const got = keyFromEvent(e);
  return got === want;
}
