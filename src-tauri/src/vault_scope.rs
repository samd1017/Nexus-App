//! Wave A — registered vault roots for native walk / watch.
//! Frontend must register a root (after OS folder dialog **or** programmatic
//! path open) before meta walk, watch, or plugin-fs reads.
//!
//! Dialog-picked folders are added to `tauri-plugin-fs` persisted-scope
//! automatically. Path opens (Wave E / scale / reopen) must call
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
            "refusing to grant desktop FS scope for the entire home folder — open a vault subfolder (Documents/nexus-scale-N is the Wave E default)"
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
        // Unix plugin-fs sets require_literal_leading_dot, so `vault/**` does
        // not cover `.nexus`. Grant that directory by its literal name.
        let nexus = p.join(".nexus");
        match scope.allow_directory(&nexus, false) {
            Ok(()) => granted = true,
            Err(e) => last_err = Some(e.to_string()),
        }
        match scope.allow_directory(&nexus, true) {
            Ok(()) => granted = true,
            Err(e) => last_err = Some(e.to_string()),
        }
        // Obsidian CSS snippets only; the rest of `.obsidian` stays out of scope.
        let snippets = p.join(".obsidian").join("snippets");
        for recursive in [false, true] {
            if let Err(e) = scope.allow_directory(&snippets, recursive) {
                last_err = Some(e.to_string());
            }
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

fn index_db_path_rejected(db_path: &str) -> String {
    format!("index db path must be under app data dir (got {db_path})")
}

/// Lexical absolute path with `.` and `..` resolved. `..` that escapes the
/// root is an error. This is a component walk, not a string prefix.
fn lexical_absolute(path: &Path) -> Result<PathBuf, ()> {
    if !path.is_absolute() {
        return Err(());
    }
    let mut out = PathBuf::new();
    for c in path.components() {
        match c {
            Component::CurDir => {}
            Component::ParentDir => {
                if !out.pop() {
                    return Err(());
                }
            }
            Component::Prefix(prefix) => out.push(prefix.as_os_str()),
            Component::RootDir => out.push(c.as_os_str()),
            Component::Normal(seg) => out.push(seg),
        }
    }
    if out.as_os_str().is_empty() {
        return Err(());
    }
    Ok(out)
}

/// Canonicalize the longest existing ancestor and reattach the missing tail
/// so a symlink cannot point the index file outside app data.
fn resolve_existing_ancestor(path: &Path) -> PathBuf {
    let mut suffix = Vec::new();
    let mut cur = path.to_path_buf();
    loop {
        if cur.exists() {
            let canon = std::fs::canonicalize(&cur).unwrap_or(cur);
            let mut resolved = canon;
            for part in suffix.iter().rev() {
                resolved.push(part);
            }
            return resolved;
        }
        let Some(name) = cur.file_name().map(|n| n.to_os_string()) else {
            return path.to_path_buf();
        };
        suffix.push(name);
        if !cur.pop() {
            return path.to_path_buf();
        }
    }
}

/// `candidate` is strictly inside `root` by whole path components.
fn strictly_under(root: &Path, candidate: &Path) -> bool {
    candidate.starts_with(root) && candidate != root
}

/// Ensure `db_path` is strictly inside the app data directory.
///
/// The check is a path-component prefix after resolving `.`, `..`, and the
/// longest existing ancestor (symlinks included). A string prefix is not
/// enough: `/tmp/evil-indexes/x.sqlite` is not under `/tmp/evil`, and a
/// sibling directory whose name merely contains `indexes` is not an index.
pub fn assert_index_db_path(app_data: &Path, db_path: &str) -> Result<PathBuf, String> {
    let rejected = || index_db_path_rejected(db_path);
    let p = PathBuf::from(db_path);
    let lexical = lexical_absolute(&p).map_err(|()| rejected())?;
    let root = match std::fs::canonicalize(app_data) {
        Ok(canon) => canon,
        Err(_) => lexical_absolute(app_data).map_err(|()| rejected())?,
    };
    let resolved = resolve_existing_ancestor(&lexical);
    let resolved = lexical_absolute(&resolved).unwrap_or(resolved);
    if !strictly_under(&root, &resolved) {
        return Err(rejected());
    }
    Ok(p)
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
            &PathBuf::from(&home).join("Documents").join("nexus-scale-100k")
        ));
    }

    fn scratch_dir(label: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!(
            "nexus-idx-{label}-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .map(|d| d.as_nanos())
                .unwrap_or(0)
        ));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn index_db_accepts_a_file_under_the_app_data_directory() {
        let base = scratch_dir("ok");
        let app = base.join("appdata");
        fs::create_dir_all(&app).unwrap();
        let db = app.join("indexes").join("abc.sqlite");
        assert!(assert_index_db_path(&app, db.to_str().unwrap()).is_ok());
        let _ = fs::remove_dir_all(&base);
    }

    #[test]
    fn index_db_rejects_sibling_whose_name_contains_indexes() {
        // String prefix would treat `/tmp/evil-indexes` as inside `/tmp/evil`.
        let base = scratch_dir("evil");
        let app = base.join("evil");
        let outside = base.join("evil-indexes");
        fs::create_dir_all(&app).unwrap();
        fs::create_dir_all(&outside).unwrap();
        let db = outside.join("x.sqlite");
        assert!(
            assert_index_db_path(&app, db.to_str().unwrap()).is_err(),
            "parent name containing indexes is not the app data directory"
        );
        let _ = fs::remove_dir_all(&base);
    }

    #[test]
    fn index_db_rejects_indexes_directory_outside_app_data() {
        let base = scratch_dir("outside");
        let app = base.join("appdata");
        let outside = base.join("not-the-app").join("indexes");
        fs::create_dir_all(&app).unwrap();
        fs::create_dir_all(&outside).unwrap();
        let db = outside.join("x.sqlite");
        assert!(assert_index_db_path(&app, db.to_str().unwrap()).is_err());
        let _ = fs::remove_dir_all(&base);
    }

    #[test]
    fn index_db_rejects_string_prefix_sibling() {
        let base = scratch_dir("prefix");
        let app = base.join("nexus");
        let sibling = base.join("nexus-evil").join("indexes");
        fs::create_dir_all(&app).unwrap();
        fs::create_dir_all(&sibling).unwrap();
        let db = sibling.join("x.sqlite");
        assert!(assert_index_db_path(&app, db.to_str().unwrap()).is_err());
        let _ = fs::remove_dir_all(&base);
    }

    #[test]
    fn index_db_rejects_dotdot_escape() {
        let base = scratch_dir("dotdot");
        let app = base.join("appdata");
        fs::create_dir_all(app.join("indexes")).unwrap();
        fs::create_dir_all(base.join("evil-indexes")).unwrap();
        let db = app
            .join("indexes")
            .join("..")
            .join("..")
            .join("evil-indexes")
            .join("x.sqlite");
        assert!(assert_index_db_path(&app, db.to_str().unwrap()).is_err());
        let _ = fs::remove_dir_all(&base);
    }

    #[test]
    fn index_db_rejects_relative_path() {
        let base = scratch_dir("rel");
        let app = base.join("appdata");
        fs::create_dir_all(&app).unwrap();
        assert!(assert_index_db_path(&app, "indexes/x.sqlite").is_err());
        let _ = fs::remove_dir_all(&base);
    }

    #[cfg(unix)]
    #[test]
    fn index_db_rejects_symlink_that_leaves_app_data() {
        let base = scratch_dir("link");
        let app = base.join("appdata");
        let outside = base.join("evil-indexes");
        fs::create_dir_all(&app).unwrap();
        fs::create_dir_all(&outside).unwrap();
        std::os::unix::fs::symlink(&outside, app.join("linked")).unwrap();
        let db = app.join("linked").join("x.sqlite");
        assert!(assert_index_db_path(&app, db.to_str().unwrap()).is_err());
        let _ = fs::remove_dir_all(&base);
    }
}
