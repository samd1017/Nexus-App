/**
 * nexus-query: LIST/TABLE by folder path and tag. Not Dataview.
 */
import assert from "node:assert/strict";

if (!process.env.NEXUS_TSX) {
  const { spawnSync } = await import("node:child_process");
  const r = spawnSync("npx", ["--yes", "tsx", "scripts/test-nexus-query.mjs"], {
    cwd: process.cwd(),
    encoding: "utf8",
    timeout: 60_000,
    env: { ...process.env, NEXUS_TSX: "1" },
  });
  if (r.stdout) process.stdout.write(r.stdout);
  if (r.stderr) process.stderr.write(r.stderr);
  process.exit(r.status ?? 1);
}

const { runNexusQuery, parseNexusQuery, NEXUS_QUERY_CAP, NEXUS_QUERY_DQL } = await import(
  "../src/lib/vault/nexus-query.ts"
);
const { promoteNexusQueryBlocks } = await import("../src/lib/editor/special-blocks.ts");
const { marked } = await import("marked");
const { buildDemoVault } = await import("../src/lib/vault/demo-vault.ts");

function note(id, path, content) {
  const name = path.split("/").pop();
  return { id, path, name, kind: "note", parentId: null, mtime: 0, content };
}
function folder(id, path) {
  const name = path.split("/").pop();
  return { id, path, name, kind: "folder", parentId: null, mtime: 0 };
}

const nodes = {
  r: folder("r", "Research"),
  g: { ...note("g", "Research/Graph View.md", "# Graph\n\n#graph #links\n"), parentId: "r" },
  c: { ...note("c", "Research/Callouts.md", "# Callouts\n\n#writing\n"), parentId: "r" },
  j: folder("j", "Journal"),
  f: { ...note("f", "Journal/First Light.md", "# First\n"), parentId: "j" },
};

const table = runNexusQuery("TABLE path:Research tag:graph", nodes);
assert.equal(table.error, null);
assert.equal(table.mode, "table");
assert.equal(table.rows.length, 1);
assert.equal(table.rows[0].id, "g");
assert.equal(table.rows[0].path, "Research/Graph View.md");

const list = runNexusQuery("LIST path:Journal", nodes);
assert.equal(list.rows.length, 1);
assert.equal(list.rows[0].title, "First Light");
assert.equal(list.mode, "list");

const both = runNexusQuery("LIST folder:Research #writing", nodes);
assert.equal(both.rows.length, 1);
assert.equal(both.rows[0].id, "c");

const skipped = runNexusQuery("TABLE path:Research field:status", nodes);
assert.equal(skipped.error, null);
assert.match(skipped.fieldNote, /not indexed/);
assert.equal(skipped.rows[0].tags, null);
assert.ok(skipped.rows.length >= 2);

const tagsCol = runNexusQuery("TABLE path:Research tag:graph field:tags", nodes);
assert.equal(tagsCol.fieldNote, null);
assert.match(tagsCol.rows[0].tags, /graph/);

assert.equal(runNexusQuery("LIST path:Missing", nodes).error?.includes("No folder"), true);
assert.match(runNexusQuery("TABLE file.link FROM #tag", nodes).error, /not Dataview/);
assert.equal(parseNexusQuery("").kind, "help");
assert.match(runNexusQuery("LIST", nodes).error, /path:/);
assert.match(runNexusQuery("SORT path:Research", nodes).error, /not Dataview/);
assert.equal(NEXUS_QUERY_DQL.includes("No DQL"), true);

const many = { box: folder("box", "Box") };
for (let i = 0; i < NEXUS_QUERY_CAP + 5; i++) {
  const id = `n${i}`;
  many[id] = { ...note(id, `Box/N${String(i).padStart(3, "0")}.md`, "# n\n"), parentId: "box" };
}
const capped = runNexusQuery("LIST path:Box", many);
assert.equal(capped.rows.length, NEXUS_QUERY_CAP);
assert.equal(capped.truncated, true);
assert.equal(capped.error, null);

const demo = buildDemoVault();
const noteList = Object.values(demo.nodes).find((n) => n.path === "Projects/Note List.md");
assert.ok(noteList && noteList.kind === "note");
assert.match(noteList.content, /```nexus-query/);
assert.match(noteList.content, /Not Dataview/);
const demoTable = runNexusQuery("TABLE path:Research tag:graph", demo.nodes);
assert.equal(demoTable.rows.length, 1);
assert.equal(demoTable.rows[0].path, "Research/Graph View.md");
const demoList = runNexusQuery("LIST path:Journal", demo.nodes);
assert.ok(demoList.rows.some((r) => r.path === "Journal/First Light.md"));

const html = marked.parse("```nexus-query\nLIST path:Research\n```");
const promoted = promoteNexusQueryBlocks(html);
assert.match(promoted, /data-type="nexus-query"/);
assert.match(promoted, /LIST path:Research/);
assert.doesNotMatch(promoted, /<pre>/);

const { readFileSync } = await import("node:fs");
const view = readFileSync("src/components/editor/NexusQueryView.tsx", "utf8");
assert.match(view, /data-open-note/);
assert.match(view, /model\.footer/);
assert.match(view, /setActiveNote/);
const lib = readFileSync("src/lib/vault/nexus-query.ts", "utf8");
assert.match(lib, /Not Dataview/);
const preview = readFileSync("src/lib/editor/hydrate-preview.ts", "utf8");
assert.match(preview, /renderNexusQueries/);
assert.match(preview, /data-open-note/);

console.log("nexus-query: PASS");
