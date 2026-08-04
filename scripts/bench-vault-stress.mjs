/**
 * Wave C — synthetic vault stress (50k–100k meta).
 * Run: node scripts/bench-vault-stress.mjs --notes 50000
 */

import { build } from "esbuild";
import { pathToFileURL } from "node:url";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

function parseArgs() {
  const args = process.argv.slice(2);
  let notes = 50000;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--notes" && args[i + 1]) notes = Number(args[++i]);
  }
  return { notes: Number.isFinite(notes) ? notes : 50000 };
}

function makeMetaVault(nNotes, folders = 200) {
  const nodes = {};
  const rootIds = [];
  for (let f = 0; f < folders; f++) {
    const id = `folder_${f}`;
    nodes[id] = {
      id,
      path: `Folder${f}`,
      name: `Folder${f}`,
      kind: "folder",
      parentId: null,
      mtime: Date.now(),
    };
    rootIds.push(id);
  }
  for (let i = 0; i < nNotes; i++) {
    const f = i % folders;
    const parentId = `folder_${f}`;
    const id = `note_${i}`;
    const name = `Note ${i}.md`;
    const path = `Folder${f}/${name}`;
    nodes[id] = {
      id,
      path,
      name,
      kind: "note",
      parentId,
      mtime: Date.now() - i,
    };
  }
  return { nodes, rootIds };
}

async function loadModules() {
  const outDir = join(tmpdir(), `nexus-stress-${Date.now()}`);
  mkdirSync(outDir, { recursive: true });
  const indexesOut = join(outDir, "indexes.mjs");
  const pathPatchOut = join(outDir, "path-patch.mjs");
  const durableOut = join(outDir, "durable.mjs");

  await build({
    entryPoints: [path.join(root, "src/lib/vault/indexes.ts")],
    outfile: indexesOut,
    bundle: true,
    format: "esm",
    platform: "neutral",
    logLevel: "silent",
  });
  await build({
    entryPoints: [path.join(root, "src/lib/vault/path-patch.ts")],
    outfile: pathPatchOut,
    bundle: true,
    format: "esm",
    platform: "neutral",
    logLevel: "silent",
  });
  await build({
    entryPoints: [path.join(root, "src/lib/vault/durable-index.ts")],
    outfile: durableOut,
    bundle: true,
    format: "esm",
    platform: "neutral",
    logLevel: "silent",
  });

  const indexes = await import(pathToFileURL(indexesOut).href);
  const pathPatch = await import(pathToFileURL(pathPatchOut).href);
  const durable = await import(pathToFileURL(durableOut).href);
  return { indexes, pathPatch, durable, cleanup: () => rmSync(outDir, { recursive: true, force: true }) };
}

function ms(fn) {
  const t0 = performance.now();
  const result = fn();
  return { ms: performance.now() - t0, result };
}

async function main() {
  const { notes } = parseArgs();
  console.log(`Wave C stress · meta vault ${notes.toLocaleString()} notes`);
  const { indexes, pathPatch, durable, cleanup } = await loadModules();

  const tGen = ms(() => makeMetaVault(notes));
  const { nodes, rootIds } = tGen.result;
  console.log(`  generate: ${tGen.ms.toFixed(1)}ms`);

  const idx = new indexes.VaultStructuralIndex();
  const tRebuild = ms(() => idx.rebuild(nodes));
  console.log(`  structural rebuild: ${tRebuild.ms.toFixed(1)}ms`);

  // Path-patch 20 notes
  const idOf = (p) => {
    for (const n of Object.values(nodes)) {
      if (n.path === p) return n.id;
    }
    return "x_" + p;
  };
  // Build a fake scan
  const signatures = {};
  for (const n of Object.values(nodes)) {
    if (n.kind === "note") signatures[n.path] = `${n.mtime}:0`;
  }
  const prev = { nodes, rootIds, signatures };
  const ops = [];
  for (let i = 0; i < 20; i++) {
    const n = nodes[`note_${i}`];
    ops.push({
      path: n.path,
      op: "upsert",
      sig: `${Date.now()}:${i}`,
      mtime: Date.now(),
    });
  }
  const tPatch = ms(() => pathPatch.applyNoteOpsToScan(prev, ops, idOf));
  console.log(`  path-patch 20: ${tPatch.ms.toFixed(1)}ms`);

  // Durable memory reconcile
  const di = durable.openMemoryDurableIndex("stress");
  const tReconcile = ms(() => di.reconcileFromNodes(nodes));
  console.log(
    `  durable reconcile: ${tReconcile.ms.toFixed(1)}ms · upserted ${tReconcile.result.upserted}`,
  );

  // Soft gates (warn only on slow CI)
  const soft = {
    rebuildMs: notes >= 50000 ? 2000 : 500,
    patchMs: 100,
    reconcileMs: notes >= 50000 ? 8000 : 2000,
  };
  let ok = true;
  if (tRebuild.ms > soft.rebuildMs) {
    console.warn(`  WARN structural rebuild > ${soft.rebuildMs}ms`);
  }
  if (tPatch.ms > soft.patchMs) {
    console.warn(`  WARN path-patch > ${soft.patchMs}ms`);
  }
  if (tReconcile.ms > soft.reconcileMs) {
    console.warn(`  WARN reconcile > ${soft.reconcileMs}ms`);
  }

  // Basic correctness
  if (idx.noteCount !== notes) {
    console.error("FAIL noteCount mismatch", idx.noteCount, notes);
    ok = false;
  }
  if (tPatch.result.changedPaths.length < 1) {
    console.error("FAIL path-patch no changes");
    ok = false;
  }

  cleanup();
  if (!ok) process.exit(1);
  console.log("bench-vault-stress: OK");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
