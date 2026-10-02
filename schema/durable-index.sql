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
  deleted INTEGER NOT NULL DEFAULT 0,
  fill_depth INTEGER
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
-- note_id is UNINDEXED in FTS5, so DELETE WHERE note_id scans the whole
-- index. This side table makes replace/delete a rowid lookup.
CREATE TABLE IF NOT EXISTS note_fts_row (
  note_id TEXT PRIMARY KEY,
  fts_rowid INTEGER NOT NULL
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
