/**
 * Keeps one vault's live `.base` file and the open Bases views in step.
 * Every read and write runs through one queue, so a save never interleaves
 * with a reload. The file on disk wins: a save first re-reads the file, and
 * if another app changed it since Nexus last looked, Nexus loads that
 * instead of writing over it and hands back the views it was about to save.
 */

import {
  LIVE_BASE_BACKUP,
  readLiveBase,
  sameBasesSession,
  writeLiveBase,
  type LiveBase,
} from "@/lib/vault/bases-live";
import { parseBasesSession, type BasesSession } from "@/lib/vault/note-table";

export type LiveRead = { text: string } | { missing: true } | { error: string };

export type LiveStorage = {
  /** The live file's name in messages, e.g. `Nexus Bases.base`. */
  name: string;
  /** Vault-relative path writes go to. Home is `Nexus Bases.base`. */
  path?: string;
  /** Where the live file is, for messages. */
  where: string;
  /** Where views were kept before, for messages. */
  legacyWhere: string;
  read(): Promise<LiveRead>;
  write(text: string): Promise<void>;
  /** Copy of an unreadable live file, made before Nexus replaces it. */
  backup(text: string): Promise<void>;
  /** The old `.nexus/note-table.json` (or browser-storage) views, if any. */
  readLegacy(): Promise<string | null>;
};

export type LiveOpen =
  | { kind: "new" }
  | { kind: "loaded"; session: BasesSession; notes: string[] }
  | {
      kind: "migrated";
      session: BasesSession;
      from: "legacy" | "old-export";
      /** The views came from the old `.nexus/note-table.json` rather than the file. */
      usedLegacy: boolean;
      /** Views the file held before migration, when they differ. */
      undo: BasesSession | null;
      saveError: string | null;
      notes: string[];
    }
  | { kind: "blocked"; reason: string; replaceable: boolean }
  | { kind: "legacy-unreadable" };

export type LiveSave =
  | { kind: "saved" | "unchanged" | "stale" }
  | { kind: "blocked"; reason: string }
  | { kind: "failed"; message: string }
  | { kind: "conflict"; session: BasesSession; notes: string[] };

export type LiveCheck =
  | { kind: "same" }
  | { kind: "missing" }
  | { kind: "unreadable"; message: string }
  | { kind: "blocked"; reason: string; replaceable: boolean }
  | { kind: "changed"; session: BasesSession; notes: string[]; wasBlocked: boolean };

export function sentence(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function message(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/** Old views only count when the JSON parses; a broken file must not become default views. */
function legacySession(raw: string | null): BasesSession | null | "unreadable" {
  if (raw == null || !raw.trim()) return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return "unreadable";
  } catch {
    return "unreadable";
  }
  return parseBasesSession(raw);
}

export class LiveBasesSync {
  /** The file as Nexus last read or wrote it. `null`: no file. `undefined`: not read yet. */
  private known: string | null | undefined = undefined;
  /** The file Nexus merges each save into. Import swaps it for the imported file. */
  private base: LiveBase | null = null;
  private queue: Promise<unknown> = Promise.resolve();
  /** Bumped whenever the views are replaced from disk, so saves queued before that drop. */
  private epoch = 0;
  private blockedBy: { reason: string; replaceable: boolean } | null = null;
  /** A migration whose notice no open view has shown yet (Bases closed while it ran). */
  private unseen: Extract<LiveOpen, { kind: "migrated" }> | null = null;

  storage: LiveStorage;
  /** The file this sync was created with. Opening another `.base` does not replace it. */
  readonly home: LiveStorage;

  constructor(storage: LiveStorage) {
    this.storage = storage;
    this.home = storage;
  }

  /**
   * Later reads and writes use `storage`. `text` is that file as just read
   * (`null` when it does not exist yet). Saves already queued for the previous
   * file finish first; saves queued after this one see the new file.
   */
  retarget(storage: LiveStorage, text: string | null): Promise<void> {
    return this.run(async () => {
      this.storage = storage;
      this.epoch += 1;
      this.blockedBy = null;
      this.unseen = null;
      if (text === null) {
        this.known = null;
        this.base = null;
        return;
      }
      this.load(text);
    });
  }

  private run<T>(task: () => Promise<T>): Promise<T> {
    const next = this.queue.then(task, task);
    this.queue = next.catch(() => undefined);
    return next;
  }

  get blocked(): { reason: string; replaceable: boolean } | null {
    return this.blockedBy;
  }

  /** The view showed what `open` returned; a later open need not repeat a migration notice. */
  seen(): void {
    this.unseen = null;
  }

  /** The merge template, so Undo after an import can put the file back as it was. */
  template(): LiveBase | null {
    return this.base;
  }

  /** Use `base` for the next save. Import passes the imported file; Undo passes the old template. */
  adopt(base: LiveBase | null): void {
    this.base = base;
  }

  private load(text: string): Extract<ReturnType<typeof readLiveBase>, { ok: true }> | { ok: false; reason: string } {
    const read = readLiveBase(text, this.storage.name);
    this.known = text;
    if (!read.ok) {
      const reason = `${sentence(this.storage.name)} can't be read: ${read.error}`;
      this.blockedBy = { reason, replaceable: true };
      return { ok: false, reason };
    }
    this.blockedBy = null;
    this.base = { text, session: read.session };
    return read;
  }

  private async put(session: BasesSession, keys: string[], base: LiveBase | null): Promise<string | null> {
    const text = writeLiveBase(base, session, keys);
    if (text === this.known) return null;
    await this.storage.write(text);
    this.known = text;
    const back = readLiveBase(text, this.storage.name);
    this.base = { text, session: back.ok ? back.session : session };
    return text;
  }

  open(): Promise<LiveOpen> {
    return this.run(async () => {
      this.blockedBy = null;
      this.base = null;
      this.known = undefined;
      const disk = await this.storage.read();
      if ("error" in disk) {
        this.blockedBy = { reason: `Couldn't read ${this.storage.where}: ${disk.error}`, replaceable: false };
        return { kind: "blocked", ...this.blockedBy };
      }
      if ("text" in disk) {
        const read = this.load(disk.text);
        if (!read.ok) return { kind: "blocked", reason: read.reason, replaceable: true };
        if (!read.oldExport) {
          const unseen = this.unseen;
          if (unseen && sameBasesSession(unseen.session, read.session)) return unseen;
          return { kind: "loaded", session: read.session, notes: read.notes };
        }
        const legacy = legacySession(await this.storage.readLegacy());
        const session = legacy && legacy !== "unreadable" ? legacy : read.session;
        let saveError: string | null = null;
        try {
          await this.put(session, [], this.base);
        } catch (err) {
          saveError = message(err);
        }
        return (this.unseen = {
          kind: "migrated",
          session,
          from: "old-export",
          usedLegacy: session !== read.session,
          undo: legacy && legacy !== "unreadable" && !sameBasesSession(legacy, read.session) ? read.session : null,
          saveError,
          notes: legacy === "unreadable" ? [`${sentence(this.storage.legacyWhere)} could not be read, so the views in ${this.storage.name} were kept.`] : [],
        });
      }
      this.known = null;
      const legacy = legacySession(await this.storage.readLegacy());
      if (legacy === "unreadable") return { kind: "legacy-unreadable" };
      if (!legacy) return { kind: "new" };
      let saveError: string | null = null;
      try {
        await this.put(legacy, [], null);
      } catch (err) {
        saveError = message(err);
      }
      return (this.unseen = { kind: "migrated", session: legacy, from: "legacy", usedLegacy: true, undo: null, saveError, notes: [] });
    });
  }

  /** Write `session` unless the file changed underneath it. Call synchronously with the session to save. */
  save(session: BasesSession, keys: string[]): Promise<LiveSave> {
    const epoch = this.epoch;
    return this.run(async (): Promise<LiveSave> => {
      if (epoch !== this.epoch) return { kind: "stale" };
      if (this.blockedBy) return { kind: "blocked", reason: this.blockedBy.reason };
      if (this.known === undefined) return { kind: "stale" };
      const disk = await this.storage.read();
      if ("error" in disk) return { kind: "failed", message: `Couldn't read ${this.storage.where} before saving: ${disk.error}` };
      const text = "text" in disk ? disk.text : null;
      if (text !== this.known) {
        if (text === null) {
          this.known = null;
          this.base = null;
        } else {
          const read = this.load(text);
          this.epoch += 1;
          if (!read.ok) return { kind: "blocked", reason: read.reason };
          if (!sameBasesSession(read.session, session)) return { kind: "conflict", session: read.session, notes: read.notes };
        }
      }
      if (this.known === null && !this.base && sameBasesSession(session, parseBasesSession(null))) {
        return { kind: "unchanged" };
      }
      try {
        return { kind: (await this.put(session, keys, this.base)) === null ? "unchanged" : "saved" };
      } catch (err) {
        return { kind: "failed", message: message(err) };
      }
    });
  }

  /** Look for changes made outside Nexus. Own writes read back as `same`. */
  check(): Promise<LiveCheck> {
    return this.run(async (): Promise<LiveCheck> => {
      if (this.known === undefined && !this.blockedBy) return { kind: "same" };
      const disk = await this.storage.read();
      if ("error" in disk) return { kind: "unreadable", message: disk.error };
      const text = "text" in disk ? disk.text : null;
      if (text === this.known) return { kind: "same" };
      const wasBlocked = !!this.blockedBy;
      if (text === null) {
        this.known = null;
        this.base = null;
        this.blockedBy = null;
        return { kind: "missing" };
      }
      const read = this.load(text);
      this.epoch += 1;
      if (!read.ok) return { kind: "blocked", reason: read.reason, replaceable: true };
      return { kind: "changed", session: read.session, notes: read.notes, wasBlocked };
    });
  }

  /** Replace an unreadable file with `session`, after copying it aside. */
  replace(session: BasesSession, keys: string[]): Promise<LiveSave> {
    return this.run(async (): Promise<LiveSave> => {
      const disk = await this.storage.read();
      if ("error" in disk) return { kind: "failed", message: `Couldn't read ${this.storage.where}: ${disk.error}` };
      if ("text" in disk && disk.text !== this.known) {
        const read = this.load(disk.text);
        this.epoch += 1;
        if (read.ok) return { kind: "conflict", session: read.session, notes: read.notes };
      }
      try {
        if ("text" in disk && disk.text.trim()) await this.storage.backup(disk.text);
      } catch (err) {
        return { kind: "failed", message: `Couldn't copy the unreadable file to ${LIVE_BASE_BACKUP}, so it was left alone: ${message(err)}` };
      }
      this.blockedBy = null;
      this.base = null;
      this.known = "text" in disk ? disk.text : null;
      this.epoch += 1;
      try {
        await this.put(session, keys, null);
        return { kind: "saved" };
      } catch (err) {
        return { kind: "failed", message: message(err) };
      }
    });
  }
}
