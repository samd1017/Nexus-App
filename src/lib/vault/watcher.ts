/**
 * Live vault watching — ready for outside writers.
 * Prefers FileSystemObserver when available; falls back to signature poll.
 * Large FSA vaults keep signatures only — a second 100k node map was a
 * Chrome-discard retainer.
 */

import {
  incrementalRescan,
  scanSignatures,
  scanVault,
  scanVaultMeta,
  signaturesChanged,
  type VaultScan,
} from "./fs-adapter";
import { shouldLazyBodies } from "./scale-flags";
import { CHROME_FSA_WATCH_MAX } from "./chrome-fsa-cap";

/** Keep a full lastScan copy only under this many signature entries. */
export const WATCH_RETAIN_SCAN_MAX = 10_000;
/** Re-export — Chrome FSA must not poll above this or note-open discards the tab. */
export const WATCH_POLL_DISABLE_MIN = CHROME_FSA_WATCH_MAX;

export function watchPollIntervalMs(sigCount: number, requested = 900): number {
  if (sigCount > 50_000) return Math.max(requested, 60_000);
  if (sigCount > 10_000) return Math.max(requested, 8_000);
  return requested;
}

export function shouldRetainWatchScan(sigCount: number): boolean {
  return sigCount <= WATCH_RETAIN_SCAN_MAX;
}

/** Signature poll + FileSystemObserver rescan discarded Chrome at note 8–12. */
export function shouldPollFsaWatch(sigCount: number): boolean {
  return sigCount < CHROME_FSA_WATCH_MAX;
}

function sigCountOf(sigs: Record<string, string>): number {
  return Object.keys(sigs).length;
}

const OBSERVER_SKIP = new Set(["node_modules", ".git", ".trash", ".obsidian"]);

/**
 * Paths from a FileSystemObserver callback. Dot paths are ignored.
 * This does not walk the folder.
 */
export function pathsFromObserverRecords(records: unknown): string[] {
  const list = Array.isArray(records) ? records : records && typeof records === "object" ? [records] : [];
  const out: string[] = [];
  const seen = new Set<string>();
  const push = (parts: unknown) => {
    if (!Array.isArray(parts) || parts.length === 0) return;
    const segs = parts.map((part) => String(part));
    if (segs.some((seg) => !seg || seg.startsWith(".") || OBSERVER_SKIP.has(seg))) return;
    const path = segs.join("/");
    if (seen.has(path)) return;
    seen.add(path);
    out.push(path);
  };
  for (const rec of list) {
    if (!rec || typeof rec !== "object") continue;
    const row = rec as {
      relativePathComponents?: unknown;
      relativePathMovedFrom?: unknown;
    };
    push(row.relativePathComponents);
    push(row.relativePathMovedFrom);
  }
  return out;
}

function fileSystemObserverCtor():
  | (new (cb: (records: unknown[]) => void) => {
      observe: (h: FileSystemHandle) => Promise<void>;
      disconnect: () => void;
    })
  | undefined {
  return (
    window as unknown as {
      FileSystemObserver?: new (cb: (records: unknown[]) => void) => {
        observe: (h: FileSystemHandle) => Promise<void>;
        disconnect: () => void;
      };
    }
  ).FileSystemObserver;
}

type WatchCallback = (event: {
  type: "change" | "create" | "delete";
  path: string;
  scan?: VaultScan;
  changedPaths?: string[];
}) => void;

export class VaultWatcher {
  private timer: ReturnType<typeof setInterval> | null = null;
  private lastHash = "";
  private lastScan: VaultScan | null = null;
  private lastSigs: Record<string, string> = {};
  private cb: WatchCallback | null = null;
  private dir: FileSystemDirectoryHandle | null = null;
  private scanning = false;
  private observer: { disconnect: () => void } | null = null;
  private suppressUntil = 0;

  /** Memory-mode watch (demo / local) */
  start(getHash: () => string, cb: WatchCallback, intervalMs = 900) {
    this.stop();
    this.cb = cb;
    this.dir = null;
    this.lastHash = getHash();
    this.timer = setInterval(() => {
      const h = getHash();
      if (h !== this.lastHash) {
        this.lastHash = h;
        this.cb?.({ type: "change", path: "*" });
      }
    }, intervalMs);
  }

  /** Real filesystem watch via FSA */
  async startFsa(
    dir: FileSystemDirectoryHandle,
    cb: WatchCallback,
    intervalMs = 900,
  ) {
    this.stop();
    this.cb = cb;
    this.dir = dir;
    try {
      this.lastSigs = await scanSignatures(dir);
    } catch {
      this.lastSigs = {};
    }
    const n = sigCountOf(this.lastSigs);
    if (!shouldPollFsaWatch(n)) {
      // Drop the 20k–100k signature map. Do not poll or observe.
      this.lastSigs = {};
      this.lastScan = null;
      return;
    }
    if (shouldRetainWatchScan(n)) {
      try {
        const full = shouldLazyBodies("fsa")
          ? await scanVaultMeta(dir)
          : await scanVault(dir);
        this.lastScan = full;
        this.lastSigs = full.signatures;
      } catch {
        this.lastScan = null;
      }
    } else {
      // 100k FSA: store already holds the tree. Do not clone it here.
      this.lastScan = null;
    }

    // FileSystemObserver (Chromium) when present
    const Obs = fileSystemObserverCtor();

    if (typeof Obs === "function") {
      try {
        const observer = new Obs(() => {
          void this.pollFsa(true);
        });
        await observer.observe(dir);
        this.observer = observer;
      } catch {
        this.observer = null;
      }
    }

    this.timer = setInterval(() => {
      void this.pollFsa(false);
    }, watchPollIntervalMs(sigCountOf(this.lastSigs), intervalMs));
  }

  private async pollFsa(force: boolean) {
    if (!this.dir || this.scanning) return;
    if (Date.now() < this.suppressUntil) return;
    if (!shouldPollFsaWatch(sigCountOf(this.lastSigs))) return;
    this.scanning = true;
    try {
      const next = await scanSignatures(this.dir);
      if (!shouldPollFsaWatch(sigCountOf(next))) {
        this.lastSigs = {};
        this.lastScan = null;
        return;
      }
      if (!force && !signaturesChanged(this.lastSigs, next)) return;

      const metaOnly = shouldLazyBodies("fsa");
      const n = sigCountOf(next);
      if (!shouldRetainWatchScan(n)) {
        const scan = metaOnly
          ? await scanVaultMeta(this.dir)
          : await scanVault(this.dir);
        this.lastSigs = scan.signatures;
        this.lastScan = null;
        this.cb?.({
          type: "change",
          path: "*",
          scan,
        });
        return;
      }

      if (this.lastScan) {
        const { scan, changedPaths } = await incrementalRescan(
          this.dir,
          this.lastScan,
          { metaOnly },
        );
        this.lastScan = scan;
        this.lastSigs = scan.signatures;
        this.cb?.({
          type: "change",
          path: "*",
          scan,
          changedPaths,
        });
      } else {
        const scan = metaOnly
          ? await scanVaultMeta(this.dir)
          : await scanVault(this.dir);
        this.lastScan = scan;
        this.lastSigs = scan.signatures;
        this.cb?.({ type: "change", path: "*", scan });
      }
    } catch {
      /* permission lost or transient */
    } finally {
      this.scanning = false;
    }
  }

  private folderCursor = 0;

  /**
   * Paged browser shell. Reports changed paths only.
   * Does not signature-scan or rebuild a node map.
   * When the browser can observe the folder, that report is the signal.
   * Otherwise one open folder is compared with the catalog at a time.
   */
  async startFsaShell(
    dir: FileSystemDirectoryHandle,
    onPaths: (paths: string[]) => void,
    openFolders?: () => string[],
  ) {
    this.stop();
    this.dir = dir;
    this.folderCursor = 0;
    const Obs = fileSystemObserverCtor();
    if (typeof Obs === "function") {
      try {
        const observer = new Obs((records: unknown[]) => {
          if (Date.now() < this.suppressUntil) return;
          const paths = pathsFromObserverRecords(records);
          if (paths.length) onPaths(paths);
        });
        await observer.observe(dir);
        this.observer = observer;
        return;
      } catch {
        this.observer = null;
      }
    }
    if (!openFolders) return;
    this.timer = setInterval(() => {
      void this.pollOpenFolder(openFolders, onPaths);
    }, 5000);
  }

  private async pollOpenFolder(
    openFolders: () => string[],
    onPaths: (paths: string[]) => void,
  ) {
    if (!this.dir || this.scanning || Date.now() < this.suppressUntil) return;
    const folders = openFolders().filter((path) => typeof path === "string");
    if (!folders.length) return;
    const parent = folders[this.folderCursor % folders.length] ?? "";
    this.folderCursor += 1;
    this.scanning = true;
    try {
      const { diffOpenFolder } = await import("./browser-shell");
      const changed = await diffOpenFolder(parent);
      if (changed.length) onPaths(changed);
    } catch {
      /* permission lost or transient */
    } finally {
      this.scanning = false;
    }
  }

  /** After app writes, suppress echo + refresh baseline */
  async acknowledgeWrite(dir: FileSystemDirectoryHandle) {
    this.suppressUntil = Date.now() + 1500;
    try {
      this.lastSigs = await scanSignatures(dir);
    } catch {
      /* ignore */
    }
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.dir = null;
    this.lastScan = null;
    this.lastSigs = {};
    try {
      this.observer?.disconnect();
    } catch {
      /* ignore */
    }
    this.observer = null;
  }
}

const nodeMapTokens = new WeakMap<object, string>();
let nodeMapSeq = 0;

/**
 * Poll signal for memory vaults: changes when the store swaps in a new node
 * map, at the same cost for 12 notes or 500k.
 */
export function nodeMapToken(nodes: object): string {
  let token = nodeMapTokens.get(nodes);
  if (!token) {
    nodeMapSeq += 1;
    token = String(nodeMapSeq);
    nodeMapTokens.set(nodes, token);
  }
  return token;
}
