/**
 * Light tag support — plain #tags in Markdown (Hermes-safe, no proprietary DB).
 * Tags are extracted from note bodies; optional YAML-ish frontmatter tags: too.
 */

import type { VaultNode } from "./types";
import { noteTitle } from "./types";

const TAG_RE = /(?:^|[\s([{])#([a-zA-Z][\w/-]{0,48})\b/g;
const FRONTMATTER_TAGS =
  /^---\r?\n([\s\S]*?)\r?\n---/;

/** Strip fenced code so # in code isn't a tag */
function stripCode(md: string): string {
  return md
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`[^`\n]+`/g, " ");
}

export function extractTagsFromMarkdown(markdown: string): string[] {
  const tags = new Set<string>();
  const fm = FRONTMATTER_TAGS.exec(markdown);
  if (fm) {
    const block = fm[1];
    const tagsLine = /^tags:\s*(.+)$/im.exec(block);
    if (tagsLine) {
      const raw = tagsLine[1].trim();
      if (raw.startsWith("[")) {
        for (const m of raw.matchAll(/["']?([a-zA-Z][\w/-]*)["']?/g)) {
          if (m[1] && m[1].toLowerCase() !== "tags") tags.add(m[1].toLowerCase());
        }
      } else {
        for (const part of raw.split(/[,\s]+/)) {
          const t = part.replace(/^#/, "").trim();
          if (t) tags.add(t.toLowerCase());
        }
      }
    }
  }
  const body = stripCode(markdown);
  TAG_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = TAG_RE.exec(body))) {
    tags.add(m[1].toLowerCase());
  }
  return Array.from(tags).sort();
}

export function noteHasTag(content: string, tag: string): boolean {
  const needle = tag.replace(/^#/, "").toLowerCase();
  return extractTagsFromMarkdown(content).includes(needle);
}

export type TagHit = {
  tag: string;
  count: number;
  noteIds: string[];
};

/** Aggregate tags across the vault */
export function collectVaultTags(
  nodes: Record<string, VaultNode>,
): TagHit[] {
  const map = new Map<string, Set<string>>();
  for (const n of Object.values(nodes)) {
    if (n.kind !== "note") continue;
    for (const t of extractTagsFromMarkdown(n.content ?? "")) {
      let set = map.get(t);
      if (!set) {
        set = new Set();
        map.set(t, set);
      }
      set.add(n.id);
    }
  }
  return Array.from(map.entries())
    .map(([tag, ids]) => ({
      tag,
      count: ids.size,
      noteIds: Array.from(ids),
    }))
    .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag));
}

export function notesForTag(
  nodes: Record<string, VaultNode>,
  tag: string,
): VaultNode[] {
  const needle = tag.replace(/^#/, "").toLowerCase();
  return Object.values(nodes)
    .filter(
      (n) =>
        n.kind === "note" &&
        extractTagsFromMarkdown(n.content ?? "").includes(needle),
    )
    .sort((a, b) => noteTitle(a).localeCompare(noteTitle(b)));
}
