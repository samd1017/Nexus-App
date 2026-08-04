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
  const cancelRef = useRef<HTMLButtonElement>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const prevFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;
    prevFocusRef.current =
      typeof document !== "undefined"
        ? (document.activeElement as HTMLElement | null)
        : null;
    // Danger dialogs: focus Cancel so Enter alone does not delete
    const t = window.setTimeout(() => {
      cancelRef.current?.focus({ preventScroll: true });
    }, 0);

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        onCancel();
        return;
      }
      // Only confirm on Enter when Confirm button itself is focused
      if (e.key === "Enter") {
        const active = document.activeElement;
        if (active === confirmRef.current) {
          e.preventDefault();
          e.stopPropagation();
          onConfirm();
        } else if (active === cancelRef.current) {
          e.preventDefault();
          e.stopPropagation();
          onCancel();
        } else {
          // Trap: do not auto-confirm destructive actions
          e.preventDefault();
          e.stopPropagation();
        }
        return;
      }
      if (e.key === "Tab" && panelRef.current) {
        const focusable = panelRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
        );
        if (!focusable.length) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => {
      window.clearTimeout(t);
      window.removeEventListener("keydown", onKey, true);
      const prev = prevFocusRef.current;
      if (prev && typeof prev.focus === "function") {
        try {
          prev.focus({ preventScroll: true });
        } catch {
          /* ignore */
        }
      }
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
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="nexus-confirm-title"
        aria-describedby="nexus-confirm-message"
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
            <p
              id="nexus-confirm-message"
              className="mt-1.5 text-[13px] leading-relaxed text-[var(--text-secondary)]"
            >
              {message}
            </p>
          </div>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button
            ref={cancelRef}
            type="button"
            className="ghost-btn"
            onClick={onCancel}
          >
            {cancelLabel}
          </button>
          <button
            ref={confirmRef}
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
