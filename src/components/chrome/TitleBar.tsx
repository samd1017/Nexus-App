import { Focus, Settings, Save, Keyboard } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useVaultStore } from "@/lib/vault/store";
import { isLargeMemoryVault } from "@/lib/vault/scale-flags";
import { formatRelativeTime, cn } from "@/lib/utils";
import { NexusWordmark } from "@/components/brand/NexusLogo";
import { usePrefsStore } from "@/lib/prefs/preferences";
import { setFocusMode } from "@/lib/prefs/focus-mode";
import { formatShortcut, isDesktopShell, isMacOS } from "@/lib/platform";

/** Window chrome: branding + one clear status chip. Native traffic lights live in the OS bar. */
export function TitleBar() {
  const vaultName = useVaultStore((s) => s.vaultName);
  const mode = useVaultStore((s) => s.mode);
  const lastExternalSync = useVaultStore((s) => s.lastExternalSync);
  const vaultId = useVaultStore((s) => s.vaultId);
  const dirtyCount = useVaultStore((s) => s.dirtyNoteIds.length);
  const flushDirty = useVaultStore((s) => s.flushDirty);
  const lastSavedAt = useVaultStore((s) => s.lastSavedAt as number | null);
  const setSettingsOpen = usePrefsStore((s) => s.setSettingsOpen);
  const focusMode = usePrefsStore((s) => s.focusMode);
  const [saving, setSaving] = useState(false);
  const [flashSaved, setFlashSaved] = useState(false);
  const prevDirty = useRef(dirtyCount);
  const macOverlay = isDesktopShell() && isMacOS();

  useEffect(() => {
    if (prevDirty.current > 0 && dirtyCount === 0) {
      setFlashSaved(true);
      const t = window.setTimeout(() => setFlashSaved(false), 2200);
      prevDirty.current = dirtyCount;
      return () => window.clearTimeout(t);
    }
    prevDirty.current = dirtyCount;
  }, [dirtyCount]);

  useEffect(() => {
    if (!lastSavedAt) return;
    setFlashSaved(true);
    const t = window.setTimeout(() => setFlashSaved(false), 2200);
    return () => window.clearTimeout(t);
  }, [lastSavedAt]);

  const onSave = async () => {
    if (saving || dirtyCount === 0) return;
    setSaving(true);
    try {
      await flushDirty();
    } finally {
      setSaving(false);
    }
  };

  const statusChip = (() => {
    if (focusMode) return null;
    if (!vaultId) {
      return (
        <span className="rounded-full border border-[var(--border)] bg-white/[0.03] px-2.5 py-0.5 text-[11px] text-[var(--text-muted)]">
          No vault
        </span>
      );
    }
    if (dirtyCount > 0 || saving) {
      return (
        <button
          type="button"
          className="flex items-center gap-1.5 rounded-full border border-[rgba(255,159,10,0.4)] bg-[rgba(255,159,10,0.12)] px-2.5 py-0.5 text-[11px] font-medium text-[var(--warning)] transition-colors hover:bg-[rgba(255,159,10,0.2)]"
          title={`Unsaved changes — click to save (${formatShortcut("S")})`}
          aria-label={`Save ${dirtyCount} unsaved note${dirtyCount === 1 ? "" : "s"}`}
          disabled={saving}
          onClick={() => void onSave()}
        >
          <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-[var(--warning)]" />
          {saving
            ? "Saving…"
            : `Unsaved${dirtyCount > 1 ? ` · ${dirtyCount}` : ""}`}
          <Save size={12} className="opacity-80" />
        </button>
      );
    }
    // Single calm status — never pair "Saved" with "Demo · not on disk"
    if (mode === "demo") {
      return (
        <span
          className={cn(
            "hidden items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] font-medium sm:flex",
            flashSaved
              ? "border-[rgba(48,209,88,0.3)] bg-[rgba(48,209,88,0.1)] text-[var(--success)]"
              : "border-[rgba(255,159,10,0.28)] bg-[rgba(255,159,10,0.08)] text-[var(--warning)]",
          )}
          title="Demo vault — changes stay in this browser session only"
        >
          {flashSaved ? "Saved in session" : "Demo · in memory"}
        </span>
      );
    }
    if (lastExternalSync) {
      return (
        <span
          className="hidden items-center gap-1 rounded-full border border-[rgba(48,209,88,0.3)] bg-[rgba(48,209,88,0.1)] px-2.5 py-0.5 text-[11px] font-medium text-[var(--success)] sm:flex"
          title={new Date(lastExternalSync).toLocaleString()}
        >
          Live · {formatRelativeTime(lastExternalSync)}
        </span>
      );
    }
    if (mode === "fsa" || mode === "desktop") {
      return (
        <span
          className="hidden items-center gap-1 rounded-full border border-[rgba(48,209,88,0.25)] bg-[rgba(48,209,88,0.08)] px-2.5 py-0.5 text-[11px] text-[var(--success)] sm:flex"
          title={
            mode === "desktop"
              ? "Desktop vault — notes on disk"
              : "Watching folder — notes on disk"
          }
        >
          {flashSaved ? "Saved" : "On disk"}
        </span>
      );
    }
    // In-browser large test vault — never imply "on disk"
    if (isLargeMemoryVault(vaultId)) {
      return (
        <span
          className="hidden items-center gap-1 rounded-full border border-[rgba(255,159,10,0.28)] bg-[rgba(255,159,10,0.08)] px-2.5 py-0.5 text-[11px] font-medium text-[var(--warning)] sm:flex"
          title="Large test vault — in this browser session only (not a disk folder)"
        >
          {flashSaved ? "Saved in session" : "Test · in memory"}
        </span>
      );
    }
    return (
      <span className="hidden items-center gap-1 rounded-full border border-[rgba(48,209,88,0.25)] bg-[rgba(48,209,88,0.08)] px-2.5 py-0.5 text-[11px] text-[var(--success)] sm:flex">
        {flashSaved ? "Saved" : "Local"}
      </span>
    );
  })();

  return (
    <header
      className="titlebar-drag relative z-40 flex h-11 shrink-0 select-none items-center border-b border-[var(--border)] bg-[rgba(8,8,10,0.94)] px-3 backdrop-blur-xl"
      data-tauri-drag-region
    >
      <div
        className={macOverlay ? "w-[72px] shrink-0" : "w-3 shrink-0 sm:w-4"}
        aria-hidden
        data-tauri-drag-region
      />

      <div className="pointer-events-none absolute inset-0 hidden items-center justify-center sm:flex">
        <div className="flex items-center gap-2">
          <NexusWordmark size="sm" className="text-[var(--text-primary)]" />
          {vaultName && !focusMode ? (
            <>
              <span className="text-[var(--text-muted)]">·</span>
              <span className="text-[12.5px] text-[var(--text-secondary)]">
                {vaultName}
              </span>
            </>
          ) : null}
        </div>
      </div>

      <div className="titlebar-no-drag ml-auto flex items-center gap-2">
        {statusChip}
        {vaultId ? (
          <button
            type="button"
            className={`icon-btn h-8 w-8${focusMode ? " text-[var(--accent)]" : ""}`}
            title={
              focusMode
                ? `Exit focus mode (${formatShortcut(".")})`
                : `Focus mode (${formatShortcut(".")})`
            }
            aria-label={focusMode ? "Exit focus mode" : "Enter focus mode"}
            aria-pressed={focusMode}
            onClick={() => setFocusMode(!focusMode)}
          >
            <Focus size={15} />
          </button>
        ) : null}
        {!focusMode ? (
          <button
            type="button"
            className="icon-btn h-8 w-8"
            title="Keyboard shortcuts (?)"
            aria-label="Keyboard shortcuts"
            onClick={() =>
              window.dispatchEvent(new Event("nexus:open-shortcuts"))
            }
          >
            <Keyboard size={15} />
          </button>
        ) : null}
        {!focusMode ? (
          <button
            type="button"
            className="icon-btn h-8 w-8"
            title={`Settings (${formatShortcut(",")})`}
            aria-label="Open settings"
            onClick={() => setSettingsOpen(true)}
          >
            <Settings size={15} />
          </button>
        ) : null}
      </div>
    </header>
  );
}
