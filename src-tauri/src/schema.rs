//! Canonical DurableIndex DDL.
//!
//! The bytes live in `schema/durable-index.sql`. The Rust index includes that
//! file, and the TypeScript contract imports the same file.

pub const SCHEMA_VERSION: i32 = 3;

pub const DDL: &str = include_str!("../../schema/durable-index.sql");
