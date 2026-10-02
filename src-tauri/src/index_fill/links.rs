//! Link pass: wikilink and tag extraction, then the post-Ready links walk.

use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use std::collections::{BTreeSet, HashSet};
use std::io::Read;
use std::path::Path;
use std::time::Duration;

use super::{FILL_DEPTH_PARTIAL, FILL_YIELD_MS, IndexFillProgress};

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

pub(super) fn note_target_from_inner(inner: &str) -> String {
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

pub(super) fn strip_code_for_link_scan(markdown: &str) -> String {
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

pub(super) fn tag_token_ok(token: &str) -> bool {
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

pub(super) fn replace_note_tags(conn: &Connection, id: &str, tags: &[String]) -> Result<(), String> {
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
pub(super) const LINKS_PASS_MAX_BYTES: u64 = 512 * 1024;

pub(super) fn meta_i64(conn: &Connection, key: &str) -> i64 {
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
pub(super) fn backfill_tags_from_fts(conn: &mut Connection) -> Result<(), String> {
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

pub(super) fn tags_indexed_flag(conn: &Connection) -> bool {
    conn.query_row(
        "SELECT value FROM meta_kv WHERE key = 'tags_indexed'",
        [],
        |r| r.get::<_, String>(0),
    )
    .ok()
    .map(|v| v == "1")
    .unwrap_or(false)
}

pub(super) fn set_tags_indexed_flag(conn: &Connection) {
    let _ = conn.execute(
        "INSERT INTO meta_kv(key, value) VALUES ('tags_indexed', '1')
         ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        [],
    );
}

pub(super) fn ensure_tags_from_bodies(conn: &mut Connection, indexed: i64) {
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

pub(super) fn count_link_edges(conn: &Connection) -> i64 {
    conn.query_row("SELECT COUNT(*) FROM link_edge", [], |r| r.get(0))
        .unwrap_or(0)
}

pub(super) fn finalize_link_edges(
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

pub(super) fn links_indexed_flag(conn: &Connection) -> bool {
    conn.query_row(
        "SELECT value FROM meta_kv WHERE key = 'links_indexed'",
        [],
        |r| r.get::<_, String>(0),
    )
    .ok()
    .map(|v| v == "1")
    .unwrap_or(false)
}

pub(super) fn set_links_indexed_flag(conn: &Connection) {
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
