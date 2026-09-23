import { useEffect, useId, useRef, useState, useSyncExternalStore } from "react";
import { Settings, X, Cloud } from "lucide-react";
import { cn, formatRelativeTime } from "@/lib/utils";
import {
  ACCENT_PRESETS,
  NEXUS_VERSION,
  isValidHex,
  resolveAccentHex,
  usePrefsStore,
  type AccentPreset,
  type Density,
  type PhysicsIntensity,
  type ThemeMode,
} from "@/lib/prefs/preferences";
import {
  HOTKEY_LABELS,
  conflictingHotkeyId,
  eventToChord,
  listShortcutRows,
  type HotkeyId,
} from "@/lib/prefs/hotkeys";
import {
  CLOUD_SYNC_HINT,
  providerLabel,
  providerSyncHint,
  type CloudProvider,
} from "@/lib/cloud/oauth";
import { setFocusMode } from "@/lib/prefs/focus-mode";
import { NexusMark, NexusWordmark, NEXUS_NAME, NEXUS_TAGLINE } from "@/components/brand/NexusLogo";
import { useVaultStore } from "@/lib/vault/store";
import { rebuildDurableIndexFromNodes } from "@/lib/vault/durable-index";
import {
  invalidateIndexedSearch,
  rebuildIndexedSearch,
} from "@/lib/search/indexed-search";
import { ensureVaultIndex, vaultIndex } from "@/lib/vault/indexes";
import type { BodyCacheStats } from "@/lib/vault/body-cache";
import type { VaultMode } from "@/lib/vault/types";
import { formatShortcut, isAppleModPlatform, canOpenLocalVaultFolder } from "@/lib/platform";

function MemoryBudgetStatus({
  open,
  vaultId,
  mode,
}: {
  open: boolean;
  vaultId: string | null;
  mode: VaultMode;
}) {
  const dirtyCount = useVaultStore((s) => s.dirtyNoteIds.length);
  const activeNoteId = useVaultStore((s) => s.activeNoteId);
  const [bodyStats, setBodyStats] = useState<BodyCacheStats | null>(null);

  useEffect(() => {
    if (!open) return;
    const sample = () =>
      setBodyStats(useVaultStore.getState().getBodyMemoryStats());
    sample();
    const t = window.setInterval(sample, 1500);
    return () => clearInterval(t);
  }, [open, vaultId, mode, dirtyCount, activeNoteId]);

  return (
    <div className="mt-2 border-t border-[var(--border)] pt-2">
      <div className="text-[12px] font-medium text-[var(--text-secondary)]">
        Memory budget
      </div>
      <p className="mt-0.5 text-[12px] leading-snug text-[var(--text-muted)]">
        {!vaultId
          ? "Automatic when a folder vault is open"
          : !bodyStats || bodyStats.max === 0
            ? "Automatic · full in-memory (demo / browser vault)"
            : bodyStats.underPressure
              ? `Automatic · releasing pressure · In memory: ${bodyStats.loaded} / ${bodyStats.max} bodies (over soft cap) · Protected: ${bodyStats.protected} (active + unsaved) — unsaved notes stay loaded`
              : `Automatic · note text kept only for recent and open notes · In memory: ${bodyStats.loaded} / ${bodyStats.max} bodies · Protected: ${bodyStats.protected} (active + unsaved)`}
      </p>
    </div>
  );
}

export function SettingsPanel() {
  const open = usePrefsStore((s) => s.settingsOpen);
  const setOpen = usePrefsStore((s) => s.setSettingsOpen);
  const prefs = usePrefsStore();
  const updatePrefs = usePrefsStore((s) => s.updatePrefs);
  const resetPrefs = usePrefsStore((s) => s.resetPrefs);
  const vaultName = useVaultStore((s) => s.vaultName);
  const vaultPath = useVaultStore((s) => s.vaultPath);
  const mode = useVaultStore((s) => s.mode);
  const vaultId = useVaultStore((s) => s.vaultId);
  const lastExternalSync = useVaultStore((s) => s.lastExternalSync);
  const cloudSession = useVaultStore((s) => s.cloudSession);
  const connectCloud = useVaultStore((s) => s.connectCloud);
  const disconnectCloud = useVaultStore((s) => s.disconnectCloud);
  const openFolderAsVault = useVaultStore((s) => s.openFolderAsVault);
  const openLocked = useVaultStore((s) => s.connecting || s.indexFillBusy);
  const openConflictStudio = useVaultStore((s) => s.openConflictStudio);
  const getConflictItems = useVaultStore((s) => s.getConflictItems);
  const conflictCount = useSyncExternalStore(
    (onStoreChange) => useVaultStore.subscribe(onStoreChange),
    () => getConflictItems?.()?.length ?? 0,
    () => 0,
  );
  // Read published index count outside a mutating Zustand selector
  const noteCount = useSyncExternalStore(
    (onStoreChange) => useVaultStore.subscribe(onStoreChange),
    () => {
      ensureVaultIndex(useVaultStore.getState().nodes);
      return vaultIndex.noteCount;
    },
    () => 0,
  );

  const [customDraft, setCustomDraft] = useState(prefs.accentCustom);
  const [recordingHotkey, setRecordingHotkey] = useState<HotkeyId | null>(null);
  const titleId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) setCustomDraft(prefs.accentCustom);
  }, [open, prefs.accentCustom]);

  useEffect(() => {
    if (!open) return;
    const root = dialogRef.current;
    // Focus dialog container on open
    const prev = document.activeElement as HTMLElement | null;
    if (root) {
      if (!root.hasAttribute("tabindex")) root.tabIndex = -1;
      root.focus({ preventScroll: true });
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        setOpen(false);
        return;
      }
      // Simple focus trap — Tab cycles within dialog
      if (e.key !== "Tab" || !root) return;
      const focusable = root.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      );
      const list = Array.from(focusable).filter(
        (el) => el.offsetParent !== null || el === root,
      );
      if (list.length === 0) {
        e.preventDefault();
        root.focus();
        return;
      }
      const first = list[0];
      const last = list[list.length - 1];
      const active = document.activeElement as HTMLElement | null;
      if (e.shiftKey) {
        if (!active || active === first || !root.contains(active)) {
          e.preventDefault();
          last.focus();
        }
      } else if (!active || active === last || !root.contains(active)) {
        e.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      prev?.focus?.({ preventScroll: true });
    };
  }, [open, setOpen]);

  useEffect(() => {
    document.documentElement.dataset.nexusHotkeyCapture = recordingHotkey
      ? "1"
      : "0";
    if (!recordingHotkey) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        setRecordingHotkey(null);
        return;
      }
      const chord = eventToChord(e);
      if (!chord) return;
      e.preventDefault();
      e.stopPropagation();
      const next = { ...prefs.hotkeyOverrides, [recordingHotkey]: chord };
      updatePrefs({ hotkeyOverrides: next });
      setRecordingHotkey(null);
    };
    window.addEventListener("keydown", onKey, { capture: true });
    return () => {
      window.removeEventListener("keydown", onKey, { capture: true });
      document.documentElement.dataset.nexusHotkeyCapture = "0";
    };
  }, [recordingHotkey, prefs.hotkeyOverrides, updatePrefs]);

  if (!open) return null;

  const activeHex = resolveAccentHex(prefs);

  const setAccent = (preset: AccentPreset, custom?: string) => {
    if (preset === "custom" && custom) {
      updatePrefs({ accentPreset: "custom", accentCustom: custom });
    } else {
      updatePrefs({ accentPreset: preset });
    }
  };

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-4 sm:p-6">
      <button
        type="button"
        className="absolute inset-0 bg-black/55 backdrop-blur-[2px]"
        aria-label="Close settings"
        onClick={() => setOpen(false)}
      />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className="glass-elevated relative z-10 flex max-h-[min(720px,90dvh)] w-full max-w-[440px] flex-col overflow-hidden rounded-[var(--radius-xl)] border border-[var(--border)] shadow-[var(--shadow-elevated)] outline-none"
      >
        <div className="flex shrink-0 items-center gap-3 border-b border-[var(--border)] px-5 py-4">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-[rgba(255,255,255,0.08)] bg-white/[0.03] text-[var(--accent)]">
            <Settings size={16} />
          </div>
          <div className="min-w-0 flex-1">
            <h2 id={titleId} className="text-[15px] font-semibold tracking-tight">
              Settings
            </h2>
            <p className="text-[12px] text-[var(--text-muted)]">
              Preferences for this device
            </p>
          </div>
          <button
            type="button"
            className="icon-btn"
            onClick={() => setOpen(false)}
            aria-label="Close"
          >
            <X size={16} />
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-7 overflow-y-auto px-5 py-5">
          {/* Appearance */}
          <Section title="Appearance">
            <Label>Accent color</Label>
            <div className="mt-2 flex flex-wrap gap-2">
              {(Object.keys(ACCENT_PRESETS) as Exclude<AccentPreset, "custom">[]).map(
                (key) => {
                  const p = ACCENT_PRESETS[key];
                  const selected = prefs.accentPreset === key;
                  return (
                    <button
                      key={key}
                      type="button"
                      title={p.label}
                      onClick={() => setAccent(key)}
                      className={cn(
                        "flex h-9 items-center gap-2 rounded-full border px-3 text-[12.5px] transition",
                        selected
                          ? "border-[var(--accent)] bg-[var(--accent-dim)] text-[var(--text-primary)]"
                          : "border-[var(--border)] bg-white/[0.02] text-[var(--text-secondary)] hover:border-[rgba(255,255,255,0.14)]",
                      )}
                    >
                      <span
                        className="h-3.5 w-3.5 rounded-full shadow-[0_0_0_1px_rgba(255,255,255,0.12)]"
                        style={{ background: p.hex }}
                      />
                      {p.label}
                    </button>
                  );
                },
              )}
            </div>
            <div className="mt-3 flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  const hex = isValidHex(customDraft)
                    ? customDraft
                    : activeHex;
                  setAccent("custom", normalize(hex));
                  setCustomDraft(normalize(hex));
                }}
                className={cn(
                  "flex h-9 items-center gap-2 rounded-full border px-3 text-[12.5px] transition",
                  prefs.accentPreset === "custom"
                    ? "border-[var(--accent)] bg-[var(--accent-dim)]"
                    : "border-[var(--border)] bg-white/[0.02] text-[var(--text-secondary)]",
                )}
              >
                <span
                  className="h-3.5 w-3.5 rounded-full"
                  style={{ background: isValidHex(customDraft) ? customDraft : activeHex }}
                />
                Custom
              </button>
              <input
                className="h-9 min-w-0 flex-1 rounded-[10px] border border-[var(--border)] bg-white/[0.03] px-3 font-mono text-[12.5px] text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
                value={customDraft}
                placeholder="#00C8FF"
                spellCheck={false}
                onChange={(e) => {
                  const v = e.target.value;
                  setCustomDraft(v);
                  if (isValidHex(v)) {
                    updatePrefs({
                      accentPreset: "custom",
                      accentCustom: normalize(v),
                    });
                  }
                }}
                aria-label="Custom accent hex"
              />
            </div>

            <Label className="mt-5">Theme</Label>
            <Segmented
              className="mt-2"
              value={prefs.theme ?? "dark"}
              options={[
                { value: "dark", label: "Dark" },
                { value: "light", label: "Light" },
                { value: "system", label: "System" },
              ]}
              onChange={(v) => updatePrefs({ theme: v as ThemeMode })}
            />

            <Label className="mt-5">Interface density</Label>
            <Segmented
              className="mt-2"
              value={prefs.density}
              options={[
                { value: "comfortable", label: "Comfortable" },
                { value: "compact", label: "Compact" },
              ]}
              onChange={(v) => updatePrefs({ density: v as Density })}
            />

            <ToggleRow
              className="mt-4"
              label="Graph particles"
              description="Soft link particles on the graph"
              checked={prefs.graphParticles}
              onChange={(v) => updatePrefs({ graphParticles: v })}
            />
            <ToggleRow
              className="mt-3"
              label="Reduced motion"
              description="Minimize animations and transitions"
              checked={prefs.reducedMotion}
              onChange={(v) => updatePrefs({ reducedMotion: v })}
            />
            <ToggleRow
              className="mt-3"
              label="Focus mode"
              description={`Hide side panels for distraction-free writing (${formatShortcut(".")})`}
              checked={prefs.focusMode}
              onChange={(v) => {
                setFocusMode(v);
              }}
            />
          </Section>

          {/* Editor */}
          <Section title="Editor">
            <Label>Default mode</Label>
            <Segmented
              className="mt-2"
              value={prefs.defaultEditorMode}
              options={[
                { value: "visual", label: "Visual" },
                { value: "source", label: "Source" },
                { value: "split", label: "Split" },
              ]}
              onChange={(v) =>
                updatePrefs({
                  defaultEditorMode: v as "visual" | "source" | "split",
                })
              }
            />

            <Label className="mt-5">
              Font size
              <span className="ml-2 font-normal text-[var(--text-muted)]">
                {prefs.editorFontSize}px
              </span>
            </Label>
            <input
              type="range"
              min={13}
              max={20}
              step={1}
              value={prefs.editorFontSize}
              onChange={(e) =>
                updatePrefs({ editorFontSize: Number(e.target.value) })
              }
              className="mt-2 w-full accent-[var(--accent)]"
              aria-label="Editor font size"
            />

            <ToggleRow
              className="mt-4"
              label="Spell check"
              description="Underline misspellings in Visual and Source"
              checked={prefs.spellCheck}
              onChange={(v) => updatePrefs({ spellCheck: v })}
            />
          </Section>

          {/* Graph */}
          <Section title="Graph">
            <Label>Default view</Label>
            <Segmented
              className="mt-2"
              value={prefs.defaultGraphView}
              options={[
                { value: "panel", label: "Panel" },
                { value: "hidden", label: "Hidden" },
              ]}
              onChange={(v) =>
                updatePrefs({
                  defaultGraphView: v as "panel" | "hidden",
                })
              }
            />

            <Label className="mt-5">Physics intensity</Label>
            <Segmented
              className="mt-2"
              value={prefs.physicsIntensity}
              options={[
                { value: "calm", label: "Calm" },
                { value: "standard", label: "Standard" },
                { value: "energetic", label: "Energetic" },
              ]}
              onChange={(v) =>
                updatePrefs({ physicsIntensity: v as PhysicsIntensity })
              }
            />
          </Section>

          {/* Vault */}
          <Section title="Vault & Files">
            <ToggleRow
              label="Confirm before delete"
              description="Ask before removing notes or folders"
              checked={prefs.confirmDelete}
              onChange={(v) => updatePrefs({ confirmDelete: v })}
            />
            <ToggleRow
              className="mt-3"
              label="Open last vault on launch"
              description="Restore your previous local folder when possible"
              checked={prefs.openLastVault}
              onChange={(v) => updatePrefs({ openLastVault: v })}
            />
            <div className="mt-3 rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)]/60 px-3 py-2.5">
              <div className="text-[13px] font-medium text-[var(--text-primary)]">
                Vault scale
              </div>
              <p className="mt-0.5 text-[12px] leading-snug text-[var(--text-muted)]">
                Designed for large folders. Open is progressive (metadata first).
                Search uses an on-disk index on desktop.
                {noteCount > 0 ? (
                  <>
                    {" "}
                    This vault:{" "}
                    <span className="text-[var(--text-secondary)]">
                      {noteCount.toLocaleString()} notes
                    </span>
                    {mode === "demo"
                      ? " (demo — sample vault, not on disk)"
                      : mode === "local"
                        ? " (in-memory)"
                        : " (bodies load as you open notes)"}
                    .
                  </>
                ) : null}
              </p>
              <MemoryBudgetStatus open={open} vaultId={vaultId} mode={mode} />
            </div>
            <div className="mt-4">
              <div className="text-[13px] font-medium text-[var(--text-primary)]">
                Daily notes folder
              </div>
              <p className="mt-0.5 text-[12px] leading-snug text-[var(--text-muted)]">
                New daily pages are created here (one top-level folder)
              </p>
              <input
                type="text"
                className="mt-2 w-full rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] px-2.5 py-1.5 text-[13px] text-[var(--text-primary)] outline-none focus:ring-1 focus:ring-[var(--accent)]"
                value={prefs.dailyFolder}
                spellCheck={false}
                aria-label="Daily notes folder"
                onChange={(e) => updatePrefs({ dailyFolder: e.target.value })}
                onBlur={(e) => {
                  if (!e.target.value.trim()) {
                    updatePrefs({ dailyFolder: "Journal" });
                  }
                }}
              />
            </div>
            <div className="mt-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-[13px] font-medium text-[var(--text-primary)]">
                    Rebuild search index
                  </div>
                  <p className="mt-0.5 text-[12px] leading-snug text-[var(--text-muted)]">
                    Refresh titles and snippets if search looks stale
                  </p>
                </div>
                <button
                  type="button"
                  className="ghost-btn shrink-0 text-[12px]"
                  onClick={() => {
                    const st = useVaultStore.getState();
                    invalidateIndexedSearch();
                    rebuildIndexedSearch(st.nodes);
                    rebuildDurableIndexFromNodes(
                      st.vaultId,
                      st.nodes,
                      Boolean(st.vaultId),
                    );
                    st.setToast("Search index rebuilt");
                  }}
                >
                  Rebuild
                </button>
              </div>
            </div>
            <div className="mt-3">

              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-[13px] font-medium text-[var(--text-primary)]">
                    Launch note
                  </div>
                  <p className="mt-0.5 text-[12px] leading-snug text-[var(--text-muted)]">
                    Which note to open when a vault mounts
                  </p>
                </div>
                <select
                  className="shrink-0 rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] px-2 py-1.5 text-[12.5px] text-[var(--text-primary)] outline-none focus:ring-1 focus:ring-[var(--accent)]"
                  value={prefs.launchNoteMode ?? (prefs.openTodayOnLaunch ? "today" : "last")}
                  onChange={(e) =>
                    updatePrefs({
                      launchNoteMode: e.target.value as
                        | "today"
                        | "last"
                        | "smart",
                    })
                  }
                >
                  <option value="today">Today's daily</option>
                  <option value="last">Last note</option>
                  <option value="smart">Smart (daily habit)</option>
                </select>
              </div>
            </div>
          </Section>

          <Section title="Agents & Grok">
            <p className="text-[12.5px] leading-relaxed text-[var(--text-secondary)]">
              Humans and agents share the same folder of Markdown. Point Grok,
              Cursor, or any script at this vault. Nexus watches the disk,
              shows writes in Pulse, and opens Conflict Studio when you and an
              agent edit the same note at once.
            </p>
            <ol className="mt-3 list-decimal space-y-1.5 pl-4 text-[12.5px] leading-relaxed text-[var(--text-secondary)]">
              <li>Open a real folder (or stay in the demo vault).</li>
              <li>
                Have an agent write a <span className="font-mono">.md</span> file
                — or run <strong>Simulate agent write</strong> from the vault
                menu / command palette.
              </li>
              <li>
                Open Pulse. To practice a conflict, edit{" "}
                <span className="font-mono">Systems/Hermes Pulse.md</span> then
                simulate again — Keep mine / Take theirs.
              </li>
            </ol>
            {vaultId ? (
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  className="rounded-lg border border-[var(--border)] bg-[var(--fill-subtle)] px-3 py-1.5 text-[12.5px] text-[var(--text-primary)] hover:border-[var(--accent)]"
                  onClick={() => {
                    useVaultStore.getState().simulateHermesWrite();
                    useVaultStore.getState().openPulseRail?.();
                    usePrefsStore.getState().setSettingsOpen(false);
                  }}
                >
                  Simulate agent write
                </button>
                <button
                  type="button"
                  className="rounded-lg border border-[var(--border)] bg-[var(--fill-subtle)] px-3 py-1.5 text-[12.5px] text-[var(--text-primary)] hover:border-[var(--accent)]"
                  onClick={() => {
                    useVaultStore.getState().practiceAgentConflict();
                    useVaultStore.getState().openPulseRail?.();
                    usePrefsStore.getState().setSettingsOpen(false);
                  }}
                >
                  Practice conflict
                </button>
              </div>
            ) : (
              <p className="mt-3 text-[12px] text-[var(--text-muted)]">
                Open a vault to run the agent demo.
              </p>
            )}
            <p className="mt-3 text-[11.5px] leading-snug text-[var(--text-muted)]">
              No API keys live in Nexus. Grok Bot and external agents write
              files on disk. Keep notes in clean Markdown so diffs stay honest.
            </p>
          </Section>

          {/* Sync */}
          <Section title="Sync">
            <p className="text-[12.5px] leading-relaxed text-[var(--text-secondary)]">
              {CLOUD_SYNC_HINT}
            </p>
            <div className="mt-3 rounded-[12px] border border-[var(--border)] bg-[var(--fill-subtle)] px-3 py-2.5">
              <div className="flex items-center gap-2 text-[12.5px] font-medium text-[var(--text-primary)]">
                <Cloud size={14} className="text-[var(--accent)]" />
                {!vaultId
                  ? "No vault open"
                  : mode === "demo"
                    ? "Demo · this browser only"
                    : mode === "fsa" || mode === "desktop"
                      ? "Watching folder"
                      : "In-memory vault"}
              </div>
              <p className="mt-1 text-[12px] leading-snug text-[var(--text-muted)]">
                {vaultId && (mode === "fsa" || mode === "desktop")
                  ? lastExternalSync
                    ? `Last disk change ${formatRelativeTime(lastExternalSync)}`
                    : "Live watcher on — Dropbox/Drive/iCloud writes appear here."
                  : "Open a synced folder to turn on built-in disk sync."}
              </p>
              {conflictCount > 0 ? (
                <button
                  type="button"
                  className="mt-2 text-[12px] font-medium text-[var(--warning)] hover:underline"
                  onClick={() => openConflictStudio?.()}
                >
                  {conflictCount} open conflict{conflictCount === 1 ? "" : "s"} — review
                </button>
              ) : null}
            </div>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {(
                [
                  "dropbox",
                  "google",
                  "onedrive",
                  "icloud",
                  "syncthing",
                ] as CloudProvider[]
              ).map((p) => {
                const active = cloudSession?.provider === p;
                return (
                  <button
                    key={p}
                    type="button"
                    title={providerSyncHint(p)}
                    className={cn(
                      "rounded-full border px-2.5 py-1 text-[11.5px] transition",
                      active
                        ? "border-[var(--accent)] bg-[var(--accent-dim)] text-[var(--text-primary)]"
                        : "border-[var(--border)] text-[var(--text-secondary)] hover:border-[var(--accent)]",
                    )}
                    onClick={() => void connectCloud(p)}
                  >
                    {providerLabel(p)}
                  </button>
                );
              })}
            </div>
            {cloudSession ? (
              <p className="mt-2 text-[12px] text-[var(--text-muted)]">
                Preferred: {cloudSession.label}.{" "}
                <button
                  type="button"
                  className="text-[var(--accent)] hover:underline"
                  onClick={() => disconnectCloud()}
                >
                  Clear
                </button>
              </p>
            ) : null}
            <button
              type="button"
              className="ghost-btn mt-3 min-h-9 w-full justify-center"
              disabled={!canOpenLocalVaultFolder() || openLocked}
              onClick={() => {
                if (openLocked) return;
                void openFolderAsVault();
              }}
            >
              Open a synced folder…
            </button>
          </Section>

          {/* Keyboard */}
          <Section title="Keyboard">
            <p className="mb-2 text-[12px] leading-snug text-[var(--text-muted)]">
              Click a chord to remap. Esc cancels. Desktop app menus keep factory
              shortcuts.
            </p>
            <ul className="space-y-1">
              {listShortcutRows(prefs.hotkeyOverrides).map((s) => {
                const clash = prefs.hotkeyOverrides?.[s.id]
                  ? conflictingHotkeyId(
                      s.id,
                      prefs.hotkeyOverrides[s.id]!,
                      prefs.hotkeyOverrides,
                    )
                  : null;
                return (
                  <li
                    key={s.id}
                    className="flex items-center justify-between gap-3 rounded-lg px-1 py-1 text-[13px]"
                  >
                    <span className="min-w-0 text-[var(--text-secondary)]">
                      {s.action}
                      {clash ? (
                        <span className="ml-1 text-[11px] text-[var(--warning)]">
                          also {HOTKEY_LABELS[clash]}
                        </span>
                      ) : null}
                    </span>
                    <div className="flex shrink-0 items-center gap-1">
                      {s.remapped ? (
                        <button
                          type="button"
                          className="text-[10px] text-[var(--text-muted)] hover:text-[var(--accent)]"
                          onClick={() => {
                            const next = { ...prefs.hotkeyOverrides };
                            delete next[s.id];
                            updatePrefs({ hotkeyOverrides: next });
                          }}
                        >
                          Reset
                        </button>
                      ) : null}
                      <button
                        type="button"
                        className={cn(
                          "rounded-md border px-2 py-0.5 font-mono text-[11px]",
                          recordingHotkey === s.id
                            ? "border-[var(--accent)] bg-[var(--accent-dim)] text-[var(--accent)]"
                            : "border-[var(--border)] bg-[var(--fill-subtle)] text-[var(--text-primary)]",
                        )}
                        onClick={() =>
                          setRecordingHotkey((cur) =>
                            cur === s.id ? null : s.id,
                          )
                        }
                      >
                        {recordingHotkey === s.id ? "Press keys…" : s.keys}
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          </Section>

          {/* Help */}
          <Section title="Help">
            <div className="space-y-3 text-[12.5px] leading-relaxed text-[var(--text-secondary)]">
              <HelpItem
                title="Vaults"
                body="A vault is a normal folder of Markdown files. Open… picks an existing folder. New Vault… creates one with a Welcome note."
              />
              <HelpItem
                title="Editing"
                body={`Visual is the rich editor. Source is clean Markdown. Preview is Source + live render. ${formatShortcut("E")} cycles them. Type [[ to link, ${formatShortcut("L", { shift: true })} to insert a link, ${formatShortcut("F")} to find in the focused pane.`}
              />
              <HelpItem
                title="Daily notes & templates"
                body={`${formatShortcut("D")} opens today's daily page. Create Meeting, Idea, or Project notes from the command palette or file tree context menu.`}
              />
              <HelpItem
                title="Search & Ask"
                body={`${formatShortcut("K")} opens search. Prefix ask: or ?  for a grounded answer with citations. Operators: path: folder: file: #tag -exclude is:orphan. Trash restore is in the sidebar, the delete toast, and ${formatShortcut("K")} trash / is:deleted.`}
              />
              <HelpItem
                title="Graph"
                body="The graph maps [[wikilinks]] and a folder map for large vaults: folder spheres open a level; notes open and show links near the active note. Small vaults still show every note. Click a node to open it."
              />
              <HelpItem
                title="Cloud"
                body="Built-in sync watches your vault folder. Put it in Dropbox, Drive, OneDrive, iCloud, or Syncthing — no Nexus account. Conflicts open in Conflict Studio."
              />
              <HelpItem
                title="Hermes, Grok & agents"
                body={`External apps edit the same .md files. Pulse lists writes. Conflict Studio resolves overlaps. Practice agent conflict from the vault menu, Pulse, Settings → Agents, or ${formatShortcut("K")}.`}
              />
              <HelpItem
                title="Desktop"
                body={
                  isAppleModPlatform()
                    ? `The desktop app (Tauri) opens a real folder and watches it. Reveal in Finder shows that folder. Open Settings with ${formatShortcut(",")}.`
                    : `The desktop app (Tauri) opens a real folder and watches it. Reveal in your file manager shows that folder. Open Settings with ${formatShortcut(",")}.`
                }
              />
              <HelpItem
                title="Local folder (browser)"
                body="Chrome or Edge: Open… uses the File System Access API and remembers the directory handle in IndexedDB. After a reload the browser still asks you to re-grant access — that is a browser permission gate, not a Nexus account. The desktop app opens the same folder directly."
              />
            </div>
            <p className="mt-3 text-[11.5px] text-[var(--text-muted)]">
              Everyday reference — deeper guides can grow as the product matures.
            </p>
          </Section>

          {/* About */}
          <Section title="About">
            <div className="flex items-start gap-3 rounded-[14px] border border-[var(--border)] bg-white/[0.02] p-3.5">
              <NexusMark size={36} className="text-[var(--text-primary)]" />
              <div className="min-w-0">
                <NexusWordmark size="md" showMark={false} />
                <div className="text-[12.5px] text-[var(--accent)]">
                  {NEXUS_TAGLINE}
                </div>
                <p className="mt-1.5 text-[12.5px] leading-snug text-[var(--text-secondary)]">
                  Local-first Markdown notes for humans and agents.
                </p>
                <div className="mt-1 text-[12px] text-[var(--text-muted)]">
                  Version {NEXUS_VERSION}
                </div>
              </div>
            </div>
            {vaultId ? (
              <div className="mt-3 space-y-1 text-[12.5px] text-[var(--text-secondary)]">
                <div>
                  <span className="text-[var(--text-muted)]">Vault · </span>
                  {vaultName || "Untitled"}
                </div>
                <div className="truncate font-mono text-[11px] text-[var(--text-muted)]">
                  {vaultPath || mode}
                </div>
                <div>
                  <span className="text-[var(--text-muted)]">Notes · </span>
                  {noteCount}
                </div>
              </div>
            ) : (
              <p className="mt-3 text-[12.5px] text-[var(--text-muted)]">
                No vault open
              </p>
            )}
          </Section>

          <button
            type="button"
            className="ghost-btn w-full justify-center text-[12.5px]"
            onClick={() => {
              resetPrefs();
              setCustomDraft(DEFAULT_CUSTOM);
            }}
          >
            Reset to defaults
          </button>
        </div>
      </div>
    </div>
  );
}

const DEFAULT_CUSTOM = "#00C8FF";

function normalize(hex: string): string {
  const h = hex.trim();
  return h.startsWith("#") ? h.toUpperCase() : `#${h.toUpperCase()}`;
}

function HelpItem({
  title,
  body,
}: {
  title: string;
  body: string;
}) {
  return (
    <div className="rounded-[12px] border border-[var(--border)] bg-white/[0.02] px-3 py-2.5">
      <div className="text-[12.5px] font-semibold text-[var(--text-primary)]">
        {title}
      </div>
      <p className="mt-1 text-[12px] leading-snug text-[var(--text-muted)]">
        {body}
      </p>
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <h3 className="mb-3 text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--text-muted)]">
        {title}
      </h3>
      {children}
    </section>
  );
}

function Label({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "text-[12.5px] font-medium text-[var(--text-secondary)]",
        className,
      )}
    >
      {children}
    </div>
  );
}

function Segmented({
  value,
  options,
  onChange,
  className,
}: {
  value: string;
  options: { value: string; label: string }[];
  onChange: (v: string) => void;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex rounded-[10px] border border-[var(--border)] bg-white/[0.02] p-0.5",
        className,
      )}
    >
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={cn(
            "min-h-8 flex-1 rounded-[8px] px-2 text-[12.5px] font-medium transition",
            value === o.value
              ? "bg-[var(--accent-dim)] text-[var(--text-primary)] shadow-[inset_0_0_0_1px_var(--accent)]"
              : "text-[var(--text-muted)] hover:text-[var(--text-secondary)]",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function ToggleRow({
  label,
  description,
  checked,
  onChange,
  className,
}: {
  label: string;
  description?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  className?: string;
}) {
  const labelId = useId();
  const descId = useId();
  return (
    <div
      className={cn(
        "flex items-center justify-between gap-3 rounded-[12px] border border-transparent px-0.5 py-1",
        className,
      )}
    >
      <div className="min-w-0">
        <div id={labelId} className="text-[13px] font-medium text-[var(--text-primary)]">
          {label}
        </div>
        {description ? (
          <div id={descId} className="text-[12px] text-[var(--text-muted)]">
            {description}
          </div>
        ) : null}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-labelledby={labelId}
        aria-describedby={description ? descId : undefined}
        onClick={() => onChange(!checked)}
        className={cn(
          "relative h-6 w-11 shrink-0 rounded-full transition-colors duration-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2",
          checked ? "bg-[var(--accent)]" : "bg-white/[0.12]",
        )}
      >
        <span
          className={cn(
            "absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform duration-200",
            checked && "translate-x-5",
          )}
        />
      </button>
    </div>
  );
}
