/**
 * Vault graph overview: folder and tag filters. Ctrl+G stays on Local.
 */
import assert from "node:assert/strict";

if (!process.env.NEXUS_TSX) {
  const { spawnSync } = await import("node:child_process");
  const r = spawnSync("npx", ["--yes", "tsx", "scripts/test-graph-overview.mjs"], {
    cwd: process.cwd(),
    encoding: "utf8",
    timeout: 30_000,
    env: { ...process.env, NEXUS_TSX: "1" },
  });
  if (r.stdout) process.stdout.write(r.stdout);
  if (r.stderr) process.stderr.write(r.stderr);
  process.exit(r.status ?? 1);
}

const { selectOverviewNotes, overviewEdges, OVERVIEW_CAP } = await import("../src/lib/graph/overview.ts");
const { layoutOverviewGrid } = await import("../src/lib/graph/local-layout.ts");
const { layoutOverviewForces, meanPairDistance, meanRadius } = await import("../src/lib/graph/overview-layout.ts");
const { overviewGroupKey, overviewGroupColor } = await import("../src/lib/graph/overview.ts");
const { surfaceForGraphHotkey } = await import("../src/lib/layout/graph-hotkey.ts");
const { graphSurfaceOf } = await import("../src/lib/prefs/preferences.ts");

function note(id, path, content) {
  return { id, path, name: path.split("/").pop(), kind: "note", parentId: null, mtime: 1, content };
}

const nodes = {
  a: note("a", "Projects/Alpha.md", "# Alpha\n\n#graph\n\nSee [[Beta]]\n"),
  b: note("b", "Projects/Beta.md", "# Beta\n\n#links\n"),
  c: note("c", "Journal/Day.md", "# Day\n\n#graph\n"),
  d: note("d", "Projects/Board.canvas", "{}\n"),
};

const all = selectOverviewNotes(nodes);
assert.equal(all.total, 3);
assert.ok(!all.notes.some((n) => n.path.endsWith(".canvas")));
const projects = selectOverviewNotes(nodes, { folder: "Projects" });
assert.deepEqual(projects.notes.map((n) => n.id), ["a", "b"]);
const tagged = selectOverviewNotes(nodes, { tag: "#graph" });
assert.deepEqual(tagged.notes.map((n) => n.id), ["c", "a"]);
const both = selectOverviewNotes(nodes, { folder: "Projects", tag: "graph" });
assert.deepEqual(both.notes.map((n) => n.id), ["a"]);
const edges = overviewEdges(nodes, all.notes);
assert.ok(edges.some((e) => e.source === "a" && e.target === "b"));

const many = {};
for (let i = 0; i < OVERVIEW_CAP + 5; i++) many[`n${i}`] = note(`n${i}`, `Box/N${i}.md`, "# n\n");
const capped = selectOverviewNotes(many);
assert.equal(capped.notes.length, OVERVIEW_CAP);
assert.equal(capped.truncated, true);
assert.equal(capped.total, OVERVIEW_CAP + 5);

const grid = layoutOverviewGrid([
  { id: "a", title: "A" },
  { id: "b", title: "B" },
  { id: "c", title: "C" },
  { id: "d", title: "D" },
]);
assert.equal(grid.length, 4);
assert.ok(grid.some((p) => p.x !== 0 || p.y !== 0));

const four = [
  { id: "a", title: "A" },
  { id: "b", title: "B" },
  { id: "c", title: "C" },
  { id: "d", title: "D" },
];
const link = [{ source: "a", target: "b" }];
const tight = layoutOverviewForces(four, link, { center: 20, link: 80, repulsion: 5 });
const wide = layoutOverviewForces(four, link, { center: 20, link: 80, repulsion: 90 });
assert.ok(meanPairDistance(wide) > meanPairDistance(tight));
const shortLink = layoutOverviewForces(four, link, { center: 10, link: 40, repulsion: 8 });
const longLink = layoutOverviewForces(four, link, { center: 10, link: 240, repulsion: 8 });
const edgeLen = (points) => {
  const a = points.find((p) => p.id === "a");
  const b = points.find((p) => p.id === "b");
  return Math.hypot(a.x - b.x, a.y - b.y);
};
assert.ok(edgeLen(longLink) > edgeLen(shortLink));
const loose = layoutOverviewForces(four, [], { center: 0, link: 120, repulsion: 30 });
const pulled = layoutOverviewForces(four, [], { center: 100, link: 120, repulsion: 30 });
assert.ok(meanRadius(pulled) < meanRadius(loose));
const forcePin = { center: 20, link: 80, repulsion: 40 };
const unpinned = layoutOverviewForces(four, link, forcePin);
const pin = new Map([["a", { x: 400, y: -200 }]]);
const pinned = layoutOverviewForces(four, link, forcePin, pin);
const pinnedAgain = layoutOverviewForces(four, link, forcePin, pin);
assert.deepEqual(pinnedAgain, pinned);
const pinnedA = pinned.find((p) => p.id === "a");
assert.equal(pinnedA.x, 400);
assert.equal(pinnedA.y, -200);
assert.deepEqual(layoutOverviewForces(four, link, forcePin, new Map()), unpinned);
const pinnedWide = layoutOverviewForces(four, link, { center: 20, link: 80, repulsion: 90 }, pin);
const neighbor = pinned.find((p) => p.id === "b");
const neighborWide = pinnedWide.find((p) => p.id === "b");
assert.ok(neighbor.x !== neighborWide.x || neighbor.y !== neighborWide.y);
assert.equal(pinnedWide.find((p) => p.id === "a").x, 400);
assert.equal(overviewGroupKey({ id: "a", title: "A", path: "Projects/A.md", folder: "Projects", tags: ["graph"] }, "folder"), "Projects");
assert.equal(overviewGroupKey({ id: "a", title: "A", path: "A.md", folder: "", tags: [] }, "tag"), "(no tag)");
assert.notEqual(overviewGroupColor("Projects", ["Journal", "Projects"]), overviewGroupColor("Journal", ["Journal", "Projects"]));

assert.equal(surfaceForGraphHotkey("overview"), "local");
assert.equal(graphSurfaceOf("overview"), "overview");
assert.equal(graphSurfaceOf("explore"), "explore");
assert.equal(graphSurfaceOf("nope"), "local");

const { readFileSync } = await import("node:fs");
const slot = readFileSync("src/components/graph/GraphSlot.tsx", "utf8");
assert.match(slot, /graph-overview-tab/);
assert.match(slot, /OverviewGraph/);
assert.match(slot, /Folder Map/);
const overview = readFileSync("src/components/graph/OverviewGraph.tsx", "utf8");
assert.match(overview, /graph-overview-folder/);
assert.match(overview, /graph-overview-tag/);
assert.match(overview, /graph-overview-count/);
assert.match(overview, /graph-overview-node/);
assert.match(overview, /graph-overview-center/);
assert.match(overview, /graph-overview-link/);
assert.match(overview, /graph-overview-repulsion/);
assert.match(overview, /graph-overview-color/);
assert.match(overview, /graph-overview-group/);
assert.match(overview, /Drag a note to pin it here/);
assert.match(overview, /Still missing: saved group queries/);
assert.doesNotMatch(overview, /drag-to-pin/);
assert.match(overview, /graph-overview-clear-pins/);
assert.match(overview, /data-pinned/);
assert.doesNotMatch(overview, /Still missing: force sliders and color groups/);
assert.match(overview, /setActiveNote/);
const palette = readFileSync("src/components/search/CommandPalette.tsx", "utf8");
assert.match(palette, /label: "Graph overview"/);
assert.match(palette, /graphSurface: "overview"/);
const hotkey = readFileSync("src/lib/layout/graph-hotkey.ts", "utf8");
assert.match(hotkey, /return "local"/);

console.log("graph-overview: PASS");
