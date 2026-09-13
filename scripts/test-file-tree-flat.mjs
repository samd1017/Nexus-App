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
import { flattenVisibleTree, TREE_FLAT_CAP } from "./src/lib/vault/file-tree-flat.ts";

assert.equal(TREE_FLAT_CAP, 2400);

const nodes = {};
const rootIds = ["folder"];
nodes.folder = { id: "folder", path: "Notes", name: "Notes", kind: "folder", parentId: null, mtime: 1 };
for (let i = 0; i < 5000; i++) {
  const id = "n" + i;
  nodes[id] = {
    id,
    path: "Notes/Note-" + i + ".md",
    name: "Note-" + i + ".md",
    kind: "note",
    parentId: "folder",
    mtime: 1,
  };
}
const rows = flattenVisibleTree(rootIds, nodes, ["folder"]);
assert.ok(rows.length <= TREE_FLAT_CAP, "flatten must cap at " + TREE_FLAT_CAP + " got " + rows.length);
assert.equal(rows[0].id, "folder");
assert.ok(rows.length === TREE_FLAT_CAP);
console.log("file-tree-flat: PASS cap=" + rows.length);
`,
  ],
  { cwd: process.cwd(), encoding: "utf8", timeout: 30_000 },
);
if (r.stdout) process.stdout.write(r.stdout);
if (r.stderr) process.stderr.write(r.stderr);
if (r.status !== 0) process.exit(r.status ?? 1);
