/**
 * One line the desktop soak can grep: NEXUS_READY_CLOCK.
 * Unix milliseconds so it can be subtracted from the window-shown line.
 * phase=window | focus | document-native come from the shell process.
 * phase=document | early | module | shell come from the page.
 */
export const READY_CLOCK_PREFIX = "NEXUS_READY_CLOCK";

export type ReadyClock = {
  window?: number;
  document?: number;
  documentNative?: number;
  early?: number;
  earlyHit?: number;
  earlyReason?: string;
  shell?: number;
};

type ClockWindow = Window & {
  __NEXUS_READY_CLOCK__?: ReadyClock;
  __NEXUS_SOAK_LAST__?: Record<string, unknown>;
  __TAURI__?: {
    core?: {
      invoke?: (cmd: string, args?: Record<string, unknown>) => Promise<unknown>;
    };
  };
};

function clockWindow(): ClockWindow | null {
  return (globalThis as { window?: ClockWindow }).window ?? null;
}

function reasonToken(value: string | undefined): string {
  const token = String(value || "").replace(/[^a-z0-9-]/gi, "");
  return token || "-";
}

export function publishReadyClock(
  phase: "document" | "early" | "module" | "shell",
  patch?: { hit?: number; reason?: string },
): void {
  const w = clockWindow();
  if (!w) return;
  const clock = (w.__NEXUS_READY_CLOCK__ ??= {});
  const t = Date.now();
  if (phase === "document" || phase === "module") {
    if (typeof clock.document !== "number") clock.document = t;
  }
  if (phase === "early") {
    clock.early = t;
    clock.earlyHit = patch?.hit ?? 0;
    clock.earlyReason = reasonToken(patch?.reason);
  }
  if (phase === "module" && !clock.earlyReason) {
    clock.earlyReason = "no-classic-script";
  }
  if (phase === "shell") clock.shell = t;
  const line = [
    READY_CLOCK_PREFIX,
    `phase=${phase}`,
    `t=${t}`,
    `window=${clock.window || 0}`,
    `document=${clock.document || 0}`,
    `early=${clock.early || 0}`,
    `hit=${clock.earlyHit || 0}`,
    `reason=${reasonToken(clock.earlyReason)}`,
    `shell=${clock.shell || 0}`,
  ].join(" ");
  console.log(line);
  try {
    (globalThis as { document?: { documentElement?: { setAttribute: (n: string, v: string) => void } } })
      .document?.documentElement?.setAttribute("data-ready-clock", line);
  } catch {
    /* the clock line still went to the console */
  }
  const last = (w.__NEXUS_SOAK_LAST__ ??= {});
  last.readyClock = { ...clock, line };
  const invoke = w.__TAURI__?.core?.invoke;
  if (!invoke) return;
  try {
    const pending = invoke("ready_clock_log", { line });
    void pending.catch(() => {});
  } catch {
    /* process log is best-effort */
  }
}
