import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { revealFolderInList } from "@/lib/chrome/reveal-list";
import { diskFolderRow, folderForEnter } from "@/lib/search/folder-enter";
import { switcherHits } from "@/lib/search/switcher-order";
import { getDesktopRoot, useVaultStore } from "@/lib/vault/store";
import { statDesktopFolder } from "@/lib/vault/tauri-adapter";
import { deskNodeId } from "@/lib/vault/desk-node-id";
import {
  searchWithBackend as searchVault,
  searchWithBackendAsync,
} from "@/lib/search/search-backend";
import {
  hasOrQuery,
  hasSearchOps,
  isTagOnlyQuery,
  parseSearchOps,
  planPagedDesktopSearch,
  searchDesktopOps,
  searchUsesLoadedBodies,
  searchWithOps,
  unsupportedSearchHint,
} from "@/lib/search/query-ops";
import { fuseSearchHits } from "@/lib/search/rank-fusion";
import { buildAskAnswer, retrieveForAsk } from "@/lib/search/ask-notes";
import { getBacklinks } from "@/lib/vault/backlinks";
import {
  BROWSER_SHELL_DB,
  fetchShellByPaths,
  mergeShellRows,
  fetchShellBroken,
  fetchShellOrphans,
  fetchShellPathPage,
  onShellCatalogWake,
  fetchShellRecent,
  fetchShellSearch,
  fetchShellSuggest,
  fetchShellTagNotes,
  fetchShellTags,
  searchOpenPageTitles,
} from "@/lib/vault/shell-catalog";
import { collectVaultTags, notesForTag } from "@/lib/vault/tags";
import { getAllBrokenLinks, getOrphanNotes, type VaultBrokenLink } from "@/lib/vault/broken-links";
import type { TrashEntry } from "@/lib/vault/trash";
import { noteTitle } from "@/lib/vault/types";
import type { SearchHit } from "@/lib/vault/types";
import { recentNoteIdsForVault } from "@/lib/vault/visit-history";
import { getDurableIndex } from "@/lib/vault/durable-index";
import { getSearchIndexState, isTitleSearchLive } from "@/lib/vault/sqlite-fill-progress";
import { snippetForSearchHit } from "@/lib/search/snippets";

type Store = ReturnType<typeof useVaultStore.getState>;

/** How many note rows the palette asks for. A full page is not the whole vault. */
export const PALETTE_RESULT_LIMIT = 16;

export function matchesQuery(label: string, keywords: string[], q: string): boolean {
  if (!q) return true;
  const lower = q.toLowerCase();
  const hay = `${label} ${keywords.join(" ")}`.toLowerCase();
  if (hay.includes(lower)) return true;
  const parts = lower.split(/\s+/).filter(Boolean);
  if (parts.length > 1) return parts.every((p) => hay.includes(p));
  return false;
}

/** Top notes by visit MRU, then mtime. */
export function topNotesByVisitMtime(
  nodes: Record<string, import("@/lib/vault/types").VaultNode>,
  limit: number,
  vaultId?: string | null,
): SearchHit[] {
  const durable = getDurableIndex();
  const visits = recentNoteIdsForVault(vaultId, nodes, limit);
  const seen = new Set<string>();
  const out: SearchHit[] = [];
  const snip = (n: import("@/lib/vault/types").VaultNode) =>
    snippetForSearchHit({
      path: n.path,
      content: n.content,
      durableBody:
        n.content === undefined
          ? durable?.getNoteMeta?.(n.id)?.bodySnippet
          : undefined,
      matchType: "title",
    });
  for (const id of visits) {
    const n = nodes[id];
    if (!n || n.kind !== "note") continue;
    seen.add(id);
    out.push({
      noteId: n.id,
      path: n.path,
      title: noteTitle(n),
      snippet: snip(n),
      score: 1,
      matchType: "title",
    });
    if (out.length >= limit) return out;
  }
  // Recents-only on large vaults — never sort 45k notes for an empty query.
  return out;
}

/** A folder picked in search lands in the list once it is known whether it is empty. */
export function revealSearchedFolder(id: string): void {
  revealFolderInList(id, { settle: useVaultStore.getState().settleFolderForEnter(id) });
}

type PaletteSearchInput = {
  open: boolean;
  query: string;
  nodes: Store["nodes"];
  vaultId: Store["vaultId"];
  activeNoteId: Store["activeNoteId"];
  shellCatalog: Store["shellCatalog"];
  shellDbPath: Store["shellDbPath"];
  shellLiveTick: Store["shellLiveTick"];
  searchIndexState: ReturnType<typeof getSearchIndexState>;
  inputRef: { current: HTMLInputElement | null };
  listTrash: Store["listTrash"];
  trashTick: Store["trashTick"];
};

export function usePaletteSearch({
  open,
  query,
  nodes,
  vaultId,
  activeNoteId,
  shellCatalog,
  shellDbPath,
  shellLiveTick,
  searchIndexState,
  inputRef,
  listTrash,
  trashTick,
}: PaletteSearchInput) {
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [trashItems, setTrashItems] = useState<TrashEntry[]>([]);
  useEffect(() => {
    if (!open) {
      setDebouncedSearch("");
      return;
    }
    const rawQ = query.trim();
    if (!rawQ || rawQ.startsWith(">")) {
      setDebouncedSearch("");
      return;
    }
    const t = window.setTimeout(() => setDebouncedSearch(query), 90);
    return () => window.clearTimeout(t);
  }, [open, query]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    void listTrash().then((rows) => {
      if (!cancelled) setTrashItems(rows);
    });
    return () => {
      cancelled = true;
    };
  }, [open, listTrash, trashTick]);

  const raw = query.trim();
  const isCommandMode = raw.startsWith(">");
  const q = isCommandMode ? raw.slice(1).trim() : raw;
  const pathFolderOps = useMemo(
    () =>
      isCommandMode
        ? parseSearchOps("")
        : parseSearchOps(raw),
    [isCommandMode, raw],
  );
  const searchText = isCommandMode ? "" : pathFolderOps.rest;
  const qLower = q.toLowerCase();
  const isTagBrowse =
    searchText.startsWith("#") ||
    (!hasSearchOps(pathFolderOps) &&
      q.startsWith("#"));
  const tagPartial = isTagBrowse
    ? (searchText.startsWith("#") ? searchText.slice(1) : q.slice(1)).toLowerCase()
    : "";
  const exactTagQuery = /^#([\w/-]+)$/i.exec(searchText || raw);
  const wantsOrphans =
    qLower === "is:orphan" ||
    qLower === "is:orphans" ||
    qLower === "orphan" ||
    qLower === "orphans";
  const wantsBroken =
    qLower === "is:broken" ||
    qLower === "broken" ||
    qLower === "broken links";
  const wantsDeleted =
    qLower === "is:deleted" ||
    qLower === "is:trash" ||
    qLower === "trash" ||
    qLower === "deleted" ||
    qLower === "restore";
  const hasPathFolderOp = hasSearchOps(pathFolderOps);
  const hasOr = hasOrQuery(pathFolderOps);
  const useOpsSearch = hasPathFolderOp || hasOr;
  const unsupportedHint = isCommandMode ? null : unsupportedSearchHint(pathFolderOps);
  const scopeHint = isCommandMode
    ? null
    : planPagedDesktopSearch({
        shellCatalog: Boolean(shellCatalog && shellDbPath),
        sqlite: Boolean(getDurableIndex()?.searchOpsAsync),
        ops: pathFolderOps,
      }).hint;
  const showAllActions = Boolean(raw) || isCommandMode;
  const actionQuery = isCommandMode
    ? q
    : searchText || (hasPathFolderOp ? "" : q);
  const isEmptyQuery = !raw && !isCommandMode;
  const isAskMode = !isCommandMode && /^(ask:|\?)\s+/i.test(raw);

  const syncHits = useMemo(() => {
    if (shellCatalog && shellDbPath && !hasOr && !searchUsesLoadedBodies(pathFolderOps)) {
      if (isEmptyQuery) return topNotesByVisitMtime(nodes, 10, vaultId);
      if ((exactTagQuery || isTagBrowse) && !hasPathFolderOp) return [];
      const needle = debouncedSearch.trim() || searchText || raw;
      if (
        needle &&
        !isCommandMode &&
        !wantsOrphans &&
        !wantsBroken &&
        !isAskMode &&
        !hasPathFolderOp
      ) {
        return searchOpenPageTitles(nodes, needle, PALETTE_RESULT_LIMIT);
      }
      if (wantsOrphans || wantsBroken || hasPathFolderOp) return [];
    }
    if (isEmptyQuery) {
      return topNotesByVisitMtime(nodes, 10, vaultId);
    }
    if (isTagBrowse && tagPartial === "" && !hasPathFolderOp) return [];
    if (exactTagQuery && !hasPathFolderOp) {
      return notesForTag(nodes, exactTagQuery[1]).map((n) => ({
        noteId: n.id,
        path: n.path,
        title: noteTitle(n),
        snippet: `#${exactTagQuery[1].toLowerCase()}`,
        score: 1,
        matchType: "title" as const,
      }));
    }
    if (wantsOrphans || wantsBroken || isCommandMode) return [];

    const recentIds = vaultId ? recentNoteIdsForVault(vaultId, nodes, PALETTE_RESULT_LIMIT) : [];
    const activeNode = activeNoteId ? nodes[activeNoteId] : null;
    const neighborIds =
      activeNode?.kind === "note"
        ? getBacklinks(activeNode, nodes).map((b) => b.fromId)
        : [];
    const signals = {
      recentIds,
      activeNoteId,
      neighborIds,
      queryText: debouncedSearch.trim() || raw,
    };

    if (isAskMode) {
      return retrieveForAsk(nodes, debouncedSearch.trim() || raw, signals, 8);
    }

    if (useOpsSearch) {
      return fuseSearchHits(
        searchWithOps(nodes, debouncedSearch.trim() || raw, PALETTE_RESULT_LIMIT),
        signals,
      );
    }
    const needle = debouncedSearch.trim() || searchText || raw;
    if (needle) {
      const idx = getDurableIndex();
      // Durable async search owns FTS. A second sync intersect at 100k
      // was enough extra allocation to discard Chrome on the 12th search.
      if (idx?.ready && idx.searchFtsAsync) return [];
      return fuseSearchHits(searchVault(nodes, needle, PALETTE_RESULT_LIMIT), signals);
    }
    return fuseSearchHits(searchVault(nodes, raw, PALETTE_RESULT_LIMIT), signals);
  }, [
    nodes,
    vaultId,
    raw,
    searchText,
    debouncedSearch,
    isEmptyQuery,
    isTagBrowse,
    tagPartial,
    exactTagQuery,
    wantsOrphans,
    wantsBroken,
    isCommandMode,
    hasPathFolderOp,
    hasOr,
    useOpsSearch,
    pathFolderOps.pathFilter,
    pathFolderOps.folderFilter,
    pathFolderOps.fileFilter,
    pathFolderOps.tagFilter,
    pathFolderOps.lineFilter,
    pathFolderOps.sectionFilter,
    pathFolderOps.excludes,
    isAskMode,
    activeNoteId,
    shellCatalog,
    shellDbPath,
  ]);

  const [asyncHits, setAsyncHits] = useState<SearchHit[] | null>(null);
  const [noteSearchPending, setNoteSearchPending] = useState(false);
  const [noteSearchFailed, setNoteSearchFailed] = useState(false);
  useEffect(() => {
    setAsyncHits(null);
    setNoteSearchPending(false);
    setNoteSearchFailed(false);
    const searchPlan = planPagedDesktopSearch({
      shellCatalog: Boolean(shellCatalog && shellDbPath),
      sqlite: Boolean(getDurableIndex()?.searchOpsAsync),
      ops: pathFolderOps,
    });
    if (
      searchPlan.engine === "sqlite-ops" &&
      shellDbPath &&
      shellDbPath !== BROWSER_SHELL_DB
    ) {
      let cancelled = false;
      setNoteSearchPending(true);
      void searchDesktopOps(raw, PALETTE_RESULT_LIMIT)
        .then((rows) => {
          if (cancelled) return;
          setNoteSearchPending(false);
          if (!rows) {
            setNoteSearchFailed(true);
            setAsyncHits([]);
            return;
          }
          setNoteSearchFailed(false);
          setAsyncHits(rows);
        })
        .catch(() => {
          if (cancelled) return;
          setNoteSearchPending(false);
          setNoteSearchFailed(true);
          setAsyncHits([]);
        });
      return () => {
        cancelled = true;
      };
    }
    if (searchPlan.engine === "window") {
      setAsyncHits([]);
      return;
    }
    if (shellCatalog && shellDbPath && !hasOr && !searchUsesLoadedBodies(pathFolderOps)) {
      let cancelled = false;
      const db = shellDbPath;
      const asHit = (id: string, path: string, title: string, snippet: string): SearchHit => ({
        noteId: id,
        path,
        title,
        snippet,
        score: 1,
        matchType: "title",
      });
      if (isEmptyQuery) {
        void fetchShellRecent(db, 10).then((rows) => {
          if (cancelled || !rows) return;
          const visits = topNotesByVisitMtime(useVaultStore.getState().nodes, 10, vaultId);
          const seen = new Set(visits.map((hit) => hit.noteId));
          const extra: SearchHit[] = [];
          for (const row of rows) {
            if (seen.has(row.id) || visits.length + extra.length >= 10) continue;
            extra.push(asHit(row.id, row.path, row.name.replace(/\.md$/i, ""), row.path));
          }
          setAsyncHits([...visits, ...extra]);
        });
        return () => {
          cancelled = true;
        };
      }
      if (isTagOnlyQuery(pathFolderOps) || (exactTagQuery && !hasPathFolderOp)) {
        const tag = pathFolderOps.tagFilter || (exactTagQuery ? exactTagQuery[1] : "");
        if (tag) {
          void fetchShellTagNotes(db, tag).then((rows) => {
            if (cancelled || !rows) return;
            setAsyncHits(rows.map((row) => asHit(row.id, row.path, row.name.replace(/\.md$/i, ""), `#${tag}`)));
          });
          return () => {
            cancelled = true;
          };
        }
      }
      if (hasPathFolderOp && db !== BROWSER_SHELL_DB) {
        const pathNeedle = pathFolderOps.pathFilter ?? "";
        const folderNeedle = pathFolderOps.folderFilter ?? "";
        const paint = (rows: Awaited<ReturnType<typeof fetchShellPathPage>>) => {
          if (cancelled || !rows) return;
          setAsyncHits(
            rows
              .filter((row) => row.kind === "note")
              .map((row) => asHit(row.id, row.path, row.name.replace(/\.md$/i, ""), row.path)),
          );
        };
        void fetchShellPathPage(db, pathNeedle, folderNeedle, PALETTE_RESULT_LIMIT).then((rows) => {
          if (cancelled) return;
          if (!rows) {
            const stop = onShellCatalogWake(() => {
              stop();
              if (cancelled) return;
              void fetchShellPathPage(db, pathNeedle, folderNeedle, PALETTE_RESULT_LIMIT).then(paint);
            });
            return;
          }
          paint(rows);
        });
        return () => {
          cancelled = true;
        };
      }
      if (
        isCommandMode ||
        isTagBrowse ||
        wantsOrphans ||
        wantsBroken ||
        isAskMode ||
        hasPathFolderOp
      ) {
        return;
      }
      const needle = debouncedSearch.trim() || searchText || raw;
      if (!needle.trim()) return;
      if (db === BROWSER_SHELL_DB) {
        setNoteSearchPending(true);
        void fetchShellSearch(db, needle, PALETTE_RESULT_LIMIT).then((hits) => {
          if (cancelled) return;
          setNoteSearchPending(false);
          if (!hits) {
            setNoteSearchFailed(true);
            return;
          }
          setNoteSearchFailed(false);
          setAsyncHits(
            hits
              .filter((hit) => hit.kind === "note")
              .map((hit) => asHit(hit.id, hit.path, hit.title || hit.name.replace(/\.md$/i, ""), hit.path)),
          );
        });
        return () => {
          cancelled = true;
          setNoteSearchPending(false);
        };
      }
      const idx = getDurableIndex();
      const titleLive = isTitleSearchLive(getSearchIndexState());
      const mapSuggest = (hits: Awaited<ReturnType<typeof fetchShellSuggest>>): SearchHit[] =>
        (hits ?? [])
          .filter((hit) => hit.kind === "note")
          .map((hit) =>
            asHit(hit.id, hit.path, hit.title || hit.name.replace(/\.md$/i, ""), hit.path),
          );
      // Titles come from the title index already in quick-switcher order
      // ("Topic 15", "Topic 150"…) and paint as soon as they arrive. The ranked
      // search runs once typing pauses and only adds what the titles missed; it
      // never reorders them or holds the first paint.
      const typed = (searchText || raw).trim();
      const settled = debouncedSearch.trim() === raw.trim();
      let catalogHits: SearchHit[] = [];
      let ftsHits: SearchHit[] = [];
      let catalogReady = false;
      const ftsAvailable = Boolean(idx?.ready && idx.searchFtsAsync);
      const ftsStarted = settled && ftsAvailable;
      let catalogSettled = false;
      // Still typing: the ranked search comes with the pause, so no hits yet
      // is not a miss yet.
      let ftsSettled = !ftsAvailable;
      setNoteSearchPending(true);
      const settleIfDone = () => {
        if (cancelled) return;
        if (catalogSettled && (ftsSettled || catalogHits.length > 0)) setNoteSearchPending(false);
      };
      const publish = () => {
        if (cancelled) return;
        if (!catalogReady && ftsHits.length === 0) return;
        const recentIds = vaultId
          ? recentNoteIdsForVault(vaultId, nodes, PALETTE_RESULT_LIMIT)
          : [];
        const merged = switcherHits(
          catalogHits,
          ftsHits,
          PALETTE_RESULT_LIMIT,
          titleLive
            ? (extra) => fuseSearchHits(extra, { recentIds, activeNoteId, neighborIds: [], queryText: typed })
            : undefined,
        );
        // An empty index reply must not hide titles already on the open page.
        if (merged.length === 0) return;
        setNoteSearchFailed(false);
        setAsyncHits(merged);
      };
      const applyCatalog = (hits: Awaited<ReturnType<typeof fetchShellSuggest>>) => {
        if (cancelled || !hits) return;
        catalogHits = mapSuggest(hits);
        catalogReady = true;
        setNoteSearchFailed(false);
        publish();
      };
      const markCatalogMissed = () => {
        catalogSettled = true;
        setNoteSearchFailed(true);
        settleIfDone();
      };
      void fetchShellSuggest(db, typed, PALETTE_RESULT_LIMIT).then((hits) => {
        if (cancelled) return;
        if (!hits) {
          markCatalogMissed();
          const stop = onShellCatalogWake(() => {
            stop();
            if (cancelled) return;
            catalogSettled = false;
            setNoteSearchPending(true);
            void fetchShellSuggest(db, typed, PALETTE_RESULT_LIMIT).then((rows) => {
              if (cancelled) return;
              if (!rows) {
                markCatalogMissed();
                return;
              }
              applyCatalog(rows);
              catalogSettled = true;
              settleIfDone();
            });
          });
          return;
        }
        applyCatalog(hits);
        catalogSettled = true;
        settleIfDone();
      });
      if (ftsStarted) {
        void (async () => {
          try {
            const rows = await searchWithBackendAsync(nodes, typed, PALETTE_RESULT_LIMIT);
            if (cancelled) return;
            ftsHits = rows;
            publish();
          } catch {
            if (!cancelled && catalogHits.length === 0) setNoteSearchFailed(true);
          } finally {
            ftsSettled = true;
            settleIfDone();
          }
        })();
      }
      return () => {
        cancelled = true;
        setNoteSearchPending(false);
      };
    }
    if (
      isEmptyQuery ||
      isCommandMode ||
      isTagBrowse ||
      wantsOrphans ||
      wantsBroken ||
      isAskMode ||
      exactTagQuery
    ) {
      return;
    }
    const needle = useOpsSearch
      ? debouncedSearch.trim() || raw
      : debouncedSearch.trim() || searchText || raw;
    if (!needle.trim()) return;
    let cancelled = false;
    const recentIds = vaultId ? recentNoteIdsForVault(vaultId, nodes, PALETTE_RESULT_LIMIT) : [];
    const activeNode = activeNoteId ? nodes[activeNoteId] : null;
    const neighborIds =
      activeNode?.kind === "note"
        ? getBacklinks(activeNode, nodes).map((b) => b.fromId)
        : [];
    const signals = {
      recentIds,
      activeNoteId,
      neighborIds,
      queryText: needle,
    };
    const useAsyncLookup = !useOpsSearch;
    if (useAsyncLookup) setNoteSearchPending(true);
    void (useOpsSearch
      ? Promise.resolve(searchWithOps(nodes, needle, PALETTE_RESULT_LIMIT))
      : searchWithBackendAsync(nodes, needle, PALETTE_RESULT_LIMIT)
    ).then((rows) => {
      if (cancelled) return;
      if (useAsyncLookup) setNoteSearchPending(false);
      setNoteSearchFailed(false);
      setAsyncHits(fuseSearchHits(rows, signals));
    }).catch(() => {
      if (cancelled) return;
      setNoteSearchPending(false);
      setNoteSearchFailed(true);
    });
    return () => {
      cancelled = true;
      if (useAsyncLookup) setNoteSearchPending(false);
    };
  }, [
    nodes,
    vaultId,
    raw,
    searchText,
    debouncedSearch,
    isEmptyQuery,
    isTagBrowse,
    exactTagQuery,
    wantsOrphans,
    wantsBroken,
    isCommandMode,
    hasPathFolderOp,
    hasOr,
    useOpsSearch,
    isAskMode,
    activeNoteId,
    shellCatalog,
    shellDbPath,
    pathFolderOps.pathFilter,
    pathFolderOps.folderFilter,
    pathFolderOps.tagFilter,
    pathFolderOps.lineFilter,
    pathFolderOps.sectionFilter,
    searchIndexState,
  ]);
  const hits = asyncHits ?? syncHits;
  const [catalogFolderTick, setCatalogFolderTick] = useState(0);

  // Folders are not notes, so note search never lists them. Enter on one
  // shows it in the list with the cursor on it.
  const folderHits = useMemo(() => {
    if (!q || isAskMode || isCommandMode || isTagBrowse || hasPathFolderOp || hasOr) return [];
    if (qLower.startsWith("is:")) return [];
    const out: { id: string; name: string; path: string }[] = [];
    for (const id in nodes) {
      const n = nodes[id];
      if (n?.kind !== "folder") continue;
      if (!n.name.toLowerCase().includes(qLower)) continue;
      out.push({ id, name: n.name, path: n.path });
      if (out.length >= 5) break;
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, qLower, isAskMode, isCommandMode, isTagBrowse, hasPathFolderOp, hasOr, nodes, shellLiveTick, catalogFolderTick]);

  // Enter pressed while the catalog is still being asked for a folder by this
  // name waits for the answer: a folder goes to the list; no folder runs what
  // was selected, as the Enter would have.
  const pendingFolderEnterRef = useRef<{ q: string; timer: number } | null>(null);
  const catalogAnsweredRef = useRef<string | null>(null);
  const runHeldEnter = useCallback(() => {
    const pending = pendingFolderEnterRef.current;
    if (!pending) return;
    pendingFolderEnterRef.current = null;
    window.clearTimeout(pending.timer);
    const root = inputRef.current?.closest("[cmdk-root]");
    const selected = root?.querySelector<HTMLElement>(
      "[cmdk-item][aria-selected='true'], [cmdk-item][data-selected='true']",
    );
    selected?.click();
    if (!selected) {
      root?.querySelector<HTMLElement>("[data-testid='search-note-hit']")?.click();
    }
  }, []);

  // A paged vault only holds the folders it has shown. When none of them is
  // named exactly what was typed, ask the catalog for that folder at the vault
  // root (or that exact path), then the disk, load it, and list it. Nothing
  // happens when it does not exist.
  const catalogDb = shellDbPath && shellDbPath !== BROWSER_SHELL_DB ? shellDbPath : null;
  const folderLookup = Boolean(
    shellCatalog && (catalogDb || useVaultStore.getState().mode === "desktop"),
  );
  useEffect(() => {
    if (!folderLookup) return;
    if (!q || isAskMode || isCommandMode || isTagBrowse || hasPathFolderOp || hasOr) return;
    if (qLower.startsWith("is:")) return;
    const wanted = q.replace(/\\/g, "/").replace(/^\/+|\/+$/g, "");
    if (!wanted) return;
    const wantedLower = wanted.toLowerCase();
    const live = useVaultStore.getState().nodes;
    for (const id in live) {
      const n = live[id];
      if (n?.kind === "folder" && (n.path.toLowerCase() === wantedLower || n.name.toLowerCase() === wantedLower)) {
        catalogAnsweredRef.current = q;
        return;
      }
    }
    let cancelled = false;
    const vaultAtLookup = useVaultStore.getState().vaultId;
    const t = window.setTimeout(() => {
      void (catalogDb ? fetchShellByPaths(catalogDb, [wanted]) : Promise.resolve(null)).then(async (rows) => {
        if (cancelled) return;
        let folders = (rows ?? []).filter((r) => r.kind === "folder");
        // The catalog knows folders through the notes inside them, so an
        // empty folder is missing there. Ask the disk for that exact path.
        const root = getDesktopRoot();
        if (!folders.length && root && useVaultStore.getState().mode === "desktop") {
          const onDisk = await statDesktopFolder(root, wanted);
          if (cancelled) return;
          if (onDisk) folders = [diskFolderRow(wanted, onDisk.mtime, deskNodeId)];
        }
        const st = useVaultStore.getState();
        if (folders.length && st.shellCatalog && st.shellDbPath === shellDbPath && st.vaultId === vaultAtLookup) {
          const merged = mergeShellRows(st.nodes, st.rootIds, folders);
          useVaultStore.setState({ nodes: merged.nodes, rootIds: merged.rootIds });
          // Learn what is inside, so a folder with notes is not taken for empty.
          for (const f of folders) void useVaultStore.getState().loadShellChildren(f.id);
          catalogAnsweredRef.current = q;
          setCatalogFolderTick((n) => n + 1);
          return;
        }
        catalogAnsweredRef.current = q;
        if (pendingFolderEnterRef.current?.q === q) runHeldEnter();
      });
    }, 200);
    return () => {
      cancelled = true;
      window.clearTimeout(t);
    };
  }, [q, qLower, isAskMode, isCommandMode, isTagBrowse, hasPathFolderOp, hasOr, folderLookup, catalogDb, shellDbPath, runHeldEnter]);

  const catalogFolderPending = Boolean(
    folderLookup &&
      q &&
      !isAskMode &&
      !isCommandMode &&
      !isTagBrowse &&
      !hasPathFolderOp &&
      !hasOr &&
      !qLower.startsWith("is:"),
  ) && catalogAnsweredRef.current !== q;
  useEffect(() => {
    const pending = pendingFolderEnterRef.current;
    if (!pending) return;
    if (pending.q !== q) {
      window.clearTimeout(pending.timer);
      pendingFolderEnterRef.current = null;
      return;
    }
    const folder = folderForEnter(folderHits, q);
    if (!folder) return;
    // A note that matches the words still loses to a folder named exactly.
    if (hits.length > 0 && !folder.exact) return;
    window.clearTimeout(pending.timer);
    pendingFolderEnterRef.current = null;
    revealSearchedFolder(folder.id);
  }, [folderHits, hits.length, q]);

  const askAnswer = useMemo(() => {
    if (!isAskMode) return null;
    return buildAskAnswer(raw, hits, nodes);
  }, [isAskMode, raw, hits, nodes]);

  const [shellOrphans, setShellOrphans] = useState<{ id: string; title: string; path: string }[]>([]);
  const [shellBrokenLinks, setShellBrokenLinks] = useState<VaultBrokenLink[]>([]);
  useEffect(() => {
    if (!shellCatalog || !shellDbPath || shellDbPath === BROWSER_SHELL_DB || !wantsOrphans) {
      setShellOrphans([]);
      return;
    }
    let cancel = false;
    void fetchShellOrphans(shellDbPath, 24).then((rows) => {
      if (cancel || !rows) return;
      setShellOrphans(
        rows.map((row) => ({
          id: row.id,
          title: row.name.replace(/\.md$/i, ""),
          path: row.path,
        })),
      );
    });
    return () => {
      cancel = true;
    };
  }, [shellCatalog, shellDbPath, wantsOrphans, shellLiveTick]);
  useEffect(() => {
    if (!shellCatalog || !shellDbPath || shellDbPath === BROWSER_SHELL_DB || !wantsBroken) {
      setShellBrokenLinks([]);
      return;
    }
    let cancel = false;
    void fetchShellBroken(shellDbPath, 40).then((rows) => {
      if (cancel || !rows) return;
      setShellBrokenLinks(
        rows.map((row) => ({
          noteId: row.fromId,
          notePath: row.fromPath,
          noteTitle: row.fromTitle,
          target: row.target,
          context: row.fromTitle,
        })),
      );
    });
    return () => {
      cancel = true;
    };
  }, [shellCatalog, shellDbPath, wantsBroken, shellLiveTick]);

  const [shellTags, setShellTags] = useState<{ tag: string; count: number }[] | null>(null);
  useEffect(() => {
    if (!shellCatalog || !shellDbPath || !isTagBrowse) {
      setShellTags(null);
      return;
    }
    let cancelled = false;
    void fetchShellTags(shellDbPath, 48).then((rows) => {
      if (!cancelled && rows) setShellTags(rows);
    });
    return () => {
      cancelled = true;
    };
  }, [shellCatalog, shellDbPath, isTagBrowse, shellLiveTick]);

  const tags = useMemo(() => {
    if (!isTagBrowse) return [];
    const source = shellCatalog
      ? (shellTags ?? []).map((t) => ({ tag: t.tag, count: t.count, noteIds: [] as string[] }))
      : collectVaultTags(nodes);
    return source
      .filter(
        (t) =>
          !tagPartial ||
          t.tag.startsWith(tagPartial) ||
          t.tag.includes(tagPartial),
      )
      .slice(0, 20);
  }, [nodes, isTagBrowse, tagPartial, shellCatalog, shellTags]);

  const orphans = useMemo(() => {
    if (!wantsOrphans) return [];
    if (shellCatalog && shellDbPath && shellDbPath !== BROWSER_SHELL_DB) return shellOrphans;
    try {
      return getOrphanNotes(nodes, 24);
    } catch {
      return [];
    }
  }, [nodes, wantsOrphans, shellCatalog, shellDbPath, shellOrphans]);

  const brokenLinks = useMemo(() => {
    if (!wantsBroken) return [];
    if (shellCatalog && shellDbPath && shellDbPath !== BROWSER_SHELL_DB) return shellBrokenLinks;
    try {
      return getAllBrokenLinks(nodes, 40);
    } catch {
      return [];
    }
  }, [nodes, wantsBroken, shellCatalog, shellDbPath, shellBrokenLinks]);

  const brokenCreateTargets = useMemo(() => {
    if (!wantsBroken) return [];
    const seen = new Set<string>();
    const out: string[] = [];
    for (const bl of brokenLinks) {
      const key = bl.target.trim().toLowerCase();
      if (!key || seen.has(key)) continue;
      seen.add(key);
      out.push(bl.target);
      if (out.length >= 12) break;
    }
    return out;
  }, [wantsBroken, brokenLinks]);

  return {
    trashItems,
    raw,
    isCommandMode,
    q,
    pathFolderOps,
    searchText,
    qLower,
    isTagBrowse,
    tagPartial,
    exactTagQuery,
    wantsOrphans,
    wantsBroken,
    wantsDeleted,
    hasPathFolderOp,
    hasOr,
    unsupportedHint,
    scopeHint,
    showAllActions,
    actionQuery,
    isEmptyQuery,
    isAskMode,
    hits,
    noteSearchPending,
    noteSearchFailed,
    folderHits,
    pendingFolderEnterRef,
    runHeldEnter,
    catalogFolderPending,
    askAnswer,
    tags,
    orphans,
    brokenLinks,
    brokenCreateTargets,
  };
}
