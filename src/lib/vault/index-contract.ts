import durableIndexSql from "../../../schema/durable-index.sql?raw";

/**
 * DurableIndex schema contract (v3) — mobile + desktop.
 *
 * Markdown on disk is canonical. SQLite/memory index is a disposable cache.
 * Native layers (desktop Rust, future Tauri Mobile) MUST implement this schema.
 * The SQL text is `schema/durable-index.sql`, which the Rust index includes.
 * Do not bump SCHEMA_VERSION without coordinated TS + Rust + rebuild rules.
 */

/** Locked at 3 until a coordinated migration. Mirrors schema.rs SCHEMA_VERSION. */
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
  "note_fts_row",
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
 * SQL DDL for SQLite / mobile — the native layer includes the same file.
 */
export const DURABLE_INDEX_SQL = durableIndexSql;

export type NoteMetaKind = "folder" | "note";

export interface DurableNoteMetaContract {
  id: string;
  path: string;
  name: string;
  kind: NoteMetaKind;
  parentId: string | null;
  mtime: number;
  size?: number;
  ctime?: number;
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
  /**
   * Loaded note text kept for in-memory search. A 4,000-character cut
   * hid a word that sits further into an opened note.
   */
  bodySnippetMaxChars: 262_144,
  /**
   * Desktop deep head. Matches Rust `DEFAULT_DEEP_HEAD`. An opened note
   * indexes this many characters; the background fill does not read the rest
   * of the vault to match it.
   */
  desktopOpenNoteChars: 8_000,
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
  if (!DURABLE_INDEX_SQL.includes("fill_depth")) {
    throw new Error("DDL missing fill_depth");
  }
  if (DURABLE_INDEX_REBUILD_RULES.bodySnippetMaxChars <= 0) {
    throw new Error("bodySnippetMaxChars must be positive");
  }
}
