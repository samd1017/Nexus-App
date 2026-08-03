use tauri::{
    menu::{Menu, MenuItem, PredefinedMenuItem, Submenu},
    Emitter,
};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_persisted_scope::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
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
                Some("CmdOrCtrl+\\"),
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
