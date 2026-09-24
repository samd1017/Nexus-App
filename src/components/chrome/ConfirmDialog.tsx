import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import { markControlFocus, reclaimAfterFocus } from "@/lib/chrome/focus-ring";
import { confirmEnterAction } from "@/lib/chrome/rebuild-confirm";

type Props = {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  /** Where focus lands when the dialog opens. Danger defaults to Cancel. */
  initialFocus?: "cancel" | "confirm";
  /** Stable hook for the open dialog, when a caller needs one. */
  testId?: string;
  /** Selector focused again after Cancel, once the dialog is gone. */
  returnTo?: string;
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
  testId,
  returnTo,
  onConfirm,
  onCancel,
}: Props) {
  const cancelRef = useRef<HTMLButtonElement>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const prevFocusRef = useRef<HTMLElement | null>(null);
  const returnToRef = useRef(returnTo);
  returnToRef.current = returnTo;

  const onCancelRef = useRef(onCancel);
  const onConfirmRef = useRef(onConfirm);
  onCancelRef.current = onCancel;
  onConfirmRef.current = onConfirm;
  const preferCancel = initialFocus ? initialFocus === "cancel" : danger;

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
    const landingOf = () => {
      const target = preferCancel ? cancelRef.current : confirmRef.current;
      return target ?? cancelRef.current;
    };
    const focusLanding = () => {
      const panel = panelRef.current;
      if (!panel?.isConnected) return;
      const landing = landingOf();
      if (!landing) return;
      landing.focus({ preventScroll: true });
      markControlFocus(landing, document);
      if (document.activeElement === landing) {
        overlayRef.current?.setAttribute(
          "data-confirm-landed",
          landing === cancelRef.current ? "cancel" : "confirm",
        );
      }
    };
    // Land immediately, then again after the paint. A long vault can move
    // focus to the note in the same turn the dialog opens.
    focusLanding();
    const raf = window.requestAnimationFrame(focusLanding);
    const soon = window.setTimeout(focusLanding, 0);
    const later = window.setTimeout(focusLanding, 48);
    // A busy vault can move focus back to the note after the dialog paints.
    // focus() inside this focusin loses to the call that is still finishing,
    // so the landing button is taken back on the next turn.
    const reclaim = () => {
      const panel = panelRef.current;
      if (!panel?.isConnected) return;
      const active = document.activeElement;
      if (active && panel.contains(active)) return;
      focusLanding();
    };
    let lateReclaim = 0;
    const onFocusIn = (e: FocusEvent) => {
      const panel = panelRef.current;
      if (!panel) return;
      const next = e.target as Node | null;
      if (next && panel.contains(next)) return;
      reclaimAfterFocus(reclaim);
      window.clearTimeout(lateReclaim);
      // A busy vault can move the cursor again after the next frame.
      lateReclaim = window.setTimeout(reclaim, 160);
    };
    document.addEventListener("focusin", onFocusIn, true);

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        onCancelRef.current();
        return;
      }
      // Enter rebuilds only when Rebuild itself is focused. Cancel dismisses.
      if (e.key === "Enter") {
        const focus =
          document.activeElement === confirmRef.current
            ? "confirm"
            : document.activeElement === cancelRef.current
              ? "cancel"
              : "other";
        const action = confirmEnterAction(focus);
        e.preventDefault();
        e.stopPropagation();
        if (action === "rebuild") onConfirmRef.current();
        else if (action === "dismiss") onCancelRef.current();
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
      window.cancelAnimationFrame(raf);
      window.clearTimeout(soon);
      window.clearTimeout(later);
      window.clearTimeout(lateReclaim);
      document.removeEventListener("focusin", onFocusIn, true);
      window.removeEventListener("keydown", onKey, true);
      const restore = () => {
        if (document.querySelector("[data-nexus-confirm]")) return;
        const selector = returnToRef.current;
        const picked = selector
          ? document.querySelector<HTMLElement>(selector)
          : null;
        const back =
          picked && picked.isConnected ? picked : prevFocusRef.current;
        if (back && back.isConnected && typeof back.focus === "function") {
          try {
            back.focus({ preventScroll: true });
          } catch {
            /* ignore */
          }
        }
      };
      restore();
      reclaimAfterFocus(restore);
      window.setTimeout(restore, 48);
    };
  }, [open, danger, initialFocus]);

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 px-4 backdrop-blur-[2px]"
      ref={overlayRef}
      data-nexus-confirm="true"
      data-confirm-focus={preferCancel ? "cancel" : "confirm"}
      data-testid={testId}
      onMouseDown={(e) => {
        if (e.target !== e.currentTarget) return;
        // A click behind the ask is not an answer. Esc or Cancel is.
        e.preventDefault();
        const panel = panelRef.current;
        if (panel && panel.contains(document.activeElement)) return;
        const landing = preferCancel ? cancelRef.current : confirmRef.current;
        (landing ?? cancelRef.current)?.focus({ preventScroll: true });
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="nexus-confirm-title"
        aria-describedby="nexus-confirm-message"
        className={cn(
          "nexus-dialog-in w-full max-w-[380px] rounded-[var(--radius-xl)] border border-[var(--border)]",
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
              className="text-[22px] font-semibold tracking-tight text-white"
            >
              {title}
            </h2>
            <p
              id="nexus-confirm-message"
              data-confirm-message
              role="status"
              className="mt-1.5 text-[15px] font-medium leading-relaxed text-white"
            >
              {message}
            </p>
          </div>
        </div>
        <div className="mt-5 flex items-center justify-end gap-2">
          <span className="nexus-rename-hint mr-auto text-[11.5px] font-medium text-white/70" aria-hidden>
            <kbd>esc</kbd>
            <span className="ml-1 self-center">cancels</span>
          </span>
          <button
            ref={cancelRef}
            type="button"
            data-confirm-cancel
            data-testid="confirm-cancel"
            className="ghost-btn !h-10 min-w-[96px] px-4 text-[14px] font-semibold text-white"
            onClick={onCancel}
          >
            {cancelLabel}
          </button>
          <button
            ref={confirmRef}
            type="button"
            data-confirm-action
            className={cn(
              "primary-btn !h-10 min-w-[96px] px-4 text-[14px] font-semibold",
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
