//! Phased SQLite FTS5 fill from a vault folder.
//!
//! Cold open must not wait for a full 100k empty-body FTS catalog before
//! title search or short heads. Desktop (`FillUntil::Partial` / `Deep`):
//! seed a small title/path FTS batch (priority folder + Hub-named files
//! first), emit `ready-meta`, then read short heads. `FillUntil::Meta`
//! still catalogs every title. No Tauri imports — also compiled by
//! `src-tauri/fill-test`.
//!
//! Mid-fill UI (tree / note open / graph) must stay interactive: small WAL
//! write batches, ≤2 head readers, yield after real I/O, time-gated progress.

use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};
use std::io::Read;
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

pub const DEFAULT_SHORT_HEAD: usize = 768;
pub const DEFAULT_DEEP_HEAD: usize = 8000;
pub const FILL_DEPTH_META: i64 = 0;
pub const FILL_DEPTH_PARTIAL: i64 = 1;
pub const FILL_DEPTH_DEEP: i64 = 2;
const META_BATCH: usize = 256;
/// FTS5 + link_edge writes hold the WAL exclusive lock. 1024-row batches
/// made UI search / upsert / list_links wait multi-seconds (15s busy_timeout).
pub const FTS_WRITE_BATCH: usize = 128;
pub const READ_CHUNK: usize = 128;
/// Sleep after a write that actually took work, so the WebView and note
/// reads can sneak in on Linux desktop during a 100k fill.
pub const FILL_YIELD_MS: u64 = 4;
/// Head readers share the disk with `readNote` / tree clicks. 8 workers
/// saturated Linux I/O and froze interaction.
pub const FILL_READ_WORKERS_MAX: usize = 2;
/// Title/path FTS rows written before `ready-meta` on Partial/Deep fills.
/// Enough for useful Hub-title hits; the rest wait for short-head writes.
pub const TITLE_FTS_SEED: usize = 2048;
/// Intra-phase banner ticks. Phase transitions still emit immediately.
/// Scan-delta emits (256) re-rendered AppShell/graph at 10–20Hz on fast fills.
pub const PROGRESS_EMIT_MS: u64 = 400;

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum FillUntil {
    Meta,
    Partial,
    Deep,
}

pub struct FillOpts<'a> {
    pub deep_head_chars: usize,
    pub short_head_chars: usize,
    pub force_rebuild: bool,
    pub db_path: &'a str,
    pub priority_rels: &'a [String],
    pub until: FillUntil,
}

#[derive(Clone, Serialize, Deserialize, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct IndexFillResult {
    pub indexed: i64,
    pub skipped: i64,
    pub errors: i64,
    pub notes: i64,
    #[serde(default)]
    pub edges: i64,
    #[serde(default)]
    pub search_state: String,
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
    #[serde(default)]
    pub search_state: String,
}

struct ExistingNote {
    id: String,
    mtime: i64,
    size: Option<i64>,
    fill_depth: Option<i64>,
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
    links: Vec<String>,
    fill_depth: i64,
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

/// Match TS `normalizeLinkTarget` so reverse maps resolve the same keys.
pub fn normalize_link_target(target: &str) -> String {
    let trimmed = target.trim();
    let without_md = if trimmed.len() >= 3
        && trimmed[trimmed.len().saturating_sub(3)..].eq_ignore_ascii_case(".md")
    {
        &trimmed[..trimmed.len() - 3]
    } else {
        trimmed
    };
    without_md.replace('\\', "/").to_ascii_lowercase()
}

fn note_target_from_inner(inner: &str) -> String {
    let inner = inner.trim();
    if inner.is_empty() {
        return String::new();
    }
    let raw = if let Some(pipe) = inner.find('|') {
        inner[..pipe].trim()
    } else {
        inner
    };
    if let Some(block) = raw.find("#^") {
        return raw[..block].trim().to_string();
    }
    if raw.starts_with('^') && !raw.contains('#') {
        return String::new();
    }
    if let Some(hash) = raw.find('#') {
        return raw[..hash].trim().to_string();
    }
    raw.trim().to_string()
}

fn strip_code_for_link_scan(markdown: &str) -> String {
    let chars: Vec<char> = markdown.chars().collect();
    let mut out = String::with_capacity(chars.len());
    let mut i = 0;
    while i < chars.len() {
        if i + 2 < chars.len() && chars[i] == '`' && chars[i + 1] == '`' && chars[i + 2] == '`' {
            let start = i;
            i += 3;
            while i + 2 < chars.len()
                && !(chars[i] == '`' && chars[i + 1] == '`' && chars[i + 2] == '`')
            {
                i += 1;
            }
            if i + 2 < chars.len() {
                i += 3;
            } else {
                i = chars.len();
            }
            out.extend(std::iter::repeat(' ').take(i - start));
            continue;
        }
        if chars[i] == '`' {
            let start = i;
            i += 1;
            while i < chars.len() && chars[i] != '`' && chars[i] != '\n' {
                i += 1;
            }
            if i < chars.len() && chars[i] == '`' {
                i += 1;
            }
            out.extend(std::iter::repeat(' ').take(i - start));
            continue;
        }
        out.push(chars[i]);
        i += 1;
    }
    out
}

/// Extract unique `[[note]]` targets from a file head. Skips code fences / inline
/// code. Same note-target rules as TS `extractWikilinkTargets`.
pub fn extract_wikilink_targets(markdown: &str) -> Vec<String> {
    let stripped = strip_code_for_link_scan(markdown);
    let mut out = Vec::new();
    let mut seen = HashSet::new();
    let mut rest = stripped.as_str();
    while let Some(start) = rest.find("[[") {
        let after = &rest[start + 2..];
        if let Some(end) = after.find("]]") {
            let note = note_target_from_inner(&after[..end]);
            if !note.is_empty() && seen.insert(note.clone()) {
                out.push(note);
            }
            rest = &after[end + 2..];
        } else {
            break;
        }
    }
    out
}

pub fn replace_source_links(
    conn: &Connection,
    source_id: &str,
    targets: &[String],
) -> Result<i64, String> {
    conn.execute(
        "DELETE FROM link_edge WHERE source_id = ?1",
        params![source_id],
    )
    .map_err(|e| e.to_string())?;
    let mut written = 0i64;
    for raw in targets {
        let norm = normalize_link_target(raw);
        if norm.is_empty() {
            continue;
        }
        conn.execute(
            "INSERT OR IGNORE INTO link_edge(source_id, target_raw, target_norm, target_id)
             VALUES (?1,?2,?3,NULL)",
            params![source_id, raw, norm],
        )
        .map_err(|e| e.to_string())?;
        written += 1;
    }
    Ok(written)
}

fn count_link_edges(conn: &Connection) -> i64 {
    conn.query_row("SELECT COUNT(*) FROM link_edge", [], |r| r.get(0))
        .unwrap_or(0)
}

fn finalize_link_edges(
    conn: &mut Connection,
    skipped: i64,
    indexed: i64,
    mark_ready: bool,
    progress: &mut IndexFillProgress,
) -> i64 {
    if !links_indexed_flag(conn) {
        // Incremental skip of a pre-patch FTS index still needs a one-shot
        // extract from existing note_fts heads — no JS body hydrate.
        if skipped > 0 || indexed == 0 {
            if let Err(err) = backfill_links_from_fts(conn) {
                progress.message = Some(format!("link backfill failed: {err}"));
            }
        }
        if mark_ready {
            set_links_indexed_flag(conn);
        }
    }
    count_link_edges(conn)
}

fn links_indexed_flag(conn: &Connection) -> bool {
    conn.query_row(
        "SELECT value FROM meta_kv WHERE key = 'links_indexed'",
        [],
        |r| r.get::<_, String>(0),
    )
    .ok()
    .map(|v| v == "1")
    .unwrap_or(false)
}

fn set_links_indexed_flag(conn: &Connection) {
    let _ = conn.execute(
        "INSERT INTO meta_kv(key, value) VALUES ('links_indexed', '1')
         ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        [],
    );
}

/// One-shot: persist `link_edge` from already-indexed FTS bodies.
/// Used when a warm FTS index was filled before this path existed.
pub fn backfill_links_from_fts(conn: &mut Connection) -> Result<i64, String> {
    let rows: Vec<(String, String)> = {
        let mut stmt = conn
            .prepare("SELECT note_id, body FROM note_fts")
            .map_err(|e| e.to_string())?;
        let mapped = stmt
            .query_map([], |r| Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?)))
            .map_err(|e| e.to_string())?;
        mapped.flatten().collect()
    };
    let tx = conn.unchecked_transaction().map_err(|e| e.to_string())?;
    let _ = tx.execute("DELETE FROM link_edge", []);
    let mut edges = 0i64;
    for (id, body) in rows {
        edges += replace_source_links(&tx, &id, &extract_wikilink_targets(&body))?;
    }
    tx.commit().map_err(|e| e.to_string())?;
    Ok(edges)
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

pub fn ensure_fill_depth_column(conn: &Connection) {
    let _ = conn.execute("ALTER TABLE note_meta ADD COLUMN fill_depth INTEGER", []);
}

fn load_existing_notes(conn: &Connection) -> HashMap<String, ExistingNote> {
    let mut map = HashMap::new();
    let Ok(mut stmt) = conn.prepare(
        "SELECT id, path, mtime, size, fill_depth FROM note_meta WHERE kind='note' AND deleted=0",
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
                fill_depth: r.get(4)?,
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

fn should_emit_progress(last_at: Instant, _last_scanned: i64, _scanned: i64) -> bool {
    last_at.elapsed() >= Duration::from_millis(PROGRESS_EMIT_MS)
}

fn cooperate_after_write(started: Instant) {
    if started.elapsed() >= Duration::from_millis(2) {
        std::thread::sleep(Duration::from_millis(FILL_YIELD_MS));
    } else {
        std::thread::yield_now();
    }
}

fn cooperate_after_io(started: Instant) {
    if started.elapsed() >= Duration::from_millis(12) {
        std::thread::sleep(Duration::from_millis(FILL_YIELD_MS));
    } else {
        std::thread::yield_now();
    }
}

/// Filename tokens users search first on cold open (official soak: `Hub N.md`).
pub fn is_title_seed_hot_name(name: &str) -> bool {
    name.trim_end_matches(".md")
        .trim_end_matches(".MD")
        .to_ascii_lowercase()
        .contains("hub")
}

fn title_seed_rank(files: &[DiskNote], prefixes: &[String]) -> HashMap<usize, usize> {
    let rels: Vec<String> = files.iter().map(|f| f.rel.clone()).collect();
    let order = order_indices_for_fill(&rels, prefixes);
    order.iter().enumerate().map(|(r, i)| (*i, r)).collect()
}

/// Priority folder first, then Hub-named files, then walk order.
fn order_need_meta_for_title_seed(
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

fn meta_fill_note(disk: &DiskNote) -> FillNote {
    FillNote {
        id: desk_node_id(&disk.rel),
        path: disk.rel.clone(),
        name: disk.name.clone(),
        parent_id: parent_id_for(&disk.rel),
        mtime: disk.mtime,
        size: disk.size,
        title: disk.name.trim_end_matches(".md").to_string(),
        body: String::new(),
        links: Vec::new(),
        fill_depth: FILL_DEPTH_META,
    }
}

fn normalize_rel(path: &str) -> String {
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

fn worker_count(n: usize) -> usize {
    if n == 0 {
        return 1;
    }
    std::thread::available_parallelism()
        .map(|p| p.get())
        .unwrap_or(2)
        .clamp(1, FILL_READ_WORKERS_MAX)
        .min(n)
}

fn read_heads(files: &[DiskNote], indices: &[usize], head_chars: usize) -> Vec<(usize, String)> {
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

fn parent_id_for(rel: &str) -> Option<String> {
    rel.rsplit_once('/').map(|(p, _)| desk_node_id(p))
}

fn flush_note_batch(
    conn: &mut Connection,
    batch: &mut Vec<FillNote>,
    indexed: &mut i64,
    errors: &mut i64,
    written: &mut HashSet<String>,
) {
    if batch.is_empty() {
        return;
    }
    let started = Instant::now();
    let tx = match conn.unchecked_transaction() {
        Ok(t) => t,
        Err(_) => {
            *errors += batch.len() as i64;
            batch.clear();
            cooperate_after_write(started);
            return;
        }
    };
    let flush_err = (|| -> Result<(), String> {
        let mut meta = tx
            .prepare_cached(
                "INSERT INTO note_meta(id, path, name, kind, parent_id, mtime, size, content_hash, title, deleted, fill_depth)
                 VALUES (?1,?2,?3,'note',?4,?5,?6,NULL,?7,0,?8)
                 ON CONFLICT(id) DO UPDATE SET
                   path=excluded.path, name=excluded.name, parent_id=excluded.parent_id,
                   mtime=excluded.mtime, size=excluded.size,
                   title=excluded.title, deleted=0, fill_depth=excluded.fill_depth",
            )
            .map_err(|e| e.to_string())?;
        let mut fts_del = tx
            .prepare_cached("DELETE FROM note_fts WHERE note_id = ?1")
            .map_err(|e| e.to_string())?;
        let mut fts_ins = tx
            .prepare_cached("INSERT INTO note_fts(note_id, title, path, body) VALUES (?1,?2,?3,?4)")
            .map_err(|e| e.to_string())?;
        let mut link_del = tx
            .prepare_cached("DELETE FROM link_edge WHERE source_id = ?1")
            .map_err(|e| e.to_string())?;
        let mut link_ins = tx
            .prepare_cached(
                "INSERT OR IGNORE INTO link_edge(source_id, target_raw, target_norm, target_id)
                 VALUES (?1,?2,?3,NULL)",
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
                    note.fill_depth,
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
            if note.fill_depth > FILL_DEPTH_META || !note.links.is_empty() {
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
            if written.insert(note.id.clone()) {
                *indexed += 1;
            }
        }
        Ok(())
    })();
    if flush_err.is_err() || tx.commit().is_err() {
        *errors += batch.len() as i64;
        *indexed = (*indexed - batch.len() as i64).max(0);
    }
    batch.clear();
    cooperate_after_write(started);
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
        let _ = tx.execute("DELETE FROM tag_map WHERE note_id = ?1", params![id]);
        let _ = tx.execute("DELETE FROM link_edge WHERE source_id = ?1", params![id]);
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

fn emit(
    progress: &mut IndexFillProgress,
    phase: &str,
    search_state: &str,
    scanned: i64,
    indexed: i64,
    skipped: i64,
    errors: i64,
    message: Option<String>,
    on_progress: &mut impl FnMut(&IndexFillProgress),
) {
    progress.phase = phase.into();
    progress.search_state = search_state.into();
    progress.scanned = scanned;
    progress.indexed = indexed;
    progress.skipped = skipped;
    progress.errors = errors;
    progress.message = message;
    on_progress(progress);
}

/// Incremental disk → FTS5 fill. Compatibility wrapper (full deep pass).
pub fn fill_from_disk_on_conn(
    conn: &mut Connection,
    vault_root: &Path,
    head_chars: usize,
    force_rebuild: bool,
    db_path: &str,
    on_progress: impl FnMut(&IndexFillProgress),
) -> Result<IndexFillResult, String> {
    fill_from_disk_with_opts(
        conn,
        vault_root,
        FillOpts {
            deep_head_chars: head_chars.max(DEFAULT_SHORT_HEAD),
            short_head_chars: DEFAULT_SHORT_HEAD.min(head_chars.max(256)),
            force_rebuild,
            db_path,
            priority_rels: &[],
            until: FillUntil::Deep,
        },
        || false,
        on_progress,
    )
}

/// Phased fill: title seed → short heads → deep heads.
/// Desktop Partial/Deep emits `ready-meta` after the first title FTS batch
/// (not after cataloging every empty body). `is_cancelled` is checked
/// between batches so a remount can preempt.
pub fn fill_from_disk_with_opts(
    conn: &mut Connection,
    vault_root: &Path,
    opts: FillOpts<'_>,
    mut is_cancelled: impl FnMut() -> bool,
    mut on_progress: impl FnMut(&IndexFillProgress),
) -> Result<IndexFillResult, String> {
    ensure_fill_depth_column(conn);
    let _ = conn.execute_batch(
        "PRAGMA cache_size=-65536; PRAGMA temp_store=MEMORY; PRAGMA mmap_size=268435456;",
    );

    let existing = load_existing_notes(conn);
    let files = collect_md_notes(vault_root);
    let total = files.len() as i64;
    let short_head = opts.short_head_chars.clamp(256, 4_096);
    let deep_head = opts.deep_head_chars.clamp(short_head, 32_000);
    let target_depth = match opts.until {
        FillUntil::Meta => FILL_DEPTH_META,
        FillUntil::Partial => FILL_DEPTH_PARTIAL,
        FillUntil::Deep => FILL_DEPTH_DEEP,
    };

    let mut progress = IndexFillProgress {
        db_path: opts.db_path.to_string(),
        scanned: 0,
        total,
        indexed: 0,
        skipped: 0,
        errors: 0,
        phase: "walking".into(),
        message: Some(format!("Scanning {total} notes…")),
        search_state: String::new(),
    };
    on_progress(&progress);

    let mut indexed: i64 = 0;
    let mut skipped: i64 = 0;
    let mut errors: i64 = 0;
    let mut written: HashSet<String> = HashSet::new();
    let mut batch: Vec<FillNote> = Vec::with_capacity(META_BATCH);
    let mut seen: HashSet<String> = HashSet::with_capacity(files.len());
    let mut need_meta: Vec<usize> = Vec::new();
    let mut need_partial: Vec<usize> = Vec::new();
    let mut need_deep: Vec<usize> = Vec::new();
    let mut last_emit = Instant::now();
    let mut last_emitted_scanned: i64 = 0;

    emit(
        &mut progress,
        "meta",
        "",
        0,
        0,
        0,
        0,
        Some("Writing title/path catalog…".into()),
        &mut on_progress,
    );

    for (i, disk) in files.iter().enumerate() {
        if is_cancelled() {
            break;
        }
        seen.insert(disk.rel.clone());
        let scanned = (i as i64) + 1;
        let mut skip_meta = false;
        if !opts.force_rebuild {
            if let Some(prev) = existing.get(&disk.rel) {
                if note_unchanged(prev, disk) {
                    let depth = inferred_fill_depth(prev.fill_depth);
                    skip_meta = depth >= FILL_DEPTH_META;
                    if depth < FILL_DEPTH_PARTIAL && opts.until != FillUntil::Meta {
                        need_partial.push(i);
                    }
                    if depth < FILL_DEPTH_DEEP && opts.until == FillUntil::Deep {
                        need_deep.push(i);
                    }
                    if depth >= target_depth {
                        skipped += 1;
                    }
                }
            }
        }
        if skip_meta {
            if should_emit_progress(last_emit, last_emitted_scanned, scanned) {
                emit(
                    &mut progress,
                    "meta",
                    "",
                    scanned,
                    indexed,
                    skipped,
                    errors,
                    None,
                    &mut on_progress,
                );
                last_emit = Instant::now();
                last_emitted_scanned = scanned;
            }
            continue;
        }

        need_meta.push(i);
        if opts.until != FillUntil::Meta {
            need_partial.push(i);
        }
        if opts.until == FillUntil::Deep {
            need_deep.push(i);
        }
        if should_emit_progress(last_emit, last_emitted_scanned, scanned) {
            emit(
                &mut progress,
                "meta",
                "",
                scanned,
                indexed,
                skipped,
                errors,
                None,
                &mut on_progress,
            );
            last_emit = Instant::now();
            last_emitted_scanned = scanned;
        }
    }

    let ordered_meta = order_need_meta_for_title_seed(&files, &need_meta, opts.priority_rels);
    // Meta-only fills catalog every title. Desktop Partial/Deep seed a
    // searchable prefix, then jump to short heads (no 100k empty FTS).
    let seed_n = if opts.until == FillUntil::Meta {
        ordered_meta.len()
    } else {
        ordered_meta.len().min(TITLE_FTS_SEED)
    };
    let title_seed = &ordered_meta[..seed_n];

    last_emit = Instant::now();
    last_emitted_scanned = 0;
    for (n, &i) in title_seed.iter().enumerate() {
        if is_cancelled() {
            break;
        }
        batch.push(meta_fill_note(&files[i]));
        if batch.len() >= META_BATCH {
            flush_note_batch(conn, &mut batch, &mut indexed, &mut errors, &mut written);
        }
        let scanned = (n + 1) as i64;
        if should_emit_progress(last_emit, last_emitted_scanned, scanned) {
            emit(
                &mut progress,
                "meta",
                "ready-meta",
                scanned,
                indexed,
                skipped,
                errors,
                None,
                &mut on_progress,
            );
            last_emit = Instant::now();
            last_emitted_scanned = scanned;
        }
    }
    flush_note_batch(conn, &mut batch, &mut indexed, &mut errors, &mut written);
    if !title_seed.is_empty() {
        emit(
            &mut progress,
            "meta",
            "ready-meta",
            title_seed.len() as i64,
            indexed,
            skipped,
            errors,
            Some("Title/path search seeded…".into()),
            &mut on_progress,
        );
    }

    // Title search is live enough for Open to settle — do not wait for
    // the rest of the vault (or any note heads).
    emit(
        &mut progress,
        "ready-meta",
        "ready-meta",
        if opts.until == FillUntil::Meta {
            total
        } else {
            title_seed.len() as i64
        },
        indexed,
        skipped,
        errors,
        Some("Title/path search ready".into()),
        &mut on_progress,
    );

    let _ = remove_stale_notes(conn, &existing, &seen);

    if is_cancelled() || opts.until == FillUntil::Meta {
        let edges = finalize_link_edges(conn, skipped, indexed, false, &mut progress);
        let _ = conn.execute_batch("PRAGMA wal_checkpoint(PASSIVE);");
        return Ok(IndexFillResult {
            indexed,
            skipped,
            errors,
            notes: total,
            edges,
            search_state: "ready-meta".into(),
        });
    }

    let rels: Vec<String> = files.iter().map(|f| f.rel.clone()).collect();
    let pri_order = order_indices_for_fill(&rels, opts.priority_rels);
    let pri_rank: HashMap<usize, usize> =
        pri_order.iter().enumerate().map(|(r, i)| (*i, r)).collect();
    need_partial.sort_by_key(|i| pri_rank.get(i).copied().unwrap_or(usize::MAX));
    need_deep.sort_by_key(|i| pri_rank.get(i).copied().unwrap_or(usize::MAX));

    last_emit = Instant::now();
    last_emitted_scanned = 0;
    let partial_total = need_partial.len() as i64;
    emit(
        &mut progress,
        "fts-partial",
        "ready-meta",
        0,
        indexed,
        skipped,
        errors,
        Some("Filling short note heads…".into()),
        &mut on_progress,
    );

    let mut phase_scanned: i64 = 0;
    for chunk in need_partial.chunks(READ_CHUNK) {
        if is_cancelled() {
            break;
        }
        let io_started = Instant::now();
        let heads = read_heads(&files, chunk, short_head);
        cooperate_after_io(io_started);
        for (i, body) in heads {
            let disk = &files[i];
            batch.push(FillNote {
                id: desk_node_id(&disk.rel),
                path: disk.rel.clone(),
                name: disk.name.clone(),
                parent_id: parent_id_for(&disk.rel),
                mtime: disk.mtime,
                size: disk.size,
                title: title_from_name_and_head(&disk.name, &body),
                links: extract_wikilink_targets(&body),
                body,
                fill_depth: FILL_DEPTH_PARTIAL,
            });
            if batch.len() >= FTS_WRITE_BATCH {
                flush_note_batch(conn, &mut batch, &mut indexed, &mut errors, &mut written);
            }
        }
        phase_scanned += chunk.len() as i64;
        if should_emit_progress(last_emit, last_emitted_scanned, phase_scanned) {
            emit(
                &mut progress,
                "fts-partial",
                "ready-meta",
                phase_scanned.min(partial_total),
                indexed,
                skipped,
                errors,
                Some("Filling short note heads…".into()),
                &mut on_progress,
            );
            last_emit = Instant::now();
            last_emitted_scanned = phase_scanned;
        }
    }
    flush_note_batch(conn, &mut batch, &mut indexed, &mut errors, &mut written);
    emit(
        &mut progress,
        "ready-fts-partial",
        "ready-fts-partial",
        total,
        indexed,
        skipped,
        errors,
        Some("Short-head search ready".into()),
        &mut on_progress,
    );

    if is_cancelled() || opts.until == FillUntil::Partial {
        let edges = finalize_link_edges(conn, skipped, indexed, true, &mut progress);
        let _ = conn.execute_batch("PRAGMA wal_checkpoint(PASSIVE);");
        return Ok(IndexFillResult {
            indexed,
            skipped,
            errors,
            notes: total,
            edges,
            search_state: "ready-fts-partial".into(),
        });
    }

    last_emit = Instant::now();
    last_emitted_scanned = 0;
    let deep_total = need_deep.len() as i64;
    emit(
        &mut progress,
        "fts",
        "ready-fts-partial",
        0,
        indexed,
        skipped,
        errors,
        Some("Deepening FTS heads…".into()),
        &mut on_progress,
    );

    let mut deep_scanned: i64 = 0;
    for chunk in need_deep.chunks(READ_CHUNK) {
        if is_cancelled() {
            break;
        }
        let io_started = Instant::now();
        let heads = read_heads(&files, chunk, deep_head);
        cooperate_after_io(io_started);
        for (i, body) in heads {
            let disk = &files[i];
            batch.push(FillNote {
                id: desk_node_id(&disk.rel),
                path: disk.rel.clone(),
                name: disk.name.clone(),
                parent_id: parent_id_for(&disk.rel),
                mtime: disk.mtime,
                size: disk.size,
                title: title_from_name_and_head(&disk.name, &body),
                links: extract_wikilink_targets(&body),
                body,
                fill_depth: FILL_DEPTH_DEEP,
            });
            if batch.len() >= FTS_WRITE_BATCH {
                flush_note_batch(conn, &mut batch, &mut indexed, &mut errors, &mut written);
            }
        }
        deep_scanned += chunk.len() as i64;
        if should_emit_progress(last_emit, last_emitted_scanned, deep_scanned) {
            emit(
                &mut progress,
                "fts",
                "ready-fts-partial",
                deep_scanned.min(deep_total),
                indexed,
                skipped,
                errors,
                None,
                &mut on_progress,
            );
            last_emit = Instant::now();
            last_emitted_scanned = deep_scanned;
        }
    }
    flush_note_batch(conn, &mut batch, &mut indexed, &mut errors, &mut written);

    // PASSIVE never waits for writers; never TRUNCATE (that hung Tower after 100k rows).
    let _ = conn.execute_batch("PRAGMA wal_checkpoint(PASSIVE);");

    let search_state = if is_cancelled() {
        "ready-fts-partial"
    } else {
        "ready-fts"
    };
    let edges = finalize_link_edges(conn, skipped, indexed, true, &mut progress);
    let result = IndexFillResult {
        indexed,
        skipped,
        errors,
        notes: total,
        edges,
        search_state: search_state.into(),
    };
    emit(
        &mut progress,
        if is_cancelled() {
            "ready-fts-partial"
        } else {
            "done"
        },
        search_state,
        total,
        indexed,
        skipped,
        errors,
        Some(if is_cancelled() {
            "Index fill cancelled".into()
        } else {
            "SQLite FTS5 BM25 ready".into()
        }),
        &mut on_progress,
    );
    Ok(result)
}

#[cfg(test)]
mod tests {
    use super::*;
    use rusqlite::Connection;
    use std::fs;
    use std::io::Write;
    use std::path::{Path, PathBuf};

    const TEST_DDL: &str = r#"
CREATE TABLE IF NOT EXISTS meta_kv (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
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
CREATE TABLE IF NOT EXISTS link_edge (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source_id TEXT NOT NULL,
  target_raw TEXT NOT NULL,
  target_norm TEXT NOT NULL,
  target_id TEXT,
  UNIQUE (source_id, target_norm)
);
CREATE TABLE IF NOT EXISTS tag_map (
  tag TEXT NOT NULL,
  note_id TEXT NOT NULL,
  PRIMARY KEY (tag, note_id)
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
        let base =
            std::env::temp_dir().join(format!("nexus-fill-{label}-{}-{stamp}", std::process::id()));
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

    fn fill_until(
        conn: &mut Connection,
        vault: &Path,
        force: bool,
        until: FillUntil,
        priority: &[String],
    ) -> (IndexFillResult, Vec<IndexFillProgress>) {
        let mut ticks = Vec::new();
        let result = fill_from_disk_with_opts(
            conn,
            vault,
            FillOpts {
                deep_head_chars: 8000,
                short_head_chars: 768,
                force_rebuild: force,
                db_path: "test.sqlite",
                priority_rels: priority,
                until,
            },
            || false,
            |p| ticks.push(p.clone()),
        )
        .unwrap();
        (result, ticks)
    }

    fn fill(
        conn: &mut Connection,
        vault: &Path,
        force: bool,
    ) -> (IndexFillResult, Vec<IndexFillProgress>) {
        fill_until(conn, vault, force, FillUntil::Deep, &[])
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

    fn open_reader(db: &Path) -> Connection {
        let conn = Connection::open(db).unwrap();
        let _ = conn.busy_timeout(Duration::from_millis(2_000));
        conn
    }

    fn fts_row_count_at(db: &Path) -> i64 {
        open_reader(db)
            .query_row("SELECT COUNT(*) FROM note_fts", [], |r| r.get(0))
            .unwrap_or(0)
    }

    fn fts_has_at(db: &Path, query: &str) -> bool {
        fts_has(&open_reader(db), query)
    }

    fn fts_match_count_at(db: &Path, query: &str) -> i64 {
        open_reader(db)
            .query_row(
                "SELECT COUNT(*) FROM note_fts WHERE note_fts MATCH ?1",
                params![query],
                |r| r.get(0),
            )
            .unwrap_or(0)
    }

    /// Same titles/paths as `noteTitleForIndex` / `notePathForIndex` in
    /// `src/lib/vault/synthetic-vault.ts` (official soak / SOAK-MANIFEST).
    fn write_official_shaped(vault: &Path, n: usize) {
        const ROOTS: [&str; 7] = [
            "00-Inbox",
            "10-Projects",
            "20-Areas",
            "30-Resources",
            "40-Archive",
            "50-Daily",
            "60-Systems",
        ];
        for i in 0..n {
            let title = if i % 200 == 0 {
                format!("Hub {i}")
            } else {
                format!("Topic {i}")
            };
            let root = ROOTS[i % ROOTS.len()];
            let bucket = format!("{:02}", (i / ROOTS.len()) % 20);
            write_note(
                vault,
                &format!("{root}/{bucket}/{title}.md"),
                &format!("# {title}\n\nCluster hub retrieval\n"),
            );
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
    fn extract_wikilinks_skips_code_and_parses_aliases() {
        let body = "# Hub\nSee [[Topic 1]] and [[Folder/Note.md|Alias]].\n`[[code]]`\n```\n[[fenced]]\n```\n[[Topic 1#Overview]]\n";
        let got = extract_wikilink_targets(body);
        assert_eq!(
            got,
            vec!["Topic 1".to_string(), "Folder/Note.md".to_string()]
        );
        assert_eq!(normalize_link_target("Folder/Note.md"), "folder/note");
        assert_eq!(normalize_link_target("Topic 1"), "topic 1");
    }

    #[test]
    fn title_prefers_heading() {
        assert_eq!(
            title_from_name_and_head("file.md", "# Real Title\n\nbody"),
            "Real Title"
        );
        assert_eq!(title_from_name_and_head("stem.md", "no heading"), "stem");
    }

    #[test]
    fn priority_rels_sort_visible_folder_first() {
        let rels = vec![
            "zz/late.md".into(),
            "Inbox/now.md".into(),
            "aa/other.md".into(),
        ];
        let order = order_indices_for_fill(&rels, &["Inbox".into()]);
        assert_eq!(order[0], 1);
        assert_eq!(order[1], 0);
    }

    #[test]
    fn title_seed_hot_name_matches_hub_stems() {
        assert!(is_title_seed_hot_name("Hub 200.md"));
        assert!(is_title_seed_hot_name("hub.md"));
        assert!(is_title_seed_hot_name("Daily Hub.md"));
        assert!(!is_title_seed_hot_name("Topic 1.md"));
        assert!(!is_title_seed_hot_name("cluster.md"));
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
        assert_eq!(first.search_state, "ready-fts");
        assert!(ticks
            .iter()
            .any(|p| p.phase == "ready-meta" && p.total == 3));
        assert!(ticks.iter().any(|p| p.phase == "ready-fts-partial"));
        assert_eq!(ticks.last().map(|p| p.phase.as_str()), Some("done"));
        assert!(
            fts_has(&conn, "retrieval"),
            "cold fill must FTS index heads"
        );

        let (second, _) = fill(&mut conn, &vault, false);
        assert_eq!(second.notes, 3);
        assert_eq!(
            second.indexed, 0,
            "reopen must skip unchanged path+mtime+size"
        );
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
    fn meta_phase_indexes_titles_not_bodies() {
        let (vault, db) = temp_pair("meta");
        write_note(&vault, "Hub.md", "secretbodytoken cluster retrieval\n");
        write_note(&vault, "plain.md", "secretbodytoken\n");
        let mut conn = open_test_conn(&db);
        let (meta, ticks) = fill_until(&mut conn, &vault, false, FillUntil::Meta, &[]);
        assert_eq!(meta.notes, 2);
        assert_eq!(meta.search_state, "ready-meta");
        assert!(ticks.iter().any(|p| p.phase == "ready-meta"));
        assert!(!ticks.iter().any(|p| p.phase == "done"));
        assert!(fts_has(&conn, "Hub"), "title/path FTS after meta");
        assert!(
            !fts_has(&conn, "secretbodytoken"),
            "body tokens must wait for head fill"
        );

        let (partial, _) = fill_until(&mut conn, &vault, false, FillUntil::Partial, &[]);
        assert_eq!(partial.search_state, "ready-fts-partial");
        assert!(fts_has(&conn, "secretbodytoken"));
        assert!(fts_has(&conn, "cluster"));

        let _ = fs::remove_dir_all(vault.parent().unwrap());
    }

    #[test]
    fn ready_meta_after_title_seed_not_full_empty_fts() {
        let (vault, db) = temp_pair("seed");
        write_n(&vault, 2_500);
        write_note(
            &vault,
            "zz-late/Hub.md",
            "secretbodytoken cluster retrieval\n",
        );
        let mut conn = open_test_conn(&db);
        let mut ready_meta_fts: Option<i64> = None;
        let mut hub_at_ready = false;
        let mut cluster_at_ready = false;
        let mut fts_when_heads_started: Option<i64> = None;
        let result = fill_from_disk_with_opts(
            &mut conn,
            &vault,
            FillOpts {
                deep_head_chars: 8000,
                short_head_chars: 768,
                force_rebuild: false,
                db_path: "test.sqlite",
                priority_rels: &[],
                until: FillUntil::Partial,
            },
            || false,
            |p| {
                if p.phase == "ready-meta" && ready_meta_fts.is_none() {
                    ready_meta_fts = Some(fts_row_count_at(&db));
                    hub_at_ready = fts_has_at(&db, "Hub");
                    cluster_at_ready = fts_has_at(&db, "cluster");
                }
                if p.phase == "fts-partial" && fts_when_heads_started.is_none() {
                    fts_when_heads_started = Some(fts_row_count_at(&db));
                }
            },
        )
        .unwrap();

        let seeded = ready_meta_fts.expect("ready-meta must emit");
        assert!(
            seeded > 0 && seeded <= TITLE_FTS_SEED as i64,
            "ready-meta FTS rows {seeded} should be a title seed, not the full vault"
        );
        assert!(
            hub_at_ready,
            "Hub.md must be in the title seed even if it walks last"
        );
        assert!(
            !cluster_at_ready,
            "body tokens must not wait behind a full empty catalog — and must not be present at ready-meta"
        );
        let heads_start = fts_when_heads_started.expect("fts-partial must start");
        assert!(
            heads_start <= TITLE_FTS_SEED as i64,
            "short-head fill started after {heads_start} FTS rows — catalog still monopolizing"
        );
        assert_eq!(result.search_state, "ready-fts-partial");
        assert!(fts_has(&conn, "cluster"));
        assert!(fts_has(&conn, "secretbodytoken"));
        assert_eq!(note_count(&conn), 2_501);

        let _ = fs::remove_dir_all(vault.parent().unwrap());
    }

    #[test]
    fn official_hub_titles_searchable_at_ready_meta() {
        let (vault, db) = temp_pair("official-hub");
        // 16 official Hub titles (every 200) plus enough Topics to exceed the seed.
        write_official_shaped(&vault, 3_200);
        let mut conn = open_test_conn(&db);
        let mut hub_hits_at_ready: Option<i64> = None;
        let mut seeded: Option<i64> = None;
        let result = fill_from_disk_with_opts(
            &mut conn,
            &vault,
            FillOpts {
                deep_head_chars: 8000,
                short_head_chars: 768,
                force_rebuild: false,
                db_path: "test.sqlite",
                priority_rels: &[],
                until: FillUntil::Partial,
            },
            || false,
            |p| {
                if p.phase == "ready-meta" && hub_hits_at_ready.is_none() {
                    seeded = Some(fts_row_count_at(&db));
                    hub_hits_at_ready = Some(fts_match_count_at(&db, "hub"));
                }
            },
        )
        .unwrap();

        let hits = hub_hits_at_ready.expect("ready-meta must emit");
        let seed = seeded.expect("seeded FTS count");
        assert!(
            seed > 0 && seed <= TITLE_FTS_SEED as i64,
            "official ready-meta FTS rows {seed} should be the title seed"
        );
        assert!(
            hits >= 16,
            "official Hub N.md titles must be MATCH 'hub' ≥16 at ready-meta, got {hits}"
        );
        assert_eq!(result.search_state, "ready-fts-partial");
        assert!(fts_has(&conn, "cluster"));

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
            ticks.len() >= 3,
            "meta + ready-meta + later phases, got {}",
            ticks.len()
        );
        // Intra-phase ticks are time-gated (400ms) so a tiny vault may only
        // emit phase transitions — that is intentional (UI must not re-render
        // at 10–20Hz during a 100k fill).
        assert!(ticks.iter().any(|p| p.phase == "ready-meta"));
        assert!(ticks.iter().any(|p| p.phase == "ready-fts-partial" || p.phase == "done"));
        let (second, ticks2) = fill(&mut conn, &vault, false);
        assert_eq!(second.skipped, 80);
        assert_eq!(second.indexed, 0);
        assert!(ticks2.iter().any(|p| p.skipped >= 64 || p.phase == "done"));

        let _ = fs::remove_dir_all(vault.parent().unwrap());
    }

    #[test]
    fn cooperative_fill_limits_leave_room_for_ui() {
        assert!(
            FTS_WRITE_BATCH <= 128,
            "FTS write batch {FTS_WRITE_BATCH} re-creates multi-second WAL locks"
        );
        assert!(
            READ_CHUNK <= 128,
            "read chunk {READ_CHUNK} saturates disk ahead of note open"
        );
        assert!(
            FILL_YIELD_MS >= 2,
            "fill must yield after a real write batch"
        );
        assert!(
            FILL_READ_WORKERS_MAX <= 2,
            "head readers must not take every core/disk queue"
        );
        assert_eq!(worker_count(1), 1);
        assert_eq!(worker_count(10_000), FILL_READ_WORKERS_MAX);
        assert!(PROGRESS_EMIT_MS >= 250);
    }

    #[test]
    fn fill_write_locks_stay_short_for_concurrent_readers() {
        // 3 FTS write batches of short heads. A reader with a 300ms busy
        // timeout must keep succeeding — 1024-row FTS txs used to block
        // search/upsert for seconds (UI hitch).
        let (vault, db) = temp_pair("coop-lock");
        write_n(&vault, 360);
        let mut conn = open_test_conn(&db);
        let db_reader = db.clone();
        let stop = std::sync::Arc::new(std::sync::atomic::AtomicBool::new(false));
        let stop2 = stop.clone();
        let worst = std::sync::Arc::new(std::sync::atomic::AtomicU64::new(0));
        let worst2 = worst.clone();
        let busy = std::sync::Arc::new(std::sync::atomic::AtomicU64::new(0));
        let busy2 = busy.clone();
        let reader = std::thread::spawn(move || {
            let rconn = open_reader(&db_reader);
            let _ = rconn.busy_timeout(Duration::from_millis(300));
            while !stop2.load(std::sync::atomic::Ordering::Relaxed) {
                let t0 = Instant::now();
                let ok = rconn
                    .query_row(
                        "SELECT COUNT(*) FROM note_fts WHERE note_fts MATCH 'cluster'",
                        [],
                        |row| row.get::<_, i64>(0),
                    )
                    .is_ok();
                let ms = t0.elapsed().as_millis() as u64;
                worst2.fetch_max(ms, std::sync::atomic::Ordering::Relaxed);
                if !ok {
                    busy2.fetch_add(1, std::sync::atomic::Ordering::Relaxed);
                }
                std::thread::sleep(Duration::from_millis(4));
            }
        });

        let (result, ticks) = fill_until(&mut conn, &vault, false, FillUntil::Partial, &[]);
        stop.store(true, std::sync::atomic::Ordering::Relaxed);
        let _ = reader.join();
        let worst_ms = worst.load(std::sync::atomic::Ordering::Relaxed);
        let busy_hits = busy.load(std::sync::atomic::Ordering::Relaxed);
        assert_eq!(result.notes, 360);
        assert!(ticks.iter().any(|p| p.phase == "ready-meta"));
        assert_eq!(result.search_state, "ready-fts-partial");
        assert!(
            fts_has(&conn, "cluster"),
            "short heads must still land for body search"
        );
        assert_eq!(
            busy_hits, 0,
            "reader hit SQLITE_BUSY {busy_hits} times — write lock too long"
        );
        assert!(
            worst_ms < 300,
            "concurrent FTS MATCH waited {worst_ms}ms — UI would hitch"
        );

        let _ = fs::remove_dir_all(vault.parent().unwrap());
    }

    fn edge_count(conn: &Connection) -> i64 {
        conn.query_row("SELECT COUNT(*) FROM link_edge", [], |r| r.get(0))
            .unwrap_or(0)
    }

    fn has_edge(conn: &Connection, source: &str, norm: &str) -> bool {
        conn.query_row(
            "SELECT COUNT(*) FROM link_edge WHERE source_id = ?1 AND target_norm = ?2",
            params![source, norm],
            |r| r.get::<_, i64>(0),
        )
        .unwrap_or(0)
            > 0
    }

    #[test]
    fn fill_persists_wikilink_edges_without_js_bodies() {
        let (vault, db) = temp_pair("links");
        write_note(
            &vault,
            "Hub.md",
            "See [[Topic 1]] and [[cluster]].\n`[[ignored]]`\n",
        );
        write_note(&vault, "Topic 1.md", "Back to [[Hub]].\n");
        write_note(&vault, "cluster.md", "plain\n");
        let mut conn = open_test_conn(&db);

        let (first, _) = fill(&mut conn, &vault, false);
        assert_eq!(first.notes, 3);
        assert!(first.edges >= 3, "cold fill must persist resolvable edges");
        assert!(has_edge(&conn, "desk_Hub.md", "topic 1"));
        assert!(has_edge(&conn, "desk_Hub.md", "cluster"));
        assert_eq!(desk_node_id("Topic 1.md"), "desk_Topic_1.md");
        assert!(has_edge(&conn, "desk_Topic_1.md", "hub"));

        let (second, _) = fill(&mut conn, &vault, false);
        assert_eq!(second.indexed, 0);
        assert_eq!(second.skipped, 3);
        assert_eq!(
            second.edges, first.edges,
            "incremental skip must keep edges"
        );

        let _ = fs::remove_dir_all(vault.parent().unwrap());
    }

    #[test]
    fn warm_fts_without_edges_is_backfilled() {
        let (vault, db) = temp_pair("backfill");
        write_note(&vault, "A.md", "See [[B]].\n");
        write_note(&vault, "B.md", "See [[A]].\n");
        let mut conn = open_test_conn(&db);
        let (first, _) = fill(&mut conn, &vault, false);
        assert!(first.edges >= 2);

        // Simulate a pre-patch index: FTS present, link_edge empty, flag missing.
        conn.execute_batch(
            "DELETE FROM link_edge; DELETE FROM meta_kv WHERE key = 'links_indexed';",
        )
        .unwrap();
        assert_eq!(edge_count(&conn), 0);

        let (second, _) = fill(&mut conn, &vault, false);
        assert_eq!(second.indexed, 0, "unchanged files stay skipped");
        assert!(
            second.edges >= 2,
            "one-shot FTS backfill must seed link_edge"
        );
        assert!(has_edge(&conn, "desk_A.md", "b"));
        assert!(has_edge(&conn, "desk_B.md", "a"));

        let _ = fs::remove_dir_all(vault.parent().unwrap());
    }

    fn write_n(vault: &Path, n: usize) {
        for i in 0..n {
            write_note(
                vault,
                &format!("n{i:05}.md"),
                &format!("# Note {i}\n\nCluster hub retrieval token {i}\n"),
            );
        }
    }

    #[test]
    fn first_open_timing_budget_1k() {
        let (vault, db) = temp_pair("t1k");
        write_n(&vault, 1000);
        let mut conn = open_test_conn(&db);
        let t0 = Instant::now();
        let (meta, _) = fill_until(&mut conn, &vault, false, FillUntil::Meta, &[]);
        let meta_ms = t0.elapsed().as_millis();
        assert_eq!(meta.notes, 1000);
        assert!(
            fts_has(&conn, "n00000"),
            "meta pass must FTS-index the filename/path"
        );
        assert!(
            meta_ms < 2_500,
            "1k meta catalog {meta_ms}ms exceeds 2500ms CI budget"
        );

        let t1 = Instant::now();
        let (partial, _) = fill_until(&mut conn, &vault, false, FillUntil::Partial, &[]);
        let partial_ms = t1.elapsed().as_millis();
        assert!(fts_has(&conn, "cluster"));
        assert!(
            partial_ms < 6_000,
            "1k short-head FTS {partial_ms}ms exceeds 6000ms CI budget"
        );
        assert_eq!(partial.search_state, "ready-fts-partial");

        let _ = fs::remove_dir_all(vault.parent().unwrap());
    }

    #[test]
    fn first_open_timing_budget_10k() {
        let (vault, db) = temp_pair("t10k");
        write_n(&vault, 10_000);
        let mut conn = open_test_conn(&db);
        let t0 = Instant::now();
        let mut ready_meta_ms: Option<u128> = None;
        let mut fts_at_ready: Option<i64> = None;
        let partial = fill_from_disk_with_opts(
            &mut conn,
            &vault,
            FillOpts {
                deep_head_chars: 8000,
                short_head_chars: 768,
                force_rebuild: false,
                db_path: "test.sqlite",
                priority_rels: &[],
                until: FillUntil::Partial,
            },
            || false,
            |p| {
                if p.phase == "ready-meta" && ready_meta_ms.is_none() {
                    ready_meta_ms = Some(t0.elapsed().as_millis());
                    fts_at_ready = Some(fts_row_count_at(&db));
                }
            },
        )
        .unwrap();
        let partial_ms = t0.elapsed().as_millis();
        let meta_ms = ready_meta_ms.expect("ready-meta must emit");
        let seeded = fts_at_ready.expect("seeded FTS count");
        assert_eq!(partial.notes, 10_000);
        assert!(
            seeded > 0 && seeded <= TITLE_FTS_SEED as i64,
            "10k ready-meta FTS rows {seeded} must be the title seed"
        );
        assert!(
            meta_ms < 8_000,
            "10k title-seed ready-meta {meta_ms}ms exceeds 8000ms CI budget"
        );
        assert!(fts_has(&conn, "retrieval"));
        assert!(fts_has(&conn, "cluster"));
        assert!(
            partial_ms < 45_000,
            "10k short-head FTS {partial_ms}ms exceeds 45000ms CI budget"
        );
        assert_eq!(partial.search_state, "ready-fts-partial");
        eprintln!(
            "10k desktop Partial: ready-meta {meta_ms}ms (FTS seed {seeded}), short-head total {partial_ms}ms"
        );

        let _ = fs::remove_dir_all(vault.parent().unwrap());
    }

    /// Local soak probe — not CI. `cargo test -p nexus-fill-test -- --ignored --nocapture`
    /// with `NEXUS_FILL_PROBE_N` (default 25000).
    #[test]
    #[ignore]
    fn cold_open_title_seed_probe_not_ci() {
        let n: usize = std::env::var("NEXUS_FILL_PROBE_N")
            .ok()
            .and_then(|s| s.parse().ok())
            .unwrap_or(25_000);
        let (vault, db) = temp_pair("probe");
        write_n(&vault, n);
        write_note(
            &vault,
            "zz-late/Hub.md",
            "secretbodytoken cluster retrieval\n",
        );
        let mut conn = open_test_conn(&db);
        let t0 = Instant::now();
        let mut ready_meta_ms: Option<u128> = None;
        let mut hub_ms: Option<u128> = None;
        let mut cluster_ms: Option<u128> = None;
        let mut seeded: Option<i64> = None;
        let result = fill_from_disk_with_opts(
            &mut conn,
            &vault,
            FillOpts {
                deep_head_chars: 8000,
                short_head_chars: 768,
                force_rebuild: false,
                db_path: "test.sqlite",
                priority_rels: &[],
                until: FillUntil::Partial,
            },
            || false,
            |p| {
                if p.phase == "ready-meta" && ready_meta_ms.is_none() {
                    ready_meta_ms = Some(t0.elapsed().as_millis());
                    seeded = Some(fts_row_count_at(&db));
                    if fts_has_at(&db, "Hub") {
                        hub_ms = Some(t0.elapsed().as_millis());
                    }
                }
                if cluster_ms.is_none()
                    && (p.phase == "fts-partial" || p.phase == "ready-fts-partial")
                {
                    if fts_has_at(&db, "cluster") {
                        cluster_ms = Some(t0.elapsed().as_millis());
                    }
                }
            },
        )
        .unwrap();
        eprintln!(
            "probe n={} notes={} ready-meta {:?}ms seed {:?} hub {:?}ms cluster {:?}ms total {}ms state {}",
            n,
            result.notes,
            ready_meta_ms,
            seeded,
            hub_ms,
            cluster_ms,
            t0.elapsed().as_millis(),
            result.search_state
        );
        assert!(ready_meta_ms.is_some());
        assert!(
            hub_ms.is_some(),
            "Hub title must be searchable at ready-meta"
        );
        assert!(cluster_ms.is_some(), "cluster must land during short heads");
        let _ = fs::remove_dir_all(vault.parent().unwrap());
    }
}
