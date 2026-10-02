import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";

const r = spawnSync(
  "npx",
  [
    "--yes",
    "tsx",
    "-e",
    `
import assert from "node:assert/strict";
import { flattenVisibleTree, TREE_FLAT_CAP, TREE_FOLDER_NOTE_WINDOW } from "./src/lib/vault/file-tree-flat.ts";

assert.equal(TREE_FLAT_CAP, 16000);
assert.equal(TREE_FOLDER_NOTE_WINDOW, 2000);

function note(id, parentId) {
  return {
    id,
    path: parentId + "/" + id + ".md",
    name: id + ".md",
    kind: "note",
    parentId,
    mtime: 1,
  };
}
function folder(id, parentId, name) {
  return {
    id,
    path: name,
    name,
    kind: "folder",
    parentId,
    mtime: 1,
  };
}

// A 5000-note folder lists a window plus an honest remainder. It does not
// consume the whole safety cap, and it does not hide the next folder.
{
  const nodes = {};
  nodes.big = folder("big", null, "Big");
  nodes.later = folder("later", null, "Later");
  for (let i = 0; i < 5000; i++) nodes["n" + i] = note("n" + i, "big");
  const rows = flattenVisibleTree(["big", "later"], nodes, ["big"]);
  assert.ok(rows.length < TREE_FLAT_CAP, "window must stay under the safety cap, got " + rows.length);
  assert.equal(rows[0].id, "big");
  assert.equal(rows[1].kind, "note", "children stay under the folder, not after later siblings");
  assert.ok(rows.some((r) => r.id === "later"), "later sibling folder must stay in the tree");
  const laterAt = rows.findIndex((r) => r.id === "later");
  const moreAt = rows.findIndex((r) => r.kind === "more");
  assert.ok(laterAt > moreAt, "later folder follows the remainder row");
  const more = rows.find((r) => r.kind === "more" && r.moreParentId === "big");
  assert.ok(more, "truncated folder needs a remainder row");
  assert.equal(more.hiddenCount, 5000 - TREE_FOLDER_NOTE_WINDOW);
  const notes = rows.filter((r) => r.kind === "note");
  assert.equal(notes.length, TREE_FOLDER_NOTE_WINDOW);
}

// Raising that folder's window reveals the next slice and keeps the sibling.
{
  const nodes = {};
  nodes.big = folder("big", null, "Big");
  nodes.later = folder("later", null, "Later");
  for (let i = 0; i < 5000; i++) nodes["n" + i] = note("n" + i, "big");
  const rows = flattenVisibleTree(["big", "later"], nodes, ["big"], TREE_FLAT_CAP, { big: 4000 });
  const notes = rows.filter((r) => r.kind === "note");
  assert.equal(notes.length, 4000);
  const more = rows.find((r) => r.kind === "more");
  assert.equal(more.hiddenCount, 1000);
  assert.ok(rows.some((r) => r.id === "later"));
}

// Several fat folders, each under the window, all stay complete.
{
  const nodes = {};
  const ids = ["a", "b", "c", "d"];
  for (const id of ids) {
    nodes[id] = folder(id, null, id);
    for (let i = 0; i < 700; i++) nodes[id + "-" + i] = note(id + "-" + i, id);
  }
  const rows = flattenVisibleTree(ids, nodes, ids);
  for (const id of ids) {
    assert.ok(rows.some((r) => r.id === id), "missing folder " + id);
    const notes = rows.filter((r) => r.id.startsWith(id + "-"));
    assert.equal(notes.length, 700, id + " notes " + notes.length);
  }
  assert.equal(rows.some((r) => r.kind === "more"), false);
}

// A tight cap still keeps the later folder. The old walk returned early
// and that folder was gone once the first branch filled 2400 rows.
{
  const nodes = {};
  nodes.big = folder("big", null, "Big");
  nodes.later = folder("later", null, "Later");
  for (let i = 0; i < 5000; i++) nodes["n" + i] = note("n" + i, "big");
  const rows = flattenVisibleTree(["big", "later"], nodes, ["big"], 2400);
  assert.ok(rows.length <= 2400, "explicit cap respected, got " + rows.length);
  assert.ok(rows.some((r) => r.id === "later"), "tight cap must not drop the next folder");
  assert.ok(rows.some((r) => r.kind === "note"), "first folder still shows children");
  const more = rows.find((r) => r.kind === "more");
  assert.ok(more && more.hiddenCount > 0);
}

// An expanded folder with nothing in it offers a place to start.
// A collapsed one does not, and a remainder still wins over the empty row.
{
  const nodes = {};
  nodes.empty = folder("empty", null, "Empty");
  nodes.later = folder("later", null, "Later");
  const collapsed = flattenVisibleTree(["empty", "later"], nodes, []);
  assert.equal(collapsed.some((r) => r.kind === "empty"), false);
  const rows = flattenVisibleTree(["empty", "later"], nodes, ["empty"]);
  const empty = rows.find((r) => r.kind === "empty");
  assert.ok(empty, "expanded empty folder needs an empty row");
  assert.equal(empty.emptyParentId, "empty");
  assert.equal(empty.depth, 1);
  assert.ok(rows.some((r) => r.id === "later"));
  const withRemainder = flattenVisibleTree(["empty"], nodes, ["empty"], TREE_FLAT_CAP, undefined, { empty: 3 });
  assert.equal(withRemainder.some((r) => r.kind === "empty"), false);
  const more = withRemainder.find((r) => r.kind === "more");
  assert.equal(more && more.hiddenCount, 3);
}

console.log("file-tree-flat: PASS cap=" + TREE_FLAT_CAP + " window=" + TREE_FOLDER_NOTE_WINDOW);
`,
  ],
  { cwd: process.cwd(), encoding: "utf8", timeout: 60_000 },
);
if (r.stdout) process.stdout.write(r.stdout);
if (r.stderr) process.stderr.write(r.stderr);
if (r.status !== 0) process.exit(r.status ?? 1);
