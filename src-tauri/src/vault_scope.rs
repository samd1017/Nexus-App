//! Wave A — registered vault roots for native walk / watch.
//! Frontend must register a root (after OS folder dialog) before meta walk or watch.

use std::collections::HashSet;
use std::path::{Component, Path, PathBuf};
use std::sync::Mutex;

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
pub fn vault_register_root(root: String) -> Result<String, String> {
    register_root(&root)
}

#[tauri::command]
pub fn vault_clear_roots() -> Result<bool, String> {
    clear_roots();
    Ok(true)
}
