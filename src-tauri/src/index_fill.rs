//! Phased SQLite FTS5 fill from a vault folder.
//!
//! Cold open must not wait for a full body index before title search.
//! Desktop commits title/path FTS rows as each directory batch lands and
//! emits `ready-meta` when the interactive title window is in, before the
//! rest of the folder is listed. `FillUntil::Partial`
//! then reads short heads. `FillUntil::Deep` (the desktop path) reads note
//! text only for a bounded window: the priority open set, or the first
//! page of the walk when no priority was passed, never more than
//! `EAGER_CONTENT_CAP` files. A later fill reads that same window again
//! only where it is still shallow. Notes outside the window stay on their
//! title until something opens them. `FillUntil::Meta` catalogs titles
//! only. No Tauri imports — also compiled by `src-tauri/fill-test`.
//!
//! Mid-fill UI (tree / note open / graph) must stay interactive: small WAL
//! write batches, at most four head readers, a yield after a real write,
//! and time-gated progress. The next head chunk is read while the previous
//! chunk is committed.

use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use std::cell::{Cell, RefCell};
use std::collections::{BTreeSet, HashMap, HashSet};
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
/// FTS writes hold the WAL writer lock. Rows are replaced by `rowid` (see
/// `note_fts_row`), so a few hundred per commit stays short for readers.
pub const FTS_WRITE_BATCH: usize = 512;
pub const READ_CHUNK: usize = 512;
/// Sleep after a write that actually took work, so the WebView and note
/// reads can sneak in on Linux desktop during a 100k fill.
pub const FILL_YIELD_MS: u64 = 4;
/// Head readers share the disk with `readNote` / tree clicks. More than a
/// handful of workers saturated Linux I/O and froze interaction.
pub const FILL_READ_WORKERS_MAX: usize = 4;
/// Hot-name titles still sort first if a batch is only partially flushed.
/// The walk itself now writes a title row for every new path.
pub const TITLE_FTS_SEED: usize = 2048;
/// Titles committed before search is announced. The cap does not grow with
/// the vault. The rest of the folder is listed afterward, with a hard yield
/// between batches, and that listing is not the interactive path.
pub const TITLE_INTERACTIVE_CAP: usize = 512;
/// First title commit. Small enough that cold open can search before the
/// rest of a directory is stated. Folder names are visited in order, so
/// `00-Inbox` lands in this batch.
pub const TITLE_READY_FLUSH: usize = 32;
/// Sleep between title batches after the interactive window. Long enough
/// that note open, scroll, and the graph can use the disk.
pub const DISCOVER_TAIL_YIELD_MS: u64 = 32;
/// Names read from one directory after Ready, before the fill yields.
/// The rest of a fat folder is not scanned in that same pass.
const POST_READY_DIR_BATCH: usize = 16;
/// Passive checkpoint during the title tail. The journal must not grow with
/// the vault, or search and the tree slow down the longer the listing runs.
pub const TAIL_CHECKPOINT_EVERY: i64 = 2048;
/// Short heads committed while the directory walk is still running.
/// Root notes first, so the open page has tags before the vault is listed.
/// Once this many notes already have a head, later opens do not peek further.
pub const EARLY_HEAD_CAP: usize = 256;
/// Path and title rows committed during the walk so the tree and title
/// search grow before it finishes.
const DISCOVER_BATCH: usize = 512;
/// Deep fill reads at most this many note bodies after titles. The window
/// does not grow with the vault, and a later fill does not advance into
/// the notes past it.
pub const EAGER_CONTENT_CAP: usize = 512;
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
    tags: Vec<String>,
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

fn tag_token_ok(token: &str) -> bool {
    let mut chars = token.chars();
    match chars.next() {
        Some(c) if c.is_ascii_alphabetic() => {}
        _ => return false,
    }
    token.len() <= 49
        && token
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || matches!(c, '_' | '/' | '-'))
}

/// Tags from a file head: frontmatter `tags:` plus `#tag` outside code.
/// Same rough rules as TS `extractTagsFromMarkdown`.
pub fn extract_tags(markdown: &str) -> Vec<String> {
    let stripped = strip_code_for_link_scan(markdown);
    let mut tags = BTreeSet::new();
    if let Some(rest) = stripped.strip_prefix("---") {
        if let Some(end) = rest.find("\n---") {
            let block = &rest[..end];
            for line in block.lines() {
                let trimmed = line.trim();
                let lower = trimmed.to_ascii_lowercase();
                if !lower.starts_with("tags:") {
                    continue;
                }
                let raw = trimmed.split_once(':').map(|(_, v)| v.trim()).unwrap_or("");
                for part in raw.split(|c: char| {
                    c == ',' || c == '[' || c == ']' || c.is_whitespace()
                }) {
                    let t = part.trim_matches(|c: char| c == '"' || c == '\'' || c == '#');
                    if tag_token_ok(t) {
                        tags.insert(t.to_ascii_lowercase());
                    }
                }
            }
        }
    }
    let chars: Vec<char> = stripped.chars().collect();
    let mut i = 0;
    while i < chars.len() {
        if chars[i] == '#' {
            let prev_ok = i == 0
                || chars[i - 1].is_whitespace()
                || matches!(chars[i - 1], '(' | '[' | '{');
            if prev_ok && i + 1 < chars.len() && chars[i + 1].is_ascii_alphabetic() {
                let mut buf = String::new();
                let mut j = i + 1;
                while j < chars.len()
                    && buf.len() < 49
                    && (chars[j].is_ascii_alphanumeric() || matches!(chars[j], '_' | '/' | '-'))
                {
                    buf.push(chars[j]);
                    j += 1;
                }
                if tag_token_ok(&buf) {
                    tags.insert(buf.to_ascii_lowercase());
                }
                i = j;
                continue;
            }
        }
        i += 1;
    }
    tags.into_iter().collect()
}

fn replace_note_tags(conn: &Connection, id: &str, tags: &[String]) -> Result<(), String> {
    conn.execute("DELETE FROM tag_map WHERE note_id = ?1", params![id])
        .map_err(|e| e.to_string())?;
    for tag in tags {
        if !tag_token_ok(tag) {
            continue;
        }
        conn.execute(
            "INSERT OR IGNORE INTO tag_map(tag, note_id) VALUES (?1,?2)",
            params![tag, id],
        )
        .map_err(|e| e.to_string())?;
    }
    Ok(())
}

/// How far the links pass has read. `complete` once every note row up to the
/// newest one has had its links and tags read.
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct LinkCoverage {
    pub scanned: i64,
    pub total: i64,
    pub complete: bool,
}

pub const LINKS_CURSOR_KEY: &str = "links_cursor";
pub const LINKS_SEEN_KEY: &str = "links_seen";
/// Notes read per transaction. Small, so a UI write waits a few milliseconds.
pub const LINKS_PASS_BATCH: usize = 400;
/// Larger files are read up to this size; links past it are not listed.
const LINKS_PASS_MAX_BYTES: u64 = 512 * 1024;

fn meta_i64(conn: &Connection, key: &str) -> i64 {
    conn.query_row("SELECT value FROM meta_kv WHERE key = ?1", params![key], |r| r.get::<_, String>(0))
        .ok()
        .and_then(|v| v.parse().ok())
        .unwrap_or(0)
}

/// Three small reads: no count over the catalog.
pub fn link_coverage(conn: &Connection) -> LinkCoverage {
    let cursor = meta_i64(conn, LINKS_CURSOR_KEY);
    let seen = meta_i64(conn, LINKS_SEEN_KEY);
    let newest: i64 = conn
        .query_row("SELECT COALESCE(MAX(rowid), 0) FROM note_meta", [], |r| r.get(0))
        .unwrap_or(0);
    let mut total = meta_i64(conn, "shell_note_count");
    if total <= 0 {
        total = conn
            .query_row("SELECT COUNT(*) FROM note_meta WHERE kind='note' AND deleted=0", [], |r| r.get(0))
            .unwrap_or(0);
    }
    let complete = newest == 0 || cursor >= newest;
    LinkCoverage {
        scanned: if complete { total } else { seen.min(total) },
        total,
        complete,
    }
}

/// Links and tags for every note, read after Ready. A deep fill reads bodies
/// only for the open set, so at 500k notes backlinks and tags covered a few
/// hundred notes. This reads each remaining file, keeps only its wikilinks
/// and tags (no body enters the search index), and commits small batches with
/// a pause between them. It resumes where it stopped.
pub fn run_links_pass(
    conn: &mut Connection,
    vault_root: &Path,
    mut is_cancelled: impl FnMut() -> bool,
    mut on_batch: impl FnMut(&LinkCoverage),
) -> Result<LinkCoverage, String> {
    loop {
        if is_cancelled() {
            break;
        }
        let cursor = meta_i64(conn, LINKS_CURSOR_KEY);
        let rows: Vec<(i64, String, String, i64)> = {
            let mut stmt = conn
                .prepare(
                    "SELECT rowid, id, path, COALESCE(fill_depth, 0) FROM note_meta
                     WHERE rowid > ?1 AND kind='note' AND deleted=0
                     ORDER BY rowid
                     LIMIT ?2",
                )
                .map_err(|e| e.to_string())?;
            let mapped = stmt
                .query_map(params![cursor, LINKS_PASS_BATCH as i64], |r| {
                    Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?))
                })
                .map_err(|e| e.to_string())?;
            mapped.filter_map(|r| r.ok()).collect()
        };
        let Some(last) = rows.last().map(|r| r.0) else {
            // Nothing past the cursor: mark the newest row read.
            let newest: i64 = conn
                .query_row("SELECT COALESCE(MAX(rowid), 0) FROM note_meta", [], |r| r.get(0))
                .unwrap_or(0);
            if newest > cursor {
                let _ = conn.execute(
                    "INSERT INTO meta_kv(key, value) VALUES (?1, ?2)
                     ON CONFLICT(key) DO UPDATE SET value = excluded.value",
                    params![LINKS_CURSOR_KEY, newest.to_string()],
                );
            }
            break;
        };
        // Read outside the transaction; notes whose body is indexed already have links.
        let mut parsed: Vec<(String, Vec<String>, Vec<String>)> = Vec::new();
        for (_, id, rel, depth) in &rows {
            if *depth >= FILL_DEPTH_PARTIAL {
                continue;
            }
            let abs = vault_root.join(rel);
            let Ok(file) = std::fs::File::open(&abs) else { continue };
            let mut body = String::new();
            if file.take(LINKS_PASS_MAX_BYTES).read_to_string(&mut body).is_err() {
                continue;
            }
            parsed.push((id.clone(), extract_wikilink_targets(&body), extract_tags(&body)));
        }
        let tx = conn.transaction().map_err(|e| e.to_string())?;
        for (id, links, tags) in &parsed {
            replace_source_links(&tx, id, links)?;
            replace_note_tags(&tx, id, tags)?;
        }
        let seen = meta_i64(&tx, LINKS_SEEN_KEY) + rows.len() as i64;
        tx.execute(
            "INSERT INTO meta_kv(key, value) VALUES (?1, ?2), (?3, ?4)
             ON CONFLICT(key) DO UPDATE SET value = excluded.value",
            params![LINKS_CURSOR_KEY, last.to_string(), LINKS_SEEN_KEY, seen.to_string()],
        )
        .map_err(|e| e.to_string())?;
        tx.commit().map_err(|e| e.to_string())?;
        on_batch(&link_coverage(conn));
        std::thread::sleep(Duration::from_millis(4));
    }
    Ok(link_coverage(conn))
}

/// One-shot from already-indexed heads when an older fill never wrote `tag_map`.
fn backfill_tags_from_fts(conn: &mut Connection) -> Result<(), String> {
    let rows: Vec<(String, String)> = {
        let mut stmt = conn
            .prepare("SELECT note_id, body FROM note_fts")
            .map_err(|e| e.to_string())?;
        let mapped = stmt
            .query_map([], |r| Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?)))
            .map_err(|e| e.to_string())?;
        mapped.flatten().collect()
    };
    for chunk in rows.chunks(128) {
        let tx = conn.unchecked_transaction().map_err(|e| e.to_string())?;
        for (id, body) in chunk {
            replace_note_tags(&tx, id, &extract_tags(body))?;
        }
        tx.commit().map_err(|e| e.to_string())?;
        std::thread::sleep(Duration::from_millis(FILL_YIELD_MS));
    }
    Ok(())
}

fn tags_indexed_flag(conn: &Connection) -> bool {
    conn.query_row(
        "SELECT value FROM meta_kv WHERE key = 'tags_indexed'",
        [],
        |r| r.get::<_, String>(0),
    )
    .ok()
    .map(|v| v == "1")
    .unwrap_or(false)
}

fn set_tags_indexed_flag(conn: &Connection) {
    let _ = conn.execute(
        "INSERT INTO meta_kv(key, value) VALUES ('tags_indexed', '1')
         ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        [],
    );
}

fn ensure_tags_from_bodies(conn: &mut Connection, indexed: i64) {
    if tags_indexed_flag(conn) {
        return;
    }
    // A fill that just wrote heads already extracted tags. Scanning every
    // body again is only for an older index that never did.
    if indexed == 0 {
        let tags: i64 = conn
            .query_row("SELECT COUNT(*) FROM tag_map", [], |r| r.get(0))
            .unwrap_or(0);
        let fts: i64 = conn
            .query_row("SELECT COUNT(*) FROM note_fts", [], |r| r.get(0))
            .unwrap_or(0);
        if tags == 0 && fts > 0 && backfill_tags_from_fts(conn).is_err() {
            return;
        }
    }
    set_tags_indexed_flag(conn);
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
        // A fill that wrote rows already extracted links; do not scan them again.
        if indexed == 0 && skipped > 0 && count_link_edges(conn) == 0 {
            if let Err(err) = backfill_links_from_fts(conn) {
                progress.message = Some(format!("link backfill failed: {err}"));
            }
        }
        if mark_ready {
            set_links_indexed_flag(conn);
        }
    }
    if mark_ready {
        ensure_tags_from_bodies(conn, indexed);
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
    #[cfg(test)]
    EXISTING_CATALOG_ROWS_LOADED.with(|c| c.set(map.len() as i64));
    map
}

#[cfg(test)]
thread_local! {
    static EXISTING_CATALOG_ROWS_LOADED: Cell<i64> = Cell::new(0);
    static TAIL_WAL_CHECKPOINTS: Cell<u32> = Cell::new(0);
    static MAX_LISTING_RETAINED: Cell<usize> = Cell::new(0);
    /// Directory entries pulled before Ready. A fat folder must not add one
    /// entry per file.
    static DIR_ENTRIES_BEFORE_READY: Cell<usize> = Cell::new(0);
    static DIR_LISTS: Cell<usize> = Cell::new(0);
}

#[cfg(test)]
fn note_listing_retained(n: usize) {
    MAX_LISTING_RETAINED.with(|c| {
        if n > c.get() {
            c.set(n);
        }
    });
}

#[cfg(not(test))]
fn note_listing_retained(_: usize) {}

#[cfg(test)]
fn note_dir_entry_before_ready() {
    DIR_ENTRIES_BEFORE_READY.with(|c| c.set(c.get() + 1));
}

#[cfg(not(test))]
fn note_dir_entry_before_ready() {}

fn ensure_walk_gen_column(conn: &Connection) {
    let _ = conn.execute("ALTER TABLE note_meta ADD COLUMN walk_gen INTEGER", []);
}

fn next_walk_gen(conn: &Connection) -> i64 {
    ensure_walk_gen_column(conn);
    let cur: i64 = conn
        .query_row(
            "SELECT CAST(value AS INTEGER) FROM meta_kv WHERE key='fill_walk_gen'",
            [],
            |r| r.get(0),
        )
        .unwrap_or(0);
    let next = cur + 1;
    let _ = conn.execute(
        "INSERT INTO meta_kv(key, value) VALUES('fill_walk_gen', ?1)
         ON CONFLICT(key) DO UPDATE SET value=excluded.value",
        params![next.to_string()],
    );
    next
}

fn cache_prior(
    conn: &Connection,
    prior: &mut HashMap<String, ExistingNote>,
    rel: &str,
    record: bool,
) -> bool {
    if prior.contains_key(rel) {
        return true;
    }
    let Some(note) = existing_note(conn, rel) else {
        return false;
    };
    if record {
        prior.insert(rel.to_string(), note);
    }
    true
}

fn existing_note(conn: &Connection, rel: &str) -> Option<ExistingNote> {
    conn.query_row(
        "SELECT id, mtime, size, fill_depth FROM note_meta
         WHERE path=?1 AND kind='note' AND deleted=0",
        params![rel],
        |r| {
            Ok(ExistingNote {
                id: r.get(0)?,
                mtime: r.get(1)?,
                size: r.get(2)?,
                fill_depth: r.get(3)?,
            })
        },
    )
    .ok()
}

fn stamp_walk_gen(conn: &Connection, gen: i64, notes: &[DiskNote]) -> Result<(), String> {
    if notes.is_empty() {
        return Ok(());
    }
    let mut stmt = conn
        .prepare_cached("UPDATE note_meta SET walk_gen=?1 WHERE path=?2")
        .map_err(|e| e.to_string())?;
    for note in notes {
        stmt.execute(params![gen, note.rel])
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}

struct DiscoverPublish<'a> {
    conn: &'a mut Connection,
    allow_heads: bool,
    head_chars: usize,
    vault: &'a Path,
    headed: &'a mut usize,
    indexed: &'a mut i64,
    errors: &'a mut i64,
    written: &'a mut HashSet<String>,
    fresh_titles: &'a mut HashSet<String>,
    /// Set on every note this full walk touches. Stale removal uses it so
    /// the walk does not keep every path in memory.
    walk_gen: Option<i64>,
    /// Mtimes from before this walk updates them. Only the interactive
    /// window is kept, so a large folder does not become a second catalog.
    prior: &'a mut HashMap<String, ExistingNote>,
    on_scanned: &'a mut dyn FnMut(i64, i64, i64),
    /// After the interactive title window, each batch sleeps.
    tail_yield: bool,
    last_checkpoint_at: i64,
}

struct LiteEntry {
    abs: PathBuf,
    rel: String,
    name: String,
}

#[derive(Clone, PartialEq, Eq, PartialOrd, Ord)]
struct RankedFile {
    name: String,
    rel: String,
    abs: PathBuf,
}

fn keep_smallest(set: &mut BTreeSet<RankedFile>, file: RankedFile, k: usize) {
    if k == 0 {
        return;
    }
    set.insert(file);
    if set.len() > k {
        set.pop_last();
    }
}

fn is_md_name(name: &str) -> bool {
    let b = name.as_bytes();
    b.len() >= 3 && b[b.len() - 3..].eq_ignore_ascii_case(b".md")
}

fn child_rel(rel: &str, name: &str) -> String {
    if rel.is_empty() {
        name.to_string()
    } else {
        format!("{rel}/{name}")
    }
}

/// Names in one directory. At most `file_limit` notes are kept: hub names
/// first, smallest name first. A `.md` name is a note, so this pass does not
/// stat every file before Ready. `truncated` means the tail reads the names
/// that did not fit. Subdirectories are all collected.
#[cfg(test)]
fn note_dir_list() {
    DIR_LISTS.with(|c| c.set(c.get() + 1));
}

#[cfg(not(test))]
fn note_dir_list() {}

fn list_dir_window(
    dir: &Path,
    rel: &str,
    file_limit: usize,
    skip: &HashSet<String>,
) -> (Vec<LiteEntry>, Vec<LiteEntry>, bool) {
    note_dir_list();
    let mut dirs = Vec::new();
    let mut hot: BTreeSet<RankedFile> = BTreeSet::new();
    let mut cold: BTreeSet<RankedFile> = BTreeSet::new();
    let mut total = 0usize;
    let entries = match std::fs::read_dir(dir) {
        Ok(e) => e,
        Err(_) => return (Vec::new(), dirs, false),
    };
    for entry in entries.flatten() {
        let name = entry.file_name().to_string_lossy().to_string();
        if name.starts_with('.') || FILL_SKIP_DIRS.iter().any(|s| *s == name) {
            continue;
        }
        let child = child_rel(rel, &name);
        // Extension decides a note. file_type() stats when the filesystem
        // has no type in the directory entry, which made the first page
        // wait on every file in a fat folder.
        if is_md_name(&name) {
            if skip.contains(&child) {
                continue;
            }
            total += 1;
            let ranked = RankedFile {
                name,
                rel: child,
                abs: entry.path(),
            };
            if is_title_seed_hot_name(&ranked.name) {
                keep_smallest(&mut hot, ranked, file_limit);
            } else if hot.len() < file_limit {
                keep_smallest(&mut cold, ranked, file_limit);
            }
            continue;
        }
        let Ok(ft) = entry.file_type() else { continue };
        if ft.is_dir() {
            dirs.push(LiteEntry {
                abs: entry.path(),
                rel: child,
                name,
            });
        }
    }
    let mut chosen = Vec::with_capacity(file_limit.min(total));
    for ranked in hot {
        if chosen.len() >= file_limit {
            break;
        }
        chosen.push(LiteEntry {
            abs: ranked.abs,
            rel: ranked.rel,
            name: ranked.name,
        });
    }
    if chosen.len() < file_limit {
        let room = file_limit - chosen.len();
        for ranked in cold.into_iter().take(room) {
            chosen.push(LiteEntry {
                abs: ranked.abs,
                rel: ranked.rel,
                name: ranked.name,
            });
        }
    }
    // `pop` takes the tail, so the smallest hub name is last.
    chosen.reverse();
    let truncated = total > chosen.len();
    note_listing_retained(chosen.len());
    (chosen, dirs, truncated)
}

/// The first page of one directory. Stops once `file_limit` notes are in
/// hand, so a folder of thousands of files is not read before Ready.
/// `Hub 0.md` is opened by name when it exists, so that title does not
/// depend on directory order. `truncated` means the tail still has names.
fn list_dir_ready_page(
    dir: &Path,
    rel: &str,
    file_limit: usize,
    skip: &HashSet<String>,
    count_entries: bool,
) -> (Vec<LiteEntry>, Vec<LiteEntry>, bool) {
    note_dir_list();
    let mut dirs = Vec::new();
    let mut files = Vec::new();
    let mut taken: HashSet<String> = HashSet::new();
    if file_limit > 0 {
        for name in ["Hub 0.md", "Hub.md"] {
            if files.len() >= file_limit {
                break;
            }
            let child = child_rel(rel, name);
            if skip.contains(&child) || !taken.insert(child.clone()) {
                continue;
            }
            let abs = dir.join(name);
            if abs.is_file() {
                files.push(LiteEntry {
                    abs,
                    rel: child,
                    name: name.to_string(),
                });
            } else {
                taken.remove(&child);
            }
        }
    }
    let entries = match std::fs::read_dir(dir) {
        Ok(e) => e,
        Err(_) => {
            note_listing_retained(files.len());
            return (files, dirs, false);
        }
    };
    let mut truncated = false;
    for entry in entries.flatten() {
        if count_entries {
            note_dir_entry_before_ready();
        }
        let name = entry.file_name().to_string_lossy().to_string();
        if name.starts_with('.') || FILL_SKIP_DIRS.iter().any(|s| *s == name) {
            continue;
        }
        let child = child_rel(rel, &name);
        if is_md_name(&name) {
            if skip.contains(&child) || !taken.insert(child.clone()) {
                continue;
            }
            if files.len() >= file_limit {
                truncated = true;
                break;
            }
            files.push(LiteEntry {
                abs: entry.path(),
                rel: child,
                name,
            });
            continue;
        }
        let Ok(ft) = entry.file_type() else { continue };
        if ft.is_dir() {
            dirs.push(LiteEntry {
                abs: entry.path(),
                rel: child,
                name,
            });
        }
    }
    // `pop` takes the tail. The probed hub is processed before the rest.
    if let Some(pos) = files.iter().position(|f| {
        f.name.eq_ignore_ascii_case("Hub 0.md") || f.name.eq_ignore_ascii_case("Hub.md")
    }) {
        let hub = files.remove(pos);
        files.push(hub);
    }
    note_listing_retained(files.len());
    (files, dirs, truncated)
}

fn disk_note_from_lite(lite: LiteEntry) -> DiskNote {
    use std::time::SystemTime;
    let meta = std::fs::metadata(&lite.abs).ok();
    let mtime = meta
        .as_ref()
        .and_then(|m| m.modified().ok())
        .and_then(|t| t.duration_since(SystemTime::UNIX_EPOCH).ok())
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0);
    let size = meta.map(|m| m.len() as i64).unwrap_or(0);
    DiskNote {
        abs: lite.abs,
        rel: lite.rel,
        name: lite.name,
        mtime,
        size,
    }
}

fn flush_unpublished(
    publish: &mut Option<DiscoverPublish<'_>>,
    out: &[DiskNote],
    published: &mut usize,
) {
    if *published >= out.len() {
        return;
    }
    if let Some(sink) = publish.as_mut() {
        publish_discovered(sink, &out[*published..], out.len() as i64);
    }
    *published = out.len();
}

fn stream_dir_tail<'p, 'c>(
    dir: &Path,
    rel: &str,
    skip: &HashSet<String>,
    publish: &mut Option<DiscoverPublish<'p>>,
    listed: &mut i64,
    is_cancelled: &RefCell<Box<dyn FnMut() -> bool + 'c>>,
    stack: &mut Vec<(PathBuf, String)>,
    push_dirs: bool,
    queued_dirs: &mut HashSet<String>,
) -> bool {
    let entries = match std::fs::read_dir(dir) {
        Ok(e) => e,
        Err(_) => return false,
    };
    let mut batch: Vec<DiskNote> = Vec::new();
    let mut child_dirs: Vec<(PathBuf, String)> = Vec::new();
    let flush_batch = |batch: &mut Vec<DiskNote>,
                       publish: &mut Option<DiscoverPublish<'p>>,
                       listed: &mut i64|
     -> bool {
        if batch.is_empty() {
            return false;
        }
        note_listing_retained(batch.len());
        *listed += batch.len() as i64;
        if let Some(sink) = publish.as_mut() {
            publish_discovered(sink, batch, *listed);
        }
        batch.clear();
        let mut cancel = is_cancelled.borrow_mut();
        (*cancel)()
    };
    for entry in entries.flatten() {
        let name = entry.file_name().to_string_lossy().to_string();
        if name.starts_with('.') || FILL_SKIP_DIRS.iter().any(|s| *s == name) {
            continue;
        }
        let child_rel = if rel.is_empty() {
            name.clone()
        } else {
            format!("{rel}/{name}")
        };
        if is_md_name(&name) {
            // fall through to the note path
        } else {
            let Ok(ft) = entry.file_type() else { continue };
            if ft.is_dir() && push_dirs {
                child_dirs.push((entry.path(), child_rel));
            }
            continue;
        }
        if skip.contains(&child_rel) {
            continue;
        }
        batch.push(disk_note_from_lite(LiteEntry {
            abs: entry.path(),
            rel: child_rel,
            name,
        }));
        if batch.len() >= DISCOVER_BATCH && flush_batch(&mut batch, publish, listed) {
            return true;
        }
    }
    if flush_batch(&mut batch, publish, listed) {
        return true;
    }
    if push_dirs {
        child_dirs.retain(|(_, child_rel)| queued_dirs.insert(child_rel.clone()));
        child_dirs.sort_by(|a, b| b.1.cmp(&a.1));
        stack.append(&mut child_dirs);
    }
    false
}

/// List the vault. `cap` stops the interactive portion: once that many notes
/// are in hand the callback runs (title search, then the open-note bodies)
/// and the rest of the names are listed with `tail_yield`. `usize::MAX`
/// never pauses. The interactive window keeps at most `cap` names from a
/// directory; the tail reads the rest without holding the directory.
/// Returns `(interactive notes, total notes listed, walk finished)`.
fn collect_md_notes_publishing<'a>(
    root: &Path,
    mut publish: Option<DiscoverPublish<'_>>,
    prefixes: &[String],
    cap: usize,
    ready_at: usize,
    is_cancelled: &RefCell<Box<dyn FnMut() -> bool + 'a>>,
    on_ready: &mut dyn FnMut(&mut DiscoverPublish<'_>, &[DiskNote]),
    on_cap: &mut dyn FnMut(&mut DiscoverPublish<'_>, &[DiskNote]),
) -> (Vec<DiskNote>, i64, bool) {
    let mut out = Vec::new();
    let mut seen_rel: HashSet<String> = HashSet::new();
    // A note the user already has open is part of the first page even when
    // its folder sorts later.
    for raw in prefixes {
        let rel = normalize_rel(raw).trim_matches('/').to_string();
        if !rel.to_ascii_lowercase().ends_with(".md") {
            continue;
        }
        let abs = root.join(&rel);
        if !abs.is_file() {
            continue;
        }
        let name = abs
            .file_name()
            .map(|n| n.to_string_lossy().into_owned())
            .unwrap_or_default();
        if name.is_empty() || !seen_rel.insert(rel.clone()) {
            continue;
        }
        out.push(disk_note_from_lite(LiteEntry { abs, rel, name }));
    }
    let mut published = 0usize;
    let unlimited = cap == usize::MAX;
    let mut capped = false;
    let mut announced = false;
    let mut tail = false;
    let mut listed: i64 = out.len() as i64;
    let mut stack: Vec<(PathBuf, String)> = vec![(root.to_path_buf(), String::new())];
    let mut pending_files: Vec<LiteEntry> = Vec::new();
    let mut pending_dirs: Vec<LiteEntry> = Vec::new();
    let mut rescan: Vec<(PathBuf, String)> = Vec::new();
    let mut queued_dirs: HashSet<String> = HashSet::new();

    loop {
        if tail {
            let stop = {
                let mut cancel = is_cancelled.borrow_mut();
                (*cancel)()
            };
            if stop {
                flush_unpublished(&mut publish, &out, &mut published);
                return (out, listed, false);
            }
        }
        if pending_files.is_empty() && pending_dirs.is_empty() {
            if tail {
                if let Some((dir, rel)) = rescan.pop() {
                    if stream_dir_tail(
                        &dir,
                        &rel,
                        &seen_rel,
                        &mut publish,
                        &mut listed,
                        is_cancelled,
                        &mut stack,
                        true,
                        &mut queued_dirs,
                    ) {
                        flush_unpublished(&mut publish, &out, &mut published);
                        return (out, listed, false);
                    }
                    continue;
                }
            }
            // After Ready, yield before the next name batch so search and
            // typing are not behind a scan of the rest of the folder.
            if announced && !tail {
                std::thread::sleep(Duration::from_millis(DISCOVER_TAIL_YIELD_MS));
            }
            // The ready page leaves the rest of that folder on `rescan`.
            // Finish it up to the open-window cap before sibling folders, so
            // one fat folder still supplies the window. After the cap, the
            // tail above already drained `rescan`.
            let next = if tail {
                stack.pop()
            } else if let Some(item) = rescan.pop() {
                Some(item)
            } else {
                stack.pop()
            };
            let Some((dir, rel)) = next else {
                break;
            };
            if tail {
                if stream_dir_tail(
                    &dir,
                    &rel,
                    &seen_rel,
                    &mut publish,
                    &mut listed,
                    is_cancelled,
                    &mut stack,
                    true,
                    &mut queued_dirs,
                ) {
                    flush_unpublished(&mut publish, &out, &mut published);
                    return (out, listed, false);
                }
                continue;
            }
            let (files, mut dirs, truncated) = if !announced && ready_at != usize::MAX {
                let need = ready_at.saturating_sub(out.len()).max(1);
                list_dir_ready_page(&dir, &rel, need, &seen_rel, true)
            } else if announced && ready_at != usize::MAX {
                let room = cap.saturating_sub(out.len()).max(1).min(POST_READY_DIR_BATCH);
                list_dir_ready_page(&dir, &rel, room, &seen_rel, false)
            } else {
                let room = cap.saturating_sub(out.len()).max(1);
                list_dir_window(&dir, &rel, room, &seen_rel)
            };
            if truncated {
                rescan.push((dir.clone(), rel.clone()));
            }
            // Pop takes the last entry. Before the first title page, smallest
            // names come out first (`00-Inbox`, then bucket `00`) so a cold
            // open does not title-index later folders before Hub 0.
            dirs.sort_by(|a, b| {
                if announced {
                    let ap = is_priority_rel(&a.rel, prefixes);
                    let bp = is_priority_rel(&b.rel, prefixes);
                    ap.cmp(&bp).then_with(|| b.name.cmp(&a.name))
                } else {
                    b.name.cmp(&a.name)
                }
            });
            pending_files = files;
            pending_dirs = dirs;
        }
        if let Some(lite) = pending_files.pop() {
            if !seen_rel.insert(lite.rel.clone()) {
                continue;
            }
            out.push(disk_note_from_lite(lite));
            listed = out.len() as i64;
            let batch_due = if announced {
                out.len().saturating_sub(published) >= POST_READY_DIR_BATCH
            } else {
                out.len() % DISCOVER_BATCH == 0
            };
            let ready_due = !announced && ready_at != usize::MAX && out.len() >= ready_at;
            if batch_due || ready_due {
                flush_unpublished(&mut publish, &out, &mut published);
            }
            if ready_due {
                if let Some(sink) = publish.as_mut() {
                    on_ready(sink, &out);
                    // Merging or copying the whole index here locked the
                    // database for the rest of the vault. Those run in the
                    // small batches below, after the page is on screen.
                }
                announced = true;
            }
            if !unlimited && !capped && out.len() >= cap {
                flush_unpublished(&mut publish, &out, &mut published);
                if let Some(sink) = publish.as_mut() {
                    on_cap(sink, &out);
                    sink.tail_yield = true;
                }
                capped = true;
                tail = true;
            }
            continue;
        }
        // Non-priority directories were sorted first, so they go under
        // the priority directories on the stack.
        for dir in pending_dirs.drain(..) {
            if queued_dirs.insert(dir.rel.clone()) {
                stack.push((dir.abs, dir.rel));
            }
        }
    }
    flush_unpublished(&mut publish, &out, &mut published);
    (out, listed, true)
}

fn publish_discovered(sink: &mut DiscoverPublish<'_>, notes: &[DiskNote], scanned: i64) {
    // One commit per path batch: ancestor folders, then title/path search.
    // A second note_meta write used to land before the title row.
    let started = Instant::now();
    let mut titles = Vec::new();
    let mut touches: Vec<(String, String, i64, i64)> = Vec::new();
    let mut all_rows: Vec<(String, String, i64, i64)> = Vec::with_capacity(notes.len());
    for note in notes {
        all_rows.push((note.rel.clone(), note.name.clone(), note.mtime, note.size));
        let id = desk_node_id(&note.rel);
        let known = sink.written.contains(&id)
            || cache_prior(sink.conn, sink.prior, &note.rel, !sink.tail_yield);
        if known {
            touches.push((note.rel.clone(), note.name.clone(), note.mtime, note.size));
        } else {
            titles.push(meta_fill_note(note));
        }
    }
    let indexed_before = *sink.indexed;
    let committed = if let Ok(tx) = sink.conn.unchecked_transaction() {
        let folders_ok =
            crate::shell_catalog::remember_discovered_in(&tx, &all_rows, false).is_ok();
        let touch_ok = touches.is_empty()
            || crate::shell_catalog::remember_discovered_in(&tx, &touches, true).is_ok();
        let write_ok = write_note_batch(
            &tx,
            &titles,
            sink.indexed,
            sink.errors,
            sink.written,
            sink.fresh_titles,
        )
        .is_ok();
        let stamped = match sink.walk_gen {
            Some(gen) => stamp_walk_gen(&tx, gen, notes).is_ok(),
            None => true,
        };
        folders_ok && touch_ok && write_ok && stamped && tx.commit().is_ok()
    } else {
        false
    };
    if !committed {
        *sink.indexed = indexed_before;
        *sink.errors += titles.len() as i64;
    }
        if sink.tail_yield {
            if committed && scanned - sink.last_checkpoint_at >= TAIL_CHECKPOINT_EVERY {
                let _ = sink.conn.execute_batch("PRAGMA wal_checkpoint(PASSIVE);");
                sink.last_checkpoint_at = scanned;
                #[cfg(test)]
                TAIL_WAL_CHECKPOINTS.with(|c| c.set(c.get() + 1));
            }
            // A few FTS row ids per batch. One copy of every row used to
            // hold the database after Ready.
            let _ = backfill_note_fts_row_chunk(sink.conn, POST_READY_DIR_BATCH as i64);
            std::thread::sleep(Duration::from_millis(DISCOVER_TAIL_YIELD_MS));
        } else {
        cooperate_after_write(started);
    }
    if sink.allow_heads && *sink.headed < EARLY_HEAD_CAP {
        let wrote = commit_early_heads(
            sink.conn,
            sink.vault,
            sink.head_chars,
            EARLY_HEAD_CAP - *sink.headed,
            sink.indexed,
            sink.errors,
            sink.written,
            sink.fresh_titles,
        );
        *sink.headed += wrote;
    }
    (sink.on_scanned)(scanned, *sink.indexed, *sink.errors);
}

fn commit_early_heads(
    conn: &mut Connection,
    vault_root: &Path,
    head_chars: usize,
    room: usize,
    indexed: &mut i64,
    errors: &mut i64,
    written: &mut HashSet<String>,
    fresh_titles: &mut HashSet<String>,
) -> usize {
    if room == 0 {
        return 0;
    }
    let already: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM note_meta
             WHERE kind='note' AND deleted=0 AND COALESCE(fill_depth, 0) >= ?1",
            params![FILL_DEPTH_PARTIAL],
            |r| r.get(0),
        )
        .unwrap_or(0);
    if already >= EARLY_HEAD_CAP as i64 {
        return 0;
    }
    let room = room.min((EARLY_HEAD_CAP as i64 - already) as usize);
    let take = room.min(FTS_WRITE_BATCH);
    let selected: Vec<(String, String, String, Option<String>, i64, i64)> = {
        let mut stmt = match conn.prepare(
            "SELECT id, path, name, parent_id, mtime, COALESCE(size, 0)
             FROM note_meta
             WHERE deleted=0 AND kind='note' AND COALESCE(fill_depth, 99) < ?1
             ORDER BY CASE WHEN instr(path, '/') = 0 THEN 0 ELSE 1 END, path
             LIMIT ?2",
        ) {
            Ok(stmt) => stmt,
            Err(_) => return 0,
        };
        let mapped = stmt.query_map(params![FILL_DEPTH_PARTIAL, take as i64], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, String>(2)?,
                row.get::<_, Option<String>>(3)?,
                row.get::<_, i64>(4)?,
                row.get::<_, i64>(5)?,
            ))
        });
        match mapped {
            Ok(iter) => iter.filter_map(|r| r.ok()).collect(),
            Err(_) => return 0,
        }
    };
    if selected.is_empty() {
        return 0;
    }
    let mut batch = Vec::with_capacity(selected.len());
    let mut buf = vec![0u8; head_chars.saturating_mul(4).clamp(256, 16_384)];
    for (id, path, name, parent_id, mtime, size) in &selected {
        let abs = vault_root.join(path);
        let meta = std::fs::metadata(&abs).ok();
        let size = meta.as_ref().map(|m| m.len() as i64).unwrap_or(*size);
        let mtime = meta
            .as_ref()
            .and_then(|m| m.modified().ok())
            .and_then(|t| t.duration_since(std::time::SystemTime::UNIX_EPOCH).ok())
            .map(|d| d.as_millis() as i64)
            .unwrap_or(*mtime);
        let body = match std::fs::File::open(&abs) {
            Ok(mut file) => {
                let n = file.read(&mut buf).unwrap_or(0);
                take_head(&buf[..n], head_chars)
            }
            Err(_) => String::new(),
        };
        batch.push(FillNote {
            id: id.clone(),
            path: path.clone(),
            name: name.clone(),
            parent_id: parent_id.clone(),
            mtime,
            size,
            title: title_from_name_and_head(name, &body),
            links: extract_wikilink_targets(&body),
            tags: extract_tags(&body),
            body,
            fill_depth: FILL_DEPTH_PARTIAL,
        });
    }
    let n = batch.len();
    flush_note_batch(conn, &mut batch, indexed, errors, written, fresh_titles);
    n
}

/// Paths that already have a head, with the depth stored on the row.
/// Legacy NULL depths stay out of this map (`inferred_fill_depth` treats
/// them as deep). Early heads written during this fill are visible here
/// even when the in-memory catalog snapshot is older.
fn headed_depths(conn: &Connection) -> HashMap<String, i64> {
    let mut out = HashMap::new();
    let Ok(mut stmt) = conn.prepare(
        "SELECT path, COALESCE(fill_depth, ?1)
         FROM note_meta
         WHERE kind='note' AND deleted=0 AND COALESCE(fill_depth, 0) >= ?2",
    ) else {
        return out;
    };
    let Ok(rows) = stmt.query_map(params![FILL_DEPTH_DEEP, FILL_DEPTH_PARTIAL], |r| {
        Ok((r.get::<_, String>(0)?, r.get::<_, i64>(1)?))
    }) else {
        return out;
    };
    for row in rows.flatten() {
        out.insert(row.0, row.1);
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

/// Bulk title and head writes. A larger page cache and rarer WAL checkpoints
/// keep the index from re-reading itself as it grows. automerge stays on so
/// a search during fill does not walk an unbounded set of FTS segments.
/// `journal_size_limit` caps the file left after a passive checkpoint so the
/// next launch does not replay a vault-sized log. Never `TRUNCATE` — that
/// hung a full catalog.
fn tune_fill_connection(conn: &Connection) {
    let _ = conn.execute_batch(
        "PRAGMA cache_size=-524288;
         PRAGMA temp_store=MEMORY;
         PRAGMA mmap_size=1073741824;
         PRAGMA wal_autocheckpoint=100000;
         PRAGMA journal_size_limit=8388608;",
    );
}

const TITLE_SEARCH_LIVE_KEY: &str = "title_search_live";

/// A journal larger than this is not replayed on open. The database file
/// already holds the last checkpoint; the fill catches up after the page.
const JOURNAL_REPLAY_CAP: u64 = 8 * 1024 * 1024;
/// Below this, the database file is only a header and the journal is the index.
const JOURNAL_DB_MIN: u64 = 1024 * 1024;

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
fn merge_fts_segments(conn: &Connection) {
    let _ = conn.execute_batch(
        "INSERT INTO note_fts(note_fts, rank) VALUES('automerge', 64);
         INSERT INTO note_fts(note_fts, rank) VALUES('crisismerge', 64);",
    );
}

/// The first heads commit in small batches so note text is searchable
/// before a full page of the vault has been read. Later batches stay at
/// `FTS_WRITE_BATCH` so the lock yield does not dominate the rest of the pass.
fn head_write_limit(headed: i64) -> usize {
    if headed < 2048 {
        64
    } else {
        FTS_WRITE_BATCH
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
        tags: Vec::new(),
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

/// Stable body-read window for a deep fill. Priority paths when the caller
/// passed some, otherwise walk order. Truncated before any "still shallow"
/// filter, so a reopen does not slide forward through the rest of the vault.
fn content_read_window(
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

/// Read the next chunk of heads while the caller writes the previous one.
/// The yield stays on that write. Cancel is checked between chunks; one
/// in-flight read may finish and is discarded.
fn pipeline_head_reads(
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
fn index_note_heads(
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
fn index_prefix_deep(
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

fn parent_id_for(rel: &str) -> Option<String> {
    rel.rsplit_once('/').map(|(p, _)| desk_node_id(p))
}

/// `note_fts.note_id` is UNINDEXED. Deletes go through this rowid map so a
/// 100k fill does not scan the FTS table once per note.
pub fn ensure_note_fts_row(conn: &Connection) {
    let _ = conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS note_fts_row (
            note_id TEXT PRIMARY KEY,
            fts_rowid INTEGER NOT NULL
         );",
    );
    let mapped: Option<String> = conn
        .query_row(
            "SELECT value FROM meta_kv WHERE key = 'fts_row_mapped'",
            [],
            |r| r.get(0),
        )
        .ok();
    if mapped.as_deref() == Some("1") {
        return;
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
        return;
    }
    let _ = conn.execute(
        "INSERT INTO meta_kv(key, value) VALUES ('fts_row_mapped', '1')
         ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        [],
    );
}

fn fts_row_map_done(conn: &Connection) -> bool {
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
fn backfill_note_fts_row_chunk(conn: &Connection, limit: i64) -> bool {
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

fn backfill_note_fts_row_if_needed(conn: &Connection) {
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
    ensure_note_fts_row(conn);
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

fn flush_note_batch(
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

fn write_note_batch(
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
                "INSERT INTO note_meta(id, path, name, kind, parent_id, mtime, size, content_hash, title, deleted, fill_depth)
                 VALUES (?1,?2,?3,'note',?4,?5,?6,NULL,?7,0,?8)
                 ON CONFLICT(id) DO UPDATE SET
                   path=excluded.path, name=excluded.name, parent_id=excluded.parent_id,
                   mtime=excluded.mtime, size=excluded.size,
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

fn remove_stale_walk(conn: &mut Connection, gen: i64) -> i64 {
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

fn emit(
    progress: &mut IndexFillProgress,
    phase: &str,
    search_state: &str,
    scanned: i64,
    indexed: i64,
    skipped: i64,
    errors: i64,
    message: Option<String>,
    on_progress: &mut dyn FnMut(&IndexFillProgress),
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

/// Phased fill: title seed, then one head pass.
/// Desktop Partial/Deep emits `ready-meta` after the title FTS seed
/// Index only the files named in `priority` (an opened note). A folder name
/// is not listed. Notes already at deep depth are left alone.
fn index_priority_files(
    conn: &mut Connection,
    vault_root: &Path,
    priority: &[String],
    deep_head: usize,
    is_cancelled: &mut impl FnMut() -> bool,
) -> i64 {
    let mut files = Vec::new();
    for raw in priority {
        if is_cancelled() {
            break;
        }
        let rel = raw.replace('\\', "/");
        if rel.is_empty() || rel.split('/').any(|p| p.is_empty() || p == "..") {
            continue;
        }
        let abs = vault_root.join(&rel);
        if !abs.is_file() {
            continue;
        }
        let depth: i64 = conn
            .query_row(
                "SELECT COALESCE(fill_depth, 0) FROM note_meta
                 WHERE path=?1 AND kind='note' AND deleted=0",
                params![rel],
                |r| r.get(0),
            )
            .unwrap_or(0);
        if depth >= FILL_DEPTH_DEEP {
            continue;
        }
        let name = rel.rsplit('/').next().unwrap_or(&rel).to_string();
        files.push(disk_note_from_lite(LiteEntry { abs, rel, name }));
    }
    if files.is_empty() {
        return 0;
    }
    let indices: Vec<usize> = (0..files.len()).collect();
    let mut batch = Vec::new();
    let mut indexed = 0i64;
    let mut errors = 0i64;
    let mut written = HashSet::new();
    let mut fresh = HashSet::new();
    let mut headed = 0i64;
    index_note_heads(
        conn,
        &files,
        &indices,
        deep_head,
        FILL_DEPTH_DEEP,
        is_cancelled,
        &mut batch,
        &mut indexed,
        &mut errors,
        &mut written,
        &mut fresh,
        &mut headed,
        |_, _, _| {},
    );
    flush_note_batch(
        conn,
        &mut batch,
        &mut indexed,
        &mut errors,
        &mut written,
        &mut fresh,
    );
    indexed
}

/// What a disk/catalog reconcile changed. `complete` is false when the
/// folder could not be read in full, and then nothing was removed.
#[derive(Clone, Debug, Default, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct CatalogReconcile {
    pub added: i64,
    pub removed: i64,
    pub notes: i64,
    pub folders: i64,
    pub complete: bool,
}

pub const RECONCILE_ADD_BATCH: usize = 200;
const RECONCILE_PAGE: i64 = 2_000;
const RECONCILE_DELETE_BATCH: usize = 64;

/// Every note and folder under the vault by the fill's rules, sorted by
/// byte order (the catalog's `path` order). None when a directory could not
/// be read or the walk was cancelled.
fn list_vault_paths(
    root: &Path,
    is_cancelled: &mut impl FnMut() -> bool,
) -> Option<(Vec<String>, Vec<String>)> {
    let mut notes = Vec::new();
    let mut dirs = Vec::new();
    let mut stack = vec![(root.to_path_buf(), String::new())];
    let mut seen = 0usize;
    while let Some((abs, rel)) = stack.pop() {
        if is_cancelled() {
            return None;
        }
        for entry in std::fs::read_dir(&abs).ok()? {
            let entry = entry.ok()?;
            let name = entry.file_name().to_string_lossy().to_string();
            if name.starts_with('.') {
                continue;
            }
            let kind = entry.file_type().ok()?;
            if kind.is_dir() {
                if FILL_SKIP_DIRS.iter().any(|s| *s == name) {
                    continue;
                }
                let child = child_rel(&rel, &name);
                dirs.push(child.clone());
                stack.push((entry.path(), child));
            } else if kind.is_file() && is_md_name(&name) {
                notes.push(child_rel(&rel, &name));
            }
            seen += 1;
            if seen % 4_096 == 0 && is_cancelled() {
                return None;
            }
        }
    }
    notes.sort_unstable();
    dirs.sort_unstable();
    Some((notes, dirs))
}

/// Catalog rows of one kind that the disk listing does not have, and listed
/// paths the catalog does not have. Both sides are in `path` byte order, so
/// the catalog is read a page at a time instead of held in memory.
fn diff_catalog_kind(
    conn: &Connection,
    kind: &str,
    disk: &[String],
) -> Result<(Vec<String>, Vec<(String, String)>), String> {
    let mut missing_rows = Vec::new();
    let mut new_paths = Vec::new();
    let mut i = 0usize;
    let mut after = String::new();
    let mut stmt = conn
        .prepare(
            "SELECT id, path FROM note_meta
             WHERE kind = ?1 AND deleted = 0 AND path > ?2
             ORDER BY path LIMIT ?3",
        )
        .map_err(|e| e.to_string())?;
    loop {
        let page: Vec<(String, String)> = stmt
            .query_map(params![kind, after, RECONCILE_PAGE], |r| Ok((r.get(0)?, r.get(1)?)))
            .map_err(|e| e.to_string())?
            .collect::<Result<_, _>>()
            .map_err(|e| e.to_string())?;
        let Some(last) = page.last() else { break };
        after = last.1.clone();
        for (id, path) in page {
            while i < disk.len() && disk[i] < path {
                new_paths.push(disk[i].clone());
                i += 1;
            }
            if i < disk.len() && disk[i] == path {
                i += 1;
            } else {
                missing_rows.push((id, path));
            }
        }
    }
    new_paths.extend(disk[i..].iter().cloned());
    Ok((new_paths, missing_rows))
}

fn delete_catalog_rows(conn: &mut Connection, root: &Path, rows: &[(String, String)]) -> i64 {
    let mut removed = 0i64;
    for chunk in rows.chunks(RECONCILE_DELETE_BATCH) {
        let Ok(tx) = conn.unchecked_transaction() else { break };
        let mut done = 0i64;
        for (id, path) in chunk {
            // Written back while the folder was listed: keep it.
            if root.join(path).exists() {
                continue;
            }
            let _ = tx.execute("DELETE FROM tag_map WHERE note_id = ?1", params![id]);
            let _ = tx.execute("DELETE FROM link_edge WHERE source_id = ?1", params![id]);
            let _ = delete_note_fts(&tx, id);
            if tx.execute("DELETE FROM note_meta WHERE id = ?1", params![id]).is_ok() {
                done += 1;
            }
        }
        if tx.commit().is_ok() {
            removed += done;
        }
        std::thread::sleep(Duration::from_millis(DISCOVER_TAIL_YIELD_MS));
    }
    removed
}

fn folder_rows_for(dirs: &[String]) -> Vec<crate::shell_catalog::ShellRow> {
    dirs.iter()
        .map(|rel| crate::shell_catalog::ShellRow {
            id: desk_node_id(rel),
            path: rel.clone(),
            name: rel.rsplit('/').next().unwrap_or(rel).to_string(),
            kind: "folder".into(),
            parent_id: parent_id_for(rel),
            mtime: 0,
            child_notes: 0,
        })
        .collect()
}

/// A catalog that answered Ready from an earlier fill does not walk the
/// folder again, so notes added or removed outside Nexus since then were not
/// in it. This lists the folder, adds what is new (title, head, links, tags),
/// drops what is gone, and stores the real totals.
pub fn reconcile_catalog_with_disk(
    conn: &mut Connection,
    root: &Path,
    mut is_cancelled: impl FnMut() -> bool,
) -> CatalogReconcile {
    let mut out = CatalogReconcile::default();
    let listing = list_vault_paths(root, &mut is_cancelled);
    if let Some((disk_notes, disk_dirs)) = listing {
        let notes_diff = diff_catalog_kind(conn, "note", &disk_notes);
        let dirs_diff = diff_catalog_kind(conn, "folder", &disk_dirs);
        if let (Ok((new_notes, gone_notes)), Ok((new_dirs, gone_dirs))) = (notes_diff, dirs_diff) {
            // An unreadable or unmounted folder can list as empty. That is not
            // a reason to drop a whole catalog.
            let trust_removals = !disk_notes.is_empty() || gone_notes.is_empty();
            if !new_dirs.is_empty() {
                let _ = crate::shell_catalog::upsert_shell_rows(conn, folder_rows_for(&new_dirs));
            }
            for batch in new_notes.chunks(RECONCILE_ADD_BATCH) {
                if is_cancelled() {
                    break;
                }
                out.added += index_priority_files(conn, root, batch, DEFAULT_DEEP_HEAD, &mut is_cancelled);
                std::thread::sleep(Duration::from_millis(DISCOVER_TAIL_YIELD_MS));
            }
            if trust_removals && !is_cancelled() {
                out.removed += delete_catalog_rows(conn, root, &gone_notes);
                out.removed += delete_catalog_rows(conn, root, &gone_dirs);
            }
            out.complete = trust_removals && !is_cancelled();
        }
    }
    if let Ok((notes, folders)) = crate::shell_catalog::catalog_counts(conn) {
        out.notes = notes;
        out.folders = folders;
        if out.complete {
            crate::shell_catalog::store_catalog_counts(conn, notes, folders);
        }
    }
    out
}

/// Paths the watcher reported that the catalog does not have yet: folder
/// rows for their parents and full rows for the notes. Returns what it added.
pub fn admit_new_paths(conn: &mut Connection, root: &Path, rels: &[String]) -> Vec<String> {
    let mut notes = Vec::new();
    let mut dirs: BTreeSet<String> = BTreeSet::new();
    for raw in rels.iter().take(400) {
        let rel = raw.replace('\\', "/").trim_matches('/').to_string();
        if rel.is_empty()
            || rel.split('/').any(|p| {
                p.is_empty() || p == ".." || p.starts_with('.') || FILL_SKIP_DIRS.contains(&p)
            })
        {
            continue;
        }
        let abs = root.join(&rel);
        let is_dir = abs.is_dir();
        if !is_dir && !(is_md_name(&rel) && abs.is_file()) {
            continue;
        }
        let mut cur = if is_dir { Some(rel.as_str()) } else { rel.rsplit_once('/').map(|(p, _)| p) };
        while let Some(dir) = cur {
            dirs.insert(dir.to_string());
            cur = dir.rsplit_once('/').map(|(p, _)| p);
        }
        if is_dir {
            continue;
        }
        let known = conn
            .query_row(
                "SELECT 1 FROM note_meta WHERE path = ?1 AND kind = 'note' AND deleted = 0",
                params![rel],
                |_| Ok(()),
            )
            .is_ok();
        if !known {
            notes.push(rel);
        }
    }
    let new_dirs: Vec<String> = dirs
        .into_iter()
        .filter(|d| {
            conn.query_row(
                "SELECT 1 FROM note_meta WHERE path = ?1 AND kind = 'folder' AND deleted = 0",
                params![d],
                |_| Ok(()),
            )
            .is_err()
        })
        .collect();
    if !new_dirs.is_empty() {
        let _ = crate::shell_catalog::upsert_shell_rows(conn, folder_rows_for(&new_dirs));
    }
    let mut never = || false;
    index_priority_files(conn, root, &notes, DEFAULT_DEEP_HEAD, &mut never);
    let mut added = new_dirs;
    added.extend(notes.into_iter().filter(|rel| existing_note(conn, rel).is_some()));
    added
}

/// Saved paths whose files are gone. Not part of Ready: a filled reopen does
/// not stat the catalog. Tests call this directly.
#[cfg(test)]
fn drop_missing_catalog_files(
    conn: &mut Connection,
    vault_root: &Path,
    is_cancelled: &mut impl FnMut() -> bool,
) -> i64 {
    let mut removed = 0i64;
    let mut after = String::new();
    loop {
        if is_cancelled() {
            break;
        }
        let page: Vec<(String, String)> = {
            let Ok(mut stmt) = conn.prepare(
                "SELECT id, path FROM note_meta
                 WHERE kind='note' AND deleted=0 AND path > ?1
                 ORDER BY path
                 LIMIT 64",
            ) else {
                break;
            };
            let Ok(rows) = stmt.query_map(params![after], |r| {
                Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?))
            }) else {
                break;
            };
            rows.flatten().collect()
        };
        if page.is_empty() {
            break;
        }
        after = page.last().unwrap().1.clone();
        let missing: Vec<String> = page
            .into_iter()
            .filter_map(|(id, path)| {
                if path.starts_with('/') || path.split('/').any(|p| p.is_empty() || p == "..") {
                    return None;
                }
                if vault_root.join(&path).is_file() {
                    None
                } else {
                    Some(id)
                }
            })
            .collect();
        if !missing.is_empty() {
            if let Ok(tx) = conn.unchecked_transaction() {
                let mut page_removed = 0i64;
                for id in &missing {
                    let _ = tx.execute("DELETE FROM tag_map WHERE note_id = ?1", params![id]);
                    let _ = tx.execute("DELETE FROM link_edge WHERE source_id = ?1", params![id]);
                    let ok = delete_note_fts(&tx, id).is_ok()
                        && tx
                            .execute("DELETE FROM note_meta WHERE id = ?1", params![id])
                            .is_ok();
                    if ok {
                        page_removed += 1;
                    }
                }
                if tx.commit().is_ok() {
                    removed += page_removed;
                }
            }
        }
        std::thread::sleep(Duration::from_millis(DISCOVER_TAIL_YIELD_MS));
    }
    removed
}

/// (not after cataloging every empty body). Deep does not read a short
/// head and then the same file again. `is_cancelled` is checked between
/// batches so a remount can preempt.
pub fn fill_from_disk_with_opts<'a>(
    conn: &mut Connection,
    vault_root: &Path,
    opts: FillOpts<'_>,
    mut is_cancelled: impl FnMut() -> bool + 'a,
    mut on_progress: impl FnMut(&IndexFillProgress),
) -> Result<IndexFillResult, String> {
    ensure_fill_depth_column(conn);
    ensure_note_fts_row(conn);
    if opts.force_rebuild {
        clear_title_search_live(conn);
    }
    // A filled catalog already answers title search. Announce the page
    // before the large cache and before another directory read. Cold open
    // still walks the first page below, then tunes.
    let titles_live =
        opts.until == FillUntil::Deep && !opts.force_rebuild && title_search_already_live(conn);
    if !titles_live && opts.until != FillUntil::Deep {
        tune_fill_connection(conn);
    }

    let short_head = opts.short_head_chars.clamp(256, 4_096);
    let deep_head = opts.deep_head_chars.clamp(short_head, 32_000);
    let target_depth = match opts.until {
        FillUntil::Meta => FILL_DEPTH_META,
        FillUntil::Partial => FILL_DEPTH_PARTIAL,
        FillUntil::Deep => FILL_DEPTH_DEEP,
    };
    let mut indexed: i64 = 0;
    let mut errors: i64 = 0;
    let mut written: HashSet<String> = HashSet::new();
    let mut fresh_titles: HashSet<String> = HashSet::new();
    let mut headed: usize = 0;
    let allow_early = opts.until != FillUntil::Meta && !opts.force_rebuild;
    let mut progress = IndexFillProgress {
        db_path: opts.db_path.to_string(),
        scanned: 0,
        total: 0,
        indexed: 0,
        skipped: 0,
        errors: 0,
        phase: "walking".into(),
        message: Some("Opening the first page…".into()),
        search_state: String::new(),
    };
    if titles_live {
        mark_title_search_live(conn);
        emit(
            &mut progress,
            "ready-meta",
            "ready-meta",
            TITLE_READY_FLUSH as i64,
            0,
            0,
            0,
            Some("Title/path search ready".into()),
            &mut on_progress,
        );
        emit(
            &mut progress,
            "done",
            "ready-fts-partial",
            TITLE_READY_FLUSH as i64,
            0,
            0,
            0,
            Some("Titles and open notes are searchable".into()),
            &mut on_progress,
        );
        // The page is already searchable. Do not tune, list the folder,
        // commit name batches, or stat saved paths. Those were the hitch
        // after Ready. An opened note is indexed on its own.
        let indexed_open = index_priority_files(
            conn,
            vault_root,
            opts.priority_rels,
            deep_head,
            &mut is_cancelled,
        );
        let stored: i64 = conn
            .query_row(
                "SELECT value FROM meta_kv WHERE key = 'shell_note_count'",
                [],
                |r| r.get::<_, String>(0),
            )
            .ok()
            .and_then(|s| s.parse().ok())
            .unwrap_or(0);
        let notes = if stored > 0 {
            stored
        } else {
            TITLE_READY_FLUSH as i64
        };
        if notes > TITLE_READY_FLUSH as i64 {
            crate::shell_catalog::update_page_snapshot_notes(opts.db_path, notes);
            emit(
                &mut progress,
                "catalog-counted",
                "ready-fts-partial",
                notes,
                0,
                0,
                0,
                None,
                &mut on_progress,
            );
        }
        return Ok(IndexFillResult {
            indexed: indexed_open,
            skipped: notes,
            errors: 0,
            notes,
            edges: 0,
            search_state: "ready-fts-partial".into(),
        });
    }
    on_progress(&progress);
    // Heads for notes already on the open page (mount seeded them) before
    // this walk reaches the rest of the vault. Deep fill announces Ready
    // first; counting every row here would make that wait on the catalog.
    if allow_early && opts.until != FillUntil::Deep {
        let n = commit_early_heads(
            conn,
            vault_root,
            short_head,
            EARLY_HEAD_CAP,
            &mut indexed,
            &mut errors,
            &mut written,
            &mut fresh_titles,
        );
        headed = n;
        if n > 0 {
            emit(
                &mut progress,
                "early-heads",
                "",
                n as i64,
                indexed,
                0,
                errors,
                Some("Tags from the open page…".into()),
                &mut on_progress,
            );
        }
    }
    let mut last_discover = Instant::now();
    struct ProgressBridge<'a> {
        progress: IndexFillProgress,
        on_progress: &'a mut dyn FnMut(&IndexFillProgress),
    }
    let bridge = RefCell::new(ProgressBridge {
        progress,
        on_progress: &mut on_progress,
    });
    let interactive_done = Cell::new(false);
    let interactive_edges = Cell::new(0i64);
    let mut prefix_batch: Vec<FillNote> = Vec::new();
    let is_cancelled: RefCell<Box<dyn FnMut() -> bool + 'a>> =
        RefCell::new(Box::new(is_cancelled));
    let deep = opts.until == FillUntil::Deep;
    let title_cap = if deep {
        TITLE_INTERACTIVE_CAP
    } else {
        usize::MAX
    };
    let ready_at = if deep { TITLE_READY_FLUSH } else { usize::MAX };
    let walk_gen = if deep { Some(next_walk_gen(conn)) } else { None };
    let mut prior: HashMap<String, ExistingNote> = HashMap::new();
    let pre_snapshot = if deep {
        None
    } else {
        Some(load_existing_notes(conn))
    };
    let (files, listed, walk_done) = collect_md_notes_publishing(
        vault_root,
        Some(DiscoverPublish {
            conn,
            allow_heads: allow_early && !deep,
            head_chars: short_head,
            vault: vault_root,
            headed: &mut headed,
            indexed: &mut indexed,
            errors: &mut errors,
            written: &mut written,
            fresh_titles: &mut fresh_titles,
            walk_gen,
            prior: &mut prior,
            tail_yield: false,
            last_checkpoint_at: 0,
            on_scanned: &mut |scanned, indexed_now, errors_now| {
                if last_discover.elapsed() >= Duration::from_millis(PROGRESS_EMIT_MS) {
                    let mut bridge = bridge.borrow_mut();
                    let b = &mut *bridge;
                    emit(
                        &mut b.progress,
                        "meta",
                        "",
                        scanned,
                        indexed_now,
                        0,
                        errors_now,
                        Some("Cataloging paths…".into()),
                        &mut *b.on_progress,
                    );
                    last_discover = Instant::now();
                }
            },
        }),
        opts.priority_rels,
        title_cap,
        ready_at,
        &is_cancelled,
        &mut |sink, prefix| {
            let scanned = prefix.len() as i64;
            let mut bridge = bridge.borrow_mut();
            let b = &mut *bridge;
            mark_title_search_live(sink.conn);
            emit(
                &mut b.progress,
                "ready-meta",
                "ready-meta",
                scanned,
                *sink.indexed,
                0,
                *sink.errors,
                Some("Title/path search ready".into()),
                &mut *b.on_progress,
            );
            emit(
                &mut b.progress,
                "done",
                "ready-fts-partial",
                scanned,
                *sink.indexed,
                0,
                *sink.errors,
                Some("Titles and open notes are searchable".into()),
                &mut *b.on_progress,
            );
            // Let the UI paint Ready and accept a keystroke before the next
            // directory batch. The rest of a fat folder is not read here.
            // The large page cache waits until that paint, so a cold open
            // is not behind a 1GB map of an index that already exists.
            // Later commits yield immediately, not only after the open window.
            sink.tail_yield = true;
            std::thread::sleep(Duration::from_millis(DISCOVER_TAIL_YIELD_MS));
            tune_fill_connection(sink.conn);
        },
        &mut |sink, prefix| {
            let scanned = prefix.len() as i64;
            {
                let mut cancel = is_cancelled.borrow_mut();
                index_prefix_deep(
                    sink.conn,
                    prefix,
                    opts.priority_rels,
                    deep_head,
                    &mut **cancel,
                    &mut prefix_batch,
                    sink.indexed,
                    sink.errors,
                    sink.written,
                    sink.fresh_titles,
                );
            }
            let edges = {
                let mut bridge = bridge.borrow_mut();
                let b = &mut *bridge;
                let edges = finalize_link_edges(
                    sink.conn,
                    0,
                    *sink.indexed,
                    true,
                    &mut b.progress,
                );
                emit(
                    &mut b.progress,
                    "ready-fts-partial",
                    "ready-fts-partial",
                    scanned,
                    *sink.indexed,
                    0,
                    *sink.errors,
                    Some("Open-set heads are searchable".into()),
                    &mut *b.on_progress,
                );
                edges
            };
            interactive_edges.set(edges);
            interactive_done.set(true);
        },
    );
    let mut progress = bridge.borrow().progress.clone();
    drop(bridge);
    // A vault smaller than the first page never took the post-Ready tune.
    if !interactive_done.get() {
        tune_fill_connection(conn);
    }
    if interactive_done.get() {
        let notes = listed;
        if walk_done {
            if errors == 0 {
                if let Some(gen) = walk_gen {
                    let _ = remove_stale_walk(conn, gen);
                }
            }
            crate::shell_catalog::mark_catalog_walk_done(conn);
            let _ = conn.execute_batch("PRAGMA wal_checkpoint(PASSIVE);");
            emit(
                &mut progress,
                "catalog-counted",
                "ready-fts-partial",
                notes,
                indexed,
                0,
                errors,
                None,
                &mut on_progress,
            );
        }
        return Ok(IndexFillResult {
            indexed,
            skipped: 0,
            errors,
            notes,
            edges: interactive_edges.get(),
            search_state: "ready-fts-partial".into(),
        });
    }
    let mut is_cancelled = is_cancelled.into_inner();
    // A vault smaller than the first page never took the post-Ready merge.
    merge_fts_segments(conn);
    backfill_note_fts_row_if_needed(conn);
    let existing = if deep {
        prior
    } else {
        pre_snapshot.unwrap_or_default()
    };
    let total = files.len() as i64;
    let headed = headed_depths(conn);
    progress.total = total;
    progress.indexed = indexed;
    progress.errors = errors;

    let mut skipped: i64 = 0;
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
        let touched = written.contains(&desk_node_id(&disk.rel));
        if (headed.contains_key(&disk.rel) || touched) && !opts.force_rebuild {
            let prev = existing.get(&disk.rel);
            let unchanged = prev.map(|p| note_unchanged(p, disk)).unwrap_or(true);
            if unchanged {
                // A title row landed with the path batch. A head landed for
                // the open page. Neither should be rewritten as an empty title.
                // Depth comes from the row written this fill, not the snapshot
                // taken before those early heads.
                let depth = headed.get(&disk.rel).copied().unwrap_or(FILL_DEPTH_META);
                if opts.until == FillUntil::Partial && depth < FILL_DEPTH_PARTIAL {
                    need_partial.push(i);
                } else if opts.until == FillUntil::Deep && depth < FILL_DEPTH_DEEP {
                    need_deep.push(i);
                }
                if depth >= target_depth {
                    skipped += 1;
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
                continue;
            }
        }
        let mut skip_meta = false;
        if !opts.force_rebuild {
            if let Some(prev) = existing.get(&disk.rel) {
                if note_unchanged(prev, disk) {
                    let depth = inferred_fill_depth(prev.fill_depth);
                    skip_meta = depth >= FILL_DEPTH_META;
                    if opts.until == FillUntil::Partial && depth < FILL_DEPTH_PARTIAL {
                        need_partial.push(i);
                    } else if opts.until == FillUntil::Deep && depth < FILL_DEPTH_DEEP {
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
        if opts.until == FillUntil::Partial {
            need_partial.push(i);
        } else if opts.until == FillUntil::Deep {
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
            flush_note_batch(
                conn,
                &mut batch,
                &mut indexed,
                &mut errors,
                &mut written,
                &mut fresh_titles,
            );
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
    flush_note_batch(
                conn,
                &mut batch,
                &mut indexed,
                &mut errors,
                &mut written,
                &mut fresh_titles,
            );
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

    if deep {
        if errors == 0 {
            if let Some(gen) = walk_gen {
                let _ = remove_stale_walk(conn, gen);
            }
        }
    } else {
        let _ = remove_stale_notes(conn, &existing, &seen);
    }

    if is_cancelled() || opts.until == FillUntil::Meta {
        let edges = finalize_link_edges(conn, skipped, indexed, false, &mut progress);
        crate::shell_catalog::mark_catalog_walk_done(conn);
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

    let mut headed_rows: i64 = 0;
    let mut phase_scanned: i64 = 0;
    last_emit = Instant::now();
    last_emitted_scanned = 0;

    if opts.until == FillUntil::Partial {
        need_partial.sort_by_key(|i| pri_rank.get(i).copied().unwrap_or(usize::MAX));
        let partial_total = need_partial.len() as i64;
        emit(
            &mut progress,
            "fts-partial",
            "ready-fts-partial",
            0,
            indexed,
            skipped,
            errors,
            Some("Filling short note heads…".into()),
            &mut on_progress,
        );
        index_note_heads(
            conn,
            &files,
            &need_partial,
            short_head,
            FILL_DEPTH_PARTIAL,
            &mut is_cancelled,
            &mut batch,
            &mut indexed,
            &mut errors,
            &mut written,
            &mut fresh_titles,
            &mut headed_rows,
            |n, indexed_now, errors_now| {
                phase_scanned += n;
                if should_emit_progress(last_emit, last_emitted_scanned, phase_scanned) {
                    emit(
                        &mut progress,
                        "fts-partial",
                        "ready-fts-partial",
                        phase_scanned.min(partial_total),
                        indexed_now,
                        skipped,
                        errors_now,
                        Some("Filling short note heads…".into()),
                        &mut on_progress,
                    );
                    last_emit = Instant::now();
                    last_emitted_scanned = phase_scanned;
                }
            },
        );
        flush_note_batch(
            conn,
            &mut batch,
            &mut indexed,
            &mut errors,
            &mut written,
            &mut fresh_titles,
        );
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
        let edges = finalize_link_edges(conn, skipped, indexed, true, &mut progress);
        crate::shell_catalog::mark_catalog_walk_done(conn);
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

    // Body reads stay inside a stable window. Priority notes when the
    // caller named some, otherwise the start of the walk. The window is
    // chosen before dropping notes that are already deep, so the next open
    // does not continue into the rest of the vault. A file already at the
    // deep head is not read again.
    let window = content_read_window(files.len(), opts.priority_rels, &files, &pri_rank);
    let window_set: HashSet<usize> = window.iter().copied().collect();
    let mut eager: Vec<usize> = need_deep
        .iter()
        .copied()
        .filter(|i| window_set.contains(i))
        .collect();
    eager.sort_by_key(|i| pri_rank.get(i).copied().unwrap_or(usize::MAX));
    let eager_n = eager.len();
    emit(
        &mut progress,
        "fts-partial",
        "ready-fts-partial",
        0,
        indexed,
        skipped,
        errors,
        Some("Filling heads for the open set…".into()),
        &mut on_progress,
    );
    index_note_heads(
        conn,
        &files,
        &eager,
        deep_head,
        FILL_DEPTH_DEEP,
        &mut is_cancelled,
        &mut batch,
        &mut indexed,
        &mut errors,
        &mut written,
        &mut fresh_titles,
        &mut headed_rows,
        |n, indexed_now, errors_now| {
            phase_scanned += n;
            if should_emit_progress(last_emit, last_emitted_scanned, phase_scanned) {
                emit(
                    &mut progress,
                    "fts-partial",
                    "ready-fts-partial",
                    phase_scanned.min(eager_n as i64),
                    indexed_now,
                    skipped,
                    errors_now,
                    Some("Filling heads for the open set…".into()),
                    &mut on_progress,
                );
                last_emit = Instant::now();
                last_emitted_scanned = phase_scanned;
            }
        },
    );
    flush_note_batch(
        conn,
        &mut batch,
        &mut indexed,
        &mut errors,
        &mut written,
        &mut fresh_titles,
    );
    let open_set_covers_vault =
        !is_cancelled() && need_deep.iter().all(|i| window_set.contains(i));
    emit(
        &mut progress,
        "ready-fts-partial",
        "ready-fts-partial",
        if open_set_covers_vault {
            total
        } else {
            phase_scanned
        },
        indexed,
        skipped,
        errors,
        Some(
            if open_set_covers_vault {
                "Note heads searchable".into()
            } else {
                "Open-set heads are searchable".into()
            },
        ),
        &mut on_progress,
    );

    crate::shell_catalog::mark_catalog_walk_done(conn);
    // PASSIVE never waits for writers; never TRUNCATE (that hung Tower after 100k rows).
    let _ = conn.execute_batch("PRAGMA wal_checkpoint(PASSIVE);");

    let search_state = if open_set_covers_vault {
        "ready-fts"
    } else {
        "ready-fts-partial"
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
        } else if open_set_covers_vault {
            "SQLite FTS5 BM25 ready".into()
        } else {
            "Titles and open notes are searchable".into()
        }),
        &mut on_progress,
    );
    Ok(result)
}

#[cfg(test)]
mod tests {
    use super::*;
    use rusqlite::{params, Connection};
    use std::cell::Cell;
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

    fn live_note_count(conn: &Connection) -> i64 {
        conn.query_row(
            "SELECT COUNT(*) FROM note_meta WHERE kind='note' AND deleted=0",
            [],
            |r| r.get(0),
        )
        .unwrap()
    }

    fn stored_note_count(conn: &Connection) -> i64 {
        conn.query_row(
            "SELECT CAST(value AS INTEGER) FROM meta_kv WHERE key='shell_note_count'",
            [],
            |r| r.get(0),
        )
        .unwrap_or(0)
    }

    #[test]
    fn reconcile_brings_a_warm_catalog_in_line_with_the_folder() {
        let (vault, db) = temp_pair("reconcile");
        write_official_shaped(&vault, 40);
        let mut conn = open_test_conn(&db);
        let _ = fill_until(&mut conn, &vault, false, FillUntil::Deep, &[]);
        assert!(title_search_already_live(&conn));
        let before = live_note_count(&conn);
        // Outside Nexus, after that fill: a root hub, a note in a new folder,
        // one note removed, and a total left over from a bigger vault.
        write_note(&vault, "Tip25e5EmbedHub.md", "# Tip25e5EmbedHub\n\n![[Hub 0]] #soak\n");
        write_note(&vault, "Fresh/Deep/Note Z.md", "# Note Z\n\nbody\n");
        let gone: String = conn
            .query_row(
                "SELECT path FROM note_meta WHERE kind='note' AND deleted=0 ORDER BY path LIMIT 1",
                [],
                |r| r.get(0),
            )
            .unwrap();
        fs::remove_file(vault.join(&gone)).unwrap();
        conn.execute(
            "INSERT INTO meta_kv(key, value) VALUES('shell_note_count', '500001')
             ON CONFLICT(key) DO UPDATE SET value=excluded.value",
            [],
        )
        .unwrap();
        // A warm reopen answers from the catalog and does not list the folder.
        let _ = fill_until(&mut conn, &vault, false, FillUntil::Deep, &[]);
        assert!(!fts_path_at(&db, "Tip25e5EmbedHub.md"), "warm Ready does not see new files");
        let out = reconcile_catalog_with_disk(&mut conn, &vault, || false);
        assert!(out.complete);
        assert_eq!(out.added, 2);
        assert_eq!(out.removed, 1);
        assert_eq!(out.notes, before + 1);
        assert_eq!(live_note_count(&conn), before + 1);
        assert_eq!(stored_note_count(&conn), before + 1, "the stale total is replaced, lower included");
        assert!(fts_path_at(&db, "Tip25e5EmbedHub.md"));
        assert!(fts_path_at(&db, "Fresh/Deep/Note Z.md"));
        assert!(!fts_path_at(&db, &gone));
        let hits: Vec<String> = crate::shell_catalog::query_suggest(&conn, "tip25e5", 10)
            .unwrap()
            .into_iter()
            .map(|h| h.path)
            .collect();
        assert_eq!(hits, vec!["Tip25e5EmbedHub.md".to_string()]);
        for dir in ["Fresh", "Fresh/Deep"] {
            let parent: Option<String> = conn
                .query_row(
                    "SELECT parent_id FROM note_meta WHERE path=?1 AND kind='folder' AND deleted=0",
                    params![dir],
                    |r| r.get(0),
                )
                .unwrap();
            assert_eq!(parent, dir.rsplit_once('/').map(|(p, _)| desk_node_id(p)));
        }
        let tags: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM tag_map WHERE note_id=?1 AND tag='soak'",
                params![desk_node_id("Tip25e5EmbedHub.md")],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(tags, 1, "a reconciled note has its head read");
        // Nothing changed since: a second pass is a no-op.
        let again = reconcile_catalog_with_disk(&mut conn, &vault, || false);
        assert_eq!((again.added, again.removed, again.notes), (0, 0, before + 1));
        // A folder that lists as empty does not wipe the catalog.
        let (empty, _) = temp_pair("reconcile-empty");
        let blank = reconcile_catalog_with_disk(&mut conn, &empty, || false);
        assert!(!blank.complete);
        assert_eq!(blank.removed, 0);
        assert_eq!(live_note_count(&conn), before + 1);
        // Cancelled: nothing is removed.
        fs::remove_file(vault.join("Tip25e5EmbedHub.md")).unwrap();
        let stopped = reconcile_catalog_with_disk(&mut conn, &vault, || true);
        assert!(!stopped.complete);
        assert_eq!(stopped.removed, 0);
    }

    #[test]
    fn watcher_paths_join_the_catalog_once() {
        let (vault, db) = temp_pair("admit");
        write_note(&vault, "A.md", "# A\n");
        let mut conn = open_test_conn(&db);
        let _ = fill_until(&mut conn, &vault, false, FillUntil::Deep, &[]);
        write_note(&vault, "Dropped.md", "# Dropped\n\nhello #new\n");
        write_note(&vault, "Box/Inner/Seeded.md", "# Seeded\n");
        write_note(&vault, ".hidden/x.md", "# x\n");
        write_note(&vault, "notes.txt", "not a note");
        let paths: Vec<String> = ["Dropped.md", "Box/Inner/Seeded.md", ".hidden/x.md", "notes.txt", "A.md", "../A.md"]
            .iter()
            .map(|s| s.to_string())
            .collect();
        let mut added = admit_new_paths(&mut conn, &vault, &paths);
        added.sort();
        assert_eq!(added, vec!["Box", "Box/Inner", "Box/Inner/Seeded.md", "Dropped.md"]);
        assert!(fts_path_at(&db, "Dropped.md"));
        assert!(fts_path_at(&db, "Box/Inner/Seeded.md"));
        assert!(!fts_path_at(&db, ".hidden/x.md"));
        assert!(admit_new_paths(&mut conn, &vault, &paths).is_empty(), "already in the catalog");
    }

    #[test]
    fn links_pass_reads_links_and_tags_for_notes_the_fill_left() {
        let (vault, db) = temp_pair("links-pass");
        write_note(&vault, "A.md", "# A\n\nSee [[B]] and [[C]]. #alpha\n");
        write_note(&vault, "Sub/B.md", "# B\n\n#beta [[A]]\n");
        write_note(&vault, "C.md", "# C\n\nno links here\n");
        let mut conn = open_test_conn(&db);
        let _ = fill_until(&mut conn, &vault, false, FillUntil::Meta, &[]);
        let edges_for = |conn: &Connection, rel: &str| -> Vec<String> {
            let mut stmt = conn
                .prepare("SELECT target_norm FROM link_edge WHERE source_id = ?1 ORDER BY target_norm")
                .unwrap();
            stmt.query_map(params![desk_node_id(rel)], |r| r.get::<_, String>(0))
                .unwrap()
                .filter_map(|r| r.ok())
                .collect()
        };
        let tags_for = |conn: &Connection, rel: &str| -> Vec<String> {
            let mut stmt = conn
                .prepare("SELECT tag FROM tag_map WHERE note_id = ?1 ORDER BY tag")
                .unwrap();
            stmt.query_map(params![desk_node_id(rel)], |r| r.get::<_, String>(0))
                .unwrap()
                .filter_map(|r| r.ok())
                .collect()
        };
        // A meta fill reads no bodies: nothing links yet, and the panels say so.
        let before = link_coverage(&conn);
        assert!(!before.complete, "{before:?}");
        assert_eq!(before.total, 3);
        // A stopped pass does no work and stays resumable.
        let stopped = run_links_pass(&mut conn, &vault, || true, |_| {}).unwrap();
        assert!(!stopped.complete);
        let mut batches = 0;
        let cov = run_links_pass(&mut conn, &vault, || false, |_| batches += 1).unwrap();
        assert!(cov.complete, "{cov:?}");
        assert_eq!(cov.scanned, cov.total);
        assert!(batches >= 1);
        assert_eq!(edges_for(&conn, "A.md"), vec!["b".to_string(), "c".to_string()]);
        assert_eq!(edges_for(&conn, "Sub/B.md"), vec!["a".to_string()]);
        assert_eq!(tags_for(&conn, "A.md"), vec!["alpha".to_string()]);
        assert_eq!(tags_for(&conn, "Sub/B.md"), vec!["beta".to_string()]);
        assert!(edges_for(&conn, "C.md").is_empty());
        // Nothing left: a second pass is a no-op and stays complete.
        assert!(run_links_pass(&mut conn, &vault, || false, |_| {}).unwrap().complete);
        // A note added later makes coverage incomplete until the pass reads it.
        write_note(&vault, "D.md", "# D\n\n[[C]] #delta\n");
        let _ = fill_until(&mut conn, &vault, false, FillUntil::Meta, &[]);
        assert!(!link_coverage(&conn).complete);
        assert!(run_links_pass(&mut conn, &vault, || false, |_| {}).unwrap().complete);
        assert_eq!(edges_for(&conn, "D.md"), vec!["c".to_string()]);
        assert_eq!(tags_for(&conn, "D.md"), vec!["delta".to_string()]);
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

    fn fts_path_at(db: &Path, path: &str) -> bool {
        open_reader(db)
            .query_row(
                "SELECT 1 FROM note_fts WHERE path = ?1 LIMIT 1",
                params![path],
                |_| Ok(1i64),
            )
            .is_ok()
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
    fn extract_tags_reads_frontmatter_and_hash_tags() {
        let body = "---\ntags: [Trip, planning]\n---\n# Hub\nSee #Road and `#skip`.\n";
        let got = extract_tags(body);
        assert!(got.contains(&"trip".to_string()));
        assert!(got.contains(&"planning".to_string()));
        assert!(got.contains(&"road".to_string()));
        assert!(!got.iter().any(|t| t == "skip"));
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
        let mut cluster_at_ready: Option<i64> = None;
        let mut late_body_at_ready = false;
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
                    cluster_at_ready = Some(fts_match_count_at(&db, "cluster"));
                    late_body_at_ready = fts_has_at(&db, "secretbodytoken");
                }
                if p.phase == "fts-partial" && fts_when_heads_started.is_none() {
                    fts_when_heads_started = Some(fts_row_count_at(&db));
                }
            },
        )
        .unwrap();

        let seeded = ready_meta_fts.expect("ready-meta must emit");
        assert!(
            seeded >= 2_400,
            "ready-meta FTS rows {seeded} should already include titles from the path walk"
        );
        assert!(
            hub_at_ready,
            "Hub.md must be in the title seed even if it walks last"
        );
        let cluster_rows = cluster_at_ready.expect("cluster count at ready-meta");
        assert!(
            cluster_rows > 0 && cluster_rows <= EARLY_HEAD_CAP as i64,
            "only the open-page head batch may carry body tokens at ready-meta, got {cluster_rows}"
        );
        assert!(
            !late_body_at_ready,
            "a note discovered late must not be body-indexed before the head pass"
        );
        let heads_start = fts_when_heads_started.expect("fts-partial must start");
        assert!(
            heads_start >= 2_400,
            "short-head fill should start after titles are already searchable, got {heads_start}"
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
            seed >= 3_000,
            "official ready-meta FTS rows {seed} should cover the walked titles"
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
    fn tags_from_indexed_heads_are_visible_before_deep_fill() {
        let (vault, db) = temp_pair("tags-partial");
        for i in 0..30 {
            write_note(
                &vault,
                &format!("n{i:02}.md"),
                &format!("#zeta\nnote {i}\n"),
            );
        }
        let mut conn = open_test_conn(&db);
        let (result, _) = fill_until(&mut conn, &vault, false, FillUntil::Partial, &[]);
        assert_eq!(result.search_state, "ready-fts-partial");
        let tags: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM tag_map WHERE tag='zeta'",
                [],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(tags, 30, "known heads must be in tag_map before the deep pass");
        let _ = fs::remove_dir_all(vault.parent().unwrap());
    }

    fn fill_depth_of(conn: &Connection, path: &str) -> i64 {
        conn.query_row(
            "SELECT COALESCE(fill_depth, -1) FROM note_meta WHERE path=?1",
            params![path],
            |r| r.get(0),
        )
        .unwrap_or(-1)
    }

    #[test]
    fn deep_fill_indexes_past_the_short_head_without_a_second_pass() {
        let (vault, db) = temp_pair("onepass");
        let mut body = "a".repeat(900);
        body.push_str("\ndeeptokenzz\n");
        write_note(&vault, "long.md", &body);
        write_note(&vault, "tiny.md", "tiny retrieval\n");
        let mut conn = open_test_conn(&db);

        let (partial, _) = fill_until(&mut conn, &vault, false, FillUntil::Partial, &[]);
        assert_eq!(partial.search_state, "ready-fts-partial");
        assert!(fts_has(&conn, "retrieval"));
        assert!(
            !fts_has(&conn, "deeptokenzz"),
            "a partial fill stays inside the short head"
        );
        assert_eq!(fill_depth_of(&conn, "long.md"), FILL_DEPTH_PARTIAL);

        let (deep, ticks) = fill(&mut conn, &vault, false);
        assert_eq!(deep.search_state, "ready-fts");
        assert_eq!(deep.indexed, 2, "deep upgrades both notes once");
        assert!(ticks.iter().any(|p| p.phase == "ready-fts-partial"));
        assert_eq!(ticks.last().map(|p| p.phase.as_str()), Some("done"));
        assert!(fts_has(&conn, "deeptokenzz"));
        assert!(fts_has(&conn, "retrieval"));
        assert_eq!(fill_depth_of(&conn, "long.md"), FILL_DEPTH_DEEP);
        assert_eq!(fill_depth_of(&conn, "tiny.md"), FILL_DEPTH_DEEP);

        let (again, _) = fill(&mut conn, &vault, false);
        assert_eq!(again.indexed, 0, "a finished deep head is not read again");
        assert_eq!(again.skipped, 2);

        let _ = fs::remove_dir_all(vault.parent().unwrap());
    }

    fn shallow_note_count(conn: &Connection) -> i64 {
        conn.query_row(
            "SELECT COUNT(*) FROM note_meta WHERE kind='note' AND COALESCE(fill_depth, 0) < ?1",
            params![FILL_DEPTH_DEEP],
            |r| r.get(0),
        )
        .unwrap()
    }

    fn deep_row_count(conn: &Connection) -> i64 {
        conn.query_row(
            "SELECT COUNT(*) FROM note_meta WHERE kind='note' AND fill_depth=?1",
            params![FILL_DEPTH_DEEP],
            |r| r.get(0),
        )
        .unwrap()
    }

    #[test]
    fn deep_titles_are_searchable_before_the_rest_of_the_folder() {
        let (vault, db) = temp_pair("titles");
        for i in 0..TITLE_INTERACTIVE_CAP + 40 {
            write_note(&vault, &format!("aa/n{i:04}.md"), "early body\n");
        }
        write_note(&vault, "zz/LateTitleToken.md", &format!("{}latebodytokenzz\n", "x".repeat(900)));
        let mut conn = open_test_conn(&db);
        let mut at_ready = false;
        let mut late_at_ready = false;
        let mut late_at_done = false;
        let mut done_scanned = -1i64;
        let result = fill_from_disk_with_opts(
            &mut conn,
            &vault,
            FillOpts {
                deep_head_chars: 8000,
                short_head_chars: 768,
                force_rebuild: false,
                db_path: "test.sqlite",
                priority_rels: &["aa".into()],
                until: FillUntil::Deep,
            },
            || false,
            |p| {
                if p.phase == "ready-meta" && !at_ready {
                    at_ready = true;
                    late_at_ready = fts_has_at(&db, "LateTitleToken");
                    assert!(
                        p.scanned <= TITLE_INTERACTIVE_CAP as i64,
                        "ready-meta scanned {} must stay inside the title window",
                        p.scanned
                    );
                }
                if p.phase == "done" {
                    late_at_done = fts_has_at(&db, "LateTitleToken");
                    done_scanned = p.scanned;
                }
            },
        )
        .unwrap();
        assert!(at_ready, "title search must be announced before the walk finishes");
        assert!(!late_at_ready, "a later folder is not required for title search");
        assert!(!late_at_done, "Ready must not wait for the rest of the listing");
        assert!(done_scanned <= TITLE_INTERACTIVE_CAP as i64);
        assert_eq!(result.notes, (TITLE_INTERACTIVE_CAP as i64) + 41);
        assert!(
            fts_has(&conn, "LateTitleToken"),
            "the rest of the titles still land after Ready"
        );
        assert!(
            !fts_has(&conn, "latebodytokenzz"),
            "the title tail does not read note bodies"
        );
        let _ = fs::remove_dir_all(vault.parent().unwrap());
    }

    #[test]
    fn hub_0_is_searchable_before_later_folders() {
        let (vault, db) = temp_pair("hub0");
        write_official_shaped(&vault, 1_500);
        let mut conn = open_test_conn(&db);
        let mut ready_scanned = -1i64;
        let mut hub_at_ready = false;
        let mut late_at_ready = false;
        let mut done_scanned = -1i64;
        fill_from_disk_with_opts(
            &mut conn,
            &vault,
            FillOpts {
                deep_head_chars: 8000,
                short_head_chars: 768,
                force_rebuild: false,
                db_path: "test.sqlite",
                priority_rels: &[],
                until: FillUntil::Deep,
            },
            || false,
            |p| {
                if p.phase == "ready-meta" && ready_scanned < 0 {
                    ready_scanned = p.scanned;
                    hub_at_ready = fts_path_at(&db, "00-Inbox/00/Hub 0.md");
                    late_at_ready = fts_path_at(&db, "60-Systems/00/Topic 6.md");
                }
                if p.phase == "done" && done_scanned < 0 {
                    done_scanned = p.scanned;
                }
            },
        )
        .unwrap();
        assert!(
            ready_scanned > 0 && ready_scanned <= TITLE_READY_FLUSH as i64,
            "ready-meta scanned {ready_scanned} must be the first page"
        );
        assert!(hub_at_ready, "Hub 0 is in the first title page");
        assert!(
            !late_at_ready,
            "a later folder is not required before title search"
        );
        assert!(
            done_scanned > 0 && done_scanned <= TITLE_READY_FLUSH as i64,
            "Ready scanned {done_scanned} must not wait for the full listing"
        );
        assert!(fts_path_at(&db, "60-Systems/00/Topic 6.md"));
        let _ = fs::remove_dir_all(vault.parent().unwrap());
    }

    #[test]
    fn hub_0_leads_a_fat_inbox_folder() {
        reset_fill_probes();
        let (vault, db) = temp_pair("hubfat");
        for i in 0..80 {
            write_note(&vault, &format!("00-Inbox/00/Hub {i}.md"), "hub\n");
        }
        write_note(&vault, "60-Systems/00/Topic 6.md", "later\n");
        let mut conn = open_test_conn(&db);
        let mut hub_at_ready = false;
        let mut late_hub_at_ready = false;
        let mut ready_scanned = -1i64;
        fill_from_disk_with_opts(
            &mut conn,
            &vault,
            FillOpts {
                deep_head_chars: 8000,
                short_head_chars: 768,
                force_rebuild: false,
                db_path: "test.sqlite",
                priority_rels: &[],
                until: FillUntil::Deep,
            },
            || false,
            |p| {
                if p.phase == "ready-meta" && ready_scanned < 0 {
                    ready_scanned = p.scanned;
                    hub_at_ready = fts_path_at(&db, "00-Inbox/00/Hub 0.md");
                    late_hub_at_ready = fts_path_at(&db, "00-Inbox/00/Hub 79.md");
                }
            },
        )
        .unwrap();
        assert!(
            ready_scanned > 0 && ready_scanned <= TITLE_READY_FLUSH as i64,
            "ready-meta scanned {ready_scanned} must be the first page"
        );
        assert!(hub_at_ready, "Hub 0 is the first title in a fat inbox folder");
        assert!(
            !late_hub_at_ready || ready_scanned <= TITLE_READY_FLUSH as i64,
            "Ready stays a page even when a later hub is in that page"
        );
        let looked = DIR_ENTRIES_BEFORE_READY.with(|c| c.get());
        assert!(
            looked <= 80,
            "Ready read {looked} directory entries in an 80-file folder"
        );
        assert!(fts_path_at(&db, "00-Inbox/00/Hub 79.md"));
        let _ = fs::remove_dir_all(vault.parent().unwrap());
    }

    #[test]
    fn warm_ready_does_not_reread_the_folder() {
        let (vault, db) = temp_pair("warm-ready");
        write_official_shaped(&vault, 40);
        reset_fill_probes();
        {
            let mut conn = open_test_conn(&db);
            fill_from_disk_with_opts(
                &mut conn,
                &vault,
                FillOpts {
                    deep_head_chars: 8000,
                    short_head_chars: 768,
                    force_rebuild: false,
                    db_path: "test.sqlite",
                    priority_rels: &[],
                    until: FillUntil::Deep,
                },
                || false,
                |_| {},
            )
            .unwrap();
            assert!(
                title_search_already_live(&conn),
                "the first page must remember that titles are searchable"
            );
        }
        let time_reopen = |db: &Path, vault: &Path| -> u128 {
            reset_fill_probes();
            let mut conn = open_test_conn(db);
            let started = Instant::now();
            let ready_ms = Cell::new(0u128);
            let looked = Cell::new(usize::MAX);
            fill_from_disk_with_opts(
                &mut conn,
                vault,
                FillOpts {
                    deep_head_chars: 8000,
                    short_head_chars: 768,
                    force_rebuild: false,
                    db_path: "test.sqlite",
                    priority_rels: &[],
                    until: FillUntil::Deep,
                },
                || false,
                |p| {
                    if p.phase == "ready-meta" && ready_ms.get() == 0 {
                        ready_ms.set(started.elapsed().as_millis().max(1));
                        looked.set(DIR_ENTRIES_BEFORE_READY.with(|c| c.get()));
                        assert!(
                            p.scanned > 0 && p.scanned <= TITLE_READY_FLUSH as i64,
                            "warm Ready scanned {}",
                            p.scanned
                        );
                        assert!(fts_path_at(db, "00-Inbox/00/Hub 0.md"));
                    }
                },
            )
            .unwrap();
            assert!(ready_ms.get() > 0, "warm open must announce Ready");
            assert_eq!(
                looked.get(),
                0,
                "warm Ready read {} directory entries",
                looked.get()
            );
            assert_eq!(
                DIR_LISTS.with(|c| c.get()),
                0,
                "a filled vault must not list the folder again"
            );
            ready_ms.get()
        };
        let flagged = time_reopen(&db, &vault);
        {
            let conn = open_test_conn(&db);
            clear_title_search_live(&conn);
            conn.execute(
                "INSERT INTO meta_kv(key, value) VALUES ('shell_note_count', '100000')
                 ON CONFLICT(key) DO UPDATE SET value = excluded.value",
                [],
            )
            .unwrap();
            assert!(
                title_search_already_live(&conn),
                "a stored catalog total plus an FTS row is still a warm index"
            );
        }
        let legacy = time_reopen(&db, &vault);
        assert!(
            flagged < 500 && legacy < 500,
            "warm Ready took {flagged}ms flagged / {legacy}ms legacy"
        );
        let _ = fs::remove_dir_all(vault.parent().unwrap());
    }

    #[test]
    fn wal_header_is_recognized_without_opening() {
        let (vault, db) = temp_pair("wal-header");
        {
            let _conn = open_test_conn(&db);
        }
        assert!(
            sqlite_header_is_wal(&db),
            "a closed WAL database should be recognizable from its header"
        );
        let _ = fs::remove_dir_all(vault.parent().unwrap());
    }

    #[test]
    fn oversized_journal_is_dropped_when_a_checkpoint_exists() {
        let (vault, db) = temp_pair("journal-drop");
        {
            let conn = open_test_conn(&db);
            conn.execute(
                "CREATE TABLE keep (id INTEGER PRIMARY KEY, label TEXT)",
                [],
            )
            .unwrap();
            conn.execute("INSERT INTO keep(label) VALUES ('checkpointed')", [])
                .unwrap();
        }
        // The last connection folds a small journal on close. A vault-sized
        // tail left beside an already-checkpointed file is what open must drop.
        let wal = PathBuf::from(format!("{}-wal", db.display()));
        let shm = PathBuf::from(format!("{}-shm", db.display()));
        fs::write(&wal, vec![0u8; 64]).unwrap();
        fs::write(&shm, vec![0u8; 32]).unwrap();
        let wal_len = fs::metadata(&wal).unwrap().len();
        assert!(
            discard_oversized_journal_with(&db, wal_len - 1, 1),
            "a checkpointed database must not replay a large journal"
        );
        assert!(!wal.exists(), "the journal tail should be gone");
        assert!(!shm.exists(), "the journal index should be gone");
        {
            let conn = open_test_conn(&db);
            let n: i64 = conn
                .query_row("SELECT COUNT(*) FROM keep", [], |r| r.get(0))
                .unwrap();
            assert_eq!(n, 1);
        }
        let (vault_keep, db_keep) = temp_pair("journal-keep");
        fs::write(&db_keep, vec![0u8; 100]).unwrap();
        let wal_keep = PathBuf::from(format!("{}-wal", db_keep.display()));
        fs::write(&wal_keep, vec![0u8; 64]).unwrap();
        let db_len = fs::metadata(&db_keep).unwrap().len();
        assert!(
            !discard_oversized_journal_with(&db_keep, 0, db_len.saturating_add(1)),
            "a journal that still holds the only copy must stay"
        );
        assert!(wal_keep.exists());
        let _ = fs::remove_dir_all(vault.parent().unwrap());
        let _ = fs::remove_dir_all(vault_keep.parent().unwrap());
    }

    #[test]
    fn ready_stops_reading_a_fat_directory() {
        reset_fill_probes();
        let (vault, db) = temp_pair("fat-stop");
        for i in 0..2_000 {
            write_note(&vault, &format!("Topic {i}.md"), "x\n");
        }
        write_note(&vault, "Hub 0.md", "hub\n");
        let mut conn = open_test_conn(&db);
        let mut ready_scanned = -1i64;
        let mut hub_at_ready = false;
        let mut looked = usize::MAX;
        fill_from_disk_with_opts(
            &mut conn,
            &vault,
            FillOpts {
                deep_head_chars: 8000,
                short_head_chars: 768,
                force_rebuild: false,
                db_path: "test.sqlite",
                priority_rels: &[],
                until: FillUntil::Deep,
            },
            || false,
            |p| {
                if p.phase == "ready-meta" && ready_scanned < 0 {
                    ready_scanned = p.scanned;
                    hub_at_ready = fts_path_at(&db, "Hub 0.md");
                    looked = DIR_ENTRIES_BEFORE_READY.with(|c| c.get());
                }
            },
        )
        .unwrap();
        assert!(
            ready_scanned > 0 && ready_scanned <= TITLE_READY_FLUSH as i64,
            "ready-meta scanned {ready_scanned} must be the first page"
        );
        assert!(hub_at_ready, "Hub 0 is opened without reading the whole folder");
        assert!(
            looked <= TITLE_READY_FLUSH + 16,
            "Ready read {looked} entries of a 2001-file folder"
        );
        assert!(fts_path_at(&db, "Topic 1999.md"));
        let _ = fs::remove_dir_all(vault.parent().unwrap());
    }

    fn reset_fill_probes() {
        EXISTING_CATALOG_ROWS_LOADED.with(|c| c.set(-1));
        TAIL_WAL_CHECKPOINTS.with(|c| c.set(0));
        MAX_LISTING_RETAINED.with(|c| c.set(0));
        DIR_ENTRIES_BEFORE_READY.with(|c| c.set(0));
        DIR_LISTS.with(|c| c.set(0));
    }

    fn ready_page_ms(vault: &Path, db: &Path) -> u128 {
        let mut conn = open_test_conn(db);
        let started = Instant::now();
        let mut ready_ms = 0u128;
        fill_from_disk_with_opts(
            &mut conn,
            vault,
            FillOpts {
                deep_head_chars: 8000,
                short_head_chars: 768,
                force_rebuild: false,
                db_path: "test.sqlite",
                priority_rels: &[],
                until: FillUntil::Deep,
            },
            || false,
            |p| {
                if p.phase == "ready-meta" && ready_ms == 0 {
                    ready_ms = started.elapsed().as_millis();
                    assert!(
                        p.scanned > 0 && p.scanned <= TITLE_READY_FLUSH as i64,
                        "ready scanned {} must stay the first page",
                        p.scanned
                    );
                    assert!(
                        fts_row_count_at(db) <= TITLE_READY_FLUSH as i64,
                        "title rows at Ready must stay the first page"
                    );
                    assert!(fts_path_at(db, "00-Inbox/00/Hub 0.md"));
                    assert!(!fts_path_at(db, "60-Systems/00/Topic 6.md"));
                    let looked = DIR_ENTRIES_BEFORE_READY.with(|c| c.get());
                    assert!(
                        looked <= 200,
                        "Ready read {looked} directory entries to reach the first page"
                    );
                }
            },
        )
        .unwrap();
        assert!(ready_ms > 0, "deep fill must announce the first page");
        assert_eq!(
            EXISTING_CATALOG_ROWS_LOADED.with(|c| c.get()),
            -1,
            "Ready must not snapshot the whole catalog"
        );
        assert!(
            MAX_LISTING_RETAINED.with(|c| c.get()) <= TITLE_INTERACTIVE_CAP,
            "the listing retained {} names",
            MAX_LISTING_RETAINED.with(|c| c.get())
        );
        ready_ms
    }

    #[test]
    fn first_page_cost_stays_flat_as_the_vault_grows() {
        let (small_vault, small_db) = temp_pair("flat-small");
        let (large_vault, large_db) = temp_pair("flat-large");
        write_official_shaped(&small_vault, 800);
        write_official_shaped(&large_vault, 4_800);
        reset_fill_probes();
        let small_ms = ready_page_ms(&small_vault, &small_db);
        reset_fill_probes();
        let large_ms = ready_page_ms(&large_vault, &large_db);
        assert!(
            large_ms < small_ms.saturating_mul(4) + 750,
            "6x notes made Ready {large_ms}ms vs {small_ms}ms"
        );
        assert!(
            TAIL_WAL_CHECKPOINTS.with(|c| c.get()) >= 1,
            "the title tail must checkpoint before the listing finishes"
        );
        let _ = fs::remove_dir_all(small_vault.parent().unwrap());
        let _ = fs::remove_dir_all(large_vault.parent().unwrap());
    }

    fn ready_ms_then_stop(vault: &Path, db: &Path) -> u128 {
        let mut conn = open_test_conn(db);
        let started = Instant::now();
        let ready_ms = Cell::new(0u128);
        let stop = Cell::new(false);
        let _ = fill_from_disk_with_opts(
            &mut conn,
            vault,
            FillOpts {
                deep_head_chars: 8000,
                short_head_chars: 768,
                force_rebuild: false,
                db_path: "test.sqlite",
                priority_rels: &[],
                until: FillUntil::Deep,
            },
            || stop.get(),
            |p| {
                if p.phase == "ready-meta" && ready_ms.get() == 0 {
                    ready_ms.set(started.elapsed().as_millis().max(1));
                    assert!(p.scanned > 0 && p.scanned <= TITLE_READY_FLUSH as i64);
                    assert!(fts_path_at(db, "00-Inbox/00/Hub 0.md"));
                    stop.set(true);
                }
            },
        );
        ready_ms.get()
    }

    fn insert_catalog_rows(conn: &mut Connection, n: usize) {
        let tx = conn.transaction().unwrap();
        {
            let mut stmt = tx
                .prepare(
                    "INSERT INTO note_meta(id, path, name, kind, parent_id, mtime, size, title, deleted, fill_depth)
                     VALUES (?1, ?2, ?3, 'note', NULL, 1, 8, ?3, 0, 1)",
                )
                .unwrap();
            for i in 0..n {
                let name = format!("Bulk {i}.md");
                stmt.execute(params![
                    format!("bulk-{i}"),
                    format!("bulk/{i}.md"),
                    name,
                ])
                .unwrap();
            }
        }
        tx.commit().unwrap();
    }

    #[test]
    fn ready_stays_flat_when_the_catalog_already_has_many_rows() {
        let (vault, db) = temp_pair("catflat");
        write_official_shaped(&vault, 900);
        let bare = ready_ms_then_stop(&vault, &db);
        {
            let mut conn = open_test_conn(&db);
            insert_catalog_rows(&mut conn, 80_000);
        }
        let crowded = ready_ms_then_stop(&vault, &db);
        assert!(bare > 0 && crowded > 0);
        assert!(
            crowded < bare.saturating_mul(3) + 800,
            "80k extra catalog rows made Ready {crowded}ms vs {bare}ms"
        );
        let _ = fs::remove_dir_all(vault.parent().unwrap());
    }

    /// Stand-in for a half-million-note catalog. Rows live in SQLite, not as
    /// files, so this measures Ready against index size. Run with
    /// `--ignored` when recording a number. Not part of the normal suite.
    #[test]
    #[ignore = "500k-row Ready probe, not CI"]
    fn ready_bench_half_million_catalog_not_ci() {
        let (vault, db) = temp_pair("cat500");
        write_official_shaped(&vault, 700);
        let bare = ready_ms_then_stop(&vault, &db);
        {
            let mut conn = open_test_conn(&db);
            insert_catalog_rows(&mut conn, 500_000);
        }
        let crowded = ready_ms_then_stop(&vault, &db);
        eprintln!("ready bare={bare}ms catalog_500k={crowded}ms");
        assert!(crowded < bare.saturating_mul(3) + 1_500, "{crowded} vs {bare}");
        let _ = fs::remove_dir_all(vault.parent().unwrap());
    }

    /// Names in one directory are scanned before Ready so Hub 0 leads that
    /// folder. Page size stays 32. Run with `--ignored` to time a fat folder.
    #[test]
    #[ignore = "fat-directory Ready probe, not CI"]
    fn ready_bench_fat_directory_not_ci() {
        let (small, small_db) = temp_pair("fat-small");
        let (large, large_db) = temp_pair("fat-large");
        for i in 0..2_000 {
            let name = if i == 0 { "Hub 0.md".into() } else { format!("Topic {i}.md") };
            write_note(&small, &format!("00-Inbox/{name}"), "x\n");
        }
        for i in 0..40_000 {
            let name = if i == 0 { "Hub 0.md".into() } else { format!("Topic {i}.md") };
            write_note(&large, &format!("00-Inbox/{name}"), "x\n");
        }
        let time_hub = |vault: &Path, db: &Path| -> u128 {
            let mut conn = open_test_conn(db);
            let started = Instant::now();
            let ready_ms = Cell::new(0u128);
            let stop = Cell::new(false);
            let _ = fill_from_disk_with_opts(
                &mut conn,
                vault,
                FillOpts {
                    deep_head_chars: 8000,
                    short_head_chars: 768,
                    force_rebuild: false,
                    db_path: "test.sqlite",
                    priority_rels: &[],
                    until: FillUntil::Deep,
                },
                || stop.get(),
                |p| {
                    if p.phase == "ready-meta" && ready_ms.get() == 0 {
                        ready_ms.set(started.elapsed().as_millis().max(1));
                        assert!(p.scanned <= TITLE_READY_FLUSH as i64);
                        assert!(fts_path_at(db, "00-Inbox/Hub 0.md"));
                        stop.set(true);
                    }
                },
            );
            ready_ms.get()
        };
        let small_ms = time_hub(&small, &small_db);
        let large_ms = time_hub(&large, &large_db);
        eprintln!("ready fat2k={small_ms}ms fat40k={large_ms}ms");
        assert!(small_ms > 0 && large_ms > 0);
        assert!(large_ms < small_ms.saturating_mul(8) + 2_000, "{large_ms} vs {small_ms}");
        let _ = fs::remove_dir_all(small.parent().unwrap());
        let _ = fs::remove_dir_all(large.parent().unwrap());
    }

    /// Official shape: 7 roots × 20 buckets. Ready only reads the first bucket,
    /// so vault size grows that bucket, not the whole walk. `--ignored`.
    #[test]
    #[ignore = "official-shaped file Ready probe, not CI"]
    fn ready_bench_official_files_not_ci() {
        let (small, small_db) = temp_pair("off-small");
        let (large, large_db) = temp_pair("off-large");
        write_official_shaped(&small, 8_000);
        write_official_shaped(&large, 80_000);
        let small_ms = ready_ms_then_stop(&small, &small_db);
        let large_ms = ready_ms_then_stop(&large, &large_db);
        eprintln!("ready official 8k={small_ms}ms 80k={large_ms}ms");
        assert!(large_ms < small_ms.saturating_mul(4) + 1_000, "{large_ms} vs {small_ms}");
        let _ = fs::remove_dir_all(small.parent().unwrap());
        let _ = fs::remove_dir_all(large.parent().unwrap());
    }

    #[test]
    fn fat_folder_page_does_not_keep_every_name() {
        let (vault, db) = temp_pair("fat-page");
        for i in 0..4_000 {
            let name = if i == 0 {
                "Hub 0.md".to_string()
            } else {
                format!("Topic {i}.md")
            };
            write_note(&vault, &format!("00-Inbox/{name}"), "x\n");
        }
        write_note(&vault, "60-Systems/Topic 9.md", "later\n");
        reset_fill_probes();
        let mut conn = open_test_conn(&db);
        let mut hub_at_ready = false;
        let mut late_at_ready = false;
        fill_from_disk_with_opts(
            &mut conn,
            &vault,
            FillOpts {
                deep_head_chars: 8000,
                short_head_chars: 768,
                force_rebuild: false,
                db_path: "test.sqlite",
                priority_rels: &[],
                until: FillUntil::Deep,
            },
            || false,
            |p| {
                if p.phase == "ready-meta" && !hub_at_ready {
                    hub_at_ready = fts_path_at(&db, "00-Inbox/Hub 0.md");
                    late_at_ready = fts_path_at(&db, "00-Inbox/Topic 3999.md");
                }
            },
        )
        .unwrap();
        assert!(hub_at_ready, "Hub 0 is on the first page of a fat folder");
        assert!(!late_at_ready, "a late name in that folder waits for the tail");
        assert!(fts_path_at(&db, "00-Inbox/Topic 3999.md"));
        assert_eq!(EXISTING_CATALOG_ROWS_LOADED.with(|c| c.get()), -1);
        assert!(MAX_LISTING_RETAINED.with(|c| c.get()) <= TITLE_INTERACTIVE_CAP);
        assert!(TAIL_WAL_CHECKPOINTS.with(|c| c.get()) >= 1);
        let _ = fs::remove_dir_all(vault.parent().unwrap());
    }

    #[test]
    fn deep_reopen_drops_a_deleted_note_without_a_catalog_snapshot() {
        let (vault, db) = temp_pair("stale-gen");
        for i in 0..(TITLE_INTERACTIVE_CAP + 40) {
            write_note(&vault, &format!("keep/n{i:04}.md"), "keep\n");
        }
        write_note(&vault, "drop/gone.md", "gone\n");
        let mut conn = open_test_conn(&db);
        let opts = FillOpts {
            deep_head_chars: 8000,
            short_head_chars: 768,
            force_rebuild: false,
            db_path: "test.sqlite",
            priority_rels: &[],
            until: FillUntil::Deep,
        };
        fill_from_disk_with_opts(&mut conn, &vault, opts, || false, |_| {}).unwrap();
        assert!(fts_path_at(&db, "drop/gone.md"));
        fs::remove_file(vault.join("drop/gone.md")).unwrap();
        reset_fill_probes();
        let again = fill_from_disk_with_opts(
            &mut conn,
            &vault,
            FillOpts {
                deep_head_chars: 8000,
                short_head_chars: 768,
                force_rebuild: false,
                db_path: "test.sqlite",
                priority_rels: &[],
                until: FillUntil::Deep,
            },
            || false,
            |_| {},
        )
        .unwrap();
        assert!(
            fts_path_at(&db, "drop/gone.md"),
            "a filled reopen must not stat the catalog to drop a file"
        );
        assert_eq!(DIR_LISTS.with(|c| c.get()), 0);
        assert!(fts_path_at(&db, "keep/n0000.md"));
        assert_eq!(EXISTING_CATALOG_ROWS_LOADED.with(|c| c.get()), -1);
        assert!(again.notes >= TITLE_INTERACTIVE_CAP as i64);
        let removed = drop_missing_catalog_files(&mut conn, &vault, &mut || false);
        assert!(removed >= 1);
        assert!(!fts_path_at(&db, "drop/gone.md"));
        let _ = fs::remove_dir_all(vault.parent().unwrap());
    }

    #[test]
    fn cancelled_title_tail_keeps_notes_it_has_not_listed_yet() {
        let (vault, db) = temp_pair("tail-cancel");
        for i in 0..TITLE_INTERACTIVE_CAP + 8 {
            write_note(&vault, &format!("aa/n{i:04}.md"), "early body\n");
        }
        write_note(&vault, "zz/LateTitleToken.md", "late body\n");
        let mut conn = open_test_conn(&db);
        fill_from_disk_with_opts(
            &mut conn,
            &vault,
            FillOpts {
                deep_head_chars: 8000,
                short_head_chars: 768,
                force_rebuild: false,
                db_path: "test.sqlite",
                priority_rels: &["aa".into()],
                until: FillUntil::Deep,
            },
            || false,
            |_| {},
        )
        .unwrap();
        assert!(fts_has(&conn, "LateTitleToken"));
        let mut cancel = true;
        fill_from_disk_with_opts(
            &mut conn,
            &vault,
            FillOpts {
                deep_head_chars: 8000,
                short_head_chars: 768,
                force_rebuild: false,
                db_path: "test.sqlite",
                priority_rels: &["aa".into()],
                until: FillUntil::Deep,
            },
            || {
                let stop = cancel;
                cancel = true;
                stop
            },
            |_| {},
        )
        .unwrap();
        assert!(
            fts_has(&conn, "LateTitleToken"),
            "stopping the listing must not drop a note it has not reached"
        );
        let _ = fs::remove_dir_all(vault.parent().unwrap());
    }

    #[test]
    fn deep_fill_indexes_the_open_window_and_stops() {
        let (vault, db) = temp_pair("eager");
        let n = EAGER_CONTENT_CAP + 20;
        for i in 0..n {
            let body = if i < EAGER_CONTENT_CAP {
                "cluster token in the open set\n".to_string()
            } else {
                format!("beyondwindowtoken {i}\n")
            };
            write_note(&vault, &format!("eager/n{i:04}.md"), &body);
        }
        let mut late = String::from("headtokenzz\n");
        late.push_str(&"x".repeat(900));
        late.push_str("\ndeeptokenzz\n");
        write_note(&vault, "tail/late.md", &late);

        let mut conn = open_test_conn(&db);
        let mut saw_fts_tail = false;
        let mut at_open_set = false;
        let result = fill_from_disk_with_opts(
            &mut conn,
            &vault,
            FillOpts {
                deep_head_chars: 8000,
                short_head_chars: 768,
                force_rebuild: false,
                db_path: "test.sqlite",
                priority_rels: &["eager".into()],
                until: FillUntil::Deep,
            },
            || false,
            |p| {
                if p.phase == "fts" {
                    saw_fts_tail = true;
                }
                if p.phase == "ready-fts-partial" && !at_open_set {
                    at_open_set = true;
                    assert!(
                        fts_has_at(&db, "cluster"),
                        "the open window must be searchable when heads are announced"
                    );
                    assert!(
                        !fts_has_at(&db, "deeptokenzz"),
                        "a note outside the window must still be unread"
                    );
                    assert!(
                        p.scanned <= EAGER_CONTENT_CAP as i64,
                        "ready-fts-partial scanned {} must stay inside the cap",
                        p.scanned
                    );
                }
            },
        )
        .unwrap();

        assert!(at_open_set, "deep fill must announce the open window");
        assert!(!saw_fts_tail, "deep fill must not start a vault-sized tail phase");
        assert_eq!(result.search_state, "ready-fts-partial");
        assert_eq!(result.notes, (n as i64) + 1);
        assert!(fts_has(&conn, "cluster"));
        assert!(
            !fts_has(&conn, "deeptokenzz"),
            "a note outside the priority window is not body-indexed"
        );
        assert_ne!(fill_depth_of(&conn, "tail/late.md"), FILL_DEPTH_DEEP);
        assert_eq!(
            deep_row_count(&conn),
            EAGER_CONTENT_CAP as i64,
            "body reads stop at the cap"
        );
        assert_eq!(shallow_note_count(&conn), 21, "the cap leaves the rest shallow");

        let (again, _) = fill_until(&mut conn, &vault, false, FillUntil::Deep, &["eager".into()]);
        assert_eq!(again.indexed, 0, "a reopen must not advance into the rest");
        assert_eq!(again.search_state, "ready-fts-partial");
        assert_eq!(deep_row_count(&conn), EAGER_CONTENT_CAP as i64);
        assert!(!fts_has(&conn, "deeptokenzz"));

        let (opened, _) = fill_until(
            &mut conn,
            &vault,
            false,
            FillUntil::Deep,
            &["tail/late.md".into()],
        );
        assert_eq!(opened.indexed, 1, "opening that note indexes that note");
        assert!(fts_has(&conn, "deeptokenzz"));
        assert_eq!(shallow_note_count(&conn), 20, "opening one note does not walk the rest");
        assert_eq!(deep_row_count(&conn), (EAGER_CONTENT_CAP as i64) + 1);

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
            FTS_WRITE_BATCH <= 512,
            "FTS write batch {FTS_WRITE_BATCH} re-creates multi-second WAL locks"
        );
        assert!(
            READ_CHUNK <= 512,
            "read chunk {READ_CHUNK} saturates disk ahead of note open"
        );
        assert!(
            FILL_YIELD_MS >= 2,
            "fill must yield after a real write batch"
        );
        assert!(
            FILL_READ_WORKERS_MAX <= 4,
            "head readers must not take every core/disk queue"
        );
        assert!(
            EAGER_CONTENT_CAP <= 1024 && EAGER_CONTENT_CAP >= 200,
            "open-set head cap {EAGER_CONTENT_CAP} must stay a page, not the vault"
        );
        assert_eq!(TITLE_INTERACTIVE_CAP, EAGER_CONTENT_CAP);
        assert!(
            TITLE_READY_FLUSH >= 16 && TITLE_READY_FLUSH <= 64,
            "first title page {TITLE_READY_FLUSH} must stay a page"
        );
        assert!(TITLE_READY_FLUSH < TITLE_INTERACTIVE_CAP);
        assert!(
            DISCOVER_TAIL_YIELD_MS >= 16 && DISCOVER_TAIL_YIELD_MS <= 80,
            "title tail yield {DISCOVER_TAIL_YIELD_MS}ms must leave the disk free without stalling the listing"
        );
        assert!(
            TAIL_CHECKPOINT_EVERY >= 1024 && TAIL_CHECKPOINT_EVERY <= 8192,
            "tail checkpoint {TAIL_CHECKPOINT_EVERY} must keep the journal page-sized"
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
            seeded >= 9_000,
            "10k ready-meta FTS rows {seeded} should cover titles from the path walk"
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

    #[test]
    fn seeded_page_is_searchable_before_the_walk() {
        let (vault, db) = temp_pair("seedpage");
        write_n(&vault, 30);
        write_note(
            &vault,
            "zz-late/Hub.md",
            "secretbodytoken cluster retrieval\n",
        );
        let mut conn = open_test_conn(&db);
        ensure_fill_depth_column(&conn);
        let complete = crate::shell_catalog::seed_first_page(&mut conn, &vault, None).unwrap();
        assert!(!complete);
        let mut early_total: Option<i64> = None;
        let mut cluster_early = false;
        let mut late_early = false;
        let _ = fill_from_disk_with_opts(
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
                if p.phase == "early-heads" && early_total.is_none() {
                    early_total = Some(p.total);
                    cluster_early = fts_has_at(&db, "cluster");
                    late_early = fts_has_at(&db, "secretbodytoken");
                }
            },
        )
        .unwrap();
        assert_eq!(
            early_total,
            Some(0),
            "open-page heads commit before the walk knows the vault size"
        );
        assert!(cluster_early, "a seeded root note is searchable before the walk");
        assert!(
            !late_early,
            "a nested note is not body-indexed with the first page"
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
        write_note(&vault, "n00000.md", "# Note 0\n\n#opentag cluster hub retrieval token 0\n");
        write_note(
            &vault,
            "zz-late/Hub.md",
            "secretbodytoken cluster retrieval\n",
        );
        let mut conn = open_test_conn(&db);
        ensure_fill_depth_column(&conn);
        let t0 = Instant::now();
        let page_rows = crate::shell_catalog::seed_first_page(&mut conn, &vault, Some("zz-late/Hub.md"))
            .expect("seed");
        let first_page_ms = t0.elapsed().as_millis();
        let mut early_ms: Option<u128> = None;
        let mut early_cluster = false;
        let mut early_tag = false;
        let mut titles_50_ms: Option<u128> = None;
        let mut titles_90_ms: Option<u128> = None;
        let mut ready_meta_ms: Option<u128> = None;
        let mut hub_ms: Option<u128> = None;
        let mut cluster_ms: Option<u128> = None;
        let mut short_head_ms: Option<u128> = None;
        let mut bodies_50_ms: Option<u128> = None;
        let mut bodies_90_ms: Option<u128> = None;
        let mut seeded: Option<i64> = None;
        let until = match std::env::var("NEXUS_FILL_PROBE_UNTIL").as_deref() {
            Ok("deep") => FillUntil::Deep,
            _ => FillUntil::Partial,
        };
        let half = (n as i64) / 2;
        let most = (n as i64) * 9 / 10;
        let result = fill_from_disk_with_opts(
            &mut conn,
            &vault,
            FillOpts {
                deep_head_chars: 8000,
                short_head_chars: 768,
                force_rebuild: false,
                db_path: "test.sqlite",
                priority_rels: &[],
                until,
            },
            || false,
            |p| {
                if p.phase == "early-heads" && early_ms.is_none() {
                    early_ms = Some(t0.elapsed().as_millis());
                    early_cluster = fts_has_at(&db, "cluster");
                    let tags: i64 = open_reader(&db)
                        .query_row(
                            "SELECT COUNT(*) FROM tag_map WHERE tag='opentag'",
                            [],
                            |r| r.get(0),
                        )
                        .unwrap_or(0);
                    early_tag = tags > 0;
                }
                if titles_90_ms.is_none()
                    && (p.phase == "meta" || p.phase == "ready-meta" || p.phase == "early-heads")
                {
                    let rows = fts_row_count_at(&db);
                    let now = t0.elapsed().as_millis();
                    if titles_50_ms.is_none() && rows >= half {
                        titles_50_ms = Some(now);
                    }
                    if rows >= most {
                        titles_90_ms = Some(now);
                    }
                }
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
                if (p.phase == "fts-partial" || p.phase == "ready-fts-partial") && p.scanned > 0 {
                    let now = t0.elapsed().as_millis();
                    if bodies_50_ms.is_none() && p.scanned >= half {
                        bodies_50_ms = Some(now);
                    }
                    if bodies_90_ms.is_none() && p.scanned >= most {
                        bodies_90_ms = Some(now);
                    }
                }
                if p.phase == "ready-fts-partial" && short_head_ms.is_none() {
                    short_head_ms = Some(t0.elapsed().as_millis());
                }
            },
        )
        .unwrap();
        eprintln!(
            "probe n={} until={until:?} page_complete={} first_page_ms={} early_heads_ms={:?} early_cluster={} early_tag={} titles_50_ms={:?} titles_90_ms={:?} ready-meta {:?}ms seed {:?} hub {:?}ms cluster {:?}ms bodies_50_ms={:?} bodies_90_ms={:?} short_head_ms={:?} total {}ms notes={} state {}",
            n,
            page_rows,
            first_page_ms,
            early_ms,
            early_cluster,
            early_tag,
            titles_50_ms,
            titles_90_ms,
            ready_meta_ms,
            seeded,
            hub_ms,
            cluster_ms,
            bodies_50_ms,
            bodies_90_ms,
            short_head_ms,
            t0.elapsed().as_millis(),
            result.notes,
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
