/**
 * Bulk vault mutations for agent / Hermes bursts.
 * Coalesces dozens–hundreds of creates into few store updates + disk flushes.
 */

import type { VaultNode } from "./types";
import { pathJoin, parentPath, noteTitle } from "./types";
import { slugifyTitle } from "@/lib/utils";

export type BulkFolderSpec = {
  /** Vault-relative folder path, e.g. "Journal/2026" */
  path: string;
};

export type BulkNoteSpec = {
  /** Vault-relative path ending in .md, e.g. "Journal/flight.md" */
  path: string;
  /** Markdown body; default is a single H1 from the filename */
  content?: string;
  title?: string;
};

export type BulkImportInput = {
  folders?: BulkFolderSpec[];
  notes?: BulkNoteSpec[];
  /** When true (default false for bulk), don't switch the open note */
  activateLast?: boolean;
  /** Toast summary when done */
  silent?: boolean;
};

export type BulkImportResult = {
  folderIds: string[];
  noteIds: string[];
  created: number;
  skipped: number;
};

export function ensureMdPath(path: string): string {
  const clean = path.replace(/\\/g, "/").replace(/^\/+/, "").replace(/\/+/g, "/");
  if (!clean) return "Untitled.md";
  return clean.toLowerCase().endsWith(".md") ? clean : `${clean}.md`;
}

export function titleFromPath(path: string): string {
  const base = path.split("/").pop() || "Untitled";
  return base.replace(/\.md$/i, "");
}

/** Ensure parent folder paths exist for a set of file paths. */
export function collectFolderPaths(paths: string[]): string[] {
  const set = new Set<string>();
  for (const p of paths) {
    const parts = p.replace(/\\/g, "/").split("/").filter(Boolean);
    // drop filename if .md
    const isNote = parts[parts.length - 1]?.toLowerCase().endsWith(".md");
    const folderParts = isNote ? parts.slice(0, -1) : parts;
    let acc = "";
    for (const part of folderParts) {
      acc = acc ? `${acc}/${part}` : part;
      set.add(acc);
    }
  }
  // parents before children
  return Array.from(set).sort(
    (a, b) => a.split("/").length - b.split("/").length || a.localeCompare(b),
  );
}

export function defaultNoteContent(title: string, body?: string): string {
  if (body != null && body.length > 0) {
    if (/^#\s+/m.test(body)) return body;
    return `# ${title}\n\n${body.replace(/^\n+/, "")}`;
  }
  return `# ${title}\n\n`;
}

export function uniquePath(
  desired: string,
  existing: Set<string>,
): string {
  if (!existing.has(desired)) return desired;
  const isNote = desired.toLowerCase().endsWith(".md");
  const stem = isNote ? desired.slice(0, -3) : desired;
  const ext = isNote ? ".md" : "";
  let i = 1;
  while (existing.has(`${stem} ${i}${ext}`)) i++;
  return `${stem} ${i}${ext}`;
}

export function pathToName(path: string): string {
  return path.split("/").pop() || path;
}

export function resolveParentId(
  path: string,
  pathToId: Map<string, string>,
): string | null {
  const parent = parentPath(path);
  if (!parent) return null;
  return pathToId.get(parent) ?? null;
}

export function buildPathIndex(
  nodes: Record<string, VaultNode>,
): Map<string, string> {
  const m = new Map<string, string>();
  for (const n of Object.values(nodes)) m.set(n.path, n.id);
  return m;
}

export function slugifyFolderSegment(name: string): string {
  return slugifyTitle(name) || "New Folder";
}

export { noteTitle, pathJoin, parentPath, slugifyTitle };
