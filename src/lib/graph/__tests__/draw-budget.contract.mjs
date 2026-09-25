/**
 * Graph draw budget, planet level of detail, and the planet look lock.
 *
 * - No graph path hands the renderer more than the draw budget at 500k notes:
 *   the folder root, a 3,500-note folder, the ego around a hub with thousands
 *   of backlinks, and native catalog pages that come back oversized.
 * - A planet never gets more sphere segments than it was built with, keeps
 *   exactly that tessellation when large on screen, and a reduced sphere's
 *   silhouette stays within LOD_SAG_PX of the true circle.
 * - Planets are built as before: same radius, same top tessellation, same
 *   shader sources.
 *
 * Run: node src/lib/graph/__tests__/draw-budget.contract.mjs
 */

import assert from "node:assert/strict";
import { build } from "esbuild";
import { createHash } from "node:crypto";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "../../../..");
const outDir = join(tmpdir(), `nexus-draw-budget-${Date.now()}`);
mkdirSync(outDir, { recursive: true });

/** sha256 prefix of the planet shaders as shipped before level of detail. */
const BODY_SHADER_HASH = "b9e60c0af4a45898";
const LIMB_SHADER_HASH = "c414276d9d95f01b";

async function bundle(entry, outfile) {
  await build({
    entryPoints: [entry],
    outfile,
    bundle: true,
    format: "esm",
    platform: "node",
    logLevel: "silent",
    nodePaths: [join(root, "node_modules")],
    plugins: [
      {
        name: "stub-heavy",
        setup(b) {
          b.onResolve({ filter: /^(marked|turndown|fuse\.js)$/ }, (args) => ({
            path: args.path,
            namespace: "stub",
          }));
          b.onLoad({ filter: /.*/, namespace: "stub" }, (args) => {
            if (args.path === "turndown") {
              return {
                contents: `export default class TurndownService { turndown(s){ return String(s||''); } addRule(){ return this; } keep(){ return this; } remove(){ return this; } }`,
                loader: "js",
              };
            }
            return {
              contents: `const marked = { parse: (s) => String(s||''), setOptions: () => {}, use: () => {} }; export default marked; export { marked };`,
              loader: "js",
            };
          });
        },
      },
    ],
  });
}

const ROOTS = ["00-Inbox", "10-Projects", "20-Areas", "30-Resources", "40-Archive", "50-Daily", "60-Systems"];
const BUCKETS = 20;

/** 500k notes in a PARA layout, metadata only (bodies stay on disk). */
function makeHugeVault(noteCount) {
  const nodes = {};
  const folderId = new Map();
  for (const r of ROOTS) {
    const id = `f_${r}`;
    nodes[id] = { id, path: r, name: r, kind: "folder", parentId: null, mtime: 1 };
    folderId.set(r, id);
    for (let b = 0; b < BUCKETS; b++) {
      const p = `${r}/${String(b).padStart(2, "0")}`;
      const cid = `f_${p.replace(/\//g, "_")}`;
      nodes[cid] = { id: cid, path: p, name: p.slice(-2), kind: "folder", parentId: id, mtime: 1 };
      folderId.set(p, cid);
    }
  }
  const title = (i) => (i % 200 === 0 ? `Hub ${i}` : `Topic ${i}`);
  for (let i = 0; i < noteCount; i++) {
    const parent = `${ROOTS[i % ROOTS.length]}/${String(Math.floor(i / ROOTS.length) % BUCKETS).padStart(2, "0")}`;
    const name = `${title(i)}.md`;
    const p = `${parent}/${name}`;
    const id = `n_${i}`;
    nodes[id] = { id, path: p, name, kind: "note", parentId: folderId.get(parent), mtime: 1_700_000_000_000 - i };
  }
  return { nodes, title };
}

function maxSag(radiusPx, segs) {
  return radiusPx * (1 - Math.cos(Math.PI / segs));
}

async function main() {
  const entry = join(outDir, "entry.ts");
  writeFileSync(
    entry,
    [
      `export * as budget from ${JSON.stringify(join(root, "src/lib/graph/draw-budget.ts"))};`,
      `export * as lod from ${JSON.stringify(join(root, "src/lib/graph/planet-lod.ts"))};`,
      `export * as instrument from ${JSON.stringify(join(root, "src/lib/graph/instrument-node.ts"))};`,
      `export * as buildGraph from ${JSON.stringify(join(root, "src/lib/graph/build-graph.ts"))};`,
      `export * as shellGraph from ${JSON.stringify(join(root, "src/lib/graph/shell-graph.ts"))};`,
      `export * as linkIndex from ${JSON.stringify(join(root, "src/lib/vault/link-index.ts"))};`,
      `export * as flags from ${JSON.stringify(join(root, "src/lib/vault/scale-flags.ts"))};`,
      `export * as THREE from "three";`,
    ].join("\n"),
  );
  const out = join(outDir, "bundle.mjs");
  await bundle(entry, out);
  const { budget, lod, instrument, buildGraph, shellGraph, linkIndex, flags, THREE } = await import(
    pathToFileURL(out).href
  );
  flags.applyScaleSafeDefaults();
  const B = { nodes: budget.GRAPH_NODE_BUDGET, links: budget.GRAPH_LINK_BUDGET };

  // Clamp: fits → same object; over → trimmed with priorities.
  {
    const small = { nodes: [{ id: "a" }, { id: "b" }], links: [{ source: "a", target: "b" }] };
    assert.equal(budget.clampToDrawBudget(small, null), small, "a list inside the budget is untouched");

    const nodes = [];
    for (let i = 0; i < 900; i++) nodes.push({ id: `n${i}`, degree: i % 7 });
    for (let i = 0; i < 300; i++) nodes.push({ id: `ghost:${i}`, ghost: true, degree: i });
    nodes.push({ id: "aggregate:x", kind: "aggregate" });
    const links = [];
    for (let i = 0; i < 5000; i++) links.push({ source: `n${i % 900}`, target: `n${(i * 7 + 1) % 900}` });
    links.push({ source: "n899", target: "n5" });
    const c = budget.clampToDrawBudget({ nodes, links }, "n899");
    assert.ok(c.nodes.length <= B.nodes, `nodes ${c.nodes.length} over budget`);
    assert.ok(c.links.length <= B.links, `links ${c.links.length} over budget`);
    const ids = new Set(c.nodes.map((n) => n.id));
    assert.ok(ids.has("n899"), "active note survives the clamp");
    assert.ok(ids.has("aggregate:x"), "+N more survives the clamp");
    assert.ok(!c.nodes.some((n) => n.ghost), "real notes fill the budget before ghosts");
    for (const l of c.links) assert.ok(ids.has(l.source) && ids.has(l.target), "no dangling link");
    assert.ok(
      c.links.slice(0, 3).some((l) => l.source === "n899" || l.target === "n899"),
      "links on the active note come first",
    );
  }

  // 500k: every builder stays inside its cap and the draw budget.
  {
    const N = 500_000;
    const { nodes, title } = makeHugeVault(N);
    const hubId = "n_0";
    // Notes 1..8000 link to Hub 0 and their neighbor: a hub with 8k backlinks.
    const groups = [];
    for (let i = 1; i <= 8000; i++) groups.push({ sourceId: `n_${i}`, targets: [title(0), title(i + 1)] });
    groups.push({ sourceId: hubId, targets: [title(1), title(2), title(3)] });
    linkIndex.seedLinkIndex(groups);

    const base = { noteCount: N, activeNoteId: null, graphBrowsePath: "", graphScopeMode: "vault" };
    const rootMap = buildGraph.resolveGraphData(nodes, base);
    assert.equal(rootMap.mode, "folder");
    assert.equal(rootMap.nodes.length, ROOTS.length, "root shows the top folders");

    const level = buildGraph.resolveGraphData(nodes, { ...base, graphBrowsePath: "00-Inbox/00" });
    assert.equal(level.mode, "folder");
    assert.ok(level.nodes.length <= 320, `folder level ${level.nodes.length} > 320`);
    assert.ok(level.nodes.some((n) => n.kind === "aggregate"), "capped level shows +N more");
    assert.ok(level.stats.childNoteCount > 3000, "level really holds thousands of notes");

    const ego = buildGraph.resolveGraphData(nodes, { ...base, activeNoteId: hubId, graphScopeMode: "ego" });
    assert.equal(ego.mode, "ego");
    assert.ok(ego.nodes.length <= 400, `ego ${ego.nodes.length} > 400`);
    assert.ok(ego.nodes.length >= 300, "ego around a hub fills its neighborhood");

    for (const [name, r] of [["root", rootMap], ["level", level], ["ego", ego]]) {
      const drawn = budget.clampToDrawBudget({ nodes: r.nodes, links: r.edges }, hubId);
      assert.ok(drawn.nodes.length <= B.nodes, `${name}: ${drawn.nodes.length} orbs over budget`);
      assert.ok(drawn.links.length <= B.links, `${name}: ${drawn.links.length} links over budget`);
      assert.ok(drawn.nodes.length < N / 100, `${name}: orb count tracks the view, not the vault`);
    }
  }

  // Native pages that come back oversized are still clamped.
  {
    const rows = [];
    for (let i = 0; i < 6000; i++) rows.push({ id: `r${i}`, path: `A/r${i}.md`, name: `r${i}.md`, kind: "note", mtime: i });
    const lvl = shellGraph.graphFromShellLevel(
      { parentPath: "A", rows, noteTotal: 500_000, folderTotal: 0, omitted: 494_000 },
      500_000,
    );
    const drawnLevel = budget.clampToDrawBudget({ nodes: lvl.nodes, links: lvl.edges }, null);
    assert.ok(drawnLevel.nodes.length <= B.nodes);
    assert.ok(drawnLevel.nodes.some((n) => n.kind === "aggregate"), "+N more survives an oversized page");

    const edges = [];
    for (let i = 0; i < 20_000; i++) edges.push({ source: `r${i % 6000}`, target: `r${(i * 13 + 1) % 6000}` });
    const egoPage = shellGraph.graphFromShellEgo({ centerId: "r0", rows, edges, capped: true }, 500_000);
    const drawnEgo = budget.clampToDrawBudget({ nodes: egoPage.nodes, links: egoPage.edges }, "r0");
    assert.ok(drawnEgo.nodes.length <= B.nodes && drawnEgo.links.length <= B.links);
    assert.ok(drawnEgo.nodes.some((n) => n.id === "r0"), "ego center survives an oversized page");
  }

  // Level of detail: never above the built tessellation, round at any size.
  {
    for (const top of [18, 32, 40]) {
      let prev = 0;
      for (let r = 0.05; r < 4000; r *= 1.07) {
        const s = lod.segmentsForRadius(r, top);
        assert.ok(s <= top, `radius ${r}: ${s} segments above top ${top}`);
        assert.ok(s >= prev, "segments never drop as a planet grows");
        if (s < top) assert.ok(maxSag(r, s) <= lod.LOD_SAG_PX + 1e-9, `radius ${r}px: silhouette off by ${maxSag(r, s)}px`);
        prev = s;
        const settled = lod.pickLevel(r, lod.pickLevel(r, top, top), top);
        assert.equal(lod.pickLevel(r, settled, top), settled, "a settled level does not flip");
        assert.ok(lod.pickLevel(r, 6, top) >= lod.segmentsForRadius(r, top), "a growing planet upgrades at once");
      }
      assert.equal(lod.segmentsForRadius(2000, top), top, "a planet filling the view keeps its full sphere");
      assert.equal(lod.segmentsForRadius(Infinity, top), top, "camera inside the sphere keeps its full sphere");
      assert.equal(lod.segmentsForRadius(Number.NaN, top), top, "unknown size keeps its full sphere");
      assert.equal(lod.heightForLevel(top, top, top - 4), top - 4, "top level keeps its height segments");
    }
  }

  // Look lock: same radius, top tessellation, and shaders as before.
  {
    const accent = new THREE.Color(0, 0.8, 1);
    const hash = (m) => createHash("sha256").update(`${m.vertexShader}\n--\n${m.fragmentShader}`).digest("hex").slice(0, 16);
    const cases = [
      { mode: "panel", boost: false, low: false, segs: 32, base: 2.15, k: 0.95, size: 1 },
      { mode: "fullscreen", boost: false, low: false, segs: 40, base: 2.7, k: 1.15, size: 1 },
      { mode: "fullscreen", boost: true, low: false, segs: 40, base: 2.7, k: 1.15, size: 1.08 },
      { mode: "panel", boost: true, low: true, segs: 18, base: 2.15, k: 0.95, size: 1.08 },
    ];
    for (const c of cases) {
      for (const node of [
        { id: "n1", name: "Alpha", kind: "note", folder: "A", degree: 1, val: 1 },
        { id: "f1", name: "Folder", kind: "folder", folder: "", degree: 9, val: 40, noteCount: 40 },
      ]) {
        const g = instrument.createInstrumentNode(node, null, null, null, null, 0, c.mode, accent, false, c.boost, c.low);
        const [body, atmo] = g.children;
        const rank = node.kind === "folder" || node.degree >= 3 ? 0.86 : 0.7;
        const radius = c.base * c.size + Math.pow(Math.max(1, node.val), 0.48) * c.k * rank;
        assert.ok(Math.abs(body.scale.x - radius) < 1e-9, `${c.mode} ${node.kind}: radius ${body.scale.x} != ${radius}`);
        assert.equal(body.geometry.parameters.radius, 1);
        assert.equal(body.geometry.parameters.widthSegments, c.segs);
        assert.equal(body.geometry.parameters.heightSegments, c.segs);
        assert.ok(Math.abs(atmo.scale.x - radius * 1.34) < 1e-9, "atmosphere sits at 1.34× the body");
        assert.equal(atmo.geometry.parameters.widthSegments, Math.max(20, c.segs - 2));
        assert.equal(atmo.geometry.parameters.heightSegments, Math.max(16, c.segs - 4));
        assert.equal(hash(body.material), BODY_SHADER_HASH, "body shader changed");
        assert.equal(hash(atmo.material), LIMB_SHADER_HASH, "atmosphere shader changed");
        assert.ok(body.userData.nexusCore, "hover tint still finds the body");
      }
    }
  }

  console.log("draw-budget.contract: ok");
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => {
    try {
      rmSync(outDir, { recursive: true, force: true });
    } catch {
      /* ok */
    }
  });
