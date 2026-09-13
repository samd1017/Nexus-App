//! Wave A — registered vault roots for native walk / watch.
//! Frontend must register a root (after OS folder dialog **or** programmatic
//! path open) before meta walk, watch, or plugin-fs reads.
//!
//! Dialog-picked folders are added to `tauri-plugin-fs` persisted-scope
//! automatically. Path opens (Wave E / soak / reopen) must call
//! `vault_register_root` so `readDir` / `readTextFile` get the same grant.
//! Production capabilities still do not allow all of `$HOME`.

use std::collections::HashSet;
use std::path::{Component, Path, PathBuf};
use std::sync::Mutex;

use tauri::AppHandle;
use tauri_plugin_fs::FsExt;

static ALLOWED_ROOTS: Mutex<Option<HashSet<String>>> = Mutex::new(None);

fn normalize_root(root: &str) -> Result<PathBuf, String> {
    let p = PathBuf::from(root);
    if !p.is_absolute() {
        return Err("vault root must be absolute".into());
    }
    for c in p.components() {
        if matches!(c, Component::ParentDir) {
            return Err("vault root must not contain ..".into());
        }
    }
    // Prefer canonicalize when path exists
    match std::fs::canonicalize(&p) {
        Ok(c) => Ok(c),
        Err(_) => Ok(p),
    }
}

fn key_for(path: &Path) -> String {
    path.to_string_lossy().replace('\\', "/")
}

/// Strip Windows `\\?\` prefix so plugin-fs glob matching sees a normal path.
fn for_scope_path(path: &Path) -> PathBuf {
    let s = path.to_string_lossy();
    if let Some(rest) = s.strip_prefix(r"\\?\") {
        PathBuf::from(rest)
    } else {
        path.to_path_buf()
    }
}

pub fn is_entire_home_dir(path: &Path) -> bool {
    let candidates = [std::env::var("HOME").ok(), std::env::var("USERPROFILE").ok()];
    for home in candidates.into_iter().flatten() {
        if home.is_empty() {
            continue;
        }
        let hp = PathBuf::from(home);
        let hc = std::fs::canonicalize(&hp).unwrap_or(hp);
        if key_for(&for_scope_path(path)) == key_for(&for_scope_path(&hc)) {
            return true;
        }
    }
    false
}

pub fn is_allowed_vault_root(root: &str) -> bool {
    let Ok(norm) = normalize_root(root) else {
        return false;
    };
    let key = key_for(&norm);
    let guard = ALLOWED_ROOTS.lock().ok();
    let Some(guard) = guard else {
        return false;
    };
    let Some(set) = guard.as_ref() else {
        return false;
    };
    if set.contains(&key) {
        return true;
    }
    // Also accept if any registered root is a prefix (unlikely) or equal ignore trailing slash
    let key_trim = key.trim_end_matches('/');
    set.iter().any(|r| r.trim_end_matches('/') == key_trim)
}

pub fn register_root(root: &str) -> Result<String, String> {
    let norm = normalize_root(root)?;
    if !norm.is_dir() {
        return Err(format!("not a directory: {root}"));
    }
    let key = key_for(&norm);
    let mut guard = ALLOWED_ROOTS.lock().map_err(|e| e.to_string())?;
    let set = guard.get_or_insert_with(HashSet::new);
    set.insert(key.clone());
    Ok(key)
}

/// Grant plugin-fs (+ persisted-scope) for a vault folder — same as dialog `recursive: true`.
/// Refuses the entire home directory so Wave E cannot unlock `$HOME/**`.
pub fn grant_plugin_fs_scope(app: &AppHandle, root: &str) -> Result<(), String> {
    let raw = PathBuf::from(root);
    let norm = normalize_root(root)?;
    if is_entire_home_dir(&norm) || is_entire_home_dir(&raw) {
        return Err(
            "refusing to grant desktop FS scope for the entire home folder — open a vault subfolder (Documents/nexus-soak-N is the Wave E default)"
                .into(),
        );
    }
    let scope = app.fs_scope();
    let mut last_err: Option<String> = None;
    let mut granted = false;
    for p in [raw, norm] {
        let p = for_scope_path(&p);
        // Directory itself (readDir on the root) + descendants (recursive).
        match scope.allow_directory(&p, false) {
            Ok(()) => granted = true,
            Err(e) => last_err = Some(e.to_string()),
        }
        match scope.allow_directory(&p, true) {
            Ok(()) => granted = true,
            Err(e) => last_err = Some(e.to_string()),
        }
    }
    if granted {
        return Ok(());
    }
    Err(format!(
        "cannot allow vault folder for desktop FS: {}",
        last_err.unwrap_or_else(|| "unknown scope error".into())
    ))
}

pub fn register_and_grant(app: &AppHandle, root: &str) -> Result<String, String> {
    let key = register_root(root)?;
    grant_plugin_fs_scope(app, root)?;
    Ok(key)
}

pub fn clear_roots() {
    if let Ok(mut guard) = ALLOWED_ROOTS.lock() {
        *guard = Some(HashSet::new());
    }
}

pub fn unregister_root(root: &str) {
    let Ok(norm) = normalize_root(root) else {
        return;
    };
    let key = key_for(&norm);
    if let Ok(mut guard) = ALLOWED_ROOTS.lock() {
        if let Some(set) = guard.as_mut() {
            set.remove(&key);
            set.retain(|r| r.trim_end_matches('/') != key.trim_end_matches('/'));
        }
    }
}

/// Ensure db_path is under app data dir (index files only).
pub fn assert_index_db_path(app_data: &Path, db_path: &str) -> Result<PathBuf, String> {
    let p = PathBuf::from(db_path);
    let canon_data = std::fs::canonicalize(app_data).unwrap_or_else(|_| app_data.to_path_buf());
    // Allow non-existing file if parent is under app data
    let parent = p.parent().unwrap_or(Path::new("."));
    let parent_canon = std::fs::canonicalize(parent).unwrap_or_else(|_| parent.to_path_buf());
    let data_s = key_for(&canon_data);
    let parent_s = key_for(&parent_canon);
    if parent_s == data_s
        || parent_s.starts_with(&(data_s.clone() + "/"))
        || parent_s.contains("/indexes")
            && (parent_s.starts_with(&data_s) || p.starts_with(app_data))
    {
        return Ok(p);
    }
    // Also allow if path string is under app_data string prefix (dev)
    let db_s = key_for(&p);
    if db_s.starts_with(&data_s) {
        return Ok(p);
    }
    Err(format!(
        "index db path must be under app data dir (got {db_path})"
    ))
}

#[tauri::command]
pub fn vault_register_root(app: AppHandle, root: String) -> Result<String, String> {
    register_and_grant(&app, &root)
}

#[tauri::command]
pub fn vault_clear_roots() -> Result<bool, String> {
    clear_roots();
    Ok(true)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    #[test]
    fn rejects_relative() {
        assert!(normalize_root("foo/bar").is_err());
        assert!(register_root("foo/bar").is_err());
    }

    #[test]
    fn rejects_dotdot() {
        assert!(normalize_root("/tmp/foo/../bar").is_err());
    }

    #[test]
    fn registers_temp_dir() {
        clear_roots();
        let dir = std::env::temp_dir().join(format!("nexus-scope-{}", std::process::id()));
        fs::create_dir_all(&dir).unwrap();
        let key = register_root(dir.to_str().unwrap()).expect("register temp");
        assert!(is_allowed_vault_root(dir.to_str().unwrap()));
        assert!(key.to_lowercase().contains("nexus-scope"));
        let _ = fs::remove_dir_all(&dir);
        clear_roots();
    }

    #[test]
    fn entire_home_is_detected() {
        let home = std::env::var("HOME")
            .ok()
            .or_else(|| std::env::var("USERPROFILE").ok());
        let Some(home) = home else {
            return;
        };
        assert!(is_entire_home_dir(Path::new(&home)));
        assert!(!is_entire_home_dir(&PathBuf::from(&home).join("Documents")));
        assert!(!is_entire_home_dir(
            &PathBuf::from(&home).join("Documents").join("nexus-soak-100k")
        ));
    }
}
