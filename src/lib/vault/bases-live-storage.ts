/**
 * Where the live `.base` file is for the open vault: `Nexus Bases.base` at
 * the vault root on a disk vault, browser storage for an in-memory vault.
 * Views saved by older builds in `.nexus/note-table.json` (or browser
 * storage) are read once to migrate and never written.
 */

import { LiveBasesSync, type LiveRead, type LiveStorage } from "@/lib/vault/bases-live-sync";
import { LIVE_BASE_BACKUP, LIVE_BASE_FILE } from "@/lib/vault/bases-live";
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

function diskStorage(
  label: string,
  readFile: (path: string) => Promise<string>,
  writeFile: (path: string, text: string) => Promise<void>,
  vaultId: string | null,
): LiveStorage {
  return {
    name: LIVE_BASE_FILE,
    where: label,
    legacyWhere: NOTE_TABLE_FILE,
    read: () => readOrMissing(() => readFile(LIVE_BASE_FILE)),
    write: (text) => writeFile(LIVE_BASE_FILE, text),
    backup: (text) => writeFile(LIVE_BASE_BACKUP, text),
    async readLegacy() {
      const file = await readOrMissing(() => readFile(NOTE_TABLE_FILE));
      if ("text" in file) return file.text;
      return vaultId ? readLocal(legacyMemoryKey(vaultId)) : null;
    },
  };
}

function memoryStorage(vaultId: string): LiveStorage {
  const key = `nexus-bases-live:${vaultId}`;
  return {
    name: "the browser-storage .base",
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
      ? diskStorage(LIVE_BASE_FILE, (p) => readDesktopNote(desktop, p), (p, t) => writeDesktopNote(desktop, p, t), vaultId)
      : fsa
        ? diskStorage(LIVE_BASE_FILE, (p) => readNoteFile(fsa, p), (p, t) => writeNoteFile(fsa, p, t), vaultId)
        : memoryStorage(vaultId as string);
    sync = new LiveBasesSync(storage);
    syncs.set(id, sync);
  }
  return { sync, onDisk: !!(desktop || fsa) };
}
