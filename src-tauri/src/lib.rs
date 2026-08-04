mod durable_index;
mod vault_scope;
mod vault_watch;

use durable_index::{
    vault_index_close, vault_index_list, vault_index_open, vault_index_path, vault_index_rebuild,
    vault_index_remove, vault_index_search, vault_index_stats, vault_index_upsert,
    vault_index_wipe, IndexState,
};
use vault_scope::{
    is_allowed_vault_root, register_root, vault_clear_roots, vault_register_root,
};
use vault_watch::{
    vault_watch_ack, vault_watch_start, vault_watch_stop, WatchState,
};

use tauri::{
    menu::{Menu, MenuItem, PredefinedMenuItem, Submenu},
    Emitter,
};

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
/// Wave A: root is registered (absolute, no `..`) before walk.
#[tauri::command]
fn vault_meta_walk(root: String) -> Result<Vec<NodeMetaDto>, String> {
    use std::fs;
    use std::path::{Path, PathBuf};
    use std::time::SystemTime;

    // Register-on-open after OS dialog; still rejects non-absolute / `..` paths.
    if !is_allowed_vault_root(&root) {
        register_root(&root)?;
    }
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
    tauri::Builder::default()
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_persisted_scope::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .manage(std::sync::Mutex::new(IndexState::new()))
        .manage(std::sync::Mutex::new(WatchState::new()))
        .invoke_handler(tauri::generate_handler![
            vault_meta_walk,
            vault_index_ping,
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
            vault_watch_start,
            vault_watch_stop,
            vault_watch_ack,
        ])
        .setup(|app| {
            let handle = app.handle();

            let open_vault =
                MenuItem::with_id(handle, "open_vault", "Open Vault…", true, Some("CmdOrCtrl+O"))?;
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
                "Toggle Visual / Source",
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
                &[&search, &toggle_graph, &toggle_source],
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
            app.set_menu(menu)?;

            app.on_menu_event(move |app, event| {
                let id = event.id().as_ref().to_string();
                let _ = app.emit("nexus-menu", id);
            });

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running Nexus");
}
