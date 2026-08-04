/**
 * Wave C pure-module contract tests (no DOM).
 * Run: node src/lib/vault/__tests__/wave-c.contract.mjs
 */

import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "../../../..");

// Dynamic import of TS via vite-node not available — test pure logic inlined + esbuild?
// Use a minimal reimplementation check via running through node with pre-built checks.

// --- path-patch pure logic (duplicate minimal to avoid TS load) ---
// Instead: spawn esbuild transform

import { build } from "esbuild";
import { writeFileSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const outDir = join(tmpdir(), `nexus-wave-c-${Date.now()}`);
mkdirSync(outDir, { recursive: true });

async function bundle(entry, outfile) {
  await build({
    entryPoints: [entry],
    outfile,
    bundle: true,
    format: "esm",
    platform: "neutral",
    packages: "external",
    logLevel: "silent",
  });
}

async function main() {
  const conflictsOut = join(outDir, "conflicts.mjs");
  const pathPatchOut = join(outDir, "path-patch.mjs");
  const contractOut = join(outDir, "index-contract.mjs");
  const bodyOut = join(outDir, "body-cache.mjs");

  // conflicts.ts has no relative deps that need vault types from other files except types
  // types is TS - need to bundle with esbuild which strips types

  await bundle(path.join(root, "src/lib/vault/conflicts.ts"), conflictsOut);
  await bundle(path.join(root, "src/lib/vault/path-patch.ts"), pathPatchOut);
  await bundle(path.join(root, "src/lib/vault/index-contract.ts"), contractOut);

  // body-cache imports scale-flags — bundle both
  await build({
    entryPoints: [path.join(root, "src/lib/vault/body-cache.ts")],
    outfile: bodyOut,
    bundle: true,
    format: "esm",
    platform: "neutral",
    logLevel: "silent",
  });

  const conflicts = await import(pathToFileURL(conflictsOut).href);
  const pathPatch = await import(pathToFileURL(pathPatchOut).href);
  const contract = await import(pathToFileURL(contractOut).href);
  const bodyCache = await import(pathToFileURL(bodyOut).href);

  // --- conflicts ---
  assert.equal(
    conflicts.primaryPathFromSibling("Notes/A.conflict-2026-08-03T12-00-00.md"),
    "Notes/A.md",
  );
  assert.equal(conflicts.isConflictSiblingPath("Notes/A.md"), false);
  assert.equal(
    conflicts.isConflictSiblingPath("Notes/A.conflict-mine-2026-08-03T12-00-00.md"),
    true,
  );

  const nodes = {
    p1: {
      id: "p1",
      path: "Design.md",
      name: "Design.md",
      kind: "note",
      parentId: null,
      mtime: 1,
      content: "mine",
    },
    s1: {
      id: "s1",
      path: "Design.conflict-2026-08-03T10-00-00.md",
      name: "Design.conflict-2026-08-03T10-00-00.md",
      kind: "note",
      parentId: null,
      mtime: 2,
      content: "theirs",
    },
  };
  const pairs = conflicts.detectConflictPairs(nodes);
  assert.equal(pairs.length, 1);
  assert.equal(pairs[0].primaryPath, "Design.md");
  assert.equal(pairs[0].siblings.length, 1);
  assert.equal(pairs[0].primaryId, "p1");

  // --- path-patch ---
  const idOf = (p) => "id_" + p.replace(/[^a-zA-Z0-9]+/g, "_");
  const prev = {
    nodes: {
      [idOf("Folder")]: {
        id: idOf("Folder"),
        path: "Folder",
        name: "Folder",
        kind: "folder",
        parentId: null,
        mtime: 1,
      },
      [idOf("Folder/A.md")]: {
        id: idOf("Folder/A.md"),
        path: "Folder/A.md",
        name: "A.md",
        kind: "note",
        parentId: idOf("Folder"),
        mtime: 1,
        content: "a",
      },
      [idOf("Folder/B.md")]: {
        id: idOf("Folder/B.md"),
        path: "Folder/B.md",
        name: "B.md",
        kind: "note",
        parentId: idOf("Folder"),
        mtime: 1,
        content: "b",
      },
    },
    rootIds: [idOf("Folder")],
    signatures: {
      "Folder/A.md": "1:1",
      "Folder/B.md": "1:1",
    },
  };
  const aRef = prev.nodes[idOf("Folder/A.md")];
  const { scan, changedPaths } = pathPatch.applyNoteOpsToScan(
    prev,
    [
      {
        path: "Folder/B.md",
        op: "upsert",
        sig: "2:2",
        mtime: 2,
        content: "b2",
      },
    ],
    idOf,
  );
  assert.ok(changedPaths.includes("Folder/B.md"));
  // Unchanged note keeps same object reference
  assert.equal(scan.nodes[idOf("Folder/A.md")], aRef);
  assert.equal(scan.nodes[idOf("Folder/B.md")].content, "b2");

  // --- contract ---
  assert.equal(contract.DURABLE_INDEX_SCHEMA_VERSION, 3);
  contract.assertContractInvariants();
  assert.ok(contract.DURABLE_INDEX_SQL.includes("note_fts"));
  assert.equal(contract.DURABLE_INDEX_TABLES.length, 7);

  // --- body cache ---
  bodyCache.clearBodyTouches();
  for (let i = 0; i < 150; i++) bodyCache.touchBody(`n${i}`);
  const protectedIds = new Set(["n149", "n148"]);
  const victims = bodyCache.pickEvictions(protectedIds);
  assert.ok(victims.length >= 30);
  assert.ok(!victims.includes("n149"));
  const stats = bodyCache.getBodyCacheStats(protectedIds);
  assert.equal(stats.max, 120);
  assert.ok(stats.loaded <= 120 || stats.underPressure);

  console.log("wave-c.contract.mjs: OK");
  rmSync(outDir, { recursive: true, force: true });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
