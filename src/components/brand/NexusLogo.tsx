import { cn } from "@/lib/utils";

type Size = "xs" | "sm" | "md" | "lg" | "xl";

const SIZE_PX: Record<Size, number> = {
  xs: 16,
  sm: 20,
  md: 28,
  lg: 40,
  xl: 56,
};

interface MarkProps {
  size?: Size | number;
  className?: string;
  title?: string;
}

/**
 * Nexus mark — geometric N monogram with a single cyan link accent.
 * Sharp, minimal, SpaceX-adjacent; reads at 16px and large.
 */
export function NexusMark({ size = "md", className, title = "Nexus" }: MarkProps) {
  const px = typeof size === "number" ? size : SIZE_PX[size];
  return (
    <svg
      width={px}
      height={px}
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={cn("shrink-0", className)}
      role="img"
      aria-label={title}
    >
      <title>{title}</title>
      {/* subtle frame */}
      <rect
        x="1.5"
        y="1.5"
        width="29"
        height="29"
        rx="7"
        stroke="currentColor"
        strokeOpacity="0.22"
        strokeWidth="1"
      />
      {/* N left stem */}
      <path
        d="M9 24V8h2.6L21.4 20.2V8H24v16h-2.6L11.6 11.8V24H9Z"
        fill="currentColor"
      />
      {/* cyan nexus node — connection point on the diagonal */}
      <circle cx="16" cy="16" r="2.15" fill="#00C8FF" />
      <circle
        cx="16"
        cy="16"
        r="3.6"
        stroke="#00C8FF"
        strokeOpacity="0.35"
        strokeWidth="1"
        fill="none"
      />
    </svg>
  );
}

interface WordmarkProps {
  size?: Size;
  className?: string;
  showMark?: boolean;
  markClassName?: string;
}

/** Mark + NEXUS wordmark for chrome and welcome */
export function NexusWordmark({
  size = "sm",
  className,
  showMark = true,
  markClassName,
}: WordmarkProps) {
  const markSize = size === "xl" ? "lg" : size === "lg" ? "md" : size;
  const textClass =
    size === "xl"
      ? "text-[22px] tracking-[-0.03em]"
      : size === "lg"
        ? "text-[18px] tracking-[-0.02em]"
        : size === "md"
          ? "text-[15px] tracking-[-0.02em]"
          : "text-[13px] tracking-tight";

  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      {showMark ? (
        <NexusMark size={markSize} className={cn("text-[var(--text-primary)]", markClassName)} />
      ) : null}
      <span
        className={cn(
          "font-semibold text-[var(--text-primary)]",
          textClass,
        )}
      >
        Nexus
      </span>
    </span>
  );
}

export const NEXUS_NAME = "Nexus";
export const NEXUS_TAGLINE = "Notes for Humans and Agents";
