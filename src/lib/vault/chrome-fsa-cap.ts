/**
 * Chrome File System Access is not a 100k daily driver.
 * Meta maps + FTS fill + editor already push the renderer past 1–2GB;
 * opening notes then discards the tab (seen at 8–12 notes on 15GB boxes).
 *
 * Desktop / Tauri is the large-vault path. Chrome FSA is for ≤20k.
 */

export const CHROME_FSA_NOTE_WARN = 15_000;
export const CHROME_FSA_NOTE_CAP = 25_000;
/** Stop FSA signature poll / getFile walks — they re-walk the vault on every note open. */
export const CHROME_FSA_WATCH_MAX = 4_000;
/** After this many files, meta scan skips getFile() (Chrome retains native File blobs). */
export const CHROME_FSA_GETFILE_MAX = 4_000;

export class ChromeFsaCapError extends Error {
  readonly notes: number;
  constructor(notes: number) {
    super(`chrome-fsa-cap:${notes}`);
    this.name = "ChromeFsaCapError";
    this.notes = notes;
  }
}

export function isChromeFsaCapError(e: unknown): e is ChromeFsaCapError {
  return (
    !!e &&
    typeof e === "object" &&
    ((e as ChromeFsaCapError).name === "ChromeFsaCapError" ||
      e instanceof ChromeFsaCapError)
  );
}

export type ChromeFsaLimit = {
  notes: number;
  cap: number;
  name: string;
  kind: "warn" | "refuse";
};

export function allowForcedLargeFsa(): boolean {
  if (typeof window === "undefined") return false;
  try {
    if (window.localStorage.getItem("nexus-force-large-fsa") === "1") return true;
    return new URLSearchParams(window.location.search).has("forceLargeFsa");
  } catch {
    return false;
  }
}

export function countVaultNotes(
  nodes: Record<string, { kind?: string }>,
): number {
  let n = 0;
  for (const id in nodes) if (nodes[id]?.kind === "note") n += 1;
  return n;
}

export function chromeFsaLimitKind(
  noteCount: number,
): ChromeFsaLimit["kind"] | null {
  if (noteCount >= CHROME_FSA_NOTE_CAP) return "refuse";
  if (noteCount >= CHROME_FSA_NOTE_WARN) return "warn";
  return null;
}

export function chromeFsaRefuseMessage(notes: number, folder = "This folder"): string {
  return `${folder} has ${notes.toLocaleString()} notes. Chrome cannot keep a vault this large in memory (tab discard). Use the Nexus desktop app for 25k+ notes. Chrome is reliable up to about 20,000 notes.`;
}

export function chromeFsaWarnMessage(notes: number): string {
  return `Large folder (${notes.toLocaleString()} notes). Chrome may get slow or discard the tab. Prefer the desktop app above 20k.`;
}
