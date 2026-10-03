/**
 * One-click starting points for an empty query block, built from this vault's
 * own folders, tags and frontmatter so the first result is never empty.
 * Reads the folder index and the cached tag list; no full-vault body walk.
 */

import { ensureVaultIndex } from "@/lib/vault/indexes";
import { getTopVaultTags } from "@/lib/vault/tags";
import { noteTableProperties } from "@/lib/vault/note-table";
import type { VaultNode } from "@/lib/vault/types";

export type QueryStarter = { label: string; hint: string; query: string };

/** Frontmatter keys worth grouping a board by, in order of preference. */
const BOARD_KEYS = ["status", "stage", "state", "priority", "type", "category", "kind", "rating"];
const PROPERTY_SAMPLE = 300;

function quoteFolder(path: string): string {
  return `"${path.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

function topFolder(nodes: Record<string, VaultNode>): { path: string; ids: string[] } | null {
  const index = ensureVaultIndex(nodes);
  let best: { path: string; ids: string[] } | null = null;
  for (const id of index.getChildIds(null)) {
    const folder = nodes[id];
    if (!folder || folder.kind !== "folder" || folder.name.startsWith(".")) continue;
    const ids = index.getChildIds(id).filter((child) => nodes[child]?.kind === "note" && /\.md$/i.test(nodes[child]!.path));
    if (!best || ids.length > best.ids.length) best = { path: folder.path, ids };
  }
  return best && best.ids.length ? best : null;
}

function boardKey(nodes: Record<string, VaultNode>, ids: string[]): string | null {
  const counts = new Map<string, number>();
  let read = 0;
  for (const id of ids) {
    if (read >= PROPERTY_SAMPLE) break;
    const content = nodes[id]?.content;
    if (typeof content !== "string") continue;
    read += 1;
    for (const key of Object.keys(noteTableProperties(content))) {
      const lower = key.toLowerCase();
      if (BOARD_KEYS.includes(lower)) counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  }
  let best: string | null = null;
  for (const [key, n] of counts) {
    if (n < 2) continue;
    if (!best || BOARD_KEYS.indexOf(key.toLowerCase()) < BOARD_KEYS.indexOf(best.toLowerCase())) best = key;
  }
  return best;
}

export function queryStarters(nodes: Record<string, VaultNode> | null | undefined): QueryStarter[] {
  const map = nodes ?? {};
  const out: QueryStarter[] = [];
  const folder = topFolder(map);
  const tags = getTopVaultTags(map, 2);
  if (folder) {
    out.push({
      label: "Recently edited",
      hint: `Last 7 days in ${folder.path}, newest first`,
      query: `TABLE file.folder AS "Folder", file.mtime AS "Edited"\nFROM ${quoteFolder(folder.path)}\nWHERE file.mtime >= date(today) - 7d\nSORT file.mtime DESC\nLIMIT 20`,
    });
  }
  out.push({
    label: "Open tasks",
    hint: "Most urgent first; tick them here",
    query: "TASK WHERE open\nSORT urgency DESC\nLIMIT 25",
  });
  if (folder) {
    const key = boardKey(map, folder.ids);
    out.push(
      key
        ? {
            label: `${key} board`,
            hint: `${folder.path}, grouped by ${key}`,
            query: `TABLE ${key}, file.mtime AS "Edited"\nFROM ${quoteFolder(folder.path)}\nGROUP BY ${key}\nSORT file.mtime DESC`,
          }
        : {
            label: `${folder.path} table`,
            hint: "Every note in the folder",
            query: `TABLE file.mtime AS "Edited", file.size AS "Size"\nFROM ${quoteFolder(folder.path)}\nSORT file.mtime DESC`,
          },
    );
  }
  const [first, second] = tags;
  if (first) {
    out.push({ label: `#${first.tag}`, hint: `${first.count} tagged notes`, query: `LIST FROM #${first.tag}\nSORT file.name` });
  }
  if (second || first) {
    const tag = (second ?? first)!.tag;
    out.push({ label: `#${tag} cards`, hint: "A card per note", query: `CARDS file.folder AS "Folder", file.mtime AS "Edited"\nFROM #${tag}` });
  }
  return out;
}
