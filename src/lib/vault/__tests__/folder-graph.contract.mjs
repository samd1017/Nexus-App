/**
 * Hierarchical folder graph contract tests (Wave 1–4 pure API).
 * Run: node src/lib/vault/__tests__/folder-graph.contract.mjs
 */

import assert from "node:assert/strict";
import { build } from "esbuild";
import { mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "../../../..");
const outDir = join(tmpdir(), `nexus-folder-graph-${Date.now()}`);
mkdirSync(outDir, { recursive: true });

async function bundle(entry, outfile) {
  await build({
    entryPoints: [entry],
    outfile,
    bundle: true,
    format: "esm",
    platform: "node",
    logLevel: "silent",
    external: [],
    plugins: [
      {
        name: "stub-heavy",
        setup(build) {
          build.onResolve({ filter: /^(marked|turndown|fuse\.js|3d-force-graph|three)$/ }, (args) => ({
            path: args.path,
            namespace: "stub",
          }));
          build.onLoad({ filter: /.*/, namespace: "stub" }, (args) => {
            if (args.path === "turndown") {
              return {
                contents: `
                  export default class TurndownService {
                    constructor() {}
                    turndown(s){ return String(s||''); }
                    addRule(){ return this; }
                    keep(){ return this; }
                    remove(){ return this; }
                  }
                `,
                loader: "js",
              };
            }
            return {
              contents: `
                const marked = { parse: (s) => String(s||''), setOptions: () => {}, use: () => {} };
                export default marked;
                export { marked };
              `,
              loader: "js",
            };
          });
        },
      },
    ],
  });
}

function makeVault(spec) {
  /** @type {Record<string, any>} */
  const nodes = {};
  const rootIds = [];
  let mtime = 1_700_000_000_000;
  for (const folder of spec.folders || []) {
    const parts = folder.split("/").filter(Boolean);
    let acc = "";
    let parentId = null;
    for (const part of parts) {
      acc = acc ? `${acc}/${part}` : part;
      const id = `f_${acc.replace(/\//g, "_")}`;
      if (!nodes[id]) {
        nodes[id] = {
          id,
          path: acc,
          name: part,
          kind: "folder",
          parentId,
          mtime: mtime++,
        };
        if (!parentId) rootIds.push(id);
      }
      parentId = id;
    }
  }
  for (const note of spec.notes || []) {
    const path = note.endsWith(".md") ? note : `${note}.md`;
    const parts = path.split("/");
    const name = parts.pop();
    const parentPath = parts.join("/");
    let parentId = null;
    if (parentPath) {
      parentId = `f_${parentPath.replace(/\//g, "_")}`;
      if (!nodes[parentId]) {
        // ensure parents
        const segs = parentPath.split("/");
        let acc = "";
        let p = null;
        for (const part of segs) {
          acc = acc ? `${acc}/${part}` : part;
          const id = `f_${acc.replace(/\//g, "_")}`;
          if (!nodes[id]) {
            nodes[id] = {
              id,
              path: acc,
              name: part,
              kind: "folder",
              parentId: p,
              mtime: mtime++,
            };
            if (!p) rootIds.push(id);
          }
          p = id;
        }
        parentId = p;
      }
    }
    const id = `n_${path.replace(/[^\w]+/g, "_")}`;
    nodes[id] = {
      id,
      path,
      name,
      kind: "note",
      parentId,
      mtime: mtime++,
      content: `# ${name}\n`,
    };
    if (!parentId) rootIds.push(id);
  }
  return { nodes, rootIds };
}

async function main() {
  const folderOut = join(outDir, "folder-graph.mjs");
  const indexesOut = join(outDir, "indexes.mjs");
  const buildOut = join(outDir, "build-graph.mjs");
  const flagsOut = join(outDir, "scale-flags.mjs");

  await bundle(path.join(root, "src/lib/graph/folder-graph.ts"), folderOut);
  await bundle(path.join(root, "src/lib/vault/indexes.ts"), indexesOut);
  await bundle(path.join(root, "src/lib/graph/build-graph.ts"), buildOut);
  await bundle(path.join(root, "src/lib/vault/scale-flags.ts"), flagsOut);

  const folderGraph = await import(pathToFileURL(folderOut).href);
  const indexes = await import(pathToFileURL(indexesOut).href);
  const buildGraph = await import(pathToFileURL(buildOut).href);
  const flags = await import(pathToFileURL(flagsOut).href);

  // U1 empty
  {
    const { nodes } = makeVault({ folders: [], notes: [] });
    const idx = new indexes.VaultStructuralIndex();
    idx.sync(nodes);
    const g = folderGraph.buildFolderGraph(nodes, idx, { levelFolderId: null });
    assert.equal(g.mode, "folder");
    assert.equal(g.nodes.length, 0);
    assert.equal(g.edges.length, 0);
  }

  // U2 root mixed
  {
    const { nodes } = makeVault({
      folders: ["Projects", "Journal"],
      notes: ["Welcome.md", "Projects/A.md", "Projects/B.md"],
    });
    const idx = new indexes.VaultStructuralIndex();
    idx.sync(nodes);
    const g = folderGraph.buildFolderGraph(nodes, idx, { levelFolderId: null });
    assert.ok(g.nodes.some((n) => n.kind === "folder" && n.title === "Projects"));
    assert.ok(g.nodes.some((n) => n.kind === "folder" && n.title === "Journal"));
    assert.ok(g.nodes.some((n) => n.kind === "note" && n.title === "Welcome"));
    assert.equal(g.edges.length, 0);
    assert.ok(!g.nodes.some((n) => n.ghost));
  }

  // U3 enter folder
  {
    const { nodes } = makeVault({
      folders: ["Projects"],
      notes: ["Projects/A.md", "Projects/B.md"],
    });
    const idx = new indexes.VaultStructuralIndex();
    idx.sync(nodes);
    const projectsId = idx.getIdByPath(nodes, "Projects");
    const g = folderGraph.buildFolderGraph(nodes, idx, {
      levelFolderId: projectsId,
    });
    assert.equal(g.stats.levelPath, "Projects");
    assert.equal(g.stats.childNoteCount, 2);
    assert.equal(g.nodes.filter((n) => n.kind === "note").length, 2);
  }

  // U4 empty folder
  {
    const { nodes } = makeVault({ folders: ["Empty"], notes: [] });
    const idx = new indexes.VaultStructuralIndex();
    idx.sync(nodes);
    const id = idx.getIdByPath(nodes, "Empty");
    const g = folderGraph.buildFolderGraph(nodes, idx, { levelFolderId: id });
    assert.equal(g.nodes.length, 0);
    assert.equal(g.stats.childNoteCount, 0);
  }

  // U5 nested
  {
    const { nodes } = makeVault({
      folders: ["A/B"],
      notes: ["A/B/deep.md"],
    });
    const idx = new indexes.VaultStructuralIndex();
    idx.sync(nodes);
    const aId = idx.getIdByPath(nodes, "A");
    const g = folderGraph.buildFolderGraph(nodes, idx, { levelFolderId: aId });
    assert.ok(g.nodes.some((n) => n.kind === "folder" && n.title === "B"));
    assert.equal(g.nodes.filter((n) => n.kind === "note").length, 0);
  }

  // U6 cap + aggregate
  {
    const notes = [];
    for (let i = 0; i < 50; i++) notes.push(`n${i}.md`);
    const { nodes } = makeVault({ folders: [], notes });
    const idx = new indexes.VaultStructuralIndex();
    idx.sync(nodes);
    const g = folderGraph.buildFolderGraph(nodes, idx, {
      levelFolderId: null,
      maxNodes: 10,
    });
    assert.ok(g.stats.capped);
    assert.ok(g.nodes.some((n) => n.kind === "aggregate"));
    assert.ok(g.nodes.length <= 10);
  }

  // U7 50k flat → ≤320
  {
    const notes = [];
    for (let i = 0; i < 50000; i++) notes.push(`flat/n${i}.md`);
    // root folders: one mega folder
    const { nodes } = makeVault({ folders: ["flat"], notes });
    const idx = new indexes.VaultStructuralIndex();
    idx.sync(nodes);
    const flatId = idx.getIdByPath(nodes, "flat");
    const t0 = performance.now();
    const g = folderGraph.buildFolderGraph(nodes, idx, {
      levelFolderId: flatId,
      maxNodes: 320,
    });
    const ms = performance.now() - t0;
    assert.ok(g.nodes.length <= 320, `got ${g.nodes.length}`);
    assert.ok(g.stats.capped);
    assert.ok(ms < 5000, `too slow ${ms}ms`);
    console.log(`  U7 50k flat: ${g.nodes.length} nodes in ${ms.toFixed(1)}ms`);
  }

  // U8 multi-folder overview
  {
    const folders = [];
    for (let i = 0; i < 40; i++) folders.push(`F${i}`);
    const { nodes } = makeVault({ folders, notes: ["root.md"] });
    const idx = new indexes.VaultStructuralIndex();
    idx.sync(nodes);
    const g = folderGraph.buildFolderGraph(nodes, idx, {
      levelFolderId: null,
      maxNodes: 320,
    });
    assert.equal(g.stats.childFolderCount, 40);
    assert.ok(g.nodes.filter((n) => n.kind === "folder").length === 40);
  }

  // U9 determinism
  {
    const { nodes } = makeVault({
      folders: ["Z", "A"],
      notes: ["Z/1.md", "A/2.md"],
    });
    const idx = new indexes.VaultStructuralIndex();
    idx.sync(nodes);
    const a = folderGraph.buildFolderGraph(nodes, idx, { levelFolderId: null });
    const b = folderGraph.buildFolderGraph(nodes, idx, { levelFolderId: null });
    assert.deepEqual(
      a.nodes.map((n) => n.id),
      b.nodes.map((n) => n.id),
    );
  }

  // U10 no folder edges, U11 no ghosts
  {
    const { nodes } = makeVault({
      folders: ["P"],
      notes: ["P/a.md"],
    });
    const idx = new indexes.VaultStructuralIndex();
    idx.sync(nodes);
    const g = folderGraph.buildFolderGraph(nodes, idx, { levelFolderId: null });
    assert.equal(g.edges.length, 0);
    assert.ok(!g.nodes.some((n) => n.ghost));
  }

  // U12 val clamp
  {
    const notes = [];
    for (let i = 0; i < 200; i++) notes.push(`Big/n${i}.md`);
    const { nodes } = makeVault({ folders: ["Big"], notes });
    const idx = new indexes.VaultStructuralIndex();
    idx.sync(nodes);
    const g = folderGraph.buildFolderGraph(nodes, idx, { levelFolderId: null });
    const big = g.nodes.find((n) => n.title === "Big");
    assert.ok(big);
    assert.ok((big.val ?? 0) <= 80);
  }

  // R1–R3 resolveGraphData mode matrix (defaults: min 400)
  {
    flags.applyScaleSafeDefaults();
    const small = makeVault({
      folders: ["P"],
      notes: Array.from({ length: 10 }, (_, i) => `P/n${i}.md`),
    });
    const rSmall = buildGraph.resolveGraphData(small.nodes, {
      noteCount: 10,
      activeNoteId: null,
      graphBrowsePath: "",
      graphScopeMode: "vault",
    });
    assert.equal(rSmall.mode, "full");

    // Large vault: 420 notes so defaults trip folder/ego thresholds
    const largeNotes = Array.from({ length: 420 }, (_, i) => `Alpha/n${i}.md`);
    const large = makeVault({
      folders: ["Alpha", "Beta"],
      notes: largeNotes,
    });
    const noteId = Object.values(large.nodes).find((n) => n.kind === "note").id;
    const rFolder = buildGraph.resolveGraphData(large.nodes, {
      noteCount: 420,
      activeNoteId: noteId,
      graphBrowsePath: "",
      graphScopeMode: "vault",
    });
    assert.equal(rFolder.mode, "folder");
    assert.ok(rFolder.nodes.length <= 320);

    const rEgo = buildGraph.resolveGraphData(large.nodes, {
      noteCount: 420,
      activeNoteId: noteId,
      graphBrowsePath: "",
      graphScopeMode: "ego",
    });
    assert.equal(rEgo.mode, "ego");

    const rForced = buildGraph.resolveGraphData(large.nodes, {
      noteCount: 420,
      activeNoteId: noteId,
      graphBrowsePath: "",
      graphScopeMode: "vault",
      forceFull: true,
    });
    assert.equal(rForced.mode, "full");

    // Kill switch helper (flags bundle is separate from buildGraph; assert API here)
    flags.applyScaleSafeDefaults();
    assert.equal(flags.shouldUseFolderGraph(420), true);
    flags.setScaleFlags({ folderGraph: false });
    assert.equal(flags.shouldUseFolderGraph(420), false);
    flags.applyScaleSafeDefaults();
    assert.equal(flags.shouldUseFolderGraph(10), false);
  }

  // U13 content-edit fingerprint stable (structureGeneration unchanged on content-only)
  {
    const { nodes } = makeVault({
      folders: ["P"],
      notes: ["P/a.md", "P/b.md"],
    });
    const idx = new indexes.VaultStructuralIndex();
    idx.sync(nodes);
    const gen0 = idx.structureGeneration;
    const g0 = folderGraph.buildFolderGraph(nodes, idx, { levelFolderId: null });
    // content-only edit on a note (new map entry so index sees the patch)
    const note = Object.values(nodes).find((n) => n.kind === "note");
    const next = {
      ...nodes,
      [note.id]: {
        ...note,
        content: (note.content || "") + "\nmore text from typing",
        mtime: (note.mtime || 0) + 1,
      },
    };
    idx.sync(next);
    const gen1 = idx.structureGeneration;
    const g1 = folderGraph.buildFolderGraph(next, idx, { levelFolderId: null });
    assert.equal(gen0, gen1, "structureGeneration must not bump on content-only edit");
    assert.deepEqual(
      g0.nodes.map((n) => n.id),
      g1.nodes.map((n) => n.id),
    );
  }

  // U14 structure change (add folder) changes level children
  {
    const { nodes } = makeVault({
      folders: ["P"],
      notes: ["P/a.md"],
    });
    const idx = new indexes.VaultStructuralIndex();
    idx.sync(nodes);
    const before = folderGraph.buildFolderGraph(nodes, idx, { levelFolderId: null });
    const newId = "f_Q";
    const next = {
      ...nodes,
      [newId]: {
        id: newId,
        path: "Q",
        name: "Q",
        kind: "folder",
        parentId: null,
        mtime: Date.now(),
      },
    };
    idx.sync(next);
    const after = folderGraph.buildFolderGraph(next, idx, { levelFolderId: null });
    assert.ok(after.stats.childFolderCount > before.stats.childFolderCount);
    assert.ok(after.nodes.some((n) => n.id === newId || n.title === "Q"));
  }

  // U15 path normalize (slashes / trailing)
  {
    const { nodes } = makeVault({
      folders: ["Projects/Specs"],
      notes: ["Projects/Specs/a.md"],
    });
    const idx = new indexes.VaultStructuralIndex();
    idx.sync(nodes);
    const idA = folderGraph.folderIdFromBrowsePath(nodes, idx, "Projects/Specs");
    const idB = folderGraph.folderIdFromBrowsePath(nodes, idx, "/Projects/Specs/");
    const idC = folderGraph.folderIdFromBrowsePath(nodes, idx, "Projects\\Specs");
    assert.ok(idA);
    assert.equal(idA, idB);
    assert.equal(idA, idC);
    const root = folderGraph.folderIdFromBrowsePath(nodes, idx, "");
    assert.equal(root, null);
  }

  // U16 O(k) children only — level shows only direct children, not descendants
  {
    const { nodes } = makeVault({
      folders: ["Top", "Top/Nested"],
      notes: ["Top/n1.md", "Top/Nested/deep.md", "root.md"],
    });
    const idx = new indexes.VaultStructuralIndex();
    idx.sync(nodes);
    const g = folderGraph.buildFolderGraph(nodes, idx, { levelFolderId: null });
    const titles = g.nodes.map((n) => n.title);
    assert.ok(titles.includes("Top"));
    assert.ok(titles.includes("root") || titles.some((t) => t === "root" || t.includes("root")));
    // Nested is not a root child as folder at root — only Top is
    assert.ok(!titles.includes("Nested") || g.nodes.every((n) => n.path !== "Top/Nested" || n.kind !== "folder"));
    const topId = Object.values(nodes).find((n) => n.path === "Top")?.id;
    const nested = folderGraph.buildFolderGraph(nodes, idx, { levelFolderId: topId });
    assert.ok(nested.nodes.some((n) => n.path === "Top/Nested" || n.title === "Nested"));
    assert.ok(nested.nodes.some((n) => n.kind === "note"));
    // deep note is under Nested, not direct child of Top
    assert.ok(!nested.nodes.some((n) => n.path === "Top/Nested/deep.md"));
  }

  console.log("folder-graph.contract: all passed");
  rmSync(outDir, { recursive: true, force: true });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
