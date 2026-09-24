import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type Props = {
  icon?: ReactNode;
  title: string;
  description?: string;
  className?: string;
  /** Tighter dashed card used in side panels */
  compact?: boolean;
  /** Optional action slot (button, link) below description */
  children?: ReactNode;
  /** When set, the card is announced as status (not a control). */
  status?: string;
};

/** Shared empty placeholder for FileTree, Graph, right-panel sections. */
export function EmptyState({
  icon,
  title,
  description,
  className,
  compact = false,
  children,
  status,
}: Props) {
  return (
    <div
      role={status ? "status" : undefined}
      data-panel-empty={status}
      data-testid={status === "vault" ? "vault-first-run-list" : undefined}
      className={cn(
        "rounded-[12px] border border-dashed border-[var(--border)] text-center",
        compact ? "px-3 py-6" : "px-4 py-8",
        className,
      )}
    >
      {icon ? (
        <div className="mx-auto mb-2 flex justify-center text-[var(--text-secondary)]">
          {icon}
        </div>
      ) : null}
      <p className="text-[13px] font-medium text-[var(--text-secondary)]">
        {title}
      </p>
      {description ? (
        <p
          className={cn(
            "mt-1 leading-relaxed",
            status === "vault"
              ? "text-[15px] font-semibold text-white"
              : "text-[12.5px] text-[var(--text-secondary)]",
          )}
        >
          {description}
        </p>
      ) : null}
      {children ? <div className="mt-3 flex justify-center">{children}</div> : null}
    </div>
  );
}
