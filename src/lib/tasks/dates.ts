/**
 * Calendar days as YYYY-MM-DD. Task dates have no time and no zone: "today" is
 * the local calendar day of the machine reading the vault.
 */

export type Ymd = { y: number; m: number; d: number };

const WEEKDAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
const MONTHS = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];

export function parseYmd(ymd: string): Ymd | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return null;
  const y = Number(ymd.slice(0, 4));
  const m = Number(ymd.slice(5, 7));
  const d = Number(ymd.slice(8, 10));
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  return { y, m, d };
}

export function isYmd(text: string | null | undefined): text is string {
  return typeof text === "string" && parseYmd(text) !== null;
}

/** isYmd without narrowing, for text that is already a string. */
export function isYmdText(text: string): boolean {
  return parseYmd(text) !== null;
}

export function formatYmd(y: number, m: number, d: number): string {
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/** Local calendar day of `now`. */
export function localToday(now = new Date()): string {
  return formatYmd(now.getFullYear(), now.getMonth() + 1, now.getDate());
}

function utc(ymd: string): Date | null {
  const p = parseYmd(ymd);
  return p ? new Date(Date.UTC(p.y, p.m - 1, p.d)) : null;
}

function fromUtc(dt: Date): string {
  return formatYmd(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate());
}

export function addDays(ymd: string, days: number): string | null {
  const dt = utc(ymd);
  if (!dt) return null;
  dt.setUTCDate(dt.getUTCDate() + days);
  return fromUtc(dt);
}

/** Month math keeps the day, or the last day of a shorter month (Jan 31 + 1 month = Feb 28). */
export function addMonths(ymd: string, months: number): string | null {
  const p = parseYmd(ymd);
  if (!p) return null;
  const total = p.y * 12 + (p.m - 1) + months;
  const y = Math.floor(total / 12);
  const m = (total % 12) + 1;
  return formatYmd(y, m, Math.min(p.d, daysInMonth(y, m)));
}

export function daysInMonth(y: number, m: number): number {
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

/** Whole days from `a` to `b` (b - a). */
export function daysBetween(a: string, b: string): number | null {
  const da = utc(a);
  const db = utc(b);
  if (!da || !db) return null;
  return Math.round((db.getTime() - da.getTime()) / 86_400_000);
}

/** 0 = Sunday. */
export function weekdayOf(ymd: string): number | null {
  const dt = utc(ymd);
  return dt ? dt.getUTCDay() : null;
}

export function weekdayIndex(word: string): number | null {
  const w = word.toLowerCase().replace(/\.$/, "");
  if (w.length < 2) return null;
  const at = WEEKDAYS.findIndex((day) => day === w || (w.length >= 3 && day.startsWith(w)) || (w === "tues" && day === "tuesday") || (w === "thurs" && day === "thursday"));
  return at >= 0 ? at : null;
}

export function monthIndex(word: string): number | null {
  const w = word.toLowerCase().replace(/\.$/, "");
  if (w.length < 3) return null;
  const at = MONTHS.findIndex((month) => month === w || month.startsWith(w));
  return at >= 0 ? at : null;
}

export function weekdayName(index: number): string {
  const name = WEEKDAYS[((index % 7) + 7) % 7] ?? "";
  return name.charAt(0).toUpperCase() + name.slice(1);
}

/** Next date strictly after `from` that falls on `weekday`. */
export function nextWeekday(from: string, weekday: number): string | null {
  const at = weekdayOf(from);
  if (at === null) return null;
  const ahead = ((weekday - at + 7) % 7) || 7;
  return addDays(from, ahead);
}

/**
 * A spoken date relative to `today`: today, tomorrow, yesterday, monday or mon (the next one),
 * next week / month / year, in 3 days, in 2 weeks, oct 5, 5 october, 2026/10/05.
 * Null when the words are not a date.
 */
export function resolveNaturalDate(text: string, today: string): string | null {
  const raw = text.trim().toLowerCase().replace(/\s+/g, " ");
  if (!raw || !isYmd(today)) return null;
  if (isYmdText(raw)) return raw;
  if (raw === "today" || raw === "tod") return today;
  if (raw === "tomorrow" || raw === "tom" || raw === "tmr") return addDays(today, 1);
  if (raw === "yesterday") return addDays(today, -1);
  const slashed = /^(\d{4})[/.](\d{1,2})[/.](\d{1,2})$/.exec(raw);
  if (slashed) {
    const ymd = formatYmd(Number(slashed[1]), Number(slashed[2]), Number(slashed[3]));
    return isYmd(ymd) ? ymd : null;
  }
  const loose = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(raw);
  if (loose) {
    const ymd = formatYmd(Number(loose[1]), Number(loose[2]), Number(loose[3]));
    return isYmd(ymd) ? ymd : null;
  }
  const next = /^next (week|month|year)$/.exec(raw);
  if (next) {
    if (next[1] === "week") return addDays(today, 7);
    if (next[1] === "month") return addMonths(today, 1);
    return addMonths(today, 12);
  }
  const inN = /^(?:in )?(\d{1,3}) ?(d|days?|w|wks?|weeks?|mo|months?|y|years?)$/.exec(raw);
  if (inN && (raw.startsWith("in ") || /[a-z]{3,}$/.test(raw))) {
    const n = Number(inN[1]);
    const unit = inN[2] ?? "";
    if (unit.startsWith("d")) return addDays(today, n);
    if (unit.startsWith("w")) return addDays(today, n * 7);
    if (unit.startsWith("mo")) return addMonths(today, n);
    return addMonths(today, n * 12);
  }
  const weekday = /^(?:next |this |on )?([a-z]+)$/.exec(raw);
  if (weekday) {
    const index = weekdayIndex(weekday[1] ?? "");
    if (index !== null) return nextWeekday(today, index);
  }
  const monthFirst = /^([a-z]+)\.? (\d{1,2})(?:st|nd|rd|th)?(?:,? (\d{4}))?$/.exec(raw);
  const dayFirst = /^(\d{1,2})(?:st|nd|rd|th)? ([a-z]+)\.?(?:,? (\d{4}))?$/.exec(raw);
  const md = monthFirst
    ? { month: monthIndex(monthFirst[1] ?? ""), day: Number(monthFirst[2]), year: monthFirst[3] }
    : dayFirst
      ? { month: monthIndex(dayFirst[2] ?? ""), day: Number(dayFirst[1]), year: dayFirst[3] }
      : null;
  if (md && md.month !== null) {
    const base = parseYmd(today) as Ymd;
    let year = md.year ? Number(md.year) : base.y;
    let ymd = formatYmd(year, md.month + 1, md.day);
    if (!isYmd(ymd)) return null;
    if (!md.year && ymd < today) {
      year += 1;
      ymd = formatYmd(year, md.month + 1, md.day);
    }
    return isYmd(ymd) ? ymd : null;
  }
  return null;
}

/** "Today", "Tomorrow", "Fri", "Oct 5", or "Oct 5, 2027" for a row; overdue days are counted. */
export function friendlyDay(ymd: string, today: string): string {
  const delta = daysBetween(today, ymd);
  if (delta === null) return ymd;
  if (delta === 0) return "Today";
  if (delta === 1) return "Tomorrow";
  if (delta === -1) return "Yesterday";
  if (delta < 0) return `${-delta} days ago`;
  const p = parseYmd(ymd) as Ymd;
  if (delta < 7) return weekdayName(weekdayOf(ymd) ?? 0).slice(0, 3);
  const month = (MONTHS[p.m - 1] ?? "").slice(0, 3);
  const label = `${month.charAt(0).toUpperCase()}${month.slice(1)} ${p.d}`;
  const t = parseYmd(today) as Ymd;
  return p.y === t.y ? label : `${label}, ${p.y}`;
}
