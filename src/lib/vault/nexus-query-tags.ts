/**
 * Tag lists for nexus-query when note bodies are stripped.
 * Tags live in sqlite tag_map. The in-memory mirror often has no tags[].
 */

import { getDurableIndex } from "@/lib/vault/durable-index";
import { NativeSqliteDurableIndex } from "@/lib/vault/native-sqlite-index";
import { NEXUS_QUERY_CAP, queryTags } from "@/lib/vault/nexus-query";
import {
  BROWSER_SHELL_DB,
  fetchShellTagNotes,
  type ShellRow,
} from "@/lib/vault/shell-catalog";
import { useVaultStore } from "@/lib/vault/store";
import type { VaultNode } from "@/lib/vault/types";

const TAG_TRIES = 4;
const TAG_WAIT_MS = [120, 280, 600, 1000];

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Sqlite file for tag_map. Materialized vaults keep shellCatalog off and shellDbPath null. */
export function indexDbPathForTags(): string | null {
  const state = useVaultStore.getState();
  const shell = state.shellDbPath;
  if (shell) return shell;
  const idx = getDurableIndex();
  if (idx instanceof NativeSqliteDurableIndex) {
    const path = idx.getDbPath();
    if (path) return path;
  }
  return null;
}

async function fetchTagPage(dbPath: string, tag: string): Promise<ShellRow[] | null> {
  for (let attempt = 0; attempt < TAG_TRIES; attempt++) {
    const page = await fetchShellTagNotes(dbPath, tag, NEXUS_QUERY_CAP);
    if (page) return page;
    if (attempt + 1 < TAG_TRIES) await sleep(TAG_WAIT_MS[attempt] ?? 400);
  }
  return null;
}

function nodeForRow(
  row: ShellRow,
  nodes: Record<string, VaultNode>,
  byPath: Map<string, VaultNode>,
): VaultNode {
  const byId = nodes[row.id];
  if (byId?.kind === "note") return byId;
  const path = row.path.replace(/\\/g, "/");
  const byP = byPath.get(path);
  if (byP?.kind === "note") return byP;
  return {
    id: row.id,
    path,
    name: row.name,
    kind: "note",
    parentId: row.parentId ?? null,
    mtime: row.mtime || 0,
  };
}

/**
 * One list per tag. A null slot means that tag's page failed after retries.
 * Other tags are kept. Null overall means there is no index to ask.
 */
export async function loadTagExtras(query: string): Promise<(VaultNode[] | null)[] | null> {
  const tags = queryTags(query);
  if (tags.length === 0) return null;
  let db = indexDbPathForTags();
  if (!db && useVaultStore.getState().mode === "desktop") {
    for (let i = 0; !db && i < 15; i++) {
      await sleep(400);
      db = indexDbPathForTags();
    }
  }
  if (!db) return null;
  const pages = await Promise.all(tags.map((tag) => fetchTagPage(db, tag)));
  if (pages.every((page) => page == null)) return null;
  const live = useVaultStore.getState();
  const byPath = new Map<string, VaultNode>();
  for (const node of Object.values(live.nodes)) {
    if (node?.kind === "note" && node.path) byPath.set(node.path, node);
  }
  const missing = pages
    .flatMap((page) => page ?? [])
    .filter((row) => !live.nodes[row.id] && !byPath.has(row.path.replace(/\\/g, "/")));
  if (missing.length && (live.shellCatalog || db === BROWSER_SHELL_DB)) {
    live.ingestShellRows(missing);
  }
  const nodes = useVaultStore.getState().nodes;
  const paths = new Map<string, VaultNode>();
  for (const node of Object.values(nodes)) {
    if (node?.kind === "note" && node.path) paths.set(node.path, node);
  }
  return pages.map((page) => (page == null ? null : page.map((row) => nodeForRow(row, nodes, paths))));
}
