/**
 * Filesystem watching abstraction.
 * In demo/local mode: polls store mtimes + supports Hermes simulation.
 * With File System Access API (future): would poll directory handles every 1s.
 */

type WatchCallback = (event: { type: "change" | "create" | "delete"; path: string }) => void;

export class VaultWatcher {
  private timer: ReturnType<typeof setInterval> | null = null;
  private lastHash = "";
  private cb: WatchCallback | null = null;

  start(getHash: () => string, cb: WatchCallback, intervalMs = 1000) {
    this.stop();
    this.cb = cb;
    this.lastHash = getHash();
    this.timer = setInterval(() => {
      const h = getHash();
      if (h !== this.lastHash) {
        this.lastHash = h;
        this.cb?.({ type: "change", path: "*" });
      }
    }, intervalMs);
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }
}

export function vaultContentHash(nodes: Record<string, { path: string; mtime: number; content?: string }>): string {
  return Object.values(nodes)
    .map((n) => `${n.path}:${n.mtime}:${(n.content ?? "").length}`)
    .sort()
    .join("|");
}
