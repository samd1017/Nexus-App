import { useEffect, useState } from "react";
import { Network, Search, Link2, X, Sparkles } from "lucide-react";
import { useVaultStore } from "@/lib/vault/store";
import {
  isFirstRunCoachDone,
  markFirstRunCoachDone,
} from "@/lib/prefs/first-run";
import { formatShortcut } from "@/lib/platform";
import { toggleGraphForViewport } from "@/lib/layout/viewport";

/**
 * Lightweight first-hour coach — appears once after the first vault opens.
 * Teaches the three moves that make Nexus feel magical.
 */
export function FirstRunCoach() {
  const vaultId = useVaultStore((s) => s.vaultId);
  const mode = useVaultStore((s) => s.mode);
  const graphMode = useVaultStore((s) => s.settings.graphMode);
  const commandOpen = useVaultStore((s) => s.commandOpen);
  const setCommandOpen = useVaultStore((s) => s.setCommandOpen);
  const setToast = useVaultStore((s) => s.setToast);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!vaultId) {
      setVisible(false);
      return;
    }
    if (isFirstRunCoachDone()) {
      setVisible(false);
      return;
    }
    const t = window.setTimeout(() => setVisible(true), 700);
    return () => window.clearTimeout(t);
  }, [vaultId]);

  // Don't cover fullscreen graph or the command palette
  if (!visible || !vaultId || graphMode === "fullscreen" || commandOpen) return null;

  const dismiss = () => {
    markFirstRunCoachDone();
    setVisible(false);
  };

  const steps = [
    {
      icon: Search,
      label: "Search or ask",
      hint: formatShortcut("K"),
      action: () => {
        setCommandOpen(true);
      },
    },
    {
      icon: Link2,
      label: "Follow a heading link",
      hint: "[[Note#Heading]]",
      action: () => {
        setToast("Click [[Note#Heading]] — or Alt-click to open beside");
        dismiss();
      },
    },
    {
      icon: Network,
      label: "Graph + Pulse",
      hint: formatShortcut("G"),
      action: () => {
        toggleGraphForViewport();
        dismiss();
      },
    },
  ];

  return (
    <div
      className="pointer-events-none fixed inset-x-0 bottom-0 z-[95] flex justify-center px-3 pb-[max(4.75rem,calc(3.25rem+env(safe-area-inset-bottom)))] sm:pb-5"
      role="dialog"
      aria-label="Quick tour"
    >
      <div className="pointer-events-auto first-run-coach glass-elevated w-full max-w-xl overflow-hidden rounded-[16px] border border-[rgba(0,200,255,0.22)] shadow-[0_20px_60px_rgba(0,0,0,0.55),0_0_40px_rgba(0,200,255,0.08)]">
        <div className="flex items-start gap-3 border-b border-[var(--border)] px-4 py-3">
          <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-[rgba(0,200,255,0.12)] text-[var(--accent)]">
            <Sparkles size={16} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-[13.5px] font-semibold text-[var(--text-primary)]">
              Three moves. Then it sticks.
            </div>
            <p className="mt-0.5 text-[12px] leading-relaxed text-[var(--text-secondary)]">
              {mode === "demo"
                ? "Search the vault. Follow a [[link]]. Open the graph and fly."
                : "Search or ask. Link a heading. Open the graph when you want the neighborhood."}
            </p>
          </div>
          <button
            type="button"
            className="icon-btn h-8 w-8 shrink-0"
            aria-label="Dismiss tour"
            onClick={dismiss}
          >
            <X size={15} />
          </button>
        </div>
        <div className="grid grid-cols-1 gap-1 p-2 sm:grid-cols-3">
          {steps.map(({ icon: Icon, label, hint, action }) => (
            <button
              key={label}
              type="button"
              className="flex items-center gap-2.5 rounded-[12px] px-3 py-2.5 text-left transition-colors hover:bg-white/[0.04]"
              onClick={() => {
                action();
              }}
            >
              <Icon size={15} className="shrink-0 text-[var(--accent)]" />
              <span className="min-w-0 flex-1">
                <span className="block text-[12.5px] font-medium text-[var(--text-primary)]">
                  {label}
                </span>
                <span className="font-mono text-[11px] text-[var(--text-muted)]">
                  {hint}
                </span>
              </span>
            </button>
          ))}
        </div>
        <div className="flex items-center justify-between gap-2 border-t border-[var(--border)] px-4 py-2.5">
          <span className="text-[11px] text-[var(--text-muted)]">
            Press{" "}
            <kbd className="rounded border border-[var(--border)] bg-white/[0.03] px-1 font-mono text-[10px]">
              ?
            </kbd>{" "}
            for all shortcuts
          </span>
          <button
            type="button"
            className="primary-btn min-h-8 px-3 text-[12px]"
            onClick={dismiss}
          >
            Got it
          </button>
        </div>
      </div>
    </div>
  );
}
