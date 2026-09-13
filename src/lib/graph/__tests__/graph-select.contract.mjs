/**
 * Graph note-select at scale — folder maps must not rebuild on active change,
 * ego hops/nodes stay capped, camera fly-to is coalesced / skippable.
 *
 * Run: node src/lib/graph/__tests__/graph-select.contract.mjs
 *
 * Manual (100k desktop, not claimed SCALE READY):
 *   1. Open a large vault, open Graph panel (folder map).
 *   2. Click 10+ notes in the tree. Camera should not thrash; highlight only
 *      if the note is on this level. No multi-hundred-ms hitch.
 *   3. Click "Show links", then click several other notes. Neighborhood may
 *      update after a short coalesce; no double fly + physics explosion.
 *   4. Orbit/zoom, then click a note — fly-to must not steal the camera.
 */

import assert from "node:assert/strict";
import { build } from "esbuild";
import { mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "../../../..");
const outDir = join(tmpdir(), `nexus-graph-select-${Date.now()}`);
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
        setup(buildApi) {
          buildApi.onResolve(
            { filter: /^(marked|turndown|fuse\.js|3d-force-graph|three)$/ },
            (args) => ({ path: args.path, namespace: "stub" }),
          );
          buildApi.onLoad({ filter: /.*/, namespace: "stub" }, (args) => {
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
      }
      parentId = id;
    }
  }
  for (const note of spec.notes || []) {
    const pathStr = note.endsWith(".md") ? note : `${note}.md`;
    const parts = pathStr.split("/");
    const name = parts.pop();
    const parentPath = parts.join("/");
    let parentId = null;
    if (parentPath) {
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
        }
        p = id;
      }
      parentId = p;
    }
    const id = `n_${pathStr.replace(/[^\w]+/g, "_")}`;
    nodes[id] = {
      id,
      path: pathStr,
      name,
      kind: "note",
      parentId,
      mtime: mtime++,
      content: `# ${name}\n`,
    };
  }
  return nodes;
}

async function main() {
  const selectOut = join(outDir, "graph-select.mjs");
  const buildOut = join(outDir, "build-graph.mjs");
  const flagsOut = join(outDir, "scale-flags.mjs");
  const indexesOut = join(outDir, "indexes.mjs");

  await bundle(path.join(root, "src/lib/graph/graph-select.ts"), selectOut);
  await bundle(path.join(root, "src/lib/graph/build-graph.ts"), buildOut);
  await bundle(path.join(root, "src/lib/vault/scale-flags.ts"), flagsOut);
  await bundle(path.join(root, "src/lib/vault/indexes.ts"), indexesOut);

  const sel = await import(pathToFileURL(selectOut).href);
  const buildGraph = await import(pathToFileURL(buildOut).href);
  const flags = await import(pathToFileURL(flagsOut).href);
  const indexes = await import(pathToFileURL(indexesOut).href);

  flags.applyScaleSafeDefaults();

  // Tick: folder / vault map ignores active note
  {
    const base = {
      large: true,
      scope: "vault",
      structureGeneration: 3,
      contentGeneration: 9,
      linkGeneration: 4,
      browsePath: "",
      activeNoteId: "n_a",
      noteCount: 100_000,
    };
    const a = sel.composeGraphTick(base);
    const b = sel.composeGraphTick({ ...base, activeNoteId: "n_b" });
    assert.equal(a, b, "folder tick must ignore activeNoteId");
    const egoA = sel.composeGraphTick({ ...base, scope: "ego" });
    const egoB = sel.composeGraphTick({
      ...base,
      scope: "ego",
      activeNoteId: "n_b",
    });
    assert.notEqual(egoA, egoB, "ego tick includes the active note");
  }

  // Fly-to policy
  {
    const skip = sel.decideActiveNoteFly({
      viewMode: "folder",
      activeNoteId: "n1",
      nodeIsVisible: true,
      userInteracting: true,
      interactedRecently: false,
      reducedMotion: false,
      isFirstActive: false,
    });
    assert.equal(skip.fly, false);
    assert.equal(skip.reason, "user-interacting");

    const missing = sel.decideActiveNoteFly({
      viewMode: "folder",
      activeNoteId: "n1",
      nodeIsVisible: false,
      userInteracting: false,
      interactedRecently: false,
      reducedMotion: false,
      isFirstActive: false,
    });
    assert.equal(missing.fly, false);
    assert.equal(missing.reason, "not-visible");

    const first = sel.decideActiveNoteFly({
      viewMode: "folder",
      activeNoteId: "n1",
      nodeIsVisible: true,
      userInteracting: false,
      interactedRecently: false,
      reducedMotion: false,
      isFirstActive: true,
    });
    assert.equal(first.fly, false);

    const go = sel.decideActiveNoteFly({
      viewMode: "folder",
      activeNoteId: "n1",
      nodeIsVisible: true,
      userInteracting: false,
      interactedRecently: false,
      reducedMotion: false,
      isFirstActive: false,
    });
    assert.equal(go.fly, true);
    assert.ok(go.durationMs <= 320, "fly-to must be short / cancelable");
    assert.ok(go.durationMs < 750, "must not restart the old 750ms W5 tween");
  }

  // Topology: remapped objects with same ids must not replace graphData
  {
    const nodesA = [{ id: "a" }, { id: "b" }];
    const nodesB = [{ id: "b" }, { id: "a" }];
    const linksA = [{ source: "a", target: "b" }];
    const linksB = [{ source: { id: "b" }, target: { id: "a" } }];
    const ka = sel.graphTopologyKey(nodesA, linksA);
    const kb = sel.graphTopologyKey(nodesB, linksB);
    assert.equal(ka, kb);
    assert.equal(sel.shouldReplaceGraphData(ka, kb), false);
    assert.equal(sel.shouldReplaceGraphData(null, ka), true);
    const kc = sel.graphTopologyKey([{ id: "a" }, { id: "c" }], linksA);
    assert.equal(sel.shouldReplaceGraphData(ka, kc), true);
  }

  // Preserve xyz across ego swaps
  {
    const prev = [{ id: "hub", x: 1, y: 2, z: 3 }, { id: "old", x: 9, y: 9, z: 9 }];
    const next = [{ id: "hub" }, { id: "new" }];
    const merged = sel.mergePreservedPositions(prev, next);
    assert.equal(merged[0].x, 1);
    assert.equal(merged[0].y, 2);
    assert.equal(merged[1].x, undefined);
  }

  assert.equal(sel.clampEgoHops(9), sel.EGO_MAX_HOPS);
  assert.equal(sel.clampEgoHops(9), 2);
  assert.equal(sel.clampEgoNodeCap(50_000), sel.EGO_MAX_NODES);

  // Folder resolve @ 2k: 12 note selects share topology (no graphData tear-down)
  {
    const notes = [];
    for (let i = 0; i < 2000; i++) notes.push(`Alpha/n${String(i).padStart(4, "0")}.md`);
    notes.push("root.md");
    const nodes = makeVault({ folders: ["Alpha", "Beta"], notes });
    const idx = new indexes.VaultStructuralIndex();
    idx.sync(nodes);
    const noteIds = Object.values(nodes)
      .filter((n) => n.kind === "note")
      .slice(0, 12)
      .map((n) => n.id);

    const t0 = performance.now();
    let lastKey = null;
    let lastIds = null;
    for (const id of noteIds) {
      const r = buildGraph.resolveGraphData(nodes, {
        noteCount: 2001,
        activeNoteId: id,
        graphBrowsePath: "",
        graphScopeMode: "vault",
        structuralIndex: idx,
      });
      assert.equal(r.mode, "folder");
      assert.ok(r.nodes.length <= 320);
      const ids = r.nodes.map((n) => n.id).join(",");
      const key = sel.graphTopologyKey(r.nodes, r.edges);
      if (lastKey) {
        assert.equal(ids, lastIds, "folder select must not change drawn ids");
        assert.equal(
          sel.shouldReplaceGraphData(lastKey, key),
          false,
          "folder select must not replace graphData()",
        );
      }
      lastKey = key;
      lastIds = ids;
    }
    const elapsed = performance.now() - t0;
    assert.ok(
      elapsed < 250,
      `12 folder resolves @2k should be cheap, took ${elapsed.toFixed(1)}ms`,
    );
  }

  // Ego hops stay capped even if caller asks for 8; hub cannot explode
  {
    const hubLinks = [];
    const notes = ["Hub/hub.md"];
    for (let i = 0; i < 600; i++) {
      notes.push(`Hub/spoke${i}.md`);
      hubLinks.push(`[[spoke${i}]]`);
    }
    const nodes = makeVault({ folders: ["Hub"], notes });
    const hub = Object.values(nodes).find((n) => n.name === "hub.md");
    hub.content = `# Hub\n${hubLinks.join(" ")}\n`;
    for (let i = 0; i < 600; i++) {
      const spoke = Object.values(nodes).find((n) => n.name === `spoke${i}.md`);
      spoke.content = `# s\n[[hub]]\n`;
    }
    const wide = buildGraph.buildEgoGraph(nodes, hub.id, 8, 50_000);
    assert.ok(wide.nodes.length <= sel.EGO_MAX_NODES);
    assert.ok(wide.nodes.length >= 1);
    const capped = buildGraph.buildEgoGraph(nodes, hub.id, 2, 80);
    assert.ok(capped.nodes.length <= 80);
    const resolved = buildGraph.resolveGraphData(nodes, {
      noteCount: 601,
      activeNoteId: hub.id,
      graphBrowsePath: "",
      graphScopeMode: "ego",
    });
    assert.equal(resolved.mode, "ego");
    assert.ok(resolved.nodes.length <= sel.EGO_MAX_NODES);
  }

  // Framed camera skip
  {
    assert.equal(
      sel.isAlreadyFramed({ x: 0, y: 0, z: 110 }, { x: 0, y: 0, z: 0 }, 110),
      true,
    );
    assert.equal(
      sel.isAlreadyFramed({ x: 0, y: 0, z: 800 }, { x: 0, y: 0, z: 0 }, 110),
      false,
    );
  }

  console.log("graph-select.contract: ok");
  rmSync(outDir, { recursive: true, force: true });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
