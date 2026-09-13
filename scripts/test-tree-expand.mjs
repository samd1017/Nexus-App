/**
 * Accordion folder expand must stay O(depth) at large N.
 * Run: npm run test:tree-expand
 */
import assert from "node:assert/strict";

if (!process.env.NEXUS_TSX) {
  const { spawnSync } = await import("node:child_process");
  const r = spawnSync("npx", ["--yes", "tsx", "scripts/test-tree-expand.mjs"], {
    cwd: process.cwd(),
    encoding: "utf8",
    timeout: 30_000,
    env: { ...process.env, NEXUS_TSX: "1" },
  });
  if (r.stdout) process.stdout.write(r.stdout);
  if (r.stderr) process.stderr.write(r.stderr);
  process.exit(r.status ?? 1);
}

const {
  smartExpandedFolders,
  expandPathToNote,
  sameExpandedFolders,
  DEFAULT_JOURNAL_FOLDER,
} = await import("../src/lib/vault/tree-expand.ts");
const { resetVaultIndex, ensureVaultIndex } = await import(
  "../src/lib/vault/indexes.ts"
);

function makeVault(noteCount) {
  /** @type {Record<string, any>} */
  const nodes = {
    journal: {
      id: "journal",
      path: DEFAULT_JOURNAL_FOLDER,
      name: DEFAULT_JOURNAL_FOLDER,
      kind: "folder",
      parentId: null,
      mtime: 1,
    },
    alpha: {
      id: "alpha",
      path: "Alpha",
      name: "Alpha",
      kind: "folder",
      parentId: null,
      mtime: 1,
    },
    beta: {
      id: "beta",
      path: "Alpha/Beta",
      name: "Beta",
      kind: "folder",
      parentId: "alpha",
      mtime: 1,
    },
  };
  for (let i = 0; i < noteCount; i++) {
    const id = `n${i}`;
    nodes[id] = {
      id,
      path: `Alpha/Beta/Note-${i}.md`,
      name: `Note-${i}.md`,
      kind: "note",
      parentId: "beta",
      mtime: 1,
    };
  }
  return nodes;
}

resetVaultIndex();
const nodes = makeVault(8000);
ensureVaultIndex(nodes);

const path = expandPathToNote(nodes, "n12");
assert.deepEqual(path, ["beta", "alpha"]);

const a = smartExpandedFolders(nodes, "n12");
assert.ok(a.includes("journal"), "journal root via path index");
assert.ok(a.includes("alpha"));
assert.ok(a.includes("beta"));
assert.equal(a.length, 3);

const b = smartExpandedFolders(nodes, "n99");
assert.ok(sameExpandedFolders(a, b), "siblings share accordion set");
assert.equal(sameExpandedFolders(a, ["alpha", "beta"]), false);

const t0 = performance.now();
for (let i = 0; i < 200; i++) {
  smartExpandedFolders(nodes, `n${i % 8000}`);
}
const elapsed = performance.now() - t0;
assert.ok(
  elapsed < 80,
  `200 accordion expands @8k must stay cheap, took ${elapsed.toFixed(1)}ms`,
);

console.log(`tree-expand: PASS 200 selects @8k in ${elapsed.toFixed(1)}ms`);
