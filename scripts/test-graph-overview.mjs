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
assert.match(overview, /Still missing: force sliders and color groups/);
assert.match(overview, /setActiveNote/);
const palette = readFileSync("src/components/search/CommandPalette.tsx", "utf8");
assert.match(palette, /label: "Graph overview"/);
assert.match(palette, /graphSurface: "overview"/);
const hotkey = readFileSync("src/lib/layout/graph-hotkey.ts", "utf8");
assert.match(hotkey, /return "local"/);

console.log("graph-overview: PASS");
