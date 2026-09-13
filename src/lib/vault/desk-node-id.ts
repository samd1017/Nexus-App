/**
 * Path-stable desktop node id.
 * TS `deskNodeId` and Rust `desk_node_id` must stay identical so FTS rows
 * join the JS tree after `vault_index_fill_from_disk`.
 * Rel paths are POSIX (`/`); Windows `\` is normalized first.
 */
export function deskNodeId(path: string): string {
  const posix = path.replace(/\\/g, "/");
  return "desk_" + posix.replace(/[^a-zA-Z0-9._/-]+/g, "_");
}
