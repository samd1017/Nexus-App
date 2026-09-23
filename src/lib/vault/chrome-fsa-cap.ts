/**
 * Chrome File System Access is not a 100k daily driver.
 * Meta maps + FTS fill + editor already push the renderer past 1–2GB;
 * opening notes then discards the tab (seen at 8–12 notes on 15GB boxes).
 *
 * Desktop / Tauri is the large-vault path. Chrome FSA is for ≤20k.
 * Above 400 notes the tab keeps a window and a disposable local catalog.
 * The cap still refuses the folder. It does not become a 500k browser.
 * Copy is written for someone leaving Obsidian — no soft-pedal.
 */

export const CHROME_FSA_NOTE_WARN = 15_000;
export const CHROME_FSA_NOTE_CAP = 25_000;
/** Product bar: Chrome in the browser is supported up to this many notes. */
export const CHROME_FSA_SUPPORTED_MAX = 20_000;
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

/**
 * Production builds ignore `?forceLargeFsa` and localStorage.
 * DEV-only crash-reproduction escape hatch — not a supported product path.
 */
export const FORCED_LARGE_FSA_CONFIRM =
  "STOP. Chrome has already discarded this tab after 8–12 notes on a 15GB machine. Opening a 25,000+ folder here is a crash reproduction, not a vault. Chrome is not the 100k path. Nexus Desktop is (same markdown folder, SQLite FTS5). Continue only if you are a developer forcing an OOM on purpose.";

export function isForcedLargeFsaBuildAllowed(): boolean {
  try {
    return Boolean(import.meta.env?.DEV);
  } catch {
    return false;
  }
}

export function forceLargeFsaRequested(): boolean {
  if (!isForcedLargeFsaBuildAllowed()) return false;
  if (typeof window === "undefined") return false;
  try {
    if (window.localStorage.getItem("nexus-force-large-fsa") === "1") return true;
    return new URLSearchParams(window.location.search).has("forceLargeFsa");
  } catch {
    return false;
  }
}

let forcedLargeFsaAsked = false;
let forcedLargeFsaOk = false;

/** Test hook — do not call from product UI. */
export function resetForcedLargeFsaConfirmForTests(): void {
  forcedLargeFsaAsked = false;
  forcedLargeFsaOk = false;
}

export function allowForcedLargeFsa(): boolean {
  if (!forceLargeFsaRequested()) return false;
  if (forcedLargeFsaAsked) return forcedLargeFsaOk;
  forcedLargeFsaAsked = true;
  if (typeof window === "undefined" || typeof window.confirm !== "function") {
    forcedLargeFsaOk = false;
    return false;
  }
  forcedLargeFsaOk = window.confirm(FORCED_LARGE_FSA_CONFIRM);
  return forcedLargeFsaOk;
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

export function chromeFsaRefuseTitle(folder = "This folder"): string {
  return `${folder} is too large for Chrome`;
}

export function chromeFsaRefuseLead(notes: number): string {
  return `This folder has ${notes.toLocaleString()} notes. Chrome will kill the tab if we open it — we have watched it discard after a handful of notes on a 15GB machine. We will not open it here.`;
}

export function chromeFsaRefuseDesktop(): string {
  return `Use Nexus Desktop. Same markdown folder you already have (Obsidian-compatible files on disk). Search is SQLite FTS5, not an in-tab index. Desktop is required for 25,000+ notes and for a lifetime vault.`;
}

export function chromeFsaRefuseChrome(): string {
  return `Chrome in the browser is for about 20,000 notes or fewer — a large personal vault, not a lifetime Obsidian archive.`;
}

/** Toast / one-line refuse. */
export function chromeFsaRefuseMessage(notes: number, folder = "This folder"): string {
  return `${folder} has ${notes.toLocaleString()} notes. Chrome will discard this tab. Use Nexus Desktop — same markdown folder; required for 25k+ vaults. Chrome max is about 20,000 notes.`;
}

export function chromeFsaRefuseBanner(notes: number, folder: string): string {
  return `${folder} has ${notes.toLocaleString()} notes. Chrome will discard this tab. Use Nexus Desktop (same markdown folder). Chrome max is about 20,000 notes.`;
}

export function chromeFsaWarnMessage(notes: number): string {
  return `This folder has ${notes.toLocaleString()} notes — already large for Chrome. Chrome has discarded tabs at this size. If this vault will keep growing, open it in Nexus Desktop now. Same files. Browser max is about 20,000 notes.`;
}
