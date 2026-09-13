//! On-disk DurableIndex (SQLite FTS5). Disposable cache — markdown remains canonical.
//! Schema mirrors TS durable index contract (v3 contentful FTS for reliable MATCH).

use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};
use std::path::{Path, PathBuf};
use std::sync::{Mutex, OnceLock};
use std::time::{Duration, Instant};

pub const SCHEMA_VERSION: i32 = 3;

const DDL: &str = r#"
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
"#;

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NoteMetaDto {
    pub id: String,
    pub path: String,
    pub name: String,
    pub kind: String,
    pub parent_id: Option<String>,
    pub mtime: i64,
    pub size: Option<i64>,
    pub content_hash: Option<String>,
    pub title: Option<String>,
    pub body_snippet: Option<String>,
    pub tags: Option<Vec<String>>,
    pub link_targets: Option<Vec<String>>,
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchHitDto {
    pub note_id: String,
    pub path: String,
    pub title: String,
    pub snippet: String,
    pub score: f64,
    pub match_type: String,
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct IndexStatsDto {
    pub notes: i64,
    pub folders: i64,
    pub schema_version: i32,
    pub edges: i64,
    pub tags: i64,
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct IndexOpenResult {
    pub ok: bool,
    pub schema_version: i32,
    pub kind: String,
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OkResult {
    pub ok: bool,
}

pub struct IndexState {
    pub conns: HashMap<String, Connection>,
}

impl IndexState {
    pub fn new() -> Self {
        Self {
            conns: HashMap::new(),
        }
    }
}

pub type SharedIndex = Mutex<IndexState>;

fn now_ms() -> i64 {
    use std::time::{SystemTime, UNIX_EPOCH};
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

/// Stable short key from absolute vault root (not folder basename).
pub fn vault_key_from_root(root: &str) -> String {
    let mut h: u64 = 0xcbf29ce484222325;
    for b in root.trim().trim_end_matches('/').as_bytes() {
        h ^= *b as u64;
        h = h.wrapping_mul(0x100000001b3);
    }
    format!("{:016x}", h)
}

pub fn resolve_index_path(app_data: &Path, vault_root: &str) -> PathBuf {
    let key = vault_key_from_root(vault_root);
    app_data.join("indexes").join(format!("{key}.sqlite"))
}

fn open_conn(db_path: &str) -> Result<Connection, String> {
    if let Some(parent) = Path::new(db_path).parent() {
        std::fs::create_dir_all(parent).map_err(|e| format!("mkdir index: {e}"))?;
    }
    let conn = Connection::open(db_path).map_err(|e| format!("sqlite open: {e}"))?;
    conn.execute_batch("PRAGMA journal_mode=WAL; PRAGMA synchronous=NORMAL;")
        .map_err(|e| format!("pragma: {e}"))?;
    Ok(conn)
}

fn ensure_schema(conn: &Connection, vault_id: &str, vault_root: Option<&str>) -> Result<(), String> {
    conn.execute_batch(DDL)
        .map_err(|e| format!("schema ddl: {e}"))?;

    let ver: i32 = conn
        .query_row(
            "SELECT value FROM meta_kv WHERE key = 'schema_version'",
            [],
            |r| r.get::<_, String>(0),
        )
        .ok()
        .and_then(|s| s.parse().ok())
        .unwrap_or(0);

    if ver > 0 && ver < SCHEMA_VERSION {
        let _ = conn.execute_batch(
            "DELETE FROM link_edge;
             DELETE FROM tag_map;
             DELETE FROM note_meta;
             DROP TABLE IF EXISTS note_fts;",
        );
        conn.execute_batch(DDL)
            .map_err(|e| format!("schema migrate: {e}"))?;
    }

    conn.execute(
        "INSERT INTO meta_kv(key, value) VALUES ('schema_version', ?1)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        params![SCHEMA_VERSION.to_string()],
    )
    .map_err(|e| e.to_string())?;
    conn.execute(
        "INSERT INTO meta_kv(key, value) VALUES ('vault_id', ?1)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        params![vault_id],
    )
    .map_err(|e| e.to_string())?;
    if let Some(root) = vault_root {
        conn.execute(
            "INSERT INTO meta_kv(key, value) VALUES ('vault_root', ?1)
             ON CONFLICT(key) DO UPDATE SET value = excluded.value",
            params![root],
        )
        .map_err(|e| e.to_string())?;
    }
    Ok(())
}

fn fts_escape_query(q: &str) -> String {
    q.split(|c: char| !c.is_alphanumeric() && c != '_' && c != '-')
        .filter(|t| t.len() >= 2)
        .map(|t| {
            let cleaned: String = t
                .chars()
                .filter(|c| c.is_alphanumeric() || *c == '_' || *c == '-')
                .collect();
            format!("\"{cleaned}\"*")
        })
        .collect::<Vec<_>>()
        .join(" ")
}

fn upsert_note_tx(conn: &Connection, note: &NoteMetaDto) -> Result<(), String> {
    if note.kind == "folder" {
        conn.execute(
            "INSERT INTO note_meta(id, path, name, kind, parent_id, mtime, size, content_hash, title, deleted)
             VALUES (?1,?2,?3,'folder',?4,?5,?6,NULL,?7,0)
             ON CONFLICT(id) DO UPDATE SET
               path=excluded.path, name=excluded.name, parent_id=excluded.parent_id,
               mtime=excluded.mtime, size=excluded.size, title=excluded.title, deleted=0",
            params![
                note.id,
                note.path,
                note.name,
                note.parent_id,
                note.mtime,
                note.size,
                note.title.as_deref().unwrap_or(&note.name),
            ],
        )
        .map_err(|e| e.to_string())?;
        return Ok(());
    }

    let title = note
        .title
        .clone()
        .unwrap_or_else(|| note.name.trim_end_matches(".md").to_string());

    // Wave B: when body_snippet is None, preserve existing FTS body (meta-only reconcile)
    let body_update = note.body_snippet.clone();
    let body_for_insert = body_update.clone().unwrap_or_default();

    // content_hash: only overwrite when provided
    if note.content_hash.is_some() {
        conn.execute(
            "INSERT INTO note_meta(id, path, name, kind, parent_id, mtime, size, content_hash, title, deleted)
             VALUES (?1,?2,?3,'note',?4,?5,?6,?7,?8,0)
             ON CONFLICT(id) DO UPDATE SET
               path=excluded.path, name=excluded.name, parent_id=excluded.parent_id,
               mtime=excluded.mtime, size=excluded.size, content_hash=excluded.content_hash,
               title=excluded.title, deleted=0",
            params![
                note.id,
                note.path,
                note.name,
                note.parent_id,
                note.mtime,
                note.size,
                note.content_hash,
                title,
            ],
        )
        .map_err(|e| e.to_string())?;
    } else {
        conn.execute(
            "INSERT INTO note_meta(id, path, name, kind, parent_id, mtime, size, content_hash, title, deleted)
             VALUES (?1,?2,?3,'note',?4,?5,?6,NULL,?7,0)
             ON CONFLICT(id) DO UPDATE SET
               path=excluded.path, name=excluded.name, parent_id=excluded.parent_id,
               mtime=excluded.mtime, size=excluded.size,
               title=excluded.title, deleted=0",
            params![
                note.id,
                note.path,
                note.name,
                note.parent_id,
                note.mtime,
                note.size,
                title,
            ],
        )
        .map_err(|e| e.to_string())?;
    }

    if let Some(body) = body_update {
        conn.execute("DELETE FROM note_fts WHERE note_id = ?1", params![note.id])
            .map_err(|e| e.to_string())?;
        conn.execute(
            "INSERT INTO note_fts(note_id, title, path, body) VALUES (?1,?2,?3,?4)",
            params![note.id, title, note.path, body],
        )
        .map_err(|e| e.to_string())?;
    } else {
        // Preserve existing body; refresh title/path only
        let old_body: String = conn
            .query_row(
                "SELECT body FROM note_fts WHERE note_id = ?1",
                params![note.id],
                |r| r.get(0),
            )
            .unwrap_or_default();
        conn.execute("DELETE FROM note_fts WHERE note_id = ?1", params![note.id])
            .map_err(|e| e.to_string())?;
        conn.execute(
            "INSERT INTO note_fts(note_id, title, path, body) VALUES (?1,?2,?3,?4)",
            params![note.id, title, note.path, old_body],
        )
        .map_err(|e| e.to_string())?;
    }

    // Only replace links/tags when caller supplies them (None = leave previous)
    if note.link_targets.is_some() {
        conn.execute("DELETE FROM link_edge WHERE source_id = ?1", params![note.id])
            .map_err(|e| e.to_string())?;
        if let Some(links) = &note.link_targets {
            for raw in links {
                let norm = raw.trim().to_lowercase();
                if norm.is_empty() {
                    continue;
                }
                conn.execute(
                    "INSERT OR IGNORE INTO link_edge(source_id, target_raw, target_norm, target_id)
                     VALUES (?1,?2,?3,NULL)",
                    params![note.id, raw, norm],
                )
                .map_err(|e| e.to_string())?;
            }
        }
    }

    if note.tags.is_some() {
        conn.execute("DELETE FROM tag_map WHERE note_id = ?1", params![note.id])
            .map_err(|e| e.to_string())?;
        if let Some(tags) = &note.tags {
            for tag in tags {
                let t = tag.trim().to_lowercase();
                if t.is_empty() {
                    continue;
                }
                conn.execute(
                    "INSERT OR IGNORE INTO tag_map(tag, note_id) VALUES (?1,?2)",
                    params![t, note.id],
                )
                .map_err(|e| e.to_string())?;
            }
        }
    }
    Ok(())
}

fn remove_note_tx(conn: &Connection, id: &str) -> Result<(), String> {
    conn.execute("DELETE FROM note_fts WHERE note_id = ?1", params![id])
        .map_err(|e| e.to_string())?;
    conn.execute("DELETE FROM link_edge WHERE source_id = ?1", params![id])
        .map_err(|e| e.to_string())?;
    conn.execute("DELETE FROM tag_map WHERE note_id = ?1", params![id])
        .map_err(|e| e.to_string())?;
    conn.execute("DELETE FROM note_meta WHERE id = ?1", params![id])
        .map_err(|e| e.to_string())?;
    Ok(())
}

fn wipe_tx(conn: &Connection) -> Result<(), String> {
    conn.execute_batch(
        "DELETE FROM link_edge;
         DELETE FROM tag_map;
         DELETE FROM note_meta;
         DELETE FROM note_fts;",
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

fn stats_tx(conn: &Connection) -> Result<IndexStatsDto, String> {
    let notes: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM note_meta WHERE kind='note' AND deleted=0",
            [],
            |r| r.get(0),
        )
        .unwrap_or(0);
    let folders: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM note_meta WHERE kind='folder' AND deleted=0",
            [],
            |r| r.get(0),
        )
        .unwrap_or(0);
    let edges: i64 = conn
        .query_row("SELECT COUNT(*) FROM link_edge", [], |r| r.get(0))
        .unwrap_or(0);
    let tags: i64 = conn
        .query_row("SELECT COUNT(*) FROM tag_map", [], |r| r.get(0))
        .unwrap_or(0);
    Ok(IndexStatsDto {
        notes,
        folders,
        schema_version: SCHEMA_VERSION,
        edges,
        tags,
    })
}

fn search_tx(conn: &Connection, query: &str, limit: i64) -> Result<Vec<SearchHitDto>, String> {
    let q = query.trim();
    if q.is_empty() {
        let mut stmt = conn
            .prepare(
                "SELECT id, path, COALESCE(title, name), mtime
                 FROM note_meta
                 WHERE kind='note' AND deleted=0
                 ORDER BY mtime DESC
                 LIMIT ?1",
            )
            .map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map(params![limit], |r| {
                Ok(SearchHitDto {
                    note_id: r.get(0)?,
                    path: r.get(1)?,
                    title: r.get(2)?,
                    snippet: String::new(),
                    score: 1.0,
                    match_type: "title".into(),
                })
            })
            .map_err(|e| e.to_string())?;
        let mut out = Vec::new();
        for row in rows.flatten() {
            out.push(row);
        }
        return Ok(out);
    }

    let fts_q = fts_escape_query(q);
    if fts_q.is_empty() {
        return Ok(vec![]);
    }

    let mut stmt = conn
        .prepare(
            "SELECT f.note_id, f.path, f.title, snippet(note_fts, 3, '', '', '…', 12),
                    bm25(note_fts)
             FROM note_fts f
             JOIN note_meta m ON m.id = f.note_id
             WHERE note_fts MATCH ?1 AND m.deleted = 0 AND m.kind = 'note'
             ORDER BY bm25(note_fts)
             LIMIT ?2",
        )
        .map_err(|e| e.to_string())?;

    let rows = stmt
        .query_map(params![fts_q, limit], |r| {
            let title: String = r.get(2)?;
            let path: String = r.get(1)?;
            let snip: String = r.get(3)?;
            let bm: f64 = r.get(4).unwrap_or(0.0);
            let q_l = q.to_lowercase();
            let title_l = title.to_lowercase();
            let (score, match_type) = if title_l == q_l {
                (120.0, "title")
            } else if title_l.starts_with(&q_l) {
                (100.0, "title")
            } else if title_l.contains(&q_l) {
                (80.0, "title")
            } else if path.to_lowercase().contains(&q_l) {
                (60.0, "title")
            } else {
                (40.0 + (-bm).max(0.0).min(20.0), "content")
            };
            Ok(SearchHitDto {
                note_id: r.get(0)?,
                path,
                title,
                snippet: snip,
                score,
                match_type: match_type.into(),
            })
        })
        .map_err(|e| e.to_string())?;

    let mut out = Vec::new();
    for row in rows.flatten() {
        out.push(row);
    }
    out.sort_by(|a, b| b.score.partial_cmp(&a.score).unwrap_or(std::cmp::Ordering::Equal));
    Ok(out)
}

// ── Tauri commands ──────────────────────────────────────────────────────────

#[tauri::command]
pub fn vault_index_path(app: tauri::AppHandle, vault_root: String) -> Result<String, String> {
    use tauri::Manager;
    let data = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("app_data_dir: {e}"))?;
    let path = resolve_index_path(&data, &vault_root);
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    Ok(path.to_string_lossy().to_string())
}

#[tauri::command]
pub fn vault_index_open(
    app: tauri::AppHandle,
    state: tauri::State<'_, SharedIndex>,
    db_path: String,
    vault_id: String,
    vault_root: Option<String>,
) -> Result<IndexOpenResult, String> {
    use tauri::Manager;
    // Wave A: index DB must live under app data
    let data = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("app_data_dir: {e}"))?;
    let _ = crate::vault_scope::assert_index_db_path(&data, &db_path)?;

    let mut guard = state.lock().map_err(|e| e.to_string())?;
    if guard.conns.contains_key(&db_path) {
        return Ok(IndexOpenResult {
            ok: true,
            schema_version: SCHEMA_VERSION,
            kind: "sqlite".into(),
        });
    }
    let conn = open_conn(&db_path)?;
    // Schema only (no vault_root write yet)
    ensure_schema(&conn, &vault_id, None)?;

    // Wipe if this DB was bound to a different vault root
    if let Some(root) = vault_root.as_deref() {
        let stored: Option<String> = conn
            .query_row(
                "SELECT value FROM meta_kv WHERE key = 'vault_root'",
                [],
                |r| r.get(0),
            )
            .ok();
        if let Some(s) = stored {
            if s != root {
                wipe_tx(&conn)?;
            }
        }
        ensure_schema(&conn, &vault_id, Some(root))?;
    }

    conn.execute(
        "INSERT INTO meta_kv(key, value) VALUES ('last_open_ms', ?1)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        params![now_ms().to_string()],
    )
    .map_err(|e| e.to_string())?;

    guard.conns.insert(db_path, conn);
    Ok(IndexOpenResult {
        ok: true,
        schema_version: SCHEMA_VERSION,
        kind: "sqlite".into(),
    })
}

#[tauri::command]
pub fn vault_index_close(
    state: tauri::State<'_, SharedIndex>,
    db_path: String,
) -> Result<OkResult, String> {
    let mut guard = state.lock().map_err(|e| e.to_string())?;
    guard.conns.remove(&db_path);
    Ok(OkResult { ok: true })
}

#[tauri::command]
pub fn vault_index_wipe(
    state: tauri::State<'_, SharedIndex>,
    db_path: String,
) -> Result<OkResult, String> {
    let guard = state.lock().map_err(|e| e.to_string())?;
    let conn = guard
        .conns
        .get(&db_path)
        .ok_or_else(|| "index not open".to_string())?;
    wipe_tx(conn)?;
    Ok(OkResult { ok: true })
}

#[tauri::command]
pub fn vault_index_rebuild(
    state: tauri::State<'_, SharedIndex>,
    db_path: String,
    notes: Vec<NoteMetaDto>,
) -> Result<IndexStatsDto, String> {
    let mut guard = state.lock().map_err(|e| e.to_string())?;
    let conn = guard
        .conns
        .get_mut(&db_path)
        .ok_or_else(|| "index not open".to_string())?;
    let tx = conn.unchecked_transaction().map_err(|e| e.to_string())?;
    wipe_tx(&tx)?;
    for note in &notes {
        upsert_note_tx(&tx, note)?;
    }
    tx.execute(
        "INSERT INTO meta_kv(key, value) VALUES ('last_full_rebuild_ms', ?1)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        params![now_ms().to_string()],
    )
    .map_err(|e| e.to_string())?;
    tx.commit().map_err(|e| e.to_string())?;
    stats_tx(conn)
}

#[tauri::command]
pub fn vault_index_upsert(
    state: tauri::State<'_, SharedIndex>,
    db_path: String,
    note: NoteMetaDto,
) -> Result<OkResult, String> {
    let mut guard = state.lock().map_err(|e| e.to_string())?;
    let conn = guard
        .conns
        .get_mut(&db_path)
        .ok_or_else(|| "index not open".to_string())?;
    let tx = conn.unchecked_transaction().map_err(|e| e.to_string())?;
    upsert_note_tx(&tx, &note)?;
    tx.commit().map_err(|e| e.to_string())?;
    Ok(OkResult { ok: true })
}

#[tauri::command]
pub fn vault_index_remove(
    state: tauri::State<'_, SharedIndex>,
    db_path: String,
    id: String,
) -> Result<OkResult, String> {
    let mut guard = state.lock().map_err(|e| e.to_string())?;
    let conn = guard
        .conns
        .get_mut(&db_path)
        .ok_or_else(|| "index not open".to_string())?;
    remove_note_tx(conn, &id)?;
    Ok(OkResult { ok: true })
}

#[tauri::command]
pub fn vault_index_search(
    state: tauri::State<'_, SharedIndex>,
    db_path: String,
    query: String,
    limit: Option<i64>,
) -> Result<Vec<SearchHitDto>, String> {
    let guard = state.lock().map_err(|e| e.to_string())?;
    let conn = guard
        .conns
        .get(&db_path)
        .ok_or_else(|| "index not open".to_string())?;
    search_tx(conn, &query, limit.unwrap_or(40))
}

#[tauri::command]
pub fn vault_index_stats(
    state: tauri::State<'_, SharedIndex>,
    db_path: String,
) -> Result<IndexStatsDto, String> {
    let guard = state.lock().map_err(|e| e.to_string())?;
    let conn = guard
        .conns
        .get(&db_path)
        .ok_or_else(|| "index not open".to_string())?;
    stats_tx(conn)
}

/// Wave B: list all note_meta (+ optional FTS body snippet) to hydrate the JS mirror
/// without wiping SQLite on open.
#[tauri::command]
pub fn vault_index_list(
    state: tauri::State<'_, SharedIndex>,
    db_path: String,
    limit: Option<i64>,
) -> Result<Vec<NoteMetaDto>, String> {
    let guard = state.lock().map_err(|e| e.to_string())?;
    let conn = guard
        .conns
        .get(&db_path)
        .ok_or_else(|| "index not open".to_string())?;
    let lim = limit.unwrap_or(500_000).max(1);
    let mut stmt = conn
        .prepare(
            "SELECT m.id, m.path, m.name, m.kind, m.parent_id, m.mtime, m.size,
                    m.content_hash, m.title,
                    (SELECT f.body FROM note_fts f WHERE f.note_id = m.id LIMIT 1)
             FROM note_meta m
             WHERE m.deleted = 0
             ORDER BY m.path
             LIMIT ?1",
        )
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map(params![lim], |r| {
            Ok(NoteMetaDto {
                id: r.get(0)?,
                path: r.get(1)?,
                name: r.get(2)?,
                kind: r.get(3)?,
                parent_id: r.get(4)?,
                mtime: r.get(5)?,
                size: r.get(6)?,
                content_hash: r.get(7)?,
                title: r.get(8)?,
                body_snippet: r.get::<_, Option<String>>(9)?,
                tags: None,
                link_targets: None,
            })
        })
        .map_err(|e| e.to_string())?;
    let mut out = Vec::new();
    for row in rows {
        out.push(row.map_err(|e| e.to_string())?);
    }
    Ok(out)
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct IndexFillResult {
    pub indexed: i64,
    pub skipped: i64,
    pub errors: i64,
    pub notes: i64,
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct IndexFillProgress {
    pub db_path: String,
    pub scanned: i64,
    pub total: i64,
    pub indexed: i64,
    pub skipped: i64,
    pub errors: i64,
    pub phase: String,
    pub message: Option<String>,
}

struct ExistingNote {
    id: String,
    mtime: i64,
    size: Option<i64>,
}

struct DiskNote {
    abs: PathBuf,
    rel: String,
    name: String,
    mtime: i64,
    size: i64,
}

fn fill_inflight() -> &'static Mutex<HashSet<String>> {
    static LOCKS: OnceLock<Mutex<HashSet<String>>> = OnceLock::new();
    LOCKS.get_or_init(|| Mutex::new(HashSet::new()))
}

struct FillGuard(String);

impl FillGuard {
    fn acquire(db_path: &str) -> Result<Self, String> {
        let mut g = fill_inflight().lock().map_err(|e| e.to_string())?;
        if !g.insert(db_path.to_string()) {
            return Err("index fill already running for this vault".into());
        }
        Ok(Self(db_path.to_string()))
    }
}

impl Drop for FillGuard {
    fn drop(&mut self) {
        if let Ok(mut g) = fill_inflight().lock() {
            g.remove(&self.0);
        }
    }
}

/// First `head_chars` Unicode scalars. ASCII markdown takes the byte-fast path
/// so 100k heads do not pay `chars().take` per file.
fn take_head(bytes: &[u8], head_chars: usize) -> String {
    if bytes.is_empty() || head_chars == 0 {
        return String::new();
    }
    if bytes.iter().all(|b| *b < 0x80) {
        let n = bytes.len().min(head_chars);
        return String::from_utf8_lossy(&bytes[..n]).into_owned();
    }
    String::from_utf8_lossy(bytes)
        .chars()
        .take(head_chars)
        .collect()
}

fn load_existing_notes(conn: &Connection) -> HashMap<String, ExistingNote> {
    let mut map = HashMap::new();
    let Ok(mut stmt) = conn.prepare(
        "SELECT id, path, mtime, size FROM note_meta WHERE kind='note' AND deleted=0",
    ) else {
        return map;
    };
    let Ok(rows) = stmt.query_map([], |r| {
        Ok((
            r.get::<_, String>(1)?,
            ExistingNote {
                id: r.get(0)?,
                mtime: r.get(2)?,
                size: r.get(3)?,
            },
        ))
    }) else {
        return map;
    };
    for row in rows.flatten() {
        map.insert(row.0, row.1);
    }
    map
}

fn collect_md_notes(root: &Path) -> Vec<DiskNote> {
    use std::time::SystemTime;
    let mut out = Vec::new();
    let mut stack: Vec<(PathBuf, String)> = vec![(root.to_path_buf(), String::new())];
    while let Some((dir, rel)) = stack.pop() {
        let entries = match std::fs::read_dir(&dir) {
            Ok(e) => e,
            Err(_) => continue,
        };
        let mut dirs: Vec<(PathBuf, String)> = Vec::new();
        for entry in entries.flatten() {
            let name = entry.file_name().to_string_lossy().to_string();
            if name.starts_with('.') || FILL_SKIP_DIRS.iter().any(|s| *s == name) {
                continue;
            }
            let ft = match entry.file_type() {
                Ok(t) => t,
                Err(_) => continue,
            };
            let child_rel = if rel.is_empty() {
                name.clone()
            } else {
                format!("{rel}/{name}")
            };
            if ft.is_dir() {
                dirs.push((entry.path(), child_rel));
                continue;
            }
            if !ft.is_file() || !name.to_ascii_lowercase().ends_with(".md") {
                continue;
            }
            let meta = entry.metadata().ok();
            let mtime = meta
                .as_ref()
                .and_then(|m| m.modified().ok())
                .and_then(|t| t.duration_since(SystemTime::UNIX_EPOCH).ok())
                .map(|d| d.as_millis() as i64)
                .unwrap_or(0);
            let size = meta.map(|m| m.len() as i64).unwrap_or(0);
            out.push(DiskNote {
                abs: entry.path(),
                rel: child_rel,
                name,
                mtime,
                size,
            });
        }
        stack.extend(dirs);
    }
    out
}

fn note_unchanged(existing: &ExistingNote, disk: &DiskNote) -> bool {
    existing.mtime == disk.mtime && existing.size == Some(disk.size)
}

fn should_emit_progress(last_at: Instant, last_scanned: i64, scanned: i64) -> bool {
    scanned.saturating_sub(last_scanned) >= 64 || last_at.elapsed() >= Duration::from_millis(250)
}

fn flush_note_batch(
    conn: &mut Connection,
    batch: &mut Vec<NoteMetaDto>,
    indexed: &mut i64,
    errors: &mut i64,
) {
    if batch.is_empty() {
        return;
    }
    let tx = match conn.unchecked_transaction() {
        Ok(t) => t,
        Err(_) => {
            *errors += batch.len() as i64;
            batch.clear();
            return;
        }
    };
    let flush_err = (|| -> Result<(), String> {
        let mut meta = tx
            .prepare_cached(
                "INSERT INTO note_meta(id, path, name, kind, parent_id, mtime, size, content_hash, title, deleted)
                 VALUES (?1,?2,?3,'note',?4,?5,?6,NULL,?7,0)
                 ON CONFLICT(id) DO UPDATE SET
                   path=excluded.path, name=excluded.name, parent_id=excluded.parent_id,
                   mtime=excluded.mtime, size=excluded.size,
                   title=excluded.title, deleted=0",
            )
            .map_err(|e| e.to_string())?;
        let mut fts_del = tx
            .prepare_cached("DELETE FROM note_fts WHERE note_id = ?1")
            .map_err(|e| e.to_string())?;
        let mut fts_ins = tx
            .prepare_cached(
                "INSERT INTO note_fts(note_id, title, path, body) VALUES (?1,?2,?3,?4)",
            )
            .map_err(|e| e.to_string())?;
        for note in batch.iter() {
            let title = note
                .title
                .as_deref()
                .map(|s| s.to_string())
                .unwrap_or_else(|| note.name.trim_end_matches(".md").to_string());
            let body = note.body_snippet.as_deref().unwrap_or("");
            if meta
                .execute(params![
                    note.id,
                    note.path,
                    note.name,
                    note.parent_id,
                    note.mtime,
                    note.size,
                    title,
                ])
                .is_err()
            {
                *errors += 1;
                continue;
            }
            if fts_del.execute(params![note.id]).is_err()
                || fts_ins
                    .execute(params![note.id, title, note.path, body])
                    .is_err()
            {
                *errors += 1;
                continue;
            }
            *indexed += 1;
        }
        Ok(())
    })();
    if flush_err.is_err() || tx.commit().is_err() {
        *errors += batch.len() as i64;
        *indexed = (*indexed - batch.len() as i64).max(0);
    }
    batch.clear();
}

fn remove_stale_notes(
    conn: &mut Connection,
    existing: &HashMap<String, ExistingNote>,
    seen: &HashSet<String>,
) -> i64 {
    let stale: Vec<String> = existing
        .iter()
        .filter(|(path, _)| !seen.contains(*path))
        .map(|(_, e)| e.id.clone())
        .collect();
    if stale.is_empty() {
        return 0;
    }
    let Ok(tx) = conn.unchecked_transaction() else {
        return 0;
    };
    let mut removed = 0i64;
    for id in &stale {
        if remove_note_tx(&tx, id).is_ok() {
            removed += 1;
        }
    }
    if tx.commit().is_ok() {
        removed
    } else {
        0
    }
}

/// Incremental disk → FTS5 fill. Skips path+mtime+size matches. Emits progress
/// at least every 64 notes or 250ms. Does not TRUNCATE-checkpoint WAL.
pub(crate) fn fill_from_disk_on_conn(
    conn: &mut Connection,
    vault_root: &Path,
    head_chars: usize,
    force_rebuild: bool,
    db_path: &str,
    mut on_progress: impl FnMut(&IndexFillProgress),
) -> Result<IndexFillResult, String> {
    use std::fs::File;
    use std::io::Read;

    let existing = load_existing_notes(conn);
    let files = collect_md_notes(vault_root);
    let total = files.len() as i64;
    let mut progress = IndexFillProgress {
        db_path: db_path.to_string(),
        scanned: 0,
        total,
        indexed: 0,
        skipped: 0,
        errors: 0,
        phase: "indexing".into(),
        message: None,
    };
    on_progress(&progress);

    let mut indexed: i64 = 0;
    let mut skipped: i64 = 0;
    let mut errors: i64 = 0;
    let mut batch: Vec<NoteMetaDto> = Vec::with_capacity(512);
    let mut seen: HashSet<String> = HashSet::with_capacity(files.len());
    let mut buf = vec![0u8; head_chars.saturating_mul(4).clamp(256, 128_000)];
    let mut last_emit = Instant::now();
    let mut last_emitted_scanned: i64 = 0;

    for (i, disk) in files.iter().enumerate() {
        seen.insert(disk.rel.clone());
        let scanned = (i as i64) + 1;
        if !force_rebuild {
            if let Some(prev) = existing.get(&disk.rel) {
                if note_unchanged(prev, disk) {
                    skipped += 1;
                    if should_emit_progress(last_emit, last_emitted_scanned, scanned) {
                        progress.scanned = scanned;
                        progress.indexed = indexed;
                        progress.skipped = skipped;
                        progress.errors = errors;
                        on_progress(&progress);
                        last_emit = Instant::now();
                        last_emitted_scanned = scanned;
                    }
                    continue;
                }
            }
        }

        let body = match File::open(&disk.abs) {
            Ok(mut f) => {
                let n = f.read(&mut buf).unwrap_or(0);
                take_head(&buf[..n], head_chars)
            }
            Err(_) => {
                errors += 1;
                String::new()
            }
        };
        let parent_path = disk.rel.rsplit_once('/').map(|(p, _)| p.to_string());
        batch.push(NoteMetaDto {
            id: desk_node_id(&disk.rel),
            path: disk.rel.clone(),
            name: disk.name.clone(),
            kind: "note".into(),
            parent_id: parent_path.map(|p| desk_node_id(&p)),
            mtime: disk.mtime,
            size: Some(disk.size),
            content_hash: None,
            title: None,
            body_snippet: Some(body),
            tags: None,
            link_targets: None,
        });
        if batch.len() >= 512 {
            flush_note_batch(conn, &mut batch, &mut indexed, &mut errors);
        }
        if should_emit_progress(last_emit, last_emitted_scanned, scanned) {
            progress.scanned = scanned;
            progress.indexed = indexed;
            progress.skipped = skipped;
            progress.errors = errors;
            on_progress(&progress);
            last_emit = Instant::now();
            last_emitted_scanned = scanned;
        }
    }
    flush_note_batch(conn, &mut batch, &mut indexed, &mut errors);
    let _ = remove_stale_notes(conn, &existing, &seen);

    // PASSIVE never waits for writers; never TRUNCATE (that hung Tower after 100k rows).
    let _ = conn.execute_batch("PRAGMA wal_checkpoint(PASSIVE);");

    let result = IndexFillResult {
        indexed,
        skipped,
        errors,
        notes: total,
    };
    progress.scanned = total;
    progress.indexed = indexed;
    progress.skipped = skipped;
    progress.errors = errors;
    progress.phase = "done".into();
    on_progress(&progress);
    Ok(result)
}

/// Must match TS `deskNodeId` in `src/lib/vault/tauri-adapter.ts`.
/// Rel paths are POSIX (`/`); a Windows `\` is treated as `/`.
fn desk_node_id(path: &str) -> String {
    let mut out = String::from("desk_");
    let mut prev_us = false;
    for raw in path.chars() {
        let c = if raw == '\\' { '/' } else { raw };
        let ok = c.is_ascii_alphanumeric() || matches!(c, '.' | '_' | '/' | '-');
        if ok {
            out.push(c);
            prev_us = false;
        } else if !prev_us {
            out.push('_');
            prev_us = true;
        }
    }
    out
}

#[cfg(test)]
mod desk_id_tests {
    use super::desk_node_id;

    #[test]
    fn matches_ts_contract() {
        assert_eq!(desk_node_id("Hub/Note-1.md"), "desk_Hub/Note-1.md");
        assert_eq!(desk_node_id("a\\b.md"), "desk_a/b.md");
        assert_eq!(desk_node_id("weird  name.md"), "desk_weird_name.md");
        assert_eq!(desk_node_id("foo@@@bar.md"), "desk_foo_bar.md");
    }
}

#[cfg(test)]
mod fill_tests {
    use super::*;
    use std::fs;
    use std::io::Write;
    use std::path::PathBuf;

    fn temp_pair(label: &str) -> (PathBuf, PathBuf) {
        let stamp = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_nanos())
            .unwrap_or(0);
        let base = std::env::temp_dir().join(format!(
            "nexus-fill-{label}-{}-{stamp}",
            std::process::id()
        ));
        let vault = base.join("vault");
        let db = base.join("index.sqlite");
        fs::create_dir_all(&vault).unwrap();
        (vault, db)
    }

    fn write_note(vault: &Path, rel: &str, body: &str) {
        let path = vault.join(rel);
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent).unwrap();
        }
        let mut f = fs::File::create(path).unwrap();
        f.write_all(body.as_bytes()).unwrap();
        f.flush().unwrap();
    }

    fn open_test_conn(db: &Path, vault: &Path) -> Connection {
        let conn = open_conn(&db.to_string_lossy()).unwrap();
        ensure_schema(&conn, "test", Some(&vault.to_string_lossy())).unwrap();
        let _ = conn.busy_timeout(Duration::from_millis(2_000));
        conn
    }

    fn fill(
        conn: &mut Connection,
        vault: &Path,
        force: bool,
    ) -> (IndexFillResult, Vec<IndexFillProgress>) {
        let mut ticks = Vec::new();
        let result = fill_from_disk_on_conn(conn, vault, 8000, force, "test.sqlite", |p| {
            ticks.push(p.clone());
        })
        .unwrap();
        (result, ticks)
    }

    #[test]
    fn take_head_ascii_and_unicode() {
        assert_eq!(take_head(b"hello world", 5), "hello");
        assert_eq!(take_head("café extra".as_bytes(), 4), "café");
        assert_eq!(take_head(b"", 8), "");
    }

    #[test]
    fn incremental_skips_unchanged_and_reindexes_mtime() {
        let (vault, db) = temp_pair("incr");
        write_note(&vault, "Hub.md", "retrieval hub body\n");
        write_note(&vault, "cluster.md", "cluster token\n");
        write_note(&vault, "other.md", "plain note\n");
        let mut conn = open_test_conn(&db, &vault);

        let (first, ticks) = fill(&mut conn, &vault, false);
        assert_eq!(first.notes, 3);
        assert_eq!(first.indexed, 3);
        assert_eq!(first.skipped, 0);
        assert!(ticks.iter().any(|p| p.phase == "indexing" && p.total == 3));
        assert_eq!(ticks.last().map(|p| p.phase.as_str()), Some("done"));
        let hits = search_tx(&conn, "retrieval hub", 8).unwrap();
        assert!(
            hits.iter().any(|h| h.path.contains("Hub")),
            "cold fill must FTS index heads"
        );

        let (second, _) = fill(&mut conn, &vault, false);
        assert_eq!(second.notes, 3);
        assert_eq!(second.indexed, 0, "reopen must skip unchanged path+mtime+size");
        assert_eq!(second.skipped, 3);
        let hits2 = search_tx(&conn, "retrieval hub", 8).unwrap();
        assert!(hits2.iter().any(|h| h.path.contains("Hub")));

        write_note(&vault, "cluster.md", "cluster token plus new unique-xyz\n");
        let (third, _) = fill(&mut conn, &vault, false);
        assert_eq!(third.indexed, 1);
        assert_eq!(third.skipped, 2);
        let hits3 = search_tx(&conn, "unique-xyz", 8).unwrap();
        assert!(hits3.iter().any(|h| h.path.contains("cluster")));

        let _ = fs::remove_dir_all(vault.parent().unwrap());
    }

    #[test]
    fn force_rebuild_reupserts_and_stale_paths_are_removed() {
        let (vault, db) = temp_pair("force");
        write_note(&vault, "keep.md", "keep body\n");
        write_note(&vault, "gone.md", "gone body\n");
        let mut conn = open_test_conn(&db, &vault);
        let (first, _) = fill(&mut conn, &vault, false);
        assert_eq!(first.indexed, 2);

        fs::remove_file(vault.join("gone.md")).unwrap();
        let (forced, _) = fill(&mut conn, &vault, true);
        assert_eq!(forced.notes, 1);
        assert_eq!(forced.indexed, 1);
        assert_eq!(forced.skipped, 0);
        let stats = stats_tx(&conn).unwrap();
        assert_eq!(stats.notes, 1);

        let _ = fs::remove_dir_all(vault.parent().unwrap());
    }

    #[test]
    fn progress_ticks_cover_large_skip_batches() {
        let (vault, db) = temp_pair("prog");
        for i in 0..80 {
            write_note(
                &vault,
                &format!("n{i:03}.md"),
                &format!("note {i} cluster\n"),
            );
        }
        let mut conn = open_test_conn(&db, &vault);
        let (first, ticks) = fill(&mut conn, &vault, false);
        assert_eq!(first.indexed, 80);
        assert!(ticks.len() >= 2, "start + done at minimum, got {}", ticks.len());
        assert!(ticks.iter().any(|p| p.scanned > 0 && p.phase == "indexing"));
        let (second, ticks2) = fill(&mut conn, &vault, false);
        assert_eq!(second.skipped, 80);
        assert_eq!(second.indexed, 0);
        assert!(ticks2.iter().any(|p| p.skipped >= 64 || p.phase == "done"));

        let _ = fs::remove_dir_all(vault.parent().unwrap());
    }
}

const FILL_SKIP_DIRS: &[&str] = &[
    ".git",
    ".noteapp",
    "node_modules",
    ".trash",
    ".obsidian",
    ".vscode",
    ".idea",
    "src-tauri",
    "dist",
    "dist-desktop",
    "target",
    ".nexus",
];

fn emit_fill_progress(app: &tauri::AppHandle, progress: &IndexFillProgress) {
    use tauri::Emitter;
    let _ = app.emit("vault-index-progress", progress);
}

fn fill_from_disk_job(
    app: &tauri::AppHandle,
    db_path: &str,
    vault_root: &str,
    head: usize,
    force_rebuild: bool,
) -> Result<IndexFillResult, String> {
    let root_path = Path::new(vault_root);
    if !root_path.is_dir() {
        let err = format!("not a directory: {vault_root}");
        emit_fill_progress(
            app,
            &IndexFillProgress {
                db_path: db_path.to_string(),
                scanned: 0,
                total: 0,
                indexed: 0,
                skipped: 0,
                errors: 1,
                phase: "error".into(),
                message: Some(err.clone()),
            },
        );
        return Err(err);
    }

    let mut conn = open_conn(db_path)?;
    let _ = conn.busy_timeout(Duration::from_millis(8_000));
    let vault_id: String = conn
        .query_row(
            "SELECT value FROM meta_kv WHERE key = 'vault_id'",
            [],
            |r| r.get(0),
        )
        .unwrap_or_else(|_| "fill".into());
    ensure_schema(&conn, &vault_id, Some(vault_root))?;

    let app_emit = app.clone();
    fill_from_disk_on_conn(
        &mut conn,
        root_path,
        head,
        force_rebuild,
        db_path,
        |p| emit_fill_progress(&app_emit, p),
    )
}

/// Walk the vault on disk and write FTS5 heads in one process.
/// Runs on the blocking pool so the WebView stays responsive; emits
/// `vault-index-progress` at least ~4 Hz. Incremental: skip unchanged
/// path+mtime+size. JS must not upsert 100k–300k notes over IPC (Wave E).
#[tauri::command]
pub async fn vault_index_fill_from_disk(
    app: tauri::AppHandle,
    state: tauri::State<'_, SharedIndex>,
    db_path: String,
    vault_root: String,
    head_chars: Option<u32>,
    force_rebuild: Option<bool>,
) -> Result<IndexFillResult, String> {
    crate::vault_scope::register_and_grant(&app, &vault_root)?;
    if !crate::vault_scope::is_allowed_vault_root(&vault_root) {
        return Err("vault root not allowed".into());
    }
    {
        let guard = state.lock().map_err(|e| e.to_string())?;
        if !guard.conns.contains_key(&db_path) {
            return Err("index not open".into());
        }
    }

    let head = head_chars.unwrap_or(8000).clamp(256, 32_000) as usize;
    let force = force_rebuild.unwrap_or(false);
    let _fill_guard = FillGuard::acquire(&db_path)?;
    let app2 = app.clone();
    let db2 = db_path.clone();
    let root2 = vault_root.clone();

    tauri::async_runtime::spawn_blocking(move || {
        match fill_from_disk_job(&app2, &db2, &root2, head, force) {
            Ok(r) => Ok(r),
            Err(e) => {
                emit_fill_progress(
                    &app2,
                    &IndexFillProgress {
                        db_path: db2,
                        scanned: 0,
                        total: 0,
                        indexed: 0,
                        skipped: 0,
                        errors: 1,
                        phase: "error".into(),
                        message: Some(e.clone()),
                    },
                );
                Err(e)
            }
        }
    })
    .await
    .map_err(|e| format!("SQLite FTS fill task failed: {e}"))?
}
