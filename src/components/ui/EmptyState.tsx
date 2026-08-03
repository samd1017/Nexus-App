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
};

/** Shared empty placeholder for FileTree, Graph, right-panel sections. */
export function EmptyState({
  icon,
  title,
  description,
  className,
  compact = false,
  children,
}: Props) {
  return (
    <div
      className={cn(
        "rounded-[12px] border border-dashed border-[var(--border)] text-center",
        compact ? "px-3 py-6" : "px-4 py-8",
        className,
      )}
    >
      {icon ? (
        <div className="mx-auto mb-2 flex justify-center text-[var(--text-muted)] opacity-40">
          {icon}
        </div>
      ) : null}
      <p className="text-[13px] font-medium text-[var(--text-secondary)]">
        {title}
      </p>
      {description ? (
        <p className="mt-1 text-[11.5px] leading-snug text-[var(--text-muted)]">
          {description}
        </p>
      ) : null}
      {children ? <div className="mt-3 flex justify-center">{children}</div> : null}
    </div>
  );
}
