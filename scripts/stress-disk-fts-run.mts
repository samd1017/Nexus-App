import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
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

const root = process.argv[2];
if (!root) throw new Error("usage: tsx scripts/stress-disk-fts-run.mts <vaultDir>");

function walkMd(dir: string, rel = ""): string[] {
  const files: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    const next = rel ? `${rel}/${name}` : name;
    if (statSync(full).isDirectory()) files.push(...walkMd(full, next));
    else if (name.toLowerCase().endsWith(".md")) files.push(next);
  }
  return files;
}

const paths = walkMd(root);
const files: Record<string, string> = {};
for (const p of paths) files[p] = readFileSync(join(root, p), "utf8");
const { nodes } = nodesFromFileMap(files);
closeDurableIndex();
openMemoryDurableIndex("disk-fts-bench");
getDurableIndex()!.reconcileFromNodes(nodes);
const t0 = performance.now();
const fill = await fillDurableIndexFromReader(nodes, async (p) =>
  files[p]!.slice(0, DISK_FTS_HEAD_CHARS),
);
const fillMs = Math.round(performance.now() - t0);
const idx = getDurableIndex()!;
const t1 = performance.now();
const hub = idx.searchFts("hub", 16);
const cluster = idx.searchFts("cluster", 16);
const searchMs = Math.round(performance.now() - t1);
const rss = Math.round(process.memoryUsage().rss / 1024 / 1024);
const report = {
  ok: hub.length > 0 && cluster.length > 0,
  notes: paths.length,
  fillMs,
  searchMs,
  hubHits: hub.length,
  clusterHits: cluster.length,
  indexed: fill.indexed,
  errors: fill.errors,
  rssMb: rss,
  searchEngine: "memory-fts-capped",
  fts: idx.stats(),
  out: root,
};
console.log(JSON.stringify(report, null, 2));
closeDurableIndex();
if (!report.ok) process.exit(1);
