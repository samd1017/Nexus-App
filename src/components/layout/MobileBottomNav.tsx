import type { ReactNode } from "react";
import { CalendarDays, FolderOpen, Link2, Network, Search } from "lucide-react";
import { useVaultStore } from "@/lib/vault/store";
import { usePrefsStore } from "@/lib/prefs/preferences";
import {
  closeDrawersIfNarrow,
  toggleGraphForViewport,
  toggleLinksForViewport,
} from "@/lib/layout/viewport";
import { openCommandPalette } from "@/components/search/CommandPalette";
import { cn } from "@/lib/utils";

/**
 * Phone-only thumb bar. Files / Search / Today / Links / Graph.
 * Hidden in focus mode and while the graph is fullscreen.
 */
export function MobileBottomNav() {
  const graphMode = useVaultStore((s) => s.settings.graphMode);
  const leftOpen = useVaultStore((s) => s.settings.leftOpen);
  const rightOpen = useVaultStore((s) => s.settings.rightOpen);
  const rightTab = useVaultStore((s) => s.rightTab);
  const setLeftOpen = useVaultStore((s) => s.setLeftOpen);
  const openDailyNote = useVaultStore((s) => s.openDailyNote);
  const focusMode = usePrefsStore((s) => s.focusMode);

  if (focusMode || graphMode === "fullscreen") return null;

  return (
    <nav
      className="mobile-bottom-nav z-40 flex shrink-0 items-stretch border-t border-[var(--border)] bg-[color-mix(in_srgb,var(--bg-primary)_94%,transparent)] px-1 backdrop-blur-xl md:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      aria-label="Primary"
    >
      <NavBtn
        label="Files"
        active={leftOpen}
        onClick={() => {
          const next = !leftOpen;
          setLeftOpen(next);
          if (next) {
            const s = useVaultStore.getState();
            if (s.settings.rightOpen) s.setRightOpen(false);
          }
        }}
      >
        <FolderOpen size={20} />
      </NavBtn>
      <NavBtn
        label="Search"
        onClick={() => {
          closeDrawersIfNarrow();
          openCommandPalette();
        }}
      >
        <Search size={20} />
      </NavBtn>
      <NavBtn
        label="Today"
        onClick={() => {
          void openDailyNote();
          closeDrawersIfNarrow();
        }}
      >
        <CalendarDays size={20} />
      </NavBtn>
      <NavBtn
        label="Links"
        active={
          rightOpen &&
          (rightTab === "backlinks" || rightTab === "outline")
        }
        onClick={() => toggleLinksForViewport()}
      >
        <Link2 size={20} />
      </NavBtn>
      <NavBtn
        label="Graph"
        active={graphMode === "panel"}
        onClick={() => toggleGraphForViewport()}
      >
        <Network size={20} />
      </NavBtn>
    </nav>
  );
}

function NavBtn({
  label,
  active,
  onClick,
  children,
}: {
  label: string;
  active?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      className={cn(
        "flex min-h-[52px] flex-1 flex-col items-center justify-center gap-0.5 rounded-lg text-[10px] font-medium tracking-wide transition-colors",
        active
          ? "text-[var(--accent)]"
          : "text-[var(--text-muted)] active:bg-white/[0.04] active:text-[var(--text-primary)]",
      )}
      aria-label={label}
      aria-pressed={active}
      onClick={onClick}
    >
      {children}
      <span>{label}</span>
    </button>
  );
}
