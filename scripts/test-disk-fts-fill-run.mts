import assert from "node:assert/strict";
import { buildSyntheticVaultSync } from "../src/lib/vault/synthetic-vault.ts";
import {
  openMemoryDurableIndex,
  getDurableIndex,
  closeDurableIndex,
  MEMORY_FTS_POSTING_CAP,
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

// Posting cap: ubiquitous tokens must not retain a Set of every note id.
closeDurableIndex();
const many = 1200;
const capFiles: Record<string, string> = {};
for (let i = 0; i < many; i++) {
  const extra = i < 16 ? " uniquetokenhub " : "";
  capFiles[`n/Note-${i}.md`] = `# Note ${i}\n\ncluster word${extra}\n`;
}
const capNodes = nodesFromFileMap(capFiles).nodes;
openMemoryDurableIndex("disk-fts-cap");
const capIdx = getDurableIndex();
if (!capIdx) throw new Error("no cap index");
capIdx.reconcileFromNodes(capNodes);
const capFill = await fillDurableIndexFromReader(
  capNodes,
  async (p) => capFiles[p]!.slice(0, DISK_FTS_HEAD_CHARS),
  { concurrency: 4 },
);
const capStats = capIdx.stats();
const clusterCap = capIdx.searchFts("cluster", 16);
const uniqueHub = capIdx.searchFts("uniquetokenhub", 16);
assert.ok(capFill.indexed >= many, "capped fill indexed all");
assert.ok((capStats.largestPosting ?? 0) <= MEMORY_FTS_POSTING_CAP, "postings capped");
assert.equal(capStats.noteTokenSets ?? -1, 0, "slim fill drops per-note token sets");
assert.ok((capStats.slimNotes ?? 0) >= many, "slim notes tracked");
assert.ok(clusterCap.length > 0, "cluster still hits under posting cap");
assert.equal(uniqueHub.length, 16, "rare token is not truncated");
closeDurableIndex();
console.log(
  JSON.stringify({
    ok: true,
    postingCap: MEMORY_FTS_POSTING_CAP,
    largestPosting: capStats.largestPosting,
    noteTokenSets: capStats.noteTokenSets,
    slimNotes: capStats.slimNotes,
    clusterHits: clusterCap.length,
    uniqueHubHits: uniqueHub.length,
  }),
);

// Meeting-* ids must not create one inverted key per note (100k FSA retainer).
closeDurableIndex();
const meetFiles: Record<string, string> = {};
for (let i = 0; i < 1500; i++) {
  meetFiles[`m/Meeting-${i}-1oo.md`] = `# Meeting ${i}\n\ncluster agenda\n`;
}
const meetNodes = nodesFromFileMap(meetFiles).nodes;
openMemoryDurableIndex("disk-fts-meeting");
const meetIdx = getDurableIndex();
if (!meetIdx) throw new Error("no meeting index");
meetIdx.reconcileFromNodes(meetNodes);
await fillDurableIndexFromReader(
  meetNodes,
  async (p) => meetFiles[p]!.slice(0, DISK_FTS_HEAD_CHARS),
  { concurrency: 4 },
);
const meetStats = meetIdx.stats();
const meetCluster = meetIdx.searchFts("cluster", 16);
assert.ok(meetCluster.length > 0, "cluster hits on Meeting-* vault");
assert.ok(
  (meetStats.invTokens ?? 99999) < 80,
  `Meeting-* must not explode inv tokens (got ${meetStats.invTokens})`,
);
closeDurableIndex();
console.log(
  JSON.stringify({
    ok: true,
    meetingNotes: 1500,
    invTokens: meetStats.invTokens,
    largestPosting: meetStats.largestPosting,
    clusterHits: meetCluster.length,
  }),
);

// Forbidden FS reads must abort — do not spin through the vault.
closeDurableIndex();
const forbidNodes = nodesFromFileMap({
  "a.md": "# A\n",
  "b.md": "# B\n",
  "c.md": "# C\n",
}).nodes;
openMemoryDurableIndex("disk-fts-forbidden");
getDurableIndex()?.reconcileFromNodes(forbidNodes);
let reads = 0;
await assert.rejects(
  () =>
    fillDurableIndexFromReader(
      forbidNodes,
      async () => {
        reads += 1;
        throw new Error("forbidden path: C:\\\\Users\\\\samd1\\\\nexus-soak-100k");
      },
      { concurrency: 1 },
    ),
  /forbidden path/i,
);
assert.ok(reads <= 2, `must fail fast on forbidden reads (got ${reads} attempts)`);
closeDurableIndex();
