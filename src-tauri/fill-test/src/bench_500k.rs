//! Large-vault timings against the production catalog and fill code.
//!
//!   NEXUS_BENCH_VAULT=/path/to/nexus-soak-500k \
//!     cargo test --release --manifest-path src-tauri/fill-test/Cargo.toml \
//!     bench_large_vault -- --ignored --nocapture
//!
//! Prints one line per step. Gesture timings run on a reader connection with
//! the shell's settings while the fill writes on its own connection, the way
//! the app does after Ready.

use crate::index_fill::{fill_from_disk_with_opts, FillOpts, FillUntil};
use crate::shell_catalog as sc;
use rusqlite::Connection;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::{Duration, Instant};

const DDL: &str = r#"
CREATE TABLE IF NOT EXISTS meta_kv (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS note_meta (
  id TEXT PRIMARY KEY, path TEXT UNIQUE NOT NULL, name TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('folder','note')), parent_id TEXT,
  mtime INTEGER NOT NULL, size INTEGER, content_hash TEXT, title TEXT,
  deleted INTEGER NOT NULL DEFAULT 0, fill_depth INTEGER
);
CREATE INDEX IF NOT EXISTS note_meta_parent ON note_meta(parent_id);
CREATE INDEX IF NOT EXISTS note_meta_mtime ON note_meta(mtime DESC);
CREATE TABLE IF NOT EXISTS link_edge (
  id INTEGER PRIMARY KEY AUTOINCREMENT, source_id TEXT NOT NULL,
  target_raw TEXT NOT NULL, target_norm TEXT NOT NULL, target_id TEXT,
  UNIQUE (source_id, target_norm)
);
CREATE INDEX IF NOT EXISTS link_fwd ON link_edge(source_id);
CREATE INDEX IF NOT EXISTS link_rev ON link_edge(target_norm);
CREATE TABLE IF NOT EXISTS tag_map (tag TEXT NOT NULL, note_id TEXT NOT NULL, PRIMARY KEY (tag, note_id));
CREATE INDEX IF NOT EXISTS tag_by_note ON tag_map(note_id);
CREATE VIRTUAL TABLE IF NOT EXISTS note_fts USING fts5(
  note_id UNINDEXED, title, path, body, tokenize = 'unicode61 remove_diacritics 2'
);
CREATE TABLE IF NOT EXISTS note_fts_row (note_id TEXT PRIMARY KEY, fts_rowid INTEGER NOT NULL);
"#;

fn writer(db: &Path) -> Connection {
    let conn = Connection::open(db).unwrap();
    conn.execute_batch(
        "PRAGMA journal_mode=WAL; PRAGMA synchronous=NORMAL; PRAGMA cache_size=-65536; PRAGMA temp_store=MEMORY; PRAGMA journal_size_limit=8388608;",
    )
    .unwrap();
    let _ = conn.busy_timeout(Duration::from_millis(15_000));
    conn
}

/// The shell's UI connection: small cache, short lock waits.
fn reader(db: &Path) -> Connection {
    let conn = Connection::open(db).unwrap();
    conn.execute_batch("PRAGMA synchronous=NORMAL; PRAGMA cache_size=-2048; PRAGMA temp_store=MEMORY;")
        .unwrap();
    let _ = conn.busy_timeout(Duration::from_millis(sc::SHELL_BUSY_TIMEOUT_MS));
    conn
}

fn ms(d: Duration) -> f64 {
    (d.as_secs_f64() * 1000.0 * 10.0).round() / 10.0
}

fn time<T>(label: &str, f: impl FnOnce() -> Result<T, String>) -> Option<T> {
    let t = Instant::now();
    let out = f();
    match &out {
        Ok(_) => println!("bench {label:<34} {:>9.1} ms", ms(t.elapsed())),
        Err(e) => println!("bench {label:<34} {:>9.1} ms  ERR {e}", ms(t.elapsed())),
    }
    out.ok()
}

struct Lat(Vec<f64>, usize);
impl Lat {
    fn line(&mut self, label: &str) {
        self.0.sort_by(|a, b| a.partial_cmp(b).unwrap());
        let n = self.0.len();
        if n == 0 {
            println!("gesture {label:<24} n=0 busy={}", self.1);
            return;
        }
        let at = |p: f64| self.0[((n as f64 - 1.0) * p).round() as usize];
        println!(
            "gesture {label:<24} n={n:<5} p50={:>7.1} p95={:>7.1} max={:>7.1} ms busy={}",
            at(0.5),
            at(0.95),
            self.0[n - 1],
            self.1
        );
    }
}

fn first_folder_with_notes(conn: &Connection) -> String {
    conn.query_row(
        "SELECT p.path FROM note_meta p JOIN note_meta c ON c.parent_id = p.id
         WHERE p.kind='folder' GROUP BY p.id ORDER BY COUNT(*) DESC LIMIT 1",
        [],
        |r| r.get(0),
    )
    .unwrap_or_default()
}

fn query_passes(db: &Path, root: &Path) {
    let mut r = reader(db);
    let big = first_folder_with_notes(&r);
    let note_id: String = r
        .query_row(
            "SELECT id FROM note_meta WHERE kind='note' AND fill_depth=2 LIMIT 1",
            [],
            |row| row.get(0),
        )
        .unwrap_or_default();
    println!("-- queries (big folder {big}, note {note_id}) --");
    for pass in ["first", "warm"] {
        println!("pass {pass}");
        time("mount_catalog", || sc::mount_catalog(&mut r, root, None, false));
        time("children root", || sc::query_children(&r, "", sc::SHELL_CHILD_PAGE, 0));
        time("children big folder p0", || sc::query_children(&r, &big, sc::SHELL_CHILD_PAGE, 0));
        time("children big folder p15", || sc::query_children(&r, &big, sc::SHELL_CHILD_PAGE, 3_000));
        for q in ["topic 15", "Topic 1541", "hub 0", "topic", "index local", "zzqx"] {
            let t = Instant::now();
            let hits = sc::query_suggest(&r, q, sc::SHELL_SUGGEST_LIMIT).unwrap_or_default();
            let el = ms(t.elapsed());
            let first: Vec<String> = hits.iter().take(3).map(|h| h.title.clone()).collect();
            println!("bench switcher suggest {q:<14} {el:>9.1} ms  hits={:<3} first={first:?}", hits.len());
            let terms = sc::fts_prefix_terms(q);
            if !terms.is_empty() {
                let t = Instant::now();
                let ranked: Result<Vec<String>, String> = sc::with_time_budget(&r, sc::SHELL_SEARCH_RANK_BUDGET, || {
                    let mut stmt = r.prepare(sc::SEARCH_RANKED_SQL).map_err(|e| e.to_string())?;
                    let rows = stmt
                        .query_map(rusqlite::params![terms, 40], |row| row.get::<_, String>(0))
                        .map_err(|e| e.to_string())?;
                    let mut kept = Vec::new();
                    for row in rows {
                        kept.push(row.map_err(|e| e.to_string())?);
                    }
                    Ok(kept)
                });
                println!(
                    "bench switcher ranked  {q:<14} {:>9.1} ms  {}",
                    ms(t.elapsed()),
                    match &ranked { Ok(v) => format!("rows={}", v.len()), Err(e) => format!("stopped ({e})") }
                );
            }
        }
        for target in ["Topic 15", "Topic 1541.md", "02/Topic 15", "No Such Note Here"] {
            let t = Instant::now();
            let out = sc::query_resolve_link(&r, target);
            let el = ms(t.elapsed());
            let got = out.map(|o| (o.settled, o.row.map(|row| row.path)));
            println!("bench resolve link {target:<18} {el:>9.1} ms  {got:?}");
        }
        time("suggest 'topic 15'", || sc::query_suggest(&r, "topic 15", sc::SHELL_SUGGEST_LIMIT));
        time("suggest 'hub'", || sc::query_suggest(&r, "hub", sc::SHELL_SUGGEST_LIMIT));
        time("suggest 'retrieval index'", || sc::query_suggest(&r, "retrieval index", sc::SHELL_SUGGEST_LIMIT));
        time("suggest '' (recent)", || sc::query_suggest(&r, "", sc::SHELL_SUGGEST_LIMIT));
        time("note", || sc::query_note(&r, &note_id));
        time("ego 2 hops", || sc::query_ego(&r, &note_id, 2, sc::SHELL_EGO_MAX));
        time("backlinks", || sc::query_backlinks(&r, &note_id, 40));
        time("tags", || sc::query_tags(&r, 40));
        time("tag notes #scale", || sc::query_tag_notes(&r, "scale", 40));
        time("recent", || sc::query_recent(&r, 12));
        let n = time("path page 'topic 1'", || sc::query_path_page(&r, "topic 1", "", 40)).map(|v| v.len());
        println!("bench   rows={n:?}");
        time("path page 'zzz' (miss)", || sc::query_path_page(&r, "zzz", "", 40));
        time("orphans", || sc::query_orphans(&r, 24));
        let n = time("broken", || sc::query_broken(&r, 24)).map(|v| v.len());
        println!("bench   rows={n:?}");
        time("known norms x40", || {
            let norms: Vec<String> = (0..40).map(|i| format!("topic {}", 1000 + i)).collect();
            sc::query_known_norms(&r, &norms)
        });
        time("level big folder", || sc::query_level(&r, &big, 400));
    }
}

/// Queries only, on an index filled earlier.
#[test]
#[ignore]
fn bench_large_queries() {
    let (Ok(vault), Ok(db)) = (std::env::var("NEXUS_BENCH_VAULT"), std::env::var("NEXUS_BENCH_DB")) else {
        eprintln!("set NEXUS_BENCH_VAULT and NEXUS_BENCH_DB");
        return;
    };
    if std::env::var("NEXUS_BENCH_INDEXES").is_ok() {
        let w = writer(Path::new(&db));
        time("ensure_shell_indexes", || sc::ensure_shell_indexes(&w));
    }
    if std::env::var("NEXUS_BENCH_LINKS").is_ok() {
        // The links pass on its own writer while gestures run on the shell reader.
        let db2 = PathBuf::from(&db);
        let root2 = PathBuf::from(&vault);
        let done = Arc::new(AtomicBool::new(false));
        let flag = done.clone();
        let pass = std::thread::spawn(move || {
            let mut w = writer(&db2);
            let t = Instant::now();
            let cov = crate::index_fill::run_links_pass(&mut w, &root2, || false, |_| {});
            flag.store(true, Ordering::SeqCst);
            (t.elapsed(), cov)
        });
        let r = reader(Path::new(&db));
        let mut children = Lat(Vec::new(), 0);
        let mut backlinks = Lat(Vec::new(), 0);
        let mut suggest = Lat(Vec::new(), 0);
        let note: String = r
            .query_row("SELECT id FROM note_meta WHERE kind='note' AND path LIKE '%Topic 1541.md'", [], |x| x.get(0))
            .unwrap_or_default();
        let mut i = 0i64;
        while !done.load(Ordering::SeqCst) {
            i += 1;
            let t = Instant::now();
            match sc::query_children(&r, "60-Systems/07", sc::SHELL_CHILD_PAGE, (i * 60) % 3_000) {
                Ok(_) => children.0.push(ms(t.elapsed())),
                Err(_) => children.1 += 1,
            }
            let t = Instant::now();
            match sc::query_backlinks(&r, &note, 40) {
                Ok(_) => backlinks.0.push(ms(t.elapsed())),
                Err(_) => backlinks.1 += 1,
            }
            let t = Instant::now();
            match sc::query_suggest(&r, "topic 15", sc::SHELL_SUGGEST_LIMIT) {
                Ok(_) => suggest.0.push(ms(t.elapsed())),
                Err(_) => suggest.1 += 1,
            }
            std::thread::sleep(Duration::from_millis(50));
        }
        let (el, cov) = pass.join().unwrap();
        println!("bench links pass                         {:>9.1} ms  {cov:?}", ms(el));
        println!("-- gestures on the shell reader during the links pass --");
        children.line("children page");
        backlinks.line("backlinks Topic 1541");
        suggest.line("suggest topic 15");
        let counts: (i64, i64) = r
            .query_row("SELECT (SELECT COUNT(*) FROM link_edge), (SELECT COUNT(*) FROM tag_map)", [], |x| Ok((x.get(0)?, x.get(1)?)))
            .unwrap_or((0, 0));
        println!("bench   link_edge={} tag_map={}", counts.0, counts.1);
        let n = time("backlinks Topic 1541", || sc::query_backlinks(&r, &note, 40)).map(|b| (b.total, b.rows.len()));
        println!("bench   backlinks total/rows={n:?}");
        let n = time("tags", || sc::query_tags(&r, 40)).map(|v| v.iter().take(3).map(|t| (t.tag.clone(), t.count)).collect::<Vec<_>>());
        println!("bench   top tags={n:?}");
    }
    query_passes(Path::new(&db), Path::new(&vault));
}

#[test]
#[ignore]
fn bench_large_vault() {
    let Ok(vault) = std::env::var("NEXUS_BENCH_VAULT") else {
        eprintln!("set NEXUS_BENCH_VAULT");
        return;
    };
    let root = PathBuf::from(&vault);
    let dir = std::env::temp_dir().join(format!("nexus-bench-{}", std::process::id()));
    std::fs::create_dir_all(&dir).unwrap();
    let db = dir.join("index.sqlite");
    let db_s = db.to_string_lossy().to_string();
    {
        let c = writer(&db);
        c.execute_batch(DDL).unwrap();
    }

    // First open ever: the root page, then the page the window paints.
    {
        let mut w = writer(&db);
        time("cold seed_first_page", || sc::seed_first_page(&mut w, &root, None));
    }
    {
        let mut r = reader(&db);
        let m = time("cold mount_catalog (page)", || sc::mount_catalog(&mut r, &root, None, false));
        if let Some(m) = m {
            println!("bench   page rows={} notes={} materialize={}", m.rows.len(), m.notes, m.materialize);
        }
    }

    // Deep fill on its own connection while gestures run on the shell reader.
    let done = Arc::new(AtomicBool::new(false));
    let fill_done = done.clone();
    let fill_root = root.clone();
    let fill_db = db.clone();
    let fill_db_s = db_s.clone();
    let fill = std::thread::spawn(move || {
        let mut w = writer(&fill_db);
        let t = Instant::now();
        let prio: Vec<String> = Vec::new();
        let res = fill_from_disk_with_opts(
            &mut w,
            &fill_root,
            FillOpts {
                deep_head_chars: 4_000,
                short_head_chars: 1_024,
                force_rebuild: false,
                db_path: &fill_db_s,
                priority_rels: &prio,
                until: FillUntil::Deep,
            },
            || false,
            |_| {},
        );
        let fill_ms = t.elapsed();
        // As the app does once the fill is done: the lookup indexes.
        let ti = Instant::now();
        let _ = sc::ensure_shell_indexes(&w);
        println!("bench ensure_shell_indexes after fill      {:>9.1} ms", ms(ti.elapsed()));
        fill_done.store(true, Ordering::SeqCst);
        (fill_ms, res)
    });

    let r = reader(&db);
    let mut children = Lat(Vec::new(), 0);
    let mut suggest = Lat(Vec::new(), 0);
    let mut recent = Lat(Vec::new(), 0);
    let mut big: Option<String> = None;
    let started = Instant::now();
    let mut i: i64 = 0;
    while !done.load(Ordering::SeqCst) && started.elapsed() < Duration::from_secs(900) {
        i += 1;
        if big.is_none() && i % 20 == 0 {
            let p = first_folder_with_notes(&r);
            if !p.is_empty() {
                big = Some(p);
            }
        }
        let parent = big.clone().unwrap_or_default();
        let t = Instant::now();
        match sc::query_children(&r, &parent, sc::SHELL_CHILD_PAGE, (i * 60) % 3_000) {
            Ok(_) => children.0.push(ms(t.elapsed())),
            Err(_) => children.1 += 1,
        }
        let t = Instant::now();
        match sc::query_suggest(&r, &format!("topic {}", 1000 + (i % 400)), sc::SHELL_SUGGEST_LIMIT) {
            Ok(_) => suggest.0.push(ms(t.elapsed())),
            Err(_) => suggest.1 += 1,
        }
        let t = Instant::now();
        match sc::query_recent(&r, 12) {
            Ok(_) => recent.0.push(ms(t.elapsed())),
            Err(_) => recent.1 += 1,
        }
        std::thread::sleep(Duration::from_millis(50));
    }
    let (fill_ms, fill_res) = fill.join().unwrap();
    match &fill_res {
        Ok(r) => println!(
            "bench deep fill (background)            {:>9.1} ms  notes={} indexed={} edges={} state={}",
            ms(fill_ms),
            r.notes,
            r.indexed,
            r.edges,
            r.search_state
        ),
        Err(e) => println!("bench deep fill ERR {e}"),
    }
    println!("-- gestures on the shell reader during the fill --");
    children.line("children page");
    suggest.line("suggest");
    recent.line("recent");

    // After the fill: every read the UI makes, cold and then warm.
    query_passes(&db, &root);
    let size = std::fs::metadata(&db).map(|m| m.len()).unwrap_or(0);
    println!("bench index size {:.1} MB", size as f64 / 1_048_576.0);

    // A reopen of a filled index: the page the window paints first.
    drop(r);
    let mut r2 = reader(&db);
    time("reopen mount_catalog", || sc::mount_catalog(&mut r2, &root, None, false));
    let _ = std::fs::remove_dir_all(&dir);
}
