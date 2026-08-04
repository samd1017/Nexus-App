import { useMemo, useRef } from "react";
import {
  CalendarDays,
  FilePlus,
  FileText,
  FolderPlus,
  Hash,
  PanelLeftClose,
  Search,
} from "lucide-react";
import { VaultSwitcher } from "@/components/vault/VaultSwitcher";
import { FileTree } from "@/components/vault/FileTree";
import { NewNoteMenu } from "@/components/vault/NewNoteMenu";
import { useVaultStore } from "@/lib/vault/store";
import { noteTitle } from "@/lib/vault/types";
import { usePrefsStore } from "@/lib/prefs/preferences";
import {
  dailyNotePath,
  formatDateISO,
  shiftDate,
} from "@/lib/vault/templates";
import { collectVaultTags, notesForTag } from "@/lib/vault/tags";
import { formatShortcut } from "@/lib/platform";
import { openCommandPalette } from "@/components/search/CommandPalette";
import { cn } from "@/lib/utils";

const DEFAULT_LEFT_WIDTH = 260;
const WEEKDAY_SHORT = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;

/** Monday-start week containing `ref` (local calendar). */
function weekDaysMondayStart(ref: Date = new Date()): Date[] {
  const d = new Date(ref.getFullYear(), ref.getMonth(), ref.getDate());
  const day = d.getDay(); // 0 = Sun
  const mondayOffset = day === 0 ? -6 : 1 - day;
  const monday = shiftDate(d, mondayOffset);
  return Array.from({ length: 7 }, (_, i) => shiftDate(monday, i));
}

export function LeftSidebar() {
  const leftOpen = useVaultStore((s) => s.settings.leftOpen);
  const leftWidth = useVaultStore((s) => s.settings.leftWidth);
  const setLeftOpen = useVaultStore((s) => s.setLeftOpen);
  const setLeftWidth = useVaultStore((s) => s.setLeftWidth);
  const setCommandOpen = useVaultStore((s) => s.setCommandOpen);
  const createFolder = useVaultStore((s) => s.createFolder);
  const openDailyNote = useVaultStore((s) => s.openDailyNote);
  const openDailyNoteForDate = useVaultStore((s) => s.openDailyNoteForDate);
  const activeNoteId = useVaultStore((s) => s.activeNoteId);
  const activePath = useVaultStore((s) => {
    const id = s.activeNoteId;
    if (!id) return null;
    const n = s.nodes[id];
    return n?.kind === "note" ? n.path : null;
  });
  const recentNoteVisits = useVaultStore((s) => s.recentNoteVisits);
  const setActiveNote = useVaultStore((s) => s.setActiveNote);
  const setToast = useVaultStore((s) => s.setToast);
  const nodes = useVaultStore((s) => s.nodes);
  const focusMode = usePrefsStore((s) => s.focusMode);
  const dragStartX = useRef(0);
  const dragStartWidth = useRef(0);

  const today = new Date();
  const todayIso = formatDateISO(today);
  const yesterday = shiftDate(today, -1);
  const yesterdayIso = formatDateISO(yesterday);
  const todayPath = dailyNotePath(today);
  const yesterdayPath = dailyNotePath(yesterday);
  const isTodayActive = activePath === todayPath;
  const isYesterdayActive = activePath === yesterdayPath;

  const weekDays = useMemo(() => weekDaysMondayStart(new Date()), []);

  const vaultTags = useMemo(
    () => collectVaultTags(nodes).slice(0, 12),
    [nodes],
  );

  // H2: visit-based Recent first — resolve only visit ids (not full nodes map)
  const recentNotes = useMemo(() => {
    const state = useVaultStore.getState();
    const nodes = state.nodes;
    const byVisit: (typeof nodes)[string][] = [];
    const seen = new Set<string>();
    for (const id of recentNoteVisits ?? []) {
      const n = nodes[id];
      if (n?.kind === "note" && !seen.has(id)) {
        byVisit.push(n);
        seen.add(id);
      }
      if (byVisit.length >= 5) break;
    }
    if (byVisit.length >= 5) return byVisit;
    const byMtime = Object.values(nodes)
      .filter((n) => n.kind === "note" && !seen.has(n.id))
      .sort((a, b) => b.mtime - a.mtime);
    for (const n of byMtime) {
      byVisit.push(n);
      if (byVisit.length >= 5) break;
    }
    return byVisit;
  }, [recentNoteVisits, activeNoteId]);

  // H5: true focus — no rail at all
  if (focusMode) return null;

  if (!leftOpen) {
    return (
      <div className="hidden w-11 shrink-0 flex-col items-center border-r border-[var(--border)] bg-[var(--bg-primary)] py-3 sm:w-12 md:flex">
        <button
          type="button"
          className="icon-btn"
          onClick={() => setLeftOpen(true)}
          title={`Show sidebar (${formatShortcut("\\")})`}
          aria-label="Show sidebar"
        >
          <PanelLeftClose size={16} className="rotate-180" />
        </button>
      </div>
    );
  }

  return (
    <>
      <button
        type="button"
        className="fixed inset-0 z-20 bg-black/50 md:hidden"
        aria-label="Close sidebar"
        onClick={() => setLeftOpen(false)}
      />
      <aside
        className="titlebar-no-drag panel-slide panel-solid absolute inset-y-0 left-0 z-30 flex h-full w-[min(280px,86vw)] shrink-0 flex-col border-r border-[var(--border)] bg-[var(--panel-solid)] md:relative md:z-0"
        style={{ width: leftWidth }}
      >
        <VaultSwitcher />

        <div className="sidebar-toolbar mt-3 flex items-center gap-1.5 px-3">
          <button
            type="button"
            onClick={() => setCommandOpen(true)}
            className="flex h-9 min-w-0 flex-1 items-center gap-2 rounded-[10px] border border-[var(--border)] bg-white/[0.03] px-2.5 text-left text-[12.5px] text-[var(--text-muted)] transition-colors hover:border-[rgba(0,200,255,0.25)] hover:text-[var(--text-secondary)]"
            title={`Search (${formatShortcut("K")})`}
            aria-label="Search"
          >
            <Search size={14} />
            <span className="flex-1 truncate">Search</span>
            <kbd className="hidden rounded border border-[var(--border)] bg-white/[0.04] px-1.5 py-0.5 font-mono text-[10px] text-[var(--text-muted)] sm:inline">
              {formatShortcut("K")}
            </kbd>
          </button>
          <NewNoteMenu title="New note" variant="icon">
            <FilePlus size={16} />
          </NewNoteMenu>
          <button
            type="button"
            className="icon-btn"
            title={`Daily note (${formatShortcut("D")})`}
            aria-label="Daily note"
            onClick={() => openDailyNote()}
          >
            <CalendarDays size={16} />
          </button>
          <button
            type="button"
            className="icon-btn"
            title="New folder"
            aria-label="New folder"
            onClick={() => createFolder(null)}
          >
            <FolderPlus size={16} />
          </button>
        </div>

        {/* Daily note shortcuts — section label only, not selection state */}
        <div className="mt-2 px-3">
          <div className="sidebar-section-label px-1 pb-1">
            <span className="text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--text-muted)]">
              Daily
            </span>
          </div>
          {/* Week strip: Mon–Sun day chips */}
          <div
            className="mb-1.5 flex items-center justify-between gap-0.5"
            role="group"
            aria-label="Week days"
          >
            {weekDays.map((d, i) => {
              const iso = formatDateISO(d);
              const path = dailyNotePath(d);
              const isActive = activePath === path;
              const isToday = iso === todayIso;
              const isYesterday = iso === yesterdayIso;
              return (
                <button
                  key={iso}
                  type="button"
                  onClick={() => openDailyNoteForDate(d)}
                  title={`${WEEKDAY_SHORT[i]} ${iso}${isToday ? " · Today" : isYesterday ? " · Yesterday" : ""}`}
                  className={cn(
                    "daily-chip daily-chip--day flex h-8 w-8 flex-col items-center justify-center rounded-lg border text-[11px] font-medium leading-none transition-colors",
                    isActive
                      ? "is-active"
                      : isToday
                        ? "border-[rgba(0,200,255,0.22)] bg-white/[0.04] text-[var(--text-primary)]"
                        : isYesterday
                          ? "border-[var(--border)] bg-white/[0.03] text-[var(--text-secondary)]"
                          : "border-transparent bg-transparent text-[var(--text-muted)] hover:border-[var(--border)] hover:bg-white/[0.04] hover:text-[var(--text-secondary)]",
                  )}
                >
                  <span className="text-[8.5px] font-semibold uppercase tracking-wide opacity-70">
                    {WEEKDAY_SHORT[i].slice(0, 1)}
                  </span>
                  <span className="mt-0.5 tabular-nums">{d.getDate()}</span>
                </button>
              );
            })}
          </div>
          <div className="flex flex-wrap gap-1.5">
            <button
              type="button"
              className={cn("daily-chip", isTodayActive && "is-active")}
              onClick={() => openDailyNote()}
              title={`Open today's daily note · ${todayIso}`}
            >
              Today
            </button>
            <button
              type="button"
              className={cn("daily-chip", isYesterdayActive && "is-active")}
              onClick={() => openDailyNoteForDate(yesterday)}
              title={`Open yesterday's daily note · ${yesterdayIso}`}
            >
              Yesterday
            </button>
          </div>
        </div>

        {recentNotes.length > 0 ? (
          <div className="mt-2 px-3">
            <div className="sidebar-section-label px-1 pb-1 text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--text-muted)]">
              Recent
            </div>
            <ul className="space-y-0.5">
              {recentNotes.map((n) => (
                <li key={n.id}>
                  <button
                    type="button"
                    onClick={() => setActiveNote(n.id)}
                    className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-[12.5px] text-[var(--text-secondary)] transition-colors hover:bg-white/[0.04] hover:text-[var(--text-primary)]"
                  >
                    <FileText size={12} className="shrink-0 opacity-50" />
                    <span className="truncate">{noteTitle(n)}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {vaultTags.length > 0 ? (
          <div className="mt-2 px-3">
            <div className="sidebar-section-label px-1 pb-1 text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--text-muted)]">
              Tags
            </div>
            <ul className="flex flex-wrap gap-1">
              {vaultTags.map((t) => (
                <li key={t.tag}>
                  <button
                    type="button"
                    onClick={() => {
                      const hits = notesForTag(nodes, t.tag);
                      if (hits[0]) setActiveNote(hits[0].id);
                      if (hits.length > 1) {
                        setToast(
                          `#${t.tag} · ${hits.length} note${hits.length === 1 ? "" : "s"}`,
                        );
                        openCommandPalette(`#${t.tag}`);
                      } else if (hits.length === 1) {
                        setToast(`#${t.tag}`);
                      }
                    }}
                    className="chip-btn gap-1 px-2 py-0.5 text-[11.5px]"
                    title={`${t.count} note${t.count === 1 ? "" : "s"} tagged #${t.tag}`}
                  >
                    <Hash size={11} className="opacity-70" />
                    {t.tag}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        <div className="sidebar-section-label mt-2 flex items-center justify-between px-4 pb-1">
          <span className="text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--text-muted)]">
            Files
          </span>
          <button
            type="button"
            className="icon-btn h-6 w-6"
            onClick={() => setLeftOpen(false)}
            title="Collapse sidebar"
            aria-label="Collapse sidebar"
          >
            <PanelLeftClose size={14} />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto" data-tree-scroll>
          <FileTree />
        </div>

        <div
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize left sidebar"
          title="Drag to resize · double-click to reset"
          className="panel-resize-handle titlebar-no-drag panel-resize-handle--right"
          onPointerDown={(e) => {
            e.preventDefault();
            dragStartX.current = e.clientX;
            dragStartWidth.current = leftWidth;
            e.currentTarget.setPointerCapture(e.pointerId);
          }}
          onPointerMove={(e) => {
            if (!e.currentTarget.hasPointerCapture(e.pointerId)) return;
            setLeftWidth(dragStartWidth.current + (e.clientX - dragStartX.current));
          }}
          onPointerUp={(e) => {
            if (e.currentTarget.hasPointerCapture(e.pointerId)) {
              e.currentTarget.releasePointerCapture(e.pointerId);
            }
          }}
          onDoubleClick={() => setLeftWidth(DEFAULT_LEFT_WIDTH)}
        />
      </aside>
    </>
  );
}
