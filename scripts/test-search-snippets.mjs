/**
 * Snippet + durable FTS body preservation for unloaded notes.
 * Run: node scripts/test-search-snippets.mjs
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
import {
  extractMatchSnippet,
  snippetForSearchHit,
} from "./src/lib/search/snippets.ts";
import {
  openMemoryDurableIndex,
  closeDurableIndex,
  upsertDurableNoteFromNode,
} from "./src/lib/vault/durable-index.ts";

const body =
  "Front matter noise. Later we discuss quantum entanglement in the vault notes carefully.";
const contextual = extractMatchSnippet(body, "entanglement", 20, 80);
assert.ok(contextual.includes("entanglement"), "contextual extract finds query");

const fromDurable = snippetForSearchHit({
  path: "projects/alpha.md",
  matchType: "content",
  query: "entanglement",
  durableBody: body,
});
assert.ok(fromDurable.includes("entanglement"), "content hit uses durable body");
assert.ok(fromDurable.length > 0, "never empty when durable body exists");

const titleHit = snippetForSearchHit({
  path: "projects/alpha.md",
  matchType: "title",
  durableBody: body,
});
assert.ok(titleHit.length > 0, "title hit shows preview not blank");

const pathOnly = snippetForSearchHit({
  path: "solo/path.md",
  matchType: "content",
  query: "zzz",
});
assert.equal(pathOnly, "solo/path.md", "falls back to path when no body");

closeDurableIndex();
const idx = openMemoryDurableIndex("snippet-test-vault");
idx.rebuildFromNodes({
  a: {
    id: "a",
    path: "deep/topic.md",
    name: "topic.md",
    kind: "note",
    parentId: null,
    mtime: Date.now(),
    content: "Alpha intro. The secret keyword is nebulium for retrieval tests.",
  },
});
idx.reconcileFromNodes({
  a: {
    id: "a",
    path: "deep/topic.md",
    name: "topic.md",
    kind: "note",
    parentId: null,
    mtime: Date.now(),
  },
});
const meta = idx.getNoteMeta("a");
assert.ok(meta?.bodySnippet?.includes("nebulium"), "preserves FTS body when unloaded");
const hits = idx.searchFts("nebulium", 5);
assert.ok(hits.length >= 1, "FTS finds unloaded body token");
assert.ok(
  hits[0].snippet.toLowerCase().includes("nebulium"),
  "FTS snippet includes match from durable body",
);

idx.upsertNote({
  id: "deep",
  path: "DeepProbe.md",
  name: "DeepProbe.md",
  kind: "note",
  parentId: null,
  mtime: 1,
  title: "DeepProbe",
  ftsText: "a".repeat(2000),
  slim: true,
});
assert.equal(idx.searchFts("zxqwv_nexus_deepbody_991", 5).length, 0);
upsertDurableNoteFromNode({
  id: "deep",
  path: "DeepProbe.md",
  name: "DeepProbe.md",
  kind: "note",
  parentId: null,
  mtime: 1,
  content: "b".repeat(8295) + " zxqwv_nexus_deepbody_991",
});
const deepHits = idx.searchFts("zxqwv_nexus_deepbody_991", 5);
assert.equal(deepHits.length, 1, "opened note indexes a digit token past 4000 chars");
assert.equal(deepHits[0].path, "DeepProbe.md");

// Early-cap intersection: a ubiquitous token must not materialize every posting.
const many = {};
for (let i = 0; i < 4000; i++) {
  many["n" + i] = {
    id: "n" + i,
    path: "notes/n" + i + ".md",
    name: "n" + i + ".md",
    kind: "note",
    parentId: null,
    mtime: Date.now(),
    content: "retrieval hub cluster " + i,
  };
}
idx.rebuildFromNodes(many);
const t0 = performance.now();
const capped = idx.searchFts("retrieval hub", 16);
const capMs = performance.now() - t0;
assert.ok(capped.length >= 1, "capped FTS still returns hits");
assert.ok(capped.length <= 16, "respects search limit");
assert.ok(capMs < 50, "4k ubiquitous-token search stays cheap (" + capMs.toFixed(2) + "ms)");
closeDurableIndex();
console.log("All snippet tests passed");
`,
  ],
  { cwd: process.cwd(), encoding: "utf8", timeout: 120_000 },
);

if (r.stdout) process.stdout.write(r.stdout);
if (r.stderr) process.stderr.write(r.stderr);
if (r.status !== 0) {
  console.error("snippet tests failed", r.error);
  process.exit(r.status ?? 1);
}
