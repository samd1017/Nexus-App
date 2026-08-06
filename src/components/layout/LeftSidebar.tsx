import { useMemo, useRef, useState } from "react";
import * as Popover from "@radix-ui/react-popover";
import {
  CalendarDays,
  ChevronDown,
  ChevronRight,
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
import { MonthCalendar } from "@/components/layout/MonthCalendar";
import { useVaultStore } from "@/lib/vault/store";
import { noteTitle } from "@/lib/vault/types";
import { usePrefsStore } from "@/lib/prefs/preferences";
import {
  collectExistingDailyIsos,
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
  const sidebarRecentOpen = usePrefsStore((s) => s.sidebarRecentOpen);
  const sidebarTagsOpen = usePrefsStore((s) => s.sidebarTagsOpen);
  const updatePrefs = usePrefsStore((s) => s.updatePrefs);
  const dragStartX = useRef(0);
  const dragStartWidth = useRef(0);
  const [monthOpen, setMonthOpen] = useState(false);
  const [viewMonth, setViewMonth] = useState(() => {
    const n = new Date();
    return new Date(n.getFullYear(), n.getMonth(), 1);
  });

  const today = new Date();
  const todayIso = formatDateISO(today);
  const yesterday = shiftDate(today, -1);
  const yesterdayIso = formatDateISO(yesterday);
  const todayPath = dailyNotePath(today);
  const yesterdayPath = dailyNotePath(yesterday);
  const isTodayActive = activePath === todayPath;
  const isYesterdayActive = activePath === yesterdayPath;

  const weekDays = useMemo(() => weekDaysMondayStart(new Date()), []);

  const vaultTags = useMemo(() => collectVaultTags(nodes), [nodes]);
  const visibleTags = useMemo(() => vaultTags.slice(0, 12), [vaultTags]);
  const tagCount = vaultTags.length;

  const existingDailyIsos = useMemo(
    () => collectExistingDailyIsos(nodes),
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
  }, [recentNoteVisits]);

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
        className="titlebar-no-drag panel-slide panel-solid absolute inset-y-0 left-0 z-30 flex h-full min-h-0 w-[min(280px,86vw)] shrink-0 flex-col overflow-hidden border-r border-[var(--border)] bg-[var(--panel-solid)] md:relative md:z-0"
        style={{ width: leftWidth }}
      >
        {/* 1. Vault switcher */}
        <VaultSwitcher />

        {/* 2. Search / toolbar */}
        <div className="sidebar-toolbar mt-3 flex shrink-0 items-center gap-1.5 px-3">
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

        {/* 3. Daily — compact; month calendar expands in popover */}
        <div className="mt-2 shrink-0 px-3">
          <div className="sidebar-section-label flex items-center justify-between gap-1 px-1 pb-1">
            <Popover.Root open={monthOpen} onOpenChange={setMonthOpen}>
              <Popover.Trigger asChild>
                <button
                  type="button"
                  className={cn(
                    "group flex items-center gap-1 rounded-md px-0.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--text-muted)] transition-colors hover:text-[var(--text-secondary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgba(0,200,255,0.45)]",
                    monthOpen && "text-[var(--accent)]",
                  )}
                  aria-expanded={monthOpen}
                  aria-haspopup="dialog"
                  title="Open month calendar"
                >
                  <span>Daily</span>
                  <CalendarDays
                    size={11}
                    className={cn(
                      "opacity-60 transition-opacity group-hover:opacity-100",
                      monthOpen && "text-[var(--accent)] opacity-100",
                    )}
                  />
                  <ChevronDown
                    size={11}
                    className={cn(
                      "opacity-50 transition-transform duration-150",
                      monthOpen && "rotate-180 opacity-90",
                    )}
                  />
                </button>
              </Popover.Trigger>
              <Popover.Portal>
                <Popover.Content
                  side="bottom"
                  align="start"
                  sideOffset={6}
                  collisionPadding={16}
                  className="month-cal-popover z-[80] w-[min(280px,calc(100vw-24px))] rounded-[14px] border border-[var(--border)] bg-[rgba(16,16,20,0.98)] p-3.5 shadow-[0_20px_56px_rgba(0,0,0,0.6),0_0_0_1px_rgba(0,200,255,0.08)] backdrop-blur-xl outline-none"
                  onOpenAutoFocus={(e) => e.preventDefault()}
                  onEscapeKeyDown={() => setMonthOpen(false)}
                >
                  <MonthCalendar
                    existingDailyIsos={existingDailyIsos}
                    activePath={activePath}
                    viewMonth={viewMonth}
                    onViewMonthChange={setViewMonth}
                    onSelectDate={(d) => {
                      void openDailyNoteForDate(d);
                      setMonthOpen(false);
                    }}
                  />
                </Popover.Content>
              </Popover.Portal>
            </Popover.Root>
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
              const hasNote = existingDailyIsos.has(iso);
              return (
                <button
                  key={iso}
                  type="button"
                  onClick={() => openDailyNoteForDate(d)}
                  title={`${WEEKDAY_SHORT[i]} ${iso}${isToday ? " · Today" : isYesterday ? " · Yesterday" : ""}${hasNote ? " · note" : ""}`}
                  className={cn(
                    "daily-chip daily-chip--day relative flex h-8 w-8 flex-col items-center justify-center rounded-lg border text-[11px] font-medium leading-none transition-colors",
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
                  {hasNote ? (
                    <span
                      className={cn(
                        "absolute bottom-0.5 h-0.5 w-0.5 rounded-full",
                        isActive ? "bg-[var(--accent)]" : "bg-[rgba(0,200,255,0.65)]",
                      )}
                      aria-hidden
                    />
                  ) : null}
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

        {/* 4. Notes/Folders — primary scroll region */}
        <div className="sidebar-section-label mt-2 flex shrink-0 items-center justify-between px-4 pb-1">
          <span className="text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--text-muted)]">
            Notes/Folders
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

        <div className="flex min-h-0 min-w-0 flex-1 flex-col" data-tree-scroll>
          <FileTree />
        </div>

        {/* Footer stack: always visible below tree (not clipped by tree scroll) */}
        <div className="flex shrink-0 flex-col border-t border-[var(--border)] bg-[var(--panel-solid)]">
        {/* 5. Recent — collapsible */}
        {recentNotes.length > 0 ? (
          <div className="shrink-0 px-3 pt-1.5 pb-1">
            <button
              type="button"
              className="sidebar-section-label group flex w-full items-center gap-1 rounded-md px-1 py-1 text-left transition-colors hover:bg-white/[0.03] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgba(0,200,255,0.45)]"
              aria-expanded={sidebarRecentOpen}
              onClick={() =>
                updatePrefs({ sidebarRecentOpen: !sidebarRecentOpen })
              }
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  updatePrefs({ sidebarRecentOpen: !sidebarRecentOpen });
                }
              }}
            >
              {sidebarRecentOpen ? (
                <ChevronDown
                  size={12}
                  className="shrink-0 text-[var(--text-muted)] opacity-70"
                  aria-hidden
                />
              ) : (
                <ChevronRight
                  size={12}
                  className="shrink-0 text-[var(--text-muted)] opacity-70"
                  aria-hidden
                />
              )}
              <span className="text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--text-muted)] group-hover:text-[var(--text-secondary)]">
                {sidebarRecentOpen
                  ? "Recent"
                  : `Recent · ${recentNotes.length}`}
              </span>
            </button>
            {sidebarRecentOpen ? (
              <ul className="mt-0.5 space-y-0.5 pb-0.5">
                {recentNotes.map((n) => (
                  <li key={n.id}>
                    <button
                      type="button"
                      onClick={() => setActiveNote(n.id)}
                      className={cn(
                        "flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-[12.5px] transition-colors hover:bg-white/[0.04] hover:text-[var(--text-primary)]",
                        activeNoteId === n.id
                          ? "bg-white/[0.05] text-[var(--text-primary)]"
                          : "text-[var(--text-secondary)]",
                      )}
                    >
                      <FileText size={12} className="shrink-0 opacity-50" />
                      <span className="truncate">{noteTitle(n)}</span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : null}

        {/* 6. Tags — collapsible, default collapsed */}
        {tagCount > 0 ? (
          <div
            className={cn(
              "shrink-0 px-3 pb-2",
              recentNotes.length === 0 && "pt-1.5",
            )}
          >
            <button
              type="button"
              className="sidebar-section-label group flex w-full items-center gap-1 rounded-md px-1 py-1 text-left transition-colors hover:bg-white/[0.03] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgba(0,200,255,0.45)]"
              aria-expanded={sidebarTagsOpen}
              onClick={() => updatePrefs({ sidebarTagsOpen: !sidebarTagsOpen })}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  updatePrefs({ sidebarTagsOpen: !sidebarTagsOpen });
                }
              }}
            >
              {sidebarTagsOpen ? (
                <ChevronDown
                  size={12}
                  className="shrink-0 text-[var(--text-muted)] opacity-70"
                  aria-hidden
                />
              ) : (
                <ChevronRight
                  size={12}
                  className="shrink-0 text-[var(--text-muted)] opacity-70"
                  aria-hidden
                />
              )}
              <span className="text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--text-muted)] group-hover:text-[var(--text-secondary)]">
                {sidebarTagsOpen ? "Tags" : `Tags · ${tagCount}`}
              </span>
            </button>
            {sidebarTagsOpen ? (
              <ul className="mt-0.5 flex flex-wrap gap-1 pb-0.5">
                {visibleTags.map((t) => (
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
            ) : null}
          </div>
        ) : null}
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
