/**
 * Durable vault index (mobile + desktop ready schema).
 *
 * Markdown on disk remains canonical. This index is a disposable cache that can
 * be wiped and rebuilt. Same schema targets:
 *   - MemoryDurableIndex (web demo / FSA / benches / fallback)
 *   - SQLite FTS5 via Tauri (desktop) — see native-sqlite-index.ts
 *   - Future SQLite on Tauri Mobile (iOS/Android) — same tables, smaller vaults
 *
 * Schema v3: contentful FTS5 (note_id, title, path, body) for reliable MATCH.
 */

import type { SearchHit, VaultNode } from "./types";
import { yieldToUi } from "./yield-ui";
import { noteTitle } from "./types";
import { extractWikilinkTargets } from "@/lib/markdown/wikilinks";
import { snippetForSearchHit } from "@/lib/search/snippets";
import {
  DURABLE_INDEX_SCHEMA_VERSION as CONTRACT_SCHEMA_VERSION,
  DURABLE_INDEX_SQL as CONTRACT_SQL,
  DURABLE_INDEX_CONTRACT,
  MOBILE_VAULT_PATHS as CONTRACT_MOBILE_PATHS,
  DESKTOP_INDEX_PATHS as CONTRACT_DESKTOP_PATHS,
  assertContractInvariants,
} from "./index-contract";

export const DURABLE_INDEX_SCHEMA_VERSION = CONTRACT_SCHEMA_VERSION;
export const DURABLE_INDEX_SQL = CONTRACT_SQL;
/** Memory FTS only — not SQLite BM25. Never score more than this many inverted-index hits. */
export const MEMORY_FTS_CANDIDATE_CAP = 800;
/**
 * Max note ids stored per token. Ubiquitous soak words (`cluster`, `hub`,
 * `retrieval`) used to keep a 100k-id Set each. Search intersects uncapped
 * (rare) lists first so a 16-file token still hits.
 */
export const MEMORY_FTS_POSTING_CAP = 800;
/**
 * After a slim disk fill, drop unique (size-1) tokens until we are under this
 * many inverted keys. Meeting-* soak files otherwise create ~1 Set per note id.
 */
export const MEMORY_FTS_INV_TOKEN_CAP = 12_000;
/** Skip O(n) title/path fallback above this vault size. */
export const MEMORY_FTS_FULL_SCAN_MAX_NOTES = 10_000;
export {
  DURABLE_INDEX_CONTRACT,
  assertContractInvariants,
};

export interface DurableNoteMeta {
  id: string;
  path: string;
  name: string;
  kind: "folder" | "note";
  parentId: string | null;
  mtime: number;
  size?: number;
  contentHash?: string;
  title?: string;
  /** Optional body snippet for FTS (loaded notes only) */
  bodySnippet?: string;
  /**
   * Tokenized on upsert then dropped from the stored meta.
   * Lets disk fills index a 2k file head without retaining it.
   */
  ftsText?: string;
  /**
   * Disk file-head fill: token into the inverted index without keeping a
   * snippet, tag list, or per-note token Set (the 100k FSA retainers).
   */
  slim?: boolean;
  tags?: string[];
  linkTargets?: string[];
}

export interface DurableIndex {
  ready: boolean;
  kind: "memory" | "sqlite" | "native";
  open(vaultId: string): void;
  close(): void;
  wipe(): void;
  rebuildFromNodes(nodes: Record<string, VaultNode>): void;
  /** Chunked rebuild so large mounts do not freeze the UI for seconds. */
  rebuildFromNodesAsync?(
    nodes: Record<string, VaultNode>,
    opts?: {
      chunkSize?: number;
      wipe?: boolean;
      onProgress?: (done: number, total: number) => void;
    },
  ): Promise<void>;
  /** Wave B: delta sync — upsert/remove only; never wipe FTS bodies for unloaded notes */
  reconcileFromNodes(nodes: Record<string, VaultNode>): {
    upserted: number;
    removed: number;
  };
  upsertNote(meta: DurableNoteMeta): void;
  removeNote(id: string): void;
  listNoteMeta(): DurableNoteMeta[];
  /** O(1) meta lookup — used for unloaded-body search snippets */
  getNoteMeta(id: string): DurableNoteMeta | undefined;
  searchFts(query: string, limit?: number): SearchHit[];
  searchFtsAsync?(query: string, limit?: number): Promise<SearchHit[]>;
  stats(): {
    notes: number;
    folders: number;
    schemaVersion: number;
    edges: number;
    tags: number;
    invTokens?: number;
    largestPosting?: number;
    noteTokenSets?: number;
    slimNotes?: number;
  };
  /** Desktop: Rust walks the vault folder into SQLite FTS5 (no per-note JS IPC). */
  fillFromDisk?(
    headChars?: number,
  ): Promise<{ indexed: number; errors: number; notes: number }>;
  /** Drop title-only postings before a file-head fill so we do not hold two indexes. */
  beginSlimDiskFill?(): void;
  /** Prune unique tokens after a 100k fill so Chrome can keep the tab. */
  compactSlimInv?(): { before: number; after: number; dropped: number };
}

function simpleHash(s: string): string {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(16);
}

function extractTags(body: string): string[] {
  const tags = new Set<string>();
  const re = /(?:^|\s)#([a-zA-Z][\w/-]{0,48})/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(body))) tags.add(m[1].toLowerCase());
  return [...tags];
}

function tokenize(text: string, opts?: { slim?: boolean }): string[] {
  const raw = text
    .toLowerCase()
    .split(/[^a-z0-9_\u00c0-\u024f]+/i)
    .filter((t) => t.length >= 2);
  if (!opts?.slim) return raw;
  // Meeting-10949-1oo → drop 10949 / 1oo. Keep hub, cluster, retrieval.
  return raw.filter((t) => t.length >= 3 && !/\d/.test(t));
}

/**
 * Memory durable index — session cache with inverted FTS-like postings.
 * Populates logical link_edge + tag_map. Native SQLite persists on desktop.
 */
class MemoryDurableIndex implements DurableIndex {
  ready = false;
  kind = "memory" as const;
  private vaultId: string | null = null;
  private notes = new Map<string, DurableNoteMeta>();
  private folders = 0;
  private edges = 0;
  private tagCount = 0;
  private metaKv = new Map<string, string>();
  /** inverted: token → note ids (title/path/body snippet) */
  private inv = new Map<string, Set<string>>();
  private noteTokens = new Map<string, Set<string>>();
  /** Notes indexed by disk fill — no per-note token Set to walk on remove. */
  private slimNotes = new Set<string>();

  open(vaultId: string): void {
    this.vaultId = vaultId;
    this.ready = true;
    this.metaKv.set("schema_version", String(DURABLE_INDEX_SCHEMA_VERSION));
    this.metaKv.set("vault_id", vaultId);
    this.metaKv.set("last_full_rebuild_ms", String(Date.now()));
  }

  close(): void {
    this.ready = false;
    this.vaultId = null;
    this.wipe();
  }

  wipe(): void {
    this.notes.clear();
    this.folders = 0;
    this.edges = 0;
    this.tagCount = 0;
    this.inv.clear();
    this.noteTokens.clear();
    this.slimNotes.clear();
  }

  beginSlimDiskFill(): void {
    this.inv.clear();
    this.noteTokens.clear();
    this.slimNotes.clear();
  }

  compactSlimInv(): { before: number; after: number; dropped: number } {
    const before = this.inv.size;
    if (before <= MEMORY_FTS_INV_TOKEN_CAP) {
      return { before, after: before, dropped: 0 };
    }
    const bySize = new Map<number, string[]>();
    for (const [token, set] of this.inv) {
      const n = set.size;
      let bucket = bySize.get(n);
      if (!bucket) {
        bucket = [];
        bySize.set(n, bucket);
      }
      bucket.push(token);
    }
    const sizes = [...bySize.keys()].sort((a, b) => a - b);
    for (const size of sizes) {
      if (this.inv.size <= MEMORY_FTS_INV_TOKEN_CAP) break;
      if (size >= MEMORY_FTS_POSTING_CAP) break;
      for (const token of bySize.get(size) ?? []) {
        if (this.inv.size <= MEMORY_FTS_INV_TOKEN_CAP) break;
        this.inv.delete(token);
      }
    }
    return { before, after: this.inv.size, dropped: before - this.inv.size };
  }

  private indexTokens(id: string, meta: DurableNoteMeta, opts?: { slim?: boolean }) {
    const prev = this.noteTokens.get(id);
    if (prev) {
      for (const t of prev) {
        const set = this.inv.get(t);
        if (!set) continue;
        set.delete(id);
        if (set.size === 0) this.inv.delete(t);
      }
      this.noteTokens.delete(id);
    }
    const title = meta.title ?? meta.name.replace(/\.md$/i, "");
    const extra = meta.ftsText ?? meta.bodySnippet ?? "";
    const blob = `${title} ${meta.path} ${extra}`;
    const tokens = tokenize(blob, { slim: Boolean(opts?.slim) });
    if (!opts?.slim) {
      this.noteTokens.set(id, new Set(tokens));
      this.slimNotes.delete(id);
    } else {
      this.slimNotes.add(id);
    }
    for (const t of tokens) {
      let set = this.inv.get(t);
      if (!set) {
        set = new Set();
        this.inv.set(t, set);
      }
      if (set.size >= MEMORY_FTS_POSTING_CAP) continue;
      set.add(id);
    }
  }

  private indexOneNode(n: VaultNode): { folders: number; edges: number; tags: number } {
    if (n.kind === "folder") return { folders: 1, edges: 0, tags: 0 };
    const body = n.content !== undefined ? n.content.slice(0, 4000) : undefined;
    const tags = n.content !== undefined ? extractTags(n.content) : [];
    const links = n.content !== undefined ? extractWikilinkTargets(n.content) : [];
    const meta: DurableNoteMeta = {
      id: n.id,
      path: n.path,
      name: n.name,
      kind: "note",
      parentId: n.parentId,
      mtime: n.mtime,
      title: noteTitle(n),
      bodySnippet: body,
      contentHash: body !== undefined ? simpleHash(body) : undefined,
      tags,
      linkTargets: links,
    };
    this.notes.set(n.id, meta);
    this.indexTokens(n.id, meta);
    return { folders: 0, edges: links.length, tags: tags.length };
  }

  rebuildFromNodes(nodes: Record<string, VaultNode>): void {
    this.wipe();
    let folders = 0;
    let edges = 0;
    let tagCount = 0;
    for (const n of Object.values(nodes)) {
      const r = this.indexOneNode(n);
      folders += r.folders;
      edges += r.edges;
      tagCount += r.tags;
    }
    this.folders = folders;
    this.edges = edges;
    this.tagCount = tagCount;
    this.metaKv.set("last_full_rebuild_ms", String(Date.now()));
    this.metaKv.set("index_gen", String(Date.now()));
  }

  async rebuildFromNodesAsync(
    nodes: Record<string, VaultNode>,
    opts?: {
      chunkSize?: number;
      wipe?: boolean;
      onProgress?: (done: number, total: number) => void;
    },
  ): Promise<void> {
    if (opts?.wipe !== false) this.wipe();
    const list = Object.values(nodes);
    const chunk = Math.max(200, opts?.chunkSize ?? 1500);
    let folders = 0;
    let edges = 0;
    let tagCount = 0;
    for (let i = 0; i < list.length; i++) {
      const r = this.indexOneNode(list[i]!);
      folders += r.folders;
      edges += r.edges;
      tagCount += r.tags;
      if ((i + 1) % chunk === 0) {
        opts?.onProgress?.(i + 1, list.length);
        await yieldToUi((i + 1) % (chunk * 3) === 0);
      }
    }
    this.folders = folders;
    this.edges = edges;
    this.tagCount = tagCount;
    this.metaKv.set("last_full_rebuild_ms", String(Date.now()));
    this.metaKv.set("index_gen", String(Date.now()));
    opts?.onProgress?.(list.length, list.length);
  }

  upsertNote(meta: DurableNoteMeta): void {
    if (meta.kind === "folder") return;
    const prev = this.notes.get(meta.id);
    // Wave B: never blank FTS when content not loaded
    let next = meta;
    if (meta.bodySnippet === undefined && prev?.bodySnippet !== undefined && !meta.slim) {
      next = {
        ...meta,
        bodySnippet: prev.bodySnippet,
        contentHash: meta.contentHash ?? prev.contentHash,
        tags: meta.tags ?? prev.tags,
        linkTargets: meta.linkTargets ?? prev.linkTargets,
      };
    }
    if (prev?.linkTargets) this.edges -= prev.linkTargets.length;
    if (prev?.tags) this.tagCount -= prev.tags.length;
    const stored: DurableNoteMeta = { ...next };
    delete stored.ftsText;
    delete stored.slim;
    if (next.slim) {
      delete stored.bodySnippet;
      delete stored.tags;
      delete stored.linkTargets;
      delete stored.contentHash;
    }
    this.notes.set(stored.id, stored);
    if (!next.slim) {
      if (next.linkTargets) this.edges += next.linkTargets.length;
      if (next.tags) this.tagCount += next.tags.length;
    }
    // Title-only reconcile after a disk fill — keep file-head tokens.
    if (
      this.slimNotes.has(next.id) &&
      !next.ftsText &&
      next.bodySnippet === undefined &&
      !next.slim
    ) {
      return;
    }
    const shouldReindex =
      Boolean(next.ftsText) ||
      Boolean(next.slim) ||
      !this.noteTokens.has(next.id) ||
      (next.bodySnippet !== undefined && next.contentHash !== prev?.contentHash);
    if (shouldReindex) this.indexTokens(next.id, next, { slim: Boolean(next.slim) });
  }

  removeNote(id: string): void {
    const prev = this.notes.get(id);
    if (!prev) return;
    if (prev.linkTargets) this.edges -= prev.linkTargets.length;
    if (prev.tags) this.tagCount -= prev.tags.length;
    const tokens = this.noteTokens.get(id);
    if (tokens) {
      for (const t of tokens) {
        const set = this.inv.get(t);
        if (!set) continue;
        set.delete(id);
        if (set.size === 0) this.inv.delete(t);
      }
    }
    this.noteTokens.delete(id);
    this.slimNotes.delete(id);
    this.notes.delete(id);
  }

  listNoteMeta(): DurableNoteMeta[] {
    return [...this.notes.values()];
  }

  getNoteMeta(id: string): DurableNoteMeta | undefined {
    return this.notes.get(id);
  }

  /**
   * Wave B open/watch path: patch index without wipe.
   * Removes notes gone from tree; upserts changed meta; preserves bodies when unloaded.
   */
  reconcileFromNodes(nodes: Record<string, VaultNode>): {
    upserted: number;
    removed: number;
  } {
    let upserted = 0;
    let removed = 0;
    const live = Object.values(nodes).filter((n) => n.kind === "note");
    const liveIds = new Set(live.map((n) => n.id));
    const livePaths = new Set(live.map((n) => n.path));

    for (const [id, meta] of [...this.notes.entries()]) {
      if (liveIds.has(id)) continue;
      // Gone id: drop unless same path still exists under a new id (handled as upsert)
      if (!livePaths.has(meta.path)) {
        this.removeNote(id);
        removed += 1;
      } else {
        // Path still live under different id — drop old id
        this.removeNote(id);
        removed += 1;
      }
    }

    for (const n of live) {
      const meta = noteMetaFromNode(n);
      const prev = this.notes.get(n.id);
      const need =
        !prev ||
        prev.path !== meta.path ||
        prev.name !== meta.name ||
        prev.parentId !== meta.parentId ||
        prev.mtime !== meta.mtime ||
        prev.title !== meta.title ||
        (meta.bodySnippet !== undefined &&
          meta.contentHash !== prev.contentHash);
      if (need) {
        this.upsertNote(meta);
        upserted += 1;
      }
    }

    this.folders = Object.values(nodes).filter((n) => n.kind === "folder").length;
    this.metaKv.set("last_reconcile_ms", String(Date.now()));
    this.metaKv.set("index_gen", String(Date.now()));
    return { upserted, removed };
  }

  searchFts(query: string, limit = 40): SearchHit[] {
    const q = query.trim().toLowerCase();
    if (!q) {
      if (this.notes.size > MEMORY_FTS_FULL_SCAN_MAX_NOTES) {
        const out: SearchHit[] = [];
        for (const n of this.notes.values()) {
          out.push({
            noteId: n.id,
            path: n.path,
            title: n.title ?? n.name.replace(/\.md$/i, ""),
            snippet: snippetForSearchHit({
              path: n.path,
              durableBody: n.bodySnippet,
              matchType: "title",
            }),
            score: 1,
            matchType: "title",
          });
          if (out.length >= limit) break;
        }
        return out;
      }
      return [...this.notes.values()]
        .sort((a, b) => b.mtime - a.mtime)
        .slice(0, limit)
        .map((n) => ({
          noteId: n.id,
          path: n.path,
          title: n.title ?? n.name.replace(/\.md$/i, ""),
          snippet: snippetForSearchHit({
            path: n.path,
            durableBody: n.bodySnippet,
            matchType: "title",
          }),
          score: 1,
          matchType: "title" as const,
        }));
    }

    const tokens = tokenize(q);
    const lists = tokens
      .map((t) => this.inv.get(t))
      .filter((s): s is Set<string> => Boolean(s));
    // Truncated postings are stopword-like. Prefer rare (complete) lists so
    // `retrieval hub` still finds the 16 hub files when both words are ubiquitous.
    const uncapped = lists.filter((s) => s.size < MEMORY_FTS_POSTING_CAP);
    const use = uncapped.length > 0 ? uncapped : lists;
    let candidateIds: string[] = [];
    if (tokens.length && lists.length === tokens.length && use.length) {
      use.sort((a, b) => a.size - b.size);
      const smallest = use[0]!;
      const rest = use.slice(1);
      for (const id of smallest) {
        let ok = true;
        for (const set of rest) {
          if (!set.has(id)) {
            ok = false;
            break;
          }
        }
        if (ok) {
          candidateIds.push(id);
          if (candidateIds.length >= MEMORY_FTS_CANDIDATE_CAP) break;
        }
      }
    }

    if (
      candidateIds.length < limit &&
      this.notes.size <= MEMORY_FTS_FULL_SCAN_MAX_NOTES
    ) {
      const have = new Set(candidateIds);
      for (const n of this.notes.values()) {
        if (have.has(n.id)) continue;
        const title = (n.title ?? n.name).toLowerCase();
        if (title.includes(q) || n.path.toLowerCase().includes(q)) {
          candidateIds.push(n.id);
          have.add(n.id);
          if (candidateIds.length >= MEMORY_FTS_CANDIDATE_CAP) break;
        }
      }
    }

    const scored: Array<{
      n: DurableNoteMeta;
      score: number;
      matchType: "title" | "content";
    }> = [];
    for (const id of candidateIds) {
      const n = this.notes.get(id);
      if (!n) continue;
      const title = n.title ?? n.name.replace(/\.md$/i, "");
      const titleL = title.toLowerCase();
      const pathL = n.path.toLowerCase();
      const base = pathL.split("/").pop()?.replace(/\.md$/i, "") ?? "";
      const titleWords = titleL
        .split(/[^a-z0-9_\u00c0-\u024f]+/i)
        .filter(Boolean);
      let score = 0;
      let matchType: "title" | "content" = "title";
      if (titleL === q) score = 200;
      else if (titleL.startsWith(q)) score = 170;
      else if (titleWords.some((w) => w.startsWith(q))) score = 150;
      else if (titleL.includes(q)) score = 130;
      else if (base === q || base.startsWith(q)) score = 110;
      else if (pathL.includes(q)) score = 80;
      else {
        score = 40;
        matchType = "content";
      }
      scored.push({ n, score, matchType });
    }
    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, limit).map(({ n, score, matchType }) => {
      const title = n.title ?? n.name.replace(/\.md$/i, "");
      const body = n.bodySnippet ?? "";
      let nextScore = score;
      let nextType = matchType;
      if (body.toLowerCase().includes(q)) {
        nextScore += 10;
        nextType = matchType === "title" && score >= 80 ? "title" : "content";
      }
      return {
        noteId: n.id,
        path: n.path,
        title,
        snippet: snippetForSearchHit({
          path: n.path,
          query: q,
          matchType: nextType,
          durableBody: n.bodySnippet || undefined,
        }),
        score: nextScore,
        matchType: nextType,
      };
    });
  }

  async searchFtsAsync(query: string, limit = 40): Promise<SearchHit[]> {
    return this.searchFts(query, limit);
  }

  stats() {
    let largestPosting = 0;
    for (const set of this.inv.values()) {
      if (set.size > largestPosting) largestPosting = set.size;
    }
    return {
      notes: this.notes.size,
      folders: this.folders,
      schemaVersion: DURABLE_INDEX_SCHEMA_VERSION,
      edges: this.edges,
      tags: this.tagCount,
      invTokens: this.inv.size,
      largestPosting,
      noteTokenSets: this.noteTokens.size,
      slimNotes: this.slimNotes.size,
    };
  }
}

let active: DurableIndex | null = null;

export function beginSlimDiskFill(): void {
  active?.beginSlimDiskFill?.();
}

export function compactSlimInv(): { before: number; after: number; dropped: number } {
  return active?.compactSlimInv?.() ?? { before: 0, after: 0, dropped: 0 };
}

export function getDurableIndex(): DurableIndex | null {
  return active;
}

export function openMemoryDurableIndex(vaultId: string): DurableIndex {
  const idx = new MemoryDurableIndex();
  idx.open(vaultId);
  active = idx;
  return idx;
}

export function closeDurableIndex(): void {
  active?.close();
  active = null;
}

/**
 * Open the right durable index for this vault.
 * Desktop + Tauri → SQLite file (with memory search mirror).
 * FSA / sandbox / fallback → memory only.
 * Demo/local: caller should not enable (shouldUseDurableIndex false).
 */
export async function openDurableIndexForVault(opts: {
  vaultId: string;
  mode: string;
  vaultRoot?: string | null;
}): Promise<DurableIndex | null> {
  const { vaultId, mode, vaultRoot } = opts;
  if (mode !== "fsa" && mode !== "desktop" && mode !== "sandbox") {
    closeDurableIndex();
    return null;
  }

  // Prefer native SQLite on desktop when vault root is known
  if (mode === "desktop" && vaultRoot) {
    try {
      const { openNativeSqliteIndex } = await import("./native-sqlite-index");
      // Close previous vault index before opening a new one
      if (active?.ready) {
        closeDurableIndex();
      }
      const native = await openNativeSqliteIndex(vaultId, vaultRoot);
      if (native) {
        active = native;
        return native;
      }
    } catch {
      /* fall through to memory */
    }
  }

  if (active?.ready && active.kind === "memory") {
    return active;
  }
  closeDurableIndex();
  return openMemoryDurableIndex(vaultId);
}

/** Sync active index from mounted nodes — Wave B always reconciles (no wipe). */
export function syncDurableIndexFromNodes(
  vaultId: string | null,
  nodes: Record<string, VaultNode>,
  enabled: boolean,
): void {
  if (!enabled || !vaultId) {
    closeDurableIndex();
    return;
  }
  const idx = active?.ready ? active : openMemoryDurableIndex(vaultId);
  idx.reconcileFromNodes(nodes);
}

/** Force full rebuild (schema repair / explicit). Prefer reconcile. */
export function rebuildDurableIndexFromNodes(
  vaultId: string | null,
  nodes: Record<string, VaultNode>,
  enabled: boolean,
): void {
  if (!enabled || !vaultId) {
    closeDurableIndex();
    return;
  }
  const idx = active?.ready ? active : openMemoryDurableIndex(vaultId);
  idx.rebuildFromNodes(nodes);
}

/** Chunked full rebuild — use on soak / 45k mounts so the UI can paint. */
export async function rebuildDurableIndexFromNodesAsync(
  vaultId: string | null,
  nodes: Record<string, VaultNode>,
  enabled: boolean,
  opts?: {
    chunkSize?: number;
    wipe?: boolean;
    onProgress?: (done: number, total: number) => void;
  },
): Promise<void> {
  if (!enabled || !vaultId) {
    closeDurableIndex();
    return;
  }
  const idx = active?.ready ? active : openMemoryDurableIndex(vaultId);
  if (idx.rebuildFromNodesAsync) {
    await idx.rebuildFromNodesAsync(nodes, opts);
    return;
  }
  idx.rebuildFromNodes(nodes);
}

export function upsertDurableNoteFromNode(n: VaultNode): void {
  if (!active?.ready || n.kind !== "note") return;
  const stats = active.stats();
  // 100k FSA: opening a note used to fatten slim postings (4000-char snippet +
  // per-note token Set). That growth discarded Chrome around note 12.
  if ((stats.slimNotes ?? 0) > 400 || (stats.notes ?? 0) >= 8_000) {
    if (n.content === undefined) return;
    active.upsertNote({
      id: n.id,
      path: n.path,
      name: n.name,
      kind: "note",
      parentId: n.parentId,
      mtime: n.mtime,
      title: noteTitle(n),
      ftsText: n.content.slice(0, 2000),
      slim: true,
    });
    return;
  }
  const body =
    n.content !== undefined ? n.content.slice(0, 4000) : undefined;
  active.upsertNote({
    id: n.id,
    path: n.path,
    name: n.name,
    kind: "note",
    parentId: n.parentId,
    mtime: n.mtime,
    title: noteTitle(n),
    bodySnippet: body,
    contentHash: body !== undefined ? simpleHash(body) : undefined,
    // Wave B: undefined (not []) so upsert preserves prior tags/links when unloaded
    tags: n.content !== undefined ? extractTags(n.content) : undefined,
    linkTargets:
      n.content !== undefined ? extractWikilinkTargets(n.content) : undefined,
  });
}

/** Remove note from durable index (delete / trash). */
export function removeDurableNote(id: string): void {
  if (!active?.ready || !id) return;
  try {
    active.removeNote(id);
  } catch (err) {
    console.warn("[nexus] durable remove failed", id, err);
  }
}

/** Export for benches / native adapters later */
export function createMemoryDurableIndex(): DurableIndex {
  return new MemoryDurableIndex();
}

export function noteMetaFromNode(n: VaultNode): DurableNoteMeta {
  const body =
    n.kind === "note" && n.content !== undefined
      ? n.content.slice(0, 4000)
      : undefined;
  return {
    id: n.id,
    path: n.path,
    name: n.name,
    kind: n.kind,
    parentId: n.parentId,
    mtime: n.mtime,
    title: n.kind === "note" ? noteTitle(n) : n.name,
    bodySnippet: body,
    contentHash: body !== undefined ? simpleHash(body) : undefined,
    tags: n.content !== undefined ? extractTags(n.content) : undefined,
    linkTargets:
      n.content !== undefined ? extractWikilinkTargets(n.content) : undefined,
  };
}

/** Mobile path conventions (documented for native implementers) */
export const MOBILE_VAULT_PATHS = CONTRACT_MOBILE_PATHS;

/** Desktop path convention (under Tauri app data) */
export const DESKTOP_INDEX_PATHS = CONTRACT_DESKTOP_PATHS;
