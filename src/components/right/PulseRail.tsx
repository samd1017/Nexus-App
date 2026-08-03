/**
 * Wave 3 — compact pulse activity stream for the right rail.
 */

import {
  Activity,
  AlertTriangle,
  Bot,
  FilePlus,
  HardDrive,
  Pencil,
  Trash2,
} from "lucide-react";
import { usePulseEvents, type PulseEvent, type PulseKind } from "@/lib/vault/pulse";
import { useVaultStore } from "@/lib/vault/store";
import { EmptyState } from "@/components/ui/EmptyState";
import { cn } from "@/lib/utils";

const MAX_VISIBLE = 12;

const KIND_META: Record<
  PulseKind,
  { label: string; icon: typeof Activity; tone: string }
> = {
  create: {
    label: "Created",
    icon: FilePlus,
    tone: "text-[var(--accent)] bg-[var(--accent-dim)]",
  },
  update: {
    label: "Updated",
    icon: Pencil,
    tone: "text-[var(--text-secondary)] bg-white/[0.06]",
  },
  delete: {
    label: "Deleted",
    icon: Trash2,
    tone: "text-[var(--danger)] bg-[rgba(255,69,58,0.12)]",
  },
  external: {
    label: "External",
    icon: HardDrive,
    tone: "text-[var(--warning)] bg-[rgba(255,159,10,0.12)]",
  },
  conflict: {
    label: "Conflict",
    icon: AlertTriangle,
    tone: "text-[var(--danger)] bg-[rgba(255,69,58,0.15)]",
  },
  hermes: {
    label: "Hermes",
    icon: Bot,
    tone: "text-[var(--accent)] bg-[rgba(0,200,255,0.12)]",
  },
};

function formatRelative(at: number): string {
  const sec = Math.max(0, Math.round((Date.now() - at) / 1000));
  if (sec < 5) return "just now";
  if (sec < 60) return `${sec}s ago`;
  const min = Math.round(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h ago`;
  return `${Math.round(hr / 24)}d ago`;
}

function displayTitle(ev: PulseEvent): string {
  if (ev.title?.trim()) return ev.title.trim();
  const base = ev.path.split("/").pop() ?? ev.path;
  return base.replace(/\.md$/i, "") || ev.path;
}

export function PulseRail() {
  const events = usePulseEvents();
  const nodes = useVaultStore((s) => s.nodes);
  const setActiveNote = useVaultStore((s) => s.setActiveNote);
  const visible = events.slice(0, MAX_VISIBLE);

  const openPath = (path: string) => {
    const note = Object.values(nodes).find(
      (n) => n.kind === "note" && n.path === path,
    );
    if (note) setActiveNote(note.id);
  };

  if (visible.length === 0) {
    return (
      <div className="p-3">
        <EmptyState
          compact
          icon={<Activity size={18} />}
          title="No activity yet"
          description="Creates, disk sync, conflicts, and Hermes writes will appear here."
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1 p-3">
      <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--text-muted)]">
        Recent activity
      </div>
      <ul className="flex flex-col gap-1">
        {visible.map((ev) => {
          const meta = KIND_META[ev.kind];
          const Icon = meta.icon;
          const noteExists = Object.values(nodes).some(
            (n) => n.kind === "note" && n.path === ev.path,
          );
          return (
            <li key={ev.id}>
              <button
                type="button"
                disabled={!noteExists}
                className={cn(
                  "tree-row flex w-full items-start gap-2.5 rounded-[10px] px-2.5 py-2 text-left transition-colors",
                  noteExists
                    ? "hover:bg-white/[0.05] cursor-pointer"
                    : "cursor-default opacity-70",
                )}
                onClick={() => {
                  if (noteExists) openPath(ev.path);
                }}
                title={
                  noteExists
                    ? `Open ${ev.path}`
                    : `${ev.path} (note not in vault)`
                }
              >
                <span
                  className={cn(
                    "mt-0.5 flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-md",
                    meta.tone,
                  )}
                >
                  <Icon size={12} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5">
                    <span className="truncate text-[13px] font-medium text-[var(--text-primary)]">
                      {displayTitle(ev)}
                    </span>
                    <span className="shrink-0 text-[10px] uppercase tracking-wide text-[var(--text-muted)]">
                      {meta.label}
                    </span>
                  </span>
                  <span className="mt-0.5 line-clamp-2 block text-[11.5px] text-[var(--text-muted)]">
                    {ev.message}
                  </span>
                  <span className="mt-0.5 block text-[10px] text-[var(--text-muted)]/80">
                    {formatRelative(ev.at)}
                    {ev.path ? (
                      <span className="ml-1.5 opacity-70">· {ev.path}</span>
                    ) : null}
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
