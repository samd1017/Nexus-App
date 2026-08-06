import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import {
  dailyNotePath,
  formatDateISO,
  shiftDate,
} from "@/lib/vault/templates";
import { cn } from "@/lib/utils";

const WEEKDAY_SHORT = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;
const MONTH_LABELS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;

export type MonthCalendarProps = {
  /** ISO dates (YYYY-MM-DD) that already have a daily note */
  existingDailyIsos: ReadonlySet<string>;
  /** Currently open daily note path, if any */
  activePath: string | null;
  onSelectDate: (d: Date) => void;
  /** Optional controlled view month (1st of month) */
  viewMonth?: Date;
  onViewMonthChange?: (d: Date) => void;
  className?: string;
};

function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

function sameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

/** Build a Mon-start 6×7 grid covering `month` (1st of month). */
function buildMonthGrid(month: Date): (Date | null)[] {
  const first = startOfMonth(month);
  const daysInMonth = new Date(
    first.getFullYear(),
    first.getMonth() + 1,
    0,
  ).getDate();
  // JS: 0=Sun … 6=Sat → Mon-start offset
  const jsDay = first.getDay();
  const monOffset = jsDay === 0 ? 6 : jsDay - 1;
  const cells: (Date | null)[] = [];
  for (let i = 0; i < monOffset; i++) cells.push(null);
  for (let day = 1; day <= daysInMonth; day++) {
    cells.push(new Date(first.getFullYear(), first.getMonth(), day));
  }
  while (cells.length % 7 !== 0) cells.push(null);
  // Pad to 6 rows for stable height (no layout jump)
  while (cells.length < 42) cells.push(null);
  return cells;
}

export function MonthCalendar({
  existingDailyIsos,
  activePath,
  onSelectDate,
  viewMonth: controlledMonth,
  onViewMonthChange,
  className,
}: MonthCalendarProps) {
  const today = useMemo(() => {
    const n = new Date();
    return new Date(n.getFullYear(), n.getMonth(), n.getDate());
  }, []);

  const [internalMonth, setInternalMonth] = useState(() =>
    startOfMonth(today),
  );
  const viewMonth = controlledMonth
    ? startOfMonth(controlledMonth)
    : internalMonth;

  const setViewMonth = (d: Date) => {
    const next = startOfMonth(d);
    if (onViewMonthChange) onViewMonthChange(next);
    else setInternalMonth(next);
  };

  const cells = useMemo(() => buildMonthGrid(viewMonth), [viewMonth]);
  const monthLabel = `${MONTH_LABELS[viewMonth.getMonth()]} ${viewMonth.getFullYear()}`;

  return (
    <div
      className={cn("month-calendar select-none", className)}
      role="dialog"
      aria-label={`Calendar · ${monthLabel}`}
    >
      <div className="mb-2.5 flex items-center gap-1">
        <button
          type="button"
          className="icon-btn h-7 w-7 shrink-0"
          aria-label="Previous month"
          title="Previous month"
          onClick={() =>
            setViewMonth(
              new Date(viewMonth.getFullYear(), viewMonth.getMonth() - 1, 1),
            )
          }
        >
          <ChevronLeft size={14} />
        </button>
        <div className="min-w-0 flex-1 text-center text-[12.5px] font-semibold tracking-wide text-[var(--text-primary)]">
          {monthLabel}
        </div>
        <button
          type="button"
          className="icon-btn h-7 w-7 shrink-0"
          aria-label="Next month"
          title="Next month"
          onClick={() =>
            setViewMonth(
              new Date(viewMonth.getFullYear(), viewMonth.getMonth() + 1, 1),
            )
          }
        >
          <ChevronRight size={14} />
        </button>
      </div>

      <div
        className="mb-1.5 grid grid-cols-7 gap-0.5"
        aria-hidden
      >
        {WEEKDAY_SHORT.map((w) => (
          <div
            key={w}
            className="py-0.5 text-center text-[9px] font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]"
          >
            {w.slice(0, 2)}
          </div>
        ))}
      </div>

      <div
        className="grid grid-cols-7 gap-0.5"
        role="grid"
        aria-label={monthLabel}
      >
        {cells.map((d, i) => {
          if (!d) {
            return (
              <div
                key={`empty-${i}`}
                className="month-cal-cell month-cal-cell--empty"
                role="gridcell"
                aria-hidden
              />
            );
          }
          const iso = formatDateISO(d);
          const path = dailyNotePath(d);
          const isToday = sameDay(d, today);
          const isActive = activePath === path;
          const hasNote = existingDailyIsos.has(iso);
          return (
            <button
              key={iso}
              type="button"
              role="gridcell"
              aria-label={`${iso}${hasNote ? ", has daily note" : ""}${isToday ? ", today" : ""}`}
              aria-current={isToday ? "date" : undefined}
              aria-pressed={isActive}
              title={`${iso}${hasNote ? " · note exists" : ""}${isToday ? " · Today" : ""}`}
              onClick={() => onSelectDate(d)}
              className={cn(
                "month-cal-cell group relative flex flex-col items-center justify-center rounded-lg border text-[11.5px] font-medium tabular-nums transition-colors",
                isActive
                  ? "is-active border-[rgba(0,200,255,0.45)] bg-[rgba(0,200,255,0.12)] text-[var(--accent)] shadow-[0_0_0_1px_rgba(0,200,255,0.12)]"
                  : isToday
                    ? "border-[rgba(0,200,255,0.28)] bg-white/[0.04] text-[var(--text-primary)]"
                    : "border-transparent bg-transparent text-[var(--text-secondary)] hover:border-[var(--border)] hover:bg-white/[0.05] hover:text-[var(--text-primary)]",
              )}
            >
              <span>{d.getDate()}</span>
              <span
                className={cn(
                  "month-cal-dot mt-0.5 h-1 w-1 rounded-full transition-opacity",
                  hasNote
                    ? isActive
                      ? "bg-[var(--accent)] opacity-100"
                      : "bg-[rgba(0,200,255,0.75)] opacity-90"
                    : "opacity-0",
                )}
                aria-hidden
              />
            </button>
          );
        })}
      </div>

      <div className="mt-2.5 flex items-center justify-between gap-2 border-t border-[var(--border)] pt-2">
        <button
          type="button"
          className="daily-chip px-2.5 py-0.5 text-[11px]"
          onClick={() => {
            setViewMonth(today);
            onSelectDate(today);
          }}
          title={`Jump to today · ${formatDateISO(today)}`}
        >
          Today
        </button>
        <button
          type="button"
          className="text-[11px] text-[var(--text-muted)] transition-colors hover:text-[var(--text-secondary)]"
          onClick={() => setViewMonth(shiftDate(today, 0))}
          title="Show current month"
        >
          This month
        </button>
      </div>
    </div>
  );
}
