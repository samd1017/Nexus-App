/**
 * Large-vault overlay apply — session creates/edits must remount.
 * Run: node scripts/test-large-vault-overlay.mjs
 */
import { spawnSync } from "node:child_process";

const r = spawnSync(
  "npx",
  [
    "--yes",
    "tsx",
    "-e",
    `
import assert from "node:assert/strict";
import { applyLargeVaultOverlay } from "./src/lib/vault/large-vault-overlay.ts";

const nodes = {
  seed: { id: "seed", path: "00-Inbox/Seed.md", name: "Seed.md", kind: "note", parentId: null, mtime: 1, content: "old" },
  folder: { id: "folder", path: "00-Inbox", name: "00-Inbox", kind: "folder", parentId: null, mtime: 1 },
};
const roots = ["folder", "seed"];

const r = applyLargeVaultOverlay(nodes, roots, [
  { id: "seed", path: "00-Inbox/Seed.md", name: "Seed.md", kind: "note", parentId: "folder", parentPath: "00-Inbox", content: "edited", mtime: 2 },
  { id: "n_Soak_Created_md", path: "Soak Created.md", name: "Soak Created.md", kind: "note", parentId: null, parentPath: null, content: "# Soak\\n", mtime: 3 },
  { id: "gone", path: "gone.md", name: "gone.md", kind: "note", parentId: null, parentPath: null, mtime: 1, deleted: true },
]);

assert.equal(nodes.seed.content, "edited", "seed edit survives remount apply");
assert.ok(nodes.n_Soak_Created_md, "created note is applied");
assert.equal(nodes.n_Soak_Created_md.content, "# Soak\\n");
assert.ok(r.rootIds.includes("n_Soak_Created_md"), "new root note is in rootIds");
assert.equal(r.applied, 2);
assert.equal(r.deleted, 0);
console.log("OK: overlay apply restores create + seed edit");
`,
  ],
  { cwd: process.cwd(), encoding: "utf8", timeout: 60_000 },
);

if (r.stdout) process.stdout.write(r.stdout);
if (r.stderr) process.stderr.write(r.stderr);
if (r.status !== 0) {
  console.error("overlay tests failed", r.error);
  process.exit(r.status ?? 1);
}
