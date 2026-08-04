import { useEffect } from "react";
import { useVaultStore } from "@/lib/vault/store";
import { cn } from "@/lib/utils";

function toastVariant(message: string): "neutral" | "success" | "error" | "warning" {
  const m = message.toLowerCase();
  if (
    m.includes("could not") ||
    m.includes("failed") ||
    m.includes("error") ||
    m.includes("conflict")
  ) {
    return "error";
  }
  if (m.includes("saved") || m.includes("created") || m.includes("restored")) {
    return "success";
  }
  if (m.includes("updated from disk") || m.includes("external")) {
    return "warning";
  }
  return "neutral";
}

export function Toast() {
  const toast = useVaultStore((s) => s.toast);
  const toastAction = useVaultStore((s) => s.toastAction);
  const setToast = useVaultStore((s) => s.setToast);
  const openPulseRail = useVaultStore((s) => s.openPulseRail);

  useEffect(() => {
    if (!toast) return;
    const hasAction = toastAction?.kind === "open-pulse";
    const ms = hasAction
      ? 5000
      : toastVariant(toast) === "error" || toastVariant(toast) === "warning"
        ? 4200
        : 2600;
    const t = setTimeout(() => setToast(null), ms);
    return () => clearTimeout(t);
  }, [toast, toastAction, setToast]);

  if (!toast) return null;

  const variant = toastVariant(toast);
  const showOpenPulse = toastAction?.kind === "open-pulse";

  return (
    <div className="pointer-events-none fixed bottom-6 left-1/2 z-[120] -translate-x-1/2">
      <div
        role="status"
        aria-live={variant === "error" ? "assertive" : "polite"}
        aria-atomic="true"
        className={cn(
          "flex items-center gap-2.5 rounded-full border px-4 py-2 text-[13px] font-medium text-[var(--text-primary)] shadow-[0_12px_40px_rgba(0,0,0,0.45)]",
          "bg-[var(--bg-elevated,#16161A)]",
          variant === "success" &&
            "border-[rgba(48,209,88,0.35)] shadow-[0_0_20px_rgba(48,209,88,0.12)]",
          variant === "error" &&
            "border-[rgba(255,69,58,0.4)] shadow-[0_0_20px_rgba(255,69,58,0.12)]",
          variant === "warning" &&
            "border-[rgba(255,159,10,0.35)] shadow-[0_0_20px_rgba(255,159,10,0.1)]",
          variant === "neutral" && "border-[var(--border)]",
        )}
      >
        <span>{toast}</span>
        {showOpenPulse ? (
          <button
            type="button"
            className="pointer-events-auto shrink-0 rounded-full border border-[rgba(0,200,255,0.4)] bg-[rgba(0,200,255,0.12)] px-2.5 py-0.5 text-[11.5px] font-semibold text-[var(--accent)] transition-colors hover:bg-[rgba(0,200,255,0.2)]"
            onClick={() => {
              openPulseRail();
              setToast(null);
            }}
          >
            {toastAction?.label ?? "Open Pulse"}
          </button>
        ) : null}
      </div>
    </div>
  );
}
