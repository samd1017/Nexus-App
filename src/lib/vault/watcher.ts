/**
 * Live vault watching — Hermes-ready.
 * Prefers FileSystemObserver when available; falls back to ~800ms signature poll.
 * Uses incremental rescans to avoid full vault re-reads.
 */

import {
  incrementalRescan,
  scanSignatures,
  scanVault,
  signaturesChanged,
  type VaultScan,
} from "./fs-adapter";

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
      const full = await scanVault(dir);
      this.lastScan = full;
      this.lastSigs = full.signatures;
    } catch {
      this.lastSigs = {};
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

    // Always keep a light poll as safety net (Hermes reliability)
    this.timer = setInterval(() => {
      void this.pollFsa(false);
    }, intervalMs);
  }

  private async pollFsa(force: boolean) {
    if (!this.dir || this.scanning) return;
    if (Date.now() < this.suppressUntil) return;
    this.scanning = true;
    try {
      const next = await scanSignatures(this.dir);
      if (!force && !signaturesChanged(this.lastSigs, next)) return;

      if (this.lastScan) {
        const { scan, changedPaths } = await incrementalRescan(
          this.dir,
          this.lastScan,
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
        const scan = await scanVault(this.dir);
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
      // keep lastScan nodes in sync lazily on next poll
    } catch {
      /* ignore */
    }
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.dir = null;
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
