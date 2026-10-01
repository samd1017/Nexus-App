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
  g: { ...note("g", "Research/Graph View.md", "# Graph\n\n#graph #links\n"), parentId: "r", mtime: 100 },
  c: { ...note("c", "Research/Callouts.md", "# Callouts\n\n#writing\n"), parentId: "r", mtime: 300 },
  j: folder("j", "Journal"),
  f: { ...note("f", "Journal/First Light.md", "# First\n"), parentId: "j", mtime: Date.UTC(2026, 9, 1, 12, 0) },
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
assert.match(skipped.fieldNote, /No loaded note has “status”/);
assert.equal(skipped.rows[0].tags, null);
assert.equal(skipped.rows[0].fields[0].name, "status");
assert.equal(skipped.rows[0].fields[0].value, "—");
assert.ok(skipped.rows.length >= 2);

const tagsCol = runNexusQuery("TABLE path:Research tag:graph field:tags", nodes);
assert.equal(tagsCol.fieldNote, null);
assert.match(tagsCol.rows[0].tags, /graph/);

const fromPath = runNexusQuery("LIST FROM path:Journal", nodes);
assert.equal(fromPath.error, null);
assert.equal(fromPath.rows[0].id, "f");
const fromQuoted = runNexusQuery('LIST FROM "Journal"', nodes);
assert.equal(fromQuoted.rows[0].id, "f");
const { openMemoryDurableIndex, closeDurableIndex } = await import(
  "../src/lib/vault/durable-index.ts"
);
const { invalidateVaultTagsCache } = await import("../src/lib/vault/tags.ts");
closeDurableIndex();
const tagIndex = openMemoryDurableIndex("nexus-query-tags");
tagIndex.upsertNote({
  id: "w",
  path: "Indexed/Callouts.md",
  name: "Callouts.md",
  kind: "note",
  parentId: null,
  mtime: 10,
  tags: ["writing"],
});
tagIndex.upsertNote({
  id: "g2",
  path: "Indexed/Graph View.md",
  name: "Graph View.md",
  kind: "note",
  parentId: null,
  mtime: 20,
  tags: ["graph", "links"],
});
tagIndex.upsertNote({
  id: "plain",
  path: "Indexed/Plain.md",
  name: "Plain.md",
  kind: "note",
  parentId: null,
  mtime: 30,
  tags: [],
});
const indexedNodes = {
  w: { id: "w", path: "Indexed/Callouts.md", name: "Callouts.md", kind: "note", parentId: null, mtime: 10, content: "# Callouts\n\nNo hash tags in this body.\n" },
  g2: { id: "g2", path: "Indexed/Graph View.md", name: "Graph View.md", kind: "note", parentId: null, mtime: 20, content: "# Graph View\n\nNo hash tags in this body.\n" },
  plain: { id: "plain", path: "Indexed/Plain.md", name: "Plain.md", kind: "note", parentId: null, mtime: 30, content: "# Plain\n" },
};
invalidateVaultTagsCache();
const indexedOr = runNexusQuery("LIST FROM #writing OR #graph", indexedNodes);
assert.equal(indexedOr.error, null);
assert.deepEqual(indexedOr.rows.map((r) => r.id).sort(), ["g2", "w"]);
const indexedAnd = runNexusQuery("LIST FROM #graph AND #links", indexedNodes);
assert.equal(indexedAnd.error, null);
assert.deepEqual(indexedAnd.rows.map((r) => r.id), ["g2"]);
const indexedOne = runNexusQuery("LIST FROM #graph", indexedNodes);
assert.deepEqual(indexedOne.rows.map((r) => r.id), ["g2"]);
const indexedMiss = runNexusQuery("LIST FROM #writing AND #graph", indexedNodes);
assert.equal(indexedMiss.rows.length, 0);
assert.equal(indexedMiss.error, null);
closeDurableIndex();
invalidateVaultTagsCache();

const stripped = {
  w: { id: "w", path: "Research/Writing Probe.md", name: "Writing Probe.md", kind: "note", parentId: "r", mtime: 10 },
  g2s: { id: "g2s", path: "Research/Graph Overview.md", name: "Graph Overview.md", kind: "note", parentId: "r", mtime: 20 },
  n: { id: "n", path: "Research/No Graph Tag.md", name: "No Graph Tag.md", kind: "note", parentId: "r", mtime: 30 },
};
const tagMapOr = runNexusQuery("LIST FROM #writing OR #graph", stripped, [
  [stripped.w],
  [stripped.g2s],
]);
assert.equal(tagMapOr.error, null);
assert.equal(tagMapOr.tagsIncomplete, false);
assert.deepEqual(tagMapOr.rows.map((r) => r.id).sort(), ["g2s", "w"]);
assert.ok(!tagMapOr.rows.some((r) => r.id === "n"));
const tagMapAnd = runNexusQuery("LIST FROM #graph AND #links", stripped, [
  [stripped.g2s],
  [stripped.g2s],
]);
assert.deepEqual(tagMapAnd.rows.map((r) => r.id), ["g2s"]);
const tagMapOne = runNexusQuery("LIST FROM #graph", stripped, [[stripped.g2s]]);
assert.deepEqual(tagMapOne.rows.map((r) => r.id), ["g2s"]);
const tagMapPartial = runNexusQuery("LIST FROM #writing OR #graph", stripped, [
  [stripped.w],
  null,
]);
assert.deepEqual(tagMapPartial.rows.map((r) => r.id), ["w"]);
assert.equal(tagMapPartial.tagsIncomplete, true);
const tagMapAndBusy = runNexusQuery("LIST FROM #graph AND #links", stripped, [
  [stripped.g2s],
  null,
]);
assert.equal(tagMapAndBusy.tagsIncomplete, true);
assert.match(tagMapAndBusy.scanNote, /tag/);
assert.equal(tagMapAndBusy.rows.length, 0);

const either = runNexusQuery("LIST FROM #writing OR #graph", nodes);
assert.deepEqual(either.rows.map((r) => r.id).sort(), ["c", "g"]);
const bothTags = runNexusQuery("LIST FROM #graph AND #links", nodes);
assert.deepEqual(bothTags.rows.map((r) => r.id), ["g"]);
const byTime = runNexusQuery("TABLE FROM path:Research SORT mtime desc", nodes);
assert.deepEqual(byTime.rows.map((r) => r.id), ["c", "g"]);
const byTitle = runNexusQuery("LIST FROM path:Research SORT title desc", nodes);
assert.equal(byTitle.rows[0].id, "g");
const modified = runNexusQuery("TABLE FROM path:Journal field:mtime", nodes);
assert.equal(modified.fieldNote, null);
assert.match(modified.rows[0].mtime, /2026-10-01 12:00/);
const ctime = runNexusQuery("TABLE FROM path:Journal field:ctime", nodes);
assert.match(ctime.fieldNote, /No loaded note has “ctime”/);
assert.equal(ctime.rows[0].mtime, null);
assert.equal(ctime.rows[0].fields[0].value, "—");

assert.equal(runNexusQuery("LIST path:Missing", nodes).error?.includes("No folder"), true);
assert.match(runNexusQuery("TABLE file.link FROM #tag", nodes).error, /not Dataview/);
assert.match(runNexusQuery("LIST FROM #a WHERE date(today)", nodes).error, /not Dataview/);
assert.equal(parseNexusQuery("").kind, "help");
assert.match(runNexusQuery("LIST", nodes).error, /path:/);
assert.match(runNexusQuery("SORT path:Research", nodes).error, /Not Dataview/);
assert.equal(NEXUS_QUERY_DQL.includes("No joins"), true);
assert.equal(NEXUS_QUERY_DQL.includes("WHERE field"), true);

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
const demoOr = runNexusQuery("LIST FROM #writing OR #graph", demo.nodes);
assert.ok(demoOr.rows.some((r) => r.path === "Research/Graph View.md"));
assert.ok(demoOr.rows.some((r) => r.path === "Research/Callouts.md"));
const demoList = runNexusQuery("LIST FROM path:Journal", demo.nodes);
assert.ok(demoList.rows.some((r) => r.path === "Journal/First Light.md"));
assert.match(noteList.content, /SORT mtime/);
assert.match(noteList.content, /WHERE status = "draft"/);
assert.match(noteList.content, /no joins, no date\(\), no formulas/);
assert.doesNotMatch(noteList.content, /are the whole language/);

const html = marked.parse("```nexus-query\nLIST path:Research\n```");
const promoted = promoteNexusQueryBlocks(html);
assert.match(promoted, /data-type="nexus-query"/);
assert.match(promoted, /LIST path:Research/);
assert.doesNotMatch(promoted, /<pre>/);

const { readFileSync } = await import("node:fs");
const tagLoad = readFileSync("src/lib/vault/nexus-query-tags.ts", "utf8");
assert.match(tagLoad, /getDbPath/);
assert.match(tagLoad, /fetchShellTagNotes/);
assert.doesNotMatch(tagLoad, /pages\.some\(\(page\) => page == null\)/);
const view = readFileSync("src/components/editor/NexusQueryView.tsx", "utf8");
assert.match(view, /loadTagExtras/);
assert.match(view, /data-open-note/);
assert.match(view, /model\.footer/);
assert.match(view, /setActiveNote/);
const lib = readFileSync("src/lib/vault/nexus-query.ts", "utf8");
assert.match(lib, /Not Dataview/);
assert.match(lib, /no joins, no date\(\), no formulas/);
assert.doesNotMatch(lib, /no full DQL/);
assert.match(view, /queryColumnLabel/);
assert.match(view, /data-testid="nexus-query-field"/);
const preview = readFileSync("src/lib/editor/hydrate-preview.ts", "utf8");
assert.match(preview, /renderNexusQueries/);
assert.match(preview, /data-open-note/);
assert.match(preview, /queryColumnLabel/);

const shop = {
  r: folder("r", "Research"),
  draft: {
    ...note("draft", "Research/Callouts.md", "---\nstatus: draft\ndue: 2026-10-02\n---\n\n# Callouts\n"),
    parentId: "r",
    mtime: 50,
  },
  live: {
    ...note("live", "Research/Graph View.md", "---\nstatus: live\ndue: 2026-09-01\n---\n\n# Graph\n"),
    parentId: "r",
    mtime: 80,
  },
  plain: { ...note("plain", "Research/Plain.md", "# Plain\n"), parentId: "r", mtime: 10 },
};
const where = runNexusQuery('TABLE status, due FROM "Research" WHERE status = "draft"', shop);
assert.equal(where.error, null);
assert.deepEqual(where.rows.map((r) => r.id), ["draft"]);
assert.deepEqual(where.rows[0].fields.map((f) => f.value), ["draft", "2026-10-02"]);
assert.equal(where.fieldNote, null);
const notDraft = runNexusQuery('LIST FROM path:Research WHERE status != "draft"', shop);
assert.deepEqual(notDraft.rows.map((r) => r.id).sort(), ["live", "plain"]);
const glued = runNexusQuery('LIST FROM path:Research WHERE status="live"', shop);
assert.deepEqual(glued.rows.map((r) => r.id), ["live"]);
const byFileTime = runNexusQuery("TABLE file.mtime FROM path:Research SORT file.mtime desc", shop);
assert.deepEqual(byFileTime.rows.map((r) => r.id), ["live", "draft", "plain"]);
assert.match(byFileTime.rows[0].mtime, /1970|^\d{4}-/);
assert.equal(byFileTime.rows[0].fields[0].name, "file.mtime");
const named = runNexusQuery('LIST FROM path:Research WHERE file.name = "Plain"', shop);
assert.deepEqual(named.rows.map((r) => r.id), ["plain"]);
const unloaded = {
  r: folder("r", "Research"),
  hidden: { id: "hidden", path: "Research/Hidden.md", name: "Hidden.md", kind: "note", parentId: "r", mtime: 1 },
  draft: shop.draft,
};
const leftOut = runNexusQuery('LIST FROM path:Research WHERE status = "draft"', unloaded);
assert.deepEqual(leftOut.rows.map((r) => r.id), ["draft"]);
assert.match(leftOut.fieldNote, /1 note is not loaded/);
assert.match(runNexusQuery('LIST FROM path:Research WHERE status = "a" AND status = "b"', shop).error, /Only one WHERE/);
assert.match(runNexusQuery("TABLE a, b, c, d, e FROM path:Research", shop).error, /Only 4 TABLE columns/);
assert.match(runNexusQuery("LIST status FROM path:Research", shop).error, /Columns belong on TABLE/);
assert.match(runNexusQuery('TABLE file.link FROM path:Research', shop).error, /not Dataview/);
assert.match(runNexusQuery('LIST FROM path:Research WHERE date(today)', shop).error, /not Dataview/);
assert.match(runNexusQuery('LIST FROM path:Research WHERE file.mtime = "1"', shop).error, /is a column/);
const demoWhere = runNexusQuery('TABLE status FROM path:Research WHERE status = "draft"', demo.nodes);
assert.equal(demoWhere.error, null);
assert.equal(demoWhere.rows.length, 1);
assert.equal(demoWhere.rows[0].path, "Research/Callouts.md");
assert.equal(demoWhere.rows[0].fields[0].value, "draft");

console.log("nexus-query: PASS");
