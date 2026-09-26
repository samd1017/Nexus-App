/**
 * Single search path: DurableIndex when open.
 *
 * HONEST ENGINE NAMES — do not call the JS inverted index “SQLite FTS5”:
 * - sqlite-fts5-bm25: Tauri native index with searchFtsAsync (desktop only)
 * - memory-fts-capped: in-process inverted index, 800-candidate cap (web / FSA / benches)
 * - inverted / fuse: fallbacks when no durable index is open
 */

import type { SearchHit, VaultNode } from "@/lib/vault/types";
import { searchVault as fuseSearchVault } from "./fuse-search";
import { indexedSearch } from "./indexed-search";
import { getScaleFlags, type SearchBackendKind } from "@/lib/vault/scale-flags";
import { getDurableIndex } from "@/lib/vault/durable-index";
import { searchOpenPageTitles } from "@/lib/vault/shell-catalog";
import {
  getSearchIndexState,
  MEMORY_FTS_ENGINE_LABEL,
  sqliteEngineShortLabel,
  type SearchIndexState,
} from "@/lib/vault/sqlite-fill-progress";

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
 * DurableIndex path. Flag name `fts5` means “use durable index”, NOT that
 * SQLite FTS5 BM25 is running. See describeSearchEngine().
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

  async searchAsync(
    nodes: Record<string, VaultNode>,
    query: string,
    limit = 40,
  ): Promise<SearchHit[]> {
    const page = searchOpenPageTitles(nodes, query, limit);
    const idx = getDurableIndex();
    let rest: SearchHit[] = [];
    if (idx?.ready && idx.searchFtsAsync) {
      try {
        rest = await idx.searchFtsAsync(query, limit);
      } catch {
        rest = idx.searchFts(query, limit);
      }
    } else {
      rest = this.search(nodes, query, limit);
    }
    if (page.length === 0) return rest;
    const seen = new Set(page.map((hit) => hit.noteId));
    return [...page, ...rest.filter((hit) => !seen.has(hit.noteId))].slice(0, limit);
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

export type SearchEngineId =
  | "sqlite-fts5-bm25"
  | "memory-fts-capped"
  | "inverted"
  | "fuse";

export function describeSearchEngine(): {
  id: SearchEngineId;
  label: string;
  shortLabel: string;
  /** Calm heading copy. Desktop keeps the SQLite name the soak checks for. */
  uiLabel: string;
  ranked: boolean;
  indexState: SearchIndexState;
} {
  const flag = getScaleFlags().searchBackend;
  if (flag === "fuse") {
    return {
      id: "fuse",
      label: "Fuse.js",
      shortLabel: "Fuse",
      uiLabel: "In this vault",
      ranked: false,
      indexState: "idle",
    };
  }
  if (flag === "worker") {
    return {
      id: "inverted",
      label: "In-process inverted index",
      shortLabel: "Inverted",
      uiLabel: "In this vault",
      ranked: false,
      indexState: "idle",
    };
  }
  const idx = getDurableIndex();
  if (idx?.ready && (idx.kind === "sqlite" || idx.kind === "native") && idx.searchFtsAsync) {
    const indexState = getSearchIndexState();
    const sqlite = sqliteEngineShortLabel(indexState);
    return {
      id: "sqlite-fts5-bm25",
      label: "SQLite FTS5 BM25 (desktop)",
      shortLabel: sqlite,
      uiLabel: sqlite,
      ranked: true,
      indexState,
    };
  }
  if (idx?.ready) {
    return {
      id: "memory-fts-capped",
      label: "In-memory FTS (800-candidate cap, not SQLite BM25)",
      shortLabel: MEMORY_FTS_ENGINE_LABEL,
      uiLabel: MEMORY_FTS_ENGINE_LABEL,
      ranked: false,
      indexState: "idle",
    };
  }
  return {
    id: "inverted",
    label: "In-process inverted index",
    shortLabel: "Inverted",
    uiLabel: "In this vault",
    ranked: false,
    indexState: "idle",
  };
}

/** Desktop: native BM25 FTS5 only when the sqlite index exposes searchFtsAsync. */
export async function searchWithBackendAsync(
  nodes: Record<string, VaultNode>,
  query: string,
  limit?: number,
): Promise<SearchHit[]> {
  const backend = getSearchBackend();
  if (backend instanceof FtsSearchBackend) {
    return backend.searchAsync(nodes, query, limit);
  }
  return backend.search(nodes, query, limit);
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
