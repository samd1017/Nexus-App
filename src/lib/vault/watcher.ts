/**
 * Live vault watching — Hermes-ready.
 * Demo/local: hash poll of in-memory nodes.
 * FSA: poll directory signatures every ~1s and rescan on change.
 */

import {
  scanSignatures,
  scanVault,
  signaturesChanged,
  type VaultScan,
} from "./fs-adapter";

type WatchCallback = (event: {
  type: "change" | "create" | "delete";
  path: string;
  scan?: VaultScan;
}) => void;

export class VaultWatcher {
  private timer: ReturnType<typeof setInterval> | null = null;
  private lastHash = "";
  private lastSigs: Record<string, string> = {};
  private cb: WatchCallback | null = null;
  private dir: FileSystemDirectoryHandle | null = null;
  private scanning = false;

  /** Memory-mode watch (demo / local) */
  start(getHash: () => string, cb: WatchCallback, intervalMs = 1000) {
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

  /** Real filesystem watch via FSA signature polling */
  async startFsa(
    dir: FileSystemDirectoryHandle,
    cb: WatchCallback,
    intervalMs = 1200,
  ) {
    this.stop();
    this.cb = cb;
    this.dir = dir;
    try {
      this.lastSigs = await scanSignatures(dir);
    } catch {
      this.lastSigs = {};
    }
    this.timer = setInterval(() => {
      void this.pollFsa();
    }, intervalMs);
  }

  private async pollFsa() {
    if (!this.dir || this.scanning) return;
    this.scanning = true;
    try {
      const next = await scanSignatures(this.dir);
      if (signaturesChanged(this.lastSigs, next)) {
        this.lastSigs = next;
        const scan = await scanVault(this.dir);
        this.lastSigs = Object.fromEntries(
          Object.entries(scan.signatures).map(([p, s]) => {
            // prefer size-based for next polls
            const parts = s.split(":");
            return [p, `${parts[0]}:${parts[1] ?? "0"}`];
          }),
        );
        // Actually scanSignatures format is mtime:size — rebuild from nodes
        const rebuilt: Record<string, string> = {};
        for (const n of Object.values(scan.nodes)) {
          if (n.kind === "note") {
            rebuilt[n.path] = `${n.mtime}:${(n.content ?? "").length}`;
          }
        }
        // Use scanSignatures again for consistency
        this.lastSigs = await scanSignatures(this.dir);
        this.cb?.({ type: "change", path: "*", scan });
      }
    } catch {
      /* permission lost or transient */
    } finally {
      this.scanning = false;
    }
  }

  async acknowledgeWrite(dir: FileSystemDirectoryHandle) {
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
