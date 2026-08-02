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
 * Nexus mark — 3D extruded N monogram (steel + cyan nexus node).
 * SpaceX-adjacent: hard edges, metal faces, controlled cyan accent.
 * Reads at 16px (simplified) and large (full bevel).
 */
export function NexusMark({ size = "md", className, title = "Nexus" }: MarkProps) {
  const px = typeof size === "number" ? size : SIZE_PX[size];
  const uid = `nx${px}`;

  return (
    <svg
      width={px}
      height={px}
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={cn("nexus-mark shrink-0", className)}
      role="img"
      aria-label={title}
      style={{ filter: "drop-shadow(0 2px 4px rgba(0,0,0,0.45)) drop-shadow(0 0 10px rgba(0,200,255,0.18))" }}
    >
      <title>{title}</title>
      <defs>
        {/* Face metal */}
        <linearGradient id={`${uid}-face`} x1="6" y1="4" x2="26" y2="28" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#f4f6fa" />
          <stop offset="38%" stopColor="#c8ced8" />
          <stop offset="72%" stopColor="#8a929e" />
          <stop offset="100%" stopColor="#5a6270" />
        </linearGradient>
        {/* Top/left lit edge */}
        <linearGradient id={`${uid}-hi`} x1="8" y1="6" x2="14" y2="22" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="0.95" />
          <stop offset="100%" stopColor="#ffffff" stopOpacity="0.15" />
        </linearGradient>
        {/* Extrusion / depth face */}
        <linearGradient id={`${uid}-depth`} x1="10" y1="10" x2="24" y2="26" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#3a4250" />
          <stop offset="100%" stopColor="#12151c" />
        </linearGradient>
        {/* Frame plate */}
        <linearGradient id={`${uid}-plate`} x1="2" y1="2" x2="30" y2="30" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#1c222c" />
          <stop offset="55%" stopColor="#0c0e14" />
          <stop offset="100%" stopColor="#06070a" />
        </linearGradient>
        <linearGradient id={`${uid}-rim`} x1="2" y1="2" x2="28" y2="28" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#6a7484" />
          <stop offset="50%" stopColor="#2a303a" />
          <stop offset="100%" stopColor="#00c8ff" stopOpacity="0.55" />
        </linearGradient>
        <radialGradient id={`${uid}-node`} cx="50%" cy="40%" r="60%">
          <stop offset="0%" stopColor="#9aeeff" />
          <stop offset="45%" stopColor="#00c8ff" />
          <stop offset="100%" stopColor="#007a9e" />
        </radialGradient>
        <filter id={`${uid}-glow`} x="-40%" y="-40%" width="180%" height="180%">
          <feGaussianBlur stdDeviation="1.1" result="b" />
          <feMerge>
            <feMergeNode in="b" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      {/* Base plate with bevel rim */}
      <rect x="1" y="1.5" width="29" height="29" rx="7.5" fill={`url(#${uid}-depth)`} opacity="0.9" />
      <rect x="1.5" y="1" width="29" height="29" rx="7.5" fill={`url(#${uid}-plate)`} />
      <rect
        x="2"
        y="2"
        width="28"
        height="28"
        rx="7"
        stroke={`url(#${uid}-rim)`}
        strokeWidth="1"
        fill="none"
      />
      {/* inner plate specular */}
      <path
        d="M5 8.5C6.5 4.5 10 3 16 3c7 0 11 2.2 12.5 6.5"
        stroke={`url(#${uid}-hi)`}
        strokeWidth="1.2"
        strokeLinecap="round"
        opacity="0.45"
      />

      {/* Extrusion shadow of N (offset down-right) */}
      <path
        d="M10.2 24.4V9.1h2.5L21.8 20.2V9.1H24.4v15.3h-2.5L12.7 12.1v12.3H10.2Z"
        fill={`url(#${uid}-depth)`}
        opacity="0.95"
      />
      {/* Main N face */}
      <path
        d="M9 23.2V7.8h2.55L21.2 19.5V7.8H23.8v15.4h-2.55L11.55 11V23.2H9Z"
        fill={`url(#${uid}-face)`}
      />
      {/* Highlight stroke on N left edge */}
      <path
        d="M9.35 8.2v14.4"
        stroke={`url(#${uid}-hi)`}
        strokeWidth="0.85"
        strokeLinecap="round"
        opacity="0.55"
      />

      {/* 3D cyan nexus node at cross */}
      <g filter={`url(#${uid}-glow)`}>
        <ellipse cx="16.3" cy="16.7" rx="2.6" ry="1.1" fill="#00c8ff" opacity="0.28" />
        <circle cx="16" cy="15.7" r="2.35" fill={`url(#${uid}-node)`} />
        <circle cx="15.35" cy="15.05" r="0.85" fill="#e8fbff" opacity="0.75" />
        <circle
          cx="16"
          cy="15.7"
          r="3.55"
          stroke="#00c8ff"
          strokeOpacity="0.45"
          strokeWidth="0.85"
          fill="none"
        />
      </g>
    </svg>
  );
}

interface WordmarkProps {
  size?: Size;
  className?: string;
  showMark?: boolean;
  markClassName?: string;
}

/** Mark + 3D metallic NEXUS wordmark */
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
        <NexusMark
          size={markSize}
          className={cn("text-[var(--text-primary)]", markClassName)}
        />
      ) : null}
      <span
        className={cn(
          "nexus-wordmark font-semibold select-none",
          textClass,
        )}
        aria-label="Nexus"
      >
        Nexus
      </span>
    </span>
  );
}

export const NEXUS_NAME = "Nexus";
export const NEXUS_TAGLINE = "Notes for Humans and Agents";
