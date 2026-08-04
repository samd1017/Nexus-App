/**
 * Desktop SQLite DurableIndex adapter (Tauri invoke).
 * Keeps a MemoryDurableIndex mirror for synchronous searchFts (UI/cmdk);
 * persists every rebuild/upsert to on-disk SQLite for reopen survival + FTS5.
 * Wave B: open hydrates mirror from SQLite; reconcile never wipes warm FTS.
 * Web/demo never loads this path successfully (invoke fails → caller falls back).
 */

import type { SearchHit, VaultNode } from "./types";
import {
  createMemoryDurableIndex,
  noteMetaFromNode,
  type DurableIndex,
  type DurableNoteMeta,
  DURABLE_INDEX_SCHEMA_VERSION,
} from "./durable-index";

type Invoke = <T>(cmd: string, args?: Record<string, unknown>) => Promise<T>;

async function getInvoke(): Promise<Invoke | null> {
  try {
    const { invoke } = await import("@tauri-apps/api/core");
    return invoke as Invoke;
  } catch {
    return null;
  }
}

export async function resolveNativeIndexDbPath(
  vaultRoot: string,
): Promise<string | null> {
  const invoke = await getInvoke();
  if (!invoke) return null;
  try {
    return await invoke<string>("vault_index_path", { vaultRoot });
  } catch {
    return null;
  }
}

export async function probeSqliteCommands(): Promise<boolean> {
  const invoke = await getInvoke();
  if (!invoke) return false;
  try {
    const v = await invoke<string>("vault_index_ping");
    return typeof v === "string" && v.startsWith("nexus-vault-index");
  } catch {
    return false;
  }
}

type NativeNoteDto = {
  id: string;
  path: string;
  name: string;
  kind: string;
  parentId?: string | null;
  mtime: number;
  size?: number | null;
  contentHash?: string | null;
  title?: string | null;
  bodySnippet?: string | null;
  tags?: string[] | null;
  linkTargets?: string[] | null;
};

function dtoToMeta(d: NativeNoteDto): DurableNoteMeta {
  return {
    id: d.id,
    path: d.path,
    name: d.name,
    kind: d.kind === "folder" ? "folder" : "note",
    parentId: d.parentId ?? null,
    mtime: d.mtime,
    size: d.size ?? undefined,
    contentHash: d.contentHash ?? undefined,
    title: d.title ?? undefined,
    bodySnippet: d.bodySnippet ?? undefined,
    tags: d.tags ?? undefined,
    linkTargets: d.linkTargets ?? undefined,
  };
}

/**
 * SQLite-backed durable index with in-process memory mirror for sync search.
 */
export class NativeSqliteDurableIndex implements DurableIndex {
  ready = false;
  kind = "sqlite" as const;
  private dbPath: string;
  private vaultId: string;
  private vaultRoot: string;
  private mirror: DurableIndex;
  private invoke: Invoke;

  constructor(
    dbPath: string,
    vaultId: string,
    vaultRoot: string,
    invoke: Invoke,
  ) {
    this.dbPath = dbPath;
    this.vaultId = vaultId;
    this.vaultRoot = vaultRoot;
    this.invoke = invoke;
    this.mirror = createMemoryDurableIndex();
  }

  open(vaultId: string): void {
    this.vaultId = vaultId;
    this.mirror.open(vaultId);
    this.ready = true;
  }

  /** Async open used by factory — establishes native connection + hydrates mirror. */
  async openNative(): Promise<void> {
    await this.invoke("vault_index_open", {
      dbPath: this.dbPath,
      vaultId: this.vaultId,
      vaultRoot: this.vaultRoot,
    });
    this.mirror.open(this.vaultId);
    // Wave B: hydrate mirror from on-disk SQLite (no wipe)
    try {
      const rows = await this.invoke<NativeNoteDto[]>("vault_index_list", {
        dbPath: this.dbPath,
        limit: 500_000,
      });
      for (const row of rows ?? []) {
        if (row.kind === "folder") continue;
        this.mirror.upsertNote(dtoToMeta(row));
      }
    } catch (err) {
      console.warn("[nexus] vault_index_list hydrate failed", err);
    }
    this.ready = true;
  }

  close(): void {
    this.ready = false;
    this.mirror.close();
    void this.invoke("vault_index_close", { dbPath: this.dbPath }).catch(
      () => {},
    );
  }

  wipe(): void {
    this.mirror.wipe();
    void this.invoke("vault_index_wipe", { dbPath: this.dbPath }).catch(
      () => {},
    );
  }

  rebuildFromNodes(nodes: Record<string, VaultNode>): void {
    this.mirror.rebuildFromNodes(nodes);
    const notes: DurableNoteMeta[] = [];
    for (const n of Object.values(nodes)) {
      notes.push(noteMetaFromNode(n));
    }
    const payload = notes.map((m) => ({
      id: m.id,
      path: m.path,
      name: m.name,
      kind: m.kind,
      parentId: m.parentId,
      mtime: m.mtime,
      size: m.size ?? null,
      contentHash: m.contentHash ?? null,
      title: m.title ?? null,
      bodySnippet: m.bodySnippet ?? null,
      tags: m.tags ?? [],
      linkTargets: m.linkTargets ?? [],
    }));
    void this.invoke("vault_index_rebuild", {
      dbPath: this.dbPath,
      notes: payload,
    }).catch((err) => {
      console.warn("[nexus] vault_index_rebuild failed", err);
    });
  }

  /**
   * Wave B: delta only — drives upsert/remove so SQLite never full-wipes on open/watch.
   */
  reconcileFromNodes(nodes: Record<string, VaultNode>): {
    upserted: number;
    removed: number;
  } {
    let upserted = 0;
    let removed = 0;
    const live = Object.values(nodes).filter((n) => n.kind === "note");
    const liveIds = new Set(live.map((n) => n.id));
    const prevById = new Map(
      this.mirror.listNoteMeta().map((m) => [m.id, m] as const),
    );

    for (const id of prevById.keys()) {
      if (!liveIds.has(id)) {
        this.removeNote(id);
        removed += 1;
      }
    }

    for (const n of live) {
      const meta = noteMetaFromNode(n);
      const prev = prevById.get(n.id);
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
    return { upserted, removed };
  }

  upsertNote(meta: DurableNoteMeta): void {
    this.mirror.upsertNote(meta);
    // After mirror preserve-body, read back what was stored
    const stored =
      this.mirror.listNoteMeta().find((m) => m.id === meta.id) ?? meta;
    void this.invoke("vault_index_upsert", {
      dbPath: this.dbPath,
      note: {
        id: stored.id,
        path: stored.path,
        name: stored.name,
        kind: stored.kind,
        parentId: stored.parentId,
        mtime: stored.mtime,
        size: stored.size ?? null,
        contentHash: stored.contentHash ?? null,
        title: stored.title ?? null,
        // Pass null when no body so Rust preserves FTS body
        bodySnippet:
          meta.bodySnippet !== undefined
            ? (stored.bodySnippet ?? null)
            : null,
        tags: meta.tags ?? null,
        linkTargets: meta.linkTargets ?? null,
      },
    }).catch(() => {});
  }

  removeNote(id: string): void {
    this.mirror.removeNote(id);
    void this.invoke("vault_index_remove", {
      dbPath: this.dbPath,
      id,
    }).catch(() => {});
  }

  listNoteMeta(): DurableNoteMeta[] {
    return this.mirror.listNoteMeta();
  }

  searchFts(query: string, limit = 40): SearchHit[] {
    return this.mirror.searchFts(query, limit);
  }

  async searchFtsAsync(query: string, limit = 40): Promise<SearchHit[]> {
    try {
      const hits = await this.invoke<
        Array<{
          noteId: string;
          path: string;
          title: string;
          snippet: string;
          score: number;
          matchType: string;
        }>
      >("vault_index_search", {
        dbPath: this.dbPath,
        query,
        limit,
      });
      return hits.map((h) => ({
        noteId: h.noteId,
        path: h.path,
        title: h.title,
        snippet: h.snippet,
        score: h.score,
        matchType: h.matchType === "content" ? "content" : "title",
      }));
    } catch {
      return this.mirror.searchFts(query, limit);
    }
  }

  stats() {
    const s = this.mirror.stats();
    return {
      ...s,
      schemaVersion: Math.max(s.schemaVersion, DURABLE_INDEX_SCHEMA_VERSION),
    };
  }

  getDbPath(): string {
    return this.dbPath;
  }
}

export async function openNativeSqliteIndex(
  vaultId: string,
  vaultRoot: string,
): Promise<NativeSqliteDurableIndex | null> {
  const invoke = await getInvoke();
  if (!invoke) return null;
  try {
    const ping = await invoke<string>("vault_index_ping");
    if (!ping || !ping.startsWith("nexus-vault-index")) return null;
    const dbPath = await invoke<string>("vault_index_path", { vaultRoot });
    if (!dbPath) return null;
    const idx = new NativeSqliteDurableIndex(
      dbPath,
      vaultId,
      vaultRoot,
      invoke,
    );
    await idx.openNative();
    return idx;
  } catch (err) {
    console.warn("[nexus] native sqlite index unavailable", err);
    return null;
  }
}
