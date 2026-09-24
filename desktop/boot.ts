/**
 * First script in the desktop window.
 * Reads the saved page, paints Ready, then loads the rest of the app.
 */
import {
  DESKTOP_PREFS_STORAGE_KEY,
  DESKTOP_ROOT_STORAGE_KEY,
  DESKTOP_VAULT_STORAGE_KEY,
  readLastNotePath,
  readOpenLastVault,
  SAVED_PAGE_READY_MESSAGE,
  savedPageTitlesLive,
  shouldPrefetchSavedPage,
} from "@/lib/vault/desktop-boot";

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

function paintSavedPage(mount: { rows?: Array<{ name?: string; kind?: string }> }): void {
  const host = document.getElementById("nexus-boot-banner");
  if (!host) return;
  const names = (mount.rows ?? [])
    .map((row) => row.name || "")
    .filter(Boolean)
    .slice(0, 12);
  host.replaceChildren();
  const bar = document.createElement("div");
  bar.setAttribute("role", "status");
  bar.setAttribute("data-open-progress", "ready");
  bar.style.cssText = [
    "display:flex",
    "align-items:center",
    "gap:8px",
    "padding:6px 12px",
    "font:12px/1.3 ui-sans-serif,system-ui,sans-serif",
    "color:#30d158",
    "background:rgba(48,209,88,0.08)",
    "border-bottom:1px solid rgba(48,209,88,0.28)",
  ].join(";");
  const dot = document.createElement("span");
  dot.style.cssText = "width:6px;height:6px;border-radius:99px;background:#30d158;flex:none";
  const label = document.createElement("span");
  label.textContent = SAVED_PAGE_READY_MESSAGE;
  bar.append(dot, label);
  host.append(bar);
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
  boot.t0 = started;
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
  if (savedPageTitlesLive(mount as { titlesLive?: boolean; pending?: boolean; rows?: unknown[] })) {
    paintSavedPage(mount as { rows?: Array<{ name?: string; kind?: string }> });
    boot.announced = true;
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
  try {
    await prefetchSavedPage();
  } catch {
    // The shell still loads. Ready stays unannounced.
  }
  const boot = (window as unknown as { __NEXUS_BOOT__?: Record<string, unknown> }).__NEXUS_BOOT__;
  if (boot?.announced === true) {
    await afterPaint();
    const t0 = typeof boot.t0 === "number" ? boot.t0 : performance.now();
    boot.readyFrameMs = Math.round(performance.now() - t0);
  }
  const app = await import("./main.tsx");
  app.mountDesktop();
}

void bootDesktop();
