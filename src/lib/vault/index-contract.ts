/**
 * DurableIndex schema contract (v3) — mobile + desktop.
 *
 * Markdown on disk is canonical. SQLite/memory index is a disposable cache.
 * Native layers (desktop Rust, future Tauri Mobile) MUST implement this schema.
 * Do not bump SCHEMA_VERSION without coordinated TS + Rust + rebuild rules.
 */

/** Locked at 3 until a coordinated migration. Mirrors durable_index.rs SCHEMA_VERSION. */
export const DURABLE_INDEX_SCHEMA_VERSION = 3 as const;
export type DurableIndexSchemaVersion = typeof DURABLE_INDEX_SCHEMA_VERSION;

export const DURABLE_INDEX_CONTRACT_ID = "nexus-durable-index-v3" as const;
export const VAULT_INDEX_PING_PREFIX = "nexus-vault-index" as const;

export const DURABLE_INDEX_TABLES = [
  "meta_kv",
  "note_meta",
  "link_edge",
  "tag_map",
  "note_fts",
  "vault_registry",
  "capture_queue",
] as const;

export type DurableIndexTable = (typeof DURABLE_INDEX_TABLES)[number];

export const META_KV_KEYS = {
  schema_version: "schema_version",
  vault_id: "vault_id",
  vault_root: "vault_root",
  last_open_ms: "last_open_ms",
  last_full_rebuild_ms: "last_full_rebuild_ms",
  last_reconcile_ms: "last_reconcile_ms",
  index_gen: "index_gen",
} as const;

/**
 * SQL DDL for SQLite / mobile — executed by native layer.
 * Must stay aligned with src-tauri/src/durable_index.rs DDL.
 */
export const DURABLE_INDEX_SQL = `
CREATE TABLE IF NOT EXISTS meta_kv (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS note_meta (
  id TEXT PRIMARY KEY,
  path TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('folder','note')),
  parent_id TEXT,
  mtime INTEGER NOT NULL,
  size INTEGER,
  content_hash TEXT,
  title TEXT,
  deleted INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS note_meta_parent ON note_meta(parent_id);
CREATE INDEX IF NOT EXISTS note_meta_mtime ON note_meta(mtime DESC);

CREATE TABLE IF NOT EXISTS link_edge (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source_id TEXT NOT NULL,
  target_raw TEXT NOT NULL,
  target_norm TEXT NOT NULL,
  target_id TEXT,
  UNIQUE (source_id, target_norm)
);
CREATE INDEX IF NOT EXISTS link_fwd ON link_edge(source_id);
CREATE INDEX IF NOT EXISTS link_rev ON link_edge(target_norm);

CREATE TABLE IF NOT EXISTS tag_map (
  tag TEXT NOT NULL,
  note_id TEXT NOT NULL,
  PRIMARY KEY (tag, note_id)
);
CREATE INDEX IF NOT EXISTS tag_by_note ON tag_map(note_id);

CREATE VIRTUAL TABLE IF NOT EXISTS note_fts USING fts5(
  note_id UNINDEXED,
  title,
  path,
  body,
  tokenize = 'unicode61 remove_diacritics 2'
);

CREATE TABLE IF NOT EXISTS vault_registry (
  vault_id TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  root_rel TEXT NOT NULL,
  created_ms INTEGER NOT NULL,
  opened_ms INTEGER NOT NULL,
  note_count INTEGER NOT NULL DEFAULT 0,
  index_path TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS capture_queue (
  id TEXT PRIMARY KEY,
  vault_id TEXT NOT NULL,
  path_hint TEXT,
  body TEXT NOT NULL,
  created_ms INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending'
);
`;

export type NoteMetaKind = "folder" | "note";

export interface DurableNoteMetaContract {
  id: string;
  path: string;
  name: string;
  kind: NoteMetaKind;
  parentId: string | null;
  mtime: number;
  size?: number;
  contentHash?: string;
  title?: string;
  bodySnippet?: string;
  tags?: string[];
  linkTargets?: string[];
}

export interface DurableIndexStatsContract {
  notes: number;
  folders: number;
  schemaVersion: number;
  edges: number;
  tags: number;
}

export const DURABLE_INDEX_REBUILD_RULES = {
  disposable: true,
  canonicalSource: "vault-markdown" as const,
  preferReconcile: true,
  fullRebuildWhen: [
    "schema_version stored < DURABLE_INDEX_SCHEMA_VERSION",
    "meta_kv.vault_root bound to different vault than open request",
    "explicit wipe() / rebuildFromNodes()",
    "corrupt SQLite open / FTS missing after migrate",
    "operator deletes index file under app data",
  ] as const,
  migrateStrategy: "wipe-derived-tables-and-reapply-ddl" as const,
  upsertPreserveBodyWhenUnloaded: true,
  bodySnippetMaxChars: 4000,
} as const;

export const DESKTOP_INDEX_PATHS = {
  indexDir: "indexes/",
  indexFilePattern: "{appDataDir}/indexes/{vault_key}.sqlite",
  vaultKeyAlgorithm: "fnv64-1a-hex16",
  schemaVersion: DURABLE_INDEX_SCHEMA_VERSION,
  indexMustStayOutsideVault: true,
} as const;

export const MOBILE_VAULT_PATHS = {
  vaultRoot: "Documents/NexusVaults/{vault_id}/",
  indexFile: "Library/NexusIndexes/{vault_id}.sqlite",
  androidNotes: {
    vaultRootHint: "files/NexusVaults/{vault_id}/",
    indexFileHint: "no_backup/NexusIndexes/{vault_id}.sqlite",
  },
  schemaVersion: DURABLE_INDEX_SCHEMA_VERSION,
} as const;

export const DURABLE_INDEX_BACKEND_POLICY = {
  desktop: { mode: "desktop", storage: "sqlite-native", path: "DESKTOP_INDEX_PATHS" },
  sandbox: {
    mode: "sandbox",
    storage: "sqlite-native-future | memory-today",
    path: "MOBILE_VAULT_PATHS",
  },
  fsa: { mode: "fsa", storage: "memory", path: null },
  demo: { mode: "demo", storage: "none", path: null },
  local: { mode: "local", storage: "none", path: null },
} as const;

export const VAULT_INDEX_COMMANDS = [
  "vault_index_ping",
  "vault_index_path",
  "vault_index_open",
  "vault_index_close",
  "vault_index_wipe",
  "vault_index_rebuild",
  "vault_index_upsert",
  "vault_index_remove",
  "vault_index_search",
  "vault_index_stats",
  "vault_index_list",
] as const;

export const DURABLE_INDEX_CONTRACT = {
  schemaVersion: DURABLE_INDEX_SCHEMA_VERSION,
  contractId: DURABLE_INDEX_CONTRACT_ID,
  tables: DURABLE_INDEX_TABLES,
  ftsColumns: ["note_id", "title", "path", "body"] as const,
  mobilePaths: MOBILE_VAULT_PATHS,
  desktopPaths: DESKTOP_INDEX_PATHS,
  migrationPolicy: "wipe_rebuild_if_ver_lt_current" as const,
  rebuild: DURABLE_INDEX_REBUILD_RULES,
} as const;

export function assertContractInvariants(): void {
  if (DURABLE_INDEX_SCHEMA_VERSION < 1) {
    throw new Error("schema version must be >= 1");
  }
  if (DURABLE_INDEX_TABLES.length < 5) {
    throw new Error("expected core durable tables");
  }
  for (const t of DURABLE_INDEX_TABLES) {
    if (!DURABLE_INDEX_SQL.includes(t)) {
      throw new Error(`DDL missing table ${t}`);
    }
  }
  if (DURABLE_INDEX_REBUILD_RULES.bodySnippetMaxChars <= 0) {
    throw new Error("bodySnippetMaxChars must be positive");
  }
}
