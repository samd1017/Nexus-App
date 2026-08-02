/**
 * Gated database module — Note App core does not use a database.
 * Kept as a no-op so leftover template imports never boot PGLite / Neon.
 */

export type DbSource = "none";

export const dbSource: DbSource = "none";

export async function ensureDbReady(): Promise<void> {
  /* local-first: no database */
}

export async function getSql(): Promise<never> {
  throw new Error(
    "Database is disabled. Note App is local-first (plain Markdown vaults only).",
  );
}

export async function getPglite(): Promise<never> {
  throw new Error(
    "PGLite is disabled. Note App is local-first (plain Markdown vaults only).",
  );
}
