/**
 * Disk Markdown generator + core path for 100k then 300k.
 * This VM is browser-first (no Tauri/FSA mount). We write real .md files
 * and exercise the same in-process generate / structural / path-patch / FTS
 * path desktop will use after a native scan.
 *
 *   node scripts/bench-disk-vault.mjs [--sizes 100000,300000]
 */
import { build } from "esbuild";
import { mkdirSync, writeFileSync, rmSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { pathToFileURL } from "node:url";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sizesArg = process.argv.find((_, i, a) => a[i - 1] === "--sizes");
const SIZES = (sizesArg || "100000,300000")
  .split(",")
  .map((s) => Number(s.trim()))
  .filter((n) => Number.isFinite(n) && n > 0);

const outRoot = join(tmpdir(), `nexus-disk-soak-${Date.now()}`);
mkdirSync(outRoot, { recursive: true });

async function bundle(entry, name) {
  const outfile = join(outRoot, name);
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

function rssMb() {
  return Math.round(process.memoryUsage().rss / 1024 / 1024);
}

function countFiles(dir) {
  let files = 0;
  const stack = [dir];
  while (stack.length) {
    const cur = stack.pop();
    let ents;
    try {
      ents = readdirSync(cur);
    } catch {
      continue;
    }
    for (const e of ents) {
      const full = join(cur, e);
      let st;
      try {
        st = statSync(full);
      } catch {
        continue;
      }
      if (st.isDirectory()) stack.push(full);
      else if (e.endsWith(".md")) files += 1;
    }
  }
  return files;
}

const syn = await bundle("src/lib/vault/synthetic-vault.ts", "synthetic.mjs");
const pathPatch = await bundle("src/lib/vault/path-patch.ts", "path-patch.mjs");
const indexes = await bundle("src/lib/vault/indexes.ts", "indexes.mjs");
const durable = await bundle("src/lib/vault/durable-index.ts", "durable.mjs");

const rows = [];
for (const n of SIZES) {
  const row = { notes: n, ok: false };
  const diskDir = join(outRoot, `vault-${n}`);
  try {
    const tWrite = performance.now();
    const stats = syn.writeSyntheticMarkdownFiles(n, (rel, body) => {
      const full = join(diskDir, rel);
      mkdirSync(path.dirname(full), { recursive: true });
      writeFileSync(full, body);
    });
    row.diskWriteMs = Math.round(performance.now() - tWrite);
    row.diskFiles = stats.files;
    row.diskMdCount = countFiles(diskDir);
    row.rssAfterDiskMb = rssMb();

    const tGen = performance.now();
    const vault = syn.buildSyntheticVaultSync({ noteCount: n });
    row.generateMs = Math.round(performance.now() - tGen);

    const idx = new indexes.VaultStructuralIndex();
    const tRebuild = performance.now();
    idx.rebuild(vault.nodes);
    row.structuralMs = Math.round(performance.now() - tRebuild);

    const pathToId = new Map();
    const signatures = {};
    for (const node of Object.values(vault.nodes)) {
      pathToId.set(node.path, node.id);
      if (node.kind === "note") signatures[node.path] = `${node.mtime}:0`;
    }
    const idOf = (p) => pathToId.get(p) ?? `x_${p}`;
    const ops = [];
    let i = 0;
    for (const node of Object.values(vault.nodes)) {
      if (node.kind !== "note") continue;
      ops.push({
        path: node.path,
        op: "upsert",
        sig: `${Date.now()}:${i}`,
        mtime: Date.now(),
      });
      i += 1;
      if (ops.length >= 20) break;
    }
    const prev = { nodes: vault.nodes, rootIds: vault.rootIds, signatures };
    const tPatch = performance.now();
    const patched = pathPatch.applyNoteOpsToScan(prev, ops, idOf);
    row.pathPatch20Ms = Number((performance.now() - tPatch).toFixed(2));
    row.pathPatchInPlace = patched.scan.nodes === vault.nodes;

    const mem = durable.openMemoryDurableIndex(`disk-${n}`);
    const tFts = performance.now();
    mem.rebuildFromNodes(vault.nodes);
    row.ftsMs = Math.round(performance.now() - tFts);
    const tSearch = performance.now();
    const hits = mem.searchFts("retrieval hub", 16);
    row.searchMs = Number((performance.now() - tSearch).toFixed(2));
    row.searchHits = hits.length;
    row.rssAfterCoreMb = rssMb();

    row.ok =
      row.diskMdCount === n &&
      row.pathPatchInPlace &&
      patched.changedPaths.length >= 1 &&
      idx.noteCount === n &&
      hits.length >= 1;
    if (row.pathPatch20Ms > 100) row.warn = `path-patch20 ${row.pathPatch20Ms}ms > 100ms`;
  } catch (err) {
    row.ok = false;
    row.error = err instanceof Error ? err.message : String(err);
    row.rssAfterCoreMb = rssMb();
  }
  rows.push(row);
  console.log(JSON.stringify(row));
  if (!row.ok) break;
}

const report = {
  when: new Date().toISOString(),
  outRoot,
  rows,
  largestGreen: [...rows].reverse().find((r) => r.ok)?.notes ?? 0,
};
writeFileSync(join(outRoot, "disk-bench.json"), JSON.stringify(report, null, 2));
mkdirSync("/opt/cursor/artifacts/stress", { recursive: true });
writeFileSync(
  "/opt/cursor/artifacts/stress/disk-bench.json",
  JSON.stringify(report, null, 2),
);
console.log("LARGEST_DISK_GREEN", report.largestGreen);
if (rows.some((r) => !r.ok)) process.exitCode = 2;
