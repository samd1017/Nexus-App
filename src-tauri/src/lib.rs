mod durable_index;
mod fill_join;
mod index_fill;
mod shell_catalog;
mod vault_scope;
mod vault_watch;

use durable_index::{
    vault_index_close, vault_index_fill_cancel, vault_index_fill_from_disk, vault_index_list,
    vault_index_list_links,
    vault_index_open,
    vault_index_path, vault_index_rebuild, vault_index_remove, vault_index_search,
    vault_index_stats, vault_index_upsert, vault_index_wipe, vault_shell_backlinks,
    vault_shell_children, vault_shell_ego, vault_shell_forget, vault_shell_level,
    vault_shell_broken, vault_shell_known_norms, vault_shell_link_coverage, vault_shell_mentions, vault_shell_mount,
    vault_shell_note, vault_shell_orphans, vault_shell_path_page, vault_shell_paths,
    vault_shell_admit, vault_shell_recent, vault_shell_resolve_link, vault_shell_suggest,
    vault_shell_tag_notes,
    vault_shell_tags, IndexState,
};
use vault_scope::{
    is_allowed_vault_root, register_and_grant, vault_clear_roots, vault_register_root,
};
use vault_watch::{
    vault_watch_ack, vault_watch_start, vault_watch_stop, WatchState,
};

use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};

use tauri::{
    menu::{Menu, MenuItem, PredefinedMenuItem, Submenu},
    webview::PageLoadEvent,
    Emitter, Manager,
};

fn ready_clock_ms() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

fn ready_clock_line(phase: &str, t: u64, window_ms: u64) -> String {
    format!(
        "NEXUS_READY_CLOCK phase={phase} t={t} window={window_ms} document=0 early=0 hit=0 reason=- shell=0"
    )
}

static READY_WINDOW_MS: AtomicU64 = AtomicU64::new(0);
static READY_FOCUS_LOGGED: AtomicBool = AtomicBool::new(false);
static READY_DOC_LOGGED: AtomicBool = AtomicBool::new(false);
static READY_SHOWN: AtomicBool = AtomicBool::new(false);

fn reveal_main_window<R: tauri::Runtime>(manager: &impl Manager<R>) {
    if READY_SHOWN.swap(true, Ordering::Relaxed) {
        return;
    }
    let Some(window) = manager.get_webview_window("main") else {
        READY_SHOWN.store(false, Ordering::Relaxed);
        return;
    };
    let _ = window.show();
    let _ = window.set_focus();
    let t = ready_clock_ms();
    let window_ms = READY_WINDOW_MS.load(Ordering::Relaxed);
    eprintln!("{}", ready_clock_line("shown", t, window_ms));
}

fn log_ready_focus(window_ms: u64) {
    if READY_FOCUS_LOGGED.swap(true, Ordering::Relaxed) {
        return;
    }
    let t = ready_clock_ms();
    eprintln!("{}", ready_clock_line("focus", t, window_ms));
}

fn log_ready_phase(phase: &str) {
    eprintln!("{}", ready_clock_line(phase, ready_clock_ms(), 0));
}

/// Marks one edge of the launch clock. `runtime` is the first user plugin,
/// after the Tauri runtime exists. `plugins` is the last work before the
/// event loop builds the webview. `window` (in setup) is the first line
/// after that webview exists, so `plugins` → `window` is webview construction.
fn ready_phase_plugin<R: tauri::Runtime>(
    id: &'static str,
    phase: &'static str,
) -> tauri::plugin::TauriPlugin<R> {
    tauri::plugin::Builder::new(id)
        .setup(move |_app, _api| {
            log_ready_phase(phase);
            Ok(())
        })
        .build()
}

/// Echo a page clock line onto the process log the soak already tails.
/// The window stays hidden until the early page has decided, so the first
/// visible frame is that line rather than a blank webview.
#[tauri::command]
fn ready_clock_log(app: tauri::AppHandle, line: String) {
    let one = line.replace(['\n', '\r'], " ");
    if one.starts_with("NEXUS_READY_CLOCK ") && one.len() <= 400 {
        eprintln!("{one}");
        if one.contains("phase=early ")
            || one.contains("phase=module ")
            || one.contains("phase=shell ")
        {
            reveal_main_window(&app);
        }
    }
}

/// Native meta walk DTO — mirrors TS `NodeMeta` (no bodies).
#[derive(Clone, serde::Serialize)]
struct NodeMetaDto {
    path: String,
    name: String,
    kind: String,
    mtime: i64,
    size: Option<u64>,
}

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

fn should_skip_dir(name: &str) -> bool {
    SKIP_DIRS.iter().any(|s| *s == name)
}

/// Bulk folder + `.md` meta listing. Paths are vault-relative POSIX.
/// Wave A: root is registered (absolute, no `..`) and granted plugin-fs
/// persisted-scope before walk — dialog *and* programmatic path opens.
#[tauri::command(async)]
fn vault_meta_walk(app: tauri::AppHandle, root: String) -> Result<Vec<NodeMetaDto>, String> {
    use std::fs;
    use std::path::{Path, PathBuf};
    use std::time::SystemTime;

    register_and_grant(&app, &root)?;
    if !is_allowed_vault_root(&root) {
        return Err("vault root not allowed".into());
    }

    let root_path = Path::new(&root);
    if !root_path.is_dir() {
        return Err(format!("not a directory: {root}"));
    }

    let mut out: Vec<NodeMetaDto> = Vec::new();
    let mut stack: Vec<(PathBuf, String)> = vec![(root_path.to_path_buf(), String::new())];

    while let Some((dir, rel)) = stack.pop() {
        let entries = match fs::read_dir(&dir) {
            Ok(e) => e,
            Err(err) => {
                eprintln!("[nexus] read_dir skip {}: {err}", dir.display());
                continue;
            }
        };
        let mut dirs: Vec<(PathBuf, String, String)> = Vec::new();
        let mut files: Vec<(String, String, i64, Option<u64>)> = Vec::new();

        for entry in entries.flatten() {
            let name = entry.file_name().to_string_lossy().to_string();
            if name.starts_with('.') || should_skip_dir(&name) {
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
            let path = entry.path();
            if ft.is_dir() {
                dirs.push((path, child_rel, name));
            } else if ft.is_file() {
                let lower = name.to_ascii_lowercase();
                if !lower.ends_with(".md") {
                    continue;
                }
                let meta = entry.metadata().ok();
                let mtime = meta
                    .as_ref()
                    .and_then(|m| m.modified().ok())
                    .and_then(|t| t.duration_since(SystemTime::UNIX_EPOCH).ok())
                    .map(|d| d.as_millis() as i64)
                    .unwrap_or(0);
                let size = meta.map(|m| m.len());
                files.push((child_rel, name, mtime, size));
            }
        }

        for (path, child_rel, name) in dirs {
            let mtime = fs::metadata(&path)
                .ok()
                .and_then(|m| m.modified().ok())
                .and_then(|t| t.duration_since(SystemTime::UNIX_EPOCH).ok())
                .map(|d| d.as_millis() as i64)
                .unwrap_or(0);
            out.push(NodeMetaDto {
                path: child_rel.clone(),
                name,
                kind: "folder".into(),
                mtime,
                size: None,
            });
            stack.push((path, child_rel));
        }
        for (child_rel, name, mtime, size) in files {
            out.push(NodeMetaDto {
                path: child_rel,
                name,
                kind: "note".into(),
                mtime,
                size,
            });
        }
    }

    Ok(out)
}

/// Bump when SQLite FTS + OS notify land (TS probes this string).
#[tauri::command]
fn vault_index_ping() -> String {
    "nexus-vault-index-v3".into()
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let process_ms = ready_clock_ms();
    eprintln!("{}", ready_clock_line("process", process_ms, 0));
    tauri::Builder::default()
        .plugin(ready_phase_plugin("nexus-clock-runtime", "runtime"))
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_persisted_scope::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(ready_phase_plugin("nexus-clock-plugins", "plugins"))
        .manage(std::sync::Mutex::new(IndexState::new()))
        .manage(std::sync::Mutex::new(WatchState::new()))
        .invoke_handler(tauri::generate_handler![
            vault_meta_walk,
            vault_index_ping,
            ready_clock_log,
            vault_register_root,
            vault_clear_roots,
            vault_index_path,
            vault_index_open,
            vault_index_close,
            vault_index_wipe,
            vault_index_rebuild,
            vault_index_upsert,
            vault_index_remove,
            vault_index_search,
            vault_index_stats,
            vault_index_list,
            vault_index_list_links,
            vault_index_fill_from_disk,
            vault_index_fill_cancel,
            vault_watch_start,
            vault_watch_stop,
            vault_watch_ack,
            vault_shell_mount,
            vault_shell_children,
            vault_shell_level,
            vault_shell_ego,
            vault_shell_note,
            vault_shell_backlinks,
            vault_shell_tags,
            vault_shell_tag_notes,
            vault_shell_suggest,
            vault_shell_recent,
            vault_shell_forget,
            vault_shell_paths,
            vault_shell_path_page,
            vault_shell_orphans,
            vault_shell_broken,
            vault_shell_known_norms,
            vault_shell_mentions,
            vault_shell_link_coverage,
            vault_shell_resolve_link,
            vault_shell_admit,
        ])
        .on_page_load(|_webview, payload| {
            let url = payload.url().as_str();
            if url.starts_with("about:") {
                return;
            }
            // Finished must not show the window. On the happy path the early
            // script reveals only after it has laid the page out. Showing here
            // would put a blank shell on screen first.
            let phase = if payload.event() == PageLoadEvent::Finished {
                "document-finished"
            } else if payload.event() == PageLoadEvent::Started {
                "document-native"
            } else {
                return;
            };
            if phase == "document-native" && READY_DOC_LOGGED.swap(true, Ordering::Relaxed) {
                return;
            }
            let t = ready_clock_ms();
            let window_ms = READY_WINDOW_MS.load(Ordering::Relaxed);
            eprintln!("{}", ready_clock_line(phase, t, window_ms));
        })
        .setup(|app| {
            let window_ms = ready_clock_ms();
            READY_WINDOW_MS.store(window_ms, Ordering::Relaxed);
            eprintln!("{}", ready_clock_line("window", window_ms, window_ms));
            if let Some(window) = app.get_webview_window("main") {
                if window.is_focused().unwrap_or(false) {
                    log_ready_focus(window_ms);
                }
                window.on_window_event(move |event| {
                    if let tauri::WindowEvent::Focused(true) = event {
                        log_ready_focus(window_ms);
                    }
                });
            }

            let handle = app.handle().clone();
            // Menus used to run before the event loop could serve the document.
            let menu_handle = handle.clone();
            handle.run_on_main_thread(move || {
                if let Err(err) = install_menus(&menu_handle) {
                    eprintln!("nexus menu: {err}");
                }
            })?;

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running Nexus");
}

fn install_menus(handle: &tauri::AppHandle) -> tauri::Result<()> {
            // Obsidian's chords: Ctrl/Cmd+O finds a note, Ctrl/Cmd+P runs a command.
            let open_vault = MenuItem::with_id(
                handle,
                "open_vault",
                "Open Vault…",
                true,
                Some("CmdOrCtrl+Shift+O"),
            )?;
            let quick_switcher = MenuItem::with_id(
                handle,
                "quick_switcher",
                "Quick Switcher…",
                true,
                Some("CmdOrCtrl+O"),
            )?;
            let command_palette = MenuItem::with_id(
                handle,
                "command_palette",
                "Command Palette…",
                true,
                Some("CmdOrCtrl+P"),
            )?;
            let open_demo = MenuItem::with_id(
                handle,
                "open_demo",
                "Explore Demo Vault",
                true,
                Some("CmdOrCtrl+Shift+D"),
            )?;
            let close_vault =
                MenuItem::with_id(handle, "close_vault", "Close Vault", true, None::<&str>)?;
            let settings =
                MenuItem::with_id(handle, "settings", "Settings…", true, Some("CmdOrCtrl+,"))?;
            let search =
                MenuItem::with_id(handle, "search", "Search…", true, Some("CmdOrCtrl+K"))?;
            let new_note =
                MenuItem::with_id(handle, "new_note", "New Note", true, Some("CmdOrCtrl+N"))?;
            let save =
                MenuItem::with_id(handle, "save", "Save", true, Some("CmdOrCtrl+S"))?;
            let toggle_graph = MenuItem::with_id(
                handle,
                "toggle_graph",
                "Toggle Graph Fullscreen",
                true,
                Some("CmdOrCtrl+G"),
            )?;
            let toggle_source = MenuItem::with_id(
                handle,
                "toggle_source",
                "Toggle Reading View",
                true,
                Some("CmdOrCtrl+E"),
            )?;

            // macOS app menu
            let app_submenu = Submenu::with_items(
                handle,
                "Nexus",
                true,
                &[
                    &settings,
                    &PredefinedMenuItem::separator(handle)?,
                    &PredefinedMenuItem::hide(handle, None)?,
                    &PredefinedMenuItem::hide_others(handle, None)?,
                    &PredefinedMenuItem::show_all(handle, None)?,
                    &PredefinedMenuItem::separator(handle)?,
                    &PredefinedMenuItem::quit(handle, None)?,
                ],
            )?;

            let file_submenu = Submenu::with_items(
                handle,
                "File",
                true,
                &[
                    &open_vault,
                    &open_demo,
                    &close_vault,
                    &PredefinedMenuItem::separator(handle)?,
                    &new_note,
                    &save,
                ],
            )?;

            let edit_submenu = Submenu::with_items(
                handle,
                "Edit",
                true,
                &[
                    &PredefinedMenuItem::undo(handle, None)?,
                    &PredefinedMenuItem::redo(handle, None)?,
                    &PredefinedMenuItem::separator(handle)?,
                    &PredefinedMenuItem::cut(handle, None)?,
                    &PredefinedMenuItem::copy(handle, None)?,
                    &PredefinedMenuItem::paste(handle, None)?,
                    &PredefinedMenuItem::select_all(handle, None)?,
                ],
            )?;

            let view_submenu = Submenu::with_items(
                handle,
                "View",
                true,
                &[&quick_switcher, &command_palette, &search, &toggle_graph, &toggle_source],
            )?;

            let window_submenu = Submenu::with_items(
                handle,
                "Window",
                true,
                &[
                    &PredefinedMenuItem::minimize(handle, None)?,
                    &PredefinedMenuItem::separator(handle)?,
                    &PredefinedMenuItem::close_window(handle, None)?,
                ],
            )?;

            let menu = Menu::with_items(
                handle,
                &[
                    &app_submenu,
                    &file_submenu,
                    &edit_submenu,
                    &view_submenu,
                    &window_submenu,
                ],
            )?;
            handle.set_menu(menu)?;

            handle.on_menu_event(move |app, event| {
                let id = event.id().as_ref().to_string();
                let _ = app.emit("nexus-menu", id);
            });

            Ok(())
}
