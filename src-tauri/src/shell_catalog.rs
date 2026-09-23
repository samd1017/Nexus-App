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
    }
}

pub fn ensure_shell_indexes(conn: &Connection) -> Result<(), String> {
    conn.execute_batch(
        "CREATE INDEX IF NOT EXISTS note_meta_parent ON note_meta(parent_id);
         CREATE INDEX IF NOT EXISTS note_meta_title_norm ON note_meta(lower(title));",
    )
    .map_err(|e| e.to_string())
}

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
    })
}

fn mtime_of(meta: &std::fs::Metadata) -> i64 {
    meta.modified()
        .ok()
        .and_then(|t| t.duration_since(SystemTime::UNIX_EPOCH).ok())
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
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
            }
        }
    }
    flush_batch(conn, &mut batch)
}

/// One native pass so older note-only catalogs gain folder rows.
/// The path list stays in this process; it is not returned to the UI.
pub fn derive_folders(conn: &mut Connection) -> Result<(), String> {
    let paths: Vec<String> = {
        let mut stmt = conn
            .prepare("SELECT path FROM note_meta WHERE kind='note' AND deleted=0")
            .map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map([], |r| r.get::<_, String>(0))
            .map_err(|e| e.to_string())?;
        rows.filter_map(|r| r.ok()).collect()
    };
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
                if batch.len() >= SHELL_WRITE_BATCH {
                    flush_batch(conn, &mut batch)?;
                }
            }
        }
    }
    flush_batch(conn, &mut batch)
}

/// Build the shell the renderer is allowed to hold.
/// `allow_walk` is false while a fill writer owns the database.
pub fn mount_catalog(
    conn: &mut Connection,
    root: &Path,
    prefer_path: Option<&str>,
    allow_walk: bool,
) -> Result<ShellMount, String> {
    ensure_shell_indexes(conn)?;
    let (mut notes, mut folders) = catalog_counts(conn)?;
    if notes == 0 {
        if !allow_walk {
            return Ok(pending_mount());
        }
        write_catalog(conn, root)?;
        (notes, folders) = catalog_counts(conn)?;
    } else if folders == 0 && allow_walk {
        derive_folders(conn)?;
        (notes, folders) = catalog_counts(conn)?;
    }
    if notes <= SHELL_FULL_MAX_NOTES {
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
        assert_eq!(mounted.notes, 450);
        assert!(mounted.omitted_notes >= 450 - SHELL_CHILD_PAGE);
        assert!(mounted.rows.len() < mounted.notes as usize);
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
}
