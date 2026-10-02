import { useEffect } from "react";
import { create } from "zustand";
import {
  MAX_SNIPPET_BYTES,
  MIN_READABLE_CONTRAST,
  OBSIDIAN_VAR_BRIDGE,
  SNIPPET_DIRS,
  STARTER_SNIPPET_CSS,
  buildSnippet,
  contrastNotice,
  contrastRatio,
  enabledStorageKey,
  orderSnippets,
  parseEnabledSnippets,
  parseRgb,
  starterSnippetPath,
  type CssSnippet,
  type Rgba,
} from "@/lib/appearance/css-snippets";
import { usePrefsStore } from "@/lib/prefs/preferences";
import { readFsaTextFilesIn, writeNoteFile } from "@/lib/vault/fs-adapter";
import { getDesktopRoot, getFsaRoot, useVaultStore } from "@/lib/vault/store";
import { readDesktopTextFilesIn, writeDesktopNote } from "@/lib/vault/tauri-adapter";

export type LoadedSnippet = CssSnippet & {
  /** Rules the browser parsed, or null when it cannot tell. */
  rules: number | null;
};

const STYLE_ATTR = "data-nexus-snippet";
let bridged: string[] = [];

function ruleCount(css: string): number | null {
  try {
    const sheet = new CSSStyleSheet();
    sheet.replaceSync(css);
    return sheet.cssRules.length;
  } catch {
    return null;
  }
}

let colorCtx: CanvasRenderingContext2D | null | undefined;

/** Computed colors are usually rgb(); anything else is normalized through a canvas. */
function toRgba(value: string): Rgba | null {
  const direct = parseRgb(value);
  if (direct) return direct;
  if (colorCtx === undefined) {
    try {
      const canvas = document.createElement("canvas");
      canvas.width = 1;
      canvas.height = 1;
      colorCtx = canvas.getContext("2d", { willReadFrequently: true });
    } catch {
      colorCtx = null;
    }
  }
  if (!colorCtx) return null;
  colorCtx.clearRect(0, 0, 1, 1);
  colorCtx.fillStyle = "#000";
  colorCtx.fillStyle = value;
  colorCtx.fillRect(0, 0, 1, 1);
  const [r = 0, g = 0, b = 0, a = 255] = colorCtx.getImageData(0, 0, 1, 1).data;
  return { r, g, b, a: a / 255 };
}

function effectiveBackground(el: Element | null): Rgba | null {
  for (let cur = el; cur; cur = cur.parentElement) {
    const bg = toRgba(getComputedStyle(cur).backgroundColor);
    if (bg && bg.a >= 0.5) return bg;
  }
  return null;
}

type Reading = { where: string; ratio: number };

function measureReadability(): Reading[] {
  if (typeof document === "undefined" || !document.body) return [];
  const out: Reading[] = [];
  const probe = document.createElement("div");
  probe.setAttribute("aria-hidden", "true");
  probe.style.cssText =
    "position:fixed;left:-9999px;top:0;width:1px;height:1px;pointer-events:none;color:var(--text-primary);background-color:var(--bg-primary)";
  document.body.appendChild(probe);
  const fg = toRgba(getComputedStyle(probe).color);
  const bg = toRgba(getComputedStyle(probe).backgroundColor);
  probe.remove();
  if (fg && bg) out.push({ where: "panel", ratio: contrastRatio(fg, bg) });
  const surfaces: [string, string][] = [
    ["page", "body"],
    ["editor", ".note-editor"],
    ["sidebar", ".tree-item"],
  ];
  for (const [where, selector] of surfaces) {
    const el = document.querySelector(selector);
    if (!el) continue;
    const color = toRgba(getComputedStyle(el).color);
    const under = effectiveBackground(el);
    if (color && under) out.push({ where, ratio: contrastRatio(color, under) });
  }
  return out;
}

function readBridgeVars(): Map<string, string> {
  const values = new Map<string, string>();
  if (!document.body) return values;
  const computed = getComputedStyle(document.body);
  for (const [from] of OBSIDIAN_VAR_BRIDGE) values.set(from, computed.getPropertyValue(from).trim());
  return values;
}

/** One <style> per snippet, so an unclosed brace in one file cannot swallow the next. */
function writeSnippetStyles(snippets: CssSnippet[], enabled: string[]): void {
  if (typeof document === "undefined") return;
  document.querySelectorAll(`style[${STYLE_ATTR}]`).forEach((el) => el.remove());
  const body = document.body;
  for (const prop of bridged) body?.style.removeProperty(prop);
  bridged = [];
  const on = new Set(enabled);
  const active = orderSnippets(snippets).filter((s) => on.has(s.id) && !s.error && s.css.trim());
  if (!active.length) return;
  const before = readBridgeVars();
  for (const snippet of active) {
    const el = document.createElement("style");
    el.setAttribute(STYLE_ATTR, snippet.id);
    el.textContent = snippet.css;
    document.head.appendChild(el);
  }
  if (!body) return;
  const after = readBridgeVars();
  for (const [from, targets] of OBSIDIAN_VAR_BRIDGE) {
    const value = after.get(from) ?? "";
    if (!value || value === before.get(from)) continue;
    for (const target of targets) {
      body.style.setProperty(target, value);
      bridged.push(target);
    }
  }
}

/**
 * Applies `enabled` and keeps it only when every surface stays readable.
 * A surface trips the guard when snippets push it under 3:1 and below
 * what the theme alone gives.
 */
function applyWithGuard(
  snippets: CssSnippet[],
  enabled: string[],
  changedId: string | null,
): { enabled: string[]; notice: string | null } {
  writeSnippetStyles(snippets, []);
  if (!enabled.length) return { enabled, notice: null };
  const baseline = new Map(measureReadability().map((r) => [r.where, r.ratio]));
  const worst = (): Reading | null => {
    let bad: Reading | null = null;
    for (const r of measureReadability()) {
      const base = baseline.get(r.where) ?? Infinity;
      if (r.ratio < MIN_READABLE_CONTRAST && r.ratio < base - 0.05 && (!bad || r.ratio < bad.ratio)) bad = r;
    }
    return bad;
  };
  writeSnippetStyles(snippets, enabled);
  const bad = worst();
  if (!bad) return { enabled, notice: null };
  if (changedId) {
    const rest = enabled.filter((id) => id !== changedId);
    writeSnippetStyles(snippets, rest);
    if (!rest.length || !worst()) {
      const name = snippets.find((s) => s.id === changedId)?.name ?? null;
      return { enabled: rest, notice: contrastNotice(name, bad.ratio, bad.where) };
    }
  }
  writeSnippetStyles(snippets, []);
  return { enabled: [], notice: contrastNotice(null, bad.ratio, bad.where) };
}

function loadEnabled(vaultKey: string | null): string[] {
  if (!vaultKey) return [];
  try {
    return parseEnabledSnippets(localStorage.getItem(enabledStorageKey(vaultKey)));
  } catch {
    return [];
  }
}

function saveEnabled(vaultKey: string | null, enabled: string[]): void {
  if (!vaultKey) return;
  try {
    localStorage.setItem(enabledStorageKey(vaultKey), JSON.stringify(enabled));
  } catch {
    /* ignore */
  }
}

type SnippetStore = {
  vaultKey: string | null;
  /** Snippets need a folder on disk: desktop or a browser-opened folder. */
  diskVault: boolean;
  snippets: LoadedSnippet[];
  enabled: string[];
  loading: boolean;
  notice: string | null;
  refresh: () => Promise<void>;
  setEnabled: (id: string, on: boolean) => void;
  disableAll: (notice?: string | null) => void;
  createStarter: () => Promise<string | null>;
  dismissNotice: () => void;
};

let refreshSeq = 0;

export const useCssSnippetStore = create<SnippetStore>()((set, get) => ({
  vaultKey: null,
  diskVault: false,
  snippets: [],
  enabled: [],
  loading: false,
  notice: null,

  refresh: async () => {
    const seq = ++refreshSeq;
    const desktop = getDesktopRoot();
    const fsa = desktop ? null : getFsaRoot();
    const vaultKey = useVaultStore.getState().vaultId ?? desktop ?? null;
    if (!desktop && !fsa) {
      writeSnippetStyles([], []);
      set({ vaultKey, diskVault: false, snippets: [], enabled: [], loading: false });
      return;
    }
    set({ loading: true, diskVault: true, vaultKey });
    const lists = await Promise.all(
      SNIPPET_DIRS.map(async ({ dir, source }) => {
        const files = desktop
          ? await readDesktopTextFilesIn(desktop, dir, ".css", MAX_SNIPPET_BYTES)
          : await readFsaTextFilesIn(fsa as FileSystemDirectoryHandle, dir, ".css", MAX_SNIPPET_BYTES);
        return files.map((file) => buildSnippet(source, dir, file));
      }),
    ).catch(() => [] as CssSnippet[][]);
    if (seq !== refreshSeq) return;
    const snippets: LoadedSnippet[] = orderSnippets(lists.flat()).map((s) => ({
      ...s,
      rules: s.error ? null : ruleCount(s.css),
    }));
    const stored = loadEnabled(vaultKey);
    const present = stored.filter((id) => snippets.some((s) => s.id === id));
    const result = applyWithGuard(snippets, present, null);
    if (result.notice) saveEnabled(vaultKey, result.enabled);
    set({
      snippets,
      enabled: result.enabled,
      loading: false,
      notice: result.notice ? result.notice.replace("were turned off", "were turned off on open") : get().notice,
    });
  },

  setEnabled: (id, on) => {
    const { snippets, enabled, vaultKey } = get();
    const next = on ? [...new Set([...enabled, id])] : enabled.filter((x) => x !== id);
    const result = applyWithGuard(snippets, next, on ? id : null);
    saveEnabled(vaultKey, result.enabled);
    set({ enabled: result.enabled, notice: result.notice });
  },

  disableAll: (notice = null) => {
    const { vaultKey } = get();
    writeSnippetStyles([], []);
    saveEnabled(vaultKey, []);
    set({ enabled: [], notice });
  },

  createStarter: async () => {
    const desktop = getDesktopRoot();
    const fsa = desktop ? null : getFsaRoot();
    if (!desktop && !fsa) return null;
    const path = starterSnippetPath(get().snippets.map((s) => s.path));
    try {
      if (desktop) await writeDesktopNote(desktop, path, STARTER_SNIPPET_CSS);
      else await writeNoteFile(fsa as FileSystemDirectoryHandle, path, STARTER_SNIPPET_CSS);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      set({ notice: `Couldn't create ${path}: ${message}` });
      return null;
    }
    await get().refresh();
    return path;
  },

  dismissNotice: () => set({ notice: null }),
}));

if (typeof window !== "undefined") {
  let lastTheme = usePrefsStore.getState().theme;
  usePrefsStore.subscribe((state) => {
    if (state.theme === lastTheme) return;
    lastTheme = state.theme;
    // The theme paints after this store write; re-check once it has.
    window.setTimeout(() => {
      const { snippets, enabled, vaultKey } = useCssSnippetStore.getState();
      if (!enabled.length) return;
      const result = applyWithGuard(snippets, enabled, null);
      if (result.enabled.length === enabled.length) return;
      saveEnabled(vaultKey, result.enabled);
      useCssSnippetStore.setState({ enabled: result.enabled, notice: result.notice });
    }, 0);
  });
}

/** Loads the open vault's snippets and re-reads them when the vault changes. */
export function useVaultCssSnippets(): void {
  const vaultId = useVaultStore((s) => s.vaultId);
  const mode = useVaultStore((s) => s.mode);
  useEffect(() => {
    void useCssSnippetStore.getState().refresh();
  }, [vaultId, mode]);
}
