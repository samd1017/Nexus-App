/**
 * Desktop module. The saved page is already painted by /saved-page.js
 * (a classic script, no imports) before this file is fetched.
 *
 * Awaits that can sit on the warm Ready clock, in order:
 * 1. Before this module: the dev server used to hold optimized dependencies
 *    until it had crawled this file's import of the app. saved-page.js does
 *    not wait on that crawl.
 * 2. vault_shell_mount — synchronous on the webview thread. A filled reopen
 *    reads a page snapshot; a miss lists a directory page or opens the index
 *    on this same thread. Either way it runs only after one painted frame.
 * 3. import("./main.tsx") — the rest of the app, after that frame.
 */
import {
  DESKTOP_PREFS_STORAGE_KEY,
  DESKTOP_ROOT_STORAGE_KEY,
  DESKTOP_VAULT_STORAGE_KEY,
  readLastNotePath,
  readOpenLastVault,
  rememberSavedPage,
  SAVED_PAGE_READY_MESSAGE,
  savedPageTitlesLive,
  shouldPrefetchSavedPage,
} from "@/lib/vault/desktop-boot";
import { publishReadyClock } from "@/lib/vault/ready-clock";

type TauriCore = {
  invoke: (cmd: string, args?: Record<string, unknown>) => Promise<unknown>;
};

function tauriInvoke(): TauriCore["invoke"] | null {
  const tauri = (window as unknown as { __TAURI__?: { core?: TauriCore } }).__TAURI__;
  return tauri?.core?.invoke ?? null;
}

function storage(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function paintSavedPage(mount: { rows?: Array<{ name?: string; kind?: string; path?: string }> }): void {
  const host = document.getElementById("nexus-boot-banner");
  if (!host) return;
  const names = (mount.rows ?? [])
    .map((row) => row.name || row.path?.split(/[/\\]/).pop() || "")
    .filter(Boolean)
    .slice(0, 12);
  const boot = (window as unknown as { __NEXUS_BOOT__?: { paintedFromPage?: boolean } }).__NEXUS_BOOT__;
  if (boot?.paintedFromPage === true && names.length === 0) return;
  host.replaceChildren();
  const bar = document.createElement("div");
  bar.setAttribute("role", "status");
  bar.setAttribute("aria-live", "polite");
  bar.setAttribute("aria-label", SAVED_PAGE_READY_MESSAGE);
  bar.setAttribute("data-open-progress", "ready");
  bar.style.cssText = [
    "display:flex",
    "align-items:center",
    "min-height:64px",
    "padding:16px 20px",
    "font:700 32px/1.15 ui-sans-serif,system-ui,sans-serif",
    "color:#ffffff",
    "background:#000000",
    "border-bottom:3px solid #30d158",
  ].join(";");
  const label = document.createElement("span");
  label.textContent = SAVED_PAGE_READY_MESSAGE;
  label.style.cssText = "color:#ffffff;font-weight:700;font-size:32px;line-height:1.15";
  bar.append(label);
  host.append(bar);
  host.style.position = "fixed";
  host.style.top = "0";
  host.style.left = "0";
  host.style.right = "0";
  host.style.zIndex = "200";
  // Drawn over the title bar; clicks go through to the gear and the list.
  host.style.pointerEvents = "none";
  host.style.paddingTop = "44px";
  host.style.background = "#08080a";
  if (names.length) {
    const list = document.createElement("div");
    list.style.cssText = [
      "padding:8px 12px",
      "font:13px/1.4 ui-sans-serif,system-ui,sans-serif",
      "color:#f2f2f7",
      "background:#050507",
    ].join(";");
    for (const name of names) {
      const row = document.createElement("div");
      row.textContent = name.replace(/\.md$/i, "");
      list.append(row);
    }
    host.append(list);
  }
  host.hidden = false;
}

async function prefetchSavedPage(): Promise<void> {
  const root = storage(DESKTOP_ROOT_STORAGE_KEY);
  const openLast = readOpenLastVault(storage(DESKTOP_PREFS_STORAGE_KEY));
  const invoke = tauriInvoke();
  const started = performance.now();
  const boot = ((window as unknown as { __NEXUS_BOOT__?: Record<string, unknown> }).__NEXUS_BOOT__ ??= {});
  if (typeof boot.t0 !== "number") boot.t0 = started;
  if (!shouldPrefetchSavedPage({ inTauri: Boolean(invoke), root, openLastVault: openLast }) || !invoke || !root) {
    return;
  }
  const preferPath = readLastNotePath(storage(DESKTOP_VAULT_STORAGE_KEY));
  const mount = await invoke("vault_shell_mount", {
    vaultRoot: root,
    preferPath,
  });
  boot.root = root;
  boot.mount = mount;
  boot.mountMs = Math.round(performance.now() - started);
  const live = mount as {
    titlesLive?: boolean;
    pending?: boolean;
    rows?: Array<{ name?: string; kind?: string }>;
  };
  if (savedPageTitlesLive(live)) {
    paintSavedPage(live);
    rememberSavedPage(root, live.rows);
    boot.announced = true;
    boot.invokeMs = boot.mountMs;
  }
}

/** One painted frame before the editor bundle evaluates. */
function afterPaint(): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => {
      setTimeout(resolve, 0);
    });
  });
}

async function bootDesktop(): Promise<void> {
  const boot = ((window as unknown as { __NEXUS_BOOT__?: Record<string, unknown> }).__NEXUS_BOOT__ ??= {});
  const clock = (window as unknown as { __NEXUS_READY_CLOCK__?: { document?: number } }).__NEXUS_READY_CLOCK__;
  if (typeof clock?.document !== "number") publishReadyClock("module");
  if (typeof boot.t0 !== "number") boot.t0 = performance.now();
  // Commit the page script's Ready line before vault_shell_mount.
  // That command runs on this thread and used to finish before any pixels.
  await afterPaint();
  if (boot.paintedFromPage === true) {
    boot.readyFrameMs = Math.round(performance.now());
  }
  try {
    await prefetchSavedPage();
  } catch {
    // The shell still loads. A page already on screen stays up.
  }
  if (boot.announced === true && typeof boot.readyFrameMs !== "number") {
    await afterPaint();
    boot.readyFrameMs = Math.round(performance.now());
  }
  const app = await import("./main.tsx");
  app.mountDesktop();
}

void bootDesktop();
