/**
 * Unit tests: body-archive rekey + scale flags + strip/rehydrate contract.
 * Run: node scripts/test-body-archive-lifecycle.mjs
 */
import assert from "node:assert/strict";

// Dynamic import TS via vite-node if available; else transpile-free pure logic retest
// Test pure body-archive by loading via tsx or esbuild. Prefer node --experimental?
// Use dynamic import of .ts through vite's ssrLoad? Keep pure reimplementation check
// by importing compiled path — project uses TS source with vite.

import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";

// Use tsx if present
const r = spawnSync(
  "npx",
  [
    "--yes",
    "tsx",
    "-e",
    `
import assert from "node:assert/strict";
import {
  archiveBodiesFromNodes,
  getBodyFromArchive,
  setBodyInArchive,
  rekeyBodyArchive,
  rekeyBodyArchivePrefix,
  removeBodyFromArchive,
  clearBodyArchive,
  hasBodyArchive,
  bodyArchiveSize,
} from "./src/lib/vault/body-archive.ts";
import { stripBodies } from "./src/lib/vault/backend.ts";
import { shouldLazyBodies, shouldUseDurableIndex, isLargeMemoryVault } from "./src/lib/vault/scale-flags.ts";
import { LARGE_TEST_VAULT_ID } from "./src/lib/vault/large-test-vault.ts";

clearBodyArchive();
assert.equal(hasBodyArchive(), false);

const nodes = {
  a: { id: "a", path: "00-Inbox/a.md", name: "a.md", kind: "note", parentId: null, mtime: 1, content: "# A\\nbody-a" },
  b: { id: "b", path: "Projects/x/b.md", name: "b.md", kind: "note", parentId: null, mtime: 1, content: "# B\\nbody-b" },
  f: { id: "f", path: "Projects/x", name: "x", kind: "folder", parentId: null, mtime: 1 },
};

archiveBodiesFromNodes(nodes);
assert.equal(hasBodyArchive(), true);
assert.equal(bodyArchiveSize(), 2);
assert.equal(getBodyFromArchive("00-Inbox/a.md"), "# A\\nbody-a");

// strip keeps only keep ids
const stripped = stripBodies(nodes, new Set(["a"]));
assert.equal(stripped.a.content, "# A\\nbody-a");
assert.equal(stripped.b.content, undefined);
// rehydrate from archive
assert.equal(getBodyFromArchive("Projects/x/b.md"), "# B\\nbody-b");

// rename note path
rekeyBodyArchive("00-Inbox/a.md", "00-Inbox/renamed.md");
assert.equal(getBodyFromArchive("00-Inbox/a.md"), undefined);
assert.equal(getBodyFromArchive("00-Inbox/renamed.md"), "# A\\nbody-a");

// folder move prefix
rekeyBodyArchivePrefix("Projects/x", "Archive/x");
assert.equal(getBodyFromArchive("Projects/x/b.md"), undefined);
assert.equal(getBodyFromArchive("Archive/x/b.md"), "# B\\nbody-b");

// edit write-back
setBodyInArchive("Archive/x/b.md", "# B\\nedited");
assert.equal(getBodyFromArchive("Archive/x/b.md"), "# B\\nedited");

// delete
removeBodyFromArchive("Archive/x/b.md");
assert.equal(getBodyFromArchive("Archive/x/b.md"), undefined);

// scale flags
assert.equal(isLargeMemoryVault(LARGE_TEST_VAULT_ID), true);
assert.equal(shouldLazyBodies("local", LARGE_TEST_VAULT_ID), true);
assert.equal(shouldLazyBodies("local", "demo-vault"), false);
assert.equal(shouldLazyBodies("desktop"), true);
assert.equal(shouldUseDurableIndex("local", LARGE_TEST_VAULT_ID), true);
assert.equal(shouldUseDurableIndex("local", "other"), false);
assert.equal(shouldUseDurableIndex("desktop", "desk-x"), true);

// clear leaves no archive (failed re-open must not clear while still mounted — tested at store level)
clearBodyArchive();
assert.equal(hasBodyArchive(), false);

console.log("PASS body-archive lifecycle + scale flags");
`,
  ],
  { cwd: "/workspace", encoding: "utf8", timeout: 60000 },
);
process.stdout.write(r.stdout || "");
process.stderr.write(r.stderr || "");
process.exit(r.status ?? 1);
