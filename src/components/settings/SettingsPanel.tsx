import { useEffect, useId, useState } from "react";
import { Settings, X } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  ACCENT_PRESETS,
  NEXUS_VERSION,
  SHORTCUTS,
  isValidHex,
  resolveAccentHex,
  usePrefsStore,
  type AccentPreset,
  type Density,
  type PhysicsIntensity,
} from "@/lib/prefs/preferences";
import { NexusMark, NexusWordmark, NEXUS_NAME, NEXUS_TAGLINE } from "@/components/brand/NexusLogo";
import { useVaultStore } from "@/lib/vault/store";

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
  const noteCount = useVaultStore(
    (s) => Object.values(s.nodes).filter((n) => n.kind === "note").length,
  );

  const [customDraft, setCustomDraft] = useState(prefs.accentCustom);
  const titleId = useId();

  useEffect(() => {
    if (open) setCustomDraft(prefs.accentCustom);
  }, [open, prefs.accentCustom]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        setOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, setOpen]);

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
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="glass-elevated relative z-10 flex max-h-[min(720px,90dvh)] w-full max-w-[440px] flex-col overflow-hidden rounded-[18px] border border-[var(--border)] shadow-[var(--shadow-elevated)]"
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
              ]}
              onChange={(v) =>
                updatePrefs({
                  defaultEditorMode: v as "visual" | "source",
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
              description="Browser spellcheck in Source mode"
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
          </Section>

          {/* Keyboard */}
          <Section title="Keyboard">
            <ul className="space-y-1.5">
              {SHORTCUTS.map((s) => (
                <li
                  key={s.keys}
                  className="flex items-center justify-between gap-3 rounded-lg px-1 py-1.5 text-[13px]"
                >
                  <span className="text-[var(--text-secondary)]">{s.action}</span>
                  <kbd className="shrink-0 rounded-md border border-[var(--border)] bg-white/[0.04] px-2 py-0.5 font-mono text-[11px] text-[var(--text-primary)]">
                    {s.keys}
                  </kbd>
                </li>
              ))}
            </ul>
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
  return (
    <label
      className={cn(
        "flex cursor-pointer items-center justify-between gap-3 rounded-[12px] border border-transparent px-0.5 py-1",
        className,
      )}
    >
      <div className="min-w-0">
        <div className="text-[13px] font-medium text-[var(--text-primary)]">
          {label}
        </div>
        {description ? (
          <div className="text-[12px] text-[var(--text-muted)]">{description}</div>
        ) : null}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={cn(
          "relative h-6 w-11 shrink-0 rounded-full transition-colors duration-200",
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
    </label>
  );
}
