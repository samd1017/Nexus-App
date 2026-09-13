import assert from "node:assert/strict";
import { buildSyntheticVaultSync } from "../src/lib/vault/synthetic-vault.ts";
import {
  openMemoryDurableIndex,
  getDurableIndex,
  closeDurableIndex,
} from "../src/lib/vault/durable-index.ts";
import {
  fillDurableIndexFromReader,
  nodesFromFileMap,
  DISK_FTS_HEAD_CHARS,
} from "../src/lib/vault/disk-fts-fill.ts";

closeDurableIndex();
const built = buildSyntheticVaultSync({ noteCount: 400 });
const files: Record<string, string> = {};
for (const n of Object.values(built.nodes)) {
  if (n.kind === "note" && typeof n.content === "string") files[n.path] = n.content;
}
const { nodes } = nodesFromFileMap(files);
for (const id in nodes) {
  if (nodes[id]?.kind === "note") delete nodes[id]!.content;
}

openMemoryDurableIndex("disk-fts-test");
const idx = getDurableIndex();
if (!idx) throw new Error("no index");
idx.reconcileFromNodes(nodes);

const titleHits = idx.searchFts("hub", 8);
assert.ok(titleHits.length > 0, "Hub N titles should match hub before body fill");

const clusterBefore = idx.searchFts("cluster", 8);
assert.equal(clusterBefore.length, 0, "cluster is body-only — empty before fill");

const t0 = performance.now();
const fill = await fillDurableIndexFromReader(
  nodes,
  async (p) => files[p]!.slice(0, DISK_FTS_HEAD_CHARS),
  { concurrency: 4 },
);
const fillMs = Math.round(performance.now() - t0);
assert.ok(fill.indexed >= 400, "indexed all notes");

const clusterAfter = idx.searchFts("cluster", 16);
assert.ok(clusterAfter.length > 0, "cluster must hit after file-head fill");
const hubAfter = idx.searchFts("hub", 16);
assert.ok(hubAfter.length > 0, "hub still hits after fill");

closeDurableIndex();
console.log(
  JSON.stringify({
    ok: true,
    fillMs,
    indexed: fill.indexed,
    clusterHits: clusterAfter.length,
    hubHits: hubAfter.length,
  }),
);
