//! Directory walk that publishes titles while the vault is listed, plus catalog reconcile.

use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use std::cell::{Cell, RefCell};
use std::collections::{BTreeSet, HashMap, HashSet};
use std::io::Read;
use std::path::{Path, PathBuf};
use std::time::{Duration, Instant};

use super::fts::{
    add_note_meta_column, backfill_note_fts_row_chunk, delete_note_fts, flush_note_batch,
    is_priority_rel, is_title_seed_hot_name, meta_fill_note, normalize_rel, parent_id_for,
    take_head, title_from_name_and_head, write_note_batch,
};
use super::links::{desk_node_id, extract_tags, extract_wikilink_targets};
use super::{
    cooperate_after_write, index_priority_files, DiskNote, ExistingNote, FillNote, DEFAULT_DEEP_HEAD,
    DISCOVER_BATCH, DISCOVER_TAIL_YIELD_MS, EARLY_HEAD_CAP, FILL_DEPTH_PARTIAL, FILL_SKIP_DIRS,
    FTS_WRITE_BATCH, POST_READY_DIR_BATCH, TAIL_CHECKPOINT_EVERY,
};

pub(super) fn load_existing_notes(conn: &Connection) -> HashMap<String, ExistingNote> {
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
    pub(super) static EXISTING_CATALOG_ROWS_LOADED: Cell<i64> = Cell::new(0);
    pub(super) static TAIL_WAL_CHECKPOINTS: Cell<u32> = Cell::new(0);
    pub(super) static MAX_LISTING_RETAINED: Cell<usize> = Cell::new(0);
    /// Directory entries pulled before Ready. A fat folder must not add one
    /// entry per file.
    pub(super) static DIR_ENTRIES_BEFORE_READY: Cell<usize> = Cell::new(0);
    pub(super) static DIR_LISTS: Cell<usize> = Cell::new(0);
}

#[cfg(test)]
pub(super) fn note_listing_retained(n: usize) {
    MAX_LISTING_RETAINED.with(|c| {
        if n > c.get() {
            c.set(n);
        }
    });
}

#[cfg(not(test))]
pub(super) fn note_listing_retained(_: usize) {}

#[cfg(test)]
pub(super) fn note_dir_entry_before_ready() {
    DIR_ENTRIES_BEFORE_READY.with(|c| c.set(c.get() + 1));
}

#[cfg(not(test))]
pub(super) fn note_dir_entry_before_ready() {}

pub(super) fn ensure_walk_gen_column(conn: &Connection) -> Result<(), String> {
    add_note_meta_column(conn, "walk_gen", "INTEGER")
}

pub(super) fn next_walk_gen(conn: &Connection) -> Result<i64, String> {
    ensure_walk_gen_column(conn)?;
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
    Ok(next)
}

pub(super) fn cache_prior(
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

pub(super) fn existing_note(conn: &Connection, rel: &str) -> Option<ExistingNote> {
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

pub(super) fn stamp_walk_gen(conn: &Connection, gen: i64, notes: &[DiskNote]) -> Result<(), String> {
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

pub(super) struct DiscoverPublish<'a> {
    pub(super) conn: &'a mut Connection,
    pub(super) allow_heads: bool,
    pub(super) head_chars: usize,
    pub(super) vault: &'a Path,
    pub(super) headed: &'a mut usize,
    pub(super) indexed: &'a mut i64,
    pub(super) errors: &'a mut i64,
    pub(super) written: &'a mut HashSet<String>,
    pub(super) fresh_titles: &'a mut HashSet<String>,
    /// Set on every note this full walk touches. Stale removal uses it so
    /// the walk does not keep every path in memory.
    pub(super) walk_gen: Option<i64>,
    /// Mtimes from before this walk updates them. Only the interactive
    /// window is kept, so a large folder does not become a second catalog.
    pub(super) prior: &'a mut HashMap<String, ExistingNote>,
    pub(super) on_scanned: &'a mut dyn FnMut(i64, i64, i64),
    /// After the interactive title window, each batch sleeps.
    pub(super) tail_yield: bool,
    pub(super) last_checkpoint_at: i64,
}

pub(super) struct LiteEntry {
    pub(super) abs: PathBuf,
    pub(super) rel: String,
    pub(super) name: String,
}

#[derive(Clone, PartialEq, Eq, PartialOrd, Ord)]
pub(super) struct RankedFile {
    name: String,
    rel: String,
    abs: PathBuf,
}

pub(super) fn keep_smallest(set: &mut BTreeSet<RankedFile>, file: RankedFile, k: usize) {
    if k == 0 {
        return;
    }
    set.insert(file);
    if set.len() > k {
        set.pop_last();
    }
}

pub(super) fn is_md_name(name: &str) -> bool {
    let b = name.as_bytes();
    b.len() >= 3 && b[b.len() - 3..].eq_ignore_ascii_case(b".md")
}

pub(super) fn is_note_name(name: &str) -> bool {
    if is_md_name(name) {
        return true;
    }
    let b = name.as_bytes();
    b.len() >= 7 && b[b.len() - 7..].eq_ignore_ascii_case(b".canvas")
}

pub(super) fn child_rel(rel: &str, name: &str) -> String {
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
pub(super) fn note_dir_list() {
    DIR_LISTS.with(|c| c.set(c.get() + 1));
}

#[cfg(not(test))]
pub(super) fn note_dir_list() {}

pub(super) fn list_dir_window(
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
        if is_note_name(&name) {
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
pub(super) fn list_dir_ready_page(
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
        if is_note_name(&name) {
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

pub(super) fn disk_note_from_lite(lite: LiteEntry) -> DiskNote {
    use std::time::SystemTime;
    let meta = std::fs::metadata(&lite.abs).ok();
    let mtime = meta
        .as_ref()
        .and_then(|m| m.modified().ok())
        .and_then(|t| t.duration_since(SystemTime::UNIX_EPOCH).ok())
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0);
    let ctime = meta.as_ref().and_then(|m| created_ms(m));
    let size = meta.map(|m| m.len() as i64).unwrap_or(0);
    DiskNote {
        abs: lite.abs,
        rel: lite.rel,
        name: lite.name,
        mtime,
        size,
        ctime,
    }
}

pub(super) fn created_ms(meta: &std::fs::Metadata) -> Option<i64> {
    use std::time::SystemTime;
    meta.created()
        .ok()
        .and_then(|t| t.duration_since(SystemTime::UNIX_EPOCH).ok())
        .map(|d| d.as_millis() as i64)
}

pub(super) fn flush_unpublished(
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

pub(super) fn stream_dir_tail<'p, 'c>(
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
        if is_note_name(&name) {
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
pub(super) fn collect_md_notes_publishing<'a>(
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
        if !rel.to_ascii_lowercase().ends_with(".md") && !rel.to_ascii_lowercase().ends_with(".canvas") {
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

pub(super) fn publish_discovered(sink: &mut DiscoverPublish<'_>, notes: &[DiskNote], scanned: i64) {
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

pub(super) fn commit_early_heads(
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
        let ctime = meta.as_ref().and_then(|m| created_ms(m));
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
            ctime,
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
pub(super) const RECONCILE_PAGE: i64 = 2_000;
pub(super) const RECONCILE_DELETE_BATCH: usize = 512;

/// Every note and folder under the vault by the fill's rules, sorted by
/// byte order (the catalog's `path` order). None when a directory could not
/// be read or the walk was cancelled.
pub(super) fn list_vault_paths(
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
            } else if kind.is_file() && is_note_name(&name) {
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
pub(super) fn diff_catalog_kind(
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

pub(super) fn delete_catalog_rows(conn: &mut Connection, root: &Path, rows: &[(String, String)]) -> i64 {
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

pub(super) fn folder_rows_for(dirs: &[String]) -> Vec<crate::shell_catalog::ShellRow> {
    dirs.iter()
        .map(|rel| crate::shell_catalog::ShellRow {
            id: desk_node_id(rel),
            path: rel.clone(),
            name: rel.rsplit('/').next().unwrap_or(rel).to_string(),
            kind: "folder".into(),
            parent_id: parent_id_for(rel),
            mtime: 0,
            child_notes: 0,
            size: None,
            ctime: None,
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
    mut on_listed: impl FnMut(&CatalogReconcile),
) -> CatalogReconcile {
    let mut out = CatalogReconcile::default();
    let listing = list_vault_paths(root, &mut is_cancelled);
    if let Some((disk_notes, disk_dirs)) = listing {
        // The folder is the count. Say it now; adding and dropping rows can
        // take a while on a folder that changed a lot.
        if !disk_notes.is_empty() {
            on_listed(&CatalogReconcile {
                notes: disk_notes.len() as i64,
                folders: disk_dirs.len() as i64,
                complete: true,
                ..CatalogReconcile::default()
            });
        }
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
        if !is_dir && !(is_note_name(&rel) && abs.is_file()) {
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
pub(super) fn drop_missing_catalog_files(
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
