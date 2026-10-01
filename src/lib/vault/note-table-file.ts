/**
 * Saved table views live in `.nexus/note-table.json` on a disk vault.
 * That file is Nexus JSON, not an Obsidian .base file.
 * In-memory vaults keep the same JSON in localStorage for the vault id.
 */

import { readNoteFile, writeNoteFile } from "@/lib/vault/fs-adapter";
import {
  NOTE_TABLE_FILE,
  parseBasesSession,
  serializeNoteTableFile,
  type BasesSession,
} from "@/lib/vault/note-table";
import { getDesktopRoot, getFsaRoot, useVaultStore } from "@/lib/vault/store";
import { readDesktopNote, writeDesktopNote } from "@/lib/vault/tauri-adapter";

function memoryKey(vaultId: string): string {
  return `nexus-note-table:${vaultId}`;
}

export async function loadNoteTableConfig(vaultId: string | null): Promise<BasesSession | null> {
  const desktop = getDesktopRoot();
  if (desktop) {
    try {
      return parseBasesSession(await readDesktopNote(desktop, NOTE_TABLE_FILE));
    } catch {
      /* missing file */
    }
  }
  const fsa = getFsaRoot();
  if (fsa) {
    try {
      return parseBasesSession(await readNoteFile(fsa, NOTE_TABLE_FILE));
    } catch {
      /* missing file */
    }
  }
  if (!vaultId) return null;
  try {
    const raw = localStorage.getItem(memoryKey(vaultId));
    return raw ? parseBasesSession(raw) : null;
  } catch {
    return null;
  }
}

export async function saveNoteTableConfig(vaultId: string | null, session: BasesSession): Promise<void> {
  const body = serializeNoteTableFile(session);
  const desktop = getDesktopRoot();
  if (desktop) {
    try {
      await writeDesktopNote(desktop, NOTE_TABLE_FILE, body);
    } catch {
      /* disk vault may be read-only in a test */
    }
  } else {
    const fsa = getFsaRoot();
    if (fsa) {
      try {
        await writeNoteFile(fsa, NOTE_TABLE_FILE, body);
      } catch {
        /* ignore */
      }
    }
  }
  if (!vaultId) return;
  try {
    localStorage.setItem(memoryKey(vaultId), body);
  } catch {
    /* ignore */
  }
}

export function noteTableVaultId(): string | null {
  return useVaultStore.getState().vaultId;
}
