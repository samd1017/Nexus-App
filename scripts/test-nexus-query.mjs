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

const { runNexusQuery, parseNexusQuery, NEXUS_QUERY_CAP, NEXUS_QUERY_DQL, queryNeedsFrontmatter, frontmatterHydrateIds, queryNeedsSizeBody, sizeHydrateIds } = await import(
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
const dvTagTable = runNexusQuery("TABLE file.link FROM #tag", nodes);
assert.equal(dvTagTable.error, null);
assert.equal(dvTagTable.mode, "table");
assert.equal(runNexusQuery("LIST FROM #a WHERE date(today)", nodes).error, null);
assert.equal(parseNexusQuery("").kind, "help");
const wholeVault = runNexusQuery("LIST", nodes);
assert.equal(wholeVault.error, null);
assert.deepEqual(wholeVault.rows.map((r) => r.id).sort(), ["c", "f", "g"]);
assert.match(runNexusQuery("SORT path:Research", nodes).error, /Start with LIST, TABLE, CARDS, or TASK/);
assert.equal(NEXUS_QUERY_DQL.includes("FLATTEN file.outlinks"), true);
assert.equal(NEXUS_QUERY_DQL.includes("FLATTEN file.inlinks"), true);
assert.equal(NEXUS_QUERY_DQL.includes("No join of two queries"), true);
assert.equal(NEXUS_QUERY_DQL.includes("WHERE does not compare a link list"), false);
assert.equal(NEXUS_QUERY_DQL.includes('contains(file.outlinks, "Title")'), true);
assert.equal(NEXUS_QUERY_DQL.includes('file.outlinks = "Title"'), true);
assert.equal(NEXUS_QUERY_DQL.includes("same exact-title membership"), true);
assert.equal(NEXUS_QUERY_DQL.includes('file.tags = "graph"'), true);
assert.equal(NEXUS_QUERY_DQL.includes('tags = "graph"'), true);
assert.equal(NEXUS_QUERY_DQL.includes("exact tag"), true);
assert.equal(NEXUS_QUERY_DQL.includes("is not supported — use contains"), false);
assert.equal(NEXUS_QUERY_DQL.includes("GROUP BY status"), true);
assert.equal(NEXUS_QUERY_DQL.includes("LIMIT 3"), true);
assert.equal(NEXUS_QUERY_DQL.includes("one level of notes"), true);
assert.equal(NEXUS_QUERY_DQL.includes("Nested rows after GROUP BY are not supported"), false);
assert.equal(NEXUS_QUERY_DQL.includes("file.size"), true);
assert.equal(NEXUS_QUERY_DQL.includes("file.ctime"), true);
assert.equal(NEXUS_QUERY_DQL.includes("SORT due"), true);
assert.equal(NEXUS_QUERY_DQL.includes("SORT file.folder"), true);
assert.equal(NEXUS_QUERY_DQL.includes('AND contains(file.name, "Graph")'), true);
assert.equal(NEXUS_QUERY_DQL.includes('OR status = "live"'), true);
assert.equal(NEXUS_QUERY_DQL.includes("AND binds tighter than OR"), true);
assert.equal(NEXUS_QUERY_DQL.includes("cannot mix AND and OR"), false);
assert.equal(NEXUS_QUERY_DQL.includes("Mixing AND and OR in one WHERE is not supported"), false);
assert.equal(NEXUS_QUERY_DQL.includes("WHERE OR between field comparisons is not supported"), false);
assert.equal(NEXUS_QUERY_DQL.includes("No joins"), false);
assert.equal(NEXUS_QUERY_DQL.includes("WHERE field"), true);
assert.equal(NEXUS_QUERY_DQL.includes('TABLE choice(status = "draft", "yes", "no")'), true);
assert.equal(NEXUS_QUERY_DQL.includes("up to three + - * /"), true);
assert.equal(NEXUS_QUERY_DQL.includes("A TABLE formula is one + - * /"), false);
assert.equal(NEXUS_QUERY_DQL.includes("No join of two queries"), true);

const many = { box: folder("box", "Box") };
for (let i = 0; i < NEXUS_QUERY_CAP + 5; i++) {
  const id = `n${i}`;
  many[id] = { ...note(id, `Box/N${String(i).padStart(3, "0")}.md`, "# n\n"), parentId: "box" };
}
const capped = runNexusQuery("LIST path:Box", many);
assert.equal(capped.rows.length, NEXUS_QUERY_CAP);
assert.equal(capped.truncated, true);
assert.equal(capped.error, null);
const limited = runNexusQuery("LIST path:Box LIMIT 3", many);
assert.equal(limited.error, null);
assert.equal(limited.rows.length, 3);
assert.equal(limited.truncated, false);
assert.ok(limited.rows.every((r) => r.group == null));
const overLimit = runNexusQuery(`LIST path:Box LIMIT ${NEXUS_QUERY_CAP + 20}`, many);
assert.equal(overLimit.rows.length, NEXUS_QUERY_CAP);
assert.equal(overLimit.truncated, true);

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
assert.match(noteList.content, /FLATTEN file\.outlinks/);
assert.match(noteList.content, /FLATTEN file\.inlinks/);
assert.match(noteList.content, /TABLE file\.inlinks/);
assert.match(noteList.content, /contains\(file\.outlinks, "Welcome"\)/);
assert.match(noteList.content, /contains\(file\.inlinks, "Welcome"\)/);
assert.match(noteList.content, /file\.outlinks = "Welcome"/);
assert.match(noteList.content, /same exact-title membership/);
assert.match(noteList.content, /file\.tags = "graph"/);
assert.match(noteList.content, /tags = "graph"/);
assert.match(noteList.content, /exact tag/);
assert.doesNotMatch(noteList.content, /is not supported — use contains/);
assert.doesNotMatch(noteList.content, /WHERE does not compare a link list/);
assert.doesNotMatch(noteList.content, /no joins/);
assert.match(noteList.content, /parentheses/);
assert.doesNotMatch(noteList.content, /up to three \+ - \* \//);
assert.match(noteList.content, /No join of two queries|not two queries/);
assert.doesNotMatch(noteList.content, /no formulas/);
assert.match(noteList.content, /due > date\(today\)/);
assert.doesNotMatch(noteList.content, /no date\(\)/);
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
assert.match(view, /ensureNoteBody/);
assert.match(view, /frontmatterHydrateIds/);
assert.match(view, /sizeHydrateIds/);
assert.match(view, /shouldSkipBackgroundBodyHydrate/);
assert.match(view, /useSyncExternalStore\(subscribeBodyGen, getBodyGen, getBodyGen\)/);
assert.match(view, /\[query, nodes, bodyGen\]/);
assert.match(view, /\[query, nodes, tagExtras, bodyGen, hostId, editGen, taskIndex\.tasks\]/);
const lib = readFileSync("src/lib/vault/nexus-query.ts", "utf8");
assert.match(lib, /Built-in list\. A join is FLATTEN/);
assert.match(lib, /FLATTEN file\.outlinks/);
assert.match(lib, /FLATTEN file\.inlinks/);
assert.doesNotMatch(lib, /no joins/);
assert.match(lib, /up to three \+ - \* \//);
assert.match(lib, /TABLE choice\(status = "draft", "yes", "no"\)/);
assert.doesNotMatch(lib, /no formulas/);
assert.doesNotMatch(lib, /no date\(\)/);
assert.doesNotMatch(lib, /no contains\(\)/);
assert.match(noteList.content, /contains\(file\.name, "Graph"\)/);
assert.match(noteList.content, /GROUP BY status/);
assert.match(noteList.content, /one level of notes/);
assert.doesNotMatch(noteList.content, /Nested rows after GROUP BY are not supported/);
assert.match(noteList.content, /LIMIT 3/);
assert.match(noteList.content, /TABLE file\.size, file\.ctime/);
assert.match(noteList.content, /WHERE file\.size > 10/);
assert.match(noteList.content, /SORT file\.ctime/);
assert.match(noteList.content, /SORT due/);
assert.match(noteList.content, /SORT file\.folder/);
assert.match(noteList.content, /AND contains\(file\.name, "Call"\)/);
assert.match(noteList.content, /OR status = "live"/);
assert.match(noteList.content, /AND binds tighter than OR/);
assert.doesNotMatch(noteList.content, /cannot mix AND and OR/);
assert.doesNotMatch(noteList.content, /WHERE OR between field comparisons is not supported/);
assert.doesNotMatch(lib, /Only one WHERE/);
assert.doesNotMatch(lib, /no full DQL/);
assert.match(view, /queryColumnLabel/);
assert.match(view, /data-testid="nexus-query-field"/);
assert.match(view, /data-testid="nexus-query-group"/);
assert.match(view, /data-testid="nexus-query-nested"/);
const preview = readFileSync("src/lib/editor/hydrate-preview.ts", "utf8");
assert.match(preview, /data-testid="nexus-query-group"/);
assert.match(preview, /data-testid="nexus-query-nested"/);
assert.match(preview, /renderNexusQueries/);
assert.match(preview, /data-open-note/);
assert.match(preview, /queryColumnLabel/);

const shop = {
  r: folder("r", "Research"),
  draft: {
    ...note("draft", "Research/Callouts.md", "---\nstatus: draft\ndue: 2026-10-02\nprice: 12\n---\n\n# Callouts\n"),
    parentId: "r",
    mtime: 50,
  },
  live: {
    ...note("live", "Research/Graph View.md", "---\nstatus: live\ndue: 2026-09-01\nprice: 4\n---\n\n# Graph\n"),
    parentId: "r",
    mtime: 80,
  },
  plain: { ...note("plain", "Research/Plain.md", "# Plain\n"), parentId: "r", mtime: 10 },
};
const groupedShop = {
  ...shop,
  alpha: {
    ...note("alpha", "Research/Alpha.md", "---\nstatus: live\n---\n# Alpha\n"),
    parentId: "r",
    mtime: 5,
  },
  zebra: {
    ...note("zebra", "Research/Zebra.md", "---\nstatus: draft\n---\n# Zebra\n"),
    parentId: "r",
    mtime: 6,
  },
};
const grouped = runNexusQuery("TABLE status FROM path:Research GROUP BY status", groupedShop);
assert.equal(grouped.error, null);
assert.deepEqual(
  grouped.rows.map((r) => [r.group, r.title]),
  [
    ["draft", "Callouts"],
    ["draft", "Zebra"],
    ["live", "Alpha"],
    ["live", "Graph View"],
    ["—", "Plain"],
  ],
);
const groupedLimit = runNexusQuery("TABLE status FROM path:Research GROUP BY status LIMIT 2", groupedShop);
assert.deepEqual(groupedLimit.rows.map((r) => r.title), ["Callouts", "Zebra"]);
assert.equal(groupedLimit.truncated, false);
const folderGroup = runNexusQuery("LIST FROM path:Research GROUP BY file.folder LIMIT 2", shop);
assert.equal(folderGroup.error, null);
assert.ok(folderGroup.rows.every((r) => r.group === "Research"));
assert.equal(folderGroup.rows.length, 2);
assert.match(runNexusQuery("TABLE status FROM path:Research GROUP BY status GROUP BY file.folder", shop).error, /Only one GROUP BY/);
assert.match(runNexusQuery("LIST FROM path:Research LIMIT 2 LIMIT 3", shop).error, /Only one LIMIT/);
assert.match(runNexusQuery("LIST FROM path:Research LIMIT 0", shop).error, /LIMIT needs a positive number/);
assert.equal(runNexusQuery("LIST FROM path:Research GROUP BY file.outlinks", shop).error, null);
const nested = runNexusQuery("TABLE status FROM path:Research GROUP BY status rows", groupedShop);
assert.equal(nested.error, null);
assert.doesNotMatch(nested.error ?? "", /not Dataview/);
assert.deepEqual(
  nested.rows.map((r) => [r.group, (r.rows || []).map((child) => child.title)]),
  [
    ["draft", ["Callouts", "Zebra"]],
    ["live", ["Alpha", "Graph View"]],
    ["—", ["Plain"]],
  ],
);
const nestedLimit = runNexusQuery("TABLE status FROM path:Research GROUP BY status rows LIMIT 2", groupedShop);
assert.deepEqual(nestedLimit.rows.map((r) => r.group), ["draft", "live"]);
assert.equal(nestedLimit.truncated, false);
assert.equal(grouped.rows[0].rows, null);
const linkRows = runNexusQuery("TABLE rows.file.link FROM path:Research GROUP BY status", shop);
assert.equal(linkRows.error, null);
assert.deepEqual(
  linkRows.rows.map((r) => [r.group, (r.rows || []).map((child) => child.title)]),
  [
    ["draft", ["Callouts"]],
    ["live", ["Graph View"]],
    ["—", ["Plain"]],
  ],
);
const rowsAlone = runNexusQuery("TABLE rows FROM path:Research", shop);
assert.equal(rowsAlone.error, null);
assert.match(rowsAlone.fieldNote, /“rows”/);
const rowsDeep = runNexusQuery("TABLE rows.rows FROM path:Research GROUP BY status", shop);
assert.equal(rowsDeep.error, null);
assert.match(rowsDeep.fieldNote, /“rows”/);
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
const byDue = runNexusQuery("TABLE status, due FROM path:Research SORT due", shop);
assert.equal(byDue.error, null);
assert.deepEqual(byDue.rows.map((r) => r.id), ["live", "draft", "plain"]);
const byDueDesc = runNexusQuery("TABLE status, due FROM path:Research SORT due desc", shop);
assert.deepEqual(byDueDesc.rows.map((r) => r.id), ["draft", "live", "plain"]);
const byStatus = runNexusQuery("LIST FROM path:Research SORT status", groupedShop);
assert.deepEqual(byStatus.rows.map((r) => r.title), ["Callouts", "Zebra", "Alpha", "Graph View", "Plain"]);
const byStatusDesc = runNexusQuery("LIST FROM path:Research SORT status desc", groupedShop);
assert.deepEqual(byStatusDesc.rows.map((r) => r.title), ["Graph View", "Alpha", "Zebra", "Callouts", "Plain"]);
const byPrice = runNexusQuery("LIST FROM path:Research SORT price desc", shop);
assert.deepEqual(byPrice.rows.map((r) => r.id), ["draft", "live", "plain"]);
const folderSortNodes = {
  r: folder("r", "Research"),
  j: folder("j", "Journal"),
  a: { ...note("a", "Research/Alpha.md", "# Alpha\n\n#idea\n"), parentId: "r" },
  b: { ...note("b", "Journal/Beta.md", "# Beta\n\n#idea\n"), parentId: "j" },
};
const byFolder = runNexusQuery("LIST FROM #idea SORT file.folder", folderSortNodes);
assert.equal(byFolder.error, null);
assert.deepEqual(byFolder.rows.map((r) => r.id), ["b", "a"]);
const byFolderDesc = runNexusQuery("LIST FROM #idea SORT file.folder desc", folderSortNodes);
assert.deepEqual(byFolderDesc.rows.map((r) => r.id), ["a", "b"]);
const sortLinks = runNexusQuery("LIST FROM path:Research SORT file.outlinks", shop);
assert.equal(sortLinks.error, null);
assert.equal(sortLinks.rows.length, 3);
assert.equal(runNexusQuery("LIST FROM path:Research SORT file.inlinks", shop).error, null);
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
const emptyAnd = runNexusQuery('LIST FROM path:Research WHERE status = "a" AND status = "b"', shop);
assert.equal(emptyAnd.error, null);
assert.deepEqual(emptyAnd.rows, []);
const fiveCols = runNexusQuery("TABLE a, b, c, d, e FROM path:Research", shop);
assert.equal(fiveCols.error, null);
assert.equal(fiveCols.rows[0].fields.length, 5);
assert.match(fiveCols.fieldNote, /3 more properties/);
const listValue = runNexusQuery("LIST status FROM path:Research", shop);
assert.equal(listValue.error, null);
assert.equal(listValue.rows.find((r) => r.id === "draft").fields[0].value, "draft");
assert.match(runNexusQuery("LIST status, due FROM path:Research", shop).error, /LIST shows one value/);
const linkCol = runNexusQuery("TABLE file.link FROM path:Research", shop);
assert.equal(linkCol.error, null);
assert.deepEqual(linkCol.rows.map((r) => r.fields[0].value), ["Callouts", "Graph View", "Plain"]);
const whereChoice = runNexusQuery('LIST FROM path:Research WHERE choice(status, "a")', shop);
assert.match(whereChoice.error, /belongs on TABLE/);
assert.doesNotMatch(whereChoice.error, /not Dataview/);
const choiceCol = runNexusQuery('TABLE choice(status = "draft", "drafting", "other"), status FROM path:Research', shop);
assert.equal(choiceCol.error, null);
assert.match(choiceCol.footer, /TABLE choice\(status = "draft", "yes", "no"\)/);
assert.match(choiceCol.footer, /up to three \+ - \* \//);
assert.match(choiceCol.footer, /No join of two queries/);
assert.doesNotMatch(choiceCol.footer, /A TABLE formula is one \+ - \* \//);
assert.match(choiceCol.footer, /same exact-title membership/);
assert.match(choiceCol.footer, /exact tag/);
assert.doesNotMatch(choiceCol.footer, /is not supported — use contains/);
assert.match(choiceCol.footer, /AND binds tighter than OR/);
assert.doesNotMatch(choiceCol.footer, /cannot mix AND and OR/);
assert.match(choiceCol.footer, /one level of notes/);
assert.doesNotMatch(choiceCol.footer, /Nested rows after GROUP BY are not supported/);
assert.equal(choiceCol.rows.find((r) => r.id === "draft").fields[0].value, "drafting");
assert.equal(choiceCol.rows.find((r) => r.id === "draft").fields[1].value, "draft");
assert.equal(choiceCol.rows.find((r) => r.id === "live").fields[0].value, "other");
assert.equal(choiceCol.rows.find((r) => r.id === "plain").fields[0].value, "other");
const choiceName = runNexusQuery('TABLE choice(contains(file.name, "Graph"), "hit", "miss") FROM path:Research', shop);
assert.equal(choiceName.error, null);
assert.equal(choiceName.rows.find((r) => r.id === "live").fields[0].value, "hit");
assert.equal(choiceName.rows.find((r) => r.id === "draft").fields[0].value, "miss");
assert.equal(choiceName.rows.find((r) => r.id === "plain").fields[0].value, "miss");
const choiceGlued = runNexusQuery('TABLE choice(status="draft","drafting","other") FROM path:Research', shop);
assert.equal(choiceGlued.rows.find((r) => r.id === "draft").fields[0].value, "drafting");
assert.equal(choiceGlued.rows.find((r) => r.id === "live").fields[0].value, "other");
const choiceDate = runNexusQuery('TABLE choice(due > date(today), "later", "past") FROM path:Research', shop, null, Date.UTC(2026, 9, 1, 15, 0));
assert.equal(choiceDate.error, null);
assert.equal(choiceDate.rows.find((r) => r.id === "draft").fields[0].value, "later");
assert.equal(choiceDate.rows.find((r) => r.id === "live").fields[0].value, "past");
const choiceNum = runNexusQuery('TABLE choice(price > 10, file.name, "low") FROM path:Research', shop);
assert.equal(choiceNum.rows.find((r) => r.id === "draft").fields[0].value, "Callouts");
assert.equal(choiceNum.rows.find((r) => r.id === "live").fields[0].value, "low");
const choiceBad = runNexusQuery('TABLE choice(status = "draft", "only") FROM path:Research', shop);
assert.match(choiceBad.error, /choice\(\)/);
assert.doesNotMatch(choiceBad.error, /not Dataview/);
const choiceNest = runNexusQuery('TABLE choice(choice(status = "draft", "a", "b"), "x", "y") FROM path:Research', shop);
assert.match(choiceNest.error, /does not nest/);
assert.doesNotMatch(choiceNest.error, /not Dataview/);
const choiceLinks = runNexusQuery('TABLE choice(file.outlinks = "Beta", "yes", "no") FROM path:Research', shop);
assert.equal(choiceLinks.error, null);
assert.doesNotMatch(choiceLinks.error ?? "", /not Dataview/);
assert.ok(choiceLinks.rows.every((r) => r.fields[0].value === "no"));
const choiceMix = runNexusQuery('LIST FROM path:Research WHERE status = "draft" AND price > 10 OR file.name = "Plain"', shop);
assert.equal(choiceMix.error, null);
assert.doesNotMatch(choiceMix.error ?? "", /not Dataview/);
assert.deepEqual(choiceMix.rows.map((r) => r.id).sort(), ["draft", "plain"]);
const choiceHidden = runNexusQuery('TABLE choice(status = "draft", "drafting", "other") FROM path:Research', unloaded);
assert.equal(choiceHidden.rows.find((r) => r.id === "hidden").fields[0].value, "—");
assert.equal(choiceHidden.rows.find((r) => r.id === "draft").fields[0].value, "drafting");
const hasDra = runNexusQuery('LIST FROM path:Research WHERE contains(status, "dra")', shop);
assert.equal(hasDra.error, null);
assert.deepEqual(hasDra.rows.map((r) => r.id), ["draft"]);
const caseStatus = runNexusQuery('LIST FROM path:Research WHERE contains(status, "Draft")', shop);
assert.equal(caseStatus.error, null);
assert.equal(caseStatus.rows.length, 0);
const gluedContains = runNexusQuery('LIST FROM path:Research WHERE contains(status,"draft")', shop);
assert.deepEqual(gluedContains.rows.map((r) => r.id), ["draft"]);
const namedContains = runNexusQuery('LIST FROM path:Research WHERE contains(file.name, "Graph")', shop);
assert.deepEqual(namedContains.rows.map((r) => r.id), ["live"]);
const nameCase = runNexusQuery('LIST FROM path:Research WHERE contains(file.name, "graph")', shop);
assert.equal(nameCase.rows.length, 0);
const notRegex = runNexusQuery('LIST FROM path:Research WHERE contains(file.name, "G.*")', shop);
assert.equal(notRegex.rows.length, 0);
const tagContains = runNexusQuery('LIST FROM path:Research WHERE contains(file.tags, "graph")', nodes);
assert.deepEqual(tagContains.rows.map((r) => r.id), ["g"]);
const tagEq = runNexusQuery('LIST FROM path:Research WHERE file.tags = "graph"', nodes);
assert.equal(tagEq.error, null);
assert.doesNotMatch(tagEq.error ?? "", /not Dataview/);
assert.deepEqual(tagEq.rows.map((r) => r.id), ["g"]);
const tagBare = runNexusQuery('LIST FROM path:Research WHERE tags = "links"', nodes);
assert.equal(tagBare.error, null);
assert.deepEqual(tagBare.rows.map((r) => r.id), ["g"]);
const tagHash = runNexusQuery('LIST FROM path:Research WHERE file.tags = "#writing"', nodes);
assert.deepEqual(tagHash.rows.map((r) => r.id), ["c"]);
const tagCase = runNexusQuery('LIST FROM path:Research WHERE file.tags = "Graph"', nodes);
assert.deepEqual(tagCase.rows.map((r) => r.id), ["g"]);
const tagPrefix = runNexusQuery('LIST FROM path:Research WHERE file.tags = "gra"', nodes);
assert.equal(tagPrefix.error, null);
assert.equal(tagPrefix.rows.length, 0);
assert.equal(queryNeedsFrontmatter('LIST FROM path:Research WHERE file.tags = "graph"'), false);
const mtimeContains = runNexusQuery('LIST FROM path:Journal WHERE contains(file.mtime, "2026-10-01")', nodes);
assert.deepEqual(mtimeContains.rows.map((r) => r.id), ["f"]);
const sized = {
  r: folder("r", "Research"),
  big: { ...note("big", "Research/Big.md", "# Big\n"), parentId: "r", mtime: 10, size: 400, ctime: Date.UTC(2026, 9, 1, 8, 0) },
  small: { ...note("small", "Research/Small.md", "# Small\n"), parentId: "r", mtime: 20, size: 40, ctime: Date.UTC(2026, 7, 1, 8, 0) },
  bare: { ...note("bare", "Research/Bare.md", "# Bare\n"), parentId: "r", mtime: 30 },
};
const sizeTable = runNexusQuery("TABLE file.size, file.ctime FROM path:Research", sized);
assert.equal(sizeTable.error, null);
assert.equal(sizeTable.rows.find((r) => r.id === "big").fields.map((f) => f.value).join("|"), "400|2026-10-01 08:00");
assert.equal(sizeTable.rows.find((r) => r.id === "small").fields[0].value, "40");
assert.equal(sizeTable.rows.find((r) => r.id === "bare").fields.map((f) => f.value).join("|"), "7|—");
assert.doesNotMatch(sizeTable.error ?? "", /not Dataview/);
const bigger = runNexusQuery("LIST FROM path:Research WHERE file.size > 100", sized);
assert.deepEqual(bigger.rows.map((r) => r.id), ["big"]);
const anySize = runNexusQuery("LIST FROM path:Research WHERE file.size > 10", sized);
assert.deepEqual(anySize.rows.map((r) => r.id).sort(), ["big", "small"]);
const born = runNexusQuery("LIST FROM path:Research WHERE file.ctime >= date(today) - 30d", sized, null, Date.UTC(2026, 9, 1, 15, 0));
assert.deepEqual(born.rows.map((r) => r.id), ["big"]);
const bySize = runNexusQuery("LIST FROM path:Research SORT file.size desc", sized);
assert.deepEqual(bySize.rows.map((r) => r.id), ["big", "small", "bare"]);
const byBorn = runNexusQuery("LIST FROM path:Research SORT file.ctime", sized);
assert.deepEqual(byBorn.rows.map((r) => r.id), ["bare", "small", "big"]);
const sizeGroups = runNexusQuery("LIST FROM path:Research GROUP BY file.size", sized);
assert.deepEqual(sizeGroups.rows.map((r) => r.group), ["7", "40", "400"]);
const unsized = {
  r: folder("r", "Research"),
  body: { ...note("body", "Research/Loaded.md", "abcdef"), parentId: "r", mtime: 1 },
  canvas: {
    ...note("canvas", "Research/Untitled.canvas", "this body is longer than thirty three bytes!!"),
    parentId: "r",
    mtime: 2,
    size: 33,
  },
  ghost: { id: "ghost", path: "Research/Ghost.md", name: "Ghost.md", kind: "note", parentId: "r", mtime: 3 },
};
const { resetVaultIndex } = await import("../src/lib/vault/indexes.ts");
resetVaultIndex();
const shownSize = runNexusQuery("TABLE file.size FROM path:Research SORT file.size desc", unsized);
assert.deepEqual(
  shownSize.rows.map((r) => [r.id, r.fields[0].value]),
  [
    ["canvas", "33"],
    ["body", "6"],
    ["ghost", "—"],
  ],
);
const bodyHit = runNexusQuery("LIST FROM path:Research WHERE file.size > 5", unsized);
assert.deepEqual(bodyHit.rows.map((r) => r.id).sort(), ["body", "canvas"]);
const catalogOnly = runNexusQuery("LIST FROM path:Research WHERE file.size > 30", unsized);
assert.deepEqual(catalogOnly.rows.map((r) => r.id), ["canvas"]);
assert.deepEqual(runNexusQuery('LIST FROM path:Research WHERE file.size = "soon"', sized).rows, []);
assert.deepEqual(runNexusQuery('LIST FROM path:Research WHERE file.ctime = "soon"', sized).rows, []);
const commaNeedle = runNexusQuery('LIST FROM path:Research WHERE contains(file.name, "a, b")', shop);
assert.equal(commaNeedle.error, null);
assert.equal(commaNeedle.rows.length, 0);
const halfContains = runNexusQuery('LIST FROM path:Research WHERE contains(status)', shop);
assert.match(halfContains.error, /contains\(\) takes 2 values/);
assert.equal(halfContains.problem.clause, "WHERE");
assert.equal('LIST FROM path:Research WHERE contains(status)'.slice(halfContains.problem.start, halfContains.problem.end), "contains(status)");
assert.equal(runNexusQuery('LIST FROM path:Research WHERE contains(status, "")', shop).error, null);
assert.equal(runNexusQuery('LIST FROM path:Research WHERE contains(file.link, "a")', shop).error, null);
resetVaultIndex();
const andStatus = runNexusQuery('LIST FROM path:Research WHERE status = "draft" AND contains(status, "dra")', shop);
assert.equal(andStatus.error, null);
assert.deepEqual(andStatus.rows.map((r) => r.id), ["draft"]);
const andName = runNexusQuery('LIST FROM path:Research WHERE status = "draft" AND contains(file.name, "Call")', shop);
assert.equal(andName.error, null);
assert.deepEqual(andName.rows.map((r) => r.id), ["draft"]);
const andMiss = runNexusQuery('LIST FROM path:Research WHERE status = "draft" AND contains(file.name, "Graph")', shop);
assert.equal(andMiss.error, null);
assert.equal(andMiss.rows.length, 0);
const andThree = runNexusQuery('LIST FROM path:Research WHERE status = "draft" AND contains(file.name, "Call") AND price > 10', shop);
assert.deepEqual(andThree.rows.map((r) => r.id), ["draft"]);
const fieldOr = runNexusQuery('LIST FROM path:Research WHERE status = "draft" OR status = "live"', shop);
assert.equal(fieldOr.error, null);
assert.deepEqual(fieldOr.rows.map((r) => r.id).sort(), ["draft", "live"]);
const orName = runNexusQuery('LIST FROM path:Research WHERE contains(file.name, "Call") OR contains(file.name, "Graph")', shop);
assert.deepEqual(orName.rows.map((r) => r.id).sort(), ["draft", "live"]);
const orMiss = runNexusQuery('LIST FROM path:Research WHERE status = "nope" OR contains(file.name, "Nope")', shop);
assert.equal(orMiss.error, null);
assert.equal(orMiss.rows.length, 0);
const mixed = runNexusQuery('LIST FROM path:Research WHERE status = "draft" AND contains(file.name, "Call") OR status = "live"', shop);
assert.equal(mixed.error, null);
assert.doesNotMatch(mixed.error ?? "", /not Dataview|cannot mix/);
assert.deepEqual(mixed.rows.map((r) => r.id).sort(), ["draft", "live"]);
const mixedBack = runNexusQuery('LIST FROM path:Research WHERE status = "draft" OR status = "live" AND contains(file.name, "Call")', shop);
assert.equal(mixedBack.error, null);
assert.deepEqual(mixedBack.rows.map((r) => r.id), ["draft"]);
const mixedGroups = runNexusQuery('LIST FROM path:Research WHERE status = "draft" AND price > 10 OR status = "live" AND price < 10', shop);
assert.deepEqual(mixedGroups.rows.map((r) => r.id).sort(), ["draft", "live"]);
const mixedTight = runNexusQuery('LIST FROM path:Research WHERE status = "live" OR status = "draft" AND price < 0', shop);
assert.deepEqual(mixedTight.rows.map((r) => r.id), ["live"]);
const nineMix = 'status = "live" OR ' + Array.from({ length: 8 }, () => 'status = "draft"').join(" AND ");
const nineMixed = runNexusQuery(`LIST FROM path:Research WHERE ${nineMix}`, shop);
assert.equal(nineMixed.error, null);
assert.deepEqual(nineMixed.rows.map((r) => r.id).sort(), ["draft", "live"]);
const orUnloaded = runNexusQuery('LIST FROM path:Research WHERE status = "draft" OR status = "gone"', unloaded);
assert.deepEqual(orUnloaded.rows.map((r) => r.id), ["draft"]);
assert.match(orUnloaded.fieldNote, /1 note is not loaded/);
const eightOr = Array.from({ length: 8 }, () => `status = "live"`).join(" OR ");
assert.deepEqual(runNexusQuery(`LIST FROM path:Research WHERE ${eightOr}`, shop).rows.map((r) => r.id), ["live"]);
const nineOr = Array.from({ length: 9 }, () => `status = "live"`).join(" OR ");
assert.deepEqual(runNexusQuery(`LIST FROM path:Research WHERE ${nineOr}`, shop).rows.map((r) => r.id), ["live"]);
const sizedShop = {
  ...shop,
  draft: { ...shop.draft, size: 800 },
  live: { ...shop.live, size: 200 },
  plain: { ...shop.plain, size: 900 },
};
const andSize = runNexusQuery('LIST FROM path:Research WHERE file.size > 500 AND status = "draft"', sizedShop);
assert.deepEqual(andSize.rows.map((r) => r.id), ["draft"]);
const andSizeMiss = runNexusQuery('LIST FROM path:Research WHERE file.size > 500 AND status = "live"', sizedShop);
assert.equal(andSizeMiss.rows.length, 0);
const orSize = runNexusQuery('LIST FROM path:Research WHERE file.size < 300 OR status = "draft"', sizedShop);
assert.deepEqual(orSize.rows.map((r) => r.id).sort(), ["draft", "live"]);
const andDue = runNexusQuery(
  'LIST FROM path:Research WHERE due > date(today) AND status = "draft"',
  shop,
  null,
  Date.UTC(2026, 9, 1, 15, 0),
);
assert.deepEqual(andDue.rows.map((r) => r.id), ["draft"]);
const orDue = runNexusQuery(
  'LIST FROM path:Research WHERE due < date(today) OR status = "draft"',
  shop,
  null,
  Date.UTC(2026, 9, 1, 15, 0),
);
assert.deepEqual(orDue.rows.map((r) => r.id).sort(), ["draft", "live"]);
const andUnloaded = runNexusQuery('LIST FROM path:Research WHERE status = "draft" AND contains(status, "dra")', unloaded);
assert.deepEqual(andUnloaded.rows.map((r) => r.id), ["draft"]);
assert.match(andUnloaded.fieldNote, /1 note is not loaded/);
const eight = Array.from({ length: 8 }, () => `status = "draft"`).join(" AND ");
const eightOk = runNexusQuery(`LIST FROM path:Research WHERE ${eight}`, shop);
assert.equal(eightOk.error, null);
assert.deepEqual(eightOk.rows.map((r) => r.id), ["draft"]);
const nine = Array.from({ length: 9 }, () => `status = "draft"`).join(" AND ");
assert.deepEqual(runNexusQuery(`LIST FROM path:Research WHERE ${nine}`, shop).rows.map((r) => r.id), ["draft"]);
const containsUnloaded = runNexusQuery('LIST FROM path:Research WHERE contains(status, "draft")', unloaded);
assert.deepEqual(containsUnloaded.rows.map((r) => r.id), ["draft"]);
assert.match(containsUnloaded.fieldNote, /1 note is not loaded/);
const demoContains = runNexusQuery('LIST FROM path:Research WHERE contains(file.name, "Graph")', demo.nodes);
assert.equal(demoContains.error, null);
assert.equal(demoContains.rows.length, 1);
assert.equal(demoContains.rows[0].path, "Research/Graph View.md");
const doubled = runNexusQuery('TABLE price * 2 FROM path:Research', shop);
assert.equal(doubled.error, null);
assert.equal(doubled.rows.find((r) => r.id === "draft").fields[0].value, "24");
assert.equal(doubled.rows.find((r) => r.id === "live").fields[0].value, "8");
assert.equal(doubled.rows.find((r) => r.id === "plain").fields[0].value, "—");
assert.equal(doubled.rows[0].fields[0].name, "price * 2");
const gluedMul = runNexusQuery("TABLE price*2 FROM path:Research WHERE price > 10", shop);
assert.deepEqual(gluedMul.rows.map((r) => r.id), ["draft"]);
assert.equal(gluedMul.rows[0].fields[0].value, "24");
const added = runNexusQuery("TABLE price + 2, price - 2, price / 2 FROM path:Research WHERE status = \"draft\"", shop);
assert.deepEqual(added.rows[0].fields.map((f) => f.value), ["14", "10", "6"]);
const divZero = runNexusQuery("TABLE price / 0 FROM path:Research WHERE status = \"draft\"", shop);
assert.equal(divZero.rows[0].fields[0].value, "—");
const textMul = runNexusQuery("TABLE status * 2 FROM path:Research WHERE status = \"draft\"", shop);
assert.equal(textMul.rows[0].fields[0].value, "—");
const concat = runNexusQuery('TABLE file.name + " note" FROM path:Research WHERE status = "draft"', shop);
assert.equal(concat.rows[0].fields[0].value, "Callouts note");
assert.equal(concat.rows[0].fields[0].name, 'file.name + " note"');
const gluedConcat = runNexusQuery('TABLE file.name+"!" FROM path:Research WHERE file.name = "Plain"', shop);
assert.equal(gluedConcat.rows[0].fields[0].value, "Plain!");
const joinedText = runNexusQuery('TABLE status + file.name FROM path:Research WHERE status = "draft"', shop);
assert.equal(joinedText.rows[0].fields[0].value, "draftCallouts");
const hyphenKey = runNexusQuery("TABLE due-date FROM path:Research", shop);
assert.equal(hyphenKey.error, null);
assert.match(hyphenKey.fieldNote, /due-date/);
const chainMul = runNexusQuery("TABLE price * 2 * 3 FROM path:Research", shop);
assert.equal(chainMul.error, null);
assert.doesNotMatch(chainMul.error ?? "", /not Dataview/);
assert.equal(chainMul.rows.find((r) => r.id === "draft").fields[0].value, "72");
assert.equal(chainMul.rows.find((r) => r.id === "live").fields[0].value, "24");
const chainAdd = runNexusQuery("TABLE price * 2 + 1 FROM path:Research", shop);
assert.equal(chainAdd.error, null);
assert.equal(chainAdd.rows.find((r) => r.id === "draft").fields[0].value, "25");
assert.equal(chainAdd.rows.find((r) => r.id === "live").fields[0].value, "9");
assert.equal(chainAdd.rows.find((r) => r.id === "plain").fields[0].value, "—");
assert.equal(chainAdd.rows[0].fields[0].name, "price * 2 + 1");
const chainText = runNexusQuery('TABLE file.name + " · " + status FROM path:Research WHERE status = "draft"', shop);
assert.equal(chainText.rows[0].fields[0].value, "Callouts · draft");
const chainThree = runNexusQuery("TABLE price * 2 + 1 - 3 FROM path:Research WHERE status = \"draft\"", shop);
assert.equal(chainThree.rows[0].fields[0].value, "22");
const chainFour = runNexusQuery("TABLE price * 2 + 1 - 3 / 2 FROM path:Research", shop);
assert.equal(chainFour.error, null);
assert.equal(chainFour.rows.find((r) => r.id === "draft").fields[0].value, "23.5");
const chainParen = runNexusQuery("TABLE (price * 2) + 1 FROM path:Research", shop);
assert.equal(chainParen.error, null);
assert.equal(chainParen.rows.find((r) => r.id === "draft").fields[0].value, "25");
assert.equal(runNexusQuery("LIST price * 2 FROM path:Research", shop).error, null);
assert.match(runNexusQuery("TABLE price * 2, price * 2 FROM path:Research", shop).error, /already a column/);
assert.match(runNexusQuery("TABLE price * FROM path:Research", shop).error, /incomplete/);
const demoFormula = runNexusQuery('TABLE file.name + " note" FROM path:Research WHERE contains(file.name, "Graph")', demo.nodes);
assert.equal(demoFormula.error, null);
assert.equal(demoFormula.rows.length, 1);
assert.equal(demoFormula.rows[0].fields[0].value, "Graph View note");
const linked = {
  r: folder("r", "Research"),
  a: {
    ...note("a", "Research/Alpha.md", "---\nstatus: draft\n---\n\nSee [[Beta]] and [[Beta]] and [[#Here]] and [[Missing Note]].\n"),
    parentId: "r",
  },
  b: { ...note("b", "Research/Beta.md", "Back to [[Alpha]].\n"), parentId: "r" },
  c: { ...note("c", "Research/Quiet.md", "No links here.\n"), parentId: "r" },
};
const joined = runNexusQuery("TABLE file.outlinks FROM path:Research", linked);
assert.equal(joined.error, null);
assert.deepEqual(
  joined.rows.map((r) => [r.title, r.link, r.fields[0].value]),
  [
    ["Alpha", "Beta", "Beta"],
    ["Alpha", "Missing Note", "Missing Note"],
    ["Beta", "Alpha", "Alpha"],
  ],
);
assert.equal(joined.rows[0].id, "a");
assert.equal(joined.scanNote, null);
const listed = runNexusQuery("LIST FROM path:Research FLATTEN file.outlinks", linked);
assert.deepEqual(listed.rows.map((r) => r.link), ["Beta", "Missing Note", "Alpha"]);
const repeated = runNexusQuery('TABLE status FLATTEN file.outlinks FROM path:Research WHERE status = "draft"', linked);
assert.deepEqual(repeated.rows.map((r) => [r.id, r.fields.find((f) => f.name === "status").value, r.link]), [
  ["a", "draft", "Beta"],
  ["a", "draft", "Missing Note"],
]);
const quiet = runNexusQuery('LIST FROM path:Research WHERE file.name = "Quiet" FLATTEN file.outlinks', linked);
assert.equal(quiet.rows.length, 0);
assert.match(quiet.scanNote, /No outgoing links/);
const hiddenLinks = {
  r: folder("r", "Research"),
  hidden: { id: "hidden", path: "Research/Hidden.md", name: "Hidden.md", kind: "note", parentId: "r", mtime: 1 },
  b: linked.b,
};
const hiddenJoin = runNexusQuery("TABLE file.outlinks FROM path:Research", hiddenLinks);
assert.deepEqual(hiddenJoin.rows.map((r) => r.id), ["b"]);
assert.match(hiddenJoin.fieldNote, /1 note is not loaded, so its links were left out/);
const inbound = runNexusQuery("TABLE file.inlinks FROM path:Research", linked);
assert.equal(inbound.error, null);
assert.deepEqual(
  inbound.rows.map((r) => [r.title, r.id, r.link, r.fields[0].value, r.fields[0].name]),
  [
    ["Alpha", "a", "Beta", "Beta", "file.inlinks"],
    ["Beta", "b", "Alpha", "Alpha", "file.inlinks"],
  ],
);
const inboundList = runNexusQuery("LIST FROM path:Research FLATTEN file.inlinks", linked);
assert.equal(inboundList.error, null);
assert.doesNotMatch(inboundList.error ?? "", /not Dataview/);
assert.deepEqual(inboundList.rows.map((r) => [r.id, r.link]), [
  ["a", "Beta"],
  ["b", "Alpha"],
]);
const outside = {
  ...linked,
  other: { ...note("other", "Projects/Other.md", "Points at [[Alpha]].\n"), parentId: null },
};
const fromOutside = runNexusQuery("LIST FROM path:Research FLATTEN file.inlinks", outside);
assert.deepEqual(fromOutside.rows.map((r) => [r.id, r.link]), [
  ["a", "Beta"],
  ["a", "Other"],
  ["b", "Alpha"],
]);
const quietIn = runNexusQuery('LIST FROM path:Research WHERE file.name = "Quiet" FLATTEN file.inlinks', linked);
assert.equal(quietIn.rows.length, 0);
assert.match(quietIn.scanNote, /No incoming links/);
const hiddenIn = runNexusQuery("TABLE file.inlinks FROM path:Research", hiddenLinks);
assert.match(hiddenIn.fieldNote, /not loaded, so its links were left out/);
assert.match(runNexusQuery("LIST FROM path:Research FLATTEN tags", linked).error, /FLATTEN file\.outlinks/);
assert.match(runNexusQuery("TABLE file.outlinks FLATTEN file.outlinks FROM path:Research", linked).error, /Only one FLATTEN/);
assert.match(runNexusQuery("LIST FROM path:Research FLATTEN file.outlinks FLATTEN file.inlinks", linked).error, /Only one FLATTEN/);
const bothLinks = runNexusQuery("TABLE file.outlinks, file.inlinks FROM path:Research", linked);
assert.equal(bothLinks.error, null);
assert.deepEqual(bothLinks.rows.find((r) => r.id === "a").fields.map((f) => f.value), ["Beta, Missing Note", "Beta"]);
assert.match(runNexusQuery("TABLE file.inlinks FLATTEN file.outlinks FROM path:Research", linked).error, /Only one FLATTEN/);
const eqOut = runNexusQuery('LIST FROM path:Research WHERE file.outlinks = "Beta"', linked);
assert.equal(eqOut.error, null);
assert.doesNotMatch(eqOut.error ?? "", /not supported|not Dataview/);
assert.deepEqual(eqOut.rows.map((r) => r.id), ["a"]);
const eqIn = runNexusQuery('LIST FROM path:Research WHERE file.inlinks = "Alpha"', linked);
assert.equal(eqIn.error, null);
assert.deepEqual(eqIn.rows.map((r) => r.id), ["b"]);
const eqMissing = runNexusQuery('LIST FROM path:Research WHERE file.outlinks = "Missing Note"', linked);
assert.deepEqual(eqMissing.rows.map((r) => r.id), ["a"]);
const eqPrefix = runNexusQuery('LIST FROM path:Research WHERE file.outlinks = "Bet"', linked);
assert.equal(eqPrefix.rows.length, 0);
const eqCase = runNexusQuery('LIST FROM path:Research WHERE file.inlinks = "alpha"', linked);
assert.equal(eqCase.rows.length, 0);
const eqAnd = runNexusQuery('LIST FROM path:Research WHERE status = "draft" AND file.outlinks = "Beta"', linked);
assert.deepEqual(eqAnd.rows.map((r) => r.id), ["a"]);
const eqOr = runNexusQuery('LIST FROM path:Research WHERE file.outlinks = "Beta" OR file.name = "Quiet"', linked);
assert.deepEqual(eqOr.rows.map((r) => r.id).sort(), ["a", "c"]);
const eqChoice = runNexusQuery('TABLE choice(file.outlinks = "Beta", "yes", "no") FROM path:Research', linked);
assert.equal(eqChoice.error, null);
assert.equal(eqChoice.rows.find((r) => r.id === "a").fields[0].value, "yes");
assert.equal(eqChoice.rows.find((r) => r.id === "b").fields[0].value, "no");
assert.equal(eqChoice.rows.find((r) => r.id === "c").fields[0].value, "no");
assert.equal(runNexusQuery('LIST FROM path:Research WHERE file.outlinks > "Beta"', linked).error, null);
assert.equal(runNexusQuery('LIST FROM path:Research WHERE file.inlinks != "Alpha"', linked).error, null);
const outBeta = runNexusQuery('LIST FROM path:Research WHERE contains(file.outlinks, "Beta")', linked);
assert.deepEqual(outBeta.rows.map((r) => r.id), ["a"]);
const andOut = runNexusQuery('LIST FROM path:Research WHERE status = "draft" AND contains(file.outlinks, "Beta")', linked);
assert.equal(andOut.error, null);
assert.deepEqual(andOut.rows.map((r) => r.id), ["a"]);
const andOutMiss = runNexusQuery('LIST FROM path:Research WHERE status = "live" AND contains(file.outlinks, "Beta")', linked);
assert.equal(andOutMiss.rows.length, 0);
const andIn = runNexusQuery('LIST FROM path:Research WHERE contains(file.inlinks, "Alpha") AND contains(file.name, "Beta")', linked);
assert.deepEqual(andIn.rows.map((r) => r.id), ["b"]);
const orLink = runNexusQuery('LIST FROM path:Research WHERE contains(file.outlinks, "Beta") OR file.name = "Quiet"', linked);
assert.deepEqual(orLink.rows.map((r) => r.id).sort(), ["a", "c"]);
const outAlpha = runNexusQuery('LIST FROM path:Research WHERE contains(file.outlinks, "Alpha")', linked);
assert.deepEqual(outAlpha.rows.map((r) => r.id), ["b"]);
const outMissing = runNexusQuery('LIST FROM path:Research WHERE contains(file.outlinks, "Missing Note")', linked);
assert.deepEqual(outMissing.rows.map((r) => r.id), ["a"]);
const outPrefix = runNexusQuery('LIST FROM path:Research WHERE contains(file.outlinks, "Bet")', linked);
assert.equal(outPrefix.rows.length, 0);
assert.equal(outPrefix.error, null);
const outCase = runNexusQuery('LIST FROM path:Research WHERE contains(file.outlinks, "beta")', linked);
assert.equal(outCase.rows.length, 0);
const inAlpha = runNexusQuery('LIST FROM path:Research WHERE contains(file.inlinks, "Alpha")', linked);
assert.deepEqual(inAlpha.rows.map((r) => [r.id, r.title]), [["b", "Beta"]]);
const inBeta = runNexusQuery('LIST FROM path:Research WHERE contains(file.inlinks, "Beta")', linked);
assert.deepEqual(inBeta.rows.map((r) => r.id), ["a"]);
const inPrefix = runNexusQuery('LIST FROM path:Research WHERE contains(file.inlinks, "Al")', linked);
assert.equal(inPrefix.rows.length, 0);
const inOutside = runNexusQuery('LIST FROM path:Research WHERE contains(file.inlinks, "Other")', outside);
assert.deepEqual(inOutside.rows.map((r) => r.id), ["a"]);
const keptRows = runNexusQuery('TABLE file.outlinks FROM path:Research WHERE contains(file.outlinks, "Beta")', linked);
assert.deepEqual(keptRows.rows.map((r) => [r.id, r.link]), [
  ["a", "Beta"],
  ["a", "Missing Note"],
]);
const hiddenWhere = runNexusQuery('LIST FROM path:Research WHERE contains(file.outlinks, "Alpha")', hiddenLinks);
assert.deepEqual(hiddenWhere.rows.map((r) => r.id), ["b"]);
assert.match(hiddenWhere.fieldNote, /not loaded/);
const demoJoin = runNexusQuery('TABLE file.outlinks FROM path:Research WHERE contains(file.name, "Graph")', demo.nodes);
assert.equal(demoJoin.error, null);
assert.ok(demoJoin.rows.length >= 2);
assert.ok(demoJoin.rows.every((r) => r.title === "Graph View" && r.id));
assert.ok(demoJoin.rows.some((r) => r.link === "Welcome"));
assert.ok(demoJoin.rows.some((r) => r.link === "Linking Notes"));
const demoIn = runNexusQuery('TABLE file.inlinks FROM path:Research WHERE contains(file.name, "Graph")', demo.nodes);
assert.equal(demoIn.error, null);
assert.ok(demoIn.rows.length >= 2);
assert.ok(demoIn.rows.every((r) => r.title === "Graph View" && r.id));
assert.ok(demoIn.rows.some((r) => r.link === "Welcome"));
assert.ok(!demoIn.rows.some((r) => r.link === "Graph View"));
assert.equal(runNexusQuery('LIST FROM path:Research WHERE date(today)', shop).error, null);
assert.deepEqual(runNexusQuery('LIST FROM path:Research WHERE file.mtime = "soon"', shop).rows, []);
const tagEqShop = runNexusQuery('LIST FROM path:Research WHERE file.tags = "graph"', shop);
assert.equal(tagEqShop.error, null);
assert.deepEqual(tagEqShop.rows, []);
assert.doesNotMatch(tagEqShop.error ?? "", /is a column/);
assert.doesNotMatch(tagEqShop.error ?? "", /not Dataview/);
const tagNeq = runNexusQuery('LIST FROM path:Research WHERE file.tags != "graph"', nodes);
assert.equal(tagNeq.error, null);
assert.equal(runNexusQuery('LIST FROM path:Research WHERE tags > "graph"', nodes).error, null);
const tagLists = {
  r: folder("r", "Research"),
  wide: { ...note("wide", "Research/Wide.md", "# Wide\n\n#graphic\n"), parentId: "r", mtime: 1 },
  nested: { ...note("nested", "Research/Nested.md", "---\ntags: [planning/q4, review]\n---\n# Nested\n"), parentId: "r", mtime: 2 },
  both: { ...note("both", "Research/Both.md", "---\nstatus: draft\ntags: graph\n---\n# Both\n"), parentId: "r", mtime: 3 },
  hobbies: { ...note("hobbies", "Research/Hobbies.md", "---\nhobbies: [read, write]\n---\n# Hobbies\n"), parentId: "r", mtime: 4 },
};
const exactGraphic = runNexusQuery('LIST FROM path:Research WHERE file.tags = "graph"', tagLists);
assert.deepEqual(exactGraphic.rows.map((r) => r.id), ["both"]);
const subGraphic = runNexusQuery('LIST FROM path:Research WHERE contains(file.tags, "graph")', tagLists);
assert.deepEqual(subGraphic.rows.map((r) => r.id).sort(), ["both", "wide"]);
const nestedExact = runNexusQuery('LIST FROM path:Research WHERE tags = "planning/q4"', tagLists);
assert.deepEqual(nestedExact.rows.map((r) => r.id), ["nested"]);
const nestedPrefix = runNexusQuery('LIST FROM path:Research WHERE tags = "planning"', tagLists);
assert.equal(nestedPrefix.error, null);
assert.equal(nestedPrefix.rows.length, 0);
const andTag = runNexusQuery('LIST FROM path:Research WHERE status = "draft" AND file.tags = "graph"', tagLists);
assert.deepEqual(andTag.rows.map((r) => r.id), ["both"]);
const orTag = runNexusQuery('LIST FROM path:Research WHERE file.tags = "review" OR file.tags = "graphic"', tagLists);
assert.deepEqual(orTag.rows.map((r) => r.id).sort(), ["nested", "wide"]);
const choiceTag = runNexusQuery('TABLE choice(file.tags = "graph", "yes", "no") FROM path:Research', tagLists);
assert.equal(choiceTag.error, null);
assert.equal(choiceTag.rows.find((r) => r.id === "both").fields[0].value, "yes");
assert.equal(choiceTag.rows.find((r) => r.id === "wide").fields[0].value, "no");
const scalarList = runNexusQuery('LIST FROM path:Research WHERE hobbies = "read"', tagLists);
assert.equal(scalarList.error, null);
assert.equal(scalarList.rows.length, 0);
const scalarWhole = runNexusQuery('LIST FROM path:Research WHERE hobbies = "[read, write]"', tagLists);
assert.deepEqual(scalarWhole.rows.map((r) => r.id), ["hobbies"]);
const clock = Date.UTC(2026, 9, 1, 15, 0);
const dueAfter = runNexusQuery('LIST FROM path:Research WHERE due > date(today)', shop, null, clock);
assert.equal(dueAfter.error, null);
assert.deepEqual(dueAfter.rows.map((r) => r.id), ["draft"]);
const dueBefore = runNexusQuery('LIST FROM path:Research WHERE due < date(today)', shop, null, clock);
assert.deepEqual(dueBefore.rows.map((r) => r.id), ["live"]);
const dueEq = runNexusQuery('LIST FROM path:Research WHERE due = date(2026-10-02)', shop, null, clock);
assert.deepEqual(dueEq.rows.map((r) => r.id), ["draft"]);
const dueSame = runNexusQuery('LIST FROM path:Research WHERE due > date(2026-10-02)', shop, null, clock);
assert.equal(dueSame.rows.length, 0);
const dueSameGte = runNexusQuery('LIST FROM path:Research WHERE due >= date(2026-10-02)', shop, null, clock);
assert.deepEqual(dueSameGte.rows.map((r) => r.id), ["draft"]);
const dueLte = runNexusQuery('LIST FROM path:Research WHERE due <= date(2026-09-01)', shop, null, clock);
assert.deepEqual(dueLte.rows.map((r) => r.id), ["live"]);
const dueShift = runNexusQuery('LIST FROM path:Research WHERE due >= date(today) + 1d', shop, null, clock);
assert.deepEqual(dueShift.rows.map((r) => r.id), ["draft"]);
const dueWeek = runNexusQuery('TABLE due FROM path:Research WHERE due > date(today) - 2w', shop, null, clock);
assert.deepEqual(dueWeek.rows.map((r) => r.id), ["draft"]);
const durOffset = runNexusQuery('LIST FROM path:Research WHERE due > date(today) - dur(7d)', shop, null, clock);
assert.deepEqual(durOffset.rows.map((r) => r.id), ["draft"]);
const gluedDate = runNexusQuery('LIST FROM path:Research WHERE due>date(today)-7d', shop, null, clock);
assert.deepEqual(gluedDate.rows.map((r) => r.id), ["draft"]);
const pricey = runNexusQuery('LIST FROM path:Research WHERE price > 10', shop, null, clock);
assert.deepEqual(pricey.rows.map((r) => r.id), ["draft"]);
const cheap = runNexusQuery('LIST FROM path:Research WHERE price<=10', shop, null, clock);
assert.deepEqual(cheap.rows.map((r) => r.id), ["live"]);
const priceEq = runNexusQuery('LIST FROM path:Research WHERE price = 12', shop, null, clock);
assert.deepEqual(priceEq.rows.map((r) => r.id), ["draft"]);
const textOrder = runNexusQuery('LIST FROM path:Research WHERE status > draft', shop, null, clock);
assert.equal(textOrder.error, null);
assert.match(textOrder.fieldNote, /“draft”/);
const badDate = runNexusQuery('LIST FROM path:Research WHERE due > date(nope)', shop, null, clock);
assert.match(badDate.fieldNote, /“nope”/);
const monthOffset = runNexusQuery('LIST FROM path:Research WHERE due > date(today) - 3months', shop, null, clock);
assert.equal(monthOffset.error, null);
assert.deepEqual(monthOffset.rows.map((r) => r.id).sort(), ["draft", "live"]);
const notADate = runNexusQuery('LIST FROM path:Research WHERE status > date(today)', shop, null, clock);
assert.equal(notADate.error, null);
assert.equal(notADate.rows.length, 0);
const recent = runNexusQuery('LIST FROM path:Journal WHERE file.mtime > date(today) - 7d', nodes, null, clock);
assert.deepEqual(recent.rows.map((r) => r.id), ["f"]);
const todayMtime = runNexusQuery('LIST FROM path:Journal WHERE file.mtime >= date(today)', nodes, null, clock);
assert.deepEqual(todayMtime.rows.map((r) => r.id), ["f"]);
const afterToday = runNexusQuery('LIST FROM path:Journal WHERE file.mtime > date(today)', nodes, null, clock);
assert.equal(afterToday.rows.length, 0);
const weekAgo = runNexusQuery('LIST FROM path:Journal WHERE file.mtime >= date(today) - 1w', nodes, null, clock);
assert.deepEqual(weekAgo.rows.map((r) => r.id), ["f"]);
const demoWhere = runNexusQuery('TABLE status FROM path:Research WHERE status = "draft"', demo.nodes);
assert.equal(demoWhere.error, null);
assert.equal(demoWhere.rows.length, 1);
assert.equal(demoWhere.rows[0].path, "Research/Callouts.md");
assert.equal(demoWhere.rows[0].fields[0].value, "draft");

assert.equal(queryNeedsFrontmatter("TABLE status FROM path:Research GROUP BY status"), true);
assert.equal(queryNeedsFrontmatter('TABLE status FROM path:Research WHERE status = "draft"'), true);
assert.equal(queryNeedsFrontmatter("LIST FROM path:Research SORT title"), false);
assert.equal(queryNeedsFrontmatter("TABLE file.size, file.ctime FROM path:Research"), false);
assert.equal(queryNeedsFrontmatter("LIST FROM path:Research SORT file.folder"), false);
assert.equal(queryNeedsFrontmatter("LIST FROM path:Research GROUP BY file.folder"), false);
assert.equal(queryNeedsFrontmatter('LIST FROM path:Research WHERE file.size > 10 AND status = "draft"'), true);
assert.equal(queryNeedsSizeBody('LIST FROM path:Research WHERE file.size > 10 AND status = "draft"'), true);
assert.equal(queryNeedsSizeBody('LIST FROM path:Research WHERE status = "draft" AND contains(file.name, "Call")'), false);
assert.equal(queryNeedsFrontmatter('LIST FROM path:Research WHERE file.size > 10 OR status = "draft"'), true);
assert.equal(queryNeedsSizeBody('LIST FROM path:Research WHERE file.size > 10 OR status = "draft"'), true);
const metaOnly = {
  r: folder("r", "Research"),
  crave: {
    id: "crave",
    path: "Research/Draft Status.md",
    name: "Draft Status.md",
    kind: "note",
    parentId: "r",
    mtime: 1,
    content: "---\nstatus: draft\n---\n# Draft\n",
  },
  nograph: { id: "nograph", path: "Research/No Graph Tag.md", name: "No Graph Tag.md", kind: "note", parentId: "r", mtime: 2 },
  probe: { id: "probe", path: "Research/Writing Probe.md", name: "Writing Probe.md", kind: "note", parentId: "r", mtime: 3 },
  overview: { id: "overview", path: "Research/Graph Overview.md", name: "Graph Overview.md", kind: "note", parentId: "r", mtime: 4 },
  elsewhere: { id: "elsewhere", path: "Journal/Other.md", name: "Other.md", kind: "note", parentId: null, mtime: 5 },
};
resetVaultIndex();
assert.deepEqual(frontmatterHydrateIds("TABLE status FROM path:Research GROUP BY status", metaOnly).sort(), ["nograph", "overview", "probe"]);
assert.deepEqual(frontmatterHydrateIds("LIST FROM path:Research SORT title", metaOnly), []);
assert.deepEqual(
  frontmatterHydrateIds('LIST FROM path:Research WHERE file.size > 10 AND status = "draft"', metaOnly).sort(),
  ["nograph", "overview", "probe"],
);
const thin = runNexusQuery("TABLE status FROM path:Research GROUP BY status", metaOnly);
assert.deepEqual(thin.rows.filter((r) => r.group === "draft").map((r) => r.title), ["Draft Status"]);
assert.equal(thin.rows.some((r) => r.title === "Graph Overview" && r.group === "live"), false);
const disk = {
  ...metaOnly,
  nograph: { ...metaOnly.nograph, content: "---\nstatus: draft\n---\n# No Graph\n" },
  probe: { ...metaOnly.probe, content: "---\nstatus: draft\n---\n# Probe\n" },
  overview: { ...metaOnly.overview, content: "---\nstatus: live\n---\n# Overview\n" },
};
resetVaultIndex();
const full = runNexusQuery("TABLE status FROM path:Research GROUP BY status", disk);
assert.deepEqual(
  full.rows.filter((r) => r.group === "draft").map((r) => r.title),
  ["Draft Status", "No Graph Tag", "Writing Probe"],
);
assert.deepEqual(
  full.rows.filter((r) => r.group === "live").map((r) => r.title),
  ["Graph Overview"],
);
const drafted = runNexusQuery('LIST FROM path:Research WHERE status = "draft"', disk);
assert.deepEqual(drafted.rows.map((r) => r.title), ["Draft Status", "No Graph Tag", "Writing Probe"]);
assert.deepEqual(frontmatterHydrateIds("TABLE status FROM path:Research GROUP BY status", disk), []);

assert.equal(queryNeedsSizeBody("TABLE file.size, file.ctime FROM path:Research"), true);
assert.equal(queryNeedsSizeBody("LIST FROM path:Research WHERE file.size > 10"), true);
assert.equal(queryNeedsSizeBody("LIST FROM path:Research SORT file.size desc"), true);
assert.equal(queryNeedsSizeBody("LIST FROM path:Research GROUP BY file.size"), true);
assert.equal(queryNeedsSizeBody("TABLE status FROM path:Research GROUP BY status"), false);
assert.equal(queryNeedsSizeBody("LIST FROM path:Research SORT title"), false);
assert.equal(queryNeedsFrontmatter("TABLE file.size FROM path:Research"), false);
assert.equal(queryNeedsFrontmatter('TABLE choice(status = "draft", "yes", "no") FROM path:Research'), true);
assert.equal(queryNeedsFrontmatter('TABLE choice(contains(file.name, "Graph"), "hit", "miss") FROM path:Research'), false);
assert.equal(queryNeedsSizeBody('TABLE choice(file.size > 10, "big", "small") FROM path:Research'), true);
assert.equal(queryNeedsSizeBody('TABLE choice(status = "draft", "yes", file.size) FROM path:Research'), true);
assert.equal(queryNeedsFrontmatter('TABLE choice(file.size > 10, "big", "small") FROM path:Research'), false);
const coldSize = {
  rs: folder("rs", "SizeResearch"),
  md: { id: "md", path: "SizeResearch/Callouts.md", name: "Callouts.md", kind: "note", parentId: "rs", mtime: 1, ctime: Date.UTC(2026, 9, 1, 8, 0) },
  cv: { id: "cv", path: "SizeResearch/Untitled.canvas", name: "Untitled.canvas", kind: "note", parentId: "rs", mtime: 2, size: 33 },
  loaded: { ...note("loaded", "SizeResearch/Loaded.md", "abcdef"), parentId: "rs", mtime: 3 },
};
resetVaultIndex();
assert.deepEqual(sizeHydrateIds("TABLE file.size, file.ctime FROM path:SizeResearch", coldSize), ["md"]);
assert.deepEqual(sizeHydrateIds("LIST FROM path:SizeResearch SORT title", coldSize), []);
assert.deepEqual(
  sizeHydrateIds('LIST FROM path:SizeResearch WHERE status = "draft" AND file.size > 10', coldSize),
  ["md"],
);
const coldTable = runNexusQuery("TABLE file.size, file.ctime FROM path:SizeResearch", coldSize);
assert.equal(coldTable.rows.find((r) => r.id === "md").fields.map((f) => f.value).join("|"), "—|2026-10-01 08:00");
assert.equal(coldTable.rows.find((r) => r.id === "cv").fields[0].value, "33");
assert.equal(coldTable.rows.find((r) => r.id === "loaded").fields[0].value, "6");
const warmed = { ...coldSize, md: { ...coldSize.md, content: "hello" } };
resetVaultIndex();
const warmedSort = runNexusQuery("TABLE file.size FROM path:SizeResearch SORT file.size desc", warmed);
assert.deepEqual(warmedSort.rows.map((r) => [r.id, r.fields[0].value]), [
  ["cv", "33"],
  ["loaded", "6"],
  ["md", "5"],
]);
const warmedWhere = runNexusQuery("LIST FROM path:SizeResearch WHERE file.size > 5", warmed);
assert.deepEqual(warmedWhere.rows.map((r) => r.id).sort(), ["cv", "loaded"]);
assert.deepEqual(sizeHydrateIds("TABLE file.size FROM path:SizeResearch", warmed), []);

console.log("nexus-query: PASS");
