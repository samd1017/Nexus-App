import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

type Props = {
  open: boolean;
  title: string;
  label: string;
  placeholder: string;
  initialValue?: string;
  confirmLabel?: string;
  secondaryLabel?: string;
  onConfirm: (value: string) => void;
  onSecondary?: () => void;
  onClose: () => void;
};

/** In-app input dialog — replaces window.prompt (blocked in many shells). */
export function InsertFieldDialog({
  open,
  title,
  label,
  placeholder,
  initialValue = "",
  confirmLabel = "Insert",
  secondaryLabel,
  onConfirm,
  onSecondary,
  onClose,
}: Props) {
  const [value, setValue] = useState(initialValue);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setValue(initialValue);
    const t = window.setTimeout(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    }, 30);
    return () => window.clearTimeout(t);
  }, [open, initialValue]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const submit = () => {
    const v = value.trim();
    if (!v) return;
    onConfirm(v);
  };

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-black/55 px-4 backdrop-blur-[2px]"
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className={cn(
          "w-full max-w-md rounded-xl border border-[var(--border-strong)]",
          "bg-[var(--bg-elevated)] p-4 shadow-[0_24px_80px_rgba(0,0,0,0.55)]",
        )}
      >
        <div className="mb-3 flex items-center justify-between gap-3">
          <h3 className="text-[14px] font-semibold tracking-tight text-[var(--text-primary)]">
            {title}
          </h3>
          <button
            type="button"
            className="icon-btn h-7 w-7"
            title="Close"
            onClick={onClose}
          >
            <X size={14} />
          </button>
        </div>
        <label className="mb-1.5 block text-[11px] font-medium uppercase tracking-[0.06em] text-[var(--text-muted)]">
          {label}
        </label>
        <input
          ref={inputRef}
          className="field w-full"
          value={value}
          placeholder={placeholder}
          spellCheck={false}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              submit();
            }
          }}
        />
        <div className="mt-4 flex flex-wrap items-center justify-end gap-2">
          {secondaryLabel && onSecondary ? (
            <button
              type="button"
              className="ghost-btn"
              onClick={onSecondary}
            >
              {secondaryLabel}
            </button>
          ) : null}
          <button type="button" className="ghost-btn" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="primary-btn"
            disabled={!value.trim()}
            onClick={submit}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
