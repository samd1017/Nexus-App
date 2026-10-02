//! FTS writer: title and body rows, journal handling, and head reads.

use rusqlite::{params, Connection};
use std::collections::{HashMap, HashSet};
use std::io::Read;
use std::path::{Path, PathBuf};
use std::time::{Duration, Instant};

use super::links::{
    desk_node_id, extract_tags, extract_wikilink_targets, normalize_link_target,
};
use super::{
    cooperate_after_write, headed_depths, DiskNote, ExistingNote, FillNote, DISCOVER_TAIL_YIELD_MS,
    EAGER_CONTENT_CAP, FILL_DEPTH_DEEP, FILL_DEPTH_META, FILL_READ_WORKERS_MAX, FTS_WRITE_BATCH,
    READ_CHUNK, TITLE_READY_FLUSH,
};

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

/// Filename stem, or the first ATX H1 in a short head (frontmatter skipped).
pub fn title_from_name_and_head(name: &str, head: &str) -> String {
    for line in head.lines().take(48) {
        let t = line.trim();
        if let Some(rest) = t.strip_prefix("# ") {
            let title = rest.trim();
            if !title.is_empty() {
                return title.to_string();
            }
        }
    }
    name.trim_end_matches(".md").to_string()
}

pub fn inferred_fill_depth(fill_depth: Option<i64>) -> i64 {
    // Legacy rows (no column / NULL) were written with full heads.
    fill_depth.unwrap_or(FILL_DEPTH_DEEP)
}

pub(super) fn note_meta_has_column(conn: &Connection, column: &str) -> Result<bool, String> {
    match conn.query_row(
        "SELECT 1 FROM pragma_table_info('note_meta') WHERE name=?1 LIMIT 1",
        params![column],
        |_| Ok(1i64),
    ) {
        Ok(_) => Ok(true),
        Err(rusqlite::Error::QueryReturnedNoRows) => Ok(false),
        Err(e) => Err(format!("schema migrate: {e}")),
    }
}

pub(super) fn add_note_meta_column(conn: &Connection, column: &str, decl: &str) -> Result<(), String> {
    if !matches!(column, "fill_depth" | "ctime" | "walk_gen") {
        return Err(format!("schema migrate: unknown column {column}"));
    }
    if note_meta_has_column(conn, column)? {
        return Ok(());
    }
    conn.execute(
        &format!("ALTER TABLE note_meta ADD COLUMN {column} {decl}"),
        [],
    )
    .map_err(|e| format!("schema migrate: add note_meta.{column}: {e}"))?;
    Ok(())
}

pub fn ensure_fill_depth_column(conn: &Connection) -> Result<(), String> {
    add_note_meta_column(conn, "fill_depth", "INTEGER")?;
    add_note_meta_column(conn, "ctime", "INTEGER")?;
    Ok(())
}


/// Bulk title and head writes. A larger page cache and rarer WAL checkpoints
/// keep the index from re-reading itself as it grows. automerge stays on so
/// a search during fill does not walk an unbounded set of FTS segments.
/// `journal_size_limit` caps the file left after a passive checkpoint so the
/// next launch does not replay a vault-sized log. Never `TRUNCATE` — that
/// hung a full catalog.
pub(super) fn tune_fill_connection(conn: &Connection) {
    let _ = conn.execute_batch(
        "PRAGMA cache_size=-524288;
         PRAGMA temp_store=MEMORY;
         PRAGMA mmap_size=1073741824;
         PRAGMA wal_autocheckpoint=100000;
         PRAGMA journal_size_limit=8388608;",
    );
}

pub(super) const TITLE_SEARCH_LIVE_KEY: &str = "title_search_live";

/// A journal larger than this is not replayed on open. The database file
/// already holds the last checkpoint; the fill catches up after the page.
pub(super) const JOURNAL_REPLAY_CAP: u64 = 8 * 1024 * 1024;
/// Below this, the database file is only a header and the journal is the index.
pub(super) const JOURNAL_DB_MIN: u64 = 1024 * 1024;

/// The index is a cache. Replaying a vault-sized journal blocks the first page.
/// When the database file already has a checkpoint, drop that tail. Returns
/// true when the journal files were removed.
/// Byte 18 of a SQLite header is 2 when the file is already in WAL mode.
/// Setting `journal_mode=WAL` again can checkpoint a large file.
pub fn sqlite_header_is_wal(path: &Path) -> bool {
    use std::io::Read;
    let mut file = match std::fs::File::open(path) {
        Ok(file) => file,
        Err(_) => return false,
    };
    let mut buf = [0u8; 20];
    if file.read(&mut buf).unwrap_or(0) < 20 {
        return false;
    }
    buf.starts_with(b"SQLite format 3\0") && buf[18] == 2
}

pub fn discard_oversized_journal(db_path: &Path) -> bool {
    discard_oversized_journal_with(db_path, JOURNAL_REPLAY_CAP, JOURNAL_DB_MIN)
}

pub fn discard_oversized_journal_with(db_path: &Path, wal_cap: u64, db_min: u64) -> bool {
    let wal = PathBuf::from(format!("{}-wal", db_path.display()));
    let shm = PathBuf::from(format!("{}-shm", db_path.display()));
    let wal_len = std::fs::metadata(&wal).map(|m| m.len()).unwrap_or(0);
    let db_len = std::fs::metadata(db_path).map(|m| m.len()).unwrap_or(0);
    if wal_len <= wal_cap || db_len < db_min {
        return false;
    }
    let removed_wal = std::fs::remove_file(&wal).is_ok();
    let _ = std::fs::remove_file(&shm);
    removed_wal
}

/// Remember that the open page is already in FTS, so the next launch can
/// paint Ready before it opens a second connection or reads the folder.
pub fn mark_title_search_live(conn: &Connection) {
    let _ = conn.execute(
        "INSERT INTO meta_kv(key, value) VALUES (?1, '1')
         ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        params![TITLE_SEARCH_LIVE_KEY],
    );
}

pub fn clear_title_search_live(conn: &Connection) {
    let _ = conn.execute(
        "DELETE FROM meta_kv WHERE key = ?1",
        params![TITLE_SEARCH_LIVE_KEY],
    );
}

/// True when a previous fill already committed titles. A stored catalog
/// total plus one FTS row covers indexes written before that flag existed.
pub fn title_search_already_live(conn: &Connection) -> bool {
    let flag: Option<String> = conn
        .query_row(
            "SELECT value FROM meta_kv WHERE key = ?1",
            params![TITLE_SEARCH_LIVE_KEY],
            |r| r.get(0),
        )
        .ok();
    if flag.as_deref() == Some("1") {
        return true;
    }
    let notes: i64 = conn
        .query_row(
            "SELECT value FROM meta_kv WHERE key = 'shell_note_count'",
            [],
            |r| r.get::<_, String>(0),
        )
        .ok()
        .and_then(|s| s.parse().ok())
        .unwrap_or(0);
    if notes <= TITLE_READY_FLUSH as i64 {
        return false;
    }
    conn.query_row("SELECT 1 FROM note_fts LIMIT 1", [], |r| r.get::<_, i64>(0))
        .unwrap_or(0)
        == 1
}

/// FTS segment merge. Runs after Ready so a filled vault does not merge
/// every segment before the first page.
pub(super) fn merge_fts_segments(conn: &Connection) {
    let _ = conn.execute_batch(
        "INSERT INTO note_fts(note_fts, rank) VALUES('automerge', 64);
         INSERT INTO note_fts(note_fts, rank) VALUES('crisismerge', 64);",
    );
}

/// The first heads commit in small batches so note text is searchable
/// before a full page of the vault has been read. Later batches stay at
/// `FTS_WRITE_BATCH` so the lock yield does not dominate the rest of the pass.
pub(super) fn head_write_limit(headed: i64) -> usize {
    if headed < 2048 {
        64
    } else {
        FTS_WRITE_BATCH
    }
}

/// Filename tokens users search first on cold open (`Hub N.md`).
pub fn is_title_seed_hot_name(name: &str) -> bool {
    name.trim_end_matches(".md")
        .trim_end_matches(".MD")
        .to_ascii_lowercase()
        .contains("hub")
}

pub(super) fn title_seed_rank(files: &[DiskNote], prefixes: &[String]) -> HashMap<usize, usize> {
    let rels: Vec<String> = files.iter().map(|f| f.rel.clone()).collect();
    let order = order_indices_for_fill(&rels, prefixes);
    order.iter().enumerate().map(|(r, i)| (*i, r)).collect()
}

/// Priority folder first, then Hub-named files, then walk order.
pub(super) fn order_need_meta_for_title_seed(
    files: &[DiskNote],
    need_meta: &[usize],
    prefixes: &[String],
) -> Vec<usize> {
    let rank = title_seed_rank(files, prefixes);
    let mut hot = Vec::new();
    let mut cold = Vec::new();
    for &i in need_meta {
        if is_title_seed_hot_name(&files[i].name) {
            hot.push(i);
        } else {
            cold.push(i);
        }
    }
    let by_rank = |a: &usize, b: &usize| {
        rank.get(a)
            .copied()
            .unwrap_or(usize::MAX)
            .cmp(&rank.get(b).copied().unwrap_or(usize::MAX))
    };
    hot.sort_by(by_rank);
    cold.sort_by(by_rank);
    hot.extend(cold);
    hot
}

pub(super) fn meta_fill_note(disk: &DiskNote) -> FillNote {
    FillNote {
        id: desk_node_id(&disk.rel),
        path: disk.rel.clone(),
        name: disk.name.clone(),
        parent_id: parent_id_for(&disk.rel),
        mtime: disk.mtime,
        size: disk.size,
        ctime: disk.ctime,
        title: disk.name.trim_end_matches(".md").to_string(),
        body: String::new(),
        links: Vec::new(),
        tags: Vec::new(),
        fill_depth: FILL_DEPTH_META,
    }
}

pub(super) fn normalize_rel(path: &str) -> String {
    path.replace('\\', "/")
}

pub fn is_priority_rel(rel: &str, prefixes: &[String]) -> bool {
    let rel = normalize_rel(rel);
    prefixes.iter().any(|raw| {
        let p = normalize_rel(raw).trim_matches('/').to_string();
        if p.is_empty() {
            return false;
        }
        rel == p || rel.starts_with(&format!("{p}/")) || p.starts_with(&format!("{rel}/"))
    })
}

pub fn order_indices_for_fill(rels: &[String], prefixes: &[String]) -> Vec<usize> {
    let mut pri = Vec::new();
    let mut rest = Vec::new();
    for (i, rel) in rels.iter().enumerate() {
        if is_priority_rel(rel, prefixes) {
            pri.push(i);
        } else {
            rest.push(i);
        }
    }
    pri.extend(rest);
    pri
}

/// Stable body-read window for a deep fill. Priority paths when the caller
/// passed some, otherwise walk order. Truncated before any "still shallow"
/// filter, so a reopen does not slide forward through the rest of the vault.
pub(super) fn content_read_window(
    file_count: usize,
    prefixes: &[String],
    files: &[DiskNote],
    pri_rank: &HashMap<usize, usize>,
) -> Vec<usize> {
    let mut idxs: Vec<usize> = if prefixes.is_empty() {
        (0..file_count).collect()
    } else {
        (0..file_count)
            .filter(|i| is_priority_rel(&files[*i].rel, prefixes))
            .collect()
    };
    idxs.sort_by_key(|i| pri_rank.get(i).copied().unwrap_or(usize::MAX));
    idxs.truncate(EAGER_CONTENT_CAP);
    idxs
}

pub(super) fn worker_count(n: usize) -> usize {
    if n == 0 {
        return 1;
    }
    std::thread::available_parallelism()
        .map(|p| p.get())
        .unwrap_or(2)
        .clamp(1, FILL_READ_WORKERS_MAX)
        .min(n)
}

pub(super) fn read_heads(files: &[DiskNote], indices: &[usize], head_chars: usize) -> Vec<(usize, String)> {
    if indices.is_empty() {
        return Vec::new();
    }
    let workers = worker_count(indices.len());
    let chunk = (indices.len() + workers - 1) / workers;
    std::thread::scope(|scope| {
        let mut joins = Vec::with_capacity(workers);
        for piece in indices.chunks(chunk.max(1)) {
            joins.push(scope.spawn(move || {
                use std::fs::File;
                let mut buf = vec![0u8; head_chars.saturating_mul(4).clamp(256, 128_000)];
                let mut out = Vec::with_capacity(piece.len());
                for &i in piece {
                    let body = match File::open(&files[i].abs) {
                        Ok(mut f) => {
                            let n = f.read(&mut buf).unwrap_or(0);
                            take_head(&buf[..n], head_chars)
                        }
                        Err(_) => String::new(),
                    };
                    out.push((i, body));
                }
                out
            }));
        }
        joins
            .into_iter()
            .flat_map(|j| j.join().unwrap_or_default())
            .collect()
    })
}

/// Read the next chunk of heads while the caller writes the previous one.
/// The yield stays on that write. Cancel is checked between chunks; one
/// in-flight read may finish and is discarded.
pub(super) fn pipeline_head_reads(
    files: &[DiskNote],
    indices: &[usize],
    head_chars: usize,
    is_cancelled: &mut dyn FnMut() -> bool,
    mut on_heads: impl FnMut(Vec<(usize, String)>),
) {
    let chunks: Vec<&[usize]> = indices.chunks(READ_CHUNK).collect();
    if chunks.is_empty() {
        return;
    }
    std::thread::scope(|scope| {
        let mut current = scope
            .spawn(|| read_heads(files, chunks[0], head_chars))
            .join()
            .unwrap_or_default();
        let mut idx = 1usize;
        loop {
            if is_cancelled() {
                break;
            }
            let next_handle = if idx < chunks.len() {
                let chunk = chunks[idx];
                idx += 1;
                Some(scope.spawn(move || read_heads(files, chunk, head_chars)))
            } else {
                None
            };
            on_heads(std::mem::take(&mut current));
            match next_handle {
                Some(handle) => {
                    if is_cancelled() {
                        let _ = handle.join();
                        break;
                    }
                    current = handle.join().unwrap_or_default();
                }
                None => break,
            }
        }
    });
}

/// Read `indices` at `head_chars` and commit `fill_depth`. Write batches stay
/// on `head_write_limit` so the first heads do not hold a long WAL lock.
/// `on_chunk` runs after each chunk is queued (and flushed, when the batch
/// filled) so progress can tick without a second read of the same files.
pub(super) fn index_note_heads(
    conn: &mut Connection,
    files: &[DiskNote],
    indices: &[usize],
    head_chars: usize,
    fill_depth: i64,
    is_cancelled: &mut dyn FnMut() -> bool,
    batch: &mut Vec<FillNote>,
    indexed: &mut i64,
    errors: &mut i64,
    written: &mut HashSet<String>,
    fresh_titles: &mut HashSet<String>,
    headed_rows: &mut i64,
    mut on_chunk: impl FnMut(i64, i64, i64),
) {
    pipeline_head_reads(files, indices, head_chars, is_cancelled, |heads| {
        let n = heads.len() as i64;
        for (i, body) in heads {
            let disk = &files[i];
            batch.push(FillNote {
                id: desk_node_id(&disk.rel),
                path: disk.rel.clone(),
                name: disk.name.clone(),
                parent_id: parent_id_for(&disk.rel),
                mtime: disk.mtime,
                size: disk.size,
                ctime: disk.ctime,
                title: title_from_name_and_head(&disk.name, &body),
                links: extract_wikilink_targets(&body),
                tags: extract_tags(&body),
                body,
                fill_depth,
            });
            *headed_rows += 1;
            if batch.len() >= head_write_limit(*headed_rows) {
                flush_note_batch(conn, batch, indexed, errors, written, fresh_titles);
            }
        }
        on_chunk(n, *indexed, *errors);
    });
}

/// Body-index the notes already listed. Returns whether every one of them
/// is inside the open window (a later directory is a separate question).
pub(super) fn index_prefix_deep(
    conn: &mut Connection,
    files: &[DiskNote],
    priority: &[String],
    deep_head: usize,
    is_cancelled: &mut dyn FnMut() -> bool,
    batch: &mut Vec<FillNote>,
    indexed: &mut i64,
    errors: &mut i64,
    written: &mut HashSet<String>,
    fresh_titles: &mut HashSet<String>,
) {
    let headed = headed_depths(conn);
    let mut need: Vec<usize> = Vec::new();
    for (i, file) in files.iter().enumerate() {
        let depth = headed.get(&file.rel).copied().unwrap_or(FILL_DEPTH_META);
        if depth < FILL_DEPTH_DEEP {
            need.push(i);
        }
    }
    let rels: Vec<String> = files.iter().map(|f| f.rel.clone()).collect();
    let pri_order = order_indices_for_fill(&rels, priority);
    let pri_rank: HashMap<usize, usize> =
        pri_order.iter().enumerate().map(|(r, i)| (*i, r)).collect();
    let window = content_read_window(files.len(), priority, files, &pri_rank);
    let window_set: HashSet<usize> = window.iter().copied().collect();
    let mut eager: Vec<usize> = need
        .into_iter()
        .filter(|i| window_set.contains(i))
        .collect();
    eager.sort_by_key(|i| pri_rank.get(i).copied().unwrap_or(usize::MAX));
    let mut headed_rows = 0i64;
    index_note_heads(
        conn,
        files,
        &eager,
        deep_head,
        FILL_DEPTH_DEEP,
        is_cancelled,
        batch,
        indexed,
        errors,
        written,
        fresh_titles,
        &mut headed_rows,
        |_, _, _| {},
    );
    flush_note_batch(conn, batch, indexed, errors, written, fresh_titles);
}

pub(super) fn parent_id_for(rel: &str) -> Option<String> {
    rel.rsplit_once('/').map(|(p, _)| desk_node_id(p))
}

/// `note_fts.note_id` is UNINDEXED. Deletes go through this rowid map so a
/// 100k fill does not scan the FTS table once per note.
pub fn ensure_note_fts_row(conn: &Connection) -> Result<(), String> {
    let present = conn
        .query_row(
            "SELECT 1 FROM sqlite_master WHERE type='table' AND name='note_fts_row'",
            [],
            |_| Ok(1i64),
        )
        .is_ok();
    if !present {
        conn.execute_batch(crate::schema::DDL)
            .map_err(|e| format!("schema migrate: {e}"))?;
    }
    let mapped: Option<String> = conn
        .query_row(
            "SELECT value FROM meta_kv WHERE key = 'fts_row_mapped'",
            [],
            |r| r.get(0),
        )
        .ok();
    if mapped.as_deref() == Some("1") {
        return Ok(());
    }
    // One existence check, not a count of every title. Later writes keep
    // the side table in step, so Ready does not scan the index again.
    let fts_any: i64 = conn
        .query_row("SELECT 1 FROM note_fts LIMIT 1", [], |r| r.get(0))
        .unwrap_or(0);
    let side_any: i64 = conn
        .query_row("SELECT 1 FROM note_fts_row LIMIT 1", [], |r| r.get(0))
        .unwrap_or(0);
    if fts_any == 1 && side_any == 0 {
        // Copying every row waits until after Ready.
        return Ok(());
    }
    let _ = conn.execute(
        "INSERT INTO meta_kv(key, value) VALUES ('fts_row_mapped', '1')
         ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        [],
    );
    Ok(())
}

pub(super) fn fts_row_map_done(conn: &Connection) -> bool {
    conn.query_row(
        "SELECT value FROM meta_kv WHERE key = 'fts_row_mapped'",
        [],
        |r| r.get::<_, String>(0),
    )
    .ok()
    .as_deref()
        == Some("1")
}

/// Copy at most `limit` FTS row ids. Returns true when the side table is caught up.
pub(super) fn backfill_note_fts_row_chunk(conn: &Connection, limit: i64) -> bool {
    if fts_row_map_done(conn) {
        return true;
    }
    let cursor: i64 = conn
        .query_row(
            "SELECT value FROM meta_kv WHERE key = 'fts_row_cursor'",
            [],
            |r| r.get::<_, String>(0),
        )
        .ok()
        .and_then(|s| s.parse().ok())
        .unwrap_or(0);
    let next: i64 = conn
        .query_row(
            "SELECT COALESCE(MAX(rowid), 0) FROM (
               SELECT rowid FROM note_fts
               WHERE rowid > ?1 AND note_id IS NOT NULL
               ORDER BY rowid
               LIMIT ?2
             )",
            params![cursor, limit],
            |r| r.get(0),
        )
        .unwrap_or(0);
    if next <= cursor {
        let _ = conn.execute(
            "INSERT INTO meta_kv(key, value) VALUES ('fts_row_mapped', '1')
             ON CONFLICT(key) DO UPDATE SET value = excluded.value",
            [],
        );
        return true;
    }
    let _ = conn.execute(
        "INSERT OR IGNORE INTO note_fts_row(note_id, fts_rowid)
         SELECT note_id, rowid FROM note_fts
         WHERE rowid > ?1 AND rowid <= ?2 AND note_id IS NOT NULL",
        params![cursor, next],
    );
    let _ = conn.execute(
        "INSERT INTO meta_kv(key, value) VALUES ('fts_row_cursor', ?1)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        params![next.to_string()],
    );
    false
}

pub(super) fn backfill_note_fts_row_if_needed(conn: &Connection) {
    while !backfill_note_fts_row_chunk(conn, 256) {
        std::thread::sleep(Duration::from_millis(DISCOVER_TAIL_YIELD_MS));
    }
}

pub fn delete_note_fts(conn: &Connection, id: &str) -> Result<(), String> {
    if let Ok(rowid) = conn.query_row(
        "SELECT fts_rowid FROM note_fts_row WHERE note_id=?1",
        params![id],
        |r| r.get::<_, i64>(0),
    ) {
        conn.execute("DELETE FROM note_fts WHERE rowid=?1", params![rowid])
            .map_err(|e| e.to_string())?;
        conn.execute("DELETE FROM note_fts_row WHERE note_id=?1", params![id])
            .map_err(|e| e.to_string())?;
    } else {
        conn.execute("DELETE FROM note_fts WHERE note_id=?1", params![id])
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}

pub fn replace_note_fts(
    conn: &Connection,
    id: &str,
    title: &str,
    path: &str,
    body: &str,
) -> Result<(), String> {
    ensure_note_fts_row(conn)?;
    if let Ok(rowid) = conn.query_row(
        "SELECT fts_rowid FROM note_fts_row WHERE note_id=?1",
        params![id],
        |r| r.get::<_, i64>(0),
    ) {
        conn.execute("DELETE FROM note_fts WHERE rowid=?1", params![rowid])
            .map_err(|e| e.to_string())?;
    }
    conn.execute(
        "INSERT INTO note_fts(note_id, title, path, body) VALUES (?1,?2,?3,?4)",
        params![id, title, path, body],
    )
    .map_err(|e| e.to_string())?;
    let rowid = conn.last_insert_rowid();
    conn.execute(
        "INSERT INTO note_fts_row(note_id, fts_rowid) VALUES (?1,?2)
         ON CONFLICT(note_id) DO UPDATE SET fts_rowid=excluded.fts_rowid",
        params![id, rowid],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

pub(super) fn flush_note_batch(
    conn: &mut Connection,
    batch: &mut Vec<FillNote>,
    indexed: &mut i64,
    errors: &mut i64,
    written: &mut HashSet<String>,
    fresh_titles: &mut HashSet<String>,
) {
    if batch.is_empty() {
        return;
    }
    let started = Instant::now();
    let indexed_before = *indexed;
    let tx = match conn.unchecked_transaction() {
        Ok(t) => t,
        Err(_) => {
            *errors += batch.len() as i64;
            batch.clear();
            cooperate_after_write(started);
            return;
        }
    };
    let flush_err = write_note_batch(&tx, batch, indexed, errors, written, fresh_titles);
    if flush_err.is_err() || tx.commit().is_err() {
        *errors += batch.len() as i64;
        *indexed = indexed_before;
    }
    batch.clear();
    cooperate_after_write(started);
}

pub(super) fn write_note_batch(
    conn: &Connection,
    batch: &[FillNote],
    indexed: &mut i64,
    errors: &mut i64,
    written: &mut HashSet<String>,
    fresh_titles: &mut HashSet<String>,
) -> Result<(), String> {
    if batch.is_empty() {
        return Ok(());
    }
    {
        let mut meta = conn
            .prepare_cached(
                "INSERT INTO note_meta(id, path, name, kind, parent_id, mtime, size, content_hash, title, deleted, fill_depth, ctime)
                 VALUES (?1,?2,?3,'note',?4,?5,?6,NULL,?7,0,?8,?9)
                 ON CONFLICT(id) DO UPDATE SET
                   path=excluded.path, name=excluded.name, parent_id=excluded.parent_id,
                   mtime=excluded.mtime, size=excluded.size,
                   ctime=COALESCE(excluded.ctime, note_meta.ctime),
                   title=CASE
                     WHEN note_meta.fill_depth IS NOT NULL AND note_meta.fill_depth > excluded.fill_depth
                       THEN note_meta.title
                     ELSE excluded.title
                   END,
                   deleted=0,
                   fill_depth=CASE
                     WHEN note_meta.fill_depth IS NOT NULL AND note_meta.fill_depth > excluded.fill_depth
                       THEN note_meta.fill_depth
                     ELSE excluded.fill_depth
                   END",
            )
            .map_err(|e| e.to_string())?;
        let mut fts_row = conn
            .prepare_cached("SELECT fts_rowid FROM note_fts_row WHERE note_id=?1")
            .map_err(|e| e.to_string())?;
        let mut fts_len = conn
            .prepare_cached("SELECT length(body) FROM note_fts WHERE rowid=?1")
            .map_err(|e| e.to_string())?;
        let mut fts_del = conn
            .prepare_cached("DELETE FROM note_fts WHERE rowid=?1")
            .map_err(|e| e.to_string())?;
        let mut fts_ins = conn
            .prepare_cached("INSERT INTO note_fts(note_id, title, path, body) VALUES (?1,?2,?3,?4)")
            .map_err(|e| e.to_string())?;
        let mut fts_map = conn
            .prepare_cached(
                "INSERT INTO note_fts_row(note_id, fts_rowid) VALUES (?1,?2)
                 ON CONFLICT(note_id) DO UPDATE SET fts_rowid=excluded.fts_rowid",
            )
            .map_err(|e| e.to_string())?;
        let mut link_del = conn
            .prepare_cached("DELETE FROM link_edge WHERE source_id = ?1")
            .map_err(|e| e.to_string())?;
        let mut link_ins = conn
            .prepare_cached(
                "INSERT OR IGNORE INTO link_edge(source_id, target_raw, target_norm, target_id)
                 VALUES (?1,?2,?3,NULL)",
            )
            .map_err(|e| e.to_string())?;
        let mut tag_del = conn
            .prepare_cached("DELETE FROM tag_map WHERE note_id = ?1")
            .map_err(|e| e.to_string())?;
        let mut tag_ins = conn
            .prepare_cached("INSERT OR IGNORE INTO tag_map(tag, note_id) VALUES (?1,?2)")
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
                    note.fill_depth,
                    note.ctime,
                ])
                .is_err()
            {
                *errors += 1;
                continue;
            }
            // A title/path row must not erase a head that already landed.
            let prev_rowid: Option<i64> = fts_row
                .query_row(params![note.id], |r| r.get(0))
                .ok();
            // Title rows written earlier in this fill have an empty body.
            // Skip the length lookup on that path.
            let prev_body_len = if fresh_titles.contains(&note.id) {
                0
            } else {
                prev_rowid
                    .map(|rowid| {
                        fts_len
                            .query_row(params![rowid], |r| r.get::<_, i64>(0))
                            .unwrap_or(0)
                    })
                    .unwrap_or(0)
            };
            let keep_head =
                note.fill_depth <= FILL_DEPTH_META && note.body.is_empty() && prev_body_len > 0;
            if !keep_head {
                if let Some(rowid) = prev_rowid {
                    if fts_del.execute(params![rowid]).is_err() {
                        *errors += 1;
                        continue;
                    }
                }
                if fts_ins
                    .execute(params![note.id, note.title, note.path, note.body])
                    .is_err()
                {
                    *errors += 1;
                    continue;
                }
                let rowid = conn.last_insert_rowid();
                if fts_map.execute(params![note.id, rowid]).is_err() {
                    *errors += 1;
                    continue;
                }
            }
            let replace_edges = !note.links.is_empty() || prev_body_len > 0;
            if replace_edges && (note.fill_depth > FILL_DEPTH_META || !note.links.is_empty()) {
                if link_del.execute(params![note.id]).is_err() {
                    *errors += 1;
                    continue;
                }
                for raw in &note.links {
                    let norm = normalize_link_target(raw);
                    if norm.is_empty() {
                        continue;
                    }
                    if link_ins.execute(params![note.id, raw, norm]).is_err() {
                        *errors += 1;
                    }
                }
            }
            let replace_tags = !note.tags.is_empty() || prev_body_len > 0;
            if replace_tags && note.fill_depth > FILL_DEPTH_META {
                if tag_del.execute(params![note.id]).is_err() {
                    *errors += 1;
                    continue;
                }
                for tag in &note.tags {
                    if tag_ins.execute(params![tag, note.id]).is_err() {
                        *errors += 1;
                    }
                }
            }
            if !keep_head {
                if note.body.is_empty() && note.fill_depth <= FILL_DEPTH_META {
                    fresh_titles.insert(note.id.clone());
                } else {
                    fresh_titles.remove(&note.id);
                }
            }
            if written.insert(note.id.clone()) {
                *indexed += 1;
            }
        }
        Ok(())
    }
}

pub(super) fn remove_stale_walk(conn: &mut Connection, gen: i64) -> i64 {
    let ids: Vec<String> = {
        let Ok(mut stmt) = conn.prepare(
            "SELECT id FROM note_meta
             WHERE kind='note' AND deleted=0 AND COALESCE(walk_gen, 0) != ?1",
        ) else {
            return 0;
        };
        let Ok(rows) = stmt.query_map(params![gen], |r| r.get::<_, String>(0)) else {
            return 0;
        };
        rows.flatten().collect()
    };
    if ids.is_empty() {
        return 0;
    }
    let Ok(tx) = conn.unchecked_transaction() else {
        return 0;
    };
    let mut removed = 0i64;
    for id in &ids {
        let _ = tx.execute("DELETE FROM tag_map WHERE note_id = ?1", params![id]);
        let _ = tx.execute("DELETE FROM link_edge WHERE source_id = ?1", params![id]);
        let ok = delete_note_fts(&tx, id).is_ok()
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

pub(super) fn remove_stale_notes(
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
        let _ = tx.execute("DELETE FROM tag_map WHERE note_id = ?1", params![id]);
        let _ = tx.execute("DELETE FROM link_edge WHERE source_id = ?1", params![id]);
        let ok = delete_note_fts(&tx, id).is_ok()
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
