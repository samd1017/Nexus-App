//! Shell catalog — the desktop UI reads pages, never the vault.
//!
//! Markdown stays on disk. `note_meta` is the catalog. Interactive commands
//! return a bounded page (tree window, folder-map level, or ego neighborhood).
//! A full note list is returned only under the small-vault graph budget.

use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use std::path::{Path, PathBuf};
use std::time::SystemTime;

/// Full note graph stays in the renderer only below the folder-map threshold.
pub const SHELL_FULL_MAX_NOTES: i64 = 399;
/// One tree page. Expand / "more" fetches another page, not the folder.
pub const SHELL_CHILD_PAGE: i64 = 200;
/// Names read while sorting one directory page. One official bucket fits
/// under this. A larger flat folder returns that page and stops.
pub const DIR_PAGE_SCAN_CAP: usize = 8192;
/// Backlink panel and status count share one bounded reverse-index read.
pub const SHELL_BACKLINK_LIMIT: i64 = 80;
/// Tag rail. Counts come from `tag_map`, not a body scan.
pub const SHELL_TAG_LIMIT: i64 = 48;
/// Notes listed for one tag.
pub const SHELL_TAG_NOTES_LIMIT: i64 = 80;
/// Wikilink / title prefix suggestions.
pub const SHELL_SUGGEST_LIMIT: i64 = 40;
/// Recent notes by modification time.
pub const SHELL_RECENT_LIMIT: i64 = 12;
/// Pinned paths resolved in one catalog read.
pub const SHELL_PIN_LIMIT: usize = 24;
/// `path:` / `folder:` palette page.
pub const SHELL_PATH_LIMIT: i64 = 40;
/// One shell read gives up after this many lock waits. It does not use the
/// 15s writer timeout.
pub const SHELL_BUSY_TRIES: u32 = 3;
pub const SHELL_BUSY_TIMEOUT_MS: u64 = 40;
pub const SHELL_BUSY_SLEEP_STEP_MS: u64 = 12;

pub fn shell_busy_sleep_ms(attempt: u32) -> u64 {
    SHELL_BUSY_SLEEP_STEP_MS.saturating_mul(u64::from(attempt) + 1)
}

/// Worst case for one catalog read while a fill batch holds the write lock.
pub fn shell_busy_budget_ms() -> u64 {
    let mut total = 0u64;
    let mut attempt = 0u32;
    while attempt < SHELL_BUSY_TRIES {
        total = total.saturating_add(SHELL_BUSY_TIMEOUT_MS);
        if attempt + 1 < SHELL_BUSY_TRIES {
            total = total.saturating_add(shell_busy_sleep_ms(attempt));
        }
        attempt += 1;
    }
    total
}
/// Folder map draw budget. Matches the TS folder graph cap.
pub const SHELL_GRAPH_MAX: i64 = 320;
pub const SHELL_EGO_MAX: i64 = 400;
pub const SHELL_EGO_HOPS: i64 = 2;
const SHELL_EGO_DEGREE: i64 = 48;
const SHELL_WRITE_BATCH: usize = 400;

const SKIP_DIRS: &[&str] = &[
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

/// Same algorithm as TS `deskNodeId` / Rust `desk_node_id`.
pub fn shell_node_id(path: &str) -> String {
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

fn normalize_rel(path: &str) -> String {
    path.replace('\\', "/").trim_matches('/').to_string()
}

fn parent_id_of(rel: &str) -> Option<String> {
    rel.rsplit_once('/').map(|(parent, _)| shell_node_id(parent))
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ShellRow {
    pub id: String,
    pub path: String,
    pub name: String,
    pub kind: String,
    pub parent_id: Option<String>,
    pub mtime: i64,
    pub child_notes: i64,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ShellLoaded {
    pub parent_id: String,
    pub loaded: i64,
    pub hidden: i64,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ShellMount {
    pub materialize: bool,
    pub pending: bool,
    pub notes: i64,
    pub folders: i64,
    pub rows: Vec<ShellRow>,
    pub root_ids: Vec<String>,
    pub active_note_id: Option<String>,
    pub omitted_notes: i64,
    pub loaded: Vec<ShellLoaded>,
    pub db_path: String,
    /// The open page is already in the search index. The next launch can
    /// paint Ready from this page without opening the database file first.
    #[serde(default)]
    pub titles_live: bool,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ShellPage {
    pub parent_path: String,
    pub rows: Vec<ShellRow>,
    pub note_total: i64,
    pub folder_total: i64,
    pub offset: i64,
    pub limit: i64,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ShellLevel {
    pub parent_path: String,
    pub rows: Vec<ShellRow>,
    pub note_total: i64,
    pub folder_total: i64,
    pub omitted: i64,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ShellEdge {
    pub source: String,
    pub target: String,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ShellEgo {
    pub center_id: String,
    pub rows: Vec<ShellRow>,
    pub edges: Vec<ShellEdge>,
    pub capped: bool,
}

fn pending_mount() -> ShellMount {
    ShellMount {
        materialize: false,
        pending: true,
        notes: 0,
        folders: 0,
        rows: Vec::new(),
        root_ids: Vec::new(),
        active_note_id: None,
        omitted_notes: 0,
        loaded: Vec::new(),
        db_path: String::new(),
        titles_live: false,
    }
}

fn page_snapshot_path(db_path: &str) -> PathBuf {
    PathBuf::from(format!("{db_path}.page.json"))
}

/// The last Ready page, beside the index. Small enough to read without the
/// database file.
pub fn write_page_snapshot(db_path: &str, mount: &ShellMount) -> Result<(), String> {
    if db_path.is_empty() || !mount.titles_live || mount.pending || mount.rows.is_empty() {
        return Ok(());
    }
    let path = page_snapshot_path(db_path);
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let body = serde_json::to_vec(mount).map_err(|e| e.to_string())?;
    std::fs::write(path, body).map_err(|e| e.to_string())
}

fn note_total_path(db_path: &str) -> PathBuf {
    PathBuf::from(format!("{db_path}.notes"))
}

/// The stored vault total, a few bytes beside the index. Reading it does
/// not open the database.
pub fn read_note_total_sidecar(db_path: &str) -> Option<i64> {
    if db_path.is_empty() {
        return None;
    }
    let n = std::fs::read_to_string(note_total_path(db_path))
        .ok()?
        .trim()
        .parse::<i64>()
        .ok()?;
    if n > 0 { Some(n) } else { None }
}

pub fn write_note_total_sidecar(db_path: &str, notes: i64) {
    if db_path.is_empty() || notes <= 0 {
        return;
    }
    let _ = std::fs::write(note_total_path(db_path), notes.to_string());
}

/// Raise the window's note total when a stored count is already known.
pub fn apply_note_total(mount: &mut ShellMount, total: i64) {
    if total <= mount.notes {
        return;
    }
    let shown = mount.rows.iter().filter(|r| r.kind == "note").count() as i64;
    mount.notes = total;
    mount.omitted_notes = (total - shown).max(0);
}

pub fn update_page_snapshot_notes(db_path: &str, notes: i64) {
    if notes > 0 {
        write_note_total_sidecar(db_path, notes);
    }
    let Some(mut mount) = read_page_snapshot(db_path) else {
        return;
    };
    if notes <= mount.notes {
        return;
    }
    apply_note_total(&mut mount, notes);
    let _ = write_page_snapshot(db_path, &mount);
}

pub fn read_page_snapshot(db_path: &str) -> Option<ShellMount> {
    if db_path.is_empty() || !Path::new(db_path).is_file() {
        return None;
    }
    let body = std::fs::read(page_snapshot_path(db_path)).ok()?;
    let mount: ShellMount = serde_json::from_slice(&body).ok()?;
    if !mount.titles_live || mount.pending || mount.rows.is_empty() {
        return None;
    }
    Some(mount)
}

pub fn ensure_shell_indexes(conn: &Connection) -> Result<(), String> {
    conn.execute_batch(
        "CREATE INDEX IF NOT EXISTS note_meta_parent ON note_meta(parent_id);
         CREATE INDEX IF NOT EXISTS note_meta_title_norm ON note_meta(lower(title));
         CREATE INDEX IF NOT EXISTS note_meta_path_norm ON note_meta(lower(path));
         CREATE INDEX IF NOT EXISTS note_meta_mtime ON note_meta(mtime DESC);",
    )
    .map_err(|e| e.to_string())
}

/// Indexes the first page needs. Title and path indexes are built after Ready
/// so a large catalog is not indexed before the window is on screen.
pub fn ensure_page_indexes(conn: &Connection) -> Result<(), String> {
    conn.execute_batch(
        "CREATE INDEX IF NOT EXISTS note_meta_parent ON note_meta(parent_id);
         CREATE INDEX IF NOT EXISTS note_meta_mtime ON note_meta(mtime DESC);",
    )
    .map_err(|e| e.to_string())
}

pub fn shell_search_indexes_ready(conn: &Connection) -> bool {
    conn.query_row(
        "SELECT 1 FROM sqlite_master WHERE type = 'index' AND name = 'note_meta_title_norm'",
        [],
        |r| r.get::<_, i64>(0),
    )
    .unwrap_or(0)
        == 1
}

const COUNT_NOTES_KEY: &str = "shell_note_count";
const COUNT_FOLDERS_KEY: &str = "shell_folder_count";

pub fn catalog_counts(conn: &Connection) -> Result<(i64, i64), String> {
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
    Ok((notes, folders))
}

pub fn store_catalog_counts(conn: &Connection, notes: i64, folders: i64) {
    let _ = conn.execute(
        "INSERT INTO meta_kv(key, value) VALUES (?1, ?2)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        params![COUNT_NOTES_KEY, notes.to_string()],
    );
    let _ = conn.execute(
        "INSERT INTO meta_kv(key, value) VALUES (?1, ?2)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        params![COUNT_FOLDERS_KEY, folders.to_string()],
    );
    if let Some(path) = conn.path() {
        write_note_total_sidecar(path, notes);
    }
}

pub fn clear_catalog_counts(conn: &Connection) {
    let _ = conn.execute(
        "DELETE FROM meta_kv WHERE key = ?1 OR key = ?2",
        params![COUNT_NOTES_KEY, COUNT_FOLDERS_KEY],
    );
}

/// One past the full-shell cap. A small vault still gets an exact total.
/// A larger catalog stops there, so open does not scan the table.
const COUNT_PROBE_LIMIT: i64 = SHELL_FULL_MAX_NOTES + 1;

fn read_stored_count(conn: &Connection, key: &str) -> Option<i64> {
    conn.query_row(
        "SELECT value FROM meta_kv WHERE key = ?1",
        params![key],
        |r| r.get::<_, String>(0),
    )
    .ok()
    .and_then(|v| v.parse().ok())
}

fn count_kind_capped(conn: &Connection, kind: &str, limit: i64) -> Result<i64, String> {
    conn.query_row(
        "SELECT COUNT(*) FROM (
            SELECT 1 FROM note_meta
            WHERE kind = ?1 AND deleted = 0
            LIMIT ?2
         )",
        params![kind, limit],
        |r| r.get(0),
    )
    .map_err(|e| e.to_string())
}

/// Stored total when a listing has already finished. Otherwise a short probe:
/// small vaults are exact and remembered; a large catalog stops at the probe
/// so the next open is not a walk of every row. The real total is stored
/// when that listing finishes.
pub fn catalog_counts_fast(conn: &Connection) -> Result<(i64, i64), String> {
    if let (Some(notes), Some(folders)) = (
        read_stored_count(conn, COUNT_NOTES_KEY),
        read_stored_count(conn, COUNT_FOLDERS_KEY),
    ) {
        return Ok((notes, folders));
    }
    let notes = count_kind_capped(conn, "note", COUNT_PROBE_LIMIT)?;
    let folders = if notes >= COUNT_PROBE_LIMIT {
        // Already a large catalog. One folder row is enough to skip a reseed.
        // Counting every folder would read the rest of the table.
        let any: i64 = conn
            .query_row(
                "SELECT 1 FROM note_meta WHERE kind = 'folder' AND deleted = 0 LIMIT 1",
                [],
                |r| r.get(0),
            )
            .unwrap_or(0);
        if any == 1 { 1 } else { 0 }
    } else {
        count_kind_capped(conn, "folder", COUNT_PROBE_LIMIT)?
    };
    if notes < COUNT_PROBE_LIMIT && folders < COUNT_PROBE_LIMIT {
        store_catalog_counts(conn, notes, folders);
    }
    Ok((notes, folders))
}

fn map_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<ShellRow> {
    Ok(ShellRow {
        id: row.get(0)?,
        path: row.get(1)?,
        name: row.get(2)?,
        kind: row.get(3)?,
        parent_id: row.get(4)?,
        mtime: row.get(5)?,
        child_notes: row.get(6)?,
    })
}

const PAGE_SQL_ROOT: &str = "
SELECT id, path, name, kind, parent_id, mtime,
       CASE WHEN kind='folder' THEN (
         SELECT COUNT(*) FROM note_meta c
         WHERE c.deleted=0 AND c.kind='note' AND c.parent_id = note_meta.id
       ) ELSE 0 END
FROM note_meta
WHERE deleted=0 AND parent_id IS NULL
ORDER BY CASE kind WHEN 'folder' THEN 0 ELSE 1 END, name COLLATE NOCASE
LIMIT ?1 OFFSET ?2";

const PAGE_SQL_CHILD: &str = "
SELECT id, path, name, kind, parent_id, mtime,
       CASE WHEN kind='folder' THEN (
         SELECT COUNT(*) FROM note_meta c
         WHERE c.deleted=0 AND c.kind='note' AND c.parent_id = note_meta.id
       ) ELSE 0 END
FROM note_meta
WHERE deleted=0 AND parent_id = ?1
ORDER BY CASE kind WHEN 'folder' THEN 0 ELSE 1 END, name COLLATE NOCASE
LIMIT ?2 OFFSET ?3";

fn count_children(conn: &Connection, parent_id: Option<&str>, kind: &str) -> i64 {
    if let Some(id) = parent_id {
        conn.query_row(
            "SELECT COUNT(*) FROM note_meta WHERE deleted=0 AND kind=?1 AND parent_id=?2",
            params![kind, id],
            |r| r.get(0),
        )
        .unwrap_or(0)
    } else {
        conn.query_row(
            "SELECT COUNT(*) FROM note_meta WHERE deleted=0 AND kind=?1 AND parent_id IS NULL",
            params![kind],
            |r| r.get(0),
        )
        .unwrap_or(0)
    }
}

pub fn query_children(
    conn: &Connection,
    parent_path: &str,
    limit: i64,
    offset: i64,
) -> Result<ShellPage, String> {
    let parent_path = normalize_rel(parent_path);
    let limit = limit.clamp(1, 2_000);
    let offset = offset.max(0);
    let parent_id = if parent_path.is_empty() {
        None
    } else {
        Some(shell_node_id(&parent_path))
    };
    let rows = if let Some(id) = parent_id.as_deref() {
        let mut stmt = conn.prepare(PAGE_SQL_CHILD).map_err(|e| e.to_string())?;
        let mapped = stmt
            .query_map(params![id, limit, offset], map_row)
            .map_err(|e| e.to_string())?;
        mapped.filter_map(|r| r.ok()).collect::<Vec<_>>()
    } else {
        let mut stmt = conn.prepare(PAGE_SQL_ROOT).map_err(|e| e.to_string())?;
        let mapped = stmt
            .query_map(params![limit, offset], map_row)
            .map_err(|e| e.to_string())?;
        mapped.filter_map(|r| r.ok()).collect::<Vec<_>>()
    };
    Ok(ShellPage {
        parent_path,
        note_total: count_children(conn, parent_id.as_deref(), "note"),
        folder_total: count_children(conn, parent_id.as_deref(), "folder"),
        offset,
        limit,
        rows,
    })
}

pub fn query_level(
    conn: &Connection,
    parent_path: &str,
    max_nodes: i64,
) -> Result<ShellLevel, String> {
    let max_nodes = max_nodes.clamp(1, SHELL_GRAPH_MAX);
    let page = query_children(conn, parent_path, max_nodes, 0)?;
    let total = page.folder_total + page.note_total;
    let mut rows = page.rows;
    if total > rows.len() as i64 && rows.len() as i64 >= max_nodes && max_nodes > 1 {
        rows.pop();
    }
    let omitted = (total - rows.len() as i64).max(0);
    Ok(ShellLevel {
        parent_path: page.parent_path,
        note_total: page.note_total,
        folder_total: page.folder_total,
        omitted,
        rows,
    })
}

fn row_by_path(conn: &Connection, path: &str) -> Result<Option<ShellRow>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT id, path, name, kind, parent_id, mtime,
                    CASE WHEN kind='folder' THEN (
                      SELECT COUNT(*) FROM note_meta c
                      WHERE c.deleted=0 AND c.kind='note' AND c.parent_id = note_meta.id
                    ) ELSE 0 END
             FROM note_meta WHERE deleted=0 AND path=?1 LIMIT 1",
        )
        .map_err(|e| e.to_string())?;
    let mut rows = stmt
        .query(params![path])
        .map_err(|e| e.to_string())?;
    if let Some(row) = rows.next().map_err(|e| e.to_string())? {
        return map_row(row).map(Some).map_err(|e| e.to_string());
    }
    Ok(None)
}

pub fn query_note(conn: &Connection, id: &str) -> Result<Option<ShellRow>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT id, path, name, kind, parent_id, mtime,
                    CASE WHEN kind='folder' THEN (
                      SELECT COUNT(*) FROM note_meta c
                      WHERE c.deleted=0 AND c.kind='note' AND c.parent_id = note_meta.id
                    ) ELSE 0 END
             FROM note_meta WHERE deleted=0 AND id=?1 LIMIT 1",
        )
        .map_err(|e| e.to_string())?;
    let mut rows = stmt.query(params![id]).map_err(|e| e.to_string())?;
    if let Some(row) = rows.next().map_err(|e| e.to_string())? {
        return map_row(row).map(Some).map_err(|e| e.to_string());
    }
    Ok(None)
}

fn query_all_bounded(conn: &Connection, limit: i64) -> Result<Vec<ShellRow>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT id, path, name, kind, parent_id, mtime,
                    CASE WHEN kind='folder' THEN (
                      SELECT COUNT(*) FROM note_meta c
                      WHERE c.deleted=0 AND c.kind='note' AND c.parent_id = note_meta.id
                    ) ELSE 0 END
             FROM note_meta WHERE deleted=0
             ORDER BY path
             LIMIT ?1",
        )
        .map_err(|e| e.to_string())?;
    let mapped = stmt
        .query_map(params![limit], map_row)
        .map_err(|e| e.to_string())?;
    Ok(mapped.filter_map(|r| r.ok()).collect())
}

fn loaded_of(parent_id: &str, page: &ShellPage) -> ShellLoaded {
    let total = page.folder_total + page.note_total;
    let loaded = page.offset + page.rows.len() as i64;
    ShellLoaded {
        parent_id: parent_id.to_string(),
        loaded,
        hidden: (total - loaded).max(0),
    }
}

fn push_unique(rows: &mut Vec<ShellRow>, seen: &mut HashSet<String>, extra: &[ShellRow]) {
    for row in extra {
        if seen.insert(row.id.clone()) {
            rows.push(row.clone());
        }
    }
}

fn build_window(
    conn: &Connection,
    prefer_path: Option<&str>,
    notes: i64,
    folders: i64,
) -> Result<ShellMount, String> {
    let mut rows = Vec::new();
    let mut seen = HashSet::new();
    let mut loaded = Vec::new();
    let root = query_children(conn, "", SHELL_CHILD_PAGE, 0)?;
    push_unique(&mut rows, &mut seen, &root.rows);
    loaded.push(loaded_of("__root__", &root));

    let mut active: Option<String> = None;
    if let Some(path) = prefer_path.map(normalize_rel).filter(|p| !p.is_empty()) {
        if let Some(note) = row_by_path(conn, &path)? {
            if note.kind == "note" {
                active = Some(note.id.clone());
            }
            push_unique(&mut rows, &mut seen, &[note]);
            let mut acc = String::new();
            let parts: Vec<&str> = path.split('/').filter(|p| !p.is_empty()).collect();
            for (i, part) in parts.iter().enumerate() {
                if i + 1 == parts.len() {
                    break;
                }
                if acc.is_empty() {
                    acc = (*part).to_string();
                } else {
                    acc = format!("{acc}/{part}");
                }
                if let Some(folder) = row_by_path(conn, &acc)? {
                    let fid = folder.id.clone();
                    push_unique(&mut rows, &mut seen, &[folder]);
                    if !loaded.iter().any(|l| l.parent_id == fid) {
                        let page = query_children(conn, &acc, SHELL_CHILD_PAGE, 0)?;
                        push_unique(&mut rows, &mut seen, &page.rows);
                        loaded.push(loaded_of(&fid, &page));
                    }
                }
            }
        }
    }
    if active.is_none() {
        active = rows.iter().find(|r| r.kind == "note").map(|r| r.id.clone());
    }
    let root_ids = rows
        .iter()
        .filter(|r| r.parent_id.is_none())
        .map(|r| r.id.clone())
        .collect::<Vec<_>>();
    let note_rows = rows.iter().filter(|r| r.kind == "note").count() as i64;
    Ok(ShellMount {
        materialize: false,
        pending: false,
        notes,
        folders,
        omitted_notes: (notes - note_rows).max(0),
        rows,
        root_ids,
        active_note_id: active,
        loaded,
        db_path: String::new(),
        titles_live: false,
    })
}

fn mtime_of(meta: &std::fs::Metadata) -> i64 {
    meta.modified()
        .ok()
        .and_then(|t| t.duration_since(SystemTime::UNIX_EPOCH).ok())
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

pub fn upsert_shell_rows(conn: &mut Connection, mut rows: Vec<ShellRow>) -> Result<(), String> {
    flush_batch(conn, &mut rows)
}

fn flush_batch(conn: &mut Connection, batch: &mut Vec<ShellRow>) -> Result<(), String> {
    if batch.is_empty() {
        return Ok(());
    }
    let tx = conn.unchecked_transaction().map_err(|e| e.to_string())?;
    {
        let mut stmt = tx
            .prepare_cached(
                "INSERT INTO note_meta(id, path, name, kind, parent_id, mtime, size, content_hash, title, deleted, fill_depth)
                 VALUES (?1,?2,?3,?4,?5,?6,NULL,NULL,?7,0,0)
                 ON CONFLICT(id) DO UPDATE SET
                   path=excluded.path,
                   name=excluded.name,
                   kind=excluded.kind,
                   parent_id=excluded.parent_id,
                   mtime=CASE WHEN excluded.mtime>0 THEN excluded.mtime ELSE note_meta.mtime END,
                   title=excluded.title,
                   deleted=0",
            )
            .map_err(|e| e.to_string())?;
        for row in batch.iter() {
            let title = if row.kind == "note" {
                row.name.trim_end_matches(".md").trim_end_matches(".MD")
            } else {
                row.name.as_str()
            };
            stmt.execute(params![
                row.id,
                row.path,
                row.name,
                row.kind,
                row.parent_id,
                row.mtime,
                title,
            ])
            .map_err(|e| e.to_string())?;
        }
    }
    tx.commit().map_err(|e| e.to_string())?;
    batch.clear();
    Ok(())
}

fn push_insert(batch: &mut Vec<ShellRow>, rel: &str, name: &str, kind: &str, mtime: i64) {
    batch.push(ShellRow {
        id: shell_node_id(rel),
        path: rel.to_string(),
        name: name.to_string(),
        kind: kind.to_string(),
        parent_id: parent_id_of(rel),
        mtime,
        child_notes: 0,
    });
}

pub fn write_catalog(conn: &mut Connection, root: &Path) -> Result<(), String> {
    if !root.is_dir() {
        return Err(format!("not a directory: {}", root.display()));
    }
    let mut stack: Vec<(PathBuf, String)> = vec![(root.to_path_buf(), String::new())];
    let mut batch = Vec::with_capacity(SHELL_WRITE_BATCH);
    while let Some((abs, rel)) = stack.pop() {
        let entries = match std::fs::read_dir(&abs) {
            Ok(e) => e,
            Err(_) => continue,
        };
        for entry in entries.flatten() {
            let name = entry.file_name().to_string_lossy().to_string();
            if name.starts_with('.') || SKIP_DIRS.iter().any(|s| *s == name) {
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
                let mtime = entry.metadata().map(|m| mtime_of(&m)).unwrap_or(0);
                push_insert(&mut batch, &child_rel, &name, "folder", mtime);
                stack.push((entry.path(), child_rel));
            } else if ft.is_file() && name.to_ascii_lowercase().ends_with(".md") {
                let mtime = entry.metadata().map(|m| mtime_of(&m)).unwrap_or(0);
                push_insert(&mut batch, &child_rel, &name, "note", mtime);
            }
            if batch.len() >= SHELL_WRITE_BATCH {
                flush_batch(conn, &mut batch)?;
                yield_catalog_batch();
            }
        }
    }
    flush_batch(conn, &mut batch)
}

fn yield_catalog_batch() {
    std::thread::sleep(std::time::Duration::from_millis(2));
}

/// One page of folder rows for an older note-only catalog.
/// Returns the last path consumed, or `None` when the note list is done.
/// Callers page with `path > cursor` so a 100k catalog is not one Rust vec.
pub fn derive_folders_page(
    conn: &mut Connection,
    after_path: &str,
    limit: i64,
) -> Result<Option<String>, String> {
    let limit = limit.clamp(1, 2_000);
    let paths: Vec<String> = {
        let mut stmt = conn
            .prepare(
                "SELECT path FROM note_meta
                 WHERE kind='note' AND deleted=0 AND path > ?1
                 ORDER BY path
                 LIMIT ?2",
            )
            .map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map(params![after_path, limit], |r| r.get::<_, String>(0))
            .map_err(|e| e.to_string())?;
        rows.filter_map(|r| r.ok()).collect()
    };
    if paths.is_empty() {
        return Ok(None);
    }
    let last = paths.last().cloned().unwrap_or_default();
    let mut seen = HashSet::new();
    let mut batch = Vec::new();
    for path in paths {
        let parts: Vec<&str> = path.split('/').filter(|p| !p.is_empty()).collect();
        if parts.len() < 2 {
            continue;
        }
        let mut acc = String::new();
        for (i, part) in parts.iter().enumerate() {
            if i + 1 == parts.len() {
                break;
            }
            if acc.is_empty() {
                acc = (*part).to_string();
            } else {
                acc = format!("{acc}/{part}");
            }
            if seen.insert(acc.clone()) {
                push_insert(&mut batch, &acc, part, "folder", 0);
            }
        }
    }
    flush_batch(conn, &mut batch)?;
    Ok(Some(last))
}

fn mark_catalog_walk(conn: &Connection, state: &str) {
    let _ = conn.execute(
        "INSERT INTO meta_kv(key, value) VALUES ('catalog_walk', ?1)
         ON CONFLICT(key) DO UPDATE SET value=excluded.value",
        params![state],
    );
}

pub fn catalog_walk_partial(conn: &Connection) -> bool {
    conn.query_row(
        "SELECT value FROM meta_kv WHERE key='catalog_walk'",
        [],
        |r| r.get::<_, String>(0),
    )
    .ok()
    .map(|v| v == "partial")
    .unwrap_or(false)
}

struct PageSlot {
    rel: String,
    name: String,
    folder: bool,
    mtime: i64,
}

fn cmp_ascii_ignore(a: &str, b: &str) -> std::cmp::Ordering {
    let ab = a.as_bytes();
    let bb = b.as_bytes();
    let n = ab.len().min(bb.len());
    for i in 0..n {
        let ord = ab[i].to_ascii_lowercase().cmp(&bb[i].to_ascii_lowercase());
        if ord != std::cmp::Ordering::Equal {
            return ord;
        }
    }
    ab.len().cmp(&bb.len())
}

/// Folders first, then name. Same order as the tree page query.
fn page_slot_cmp(a: &PageSlot, b_folder: bool, b_name: &str) -> std::cmp::Ordering {
    (!a.folder)
        .cmp(&(!b_folder))
        .then_with(|| cmp_ascii_ignore(&a.name, b_name))
}

fn insert_page_slot(entries: &mut Vec<PageSlot>, limit: usize, slot: PageSlot) {
    if entries.len() >= limit {
        let last = entries.last().unwrap();
        if page_slot_cmp(last, slot.folder, &slot.name) != std::cmp::Ordering::Greater {
            return;
        }
        entries.pop();
    }
    let idx = entries
        .partition_point(|e| page_slot_cmp(e, slot.folder, &slot.name) == std::cmp::Ordering::Less);
    entries.insert(idx, slot);
}

fn is_note_name(name: &str) -> bool {
    let b = name.as_bytes();
    b.len() >= 3 && b[b.len() - 3..].eq_ignore_ascii_case(b".md")
}

#[cfg(test)]
thread_local! {
    static DIR_PAGE_SEEN: std::cell::Cell<usize> = const { std::cell::Cell::new(0) };
}

#[cfg(test)]
fn note_dir_page_seen() {
    DIR_PAGE_SEEN.with(|c| c.set(c.get() + 1));
}

#[cfg(not(test))]
fn note_dir_page_seen() {}

#[cfg(test)]
pub fn reset_dir_page_seen() {
    DIR_PAGE_SEEN.with(|c| c.set(0));
}

#[cfg(test)]
pub fn dir_page_seen() -> usize {
    DIR_PAGE_SEEN.with(|c| c.get())
}

fn slot_for(rel: &str, name: &str, folder: bool) -> PageSlot {
    let child_rel = if rel.is_empty() {
        name.to_string()
    } else {
        format!("{rel}/{name}")
    };
    PageSlot {
        rel: child_rel,
        name: name.to_string(),
        folder,
        mtime: 0,
    }
}

/// List one directory and keep the first display page (folders, then names).
/// Does not open subdirectories. Modification time is read only for rows
/// that stay on the page. The scan stops after `DIR_PAGE_SCAN_CAP` names, so
/// a flat folder of hundreds of thousands of files does not block the page.
/// `Hub 0.md` is included by name when that file exists.
pub fn dir_page_rows(root: &Path, rel: &str, limit: i64) -> Result<Vec<ShellRow>, String> {
    let rel = normalize_rel(rel);
    let abs = if rel.is_empty() {
        root.to_path_buf()
    } else {
        match safe_abs(root, &rel) {
            Some(p) => p,
            None => return Ok(Vec::new()),
        }
    };
    if !abs.is_dir() {
        return Ok(Vec::new());
    }
    let limit = limit.clamp(1, SHELL_CHILD_PAGE) as usize;
    let mut entries: Vec<PageSlot> = Vec::with_capacity(limit);
    for name in ["Hub 0.md", "Hub.md"] {
        if abs.join(name).is_file() {
            insert_page_slot(&mut entries, limit, slot_for(&rel, name, false));
            break;
        }
    }
    let rd = match std::fs::read_dir(&abs) {
        Ok(rd) => rd,
        Err(err) => return Err(err.to_string()),
    };
    let mut seen = 0usize;
    for entry in rd.flatten() {
        if seen >= DIR_PAGE_SCAN_CAP {
            break;
        }
        seen += 1;
        note_dir_page_seen();
        let name_os = entry.file_name();
        let name = name_os.to_string_lossy();
        if name.starts_with('.') || SKIP_DIRS.iter().any(|s| *s == name.as_ref()) {
            continue;
        }
        let name = name.into_owned();
        if entries.iter().any(|e| e.name == name) {
            continue;
        }
        // A `.md` name is a note. file_type() stats when the directory entry
        // has no type, which made a cold open wait on every file in the
        // open folder. Modification time is read only for the page that stays.
        let folder = if is_note_name(&name) {
            false
        } else {
            let Ok(ft) = entry.file_type() else { continue };
            if !ft.is_dir() {
                continue;
            }
            true
        };
        if entries.len() >= limit {
            let last = entries.last().unwrap();
            if page_slot_cmp(last, folder, &name) != std::cmp::Ordering::Greater {
                continue;
            }
        }
        insert_page_slot(&mut entries, limit, slot_for(&rel, &name, folder));
    }
    for slot in &mut entries {
        let abs = root.join(&slot.rel);
        slot.mtime = std::fs::metadata(&abs).map(|m| mtime_of(&m)).unwrap_or(0);
    }
    let mut rows = Vec::with_capacity(entries.len());
    for slot in entries {
        let kind = if slot.folder { "folder" } else { "note" };
        push_insert(&mut rows, &slot.rel, &slot.name, kind, slot.mtime);
    }
    Ok(rows)
}

/// Folder rows for an older note-only catalog.
/// Lists the root and the open note's ancestor directories only.
/// Does not read every note path.
pub fn seed_folder_pages(
    conn: &mut Connection,
    root: &Path,
    prefer: Option<&str>,
) -> Result<(), String> {
    if !root.is_dir() {
        return Ok(());
    }
    let mut batch = dir_page_rows(root, "", SHELL_CHILD_PAGE).unwrap_or_default();
    batch.retain(|r| r.kind == "folder");
    if let Some(raw) = prefer {
        let path = normalize_rel(raw);
        let mut acc = String::new();
        let parts: Vec<&str> = path.split('/').filter(|p| !p.is_empty()).collect();
        for (i, part) in parts.iter().enumerate() {
            if i + 1 == parts.len() {
                break;
            }
            if acc.is_empty() {
                acc = (*part).to_string();
            } else {
                acc = format!("{acc}/{part}");
            }
            let mut page = dir_page_rows(root, &acc, SHELL_CHILD_PAGE).unwrap_or_default();
            page.retain(|r| r.kind == "folder");
            batch.extend(page);
        }
    }
    flush_batch(conn, &mut batch)
}

/// The first window from the folder itself. Does not open the index.
/// Root, then the first folder, then one more level, so `Hub 0` is on the
/// page without reading sibling folders.
pub fn mount_disk_window(root: &Path, prefer: Option<&str>) -> Result<ShellMount, String> {
    if !root.is_dir() {
        return Err(format!("not a directory: {}", root.display()));
    }
    let mut rows = Vec::new();
    let mut seen = HashSet::new();
    let mut loaded = Vec::new();
    let mut truncated = false;
    let root_rows = dir_page_rows(root, "", SHELL_CHILD_PAGE)?;
    if root_rows.len() as i64 >= SHELL_CHILD_PAGE {
        truncated = true;
    }
    push_unique(&mut rows, &mut seen, &root_rows);
    loaded.push(ShellLoaded {
        parent_id: "__root__".into(),
        loaded: root_rows.len() as i64,
        hidden: if truncated { 1 } else { 0 },
    });
    let mut next = root_rows
        .iter()
        .find(|r| r.kind == "folder")
        .map(|r| r.path.clone());
    for _ in 0..3 {
        let Some(rel) = next.take() else { break };
        let page = dir_page_rows(root, &rel, 32)?;
        let parent_id = rows
            .iter()
            .find(|r| r.path == rel)
            .map(|r| r.id.clone())
            .unwrap_or_default();
        push_unique(&mut rows, &mut seen, &page);
        if !parent_id.is_empty() {
            loaded.push(ShellLoaded {
                parent_id,
                loaded: page.len() as i64,
                hidden: if page.len() >= 32 { 1 } else { 0 },
            });
        }
        if page.iter().any(|r| r.kind == "note") {
            break;
        }
        next = page.into_iter().find(|r| r.kind == "folder").map(|r| r.path);
    }
    if let Some(raw) = prefer {
        let path = normalize_rel(raw);
        if !path.is_empty() {
            let abs = root.join(&path);
            if abs.is_file() {
                let name = path.rsplit('/').next().unwrap_or(&path).to_string();
                push_unique(
                    &mut rows,
                    &mut seen,
                    &[ShellRow {
                        id: shell_node_id(&path),
                        path: path.clone(),
                        name,
                        kind: "note".into(),
                        parent_id: parent_id_of(&path),
                        mtime: std::fs::metadata(&abs).map(|m| mtime_of(&m)).unwrap_or(0),
                        child_notes: 0,
                    }],
                );
            }
        }
    }
    let note_rows = rows.iter().filter(|r| r.kind == "note").count() as i64;
    // The visible page is the honest count until a stored total is applied.
    // A truncated folder stays a window (`materialize: false`) either way.
    let notes = note_rows;
    let active = rows.iter().find(|r| r.kind == "note").map(|r| r.id.clone());
    let root_ids = rows
        .iter()
        .filter(|r| r.parent_id.is_none())
        .map(|r| r.id.clone())
        .collect();
    Ok(ShellMount {
        materialize: false,
        pending: false,
        notes,
        folders: rows.iter().filter(|r| r.kind == "folder").count() as i64,
        omitted_notes: (notes - note_rows).max(0),
        rows,
        root_ids,
        active_note_id: active,
        loaded,
        db_path: String::new(),
        titles_live: note_rows > 0,
    })
}

/// Commit the root page (and the open note's ancestor pages) and return.
/// Nested folders are not walked. `Ok(true)` means this listing is the
/// whole vault and a small vault may still materialize.
pub fn seed_first_page(
    conn: &mut Connection,
    root: &Path,
    prefer: Option<&str>,
) -> Result<bool, String> {
    if !root.is_dir() {
        return Err(format!("not a directory: {}", root.display()));
    }
    let mut batch = dir_page_rows(root, "", SHELL_CHILD_PAGE)?;
    let mut saw_dir = batch.iter().any(|r| r.kind == "folder");
    let root_truncated = batch.len() as i64 >= SHELL_CHILD_PAGE;
    if let Some(raw) = prefer {
        let path = normalize_rel(raw);
        let mut acc = String::new();
        let parts: Vec<&str> = path.split('/').filter(|p| !p.is_empty()).collect();
        for (i, part) in parts.iter().enumerate() {
            if i + 1 == parts.len() {
                break;
            }
            if acc.is_empty() {
                acc = (*part).to_string();
            } else {
                acc = format!("{acc}/{part}");
            }
            let page = dir_page_rows(root, &acc, SHELL_CHILD_PAGE)?;
            if page.iter().any(|r| r.kind == "folder") {
                saw_dir = true;
            }
            batch.extend(page);
        }
    }
    flush_batch(conn, &mut batch)?;
    let complete = !saw_dir && !root_truncated;
    mark_catalog_walk(conn, if complete { "done" } else { "partial" });
    Ok(complete)
}

pub fn mark_catalog_walk_done(conn: &Connection) {
    mark_catalog_walk(conn, "done");
    // After the listing, not before Ready. The next open reads this total.
    if let Ok((notes, folders)) = catalog_counts(conn) {
        store_catalog_counts(conn, notes, folders);
    }
}

/// Path rows discovered while a fill is still walking. Does not write FTS
/// bodies and does not lower a note that already has a head.
pub fn remember_discovered(
    conn: &mut Connection,
    notes: &[(String, String, i64, i64)],
) -> Result<(), String> {
    if notes.is_empty() {
        return Ok(());
    }
    let tx = conn.unchecked_transaction().map_err(|e| e.to_string())?;
    remember_discovered_in(&tx, notes, true)?;
    tx.commit().map_err(|e| e.to_string())?;
    Ok(())
}

/// Same writes as `remember_discovered`, on a connection that is already
/// inside a transaction. `write_notes` is false when the caller is about to
/// insert those notes itself and only ancestor folders are needed.
pub fn remember_discovered_in(
    conn: &Connection,
    notes: &[(String, String, i64, i64)],
    write_notes: bool,
) -> Result<(), String> {
    if notes.is_empty() {
        return Ok(());
    }
    {
        let mut stmt = conn
            .prepare_cached(
                "INSERT INTO note_meta(id, path, name, kind, parent_id, mtime, size, content_hash, title, deleted, fill_depth)
                 VALUES (?1,?2,?3,?4,?5,?6,?7,NULL,?8,0,-1)
                 ON CONFLICT(id) DO UPDATE SET
                   path=excluded.path,
                   name=excluded.name,
                   kind=excluded.kind,
                   parent_id=excluded.parent_id,
                   mtime=CASE WHEN excluded.mtime>0 THEN excluded.mtime ELSE note_meta.mtime END,
                   size=CASE WHEN excluded.size IS NOT NULL THEN excluded.size ELSE note_meta.size END,
                   title=CASE
                     WHEN note_meta.title IS NULL OR note_meta.title = '' THEN excluded.title
                     ELSE note_meta.title
                   END,
                   deleted=0,
                   fill_depth=CASE
                     WHEN COALESCE(note_meta.fill_depth, 0) > excluded.fill_depth THEN note_meta.fill_depth
                     ELSE excluded.fill_depth
                   END",
            )
            .map_err(|e| e.to_string())?;
        let mut seen_folders = HashSet::new();
        for (rel, name, mtime, size) in notes {
            let rel = normalize_rel(rel);
            let parts: Vec<&str> = rel.split('/').filter(|p| !p.is_empty()).collect();
            if parts.len() >= 2 {
                let mut acc = String::new();
                for (i, part) in parts.iter().enumerate() {
                    if i + 1 == parts.len() {
                        break;
                    }
                    if acc.is_empty() {
                        acc = (*part).to_string();
                    } else {
                        acc = format!("{acc}/{part}");
                    }
                    if seen_folders.insert(acc.clone()) {
                        stmt.execute(params![
                            shell_node_id(&acc),
                            acc,
                            part,
                            "folder",
                            parent_id_of(&acc),
                            0i64,
                            Option::<i64>::None,
                            part,
                        ])
                        .map_err(|e| e.to_string())?;
                    }
                }
            }
            if !write_notes {
                continue;
            }
            let title = name.trim_end_matches(".md").trim_end_matches(".MD");
            stmt.execute(params![
                shell_node_id(&rel),
                rel,
                name,
                "note",
                parent_id_of(&rel),
                mtime,
                Some(*size),
                title,
            ])
            .map_err(|e| e.to_string())?;
        }
    }
    Ok(())
}

/// Build the shell the renderer is allowed to hold.
/// `allow_walk` is false while a fill writer owns the database.
pub fn mount_catalog(
    conn: &mut Connection,
    root: &Path,
    prefer_path: Option<&str>,
    allow_walk: bool,
) -> Result<ShellMount, String> {
    // Title and path indexes are built after Ready. The page uses parent and mtime.
    ensure_page_indexes(conn)?;
    let (mut notes, mut folders) = catalog_counts_fast(conn)?;
    if notes == 0 && folders == 0 {
        if !allow_walk {
            return Ok(pending_mount());
        }
        clear_catalog_counts(conn);
        write_catalog(conn, root)?;
        (notes, folders) = catalog_counts(conn)?;
        store_catalog_counts(conn, notes, folders);
    } else if folders == 0 && allow_walk {
        // One directory listing, not every note path.
        clear_catalog_counts(conn);
        seed_folder_pages(conn, root, prefer_path)?;
        (notes, folders) = catalog_counts(conn)?;
        store_catalog_counts(conn, notes, folders);
    }
    // A cold open commits the root page before the rest of the vault exists.
    // That partial catalog must stay a window even when the page is small.
    if !catalog_walk_partial(conn) && notes <= SHELL_FULL_MAX_NOTES {
        let all = query_all_bounded(conn, 8_000)?;
        let got_notes = all.iter().filter(|r| r.kind == "note").count() as i64;
        if got_notes >= notes {
            let root_ids = all
                .iter()
                .filter(|r| r.parent_id.is_none())
                .map(|r| r.id.clone())
                .collect();
            let active = prefer_path
                .map(normalize_rel)
                .filter(|p| !p.is_empty())
                .and_then(|p| all.iter().find(|r| r.path == p && r.kind == "note").map(|r| r.id.clone()))
                .or_else(|| all.iter().find(|r| r.kind == "note").map(|r| r.id.clone()));
            return Ok(ShellMount {
                materialize: true,
                pending: false,
                notes,
                folders,
                rows: all,
                root_ids,
                active_note_id: active,
                omitted_notes: 0,
                loaded: Vec::new(),
                db_path: String::new(),
                titles_live: false,
            });
        }
    }
    build_window(conn, prefer_path, notes, folders)
}

fn link_norm(value: &str) -> String {
    let trimmed = value.trim();
    let without_md = if trimmed.len() >= 3
        && trimmed[trimmed.len() - 3..].eq_ignore_ascii_case(".md")
    {
        &trimmed[..trimmed.len() - 3]
    } else {
        trimmed
    };
    without_md.replace('\\', "/").to_ascii_lowercase()
}

fn resolve_target(
    conn: &Connection,
    target_id: Option<String>,
    target_norm: &str,
) -> Option<String> {
    if let Some(id) = target_id.as_deref() {
        if !id.is_empty() {
            let exists: i64 = conn
                .query_row(
                    "SELECT COUNT(*) FROM note_meta WHERE id=?1 AND kind='note' AND deleted=0",
                    params![id],
                    |r| r.get(0),
                )
                .unwrap_or(0);
            if exists > 0 {
                return Some(id.to_string());
            }
        }
    }
    if target_norm.is_empty() {
        return None;
    }
    conn.query_row(
        "SELECT id FROM note_meta
         WHERE kind='note' AND deleted=0 AND lower(title)=?1
         LIMIT 1",
        params![target_norm],
        |r| r.get(0),
    )
    .ok()
}

fn neighbors(conn: &Connection, node: &ShellRow, cap: i64) -> Vec<String> {
    let mut out = Vec::new();
    if let Ok(mut stmt) = conn.prepare(
        "SELECT target_id, target_norm FROM link_edge WHERE source_id=?1 LIMIT ?2",
    ) {
        if let Ok(rows) = stmt.query_map(params![node.id, cap], |r| {
            Ok((r.get::<_, Option<String>>(0)?, r.get::<_, String>(1)?))
        }) {
            for row in rows.flatten() {
                if let Some(id) = resolve_target(conn, row.0, &row.1) {
                    if id != node.id {
                        out.push(id);
                    }
                }
            }
        }
    }
    let norms = [
        link_norm(&node.name.trim_end_matches(".md").to_string()),
        link_norm(&node.path),
        link_norm(&node.name),
    ];
    if let Ok(mut stmt) = conn.prepare(
        "SELECT source_id FROM link_edge
         WHERE target_id=?1 OR target_norm=?2 OR target_norm=?3 OR target_norm=?4
         LIMIT ?5",
    ) {
        if let Ok(rows) = stmt.query_map(
            params![node.id, norms[0], norms[1], norms[2], cap],
            |r| r.get::<_, String>(0),
        ) {
            for id in rows.flatten() {
                if id != node.id {
                    out.push(id);
                }
            }
        }
    }
    out
}

pub fn query_ego(
    conn: &Connection,
    center_id: &str,
    hops: i64,
    max_nodes: i64,
) -> Result<ShellEgo, String> {
    let hops = hops.clamp(1, SHELL_EGO_HOPS);
    let max_nodes = max_nodes.clamp(1, SHELL_EGO_MAX);
    let Some(center) = query_note(conn, center_id)? else {
        return Ok(ShellEgo {
            center_id: center_id.to_string(),
            rows: Vec::new(),
            edges: Vec::new(),
            capped: false,
        });
    };
    let mut keep_ids = vec![center.id.clone()];
    let mut keep_set = HashSet::from([center.id.clone()]);
    let mut frontier = vec![center];
    let mut raw_edges = Vec::new();
    for _ in 0..hops {
        if keep_ids.len() as i64 >= max_nodes {
            break;
        }
        let mut next = Vec::new();
        for node in &frontier {
            if keep_ids.len() as i64 >= max_nodes {
                break;
            }
            for nid in neighbors(conn, node, SHELL_EGO_DEGREE) {
                if keep_ids.len() as i64 >= max_nodes {
                    break;
                }
                raw_edges.push((node.id.clone(), nid.clone()));
                if keep_set.insert(nid.clone()) {
                    keep_ids.push(nid.clone());
                    if let Some(row) = query_note(conn, &nid)? {
                        next.push(row);
                    }
                }
            }
        }
        frontier = next;
    }
    let mut rows = Vec::new();
    for id in &keep_ids {
        if let Some(row) = query_note(conn, id)? {
            rows.push(row);
        }
    }
    let have: HashSet<String> = rows.iter().map(|r| r.id.clone()).collect();
    let mut seen_edge = HashSet::new();
    let mut edges = Vec::new();
    for (source, target) in raw_edges {
        if !have.contains(&source) || !have.contains(&target) || source == target {
            continue;
        }
        let key = format!("{source}\n{target}");
        if seen_edge.insert(key) {
            edges.push(ShellEdge { source, target });
        }
    }
    let capped = rows.len() as i64 >= max_nodes;
    Ok(ShellEgo {
        center_id: center_id.to_string(),
        rows,
        edges,
        capped,
    })
}

/// One incoming source. Context stays empty until the open note hydrates that body.
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ShellBacklink {
    pub from_id: String,
    pub from_path: String,
    pub from_title: String,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ShellBacklinks {
    pub rows: Vec<ShellBacklink>,
    pub total: i64,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ShellTagCount {
    pub tag: String,
    pub count: i64,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ShellSuggestHit {
    pub id: String,
    pub path: String,
    pub name: String,
    pub kind: String,
    pub title: String,
    pub parent_id: Option<String>,
    pub mtime: i64,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ShellForget {
    pub ids: Vec<String>,
    pub paths: Vec<String>,
}

fn shell_link_norm(raw: &str) -> String {
    let trimmed = raw.trim();
    let without_md = if trimmed.len() >= 3
        && trimmed[trimmed.len().saturating_sub(3)..].eq_ignore_ascii_case(".md")
    {
        &trimmed[..trimmed.len() - 3]
    } else {
        trimmed
    };
    without_md.replace('\\', "/").to_ascii_lowercase()
}

fn link_norms(title: &str, name: &str, path: &str) -> Vec<String> {
    let mut out = Vec::new();
    let mut push = |s: &str| {
        let n = shell_link_norm(s);
        if !n.is_empty() && !out.iter().any(|e| e == &n) {
            out.push(n);
        }
    };
    push(title);
    push(name);
    push(path);
    out
}

fn note_title_name_path(conn: &Connection, id: &str) -> Result<Option<(String, String, String)>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT COALESCE(title, ''), name, path FROM note_meta
             WHERE deleted=0 AND id=?1 LIMIT 1",
        )
        .map_err(|e| e.to_string())?;
    let mut rows = stmt.query(params![id]).map_err(|e| e.to_string())?;
    if let Some(row) = rows.next().map_err(|e| e.to_string())? {
        return Ok(Some((
            row.get(0).map_err(|e| e.to_string())?,
            row.get(1).map_err(|e| e.to_string())?,
            row.get(2).map_err(|e| e.to_string())?,
        )));
    }
    Ok(None)
}

const BACKLINK_WHERE: &str = "
FROM link_edge e
JOIN note_meta m ON m.id = e.source_id
WHERE m.deleted=0 AND m.kind='note' AND e.source_id != ?1
  AND (
    e.target_id = ?1
    OR e.target_norm = ?2
    OR e.target_norm = ?3
    OR e.target_norm = ?4
    OR e.target_norm = ?5
    OR e.target_norm = ?6
    OR e.target_norm = ?7
  )";

/// Incoming notes for one id. The source does not have to be in the UI window.
pub fn query_backlinks(conn: &Connection, id: &str, limit: i64) -> Result<ShellBacklinks, String> {
    let limit = limit.clamp(1, SHELL_BACKLINK_LIMIT);
    let Some((title, name, path)) = note_title_name_path(conn, id)? else {
        return Ok(ShellBacklinks {
            rows: Vec::new(),
            total: 0,
        });
    };
    let mut norms = link_norms(&title, &name, &path);
    while norms.len() < 6 {
        norms.push(format!("\u{0}{}", norms.len()));
    }
    let total: i64 = conn
        .query_row(
            &format!("SELECT COUNT(DISTINCT m.id) {BACKLINK_WHERE}"),
            params![id, norms[0], norms[1], norms[2], norms[3], norms[4], norms[5]],
            |r| r.get(0),
        )
        .unwrap_or(0);
    let mut stmt = conn
        .prepare(&format!(
            "SELECT m.id, m.path, COALESCE(NULLIF(m.title, ''), m.name) AS title
             {BACKLINK_WHERE}
             GROUP BY m.id
             ORDER BY title COLLATE NOCASE
             LIMIT ?8"
        ))
        .map_err(|e| e.to_string())?;
    let mapped = stmt
        .query_map(
            params![id, norms[0], norms[1], norms[2], norms[3], norms[4], norms[5], limit],
            |row| {
                Ok(ShellBacklink {
                    from_id: row.get(0)?,
                    from_path: row.get(1)?,
                    from_title: row.get(2)?,
                })
            },
        )
        .map_err(|e| e.to_string())?;
    let rows = mapped.filter_map(|r| r.ok()).collect();
    Ok(ShellBacklinks { rows, total })
}

pub fn query_tags(conn: &Connection, limit: i64) -> Result<Vec<ShellTagCount>, String> {
    let limit = limit.clamp(1, SHELL_TAG_LIMIT);
    let mut stmt = conn
        .prepare(
            "SELECT tag, COUNT(*) FROM tag_map
             GROUP BY tag
             ORDER BY COUNT(*) DESC, tag COLLATE NOCASE
             LIMIT ?1",
        )
        .map_err(|e| e.to_string())?;
    let mapped = stmt
        .query_map(params![limit], |row| {
            Ok(ShellTagCount {
                tag: row.get(0)?,
                count: row.get(1)?,
            })
        })
        .map_err(|e| e.to_string())?;
    Ok(mapped.filter_map(|r| r.ok()).collect())
}

pub fn query_tag_notes(conn: &Connection, tag: &str, limit: i64) -> Result<Vec<ShellRow>, String> {
    let limit = limit.clamp(1, SHELL_TAG_NOTES_LIMIT);
    let tag = tag.trim().trim_start_matches('#').to_ascii_lowercase();
    if tag.is_empty() {
        return Ok(Vec::new());
    }
    let mut stmt = conn
        .prepare(
            "SELECT m.id, m.path, m.name, m.kind, m.parent_id, m.mtime, 0
             FROM note_meta m
             JOIN tag_map t ON t.note_id = m.id
             WHERE m.deleted=0 AND m.kind='note' AND t.tag = ?1
             ORDER BY m.mtime DESC, m.name COLLATE NOCASE
             LIMIT ?2",
        )
        .map_err(|e| e.to_string())?;
    let mapped = stmt
        .query_map(params![tag, limit], map_row)
        .map_err(|e| e.to_string())?;
    Ok(mapped.filter_map(|r| r.ok()).collect())
}

fn like_prefix(q: &str) -> String {
    let mut s = String::new();
    for c in q.chars() {
        if matches!(c, '%' | '_' | '\\') {
            s.push('\\');
        }
        s.push(c);
    }
    s.push('%');
    s
}

fn note_fts_has_row(conn: &Connection) -> bool {
    conn.query_row("SELECT 1 FROM note_fts LIMIT 1", [], |r| r.get::<_, i64>(0))
        .unwrap_or(0)
        == 1
}

/// Prefix match on the search index. This does not scan `note_meta`.
fn suggest_from_fts(
    conn: &Connection,
    query: &str,
    limit: i64,
) -> Result<Vec<ShellSuggestHit>, String> {
    let token: String = query
        .chars()
        .filter(|c| c.is_alphanumeric() || *c == '_' || *c == '-')
        .take(64)
        .collect();
    if token.len() < 2 {
        return Ok(Vec::new());
    }
    let match_q = format!("\"{token}\"*");
    let mut stmt = conn
        .prepare("SELECT note_id, path, title FROM note_fts WHERE note_fts MATCH ?1 LIMIT ?2")
        .map_err(|e| e.to_string())?;
    let mapped = stmt
        .query_map(params![match_q, limit], |r| {
            let path: String = r.get(1)?;
            let title: String = r.get(2)?;
            let name = path
                .rsplit(['/', '\\'])
                .next()
                .unwrap_or(path.as_str())
                .to_string();
            let shown = if title.trim().is_empty() {
                name.clone()
            } else {
                title
            };
            Ok(ShellSuggestHit {
                id: r.get(0)?,
                path,
                name,
                kind: "note".into(),
                title: shown,
                parent_id: None,
                mtime: 0,
            })
        })
        .map_err(|e| e.to_string())?;
    Ok(mapped.filter_map(|r| r.ok()).collect())
}

/// Title and path prefix. A leading-wildcard scan of every title is not a keystroke.
pub fn query_suggest(conn: &Connection, query: &str, limit: i64) -> Result<Vec<ShellSuggestHit>, String> {
    let limit = limit.clamp(1, SHELL_SUGGEST_LIMIT);
    let q = query.trim().to_ascii_lowercase();
    if q.is_empty() {
        return query_recent_hits(conn, limit);
    }
    // A filled vault answers from FTS. Scanning every title holds the
    // database and freezes a keystroke. The open page is already searchable
    // in memory when this returns nothing.
    if note_fts_has_row(conn) {
        return suggest_from_fts(conn, &q, limit);
    }
    let prefix = like_prefix(&q);
    suggest_like_query(conn, &prefix, limit)
}

fn suggest_like_query(
    conn: &Connection,
    prefix: &str,
    limit: i64,
) -> Result<Vec<ShellSuggestHit>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT id, path, name, kind, parent_id, mtime,
                    COALESCE(NULLIF(title, ''), name)
             FROM note_meta
             WHERE deleted=0 AND (
               lower(COALESCE(title, '')) LIKE ?1 ESCAPE '\\'
               OR lower(path) LIKE ?1 ESCAPE '\\'
               OR lower(name) LIKE ?1 ESCAPE '\\'
             )
             ORDER BY
               CASE WHEN lower(COALESCE(title, name)) LIKE ?1 ESCAPE '\\' THEN 0 ELSE 1 END,
               CASE kind WHEN 'note' THEN 0 ELSE 1 END,
               name COLLATE NOCASE
             LIMIT ?2",
        )
        .map_err(|e| e.to_string())?;
    let mapped = stmt
        .query_map(params![prefix, limit], map_suggest)
        .map_err(|e| e.to_string())?;
    Ok(mapped.filter_map(|r| r.ok()).collect())
}

fn map_suggest(row: &rusqlite::Row<'_>) -> rusqlite::Result<ShellSuggestHit> {
    Ok(ShellSuggestHit {
        id: row.get(0)?,
        path: row.get(1)?,
        name: row.get(2)?,
        kind: row.get(3)?,
        parent_id: row.get(4)?,
        mtime: row.get(5)?,
        title: row.get(6)?,
    })
}

fn query_recent_hits(conn: &Connection, limit: i64) -> Result<Vec<ShellSuggestHit>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT id, path, name, kind, parent_id, mtime,
                    COALESCE(NULLIF(title, ''), name)
             FROM note_meta
             WHERE deleted=0 AND kind='note'
             ORDER BY mtime DESC, name COLLATE NOCASE
             LIMIT ?1",
        )
        .map_err(|e| e.to_string())?;
    let mapped = stmt
        .query_map(params![limit], map_suggest)
        .map_err(|e| e.to_string())?;
    Ok(mapped.filter_map(|r| r.ok()).collect())
}

/// Resolve a handful of pinned paths. Missing paths are omitted.
pub fn query_by_paths(conn: &Connection, paths: &[String]) -> Result<Vec<ShellRow>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT id, path, name, kind, parent_id, mtime, 0
             FROM note_meta
             WHERE deleted=0 AND path=?1
             LIMIT 1",
        )
        .map_err(|e| e.to_string())?;
    let mut out = Vec::new();
    for path in paths.iter().take(SHELL_PIN_LIMIT) {
        let norm = path.replace('\\', "/");
        if let Ok(row) = stmt.query_row(params![norm], map_row) {
            out.push(row);
        }
    }
    Ok(out)
}

/// `path:` and `folder:` against the catalog. The result is a page.
pub fn query_path_page(
    conn: &Connection,
    path_needle: &str,
    folder_needle: &str,
    limit: i64,
) -> Result<Vec<ShellRow>, String> {
    let limit = limit.clamp(1, SHELL_PATH_LIMIT);
    let path_q = path_needle.trim().to_ascii_lowercase();
    let folder_q = folder_needle.trim().to_ascii_lowercase();
    if path_q.is_empty() && folder_q.is_empty() {
        return Ok(Vec::new());
    }
    let mut stmt = conn
        .prepare(
            "SELECT id, path, name, kind, parent_id, mtime, 0
             FROM note_meta
             WHERE deleted=0 AND kind='note'
               AND (?1 = '' OR instr(lower(path), ?1) > 0)
               AND (?2 = '' OR instr(lower(path), ?2) > 0)
             ORDER BY mtime DESC, name COLLATE NOCASE
             LIMIT ?3",
        )
        .map_err(|e| e.to_string())?;
    let mapped = stmt
        .query_map(params![path_q, folder_q, limit], map_row)
        .map_err(|e| e.to_string())?;
    Ok(mapped.filter_map(|r| r.ok()).collect())
}

/// Notes with no stored link in or out. A page, not the vault.
pub fn query_orphans(conn: &Connection, limit: i64) -> Result<Vec<ShellRow>, String> {
    let limit = limit.clamp(1, 24);
    let mut stmt = conn
        .prepare(
            "SELECT m.id, m.path, m.name, m.kind, m.parent_id, m.mtime, 0
             FROM note_meta m
             WHERE m.deleted=0 AND m.kind='note'
               AND NOT EXISTS (SELECT 1 FROM link_edge e WHERE e.source_id = m.id)
               AND NOT EXISTS (
                 SELECT 1 FROM link_edge e
                 WHERE e.target_id = m.id
                    OR e.target_norm = lower(COALESCE(NULLIF(m.title, ''), m.name))
               )
             ORDER BY m.mtime DESC, m.name COLLATE NOCASE
             LIMIT ?1",
        )
        .map_err(|e| e.to_string())?;
    let mapped = stmt
        .query_map(params![limit], map_row)
        .map_err(|e| e.to_string())?;
    Ok(mapped.filter_map(|r| r.ok()).collect())
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ShellBrokenLink {
    pub from_id: String,
    pub from_path: String,
    pub from_title: String,
    pub target: String,
}

/// Outgoing edges whose target is not a catalog title, name, or path.
pub fn query_broken(conn: &Connection, limit: i64) -> Result<Vec<ShellBrokenLink>, String> {
    let limit = limit.clamp(1, 40);
    let mut stmt = conn
        .prepare(
            "SELECT m.id, m.path, COALESCE(NULLIF(m.title, ''), m.name), e.target_raw
             FROM link_edge e
             JOIN note_meta m ON m.id = e.source_id
             WHERE m.deleted=0 AND m.kind='note'
               AND NOT EXISTS (
                 SELECT 1 FROM note_meta t
                 WHERE t.deleted=0 AND t.kind='note' AND (
                   lower(COALESCE(t.title, '')) = e.target_norm
                   OR lower(t.name) = e.target_norm
                   OR lower(t.path) = e.target_norm
                 )
               )
             LIMIT ?1",
        )
        .map_err(|e| e.to_string())?;
    let mapped = stmt
        .query_map(params![limit], |row| {
            Ok(ShellBrokenLink {
                from_id: row.get(0)?,
                from_path: row.get(1)?,
                from_title: row.get(2)?,
                target: row.get(3)?,
            })
        })
        .map_err(|e| e.to_string())?;
    Ok(mapped.filter_map(|r| r.ok()).collect())
}

/// Which of these link norms already name a note. Used so a paged shell does
/// not call every outgoing link broken.
pub fn query_known_norms(conn: &Connection, norms: &[String]) -> Result<Vec<String>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT 1 FROM note_meta
             WHERE deleted=0 AND kind='note' AND (
               lower(COALESCE(title, '')) = ?1
               OR lower(name) = ?1
               OR lower(path) = ?1
             )
             LIMIT 1",
        )
        .map_err(|e| e.to_string())?;
    let mut found = Vec::new();
    for raw in norms.iter().take(64) {
        let norm = raw.trim().trim_end_matches(".md").replace('\\', "/").to_ascii_lowercase();
        if norm.is_empty() {
            continue;
        }
        let hit: i64 = stmt.query_row(params![norm], |r| r.get(0)).unwrap_or(0);
        if hit > 0 {
            found.push(norm);
        }
    }
    Ok(found)
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ShellMentionHead {
    pub from_id: String,
    pub from_path: String,
    pub from_title: String,
    pub body: String,
}

fn fts_phrase(phrase: &str) -> String {
    let mut cleaned = String::new();
    for ch in phrase.chars() {
        if ch.is_alphanumeric() || ch.is_whitespace() {
            cleaned.push(ch);
        }
    }
    let trimmed = cleaned.split_whitespace().collect::<Vec<_>>().join(" ");
    format!("\"{}\"", trimmed.replace('"', ""))
}

/// A few indexed heads that mention a title. The caller drops real wikilinks.
/// Missing FTS returns an empty page rather than scanning the vault.
pub fn query_mention_heads(
    conn: &Connection,
    phrase: &str,
    limit: i64,
) -> Result<Vec<ShellMentionHead>, String> {
    let phrase = phrase.trim();
    if phrase.chars().count() < 4 {
        return Ok(Vec::new());
    }
    let limit = limit.clamp(1, 24);
    let match_q = fts_phrase(phrase);
    if match_q == "\"\"" {
        return Ok(Vec::new());
    }
    let mut stmt = match conn.prepare(
        "SELECT f.note_id, m.path, COALESCE(NULLIF(m.title, ''), m.name), substr(f.body, 1, 500)
         FROM note_fts f
         JOIN note_meta m ON m.id = f.note_id
         WHERE f MATCH ?1 AND m.deleted=0
         LIMIT ?2",
    ) {
        Ok(stmt) => stmt,
        Err(_) => return Ok(Vec::new()),
    };
    let mapped = stmt
        .query_map(params![match_q, limit], |row| {
            Ok(ShellMentionHead {
                from_id: row.get(0)?,
                from_path: row.get(1)?,
                from_title: row.get(2)?,
                body: row.get(3)?,
            })
        })
        .map_err(|e| e.to_string())?;
    Ok(mapped.filter_map(|r| r.ok()).collect())
}

pub fn query_recent(conn: &Connection, limit: i64) -> Result<Vec<ShellRow>, String> {
    let limit = limit.clamp(1, SHELL_RECENT_LIMIT);
    let mut stmt = conn
        .prepare(
            "SELECT id, path, name, kind, parent_id, mtime, 0
             FROM note_meta
             WHERE deleted=0 AND kind='note'
             ORDER BY mtime DESC, name COLLATE NOCASE
             LIMIT ?1",
        )
        .map_err(|e| e.to_string())?;
    let mapped = stmt
        .query_map(params![limit], map_row)
        .map_err(|e| e.to_string())?;
    Ok(mapped.filter_map(|r| r.ok()).collect())
}

fn safe_abs(root: &Path, rel: &str) -> Option<PathBuf> {
    let rel = normalize_rel(rel);
    if rel.is_empty() || rel.split('/').any(|p| p.is_empty() || p == "." || p == "..") {
        return None;
    }
    Some(root.join(&rel))
}

fn like_literal(s: &str) -> String {
    let mut out = String::new();
    for c in s.chars() {
        if matches!(c, '%' | '_' | '\\') {
            out.push('\\');
        }
        out.push(c);
    }
    out
}

/// Mark catalog rows deleted when the watcher says the file is gone.
/// Does not rebuild the window. Returns ids the UI should drop from the loaded page.
pub fn forget_missing_paths(
    conn: &Connection,
    root: &Path,
    rels: &[String],
) -> Result<ShellForget, String> {
    let mut ids = Vec::new();
    let mut paths = Vec::new();
    let mut seen = HashSet::new();
    for rel in rels {
        let Some(abs) = safe_abs(root, rel) else {
            continue;
        };
        if abs.exists() {
            continue;
        }
        let rel = normalize_rel(rel);
        if !paths.contains(&rel) {
            paths.push(rel.clone());
        }
        let child_like = format!("{}/%%", like_literal(&rel));
        let mut stmt = conn
            .prepare(
                "SELECT id FROM note_meta
                 WHERE deleted=0 AND (path = ?1 OR path LIKE ?2 ESCAPE '\\' OR id = ?3)",
            )
            .map_err(|e| e.to_string())?;
        let found: Vec<String> = stmt
            .query_map(params![rel, child_like, shell_node_id(&rel)], |row| row.get(0))
            .map_err(|e| e.to_string())?
            .filter_map(|r| r.ok())
            .collect();
        drop(stmt);
        for id in found {
            if seen.insert(id.clone()) {
                let _ = conn.execute("DELETE FROM tag_map WHERE note_id = ?1", params![id]);
                let _ = conn.execute("DELETE FROM link_edge WHERE source_id = ?1", params![id]);
                let _ = conn.execute(
                    "DELETE FROM link_edge WHERE target_id = ?1",
                    params![id],
                );
                conn.execute("UPDATE note_meta SET deleted=1 WHERE id = ?1", params![id])
                    .map_err(|e| e.to_string())?;
                ids.push(id);
            }
        }
    }
    Ok(ShellForget { ids, paths })
}

#[cfg(test)]
mod tests {
    use super::*;
    use rusqlite::Connection;
    use std::fs;

    fn open_mem() -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch(
            "CREATE TABLE note_meta (
               id TEXT PRIMARY KEY,
               path TEXT UNIQUE NOT NULL,
               name TEXT NOT NULL,
               kind TEXT NOT NULL,
               parent_id TEXT,
               mtime INTEGER NOT NULL,
               size INTEGER,
               content_hash TEXT,
               title TEXT,
               deleted INTEGER NOT NULL DEFAULT 0,
               fill_depth INTEGER
             );
             CREATE TABLE link_edge (
               id INTEGER PRIMARY KEY AUTOINCREMENT,
               source_id TEXT NOT NULL,
               target_raw TEXT NOT NULL,
               target_norm TEXT NOT NULL,
               target_id TEXT
             );
             CREATE TABLE meta_kv (
               key TEXT PRIMARY KEY,
               value TEXT NOT NULL
             );",
        )
        .unwrap();
        conn
    }

    fn insert_note(conn: &Connection, path: &str, parent: Option<&str>) {
        let name = path.rsplit('/').next().unwrap();
        let title = name.trim_end_matches(".md");
        conn.execute(
            "INSERT INTO note_meta(id, path, name, kind, parent_id, mtime, title, deleted)
             VALUES (?1,?2,?3,'note',?4,1,?5,0)",
            params![shell_node_id(path), path, name, parent, title],
        )
        .unwrap();
    }

    #[test]
    fn node_id_matches_desktop_contract() {
        assert_eq!(shell_node_id("Hub/Note-1.md"), "desk_Hub/Note-1.md");
        assert_eq!(shell_node_id("weird  name.md"), "desk_weird_name.md");
        assert_eq!(shell_node_id("a\\b.md"), "desk_a/b.md");
    }

    #[test]
    fn child_page_is_bounded_for_a_fat_folder() {
        let conn = open_mem();
        let folder = "Pile";
        conn.execute(
            "INSERT INTO note_meta(id, path, name, kind, parent_id, mtime, title, deleted)
             VALUES (?1,?2,?3,'folder',NULL,1,?3,0)",
            params![shell_node_id(folder), folder, folder],
        )
        .unwrap();
        for i in 0..1_000 {
            let path = format!("Pile/n{i:04}.md");
            insert_note(&conn, &path, Some(&shell_node_id(folder)));
        }
        let page = query_children(&conn, folder, 10, 0).unwrap();
        assert!(page.rows.len() <= 10, "page leaked {}", page.rows.len());
        assert_eq!(page.note_total, 1_000);
        assert_eq!(page.folder_total, 0);
        let level = query_level(&conn, folder, 320).unwrap();
        assert!(level.rows.len() <= 320);
        assert!(level.omitted >= 1_000 - 320);
    }

    #[test]
    fn small_vault_materializes_and_large_vault_does_not() {
        let mut small = open_mem();
        for i in 0..12 {
            insert_note(&small, &format!("n{i}.md"), None);
        }
        let mounted = mount_catalog(&mut small, Path::new("."), None, false).unwrap();
        assert!(mounted.materialize);
        assert_eq!(mounted.rows.len(), 12);
        assert_eq!(mounted.omitted_notes, 0);

        let mut large = open_mem();
        for i in 0..450 {
            insert_note(&large, &format!("n{i:04}.md"), None);
        }
        let mounted = mount_catalog(&mut large, Path::new("."), None, false).unwrap();
        assert!(!mounted.materialize);
        assert!(mounted.rows.len() <= SHELL_CHILD_PAGE as usize);
        // No stored total yet: the open stops at the probe instead of counting 450.
        assert_eq!(mounted.notes, COUNT_PROBE_LIMIT);
        assert!(mounted.rows.len() < 450);
        mark_catalog_walk_done(&large);
        let mounted = mount_catalog(&mut large, Path::new("."), None, false).unwrap();
        assert!(!mounted.materialize);
        assert_eq!(mounted.notes, 450);
        assert!(mounted.omitted_notes >= 450 - SHELL_CHILD_PAGE);
        assert!(mounted.rows.len() < mounted.notes as usize);
    }

    #[test]
    fn reopen_uses_the_stored_total_instead_of_counting_every_row() {
        let mut conn = open_mem();
        for i in 0..2_000 {
            insert_note(&conn, &format!("n{i:04}.md"), None);
        }
        let probed = catalog_counts_fast(&conn).unwrap();
        assert_eq!(probed.0, COUNT_PROBE_LIMIT);
        let stored: Option<String> = conn
            .query_row(
                "SELECT value FROM meta_kv WHERE key = ?1",
                params![COUNT_NOTES_KEY],
                |r| r.get(0),
            )
            .ok();
        assert!(stored.is_none(), "a capped probe must not be saved as the vault size");
        store_catalog_counts(&conn, 2_000, 0);
        assert_eq!(catalog_counts_fast(&conn).unwrap(), (2_000, 0));
        let mounted = mount_catalog(&mut conn, Path::new("."), None, false).unwrap();
        assert!(!mounted.materialize);
        assert_eq!(mounted.notes, 2_000);
        assert!(mounted.rows.len() <= SHELL_CHILD_PAGE as usize);
    }

    #[test]
    fn ego_stays_inside_the_draw_cap() {
        let conn = open_mem();
        insert_note(&conn, "Center.md", None);
        let center = shell_node_id("Center.md");
        for i in 0..40 {
            let path = format!("N{i}.md");
            insert_note(&conn, &path, None);
            conn.execute(
                "INSERT INTO link_edge(source_id, target_raw, target_norm, target_id)
                 VALUES (?1,?2,?3,?4)",
                params![center, path, path.trim_end_matches(".md").to_lowercase(), shell_node_id(&path)],
            )
            .unwrap();
        }
        let ego = query_ego(&conn, &center, 2, 8).unwrap();
        assert!(ego.rows.len() <= 8, "ego leaked {}", ego.rows.len());
        assert!(ego.capped);
        assert!(ego.rows.iter().any(|r| r.id == center));
    }

    #[test]
    fn walk_writes_folders_and_a_page_not_the_whole_tree() {
        let dir = std::env::temp_dir().join(format!(
            "nexus-shell-{}-{}",
            std::process::id(),
            SystemTime::now()
                .duration_since(SystemTime::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        fs::create_dir_all(dir.join("Area")).unwrap();
        fs::write(dir.join("Root.md"), "root").unwrap();
        fs::write(dir.join("Area/Child.md"), "child").unwrap();
        let mut conn = open_mem();
        let mounted = mount_catalog(&mut conn, &dir, Some("Area/Child.md"), true).unwrap();
        let _ = fs::remove_dir_all(&dir);
        assert!(mounted.materialize);
        assert_eq!(mounted.notes, 2);
        assert!(mounted.folders >= 1);
        assert_eq!(mounted.active_note_id.as_deref(), Some(shell_node_id("Area/Child.md").as_str()));
        let page = query_children(&conn, "Area", 10, 0).unwrap();
        assert_eq!(page.note_total, 1);
        assert_eq!(page.rows[0].path, "Area/Child.md");
    }

    #[test]
    fn page_stays_bounded_as_folder_grows() {
        let conn = open_mem();
        let folder = "Pile";
        conn.execute(
            "INSERT INTO note_meta(id, path, name, kind, parent_id, mtime, title, deleted)
             VALUES (?1,?2,?3,'folder',NULL,1,?3,0)",
            params![shell_node_id(folder), folder, folder],
        )
        .unwrap();
        for &size in &[200i64, 1_000, 5_000] {
            let have: i64 = conn
                .query_row(
                    "SELECT COUNT(*) FROM note_meta WHERE kind='note' AND parent_id=?1",
                    params![shell_node_id(folder)],
                    |r| r.get(0),
                )
                .unwrap();
            for i in have..size {
                let path = format!("Pile/n{i:04}.md");
                insert_note(&conn, &path, Some(&shell_node_id(folder)));
            }
            let page = query_children(&conn, folder, SHELL_CHILD_PAGE, 0).unwrap();
            assert!(
                page.rows.len() as i64 <= SHELL_CHILD_PAGE,
                "page {} for {size} notes",
                page.rows.len()
            );
            assert_eq!(page.note_total, size);
            assert!(page.rows.len() < size as usize || size <= SHELL_CHILD_PAGE);
        }
    }

    #[test]
    fn backlinks_tags_suggest_and_recent_are_queries() {
        let conn = open_mem();
        conn.execute_batch(
            "CREATE TABLE tag_map (
               tag TEXT NOT NULL,
               note_id TEXT NOT NULL,
               PRIMARY KEY (tag, note_id)
             );",
        )
        .unwrap();
        insert_note(&conn, "Alpha.md", None);
        insert_note(&conn, "Alpine.md", None);
        insert_note(&conn, "Beta.md", None);
        conn.execute(
            "UPDATE note_meta SET mtime=?1 WHERE path='Beta.md'",
            params![30i64],
        )
        .unwrap();
        conn.execute(
            "UPDATE note_meta SET mtime=?1 WHERE path='Alpha.md'",
            params![10i64],
        )
        .unwrap();
        conn.execute(
            "UPDATE note_meta SET mtime=?1 WHERE path='Alpine.md'",
            params![20i64],
        )
        .unwrap();
        let alpha = shell_node_id("Alpha.md");
        let alpine = shell_node_id("Alpine.md");
        conn.execute(
            "INSERT INTO link_edge(source_id, target_raw, target_norm, target_id)
             VALUES (?1,'Alpha','alpha',?2)",
            params![alpine, alpha],
        )
        .unwrap();
        let backs = query_backlinks(&conn, &alpha, 80).unwrap();
        assert_eq!(backs.total, 1);
        assert_eq!(backs.rows.len(), 1);
        assert_eq!(backs.rows[0].from_id, alpine);

        conn.execute(
            "INSERT INTO tag_map(tag, note_id) VALUES ('trip', ?1), ('trip', ?2)",
            params![alpha, alpine],
        )
        .unwrap();
        let tags = query_tags(&conn, 48).unwrap();
        assert_eq!(tags.len(), 1);
        assert_eq!(tags[0].tag, "trip");
        assert_eq!(tags[0].count, 2);
        let tagged = query_tag_notes(&conn, "trip", 80).unwrap();
        assert_eq!(tagged.len(), 2);

        let suggest = query_suggest(&conn, "al", 40).unwrap();
        assert!(suggest.iter().any(|h| h.path == "Alpha.md"));
        assert!(suggest.iter().any(|h| h.path == "Alpine.md"));
        assert!(suggest.iter().all(|h| h.path != "Beta.md"));
        insert_note(&conn, "00-Inbox/00/Hub 0.md", None);
        insert_note(&conn, "00-Inbox/00/Topic 1.md", None);
        let hub = query_suggest(&conn, "Hub", 16).unwrap();
        assert!(
            hub.iter().any(|h| h.path.ends_with("Hub 0.md")),
            "catalog title search must hit Hub before any FTS row exists"
        );
        assert!(hub.iter().all(|h| !h.path.ends_with("Topic 1.md")));
        let one = query_suggest(&conn, "al", 1).unwrap();
        assert_eq!(one.len(), 1);

        let recent = query_recent(&conn, 2).unwrap();
        assert_eq!(recent.len(), 2);
        assert_eq!(recent[0].path, "Beta.md");
        assert_eq!(recent[1].path, "Alpine.md");
    }

    #[test]
    fn forget_drops_a_missing_file_from_the_catalog() {
        let dir = std::env::temp_dir().join(format!(
            "nexus-shell-forget-{}-{}",
            std::process::id(),
            SystemTime::now()
                .duration_since(SystemTime::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        fs::create_dir_all(&dir).unwrap();
        fs::write(dir.join("Keep.md"), "keep").unwrap();
        fs::write(dir.join("Gone.md"), "gone").unwrap();
        let conn = open_mem();
        conn.execute_batch(
            "CREATE TABLE tag_map (
               tag TEXT NOT NULL,
               note_id TEXT NOT NULL,
               PRIMARY KEY (tag, note_id)
             );",
        )
        .unwrap();
        insert_note(&conn, "Keep.md", None);
        insert_note(&conn, "Gone.md", None);
        fs::remove_file(dir.join("Gone.md")).unwrap();
        let forgotten = forget_missing_paths(
            &conn,
            &dir,
            &["Keep.md".into(), "Gone.md".into()],
        )
        .unwrap();
        let _ = fs::remove_dir_all(&dir);
        assert_eq!(forgotten.paths, vec!["Gone.md".to_string()]);
        assert_eq!(forgotten.ids, vec![shell_node_id("Gone.md")]);
        assert!(query_note(&conn, &shell_node_id("Gone.md")).unwrap().is_none());
        assert!(query_note(&conn, &shell_node_id("Keep.md")).unwrap().is_some());
    }

    #[test]
    fn shell_read_budget_stays_short() {
        let budget = shell_busy_budget_ms();
        assert_eq!(budget, 156, "keep the TypeScript budget constant in step");
        assert!(budget <= 250, "catalog read budget {budget}ms");
    }

    #[test]
    fn shell_read_gives_up_while_a_writer_holds_the_lock() {
        let dir = std::env::temp_dir().join(format!(
            "nexus-shell-busy-{}-{}",
            std::process::id(),
            SystemTime::now()
                .duration_since(SystemTime::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        fs::create_dir_all(&dir).unwrap();
        let db = dir.join("index.sqlite");
        let writer = Connection::open(&db).unwrap();
        writer
            .execute_batch("PRAGMA journal_mode=WAL; CREATE TABLE t(id INTEGER);")
            .unwrap();
        writer.execute_batch("BEGIN IMMEDIATE;").unwrap();
        let reader = Connection::open(&db).unwrap();
        let started = std::time::Instant::now();
        let mut saw_busy = false;
        for attempt in 0..SHELL_BUSY_TRIES {
            let _ = reader.busy_timeout(std::time::Duration::from_millis(SHELL_BUSY_TIMEOUT_MS));
            match reader.execute_batch("BEGIN IMMEDIATE;") {
                Ok(()) => {
                    let _ = reader.execute_batch("ROLLBACK;");
                    break;
                }
                Err(err) => {
                    let msg = err.to_string().to_lowercase();
                    assert!(
                        msg.contains("busy") || msg.contains("locked"),
                        "unexpected lock error: {msg}"
                    );
                    saw_busy = true;
                    if attempt + 1 < SHELL_BUSY_TRIES {
                        std::thread::sleep(std::time::Duration::from_millis(shell_busy_sleep_ms(
                            attempt,
                        )));
                    }
                }
            }
        }
        let elapsed = started.elapsed().as_millis() as u64;
        let _ = writer.execute_batch("ROLLBACK;");
        let _ = fs::remove_dir_all(&dir);
        assert!(saw_busy, "reader should have hit the writer lock");
        assert!(
            elapsed <= shell_busy_budget_ms() + 80,
            "gave up in {elapsed}ms, budget {}",
            shell_busy_budget_ms()
        );
    }

    #[test]
    fn partial_catalog_pages_do_not_grow_with_the_folder() {
        let conn = open_mem();
        for i in 0..1_000 {
            let path = format!("Area/n{i:04}.md");
            insert_note(&conn, &path, None);
        }
        conn.execute(
            "INSERT INTO link_edge(source_id, target_raw, target_norm, target_id)
             VALUES (?1, 'Missing', 'missing', NULL)",
            params![shell_node_id("Area/n0001.md")],
        )
        .unwrap();
        let pins = query_by_paths(
            &conn,
            &["Area/n0003.md".into(), "Area/n0999.md".into(), "nope.md".into()],
        )
        .unwrap();
        assert_eq!(pins.len(), 2);
        let page = query_path_page(&conn, "", "area/n00", 40).unwrap();
        assert!(page.len() <= 40);
        assert!(page.len() < 1_000);
        let orphans = query_orphans(&conn, 24).unwrap();
        assert!(orphans.len() <= 24);
        assert!(orphans.iter().all(|row| row.id != shell_node_id("Area/n0001.md")));
        let broken = query_broken(&conn, 40).unwrap();
        assert_eq!(broken.len(), 1);
        assert_eq!(broken[0].target, "Missing");
        let known = query_known_norms(&conn, &["n0099".into(), "missing".into()]).unwrap();
        assert_eq!(known, vec!["n0099".to_string()]);
        let mentions = query_mention_heads(&conn, "n0099", 24).unwrap();
        assert!(mentions.is_empty(), "missing FTS is an empty page, not a vault scan");
    }

    #[test]
    fn first_page_does_not_wait_for_nested_notes() {
        let dir = std::env::temp_dir().join(format!(
            "nexus-shell-seed-{}-{}",
            std::process::id(),
            SystemTime::now()
                .duration_since(SystemTime::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        let root = dir.join("vault");
        fs::create_dir_all(root.join("deep/nest")).unwrap();
        fs::write(root.join("root.md"), "root\n").unwrap();
        for i in 0..40 {
            fs::write(root.join(format!("deep/nest/n{i:02}.md")), "x\n").unwrap();
        }
        let mut conn = open_mem();
        let complete = seed_first_page(&mut conn, &root, None).unwrap();
        // open_mem has no meta_kv; seed still returns. Use a file db so the
        // walk flag can be stored — completeness is about the listing.
        let _ = fs::remove_dir_all(&dir);
        assert!(!complete, "a nested folder is not a finished catalog");
        let page = query_children(&conn, "", 200, 0).unwrap();
        let notes: Vec<_> = page.rows.iter().filter(|r| r.kind == "note").collect();
        assert_eq!(notes.len(), 1);
        assert_eq!(notes[0].path, "root.md");
        assert!(page.rows.iter().any(|r| r.kind == "folder" && r.path == "deep"));
        let nested = query_children(&conn, "deep/nest", 200, 0).unwrap();
        assert!(nested.rows.is_empty(), "nested notes wait for a later page");
    }

    #[test]
    fn folder_migration_pages_instead_of_one_path_vec() {
        let mut conn = open_mem();
        for i in 0..30 {
            insert_note(&conn, &format!("Area/n{i:02}.md"), None);
        }
        let first = derive_folders_page(&mut conn, "", 10).unwrap();
        assert!(first.is_some());
        let folders: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM note_meta WHERE kind='folder'",
                [],
                |r| r.get(0),
            )
            .unwrap();
        assert!(folders >= 1);
        assert!(folders < 30);
        let rest = derive_folders_page(&mut conn, first.as_deref().unwrap_or(""), 100).unwrap();
        assert!(rest.is_some());
        let done = derive_folders_page(&mut conn, rest.as_deref().unwrap_or(""), 100).unwrap();
        assert!(done.is_none());
    }

    #[test]
    fn older_catalog_lists_root_folders_without_reading_every_path() {
        let dir = std::env::temp_dir().join(format!(
            "nexus-shell-folders-{}-{}",
            std::process::id(),
            SystemTime::now()
                .duration_since(SystemTime::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        let root = dir.join("vault");
        fs::create_dir_all(root.join("Area")).unwrap();
        fs::create_dir_all(root.join("Other/nest")).unwrap();
        fs::write(root.join("Area/n.md"), "a\n").unwrap();
        fs::write(root.join("Other/nest/m.md"), "b\n").unwrap();
        let mut conn = open_mem();
        insert_note(&conn, "Area/n.md", Some(&shell_node_id("Area")));
        insert_note(&conn, "Other/nest/m.md", Some(&shell_node_id("Other/nest")));
        seed_folder_pages(&mut conn, &root, Some("Other/nest/m.md")).unwrap();
        let page = query_children(&conn, "", 200, 0).unwrap();
        let folders: Vec<_> = page
            .rows
            .iter()
            .filter(|r| r.kind == "folder")
            .map(|r| r.path.as_str())
            .collect();
        assert!(folders.contains(&"Area"));
        assert!(folders.contains(&"Other"));
        assert!(
            query_children(&conn, "Other", 200, 0)
                .unwrap()
                .rows
                .iter()
                .any(|r| r.path == "Other/nest"),
            "the open note's parent folder is listed with the root page"
        );
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn fat_directory_page_is_the_sorted_window() {
        let dir = std::env::temp_dir().join(format!(
            "nexus-shell-sorted-{}-{}",
            std::process::id(),
            SystemTime::now()
                .duration_since(SystemTime::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        let root = dir.join("vault");
        fs::create_dir_all(&root).unwrap();
        // High names first, so the first names a directory returns are not
        // the sorted page. The folder is created last.
        for i in (0..250).rev() {
            fs::write(root.join(format!("n{i:03}.md")), "x\n").unwrap();
        }
        fs::create_dir_all(root.join("zz-late")).unwrap();
        let page = dir_page_rows(&root, "", 200).unwrap();
        assert_eq!(page.len(), 200);
        assert_eq!(page[0].kind, "folder");
        assert_eq!(page[0].path, "zz-late");
        let notes: Vec<&str> = page
            .iter()
            .filter(|r| r.kind == "note")
            .map(|r| r.name.as_str())
            .collect();
        assert_eq!(notes.len(), 199);
        assert_eq!(notes[0], "n000.md");
        assert_eq!(*notes.last().unwrap(), "n198.md");
        assert!(notes.iter().all(|name| *name != "n249.md"));
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn page_snapshot_roundtrips_without_the_database() {
        let dir = std::env::temp_dir().join(format!(
            "nexus-shell-snap-{}-{}",
            std::process::id(),
            SystemTime::now()
                .duration_since(SystemTime::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        fs::create_dir_all(&dir).unwrap();
        let db = dir.join("index.sqlite");
        fs::write(&db, b"sqlite-stand-in").unwrap();
        let db_path = db.to_string_lossy().to_string();
        let mount = ShellMount {
            materialize: false,
            pending: false,
            notes: 100_000,
            folders: 7,
            rows: vec![ShellRow {
                id: "hub".into(),
                path: "00-Inbox/00/Hub 0.md".into(),
                name: "Hub 0.md".into(),
                kind: "note".into(),
                parent_id: Some("inbox".into()),
                mtime: 1,
                child_notes: 0,
            }],
            root_ids: vec!["inbox".into()],
            active_note_id: Some("hub".into()),
            omitted_notes: 99_999,
            loaded: Vec::new(),
            db_path: db_path.clone(),
            titles_live: true,
        };
        write_page_snapshot(&db_path, &mount).unwrap();
        let read = read_page_snapshot(&db_path).expect("snapshot");
        assert!(read.titles_live);
        assert_eq!(read.rows[0].path, "00-Inbox/00/Hub 0.md");
        assert_eq!(read.notes, 100_000);
        update_page_snapshot_notes(&db_path, 100_000);
        assert_eq!(read_page_snapshot(&db_path).unwrap().notes, 100_000);
        update_page_snapshot_notes(&db_path, 500_000);
        let raised = read_page_snapshot(&db_path).unwrap();
        assert_eq!(raised.notes, 500_000);
        assert_eq!(raised.omitted_notes, 499_999);
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn disk_window_includes_hub_0_without_the_index() {
        let dir = std::env::temp_dir().join(format!(
            "nexus-shell-disk-{}-{}",
            std::process::id(),
            SystemTime::now()
                .duration_since(SystemTime::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        let root = dir.join("vault");
        const ROOTS: [&str; 7] = [
            "00-Inbox",
            "10-Projects",
            "20-Areas",
            "30-Resources",
            "40-Archive",
            "50-Daily",
            "60-Systems",
        ];
        for root_name in ROOTS {
            for bucket in 0..20 {
                fs::create_dir_all(root.join(format!("{root_name}/{bucket:02}"))).unwrap();
            }
        }
        fs::write(root.join("00-Inbox/00/Hub 0.md"), "# Hub 0\n").unwrap();
        for i in 1..80 {
            fs::write(root.join(format!("00-Inbox/00/Topic {i}.md")), "x\n").unwrap();
        }
        fs::write(root.join("60-Systems/19/Topic far.md"), "far\n").unwrap();
        let mount = mount_disk_window(&root, None).unwrap();
        assert!(
            mount.rows.iter().any(|r| r.path == "00-Inbox/00/Hub 0.md"),
            "Hub 0 is on the first page"
        );
        assert!(
            mount
                .rows
                .iter()
                .all(|r| r.path != "60-Systems/19/Topic far.md"),
            "a far folder is not read for the first page"
        );
        assert!(mount.titles_live);
        assert!(!mount.materialize);
        assert!(mount.notes <= 80, "the page count is not a stand-in total");
        assert!(mount.db_path.is_empty());
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn flat_directory_page_stops_before_the_rest_of_the_names() {
        let dir = std::env::temp_dir().join(format!(
            "nexus-shell-flat-{}-{}",
            std::process::id(),
            SystemTime::now()
                .duration_since(SystemTime::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        let root = dir.join("vault");
        fs::create_dir_all(&root).unwrap();
        let extra = DIR_PAGE_SCAN_CAP + 2_000;
        for i in 0..extra {
            fs::write(root.join(format!("n{i:06}.md")), "x\n").unwrap();
        }
        fs::write(root.join("Hub 0.md"), "# Hub 0\n").unwrap();
        reset_dir_page_seen();
        let page = dir_page_rows(&root, "", 32).unwrap();
        assert!(
            dir_page_seen() <= DIR_PAGE_SCAN_CAP,
            "scanned {} names of a flat folder",
            dir_page_seen()
        );
        assert_eq!(page.iter().filter(|r| r.kind == "note").count(), 32);
        assert!(
            page.iter().any(|r| r.name == "Hub 0.md"),
            "Hub 0 is on the page without reading every name"
        );
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn stored_note_total_replaces_the_page_count() {
        let dir = std::env::temp_dir().join(format!(
            "nexus-shell-total-{}-{}",
            std::process::id(),
            SystemTime::now()
                .duration_since(SystemTime::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        fs::create_dir_all(&dir).unwrap();
        let db = dir.join("index.sqlite");
        fs::write(&db, b"sqlite-stand-in").unwrap();
        let db_path = db.to_string_lossy().to_string();
        write_note_total_sidecar(&db_path, 500_000);
        assert_eq!(read_note_total_sidecar(&db_path), Some(500_000));
        let mut mount = ShellMount {
            materialize: false,
            pending: false,
            notes: 12,
            folders: 2,
            rows: vec![ShellRow {
                id: "hub".into(),
                path: "00-Inbox/00/Hub 0.md".into(),
                name: "Hub 0.md".into(),
                kind: "note".into(),
                parent_id: Some("inbox".into()),
                mtime: 1,
                child_notes: 0,
            }],
            root_ids: vec!["inbox".into()],
            active_note_id: Some("hub".into()),
            omitted_notes: 0,
            loaded: Vec::new(),
            db_path: db_path.clone(),
            titles_live: true,
        };
        apply_note_total(&mut mount, read_note_total_sidecar(&db_path).unwrap());
        assert_eq!(mount.notes, 500_000);
        assert_eq!(mount.omitted_notes, 499_999);
        let _ = fs::remove_dir_all(&dir);
    }
}
