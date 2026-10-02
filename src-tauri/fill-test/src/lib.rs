//! Path-includes the production fill module so this crate can test without GTK/Tauri.

#[allow(dead_code)]
#[path = "../../src/schema.rs"]
mod schema;
#[path = "../../src/index_fill/mod.rs"]
mod index_fill;
#[path = "../../src/fill_join.rs"]
mod fill_join;
#[path = "../../src/shell_catalog.rs"]
mod shell_catalog;
#[path = "../../src/task_scan.rs"]
mod task_scan;

pub use fill_join::*;
pub use index_fill::*;

#[cfg(test)]
mod bench_500k;
