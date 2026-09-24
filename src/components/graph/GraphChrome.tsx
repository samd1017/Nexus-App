import type { KeyboardEvent, ReactNode, Ref } from "react";
import {
  Download,
  Focus,
  FolderOpen,
  Ghost,
  Globe2,
  Hash,
  Maximize2,
  Minimize2,
  Network,
  Scan,
  Search,
  Unlink,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { EmptyState } from "@/components/ui/EmptyState";
import type { GraphViewMode } from "@/lib/graph/build-graph";
import type { GraphInspect } from "@/lib/graph/graph-inspect";
import { formatShortcut } from "@/lib/platform";
import { exitGraphForViewport } from "@/lib/layout/viewport";

export type GraphChromeProps = {
  className?: string;
  mode: "panel" | "fullscreen";
  viewMode: GraphViewMode;
  engineReady: boolean;
  largeVault: boolean;
  badge: ReactNode;
  crumbs: string[];
  query: string;
  onQuery: (q: string) => void;
  showGhosts: boolean;
  onToggleGhosts: () => void;
  ghostCount: number;
  orphansOnly: boolean;
  onToggleOrphans: () => void;
  orphansAvailable: boolean;
  tag: string;
  tagOptions: string[];
  onTag: (t: string) => void;
  folderPrefix: string;
  folderOptions: string[];
  onFolder: (p: string) => void;
  colorBy: "folder" | "tag";
  onColorBy: (c: "folder" | "tag") => void;
  hopsLabel: string | null;
  onCycleHops: () => void;
  isolateHops: boolean;
  onToggleIsolate: () => void;
  hopsAvailable: boolean;
  inspect: GraphInspect | null;
  onOpenInspectLink: (id: string) => void;
  onShowLinks: () => void;
  onVaultMap: () => void;
  onEnterFolder: (path: string) => void;
  onFit: () => void;
  onExport: () => void;
  onExpand: () => void;
  empty: {
    show: boolean;
    title: string;
    description: string;
    actions: ReactNode;
  };
  hint: string;
  hintVisible: boolean;
  liveRegion: string;
  filterInputRef?: Ref<HTMLInputElement>;
  onKeyDown?: (e: KeyboardEvent) => void;
  children: ReactNode;
};

function ModePill({
  active,
  label,
  onClick,
  disabled,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "rounded-full px-2.5 py-1 text-[11px] font-semibold tracking-wide transition",
        active
          ? "bg-[var(--accent)] text-black shadow-[0_0_16px_rgba(0,200,255,0.22)]"
          : "text-[var(--text-secondary)] hover:bg-white/5 hover:text-[var(--text-primary)]",
        disabled && "opacity-40",
      )}
    >
      {label}
    </button>
  );
}

export function GraphChrome(props: GraphChromeProps) {
  const fs = props.mode === "fullscreen";
  const inspect = props.inspect;

  return (
    <div
      className={cn(
        "graph-host graph-chrome relative flex min-h-0 flex-col overflow-hidden bg-[var(--graph-void,#03050a)]",
        fs ? "graph-chrome--fs" : "graph-chrome--panel",
        props.className,
      )}
      role="region"
      tabIndex={0}
      onKeyDown={props.onKeyDown}
      data-graph-host
      data-graph-engine={props.engineReady ? "ready" : "building"}
      data-graph-view={props.viewMode}
      aria-label={
        props.viewMode === "folder"
          ? "Folder map"
          : props.viewMode === "ego"
            ? "Link neighborhood graph"
            : "Note graph"
      }
    >
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background: `
            radial-gradient(ellipse 90% 75% at 50% 40%, color-mix(in srgb, var(--accent) 7%, #0c1420) 0%, #080e16 42%, #04070c 70%, var(--graph-void, #03050a) 100%)
          `,
        }}
      />

      {!props.engineReady ? (
        <div
          className="graph-loading absolute inset-0 z-[5] flex flex-col items-center justify-center gap-3"
          data-graph-progress
        >
          <div className="graph-loading-ring" aria-hidden />
          <p className="text-[13px] font-medium tracking-wide text-[#f2f6fb]">
            {props.viewMode === "folder" ? "Laying out the folder map" : "Drawing links"}
          </p>
          <p className="text-[12px] text-[#d5dce8]">
            {props.largeVault
              ? "This view shows one folder"
              : "Lines are links between notes"}
          </p>
        </div>
      ) : null}

      <div className="pointer-events-none absolute left-2.5 right-2.5 top-2.5 z-10 flex flex-col gap-1.5 md:left-3 md:right-3 md:top-3">
        <div className="flex min-w-0 items-center gap-1.5">
          {fs ? (
            <button
              type="button"
              data-exit-graph
              className="graph-chip pointer-events-auto shrink-0 border-[color-mix(in_srgb,var(--accent)_55%,transparent)] bg-[color-mix(in_srgb,var(--accent)_16%,rgba(0,0,0,0.62))] text-[var(--accent)]"
              title={`Exit fullscreen graph (${formatShortcut("Esc")} or ${formatShortcut("Mod+G")})`}
              aria-label="Exit graph"
              onClick={() => exitGraphForViewport()}
            >
              <Minimize2 size={12} />
              <span>Exit</span>
              <kbd className="rounded border border-white/20 px-1 py-px text-[10px] font-medium text-[#d5dce8]">
                Esc
              </kbd>
            </button>
          ) : null}
          {props.largeVault ? (
            <div
              className="pointer-events-auto flex shrink-0 items-center gap-0.5 rounded-full border border-white/[0.07] bg-black/50 p-0.5 backdrop-blur-md"
              role="group"
              aria-label="Graph mode"
            >
              <ModePill
                active={props.viewMode === "folder"}
                label="Map"
                onClick={props.onVaultMap}
              />
              <ModePill
                active={props.viewMode === "ego"}
                label="Links"
                onClick={props.onShowLinks}
              />
            </div>
          ) : (
            <div className="pointer-events-auto flex items-center gap-1.5 rounded-full border border-white/[0.07] bg-black/50 px-2.5 py-1 backdrop-blur-md">
              <Network size={11} className="text-[var(--accent)] opacity-80" />
              <span className="text-[12px] font-semibold tracking-wide text-[#f2f6fb]">
                Notes
              </span>
            </div>
          )}
          <div className="graph-count pointer-events-none min-w-0 flex-1 truncate rounded-full border px-2.5 py-1 backdrop-blur-sm">
            <span className="graph-count-text">
              {props.badge}
            </span>
          </div>
        </div>

        {props.viewMode === "folder" || props.crumbs.length > 0 ? (
          <nav
            data-graph-breadcrumb
            className="pointer-events-auto flex min-w-0 flex-wrap items-center gap-0.5 rounded-full border border-white/[0.14] bg-[rgba(4,6,10,0.92)] px-2 py-0.5 backdrop-blur-sm"
            aria-label="Folder map path"
          >
            <button
              type="button"
              className="min-h-7 rounded-full px-2 py-1 text-[12px] font-semibold tracking-wide text-[var(--accent)] hover:bg-white/5"
              onClick={props.onVaultMap}
            >
              Vault
            </button>
            {props.crumbs.map((seg, i) => {
              const path = props.crumbs.slice(0, i + 1).join("/");
              return (
                <span key={path} className="flex items-center gap-0.5">
                  <span className="text-[#d5dce8] opacity-70">/</span>
                  <button
                    type="button"
                    className="max-w-[8rem] min-h-7 truncate rounded-full px-2 py-1 text-[12px] font-semibold tracking-wide text-[#f2f6fb] hover:bg-white/5"
                    onClick={() => props.onEnterFolder(path)}
                  >
                    {seg}
                  </button>
                </span>
              );
            })}
          </nav>
        ) : null}

        <div className="pointer-events-auto flex min-w-0 flex-wrap items-center gap-1">
          <label className="relative flex min-w-0 flex-1 items-center">
            <Search
              size={11}
              className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-[#d5dce8]"
            />
            <input
              ref={props.filterInputRef}
              value={props.query}
              onChange={(e) => props.onQuery(e.target.value)}
              placeholder="Filter this view"
              className="h-8 w-full min-w-[7rem] rounded-full border border-white/[0.16] bg-[rgba(4,6,10,0.92)] pl-7 pr-2 text-[12.5px] font-medium text-[#f2f6fb] outline-none placeholder:text-[#c5ceda] focus:border-[var(--accent)]/40"
              aria-label="Filter graph"
              data-graph-filter
            />
          </label>
          {props.ghostCount > 0 && props.viewMode !== "folder" ? (
            <button
              type="button"
              className={cn("graph-chip", props.showGhosts && "is-on")}
              title={props.showGhosts ? "Hide unresolved links" : "Show unresolved links"}
              aria-pressed={props.showGhosts}
              onClick={props.onToggleGhosts}
            >
              <Ghost size={11} />
              <span className="hidden sm:inline">Missing</span>
            </button>
          ) : null}
          {props.orphansAvailable ? (
            <button
              type="button"
              className={cn("graph-chip", props.orphansOnly && "is-on")}
              title="Show only notes with no links"
              aria-pressed={props.orphansOnly}
              onClick={props.onToggleOrphans}
            >
              <Unlink size={11} />
              <span className="hidden sm:inline">Orphans</span>
            </button>
          ) : null}
          {props.tagOptions.length > 0 ? (
            <label className="graph-chip graph-chip-select">
              <Hash size={11} />
              <select
                value={props.tag}
                onChange={(e) => props.onTag(e.target.value)}
                aria-label="Filter by tag"
              >
                <option value="">Tags</option>
                {props.tagOptions.map((t) => (
                  <option key={t} value={t}>
                    #{t}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          {props.folderOptions.length > 0 ? (
            <label className="graph-chip graph-chip-select">
              <FolderOpen size={11} />
              <select
                value={props.folderPrefix}
                onChange={(e) => props.onFolder(e.target.value)}
                aria-label="Filter by folder"
              >
                <option value="">Folders</option>
                {props.folderOptions.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          {props.hopsAvailable ? (
            <button
              type="button"
              className={cn("graph-chip", props.hopsLabel && "is-on")}
              title="Cycle neighborhood depth"
              onClick={props.onCycleHops}
            >
              {props.hopsLabel ? <Focus size={11} /> : <Globe2 size={11} />}
              <span>{props.hopsLabel ?? "All"}</span>
            </button>
          ) : null}
          {props.hopsAvailable && props.hopsLabel ? (
            <button
              type="button"
              className={cn("graph-chip", props.isolateHops && "is-on")}
              title={props.isolateHops ? "Dim outsiders" : "Isolate neighborhood"}
              aria-pressed={props.isolateHops}
              onClick={props.onToggleIsolate}
            >
              Isolate
            </button>
          ) : null}
          {props.viewMode !== "folder" ? (
            <button
              type="button"
              className={cn("graph-chip", props.colorBy === "tag" && "is-on")}
              title={props.colorBy === "tag" ? "Color by folder" : "Color by tag"}
              aria-pressed={props.colorBy === "tag"}
              onClick={() =>
                props.onColorBy(props.colorBy === "tag" ? "folder" : "tag")
              }
            >
              <Hash size={11} />
              {props.colorBy === "tag" ? "By tag" : "By folder"}
            </button>
          ) : null}
          <button
            type="button"
            className="graph-chip"
            title="Fit in view"
            aria-label="Fit graph in view"
            onClick={props.onFit}
          >
            <Scan size={11} />
          </button>
          <button
            type="button"
            className="graph-chip"
            title="Export PNG"
            aria-label="Export graph PNG"
            onClick={props.onExport}
          >
            <Download size={11} />
          </button>
          {fs ? null : (
            <button
              type="button"
              className="graph-chip"
              title="Expand graph"
              aria-label="Expand graph"
              onClick={props.onExpand}
            >
              <Maximize2 size={11} />
            </button>
          )}
        </div>
      </div>

      {props.children}

      <div className="sr-only" role="status" aria-live="polite">
        {props.liveRegion}
      </div>

      {inspect && !props.empty.show ? (
        <aside
          className="graph-inspector pointer-events-auto"
          data-graph-inspector
        >
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="truncate text-[13.5px] font-semibold tracking-wide text-[#f7fbff]">
                {inspect.title}
              </p>
              {inspect.path ? (
                <p className="mt-0.5 truncate text-[12px] text-[#d7e0ea]">
                  {inspect.path}
                </p>
              ) : null}
            </div>
            <span className="shrink-0 rounded-full border border-white/20 bg-white/[0.08] px-1.5 py-px text-[10.5px] font-semibold uppercase tracking-wider text-[#e7edf4]">
              {inspect.kind}
            </span>
          </div>
          {inspect.kind === "note" ? (
            <p className="mt-1.5 text-[12.5px] font-medium text-[#f2f6fb]">
              <span className="text-[var(--accent)]">{inspect.outCount}</span> out
              <span className="mx-1.5 text-[#d5dce8]">·</span>
              <span className="text-[var(--accent)]">{inspect.inCount}</span> in
            </p>
          ) : inspect.kind === "folder" ? (
            <p className="mt-1.5 text-[12px] text-[#e7edf4]">
              Click the orb to enter this level
            </p>
          ) : null}
          {inspect.out.length > 0 ? (
            <div className="mt-2">
              <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-[#d7e0ea]">
                Out
              </p>
              <div className="flex flex-wrap gap-1">
                {inspect.out.map((l) => (
                  <button
                    key={`o-${l.id}`}
                    type="button"
                    className="graph-link-chip"
                    onClick={() => props.onOpenInspectLink(l.id)}
                  >
                    {l.title}
                  </button>
                ))}
              </div>
            </div>
          ) : null}
          {inspect.inn.length > 0 ? (
            <div className="mt-2">
              <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-[#d7e0ea]">
                In
              </p>
              <div className="flex flex-wrap gap-1">
                {inspect.inn.map((l) => (
                  <button
                    key={`i-${l.id}`}
                    type="button"
                    className="graph-link-chip"
                    onClick={() => props.onOpenInspectLink(l.id)}
                  >
                    {l.title}
                  </button>
                ))}
              </div>
            </div>
          ) : null}
        </aside>
      ) : null}

      {props.hintVisible || fs ? (
        <div className="pointer-events-none absolute bottom-2 left-0 right-0 z-10 flex justify-center px-3">
          <div className="rounded-full border border-white/[0.14] bg-[rgba(4,6,10,0.92)] px-3 py-1 text-[11.5px] font-medium tracking-wide text-[#e7edf4] backdrop-blur-md">
            {props.hintVisible
              ? props.hint
              : `Esc or Exit graph · ${formatShortcut("J")}/${formatShortcut("K")} notes · / filter`}
          </div>
        </div>
      ) : null}

      {props.empty.show ? (
        <div className="absolute inset-0 z-10 flex items-center justify-center px-6">
          <EmptyState
            icon={<Network size={16} />}
            title={props.empty.title}
            description={props.empty.description}
            className="pointer-events-auto max-w-[320px] border-[var(--border)] bg-[var(--glass-bg)] shadow-[0_16px_48px_rgba(0,0,0,0.45)] backdrop-blur-md"
          >
            <div className="flex flex-wrap items-center justify-center gap-2">
              {props.empty.actions}
            </div>
          </EmptyState>
        </div>
      ) : null}
    </div>
  );
}
