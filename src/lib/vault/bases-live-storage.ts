/**
 * Where the live `.base` file is for the open vault: `Note table.base` (or
 * `Nexus Bases.base` from older builds) at the vault root on a disk vault,
 * browser storage for an in-memory vault.
 * Views saved by older builds in `.nexus/note-table.json` (or browser
 * storage) are read once to migrate and never written.
 */

import { LiveBasesSync, type LiveRead, type LiveStorage } from "@/lib/vault/bases-live-sync";
import { LEGACY_LIVE_BASE_FILE, LIVE_BASE_BACKUP, LIVE_BASE_FILE, baseFileLabel } from "@/lib/vault/bases-live";
import { DEMO_VAULT_ID, demoBaseFile, demoBaseStorageKey } from "@/lib/vault/demo-bases";
import { readNoteFile, writeNoteFile } from "@/lib/vault/fs-adapter";
import { NOTE_TABLE_FILE } from "@/lib/vault/note-table";
import { getDesktopRoot, getFsaRoot, isMissingFileError, useVaultStore } from "@/lib/vault/store";
import { readDesktopNote, writeDesktopNote } from "@/lib/vault/tauri-adapter";

function errorText(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

async function readOrMissing(read: () => Promise<string>): Promise<LiveRead> {
  try {
    return { text: await read() };
  } catch (err) {
    return isMissingFileError(err) ? { missing: true } : { error: errorText(err) };
  }
}

function legacyMemoryKey(vaultId: string): string {
  return `nexus-note-table:${vaultId}`;
}

function readLocal(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function fileName(path: string): string {
  return path.split("/").pop() || path;
}

function diskStorage(
  path: string,
  readFile: (path: string) => Promise<string>,
  writeFile: (path: string, text: string) => Promise<void>,
  vaultId: string | null,
  legacy: boolean,
): LiveStorage {
  const name = path === LIVE_BASE_FILE ? LIVE_BASE_FILE : baseFileLabel(fileName(path));
  return {
    name,
    path,
    where: baseFileLabel(path),
    legacyWhere: NOTE_TABLE_FILE,
    read: () => readOrMissing(() => readFile(path)),
    write: (text) => writeFile(path, text),
    backup: (text) => writeFile(path === LIVE_BASE_FILE ? LIVE_BASE_BACKUP : `.nexus/${fileName(path)}.unreadable.base`, text),
    async readLegacy() {
      if (!legacy) return null;
      const file = await readOrMissing(() => readFile(NOTE_TABLE_FILE));
      if ("text" in file) return file.text;
      return vaultId ? readLocal(legacyMemoryKey(vaultId)) : null;
    },
  };
}

/**
 * The home file on a disk vault. A vault made by an older build keeps its
 * `Nexus Bases.base` when there is no `Note table.base`; a new vault gets
 * `Note table.base`. The choice is made on the first read that finds a file.
 */
function homeDiskStorage(
  readFile: (path: string) => Promise<string>,
  writeFile: (path: string, text: string) => Promise<void>,
  vaultId: string | null,
): LiveStorage {
  const fresh = diskStorage(LIVE_BASE_FILE, readFile, writeFile, vaultId, true);
  const legacy = diskStorage(LEGACY_LIVE_BASE_FILE, readFile, writeFile, vaultId, true);
  let chosen: LiveStorage | null = null;
  const current = () => chosen ?? fresh;
  return {
    get name() {
      return current().name;
    },
    get path() {
      return current().path;
    },
    get where() {
      return current().where;
    },
    legacyWhere: NOTE_TABLE_FILE,
    async read() {
      if (chosen) return chosen.read();
      const read = await fresh.read();
      if (!("missing" in read)) {
        chosen = fresh;
        return read;
      }
      const old = await legacy.read();
      if (!("missing" in old)) chosen = legacy;
      return old;
    },
    write: (text) => {
      chosen ??= fresh;
      return chosen.write(text);
    },
    backup: (text) => fresh.backup(text),
    readLegacy: () => fresh.readLegacy(),
  };
}

function memoryStorage(vaultId: string): LiveStorage {
  const key = `nexus-bases-live:${vaultId}`;
  return {
    name: "the browser-storage .base",
    path: LIVE_BASE_FILE,
    where: "browser storage for this vault",
    legacyWhere: "the older copy in browser storage",
    async read() {
      try {
        const text = localStorage.getItem(key);
        return text === null ? { missing: true } : { text };
      } catch (err) {
        return { error: errorText(err) };
      }
    },
    async write(text) {
      localStorage.setItem(key, text);
    },
    async backup(text) {
      localStorage.setItem(`nexus-bases-unreadable:${vaultId}`, text);
    },
    async readLegacy() {
      return readLocal(legacyMemoryKey(vaultId));
    },
  };
}

/** A vault `.base` other than the home live file. Writes go to this path. */
function memoryFileStorage(vaultId: string, path: string): LiveStorage {
  const key = demoBaseStorageKey(vaultId, path);
  return {
    name: fileName(path),
    path,
    where: path,
    legacyWhere: "the older copy in browser storage",
    async read() {
      try {
        const saved = localStorage.getItem(key);
        if (saved !== null) return { text: saved };
        if (vaultId === DEMO_VAULT_ID) {
          const demo = demoBaseFile(path);
          if (demo) return { text: demo.text };
        }
        return { missing: true };
      } catch (err) {
        return { error: errorText(err) };
      }
    },
    async write(text) {
      localStorage.setItem(key, text);
    },
    async backup(text) {
      localStorage.setItem(`nexus-bases-unreadable:${vaultId}:${path}`, text);
    },
    async readLegacy() {
      return null;
    },
  };
}

/** Storage for one vault `.base`. The home file stays the sync created with the vault. */
export function storageForVaultBase(path: string): LiveStorage | null {
  const clean = path.replace(/\\/g, "/").replace(/^\/+/, "");
  const vaultId = useVaultStore.getState().vaultId;
  const desktop = getDesktopRoot();
  const fsa = desktop ? null : getFsaRoot();
  if (desktop) return diskStorage(clean, (p) => readDesktopNote(desktop, p), (p, t) => writeDesktopNote(desktop, p, t), vaultId, false);
  if (fsa) return diskStorage(clean, (p) => readNoteFile(fsa, p), (p, t) => writeNoteFile(fsa, p, t), vaultId, false);
  if (vaultId) return memoryFileStorage(vaultId, clean);
  return null;
}

const syncs = new Map<string, LiveBasesSync>();

/** One sync per vault, kept across Bases closing and reopening so its queue and last-known file survive. */
export function liveBasesSync(): { sync: LiveBasesSync; onDisk: boolean } | null {
  const vaultId = useVaultStore.getState().vaultId;
  const desktop = getDesktopRoot();
  const fsa = desktop ? null : getFsaRoot();
  const id = desktop ? `desktop:${desktop}` : fsa ? `fsa:${vaultId ?? fsa.name}` : vaultId ? `memory:${vaultId}` : null;
  if (!id) return null;
  let sync = syncs.get(id);
  if (!sync) {
    const storage = desktop
      ? homeDiskStorage((p) => readDesktopNote(desktop, p), (p, t) => writeDesktopNote(desktop, p, t), vaultId)
      : fsa
        ? homeDiskStorage((p) => readNoteFile(fsa, p), (p, t) => writeNoteFile(fsa, p, t), vaultId)
        : memoryStorage(vaultId as string);
    sync = new LiveBasesSync(storage);
    syncs.set(id, sync);
  }
  return { sync, onDisk: !!(desktop || fsa) };
}
