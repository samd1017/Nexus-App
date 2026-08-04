//! OS-level recursive vault watching (notify). Emits debounced path events to the UI.
//! Fallback full-tree poll remains in TS when native watch is unavailable.

use notify::{RecommendedWatcher, RecursiveMode};
use notify_debouncer_mini::{new_debouncer, DebouncedEventKind, Debouncer};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Mutex, OnceLock};
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter};

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

static WATCH_SEQ: AtomicU64 = AtomicU64::new(1);

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WatchStartResult {
    pub watch_id: String,
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OkResult {
    pub ok: bool,
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VaultFsEvent {
    pub watch_id: String,
    pub kind: String,
    pub paths: Vec<String>,
}

struct ActiveWatch {
    root: PathBuf,
    /// Keep debouncer alive for the watch lifetime.
    _debouncer: Debouncer<RecommendedWatcher>,
    /// Shared with the debounce callback so app writes can suppress echo.
    suppress_until: Arc<Mutex<Instant>>,
}

pub struct WatchState {
    watches: HashMap<String, ActiveWatch>,
}

impl WatchState {
    pub fn new() -> Self {
        Self {
            watches: HashMap::new(),
        }
    }
}

pub type SharedWatch = Mutex<WatchState>;

fn should_skip_component(name: &str) -> bool {
    name.starts_with('.') || SKIP_DIRS.iter().any(|s| *s == name)
}

fn vault_relative(root: &Path, full: &Path) -> Option<String> {
    let rel = full.strip_prefix(root).ok()?;
    let mut parts = Vec::new();
    for c in rel.components() {
        let s = c.as_os_str().to_string_lossy();
        if should_skip_component(&s) {
            return None;
        }
        parts.push(s.replace('\\', "/"));
    }
    if parts.is_empty() {
        return Some(String::new());
    }
    Some(parts.join("/"))
}

fn classify_path(rel: &str) -> Option<&'static str> {
    if rel.is_empty() {
        return Some("resync");
    }
    let name = rel.rsplit('/').next().unwrap_or(rel);
    if name.starts_with('.') {
        return None;
    }
    if name.to_ascii_lowercase().ends_with(".md") {
        return Some("change");
    }
    // Directory-ish paths without extension — structural create/delete
    if !name.contains('.') {
        return Some("change");
    }
    None
}

#[tauri::command]
pub fn vault_watch_start(
    app: AppHandle,
    state: tauri::State<'_, SharedWatch>,
    root: String,
    _meta_only: Option<bool>,
) -> Result<WatchStartResult, String> {
    // Wave A: only watch registered absolute vault roots
    crate::vault_scope::register_root(&root)?;
    if !crate::vault_scope::is_allowed_vault_root(&root) {
        return Err("vault root not allowed".into());
    }
    let root_path = PathBuf::from(&root);
    if !root_path.is_dir() {
        return Err(format!("not a directory: {root}"));
    }

    let watch_id = format!("w{}", WATCH_SEQ.fetch_add(1, Ordering::Relaxed));
    let watch_id_cb = watch_id.clone();
    let root_cb = root_path.clone();
    let suppress_until: Arc<Mutex<Instant>> = Arc::new(Mutex::new(Instant::now()));
    let suppress_cb = Arc::clone(&suppress_until);
    let app_handle = app.clone();

    let mut debouncer = new_debouncer(
        Duration::from_millis(350),
        move |res: Result<Vec<notify_debouncer_mini::DebouncedEvent>, _>| {
            if let Ok(until) = suppress_cb.lock() {
                if Instant::now() < *until {
                    return;
                }
            }
            let Ok(events) = res else {
                let _ = app_handle.emit(
                    "nexus-vault-fs",
                    VaultFsEvent {
                        watch_id: watch_id_cb.clone(),
                        kind: "resync".into(),
                        paths: vec![],
                    },
                );
                return;
            };

            let mut paths: Vec<String> = Vec::new();
            let mut need_resync = false;
            for ev in events {
                // Any + AnyContinuous (editors / continuous writers)
                match ev.kind {
                    DebouncedEventKind::Any | DebouncedEventKind::AnyContinuous => {}
                    _ => continue,
                }
                match vault_relative(&root_cb, &ev.path) {
                    None => continue,
                    Some(rel) => match classify_path(&rel) {
                        Some("resync") => need_resync = true,
                        Some(_) => {
                            if !rel.is_empty() && !paths.contains(&rel) {
                                paths.push(rel);
                            }
                        }
                        None => {}
                    },
                }
            }

            if need_resync || paths.len() > 400 {
                let _ = app_handle.emit(
                    "nexus-vault-fs",
                    VaultFsEvent {
                        watch_id: watch_id_cb.clone(),
                        kind: "resync".into(),
                        paths: vec![],
                    },
                );
                return;
            }
            if paths.is_empty() {
                return;
            }
            let _ = app_handle.emit(
                "nexus-vault-fs",
                VaultFsEvent {
                    watch_id: watch_id_cb.clone(),
                    kind: "change".into(),
                    paths,
                },
            );
        },
    )
    .map_err(|e| format!("debouncer: {e}"))?;

    debouncer
        .watcher()
        .watch(&root_path, RecursiveMode::Recursive)
        .map_err(|e| format!("watch: {e}"))?;

    let mut guard = state.lock().map_err(|e| e.to_string())?;
    guard.watches.retain(|_, w| w.root != root_path);
    guard.watches.insert(
        watch_id.clone(),
        ActiveWatch {
            root: root_path,
            _debouncer: debouncer,
            suppress_until,
        },
    );

    Ok(WatchStartResult { watch_id })
}

#[tauri::command]
pub fn vault_watch_stop(
    state: tauri::State<'_, SharedWatch>,
    watch_id: String,
) -> Result<OkResult, String> {
    let mut guard = state.lock().map_err(|e| e.to_string())?;
    guard.watches.remove(&watch_id);
    Ok(OkResult { ok: true })
}

#[tauri::command]
pub fn vault_watch_ack(
    state: tauri::State<'_, SharedWatch>,
    watch_id: String,
) -> Result<OkResult, String> {
    let guard = state.lock().map_err(|e| e.to_string())?;
    if let Some(w) = guard.watches.get(&watch_id) {
        if let Ok(mut until) = w.suppress_until.lock() {
            *until = Instant::now() + Duration::from_millis(1800);
        }
    }
    Ok(OkResult { ok: true })
}

/// Reserved for future multi-process coordination (no-op placeholder keeps API stable).
#[allow(dead_code)]
fn watch_registry() -> &'static Mutex<HashMap<String, ()>> {
    static MAP: OnceLock<Mutex<HashMap<String, ()>>> = OnceLock::new();
    MAP.get_or_init(|| Mutex::new(HashMap::new()))
}
