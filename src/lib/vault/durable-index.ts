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
import { noteTitle } from "./types";
import { extractWikilinkTargets } from "@/lib/markdown/wikilinks";
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
  /** Wave B: delta sync — upsert/remove only; never wipe FTS bodies for unloaded notes */
  reconcileFromNodes(nodes: Record<string, VaultNode>): {
    upserted: number;
    removed: number;
  };
  upsertNote(meta: DurableNoteMeta): void;
  removeNote(id: string): void;
  listNoteMeta(): DurableNoteMeta[];
  searchFts(query: string, limit?: number): SearchHit[];
  stats(): {
    notes: number;
    folders: number;
    schemaVersion: number;
    edges: number;
    tags: number;
  };
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

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9_\u00c0-\u024f]+/i)
    .filter((t) => t.length >= 2);
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
  }

  private indexTokens(id: string, meta: DurableNoteMeta) {
    const prev = this.noteTokens.get(id);
    if (prev) {
      for (const t of prev) {
        const set = this.inv.get(t);
        if (!set) continue;
        set.delete(id);
        if (set.size === 0) this.inv.delete(t);
      }
    }
    const title = meta.title ?? meta.name.replace(/\.md$/i, "");
    const blob = `${title} ${meta.path} ${meta.bodySnippet ?? ""}`;
    const tokens = new Set(tokenize(blob));
    this.noteTokens.set(id, tokens);
    for (const t of tokens) {
      let set = this.inv.get(t);
      if (!set) {
        set = new Set();
        this.inv.set(t, set);
      }
      set.add(id);
    }
  }

  rebuildFromNodes(nodes: Record<string, VaultNode>): void {
    this.wipe();
    let folders = 0;
    let edges = 0;
    let tagCount = 0;
    for (const n of Object.values(nodes)) {
      if (n.kind === "folder") {
        folders += 1;
        continue;
      }
      const body =
        n.content !== undefined ? n.content.slice(0, 4000) : undefined;
      const tags = n.content !== undefined ? extractTags(n.content) : [];
      const links =
        n.content !== undefined ? extractWikilinkTargets(n.content) : [];
      edges += links.length;
      tagCount += tags.length;
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
    }
    this.folders = folders;
    this.edges = edges;
    this.tagCount = tagCount;
    this.metaKv.set("last_full_rebuild_ms", String(Date.now()));
    this.metaKv.set("index_gen", String(Date.now()));
  }

  upsertNote(meta: DurableNoteMeta): void {
    if (meta.kind === "folder") return;
    const prev = this.notes.get(meta.id);
    // Wave B: never blank FTS when content not loaded
    let next = meta;
    if (meta.bodySnippet === undefined && prev?.bodySnippet !== undefined) {
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
    this.notes.set(next.id, next);
    if (next.linkTargets) this.edges += next.linkTargets.length;
    if (next.tags) this.tagCount += next.tags.length;
    this.indexTokens(next.id, next);
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
    this.notes.delete(id);
  }

  listNoteMeta(): DurableNoteMeta[] {
    return [...this.notes.values()];
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
      return [...this.notes.values()]
        .sort((a, b) => b.mtime - a.mtime)
        .slice(0, limit)
        .map((n) => ({
          noteId: n.id,
          path: n.path,
          title: n.title ?? n.name.replace(/\.md$/i, ""),
          snippet: "",
          score: 1,
          matchType: "title" as const,
        }));
    }

    const tokens = tokenize(q);
    let candidates: Set<string> | null = null;
    if (tokens.length) {
      const sorted = [...tokens].sort(
        (a, b) =>
          (this.inv.get(a)?.size ?? Infinity) -
          (this.inv.get(b)?.size ?? Infinity),
      );
      const first = this.inv.get(sorted[0]);
      if (first) {
        candidates = new Set(first);
        for (const t of sorted.slice(1)) {
          const set = this.inv.get(t);
          if (!set) {
            candidates = new Set();
            break;
          }
          for (const id of [...candidates]) {
            if (!set.has(id)) candidates.delete(id);
          }
        }
      } else {
        candidates = new Set();
      }
    } else {
      candidates = new Set(this.notes.keys());
    }

    if (!candidates || candidates.size < limit) {
      const set = candidates ?? new Set<string>();
      for (const n of this.notes.values()) {
        const title = (n.title ?? n.name).toLowerCase();
        if (title.includes(q) || n.path.toLowerCase().includes(q)) {
          set.add(n.id);
        }
      }
      candidates = set;
    }

    const hits: SearchHit[] = [];
    for (const id of candidates) {
      const n = this.notes.get(id);
      if (!n) continue;
      const title = n.title ?? n.name.replace(/\.md$/i, "");
      const titleL = title.toLowerCase();
      let score = 0;
      let matchType: "title" | "content" = "title";
      if (titleL === q) score = 120;
      else if (titleL.startsWith(q)) score = 100;
      else if (titleL.includes(q)) score = 80;
      else if (n.path.toLowerCase().includes(q)) score = 60;
      else {
        score = 40;
        matchType = "content";
      }
      const body = n.bodySnippet ?? "";
      if (body.toLowerCase().includes(q)) {
        score += 10;
        matchType = matchType === "title" && score >= 80 ? "title" : "content";
      }
      hits.push({
        noteId: n.id,
        path: n.path,
        title,
        snippet: matchType === "content" ? body.slice(0, 120) : n.path,
        score,
        matchType,
      });
    }
    hits.sort((a, b) => b.score - a.score);
    return hits.slice(0, limit);
  }

  stats() {
    return {
      notes: this.notes.size,
      folders: this.folders,
      schemaVersion: DURABLE_INDEX_SCHEMA_VERSION,
      edges: this.edges,
      tags: this.tagCount,
    };
  }
}

let active: DurableIndex | null = null;

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

export function upsertDurableNoteFromNode(n: VaultNode): void {
  if (!active?.ready || n.kind !== "note") return;
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
