/**
 * 🔁 rules. A small fixed grammar read by Nexus, not a date library:
 *
 *   every day | every 3 days | every week | every 2 weeks | every month | every year
 *   every weekday | every weekend | every monday | every mon, wed, fri
 *   every week on tuesday | every 2 weeks on monday and thursday
 *   every month on the 15th | every month on the last | every 3 months on the 1st
 *   every month on the last friday | every month on the second tuesday
 *   every year on march 3
 *   daily | weekly | monthly | yearly
 *
 * Any rule may end with "when done": the next date counts from the day it was
 * checked off instead of from the date on the line.
 */

import { addDays, addMonths, daysInMonth, formatYmd, isYmd, monthIndex, parseYmd, weekdayIndex, weekdayOf } from "./dates";

export type RecurrenceRule = {
  text: string;
  whenDone: boolean;
  shape:
    | { kind: "interval"; unit: "day" | "week" | "month" | "year"; every: number }
    | { kind: "weekdays"; days: number[]; every: number }
    | { kind: "monthday"; day: number | "last"; every: number }
    | { kind: "nthweekday"; nth: 1 | 2 | 3 | 4 | -1; weekday: number; every: number }
    | { kind: "yearday"; month: number; day: number };
};

export const RECURRENCE_EXAMPLES = "every day, every 2 weeks, every weekday, every mon, wed, every month on the 15th, every month on the last friday, or every year on march 3";

const ALIASES: Record<string, string> = {
  daily: "every day",
  weekly: "every week",
  monthly: "every month",
  yearly: "every year",
  annually: "every year",
  biweekly: "every 2 weeks",
  fortnightly: "every 2 weeks",
  weekdays: "every weekday",
};

const ORDINAL: Record<string, 1 | 2 | 3 | 4 | -1> = {
  first: 1, "1st": 1, second: 2, "2nd": 2, third: 3, "3rd": 3, fourth: 4, "4th": 4, last: -1,
};

function count(raw: string | undefined): number | null {
  if (!raw) return 1;
  const n = Number(raw);
  return Number.isInteger(n) && n >= 1 && n <= 999 ? n : null;
}

/** `monday, wed and fri` → [1, 3, 5]. Null when any word is not a weekday. */
function weekdayList(raw: string): number[] | null {
  const words = raw.split(/\s*(?:,|\band\b|&|\s)\s*/).filter(Boolean);
  if (!words.length) return null;
  const days = new Set<number>();
  for (const word of words) {
    const at = weekdayIndex(word.replace(/s$/, "")) ?? weekdayIndex(word);
    if (at === null) return null;
    days.add(at);
  }
  return [...days].sort((a, b) => a - b);
}

/** The rule, or null when Nexus does not read it. */
export function parseRecurrence(text: string): RecurrenceRule | null {
  let body = text.trim().toLowerCase().replace(/\s+/g, " ").replace(/[.!]+$/, "");
  if (!body) return null;
  let whenDone = false;
  const done = /^(.*?),? when done$/.exec(body);
  if (done) {
    whenDone = true;
    body = (done[1] ?? "").trim();
  }
  body = ALIASES[body] ?? body;
  const rule = (shape: RecurrenceRule["shape"]): RecurrenceRule => ({ text: text.trim(), whenDone, shape });

  const interval = /^every(?: (\d+))? (day|week|month|year)s?$/.exec(body);
  if (interval) {
    const every = count(interval[1]);
    return every ? rule({ kind: "interval", unit: interval[2] as "day", every }) : null;
  }
  if (body === "every weekday") return rule({ kind: "weekdays", days: [1, 2, 3, 4, 5], every: 1 });
  if (body === "every weekend") return rule({ kind: "weekdays", days: [0, 6], every: 1 });
  const weekOn = /^every(?: (\d+))? weeks? on (.+)$/.exec(body);
  if (weekOn) {
    const every = count(weekOn[1]);
    const days = weekdayList(weekOn[2] ?? "");
    return every && days ? rule({ kind: "weekdays", days, every }) : null;
  }
  const monthDay = /^every(?: (\d+))? months? on the (\d{1,2})(?:st|nd|rd|th)?$/.exec(body);
  if (monthDay) {
    const every = count(monthDay[1]);
    const day = Number(monthDay[2]);
    return every && day >= 1 && day <= 31 ? rule({ kind: "monthday", day, every }) : null;
  }
  const monthLast = /^every(?: (\d+))? months? on the last(?: day)?$/.exec(body);
  if (monthLast) {
    const every = count(monthLast[1]);
    return every ? rule({ kind: "monthday", day: "last", every }) : null;
  }
  const nth = /^every(?: (\d+))? months? on the (first|second|third|fourth|last|1st|2nd|3rd|4th) ([a-z]+)$/.exec(body);
  if (nth) {
    const every = count(nth[1]);
    const weekday = weekdayIndex(nth[3] ?? "");
    const which = ORDINAL[nth[2] ?? ""];
    return every && weekday !== null && which ? rule({ kind: "nthweekday", nth: which, weekday, every }) : null;
  }
  const yearOn = /^every year on (?:([a-z]+) (\d{1,2})(?:st|nd|rd|th)?|(\d{1,2})(?:st|nd|rd|th)? ([a-z]+))$/.exec(body);
  if (yearOn) {
    const month = monthIndex(yearOn[1] ?? yearOn[4] ?? "");
    const day = Number(yearOn[2] ?? yearOn[3]);
    if (month === null || day < 1 || day > daysInMonth(2024, month + 1)) return null;
    return rule({ kind: "yearday", month: month + 1, day });
  }
  const list = /^every (.+)$/.exec(body);
  if (list) {
    const days = weekdayList(list[1] ?? "");
    if (days) return rule({ kind: "weekdays", days, every: 1 });
  }
  return null;
}

/** Monday-start week number, for "every 2 weeks on …". */
function weekKey(ymd: string): number {
  const p = parseYmd(ymd);
  if (!p) return 0;
  const ms = Date.UTC(p.y, p.m - 1, p.d);
  const dow = (new Date(ms).getUTCDay() + 6) % 7;
  return Math.floor((ms / 86_400_000 - dow) / 7);
}

function nthWeekdayOf(y: number, m: number, nth: 1 | 2 | 3 | 4 | -1, weekday: number): string {
  if (nth === -1) {
    const last = daysInMonth(y, m);
    const lastDow = weekdayOf(formatYmd(y, m, last)) ?? 0;
    return formatYmd(y, m, last - ((lastDow - weekday + 7) % 7));
  }
  const firstDow = weekdayOf(formatYmd(y, m, 1)) ?? 0;
  const first = 1 + ((weekday - firstDow + 7) % 7);
  return formatYmd(y, m, first + (nth - 1) * 7);
}

function monthStep(basis: string, every: number, pick: (y: number, m: number) => string): string {
  const p = parseYmd(basis) as { y: number; m: number; d: number };
  const here = pick(p.y, p.m);
  if (here > basis) return here;
  const shifted = parseYmd(addMonths(formatYmd(p.y, p.m, 1), every) as string) as { y: number; m: number };
  return pick(shifted.y, shifted.m);
}

/** The first date after `basis` this rule lands on. */
export function nextOccurrence(rule: RecurrenceRule, basis: string): string | null {
  if (!isYmd(basis)) return null;
  const shape = rule.shape;
  if (shape.kind === "interval") {
    if (shape.unit === "day") return addDays(basis, shape.every);
    if (shape.unit === "week") return addDays(basis, shape.every * 7);
    if (shape.unit === "month") return addMonths(basis, shape.every);
    return addMonths(basis, shape.every * 12);
  }
  if (shape.kind === "weekdays") {
    let at = basis;
    for (let i = 0; i < 7; i += 1) {
      at = addDays(at, 1) as string;
      if (shape.days.includes(weekdayOf(at) ?? -1)) break;
    }
    if (shape.every > 1 && weekKey(at) !== weekKey(basis)) at = addDays(at, (shape.every - 1) * 7) as string;
    return at;
  }
  if (shape.kind === "monthday") {
    return monthStep(basis, shape.every, (y, m) => formatYmd(y, m, shape.day === "last" ? daysInMonth(y, m) : Math.min(shape.day, daysInMonth(y, m))));
  }
  if (shape.kind === "nthweekday") {
    return monthStep(basis, shape.every, (y, m) => nthWeekdayOf(y, m, shape.nth, shape.weekday));
  }
  const p = parseYmd(basis) as { y: number };
  const pick = (y: number) => formatYmd(y, shape.month, Math.min(shape.day, daysInMonth(y, shape.month)));
  const here = pick(p.y);
  return here > basis ? here : pick(p.y + 1);
}
