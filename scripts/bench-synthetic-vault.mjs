/**
 * Climb synthetic vault sizes in-process until generate/index/persist breaks.
 *   node scripts/bench-synthetic-vault.mjs
 * Optional: --sizes 10000,50000,100000,200000
 */
import { build } from "esbuild";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { pathToFileURL } from "node:url";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sizesArg = process.argv.find((_, i, a) => a[i - 1] === "--sizes");
const SIZES = (sizesArg || "10000,50000,100000,200000,300000")
  .split(",")
  .map((s) => Number(s.trim()))
  .filter((n) => Number.isFinite(n) && n > 0);

const outDir = join(tmpdir(), `nexus-syn-bench-${Date.now()}`);
mkdirSync(outDir, { recursive: true });

async function bundle(entry, name) {
  const outfile = join(outDir, name);
  await build({
    entryPoints: [path.join(root, entry)],
    outfile,
    bundle: true,
    format: "esm",
    platform: "neutral",
    logLevel: "silent",
  });
  return import(pathToFileURL(outfile).href);
}

const syn = await bundle("src/lib/vault/synthetic-vault.ts", "synthetic.mjs");
const durable = await bundle("src/lib/vault/durable-index.ts", "durable.mjs");
const indexes = await bundle("src/lib/vault/indexes.ts", "indexes.mjs");
const persist = await bundle("src/lib/vault/persist-policy.ts", "persist.mjs");

function rssMb() {
  return Math.round(process.memoryUsage().rss / 1024 / 1024);
}

function heapMb() {
  return Math.round(process.memoryUsage().heapUsed / 1024 / 1024);
}

const rows = [];
for (const n of SIZES) {
  const row = { notes: n, ok: false };
  global.gc?.();
  const rss0 = rssMb();
  try {
    const tGen = performance.now();
    const vault = syn.buildSyntheticVaultSync({ noteCount: n });
    row.generateMs = Math.round(performance.now() - tGen);
    row.folderCount = vault.folderCount;
    row.heapAfterGenMb = heapMb();

    const tIdx = performance.now();
    const index = new indexes.VaultStructuralIndex();
    index.rebuild(vault.nodes);
    row.structuralMs = Math.round(performance.now() - tIdx);

    const tFts = performance.now();
    const mem = durable.openMemoryDurableIndex
      ? durable.openMemoryDurableIndex("bench")
      : null;
    if (!mem) {
      // fall back: construct via rebuildDurableIndexFromNodes
      durable.rebuildDurableIndexFromNodes("bench", vault.nodes, true);
    } else {
      mem.rebuildFromNodes(vault.nodes);
    }
    row.ftsMs = Math.round(performance.now() - tFts);

    const tSearch = [];
    const idx = durable.getActiveDurableIndex?.() ?? mem;
    const searcher = idx ?? { searchFts: () => [] };
    for (let i = 0; i < 20; i++) {
      const ts = performance.now();
      const hits = searcher.searchFts("retrieval hub", 20);
      tSearch.push(performance.now() - ts);
      if (i === 0) row.searchHits = hits.length;
    }
    tSearch.sort((a, b) => a - b);
    row.searchP50Ms = Number(tSearch[Math.floor(tSearch.length * 0.5)].toFixed(2));
    row.searchP95Ms = Number(tSearch[Math.floor(tSearch.length * 0.95)].toFixed(2));

    const sliced = persist.partializeVaultPersist({
      mode: "local",
      vaultId: `soak-vault-${n}`,
      vaultName: vault.vaultName,
      nodes: vault.nodes,
      settings: {
        workspaceSplit: true,
        lastNotePath: Object.values(vault.nodes).find((x) => x.kind === "note")?.path,
        lastSecondaryNotePath: null,
        soakNoteCount: n,
      },
    });
    row.persistedNodeKeys = Object.keys(sliced.nodes).length;
    row.remountKind = sliced.scaleRemount?.kind ?? null;
    row.quotaSafe = sliced.persistedNodeKeys === 0 && sliced.remountKind === "soak";
    row.rssDeltaMb = rssMb() - rss0;
    row.heapMb = heapMb();
    row.ok = true;
    if (row.ftsMs > 1000) row.blocker = `FTS rebuild ${row.ftsMs}ms > 1s`;
    if (row.generateMs > 8000) row.warn = `generate ${row.generateMs}ms`;
  } catch (err) {
    row.ok = false;
    row.error = err instanceof Error ? err.message : String(err);
    row.heapMb = heapMb();
  }
  rows.push(row);
  console.log(JSON.stringify(row));
  if (!row.ok) break;
}

const report = {
  when: new Date().toISOString(),
  rssMb: rssMb(),
  rows,
  largestGreen: [...rows].reverse().find((r) => r.ok)?.notes ?? 0,
};
const dest = "/opt/cursor/artifacts/stress/bench-synthetic.json";
try {
  mkdirSync("/opt/cursor/artifacts/stress", { recursive: true });
  writeFileSync(dest, JSON.stringify(report, null, 2));
} catch {
  writeFileSync(join(root, "bench-synthetic.json"), JSON.stringify(report, null, 2));
}
rmSync(outDir, { recursive: true, force: true });
console.log("LARGEST_GREEN", report.largestGreen);
