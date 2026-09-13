//! Path-includes the production fill module so this crate can test without GTK/Tauri.

#[path = "../../src/index_fill.rs"]
mod index_fill;

pub use index_fill::*;
