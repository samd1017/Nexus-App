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
closeDurableIndex();
console.log("All snippet tests passed");
`,
  ],
  { cwd: "/workspace", encoding: "utf8", timeout: 120_000 },
);

if (r.stdout) process.stdout.write(r.stdout);
if (r.stderr) process.stderr.write(r.stderr);
if (r.status !== 0) {
  console.error("snippet tests failed", r.error);
  process.exit(r.status ?? 1);
}
