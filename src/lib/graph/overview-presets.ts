/**
 * Named Overview filter presets. localStorage only, scoped by vault key.
 * Pins are not stored here.
 */

export type OverviewPresetColor = "folder" | "tag" | "off";

export type OverviewPreset = {
  id: string;
  name: string;
  folder: string;
  tag: string;
  colorMode: OverviewPresetColor;
  hidden: string[];
};

export const OVERVIEW_PRESET_CAP = 16;
export const OVERVIEW_PRESET_STORAGE_KEY = "nexus-overview-presets-v1";

export type OverviewPresetStorage = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
};

type PresetFile = Record<string, OverviewPreset[]>;

function browserStorage(): OverviewPresetStorage | null {
  try {
    if (typeof localStorage === "undefined") return null;
    return localStorage;
  } catch {
    return null;
  }
}

function normalizeColor(value: unknown): OverviewPresetColor {
  return value === "tag" || value === "off" || value === "folder" ? value : "folder";
}

function hiddenKeys(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  for (const item of value) {
    if (typeof item !== "string") continue;
    const key = item.trim();
    if (!key || out.includes(key)) continue;
    out.push(key);
    if (out.length >= 40) break;
  }
  return out;
}

function isPreset(value: unknown): value is OverviewPreset {
  if (!value || typeof value !== "object") return false;
  const row = value as Partial<OverviewPreset>;
  return typeof row.id === "string" && row.id.length > 0 && typeof row.name === "string" && row.name.trim().length > 0;
}

function readFile(storage: OverviewPresetStorage): PresetFile {
  try {
    const raw = storage.getItem(OVERVIEW_PRESET_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    return parsed as PresetFile;
  } catch {
    return {};
  }
}

function writeFile(storage: OverviewPresetStorage, file: PresetFile) {
  storage.setItem(OVERVIEW_PRESET_STORAGE_KEY, JSON.stringify(file));
}

function listFor(file: PresetFile, vaultKey: string): OverviewPreset[] {
  const rows = file[vaultKey];
  if (!Array.isArray(rows)) return [];
  return rows.filter(isPreset).slice(0, OVERVIEW_PRESET_CAP).map((row) => ({
    id: row.id,
    name: row.name.trim(),
    folder: typeof row.folder === "string" ? row.folder : "",
    tag: typeof row.tag === "string" ? row.tag : "",
    colorMode: normalizeColor(row.colorMode),
    hidden: hiddenKeys(row.hidden),
  }));
}

export function loadOverviewPresets(vaultKey: string, storage?: OverviewPresetStorage): OverviewPreset[] {
  const store = storage ?? browserStorage();
  if (!store || !vaultKey) return [];
  return listFor(readFile(store), vaultKey);
}

export function saveOverviewPreset(
  vaultKey: string,
  draft: { name: string; folder: string; tag: string; colorMode: OverviewPresetColor; hidden: string[] },
  storage?: OverviewPresetStorage,
): OverviewPreset[] | null {
  const name = draft.name.trim();
  const store = storage ?? browserStorage();
  if (!name || !vaultKey || !store) return null;
  const file = readFile(store);
  const current = listFor(file, vaultKey);
  const existing = current.find((row) => row.name === name);
  const preset: OverviewPreset = {
    id: existing?.id ?? `p-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    name,
    folder: draft.folder.trim(),
    tag: draft.tag.trim(),
    colorMode: normalizeColor(draft.colorMode),
    hidden: hiddenKeys(draft.hidden),
  };
  const next = [preset, ...current.filter((row) => row.id !== preset.id)].slice(0, OVERVIEW_PRESET_CAP);
  file[vaultKey] = next;
  writeFile(store, file);
  return next;
}

export function deleteOverviewPreset(
  vaultKey: string,
  id: string,
  storage?: OverviewPresetStorage,
): OverviewPreset[] {
  const store = storage ?? browserStorage();
  if (!store || !vaultKey) return [];
  const file = readFile(store);
  const next = listFor(file, vaultKey).filter((row) => row.id !== id);
  file[vaultKey] = next;
  writeFile(store, file);
  return next;
}
