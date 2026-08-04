//! On-disk DurableIndex (SQLite FTS5). Disposable cache — markdown remains canonical.
//! Schema mirrors TS durable index contract (v3 contentful FTS for reliable MATCH).

use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::Mutex;

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
