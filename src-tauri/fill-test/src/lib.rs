//! Path-includes the production fill module so this crate can test without GTK/Tauri.

#[path = "../../src/index_fill.rs"]
mod index_fill;
#[path = "../../src/fill_join.rs"]
mod fill_join;
#[path = "../../src/shell_catalog.rs"]
mod shell_catalog;

pub use fill_join::*;
pub use index_fill::*;
