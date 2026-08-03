import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";

type Props = {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

/** In-app confirm — window.confirm is blocked in many embedded previews. */
export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  danger = false,
  onConfirm,
  onCancel,
}: Props) {
  const firstBtnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    // Focus first button (Cancel) when dialog opens
    const t = window.setTimeout(() => {
      firstBtnRef.current?.focus({ preventScroll: true });
    }, 0);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        onCancel();
      }
      if (e.key === "Enter") {
        e.preventDefault();
        e.stopPropagation();
        onConfirm();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => {
      window.clearTimeout(t);
      window.removeEventListener("keydown", onKey, true);
    };
  }, [open, onCancel, onConfirm]);

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 px-4 backdrop-blur-[2px]"
      data-nexus-confirm="true"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="nexus-confirm-title"
        className={cn(
          "w-full max-w-[380px] rounded-[16px] border border-[var(--border)]",
          "bg-[var(--bg-elevated,#16161A)] p-5 shadow-[0_24px_80px_rgba(0,0,0,0.55)]",
        )}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-3">
          <div
            className={cn(
              "flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border",
              danger
                ? "border-[rgba(255,69,58,0.35)] bg-[rgba(255,69,58,0.12)] text-[#FF453A]"
                : "border-[var(--border)] bg-white/[0.04] text-[var(--accent)]",
            )}
          >
            <AlertTriangle size={16} />
          </div>
          <div className="min-w-0 flex-1">
            <h2
              id="nexus-confirm-title"
              className="text-[15px] font-semibold tracking-tight text-[var(--text-primary)]"
            >
              {title}
            </h2>
            <p className="mt-1.5 text-[13px] leading-relaxed text-[var(--text-secondary)]">
              {message}
            </p>
          </div>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button
            ref={firstBtnRef}
            type="button"
            className="ghost-btn"
            onClick={onCancel}
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            className={cn(
              "primary-btn",
              danger &&
                "!border-[rgba(255,69,58,0.45)] !bg-[rgba(255,69,58,0.9)] !text-white hover:!bg-[#FF453A]",
            )}
            onClick={onConfirm}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
