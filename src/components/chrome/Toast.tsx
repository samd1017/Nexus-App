import { useEffect } from "react";
import { useVaultStore } from "@/lib/vault/store";
import { cn } from "@/lib/utils";

function toastVariant(message: string): "neutral" | "success" | "error" | "warning" {
  const m = message.toLowerCase();
  if (
    m.includes("could not") ||
    m.includes("couldn't") ||
    m.includes("failed") ||
    m.includes("error") ||
    m.includes("conflict") ||
    m.includes("permission")
  ) {
    return "error";
  }
  if (m.includes("saved") || m.includes("created") || m.includes("restored")) {
    return "success";
  }
  if (m.includes("updated from disk") || m.includes("external") || m.includes("still opening")) {
    return "warning";
  }
  return "neutral";
}

export function Toast() {
  const toast = useVaultStore((s) => s.toast);
  const toastAction = useVaultStore((s) => s.toastAction);
  const setToast = useVaultStore((s) => s.setToast);
  const openPulseRail = useVaultStore((s) => s.openPulseRail);
  const restoreTrash = useVaultStore((s) => s.restoreTrash);

  useEffect(() => {
    if (!toast) return;
    const hasAction = Boolean(toastAction);
    const trashStatus = toast.startsWith("Moved to Trash.");
    const ms = hasAction || trashStatus
      ? 7000
      : toastVariant(toast) === "error" || toastVariant(toast) === "warning"
        ? 4200
        : 2600;
    const t = setTimeout(() => setToast(null), ms);
    return () => clearTimeout(t);
  }, [toast, toastAction, setToast]);

  if (!toast) return null;

  const variant = toastVariant(toast);
  const actionKind = toastAction?.kind;
  const trashStatus = toast.startsWith("Moved to Trash.");

  return (
    <div className="pointer-events-none fixed bottom-[max(1.5rem,env(safe-area-inset-bottom))] left-1/2 z-[120] -translate-x-1/2">
      <div
        key={toast}
        role="status"
        aria-live={variant === "error" ? "assertive" : "polite"}
        aria-atomic="true"
        data-testid={trashStatus ? "trash-status" : undefined}
        data-trash-status={trashStatus ? "1" : undefined}
        className={cn(
          "nexus-toast-in pointer-events-auto flex items-center gap-2.5 rounded-full border px-4 py-2 text-[13px] font-medium text-[var(--text-primary)] shadow-[0_12px_40px_rgba(0,0,0,0.45)]",
          "bg-[var(--bg-elevated,#16161A)]",
          variant === "success" &&
            "border-[rgba(48,209,88,0.35)] shadow-[0_0_20px_rgba(48,209,88,0.12)]",
          variant === "error" &&
            "border-[rgba(255,69,58,0.4)] shadow-[0_0_20px_rgba(255,69,58,0.12)]",
          variant === "warning" &&
            "border-[rgba(255,159,10,0.35)] shadow-[0_0_20px_rgba(255,159,10,0.1)]",
          variant === "neutral" && "border-[var(--border)]",
          trashStatus &&
            "border-2 border-[#5ad8ff] bg-black px-5 py-3 text-[16px] font-semibold text-white",
        )}
      >
        <span>{toast}</span>
        {actionKind === "open-pulse" ? (
          <button
            type="button"
            className="pointer-events-auto shrink-0 rounded-full border border-[color-mix(in_srgb,var(--accent)_40%,transparent)] bg-[var(--accent-dim)] px-2.5 py-0.5 text-[11.5px] font-semibold text-[var(--accent)] transition-colors hover:bg-[color-mix(in_srgb,var(--accent)_20%,transparent)]"
            onClick={() => {
              openPulseRail();
              setToast(null);
            }}
          >
            {toastAction?.label ?? "Open Pulse"}
          </button>
        ) : null}
        {actionKind === "restore-trash" && toastAction?.kind === "restore-trash" ? (
          <button
            type="button"
            className="pointer-events-auto shrink-0 rounded-full border border-[color-mix(in_srgb,var(--accent)_40%,transparent)] bg-[var(--accent-dim)] px-2.5 py-0.5 text-[11.5px] font-semibold text-[var(--accent)] transition-colors hover:bg-[color-mix(in_srgb,var(--accent)_20%,transparent)]"
            onClick={() => {
              const path = toastAction.trashPath;
              void restoreTrash(path).then((ok) => {
                if (!ok) return;
                setToast(null);
              });
            }}
          >
            {toastAction.label}
          </button>
        ) : null}
      </div>
    </div>
  );
}
