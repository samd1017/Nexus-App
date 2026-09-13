/**
 * Live vault watching — Hermes-ready.
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
    const Obs = (
      window as unknown as {
        FileSystemObserver?: new (
          cb: (records: unknown[]) => void,
        ) => {
          observe: (h: FileSystemHandle) => Promise<void>;
          disconnect: () => void;
        };
      }
    ).FileSystemObserver;

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

export function vaultContentHash(
  nodes: Record<string, { path: string; mtime: number; content?: string }>,
): string {
  return Object.values(nodes)
    .map((n) => `${n.path}:${n.mtime}:${(n.content ?? "").length}`)
    .sort()
    .join("|");
}
