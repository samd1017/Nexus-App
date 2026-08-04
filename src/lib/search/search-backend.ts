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
