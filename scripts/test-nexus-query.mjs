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
assert.match(runNexusQuery("LIST FROM #a WHERE date(today)", nodes).error, /WHERE filters a tag or a field/);
assert.doesNotMatch(runNexusQuery("LIST FROM #a WHERE date(today)", nodes).error, /not Dataview/);
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
assert.match(noteList.content, /no joins/);
assert.match(noteList.content, /A TABLE formula is one/);
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
const lib = readFileSync("src/lib/vault/nexus-query.ts", "utf8");
assert.match(lib, /Not Dataview/);
assert.match(lib, /no joins/);
assert.match(lib, /A TABLE formula is one/);
assert.doesNotMatch(lib, /no formulas/);
assert.doesNotMatch(lib, /no date\(\)/);
assert.doesNotMatch(lib, /no contains\(\)/);
assert.match(noteList.content, /contains\(file\.name, "Graph"\)/);
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
assert.match(runNexusQuery('LIST FROM path:Research WHERE choice(status, "a")', shop).error, /not Dataview/);
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
const mtimeContains = runNexusQuery('LIST FROM path:Journal WHERE contains(file.mtime, "2026-10-01")', nodes);
assert.deepEqual(mtimeContains.rows.map((r) => r.id), ["f"]);
const commaNeedle = runNexusQuery('LIST FROM path:Research WHERE contains(file.name, "a, b")', shop);
assert.equal(commaNeedle.error, null);
assert.equal(commaNeedle.rows.length, 0);
assert.match(runNexusQuery('LIST FROM path:Research WHERE contains(status)', shop).error, /contains\(\) needs a field and text/);
assert.match(runNexusQuery('LIST FROM path:Research WHERE contains(status, "")', shop).error, /text to look for/);
assert.match(runNexusQuery('LIST FROM path:Research WHERE contains(file.link, "a")', shop).error, /does not read/);
assert.match(runNexusQuery('LIST FROM path:Research WHERE status = "draft" AND contains(status, "dra")', shop).error, /Only one WHERE/);
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
assert.match(runNexusQuery("TABLE price * 2 * 3 FROM path:Research", shop).error, /one \+ - \* \//);
assert.match(runNexusQuery("LIST price * 2 FROM path:Research", shop).error, /Columns belong on TABLE/);
assert.match(runNexusQuery("TABLE price * 2, price * 2 FROM path:Research", shop).error, /already a column/);
assert.match(runNexusQuery("TABLE price * FROM path:Research", shop).error, /one \+ - \* \//);
const demoFormula = runNexusQuery('TABLE file.name + " note" FROM path:Research WHERE contains(file.name, "Graph")', demo.nodes);
assert.equal(demoFormula.error, null);
assert.equal(demoFormula.rows.length, 1);
assert.equal(demoFormula.rows[0].fields[0].value, "Graph View note");
assert.match(runNexusQuery('LIST FROM path:Research WHERE date(today)', shop).error, /WHERE filters a tag or a field/);
assert.doesNotMatch(runNexusQuery('LIST FROM path:Research WHERE date(today)', shop).error, /not Dataview/);
assert.match(runNexusQuery('LIST FROM path:Research WHERE file.mtime = "soon"', shop).error, /compares a date/);
assert.match(runNexusQuery('LIST FROM path:Research WHERE file.tags = "graph"', shop).error, /is a column/);
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
assert.match(textOrder.error, /date or a number/);
const badDate = runNexusQuery('LIST FROM path:Research WHERE due > date(nope)', shop, null, clock);
assert.match(badDate.error, /date\(\) takes today/);
const badOffset = runNexusQuery('LIST FROM path:Research WHERE due > date(today) - 3months', shop, null, clock);
assert.match(badOffset.error, /7d or 2w/);
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

console.log("nexus-query: PASS");
