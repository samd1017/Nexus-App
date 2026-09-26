import { lazy, Suspense } from "react";
import { cn } from "@/lib/utils";
import { usePrefsStore, type GraphSurface } from "@/lib/prefs/preferences";
import { LocalGraph2D } from "@/components/graph/LocalGraph2D";

const GraphView = lazy(async () => {
  const m = await import("@/components/graph/GraphView");
  return { default: m.GraphView };
});

type Props = {
  mode: "panel" | "fullscreen";
  className?: string;
};

function SurfaceButton({
  active,
  label,
  testId,
  onClick,
}: {
  active: boolean;
  label: string;
  testId: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      data-testid={testId}
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "rounded-full px-2.5 py-1 text-[11.5px] font-semibold tracking-wide",
        active
          ? "bg-[var(--accent)] text-black"
          : "text-[var(--text-secondary)] hover:bg-white/5 hover:text-[var(--text-primary)]",
      )}
    >
      {label}
    </button>
  );
}

/** Note context opens a flat neighborhood. 3D stays one click away. */
export function GraphSlot({ mode, className }: Props) {
  const surface = usePrefsStore((s) =>
    s.graphSurface === "explore" ? "explore" : "local",
  );
  const updatePrefs = usePrefsStore((s) => s.updatePrefs);
  const choose = (next: GraphSurface) => updatePrefs({ graphSurface: next });

  return (
    <div
      className={cn("flex h-full min-h-0 flex-col", className)}
      data-graph-surface={surface}
    >
      <div
        className="flex shrink-0 items-center gap-1 border-b border-[var(--border)] bg-[var(--bg-deepest,#050507)] px-2 py-1.5"
        role="group"
        aria-label="Graph style"
      >
        <SurfaceButton
          active={surface === "local"}
          label="Local"
          testId="graph-local"
          onClick={() => choose("local")}
        />
        <SurfaceButton
          active={surface === "explore"}
          label="3D Explore"
          testId="graph-explore"
          onClick={() => choose("explore")}
        />
        <span className="ml-auto truncate pl-2 text-[11px] text-[var(--text-muted)]">
          {surface === "local" ? "This note and its links" : "3D graph"}
        </span>
      </div>
      <div className="min-h-0 flex-1">
        {surface === "explore" ? (
          <Suspense
            fallback={
              <div className="flex h-full min-h-[220px] items-center justify-center text-[12px] text-[var(--text-muted)]">
                Loading graph…
              </div>
            }
          >
            <GraphView mode={mode} className="h-full min-h-0" />
          </Suspense>
        ) : (
          <LocalGraph2D className="h-full min-h-0" />
        )}
      </div>
    </div>
  );
}
