/**
 * Single search path: DurableIndex FTS (memory now, SQLite later).
 * Fuse kept only as last-resort fallback if durable index fails to open.
 */

import type { SearchHit, VaultNode } from "@/lib/vault/types";
import { searchVault as fuseSearchVault } from "./fuse-search";
import { indexedSearch } from "./indexed-search";
import { getScaleFlags, type SearchBackendKind } from "@/lib/vault/scale-flags";
import { getDurableIndex } from "@/lib/vault/durable-index";

export interface SearchBackend {
  kind: SearchBackendKind;
  search(
    nodes: Record<string, VaultNode>,
    query: string,
    limit?: number,
  ): SearchHit[];
}

class FuseSearchBackend implements SearchBackend {
  kind = "fuse" as const;
  search(
    nodes: Record<string, VaultNode>,
    query: string,
    limit = 40,
  ): SearchHit[] {
    return fuseSearchVault(nodes, query, limit);
  }
}

class IndexedSearchBackend implements SearchBackend {
  kind = "worker" as const;
  search(
    nodes: Record<string, VaultNode>,
    query: string,
    limit = 40,
  ): SearchHit[] {
    return indexedSearch(nodes, query, limit);
  }
}

/**
 * Primary path: DurableIndex FTS when open; else inverted index; fuse only if forced.
 */
class FtsSearchBackend implements SearchBackend {
  kind = "fts5" as const;
  search(
    nodes: Record<string, VaultNode>,
    query: string,
    limit = 40,
  ): SearchHit[] {
    const idx = getDurableIndex();
    if (idx?.ready) {
      return idx.searchFts(query, limit);
    }
    return indexedSearch(nodes, query, limit);
  }
}

const fuseBackend = new FuseSearchBackend();
const indexedBackend = new IndexedSearchBackend();
const ftsBackend = new FtsSearchBackend();

export function getSearchBackend(): SearchBackend {
  const kind = getScaleFlags().searchBackend;
  if (kind === "fuse") return fuseBackend;
  if (kind === "worker") return indexedBackend;
  return ftsBackend;
}

/** Always use the primary scale-safe backend (no note-count engine switch). */
export function searchWithBackend(
  nodes: Record<string, VaultNode>,
  query: string,
  limit?: number,
): SearchHit[] {
  return getSearchBackend().search(nodes, query, limit);
}

/** Post-filter search hits by path: / folder: substring semantics. */
export function filterHitsByPathOps(
  hits: SearchHit[],
  pathFilter: string | null,
  folderFilter: string | null,
): SearchHit[] {
  let out = hits;
  if (pathFilter) {
    const needle = pathFilter.toLowerCase();
    out = out.filter((h) => h.path.toLowerCase().includes(needle));
  }
  if (folderFilter) {
    const needle = folderFilter.toLowerCase();
    out = out.filter((h) => {
      const p = h.path.toLowerCase();
      if (p.includes(needle)) return true;
      const slash = p.lastIndexOf("/");
      const folder = slash >= 0 ? p.slice(0, slash) : "";
      return folder.includes(needle);
    });
  }
  return out;
}

/**
 * Scale-safe path:/folder: search.
 * Path tokens live in FTS/inverted index — query the needle through the
 * backend (bounded oversample), then apply path/folder substring filters.
 * Never sample a fixed 48 notes and filter (false negatives at 45k).
 */
export function searchWithPathFolderOps(
  nodes: Record<string, VaultNode>,
  freeText: string,
  pathFilter: string | null,
  folderFilter: string | null,
  limit = 16,
): SearchHit[] {
  const hasOps = Boolean(pathFilter || folderFilter);
  const free = freeText.trim();
  // Oversample only when we will post-filter; keep bounded (not O(n))
  const oversample = hasOps ? Math.min(Math.max(limit * 8, 64), 256) : limit;

  let base: SearchHit[];
  if (free) {
    base = searchWithBackend(nodes, free, oversample);
  } else if (hasOps) {
    // Needle → inverted/FTS (path tokens). Do NOT sample all notes.
    const needle = [pathFilter, folderFilter].filter(Boolean).join(" ");
    base = searchWithBackend(nodes, needle, oversample);
  } else {
    return searchWithBackend(nodes, "", limit);
  }

  return filterHitsByPathOps(base, pathFilter, folderFilter).slice(0, limit);
}
