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

const loaded = {
  a: {
    id: "a",
    path: "A.md",
    name: "A.md",
    kind: "note",
    parentId: null,
    mtime: 1,
    content: "See [[B]]",
  },
  b: {
    id: "b",
    path: "B.md",
    name: "B.md",
    kind: "note",
    parentId: null,
    mtime: 1,
    content: "See [[A]]",
  },
};
rebuildLinkIndex(loaded);
assert.equal(vaultLinkIndex.stats().edgeCount, 2);
const stripped = {
  a: { id: "a", path: "A.md", name: "A.md", kind: "note", parentId: null, mtime: 1 },
  b: {
    id: "b",
    path: "B.md",
    name: "B.md",
    kind: "note",
    parentId: null,
    mtime: 1,
    content: "See [[A]]",
  },
};
rebuildLinkIndex(stripped);
assert.deepEqual(
  vaultLinkIndex.getOutgoing("a"),
  ["B"],
  "a stripped body must keep the edges indexed before the strip",
);

const { ensureVaultIndex } = await import("../indexes.ts");
ensureVaultIndex(null);
ensureVaultIndex(undefined);
assert.equal(ensureVaultIndex({}).noteCount, 0);

const { buildEgoGraph } = await import("../../graph/build-graph.ts");
seedLinkIndex([
  { sourceId: "hub", targets: ["Topic 1"] },
  { sourceId: "n1", targets: ["Hub"] },
]);
const egoNodes = {
  hub: {
    id: "hub",
    path: "Hub.md",
    name: "Hub.md",
    kind: "note",
    parentId: null,
    mtime: 1,
  },
  n1: {
    id: "n1",
    path: "Topic 1.md",
    name: "Topic 1.md",
    kind: "note",
    parentId: null,
    mtime: 1,
  },
};
const ego = buildEgoGraph(egoNodes, "hub", 2, 80);
assert.ok(
  ego.nodes.some((n) => n.id === "n1"),
  "seeded index must populate ego without hydrating bodies",
);
assert.ok(ego.edges.length >= 1);

resetLinkIndex();
vaultLinkIndex.setNoteLinks("only", "See [[Other Note]]\n");
assert.equal(vaultLinkIndex.ready, false, "one saved note must not mark the map ready");
assert.equal(vaultLinkIndex.coversNoteCount(2), false);
assert.equal(vaultLinkIndex.stats().noteCount, 1);
rebuildLinkIndex({
  only: {
    id: "only",
    path: "Only.md",
    name: "Only.md",
    kind: "note",
    parentId: null,
    mtime: 1,
    content: "See [[Other Note]]\n",
  },
  other: {
    id: "other",
    path: "Other Note.md",
    name: "Other Note.md",
    kind: "note",
    parentId: null,
    mtime: 1,
    content: "Back to [[Only]]\n",
  },
});
assert.equal(vaultLinkIndex.coversNoteCount(2), true);
assert.ok(vaultLinkIndex.getBacklinkSources("only").includes("other"));

const { getBacklinks } = await import("../backlinks.ts");
const { invalidateBacklinkIndex } = await import("../backlink-index.ts");
resetLinkIndex();
invalidateBacklinkIndex();
const partial = {
  only: {
    id: "only",
    path: "First Light.md",
    name: "First Light.md",
    kind: "note",
    parentId: null,
    mtime: 1,
    content: "Hello\n",
  },
  plain: {
    id: "plain",
    path: "Linking Notes.md",
    name: "Linking Notes.md",
    kind: "note",
    parentId: null,
    mtime: 1,
    content: "See [[First Light]]\n",
  },
  block: {
    id: "block",
    path: "Heading.md",
    name: "Heading.md",
    kind: "note",
    parentId: null,
    mtime: 1,
    content: "See [[First Light#^next-step]]\n",
  },
};
vaultLinkIndex.setNoteLinks("only", partial.only.content);
assert.equal(vaultLinkIndex.coversNoteCount(3), false);
const titles = getBacklinks(partial.only, partial).map((b) => b.fromTitle);
assert.ok(titles.includes("Linking Notes"), `plain link missing: ${titles}`);
assert.ok(titles.includes("Heading"), `block link missing: ${titles}`);

console.log("link-index.contract: ok");
