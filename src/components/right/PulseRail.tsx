/**
 * Wave 3/4/C — Pulse activity + Agent Inbox + Conflict Studio entry + trash restore.
 */

import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  AlertTriangle,
  Bot,
  CheckCheck,
  FilePlus,
  HardDrive,
  Inbox,
  Pencil,
  RotateCcw,
  Trash2,
} from "lucide-react";
import {
  usePulseEvents,
  markPulseRead,
  markAllPulseRead,
  pulseEventMatchesVault,
  type PulseEvent,
  type PulseKind,
} from "@/lib/vault/pulse";
import { useVaultStore } from "@/lib/vault/store";
import type { TrashEntry } from "@/lib/vault/trash";
import { EmptyState } from "@/components/ui/EmptyState";
import { cn } from "@/lib/utils";

const MAX_VISIBLE = 24;

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
    label: "Agent",
    icon: Bot,
    tone: "text-[var(--accent)] bg-[rgba(0,200,255,0.12)]",
  },
};

type FilterId = "all" | "inbox" | "conflict" | "agent";

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

function matchesFilter(ev: PulseEvent, filter: FilterId): boolean {
  if (filter === "all") return true;
  if (filter === "inbox")
    return (
      ev.kind === "external" ||
      ev.kind === "hermes" ||
      ev.kind === "conflict"
    );
  if (filter === "conflict") return ev.kind === "conflict";
  if (filter === "agent") return ev.kind === "hermes" || ev.kind === "external";
  return true;
}

export function PulseRail() {
  const allEvents = usePulseEvents();
  const vaultId = useVaultStore((s) => s.vaultId);
  const nodes = useVaultStore((s) => s.nodes);
  const setActiveNote = useVaultStore((s) => s.setActiveNote);
  const getConflictItems = useVaultStore((s) => s.getConflictItems);
  const getOpenConflictCount = useVaultStore((s) => s.getOpenConflictCount);
  const openConflictStudio = useVaultStore((s) => s.openConflictStudio);
  const resolveConflictKeepMine = useVaultStore((s) => s.resolveConflictKeepMine);
  const dismissConflictFromList = useVaultStore((s) => s.dismissConflictFromList);
  const openConflictPair = useVaultStore((s) => s.openConflictPair);
  const listTrash = useVaultStore((s) => s.listTrash);
  const restoreTrash = useVaultStore((s) => s.restoreTrash);
  const mode = useVaultStore((s) => s.mode);
  const [filter, setFilter] = useState<FilterId>("all");
  const [trash, setTrash] = useState<TrashEntry[]>([]);
  const [restoring, setRestoring] = useState<string | null>(null);

  const events = useMemo(
    () => allEvents.filter((e) => pulseEventMatchesVault(e, vaultId)),
    [allEvents, vaultId],
  );

  useEffect(() => {
    let cancelled = false;
    void listTrash().then((rows: any) => {
      if (!cancelled) setTrash(rows);
    });
    return () => {
      cancelled = true;
    };
  }, [vaultId, events, listTrash]);

  const conflictItems = useMemo(() => getConflictItems(), [nodes, getConflictItems]);
  const liveConflictCount = getOpenConflictCount();

  const filtered = useMemo(
    () => events.filter((e) => matchesFilter(e, filter)).slice(0, MAX_VISIBLE),
    [events, filter],
  );

  const inboxCount = useMemo(
    () =>
      events.filter(
        (e) =>
          !e.read &&
          (e.kind === "external" || e.kind === "hermes" || e.kind === "conflict"),
      ).length + liveConflictCount,
    [events, liveConflictCount],
  );

  const unreadCount = useMemo(
    () => events.filter((e) => !e.read).length,
    [events],
  );

  const openPath = (path: string) => {
    const note =
      Object.values(nodes).find((n) => n.kind === "note" && n.path === path) ??
      Object.values(nodes).find(
        (n) =>
          n.kind === "note" &&
          (n.path.includes(".conflict-") || path.includes(".conflict-")) &&
          n.path.replace(/\.conflict-.+\.md$/i, ".md") ===
            path.replace(/\.conflict-.+\.md$/i, ".md"),
      );
    if (note) setActiveNote(note.id);
  };

  const filters: { id: FilterId; label: string; count?: number }[] = [
    { id: "inbox", label: "Inbox", count: inboxCount },
    { id: "conflict", label: "Conflicts", count: liveConflictCount },
    { id: "agent", label: "Agents" },
    { id: "all", label: "All" },
  ];

  const disk = mode === "fsa" || mode === "desktop";

  const handleRestore = async (trashPath: string) => {
    setRestoring(trashPath);
    try {
      await restoreTrash(trashPath);
      const rows = await listTrash();
      setTrash(rows);
    } finally {
      setRestoring(null);
    }
  };

  return (
    <div className="flex flex-col gap-2 p-3">
      <div className="flex items-center gap-1.5">
        <Inbox size={12} className="text-[var(--accent)]" />
        <div className="text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--text-muted)]">
          Agent inbox
        </div>
        {unreadCount > 0 ? (
          <button
            type="button"
            className="ml-auto flex items-center gap-1 rounded-full border border-[var(--border)] px-2 py-0.5 text-[10px] font-medium text-[var(--text-muted)] hover:text-[var(--text-secondary)]"
            onClick={() => markAllPulseRead(vaultId)}
            title="Mark all pulse events as read"
          >
            <CheckCheck size={11} />
            Mark all read
          </button>
        ) : null}
      </div>
      <div className="flex flex-wrap gap-1">
        {filters.map((f) => (
          <button
            key={f.id}
            type="button"
            className={cn(
              "rounded-full border px-2 py-0.5 text-[10.5px] font-medium transition-colors",
              filter === f.id
                ? "border-[rgba(0,200,255,0.4)] bg-[rgba(0,200,255,0.12)] text-[var(--accent)]"
                : "border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--text-secondary)]",
            )}
            aria-pressed={filter === f.id}
            onClick={() => setFilter(f.id)}
          >
            {f.label}
            {typeof f.count === "number" && f.count > 0 ? (
              <span className="ml-1 opacity-80">{f.count}</span>
            ) : null}
          </button>
        ))}
      </div>

      {/* Wave C — live conflict pairs */}
      {(filter === "conflict" || filter === "inbox") && conflictItems.length > 0 ? (
        <div className="flex flex-col gap-1.5">
          <div className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--danger)]">
            Open conflicts
          </div>
          <ul className="flex flex-col gap-1">
            {conflictItems.slice(0, 12).map((item: any) => (
              <li
                key={item.key}
                className="rounded-[10px] border border-[rgba(255,69,58,0.2)] bg-[rgba(255,69,58,0.06)] px-2.5 py-2"
              >
                <div className="flex items-start gap-2">
                  <AlertTriangle
                    size={12}
                    className="mt-0.5 shrink-0 text-[var(--danger)]"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[13px] font-medium text-[var(--text-primary)]">
                      {item.title}
                    </div>
                    <div className="truncate text-[11px] text-[var(--text-muted)]">
                      {item.sibling.path}
                    </div>
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      <button
                        type="button"
                        className="chip-btn"
                        onClick={() =>
                          openConflictStudio({
                            primaryPath: item.primaryPath,
                            siblingPath: item.sibling.path,
                          })
                        }
                      >
                        Review
                      </button>
                      <button
                        type="button"
                        className="chip-btn"
                        onClick={() =>
                          void resolveConflictKeepMine(
                            item.primaryPath,
                            item.sibling.path,
                          )
                        }
                      >
                        Keep mine
                      </button>
                      <button
                        type="button"
                        className="chip-btn"
                        onClick={() =>
                          openConflictPair(
                            item.primaryPath,
                            item.sibling.path,
                          )
                        }
                      >
                        Open both
                      </button>
                      <button
                        type="button"
                        className="chip-btn"
                        onClick={() =>
                          dismissConflictFromList(
                            item.primaryPath,
                            item.sibling.path,
                          )
                        }
                      >
                        Dismiss
                      </button>
                    </div>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {filtered.length === 0 &&
      !(
        (filter === "conflict" || filter === "inbox") &&
        conflictItems.length > 0
      ) ? (
        <EmptyState
          compact
          icon={<Activity size={18} />}
          title={filter === "inbox" ? "Inbox clear" : "No matching activity"}
          description={
            filter === "inbox"
              ? "External writes, agents, and conflicts show up here for review."
              : filter === "conflict"
                ? "No conflict copies in this vault."
                : "Creates, disk sync, conflicts, and agent writes will appear here."
          }
        />
      ) : (
        <ul className="flex flex-col gap-1">
          {filtered.map((ev) => {
            const meta = KIND_META[ev.kind];
            const Icon = meta.icon;
            const noteExists =
              Object.values(nodes).some(
                (n) => n.kind === "note" && n.path === ev.path,
              ) ||
              (ev.kind === "conflict" &&
                Object.values(nodes).some(
                  (n) =>
                    n.kind === "note" &&
                    n.path.includes(".conflict-") &&
                    n.path
                      .replace(/\.conflict-.+\.md$/i, ".md")
                      .toLowerCase() ===
                      ev.path
                        .replace(/\.conflict-.+\.md$/i, ".md")
                        .toLowerCase(),
                ));
            const isInbox =
              ev.kind === "external" ||
              ev.kind === "hermes" ||
              ev.kind === "conflict";
            return (
              <li key={ev.id}>
                <div
                  className={cn(
                    "tree-row flex w-full items-start gap-2.5 rounded-[10px] px-2.5 py-2 text-left transition-colors",
                    noteExists || ev.path === "vault"
                      ? "hover:bg-white/[0.05]"
                      : "opacity-70",
                    ev.read && "opacity-55",
                  )}
                >
                  <button
                    type="button"
                    disabled={!noteExists && ev.path !== "vault"}
                    className="flex min-w-0 flex-1 items-start gap-2.5 text-left"
                    onClick={() => {
                      if (noteExists || ev.path === "vault") openPath(ev.path);
                      if (!ev.read) markPulseRead(ev.id);
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
                        {!ev.read && isInbox ? (
                          <span
                            className="h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--accent)]"
                            title="Unread"
                          />
                        ) : null}
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
                  <div className="flex shrink-0 flex-col gap-1 self-center">
                    {ev.kind === "conflict" ? (
                      <button
                        type="button"
                        className="chip-btn"
                        onClick={() => openConflictStudio()}
                      >
                        Review
                      </button>
                    ) : null}
                    {isInbox && !ev.read ? (
                      <button
                        type="button"
                        className="chip-btn"
                        title="Mark as read"
                        onClick={() => markPulseRead(ev.id)}
                      >
                        Read
                      </button>
                    ) : null}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {/* Wave C — Recently deleted / trash restore */}
      {disk ? (
        <div className="mt-3 border-t border-[var(--border)] pt-3">
          <div className="mb-2 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--text-muted)]">
            <Trash2 size={11} className="opacity-70" />
            Recently deleted
          </div>
          {trash.length === 0 ? (
            <p className="px-1 text-[11.5px] text-[var(--text-muted)]">
              Soft-deleted notes appear here for restore.
            </p>
          ) : (
            <ul className="flex flex-col gap-1">
              {trash.slice(0, 12).map((t) => (
                <li
                  key={t.trashPath}
                  className="flex items-center gap-2 rounded-[10px] px-2.5 py-2 hover:bg-white/[0.04]"
                >
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[13px] font-medium text-[var(--text-primary)]">
                      {t.name.replace(/\.md$/i, "")}
                    </div>
                    <div className="truncate text-[11px] text-[var(--text-muted)]">
                      {t.originalPath}
                    </div>
                  </div>
                  <button
                    type="button"
                    className="chip-btn shrink-0"
                    disabled={restoring === t.trashPath}
                    onClick={() => void handleRestore(t.trashPath)}
                    title={`Restore ${t.originalPath}`}
                  >
                    <RotateCcw size={11} className="mr-1 inline" />
                    {restoring === t.trashPath ? "…" : "Restore"}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  );
}
