/**
 * Note templates + daily note helpers — human habit spine for Nexus.
 * All output is plain Markdown (Hermes-safe).
 */

import { getPrefs } from "@/lib/prefs/preferences";
import { emptyCanvasTemplate } from "@/lib/vault/canvas";

export const DEFAULT_DAILY_FOLDER = "Journal";

/** Single top-level folder name for daily notes (no slashes). */
export function sanitizeDailyFolder(raw: string | undefined | null): string {
  const cleaned = String(raw ?? "")
    .trim()
    .replace(/\\/g, "/")
    .replace(/^\/+|\/+$/g, "");
  const first = (cleaned.split("/")[0] ?? "")
    .replace(/[<>:"|?*\u0000-\u001f]/g, "")
    .trim();
  if (!first || first === "." || first === ".." || first.length > 64) {
    return DEFAULT_DAILY_FOLDER;
  }
  return first;
}

export function dailyFolder(): string {
  try {
    return sanitizeDailyFolder(getPrefs().dailyFolder);
  } catch {
    return DEFAULT_DAILY_FOLDER;
  }
}

export type NoteTemplateId =
  | "blank"
  | "daily"
  | "meeting"
  | "idea"
  | "project"
  | "canvas";

export type NoteTemplate = {
  id: NoteTemplateId;
  label: string;
  description: string;
  defaultTitle: string;
  preferredFolder?: string;
  build: (ctx: TemplateContext) => string;
};

export type TemplateContext = {
  title: string;
  date: Date;
};

export function formatDateISO(d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function formatDateLong(d: Date = new Date()): string {
  return d.toLocaleDateString(undefined, {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

export function shiftDate(d: Date, delta: number): Date {
  const next = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  next.setDate(next.getDate() + delta);
  return next;
}

export function dailyNotePath(d: Date = new Date()): string {
  return `${dailyFolder()}/${formatDateISO(d)}.md`;
}

export function isJournalDailyPath(path: string): boolean {
  return /^[^/]+\/\d{4}-\d{2}-\d{2}\.md$/i.test(path.replace(/\\/g, "/"));
}

export function isTodayDailyPath(path: string, d: Date = new Date()): boolean {
  return path.replace(/\\/g, "/") === dailyNotePath(d);
}

export function parseJournalDailyDate(path: string): Date | null {
  const m = /^[^/]+\/(\d{4})-(\d{2})-(\d{2})\.md$/i.exec(
    path.replace(/\\/g, "/"),
  );
  if (!m) return null;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

export function upgradeSparseDailySkeleton(md: string): string {
  return md
    .replace(/- \\\[ \\\]/g, "- [ ] ")
    .replace(/(## Focus\r?\n+)(?:- \[ \]|\\?-)\s*(?=\r?\n|$)/, "$1- [ ] ")
    .replace(/(## Later\r?\n+)(?:- \[ \]|\\?-)\s*(?=\r?\n|$)/, "$1- [ ] ")
    .replace(/^- \[ \](?! )/gm, "- [ ] ");
}

export function collectExistingDailyIsos(
  nodes: Record<string, { kind: string; path: string }>,
): Set<string> {
  const set = new Set<string>();
  for (const n of Object.values(nodes)) {
    if (n.kind !== "note") continue;
    const m = /^[^/]+\/(\d{4}-\d{2}-\d{2})\.md$/i.exec(
      n.path.replace(/\\/g, "/"),
    );
    if (m) set.add(m[1]);
  }
  return set;
}

export function dailyNoteTitle(d: Date = new Date()): string {
  return formatDateISO(d);
}

export function extractCarryForwardItems(markdown: string): string[] {
  const items: string[] = [];
  const seen = new Set<string>();
  const push = (line: string) => {
    const t = line.trim();
    if (!t) return;
    if (seen.has(t)) return;
    seen.add(t);
    items.push(t);
  };
  for (const raw of markdown.split("\n")) {
    const m = /^\s*-\s+\[ \]\s+(.+)$/.exec(raw);
    if (m && m[1].trim()) {
      push(`- [ ] ${m[1].trim()}`);
    }
  }
  const focusMatch =
    /^##\s+Focus\s*\n([\s\S]*?)(?=^##\s+|\s*$)/m.exec(markdown);
  if (focusMatch) {
    for (const raw of focusMatch[1].split("\n")) {
      const done = /^\s*-\s+\[[xX]\]\s+/.test(raw);
      if (done) continue;
      const unchecked = /^\s*-\s+\[ \]\s+(.+)$/.exec(raw);
      if (unchecked && unchecked[1].trim()) {
        continue;
      }
      const bullet = /^\s*-\s+(?!\[)(.+)$/.exec(raw);
      if (bullet && bullet[1].trim()) {
        push(`- ${bullet[1].trim()}`);
      }
    }
  }
  return items;
}

export function injectCarryForward(
  content: string,
  items: string[],
): string {
  if (items.length === 0) return content;
  const block = ["## From yesterday", "", ...items, ""].join("\n");
  if (/^##\s+Later\b/m.test(content)) {
    return content.replace(/^##\s+Later\b/m, `${block}\n## Later`);
  }
  if (/^##\s+Notes\b/m.test(content)) {
    return content.replace(/^##\s+Notes\b/m, `${block}\n## Notes`);
  }
  return `${content.trimEnd()}\n\n${block}\n`;
}

export function buildDailyNoteContent(
  date: Date = new Date(),
  yesterdayMarkdown?: string | null,
): string {
  let content = buildTemplateContent("daily", formatDateLong(date), date);
  if (yesterdayMarkdown) {
    const items = extractCarryForwardItems(yesterdayMarkdown);
    content = injectCarryForward(content, items);
  }
  return content;
}

export const NOTE_TEMPLATES: NoteTemplate[] = [
  {
    id: "blank",
    label: "Blank note",
    description: "Empty note with a title heading",
    defaultTitle: "Untitled",
    build: ({ title }) => `# ${title}\n\n`,
  },
  {
    id: "daily",
    label: "Daily note",
    description: "Today’s dated page in your daily folder",
    defaultTitle: formatDateISO(),
    preferredFolder: DEFAULT_DAILY_FOLDER,
    build: ({ date }) => {
      const long = formatDateLong(date);
      const iso = formatDateISO(date);
      return [
        `# ${long}`,
        "",
        `*${iso}*`,
        "",
        "## Focus",
        "",
        "- [ ] ",
        "",
        "## Notes",
        "",
        "",
        "## Later",
        "",
        "- [ ] ",
        "",
      ].join("\n");
    },
  },
  {
    id: "meeting",
    label: "Meeting",
    description: "Agenda, notes, actions",
    defaultTitle: "Meeting",
    preferredFolder: "Meetings",
    build: ({ title, date }) => {
      const iso = formatDateISO(date);
      return [
        `# ${title}`,
        "",
        `**Date:** ${iso}`,
        "",
        "## Attendees",
        "",
        "- ",
        "",
        "## Agenda",
        "",
        "1. ",
        "",
        "## Notes",
        "",
        "",
        "## Action items",
        "",
        "- [ ] ",
        "",
      ].join("\n");
    },
  },
  {
    id: "idea",
    label: "Idea",
    description: "Capture a spark before it fades",
    defaultTitle: "Idea",
    preferredFolder: "Ideas",
    build: ({ title }) =>
      [
        `# ${title}`,
        "",
        "## The idea",
        "",
        "",
        "## Why it matters",
        "",
        "",
        "## Next step",
        "",
        "- [ ] ",
        "",
        "## Related",
        "",
        "- [[",
        "",
      ].join("\n"),
  },
  {
    id: "project",
    label: "Project",
    description: "Goals, status, and open loops",
    defaultTitle: "Project",
    preferredFolder: "Projects",
    build: ({ title }) =>
      [
        `# ${title}`,
        "",
        "**Status:** Active",
        "",
        "## Goal",
        "",
        "",
        "## Current focus",
        "",
        "- ",
        "",
        "## Open loops",
        "",
        "- [ ] ",
        "",
        "## Log",
        "",
        "",
      ].join("\n"),
  },
  {
    id: "canvas",
    label: "Canvas",
    description: "Spatial board of cards — still a Markdown file",
    defaultTitle: "Untitled board",
    preferredFolder: "Canvases",
    build: ({ title }) => emptyCanvasTemplate(title),
  },
];

export function getTemplate(id: NoteTemplateId): NoteTemplate {
  return NOTE_TEMPLATES.find((t) => t.id === id) ?? NOTE_TEMPLATES[0];
}

export function buildTemplateContent(
  id: NoteTemplateId,
  title: string,
  date: Date = new Date(),
): string {
  const t = getTemplate(id);
  return t.build({ title: title.replace(/\.md$/i, ""), date });
}

export function extractLeadingH1(markdown: string): string | null {
  const m = /^(?:\uFEFF)?#\s+(.+?)\s*$/m.exec(markdown);
  if (!m) return null;
  const title = m[1].replace(/\s+#+\s*$/, "").trim();
  return title || null;
}

export function isUntitledName(name: string): boolean {
  const stem = name.replace(/\.md$/i, "").trim();
  return /^untitled(\s+\d+)?$/i.test(stem);
}
