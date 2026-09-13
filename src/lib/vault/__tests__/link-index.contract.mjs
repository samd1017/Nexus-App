/**
 * Link index can be seeded without hydrating note bodies.
 * Run: node src/lib/vault/__tests__/link-index.contract.mjs
 */
import assert from "node:assert/strict";

if (!process.env.NEXUS_TSX) {
  const { spawnSync } = await import("node:child_process");
  const r = spawnSync(
    "npx",
    ["--yes", "tsx", "src/lib/vault/__tests__/link-index.contract.mjs"],
    {
      cwd: process.cwd(),
      encoding: "utf8",
      timeout: 30_000,
      env: { ...process.env, NEXUS_TSX: "1" },
    },
  );
  if (r.stdout) process.stdout.write(r.stdout);
  if (r.stderr) process.stderr.write(r.stderr);
  process.exit(r.status ?? 1);
}

const {
  vaultLinkIndex,
  resetLinkIndex,
  rebuildLinkIndex,
  seedLinkIndex,
} = await import("../link-index.ts");

resetLinkIndex();
assert.equal(vaultLinkIndex.ready, false);
assert.equal(vaultLinkIndex.stats().edgeCount, 0);

const stats = seedLinkIndex([
  { sourceId: "hub", targets: ["Topic 1", "cluster"] },
  { sourceId: "n1", targets: ["Hub"] },
]);
assert.equal(vaultLinkIndex.ready, true);
assert.equal(stats.edgeCount, 3);
assert.deepEqual(vaultLinkIndex.getOutgoing("hub"), ["Topic 1", "cluster"]);
assert.ok(vaultLinkIndex.getBacklinkSources("topic 1").includes("hub"));
assert.ok(vaultLinkIndex.getBacklinkSources("Hub").includes("n1"));

const lazy = {
  hub: { id: "hub", path: "Hub.md", name: "Hub.md", kind: "note", parentId: null, mtime: 1 },
  n1: { id: "n1", path: "Topic 1.md", name: "Topic 1.md", kind: "note", parentId: null, mtime: 1 },
  n2: { id: "n2", path: "Other.md", name: "Other.md", kind: "note", parentId: null, mtime: 1 },
};
rebuildLinkIndex(lazy);
assert.equal(
  vaultLinkIndex.getOutgoing("hub").length,
  2,
  "lazy rebuild must keep seeded edges",
);
assert.equal(vaultLinkIndex.ready, true);

vaultLinkIndex.setNoteLinks("n1", "# Topic 1\nSee [[Hub]] and [[Other]].\n");
assert.deepEqual(vaultLinkIndex.getOutgoing("n1"), ["Hub", "Other"]);

resetLinkIndex();
rebuildLinkIndex(lazy);
assert.equal(vaultLinkIndex.ready, false, "all-lazy rebuild does not fake ready");
assert.equal(vaultLinkIndex.stats().edgeCount, 0);

console.log("link-index.contract: ok");
