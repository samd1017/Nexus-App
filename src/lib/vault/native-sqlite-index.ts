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
import { isFillSettlePhase, isInFlightFillError } from "./sqlite-fill-progress";

type FillResult = {
  indexed: number;
  skipped: number;
  errors: number;
  notes: number;
  edges: number;
  scanned?: number;
  searchState?: string;
};

type FillProgressFn = (p: {
  dbPath?: string;
  scanned: number;
  total: number;
  indexed: number;
  skipped: number;
  errors: number;
  phase: string;
  message?: string | null;
  searchState?: string | null;
}) => void;

const fillInflightByDb = new Map<string, Promise<FillResult>>();
const fillProgressByDb = new Map<string, Set<FillProgressFn>>();

export function isNativeFillInFlight(dbPath?: string): boolean {
  if (dbPath) return fillInflightByDb.has(dbPath);
  return fillInflightByDb.size > 0;
}

function addFillProgress(dbPath: string, fn?: FillProgressFn): () => void {
  if (!fn) return () => {};
  let set = fillProgressByDb.get(dbPath);
  if (!set) {
    set = new Set();
    fillProgressByDb.set(dbPath, set);
  }
  set.add(fn);
  return () => {
    const cur = fillProgressByDb.get(dbPath);
    cur?.delete(fn);
    if (cur && cur.size === 0) fillProgressByDb.delete(dbPath);
  };
}

function emitFillProgress(dbPath: string, p: Parameters<FillProgressFn>[0]): void {
  const set = fillProgressByDb.get(dbPath);
  if (!set) return;
  for (const fn of set) fn(p);
}

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
    // Do not pull 100k–300k FTS rows into the JS heap. Desktop search is
    // searchFtsAsync → SQLite BM25. Hydrating the mirror discarded the
    // "metadata-only" budget on large vaults.
    this.ready = true;
  }

  async cancelFill(): Promise<void> {
    try {
      await this.invoke("vault_index_fill_cancel", { dbPath: this.dbPath });
    } catch {
      /* ignore */
    }
  }

  async fillFromDisk(
    headChars = 8000,
    opts?: {
      forceRebuild?: boolean;
      settleAtPhase?: "meta" | "fts-partial" | "done";
      priorityPaths?: string[];
      shortHeadChars?: number;
      onProgress?: FillProgressFn;
    },
  ): Promise<FillResult> {
    const detach = addFillProgress(this.dbPath, opts?.onProgress);
    const existing = fillInflightByDb.get(this.dbPath);
    if (existing) {
      try {
        return await this.settleFill(existing, opts?.settleAtPhase ?? "done");
      } finally {
        detach();
      }
    }
    let run!: Promise<FillResult>;
    const releaseInteractive = () => {
      if (fillInflightByDb.get(this.dbPath) === run) {
        fillInflightByDb.delete(this.dbPath);
      }
    };
    run = this.runFillFromDisk(headChars, {
      forceRebuild: opts?.forceRebuild === true,
      shortHeadChars: opts?.shortHeadChars,
      priorityPaths: opts?.priorityPaths,
      onInteractive: releaseInteractive,
    }).finally(() => {
      releaseInteractive();
      detach();
    });
    fillInflightByDb.set(this.dbPath, run);
    return this.settleFill(run, opts?.settleAtPhase ?? "done");
  }

  private async settleFill(
    run: Promise<FillResult>,
    settleAt: "meta" | "fts-partial" | "done",
  ): Promise<FillResult> {
    if (settleAt === "done") return run;
    return await new Promise((resolve, reject) => {
      let settled = false;
      const stop = addFillProgress(this.dbPath, (p) => {
        if (settled) return;
        if (p.phase === "error") {
          settled = true;
          stop();
          reject(new Error(String(p.message || "SQLite FTS fill failed")));
          return;
        }
        if (isFillSettlePhase(p.phase, settleAt)) {
          settled = true;
          stop();
          resolve({
            indexed: p.indexed,
            skipped: p.skipped,
            errors: p.errors,
            notes: p.total || p.indexed,
            edges: 0,
            scanned: p.scanned,
            searchState: p.searchState ?? undefined,
          });
        }
      });
      void run.then(
        (r) => {
          if (settled) return;
          settled = true;
          stop();
          resolve(r);
        },
        (err) => {
          if (settled) return;
          settled = true;
          stop();
          reject(err);
        },
      );
    });
  }

  private async runFillFromDisk(
    headChars: number,
    opts: {
      forceRebuild: boolean;
      shortHeadChars?: number;
      priorityPaths?: string[];
      onInteractive?: () => void;
    },
  ): Promise<FillResult> {
    type FillPayload = {
      dbPath?: string;
      scanned?: number;
      total?: number;
      indexed?: number;
      skipped?: number;
      errors?: number;
      notes?: number;
      edges?: number;
      phase?: string;
      message?: string | null;
      searchState?: string | null;
    };
    const toResult = (r: FillPayload | null | undefined): FillResult => ({
      indexed: Number(r?.indexed ?? 0),
      skipped: Number(r?.skipped ?? 0),
      errors: Number(r?.errors ?? 0),
      notes: Number(r?.notes ?? r?.total ?? r?.scanned ?? 0),
      edges: Number(r?.edges ?? 0),
      searchState: String(r?.searchState ?? ""),
    });

    let unlisten: (() => void) | undefined;
    let settled = false;
    const finish = (
      resolve: (v: FillResult) => void,
      value: FillResult,
    ) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };

    try {
      return await new Promise((resolve, reject) => {
        void (async () => {
          try {
            const { listen } = await import("@tauri-apps/api/event");
            unlisten = await listen<FillPayload>(
              "vault-index-progress",
              (ev) => {
                const p = ev.payload;
                if (p?.dbPath && p.dbPath !== this.dbPath) return;
                const phase = String(p?.phase ?? "");
                emitFillProgress(this.dbPath, {
                  dbPath: p?.dbPath,
                  scanned: Number(p?.scanned ?? 0),
                  total: Number(p?.total ?? 0),
                  indexed: Number(p?.indexed ?? 0),
                  skipped: Number(p?.skipped ?? 0),
                  errors: Number(p?.errors ?? 0),
                  phase,
                  message: p?.message ?? null,
                  searchState: p?.searchState ?? null,
                });
                if (phase === "error") {
                  if (!settled) {
                    settled = true;
                    reject(
                      new Error(String(p?.message || "SQLite FTS fill failed")),
                    );
                  }
                  return;
                }
                if (phase === "done") {
                  opts.onInteractive?.();
                }
              },
            );
          } catch {
            /* web / missing event plugin — invoke result is enough */
          }
          try {
            const r = await this.invoke<FillPayload>(
              "vault_index_fill_from_disk",
              {
                dbPath: this.dbPath,
                vaultRoot: this.vaultRoot,
                headChars,
                shortHeadChars: opts.shortHeadChars ?? 768,
                forceRebuild: opts.forceRebuild,
                priorityPaths: opts.priorityPaths ?? [],
              },
            );
            finish(resolve, toResult(r));
          } catch (err) {
            if (isInFlightFillError(err)) {
              // Rust join should make this rare. Stay on the progress
              // listener — do not reject while the leader is healthy.
              return;
            }
            if (!settled) {
              settled = true;
              reject(err);
            }
          } finally {
            unlisten?.();
          }
        })();
      });
    } finally {
      /* listener stays until the invoke returns, including the title tail */
    }
  }

  close(): void {
    this.mirror.close();
    if (fillInflightByDb.has(this.dbPath)) {
      // Keep the native writer + adapter ready so a remount joins fill.
      return;
    }
    this.ready = false;
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

  upsertSearchBody(meta: DurableNoteMeta): void {
    void this.invoke("vault_index_upsert", {
      dbPath: this.dbPath,
      note: {
        id: meta.id,
        path: meta.path,
        name: meta.name,
        kind: meta.kind,
        parentId: meta.parentId,
        mtime: meta.mtime,
        size: meta.size ?? null,
        contentHash: meta.contentHash ?? null,
        title: meta.title ?? null,
        bodySnippet: meta.bodySnippet ?? null,
        tags: meta.tags ?? null,
        linkTargets: meta.linkTargets ?? null,
      },
    }).catch(() => {});
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
          meta.ftsText !== undefined
            ? meta.ftsText
            : meta.bodySnippet !== undefined
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

  getNoteMeta(id: string): DurableNoteMeta | undefined {
    return this.mirror.getNoteMeta(id);
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

  getVaultRoot(): string {
    return this.vaultRoot;
  }

  async listLinkGroups(): Promise<Array<{ sourceId: string; targets: string[] }>> {
    try {
      const rows = await this.invoke<
        Array<{ sourceId?: string; source_id?: string; targets?: string[] }>
      >("vault_index_list_links", { dbPath: this.dbPath });
      if (!Array.isArray(rows)) return [];
      return rows.map((r) => ({
        sourceId: String(r.sourceId ?? r.source_id ?? ""),
        targets: Array.isArray(r.targets) ? r.targets.map(String) : [],
      })).filter((g) => g.sourceId);
    } catch (err) {
      console.warn("[nexus] vault_index_list_links failed", err);
      return [];
    }
  }
}

/** Shell mount already resolved the index file. Skip the ping and path lookup. */
export async function openNativeSqliteIndexFromKnownPath(
  vaultId: string,
  vaultRoot: string,
  dbPath: string,
): Promise<NativeSqliteDurableIndex | null> {
  const invoke = await getInvoke();
  if (!invoke || !dbPath) return null;
  try {
    const idx = new NativeSqliteDurableIndex(dbPath, vaultId, vaultRoot, invoke);
    await idx.openNative();
    return idx;
  } catch (err) {
    console.warn("[nexus] native sqlite index unavailable", err);
    return null;
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
