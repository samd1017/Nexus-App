import { Monitor, Moon, Sun } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  resolveTheme,
  usePrefsStore,
  type ThemeMode,
} from "@/lib/prefs/preferences";

const CYCLE: ThemeMode[] = ["dark", "light", "system"];

export function ThemeToggle({
  className,
  showLabel = false,
}: {
  className?: string;
  showLabel?: boolean;
}) {
  const theme = usePrefsStore((s) => s.theme ?? "dark");
  const updatePrefs = usePrefsStore((s) => s.updatePrefs);
  const resolved = resolveTheme(theme);
  const Icon = theme === "system" ? Monitor : resolved === "light" ? Sun : Moon;
  const label =
    theme === "system" ? "System theme" : resolved === "light" ? "Light" : "Dark";

  return (
    <button
      type="button"
      className={cn("icon-btn h-8 w-8", showLabel && "w-auto gap-1.5 px-2", className)}
      title={`${label} — click to cycle Dark / Light / System`}
      aria-label={`Theme: ${label}. Click to change.`}
      onClick={() => {
        const i = CYCLE.indexOf(theme);
        updatePrefs({ theme: CYCLE[(i + 1) % CYCLE.length] ?? "dark" });
      }}
    >
      <Icon size={15} />
      {showLabel ? (
        <span className="text-[12px] font-medium">{label}</span>
      ) : null}
    </button>
  );
}
