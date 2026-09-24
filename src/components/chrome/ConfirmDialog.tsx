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
  /** Where focus lands when the dialog opens. Danger defaults to Cancel. */
  initialFocus?: "cancel" | "confirm";
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
  initialFocus,
  onConfirm,
  onCancel,
}: Props) {
  const cancelRef = useRef<HTMLButtonElement>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const prevFocusRef = useRef<HTMLElement | null>(null);

  const onCancelRef = useRef(onCancel);
  const onConfirmRef = useRef(onConfirm);
  onCancelRef.current = onCancel;
  onConfirmRef.current = onConfirm;

  useEffect(() => {
    if (!open) return;
    const prev =
      typeof document !== "undefined"
        ? (document.activeElement as HTMLElement | null)
        : null;
    prevFocusRef.current = prev;
    // Cancel is the safe landing: danger, and any ask that says so.
    // Other asks start on the action. Callbacks stay in refs so a parent
    // re-render cannot pull focus back out of the dialog.
    const t = window.setTimeout(() => {
      const preferCancel = initialFocus
        ? initialFocus === "cancel"
        : danger;
      const target = preferCancel ? cancelRef.current : confirmRef.current;
      (target ?? cancelRef.current)?.focus({ preventScroll: true });
    }, 0);

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        onCancelRef.current();
        return;
      }
      // Only confirm on Enter when Confirm button itself is focused
      if (e.key === "Enter") {
        const active = document.activeElement;
        if (active === confirmRef.current) {
          e.preventDefault();
          e.stopPropagation();
          onConfirmRef.current();
        } else if (active === cancelRef.current) {
          e.preventDefault();
          e.stopPropagation();
          onCancelRef.current();
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
        e.preventDefault();
        e.stopPropagation();
        if (e.shiftKey && document.activeElement === first) {
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          first.focus();
        } else if (e.shiftKey) {
          // Let the browser move when we are in the middle, but keep the
          // event inside this dialog so a parent trap cannot steal it.
          const list = Array.from(focusable);
          const i = list.indexOf(document.activeElement as HTMLElement);
          const next = i <= 0 ? last : list[i - 1];
          next?.focus();
        } else {
          const list = Array.from(focusable);
          const i = list.indexOf(document.activeElement as HTMLElement);
          const next = i < 0 || i >= list.length - 1 ? first : list[i + 1];
          next?.focus();
        }
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => {
      window.clearTimeout(t);
      window.removeEventListener("keydown", onKey, true);
      const back = prevFocusRef.current;
      if (back && back.isConnected && typeof back.focus === "function") {
        try {
          back.focus({ preventScroll: true });
        } catch {
          /* ignore */
        }
      }
    };
  }, [open, danger, initialFocus]);

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
          "w-full max-w-[380px] rounded-[var(--radius-xl)] border border-[var(--border)]",
          "bg-[var(--bg-elevated,#16161A)] p-5 shadow-[0_24px_80px_rgba(0,0,0,0.55)]",
        )}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-3">
          <div
            className={cn(
              "flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border",
              danger
                ? "border-[rgba(255,69,58,0.35)] bg-[rgba(255,69,58,0.12)] text-[var(--danger)]"
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
            className="ghost-btn !h-9 px-3 text-[13px]"
            onClick={onCancel}
          >
            {cancelLabel}
          </button>
          <button
            ref={confirmRef}
            type="button"
            className={cn(
              "primary-btn !h-9 px-3 text-[13px]",
              danger &&
                "!border-[rgba(255,69,58,0.45)] !bg-[rgba(255,69,58,0.9)] !text-white hover:!bg-[var(--danger)]",
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
