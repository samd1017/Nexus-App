//! Incremental SQLite FTS5 fill from a vault folder.
//! No Tauri imports — this module is also compiled by `src-tauri/fill-test`.

use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};
use std::path::{Path, PathBuf};
use std::time::{Duration, Instant};

pub const FILL_SKIP_DIRS: &[&str] = &[
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

#[derive(Clone, Serialize, Deserialize, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct IndexFillResult {
    pub indexed: i64,
    pub skipped: i64,
    pub errors: i64,
    pub notes: i64,
}

#[derive(Clone, Serialize, Deserialize, Debug)]
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

struct FillNote {
    id: String,
    path: String,
    name: String,
    parent_id: Option<String>,
    mtime: i64,
    size: i64,
    title: String,
    body: String,
}

/// Must match TS `deskNodeId` in `src/lib/vault/tauri-adapter.ts`.
/// Rel paths are POSIX (`/`); a Windows `\` is treated as `/`.
pub fn desk_node_id(path: &str) -> String {
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

/// First `head_chars` Unicode scalars. ASCII markdown takes the byte-fast path
/// so 100k heads do not pay `chars().take` per file.
pub fn take_head(bytes: &[u8], head_chars: usize) -> String {
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
    batch: &mut Vec<FillNote>,
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
            if meta
                .execute(params![
                    note.id,
                    note.path,
                    note.name,
                    note.parent_id,
                    note.mtime,
                    note.size,
                    note.title,
                ])
                .is_err()
            {
                *errors += 1;
                continue;
            }
            if fts_del.execute(params![note.id]).is_err()
                || fts_ins
                    .execute(params![note.id, note.title, note.path, note.body])
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
        let ok = tx
            .execute("DELETE FROM note_fts WHERE note_id = ?1", params![id])
            .is_ok()
            && tx
                .execute("DELETE FROM note_meta WHERE id = ?1", params![id])
                .is_ok();
        if ok {
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
pub fn fill_from_disk_on_conn(
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
    let mut batch: Vec<FillNote> = Vec::with_capacity(512);
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
        batch.push(FillNote {
            id: desk_node_id(&disk.rel),
            path: disk.rel.clone(),
            name: disk.name.clone(),
            parent_id: parent_path.map(|p| desk_node_id(&p)),
            mtime: disk.mtime,
            size: disk.size,
            title: disk.name.trim_end_matches(".md").to_string(),
            body,
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

#[cfg(test)]
mod tests {
    use super::*;
    use rusqlite::Connection;
    use std::fs;
    use std::io::Write;
    use std::path::PathBuf;

    const TEST_DDL: &str = r#"
CREATE TABLE IF NOT EXISTS note_meta (
  id TEXT PRIMARY KEY,
  path TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  kind TEXT NOT NULL,
  parent_id TEXT,
  mtime INTEGER NOT NULL,
  size INTEGER,
  content_hash TEXT,
  title TEXT,
  deleted INTEGER NOT NULL DEFAULT 0
);
CREATE VIRTUAL TABLE IF NOT EXISTS note_fts USING fts5(
  note_id UNINDEXED,
  title,
  path,
  body,
  tokenize = 'unicode61 remove_diacritics 2'
);
"#;

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

    fn open_test_conn(db: &Path) -> Connection {
        let conn = Connection::open(db).unwrap();
        conn.execute_batch("PRAGMA journal_mode=WAL; PRAGMA synchronous=NORMAL;")
            .unwrap();
        conn.execute_batch(TEST_DDL).unwrap();
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

    fn fts_has(conn: &Connection, query: &str) -> bool {
        let mut stmt = conn
            .prepare("SELECT note_id FROM note_fts WHERE note_fts MATCH ?1 LIMIT 4")
            .unwrap();
        let rows = stmt.query_map(params![query], |r| r.get::<_, String>(0));
        match rows {
            Ok(iter) => iter.flatten().next().is_some(),
            Err(_) => false,
        }
    }

    fn note_count(conn: &Connection) -> i64 {
        conn.query_row(
            "SELECT COUNT(*) FROM note_meta WHERE kind='note' AND deleted=0",
            [],
            |r| r.get(0),
        )
        .unwrap_or(0)
    }

    #[test]
    fn desk_id_matches_ts_contract() {
        assert_eq!(desk_node_id("Hub/Note-1.md"), "desk_Hub/Note-1.md");
        assert_eq!(desk_node_id("a\\b.md"), "desk_a/b.md");
        assert_eq!(desk_node_id("weird  name.md"), "desk_weird_name.md");
        assert_eq!(desk_node_id("foo@@@bar.md"), "desk_foo_bar.md");
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
        let mut conn = open_test_conn(&db);

        let (first, ticks) = fill(&mut conn, &vault, false);
        assert_eq!(first.notes, 3);
        assert_eq!(first.indexed, 3);
        assert_eq!(first.skipped, 0);
        assert!(ticks.iter().any(|p| p.phase == "indexing" && p.total == 3));
        assert_eq!(ticks.last().map(|p| p.phase.as_str()), Some("done"));
        assert!(fts_has(&conn, "retrieval"), "cold fill must FTS index heads");

        let (second, _) = fill(&mut conn, &vault, false);
        assert_eq!(second.notes, 3);
        assert_eq!(second.indexed, 0, "reopen must skip unchanged path+mtime+size");
        assert_eq!(second.skipped, 3);
        assert!(fts_has(&conn, "retrieval"));

        write_note(&vault, "cluster.md", "cluster token plus uniquexyz\n");
        let (third, _) = fill(&mut conn, &vault, false);
        assert_eq!(third.indexed, 1);
        assert_eq!(third.skipped, 2);
        assert!(fts_has(&conn, "uniquexyz"));

        let _ = fs::remove_dir_all(vault.parent().unwrap());
    }

    #[test]
    fn force_rebuild_reupserts_and_stale_paths_are_removed() {
        let (vault, db) = temp_pair("force");
        write_note(&vault, "keep.md", "keep body\n");
        write_note(&vault, "gone.md", "gone body\n");
        let mut conn = open_test_conn(&db);
        let (first, _) = fill(&mut conn, &vault, false);
        assert_eq!(first.indexed, 2);

        fs::remove_file(vault.join("gone.md")).unwrap();
        let (forced, _) = fill(&mut conn, &vault, true);
        assert_eq!(forced.notes, 1);
        assert_eq!(forced.indexed, 1);
        assert_eq!(forced.skipped, 0);
        assert_eq!(note_count(&conn), 1);

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
        let mut conn = open_test_conn(&db);
        let (first, ticks) = fill(&mut conn, &vault, false);
        assert_eq!(first.indexed, 80);
        assert!(
            ticks.len() >= 2,
            "start + done at minimum, got {}",
            ticks.len()
        );
        assert!(ticks.iter().any(|p| p.scanned > 0 && p.phase == "indexing"));
        let (second, ticks2) = fill(&mut conn, &vault, false);
        assert_eq!(second.skipped, 80);
        assert_eq!(second.indexed, 0);
        assert!(ticks2.iter().any(|p| p.skipped >= 64 || p.phase == "done"));

        let _ = fs::remove_dir_all(vault.parent().unwrap());
    }
}
