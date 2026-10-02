//! Phased SQLite FTS5 fill from a vault folder.
//!
//! Cold open must not wait for a full body index before title search.
//! Desktop commits title/path FTS rows as each directory batch lands and
//! emits `ready-meta` when the interactive title window is in, before the
//! rest of the folder is listed. `FillUntil::Partial`
//! then reads short heads. `FillUntil::Deep` (the desktop path) reads note
//! text only for a bounded window: the priority open set, or the first
//! page of the walk when no priority was passed, never more than
//! `EAGER_CONTENT_CAP` files. That window is announced before the rest of
//! the bodies are read, so Ready stays a page. The same deep fill then
//! reads the remaining notes in small batches. An unopened note's text is
//! searchable when that pass finishes, without a second open. `FillUntil::Meta`
//! catalogs titles only. No Tauri imports — also compiled by `src-tauri/fill-test`.
//!
//! Mid-fill UI (tree / note open / graph) must stay interactive: small WAL
//! write batches, at most four head readers, a yield after a real write,
//! and time-gated progress. The next head chunk is read while the previous
//! chunk is committed.

use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use std::cell::{Cell, RefCell};
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
    ctime: Option<i64>,
}

struct FillNote {
    id: String,
    path: String,
    name: String,
    parent_id: Option<String>,
    mtime: i64,
    size: i64,
    ctime: Option<i64>,
    title: String,
    body: String,
    links: Vec<String>,
    tags: Vec<String>,
    fill_depth: i64,
}


#[path = "links.rs"]
mod links;
#[path = "fts.rs"]
mod fts;
#[path = "walk.rs"]
mod walk;

pub use fts::{
    clear_title_search_live, delete_note_fts, discard_oversized_journal,
    discard_oversized_journal_with, ensure_fill_depth_column, ensure_note_fts_row,
    inferred_fill_depth, is_priority_rel, is_title_seed_hot_name, mark_title_search_live,
    order_indices_for_fill, replace_note_fts, sqlite_header_is_wal, take_head,
    title_from_name_and_head, title_search_already_live,
};
pub use links::{
    backfill_links_from_fts, desk_node_id, extract_tags, extract_wikilink_targets, link_coverage,
    normalize_link_target, replace_source_links, run_links_pass, LinkCoverage, LINKS_CURSOR_KEY,
    LINKS_PASS_BATCH, LINKS_SEEN_KEY,
};
pub use walk::{admit_new_paths, reconcile_catalog_with_disk, CatalogReconcile, RECONCILE_ADD_BATCH};

use fts::{
    backfill_note_fts_row_if_needed, content_read_window, flush_note_batch, index_note_heads,
    index_prefix_deep, merge_fts_segments, meta_fill_note, order_need_meta_for_title_seed,
    remove_stale_notes, remove_stale_walk, tune_fill_connection,
};
use links::finalize_link_edges;
use walk::{
    collect_md_notes_publishing, commit_early_heads, disk_note_from_lite, load_existing_notes,
    next_walk_gen, DiscoverPublish, LiteEntry,
};

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
    is_cancelled: &mut dyn FnMut() -> bool,
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

/// After the open window is searchable, read every remaining note body.
/// Returns false when the caller cancels before the shallow rows are gone.
fn index_remaining_bodies(
    conn: &mut Connection,
    vault_root: &Path,
    deep_head: usize,
    is_cancelled: &mut dyn FnMut() -> bool,
) -> bool {
    loop {
        if is_cancelled() {
            return false;
        }
        let paths: Vec<String> = {
            let mut stmt = match conn.prepare(
                "SELECT path FROM note_meta
                 WHERE kind='note' AND deleted=0 AND COALESCE(fill_depth, 0) < ?1
                 LIMIT ?2",
            ) {
                Ok(stmt) => stmt,
                Err(_) => return false,
            };
            let collected = match stmt.query_map(params![FILL_DEPTH_DEEP, READ_CHUNK as i64], |r| {
                r.get::<_, String>(0)
            }) {
                Ok(rows) => rows.flatten().collect::<Vec<String>>(),
                Err(_) => return false,
            };
            collected
        };
        if paths.is_empty() {
            return true;
        }
        let started = Instant::now();
        let wrote = index_priority_files(conn, vault_root, &paths, deep_head, is_cancelled);
        if wrote == 0 {
            return false;
        }
        if started.elapsed() >= Duration::from_millis(2) {
            std::thread::sleep(Duration::from_millis(FILL_YIELD_MS));
        } else {
            std::thread::yield_now();
        }
    }
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
    ensure_fill_depth_column(conn)?;
    ensure_note_fts_row(conn)?;
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
        let bodies_done = index_remaining_bodies(conn, vault_root, deep_head, &mut is_cancelled);
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
        let warm_state = if bodies_done {
            "ready-fts"
        } else {
            "ready-fts-partial"
        };
        emit(
            &mut progress,
            if bodies_done { "done" } else { "ready-fts-partial" },
            warm_state,
            notes,
            indexed_open,
            notes,
            0,
            Some(if bodies_done {
                "SQLite FTS5 BM25 ready".into()
            } else {
                "Titles and open notes are searchable".into()
            }),
            &mut on_progress,
        );
        return Ok(IndexFillResult {
            indexed: indexed_open,
            skipped: notes,
            errors: 0,
            notes,
            edges: 0,
            search_state: warm_state.into(),
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
    let walk_gen = if deep {
        Some(next_walk_gen(conn)?)
    } else {
        None
    };
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
        let mut bodies_done = false;
        if walk_done {
            let mut cancel = is_cancelled.borrow_mut();
            bodies_done = index_remaining_bodies(conn, vault_root, deep_head, &mut **cancel);
        }
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
                if bodies_done {
                    "ready-fts"
                } else {
                    "ready-fts-partial"
                },
                notes,
                indexed,
                0,
                errors,
                None,
                &mut on_progress,
            );
        }
        let search_state = if bodies_done {
            "ready-fts"
        } else {
            "ready-fts-partial"
        };
        emit(
            &mut progress,
            if bodies_done { "done" } else { "ready-fts-partial" },
            search_state,
            notes,
            indexed,
            0,
            errors,
            Some(if bodies_done {
                "SQLite FTS5 BM25 ready".into()
            } else {
                "Titles and open notes are searchable".into()
            }),
            &mut on_progress,
        );
        return Ok(IndexFillResult {
            indexed,
            skipped: 0,
            errors,
            notes,
            edges: interactive_edges.get(),
            search_state: search_state.into(),
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

    // The open window is already searchable. Keep reading the notes past
    // it in short batches so a body word in an unopened note is in FTS
    // when this fill returns. Ready was announced at the title page.
    let rest: Vec<usize> = need_deep
        .iter()
        .copied()
        .filter(|i| !window_set.contains(i))
        .collect();
    let mut rest_complete = rest.is_empty();
    if !rest.is_empty() && !is_cancelled() {
        let rest_total = rest.len() as i64;
        let mut rest_scanned: i64 = 0;
        emit(
            &mut progress,
            "body-rest",
            "ready-fts-partial",
            0,
            indexed,
            skipped,
            errors,
            Some("Indexing note text…".into()),
            &mut on_progress,
        );
        for chunk in rest.chunks(READ_CHUNK) {
            if is_cancelled() {
                break;
            }
            let started = Instant::now();
            index_note_heads(
                conn,
                &files,
                chunk,
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
                    rest_scanned += n;
                    if should_emit_progress(last_emit, last_emitted_scanned, rest_scanned) {
                        emit(
                            &mut progress,
                            "body-rest",
                            "ready-fts-partial",
                            rest_scanned.min(rest_total),
                            indexed_now,
                            skipped,
                            errors_now,
                            Some("Indexing note text…".into()),
                            &mut on_progress,
                        );
                        last_emit = Instant::now();
                        last_emitted_scanned = rest_scanned;
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
            if started.elapsed() >= Duration::from_millis(2) {
                std::thread::sleep(Duration::from_millis(FILL_YIELD_MS));
            } else {
                std::thread::yield_now();
            }
        }
        rest_complete = !is_cancelled();
    }

    crate::shell_catalog::mark_catalog_walk_done(conn);
    // PASSIVE never waits for writers; never TRUNCATE (that hung a 100k fill).
    let _ = conn.execute_batch("PRAGMA wal_checkpoint(PASSIVE);");

    let cancelled_now = is_cancelled();
    let search_state = if cancelled_now {
        "ready-fts-partial"
    } else if open_set_covers_vault || rest_complete {
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
        } else if search_state == "ready-fts" {
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
    use super::fts::worker_count;
    use super::walk::{
        drop_missing_catalog_files, ensure_walk_gen_column, DIR_ENTRIES_BEFORE_READY, DIR_LISTS,
        EXISTING_CATALOG_ROWS_LOADED, MAX_LISTING_RETAINED, TAIL_WAL_CHECKPOINTS,
    };
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

    #[test]
    fn column_migration_failure_surfaces() {
        let conn = Connection::open_in_memory().unwrap();
        let err = ensure_fill_depth_column(&conn).unwrap_err();
        assert!(err.contains("schema migrate"), "{err}");
        let err = ensure_walk_gen_column(&conn).unwrap_err();
        assert!(err.contains("schema migrate"), "{err}");
    }

    #[test]
    fn column_migration_is_idempotent_when_present() {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch(
            "CREATE TABLE note_meta (
               id TEXT PRIMARY KEY,
               fill_depth INTEGER,
               ctime INTEGER,
               walk_gen INTEGER
             );",
        )
        .unwrap();
        ensure_fill_depth_column(&conn).unwrap();
        ensure_walk_gen_column(&conn).unwrap();
        ensure_fill_depth_column(&conn).unwrap();
    }

    #[test]
    fn note_fts_row_migration_failure_surfaces() {
        let conn = Connection::open_in_memory().unwrap();
        conn.pragma_update(None, "query_only", 1i64).unwrap();
        let err = ensure_note_fts_row(&conn).unwrap_err();
        assert!(err.contains("schema migrate"), "{err}");
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
        write_note(&vault, "RootHub.md", "# RootHub\n\n![[Hub 0]] #new\n");
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
        assert!(!fts_path_at(&db, "RootHub.md"), "warm Ready does not see new files");
        let mut listed = Vec::new();
        let out = reconcile_catalog_with_disk(&mut conn, &vault, || false, |l| listed.push(l.notes));
        assert_eq!(listed, vec![before + 1], "the folder's count is said before rows change");
        assert!(out.complete);
        assert_eq!(out.added, 2);
        assert_eq!(out.removed, 1);
        assert_eq!(out.notes, before + 1);
        assert_eq!(live_note_count(&conn), before + 1);
        assert_eq!(stored_note_count(&conn), before + 1, "the stale total is replaced, lower included");
        assert!(fts_path_at(&db, "RootHub.md"));
        assert!(fts_path_at(&db, "Fresh/Deep/Note Z.md"));
        assert!(!fts_path_at(&db, &gone));
        let hits: Vec<String> = crate::shell_catalog::query_suggest(&conn, "roothub", 10)
            .unwrap()
            .into_iter()
            .map(|h| h.path)
            .collect();
        assert_eq!(hits, vec!["RootHub.md".to_string()]);
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
                "SELECT COUNT(*) FROM tag_map WHERE note_id=?1 AND tag='new'",
                params![desk_node_id("RootHub.md")],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(tags, 1, "a reconciled note has its head read");
        // Nothing changed since: a second pass is a no-op.
        let again = reconcile_catalog_with_disk(&mut conn, &vault, || false, |_| {});
        assert_eq!((again.added, again.removed, again.notes), (0, 0, before + 1));
        // A folder that lists as empty does not wipe the catalog.
        let (empty, _) = temp_pair("reconcile-empty");
        let blank = reconcile_catalog_with_disk(&mut conn, &empty, || false, |_| {});
        assert!(!blank.complete);
        assert_eq!(blank.removed, 0);
        assert_eq!(live_note_count(&conn), before + 1);
        // Cancelled: nothing is removed.
        fs::remove_file(vault.join("RootHub.md")).unwrap();
        let stopped = reconcile_catalog_with_disk(&mut conn, &vault, || true, |_| {});
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
    /// `src/lib/vault/synthetic-vault.ts` (synthetic vault manifest).
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
        write_note(
            &vault,
            "zz/LateTitleToken.md",
            &format!("{}\nlatebodytokenzz\n", "x".repeat(900)),
        );
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
                if p.phase == "done" && done_scanned < 0 {
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
            fts_has(&conn, "latebodytokenzz"),
            "note text past the open window is indexed before the fill returns"
        );
        assert_eq!(result.search_state, "ready-fts");
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
        assert!(
            !saw_fts_tail,
            "the body pass uses body-rest, not a single vault-sized fts phase"
        );
        assert_eq!(
            result.search_state,
            "ready-fts",
            "notes={} indexed={} skipped={}",
            result.notes,
            result.indexed,
            result.skipped
        );
        assert_eq!(result.notes, (n as i64) + 1);
        assert!(fts_has(&conn, "cluster"));
        assert!(
            fts_has(&conn, "deeptokenzz"),
            "a note outside the open window is body-indexed before the fill returns"
        );
        assert!(fts_has(&conn, "beyondwindowtoken"));
        assert_eq!(fill_depth_of(&conn, "tail/late.md"), FILL_DEPTH_DEEP);
        assert_eq!(shallow_note_count(&conn), 0, "the body pass finishes the vault");
        assert_eq!(deep_row_count(&conn), (n as i64) + 1);

        let (again, _) = fill_until(&mut conn, &vault, false, FillUntil::Deep, &["eager".into()]);
        assert_eq!(again.indexed, 0, "a finished body index is not read again");
        assert_eq!(again.search_state, "ready-fts");
        assert!(fts_has(&conn, "deeptokenzz"));

        let _ = fs::remove_dir_all(vault.parent().unwrap());
    }

    #[test]
    fn deep_fill_finds_unopened_body_on_10k() {
        let (vault, db) = temp_pair("body10k");
        write_n(&vault, 10_000);
        write_note(
            &vault,
            "zz-unopened/hidden.md",
            "# Hidden\n\nzephyrquilltoken sits only in this body.\n",
        );
        let mut conn = open_test_conn(&db);
        let mut saw_ready = false;
        let mut token_at_ready = false;
        let result = fill_from_disk_with_opts(
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
                if p.phase == "ready-meta" && !saw_ready {
                    saw_ready = true;
                    token_at_ready = fts_has_at(&db, "zephyrquilltoken");
                }
            },
        )
        .unwrap();
        assert!(saw_ready, "Ready is announced on the title page");
        assert!(
            !token_at_ready,
            "the unopened body token must not be required before Ready"
        );
        assert_eq!(result.notes, 10_001);
        assert_eq!(result.search_state, "ready-fts");
        assert!(
            fts_has(&conn, "zephyrquilltoken"),
            "desktop FTS must find a body token that was never opened"
        );
        assert_eq!(
            fill_depth_of(&conn, "zz-unopened/hidden.md"),
            FILL_DEPTH_DEEP
        );
        let _ = fs::remove_dir_all(vault.parent().unwrap());
    }

    #[test]
    fn sqlite_ops_search_or_and_path_not_the_window() {
        let (vault, db) = temp_pair("ops");
        write_note(&vault, "inbox/alpha.md", "alpha only body\n");
        write_note(&vault, "archive/beta.md", "beta zephyrquilltoken\n");
        write_note(&vault, "elsewhere/gamma.md", "gamma plain\n");
        let mut conn = open_test_conn(&db);
        let (filled, _) = fill(&mut conn, &vault, false);
        assert_eq!(filled.search_state, "ready-fts");
        let or = crate::shell_catalog::search_note_ops(
            &conn,
            &[
                crate::shell_catalog::SearchOpsClause {
                    rest: "alpha".into(),
                    path_filter: String::new(),
                    folder_filter: String::new(),
                    file_filter: String::new(),
                    tag_filter: String::new(),
                    excludes: Vec::new(),
                },
                crate::shell_catalog::SearchOpsClause {
                    rest: "zephyrquilltoken".into(),
                    path_filter: String::new(),
                    folder_filter: String::new(),
                    file_filter: String::new(),
                    tag_filter: String::new(),
                    excludes: Vec::new(),
                },
            ],
            16,
        )
        .unwrap();
        let or_paths: Vec<&str> = or.iter().map(|h| h.path.as_str()).collect();
        assert!(
            or_paths.iter().any(|p| p.ends_with("alpha.md")),
            "OR must hit note_fts, got {or_paths:?}"
        );
        assert!(
            or_paths.iter().any(|p| p.ends_with("beta.md")),
            "OR must find the body token, got {or_paths:?}"
        );
        let path_hits = crate::shell_catalog::search_note_ops(
            &conn,
            &[crate::shell_catalog::SearchOpsClause {
                rest: "zephyrquilltoken".into(),
                path_filter: "archive".into(),
                folder_filter: String::new(),
                file_filter: String::new(),
                tag_filter: String::new(),
                excludes: Vec::new(),
            }],
            16,
        )
        .unwrap();
        assert_eq!(path_hits.len(), 1);
        assert!(path_hits[0].path.contains("archive"));
        let folder_hits = crate::shell_catalog::search_note_ops(
            &conn,
            &[crate::shell_catalog::SearchOpsClause {
                rest: String::new(),
                path_filter: String::new(),
                folder_filter: "inbox".into(),
                file_filter: String::new(),
                tag_filter: String::new(),
                excludes: Vec::new(),
            }],
            16,
        )
        .unwrap();
        assert!(folder_hits.iter().all(|h| h.path.contains("inbox")));
        assert!(!folder_hits.is_empty());
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
        ensure_fill_depth_column(&conn).unwrap();
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

    /// Local scale probe — not CI. `cargo test -p nexus-fill-test -- --ignored --nocapture`
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
        ensure_fill_depth_column(&conn).unwrap();
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

    /// Always-on gate: 100k desktop fill. Ready stays a page (same 8s ceiling
    /// as the 10k title-seed budget). After the body pass, title suggest and
    /// a rare body token stay inside the documented search ceilings, with
    /// debug-build headroom (SCALING title suggest ≤20ms, full-text ≤50ms;
    /// shell rank budget is 120ms).
    fn gate_snappy(
        n: usize,
        ready_ms: u128,
        fill_budget_ms: u128,
        suggest_ms: u128,
        body_ms: u128,
        page_ms: u128,
    ) {
        let (vault, db) = temp_pair(&format!("gate{n}"));
        write_official_shaped(&vault, n);
        write_note(
            &vault,
            "zz-unopened/Hidden Body.md",
            "# Hidden Body\n\nzephyrquillgate sits only in this body.\n",
        );
        let mut conn = open_test_conn(&db);
        let t0 = Instant::now();
        let mut ready_at: Option<u128> = None;
        let mut token_at_ready = false;
        let result = fill_from_disk_with_opts(
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
                if p.phase == "ready-meta" && ready_at.is_none() {
                    ready_at = Some(t0.elapsed().as_millis());
                    token_at_ready = fts_has_at(&db, "zephyrquillgate");
                }
            },
        )
        .unwrap();
        let ready = ready_at.expect("ready-meta");
        let fill_ms = t0.elapsed().as_millis();
        assert!(
            ready < ready_ms,
            "{n} ready-meta {ready}ms exceeds {ready_ms}ms"
        );
        assert!(
            fill_ms < fill_budget_ms,
            "{n} body fill {fill_ms}ms exceeds {fill_budget_ms}ms"
        );
        assert!(!token_at_ready, "body token must wait until after Ready");
        assert!(result.notes >= n as i64, "catalog notes {}", result.notes);
        assert_eq!(result.search_state, "ready-fts");
        assert!(fts_has(&conn, "zephyrquillgate"));

        crate::shell_catalog::ensure_shell_indexes(&conn).unwrap();

        let t_suggest = Instant::now();
        let hits = crate::shell_catalog::query_suggest(&conn, "hub 0", 16).unwrap();
        let suggest = t_suggest.elapsed().as_millis();
        assert!(
            hits.iter().any(|h| h.title.to_ascii_lowercase().contains("hub")),
            "title suggest missed Hub, got {:?}",
            hits.iter().map(|h| h.title.as_str()).collect::<Vec<_>>()
        );
        assert!(
            suggest < suggest_ms,
            "{n} title suggest {suggest}ms exceeds {suggest_ms}ms"
        );

        let t_body = Instant::now();
        let body_hits = crate::shell_catalog::search_note_ops(
            &conn,
            &[crate::shell_catalog::SearchOpsClause {
                rest: "zephyrquillgate".into(),
                path_filter: String::new(),
                folder_filter: String::new(),
                file_filter: String::new(),
                tag_filter: String::new(),
                excludes: Vec::new(),
            }],
            16,
        )
        .unwrap();
        let body = t_body.elapsed().as_millis();
        assert_eq!(body_hits.len(), 1, "body token find {:?}", body_hits.len());
        assert!(body_hits[0].path.contains("Hidden Body"));
        assert!(
            body < body_ms,
            "{n} body token {body}ms exceeds {body_ms}ms"
        );

        let t_page = Instant::now();
        let page = crate::shell_catalog::query_children(&conn, "00-Inbox/00", 200, 0).unwrap();
        let page_took = t_page.elapsed().as_millis();
        assert!(page.rows.len() <= 200, "shell page {}", page.rows.len());
        assert!(
            page.note_total > 200,
            "folder must page, total {}",
            page.note_total
        );
        assert!(
            page_took < page_ms,
            "{n} shell page {page_took}ms exceeds {page_ms}ms"
        );
        eprintln!(
            "gate n={n} ready-meta {ready}ms fill {fill_ms}ms suggest {suggest}ms body {body}ms page {page_took}ms notes={}",
            result.notes
        );
        let _ = fs::remove_dir_all(vault.parent().unwrap());
    }

    /// Part of `qa:gate` via `npm run test:scale-gate` (ignored by the
    /// shorter rust suite so it is not run twice).
    #[test]
    #[ignore]
    fn gate_100k_snappy_ready_suggest_and_body() {
        // Ready uses the 10k title-seed ceiling (8s). A measured 100k run
        // announced Ready in 2ms and finished the body fill in ~35s, so the
        // fill ceiling is 90s. Suggest, body find, and the shell page use
        // the shell rank budget (120ms). SCALING asks for 20ms/50ms; this
        // gate runs a debug build.
        gate_snappy(100_000, 8_000, 90_000, 120, 120, 120);
    }

    /// Not part of qa:gate. `npm run qa:gate:500k`.
    #[test]
    #[ignore]
    fn gate_500k_snappy_ready_suggest_and_body() {
        // Same Ready and search ceilings. Fill ceiling scales from the
        // measured 100k body pass (~35s) with headroom for 5× the files.
        gate_snappy(500_000, 8_000, 480_000, 120, 120, 120);
    }
}
