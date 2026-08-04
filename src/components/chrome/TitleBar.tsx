import { Focus, Settings, Save } from "lucide-react";
import { useVaultStore } from "@/lib/vault/store";
import { formatRelativeTime } from "@/lib/utils";
import { NexusWordmark } from "@/components/brand/NexusLogo";
import { usePrefsStore } from "@/lib/prefs/preferences";
import { setFocusMode } from "@/lib/prefs/focus-mode";
import { formatShortcut, isDesktopShell, isMacOS } from "@/lib/platform";

/** Window chrome: branding + status. Native traffic lights live in the OS bar. */
export function TitleBar() {
  const vaultName = useVaultStore((s) => s.vaultName);
  const mode = useVaultStore((s) => s.mode);
  const lastExternalSync = useVaultStore((s) => s.lastExternalSync);
  const vaultId = useVaultStore((s) => s.vaultId);
  const dirtyCount = useVaultStore((s) => s.dirtyNoteIds.length);
  const flushDirty = useVaultStore((s) => s.flushDirty);
  const setSettingsOpen = usePrefsStore((s) => s.setSettingsOpen);
  const focusMode = usePrefsStore((s) => s.focusMode);
  // Traffic-light spacer only on macOS overlay titlebar (not Win/Linux Tauri)
  const macOverlay = isDesktopShell() && isMacOS();

  return (
    <header
      className="titlebar-drag relative z-40 flex h-11 shrink-0 select-none items-center border-b border-[var(--border)] bg-[rgba(8,8,10,0.94)] px-3 backdrop-blur-xl"
      data-tauri-drag-region
    >
      {/* Wave P: spacer only for macOS traffic lights under Overlay titlebar */}
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
              <span className="text-[12.5px] text-[var(--text-secondary)]">{vaultName}</span>
            </>
          ) : null}
        </div>
      </div>

      <div className="titlebar-no-drag ml-auto flex items-center gap-2">
        {/* Wave A: dirty / unsaved affordance */}
        {!focusMode && vaultId && dirtyCount > 0 ? (
          <button
            type="button"
            className="flex items-center gap-1.5 rounded-full border border-[rgba(255,159,10,0.4)] bg-[rgba(255,159,10,0.12)] px-2.5 py-0.5 text-[11px] font-medium text-[var(--warning)]"
            title="Unsaved changes — click to save"
            aria-label={`Save ${dirtyCount} unsaved note${dirtyCount === 1 ? "" : "s"}`}
            onClick={() => void flushDirty()}
          >
            <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-[var(--warning)]" />
            Unsaved{dirtyCount > 1 ? ` · ${dirtyCount}` : ""}
            <Save size={12} className="opacity-80" />
          </button>
        ) : null}
        {!focusMode ? (
          !vaultId ? (
            <span className="rounded-full border border-[var(--border)] bg-white/[0.03] px-2.5 py-0.5 text-[11px] text-[var(--text-muted)]">
              No vault
            </span>
          ) : lastExternalSync ? (
            <span
              className="rounded-full border border-[rgba(48,209,88,0.3)] bg-[rgba(48,209,88,0.1)] px-2.5 py-0.5 text-[11px] font-medium text-[var(--success)]"
              title={new Date(lastExternalSync).toLocaleString()}
            >
              Live · {formatRelativeTime(lastExternalSync)}
            </span>
          ) : mode === "fsa" || mode === "desktop" ? (
            <span className="rounded-full border border-[color-mix(in_srgb,var(--accent)_25%,transparent)] bg-[var(--accent-dim)] px-2.5 py-0.5 text-[11px] font-medium text-[var(--accent)]">
              {mode === "desktop" ? "Desktop vault" : "Watching disk"}
            </span>
          ) : mode === "demo" ? (
            <span className="rounded-full border border-[rgba(255,159,10,0.3)] bg-[rgba(255,159,10,0.1)] px-2.5 py-0.5 text-[11px] font-medium text-[var(--warning)]">
              Demo · not saved to disk
            </span>
          ) : (
            <span className="rounded-full border border-[var(--border)] bg-white/[0.03] px-2.5 py-0.5 text-[11px] text-[var(--text-muted)]">
              Local · offline
            </span>
          )
        ) : null}
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
