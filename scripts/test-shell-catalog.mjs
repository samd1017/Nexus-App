/**
 * Shell catalog contract: a large vault contributes a page, not the catalog,
 * to the renderer. The native page query is covered by the Rust tests.
 */
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
import { flattenVisibleTree } from "./src/lib/vault/file-tree-flat.ts";
import {
  SHELL_CHILD_PAGE,
  SHELL_FULL_MAX_NOTES,
  mergeShellRows,
  nodesFromShellRows,
  shellSessionFromMount,
} from "./src/lib/vault/shell-catalog.ts";
import { graphFromShellLevel } from "./src/lib/graph/shell-graph.ts";

assert.equal(SHELL_FULL_MAX_NOTES, 399);
assert.equal(SHELL_CHILD_PAGE, 200);

const page = Array.from({ length: 10 }, (_, i) => ({
  id: "n" + i,
  path: "n" + i + ".md",
  name: "n" + i + ".md",
  kind: "note",
  parentId: null,
  mtime: 1,
}));
const mount = {
  materialize: false,
  pending: false,
  notes: 1000,
  folders: 2,
  rows: page,
  rootIds: page.map((r) => r.id),
  activeNoteId: "n0",
  omittedNotes: 990,
  loaded: [{ parentId: "__root__", loaded: 10, hidden: 990 }],
  dbPath: "index.sqlite",
};
const session = shellSessionFromMount(mount, page.length);
assert.equal(session.shellCatalog, true);
assert.equal(session.catalogNoteCount, 1000);
assert.equal(session.shellUnloaded.__root__, 990);
const built = nodesFromShellRows(mount.rows);
assert.equal(Object.keys(built.nodes).length, 10);
assert.ok(Object.keys(built.nodes).length < session.catalogNoteCount);

const small = shellSessionFromMount({ ...mount, materialize: true, notes: 12, omittedNotes: 0, rows: page.slice(0, 12) }, 12);
assert.equal(small.shellCatalog, false);
assert.equal(small.catalogNoteCount, 12);

const merged = mergeShellRows(built.nodes, built.rootIds, [{
  id: "folder",
  path: "Area",
  name: "Area",
  kind: "folder",
  parentId: null,
  mtime: 1,
}]);
assert.equal(merged.nodes.folder.kind, "folder");
assert.equal(Object.keys(merged.nodes).length, 11);

const flat = flattenVisibleTree(built.rootIds, built.nodes, [], 16000, undefined, session.shellUnloaded);
const more = flat.find((row) => row.kind === "more");
assert.ok(more, "root remainder must stay visible");
assert.equal(more.hiddenCount, 990);
assert.equal(flat.filter((row) => row.kind === "note").length, 10);

const level = graphFromShellLevel({
  parentPath: "Area",
  rows: page.slice(0, 4).map((r) => ({ ...r, kind: "note" })),
  noteTotal: 5000,
  folderTotal: 1,
  omitted: 4997,
}, 5000);
assert.ok(level.nodes.length <= 5);
assert.equal(level.stats.vaultNoteCount, 5000);
assert.equal(level.mode, "folder");
assert.ok(level.nodes.some((n) => n.kind === "aggregate"));
console.log("shell-catalog: PASS");
`,
  ],
  { encoding: "utf8", timeout: 120000 },
);
if (r.stdout) process.stdout.write(r.stdout);
if (r.stderr) process.stderr.write(r.stderr);
if (r.status !== 0) process.exit(r.status ?? 1);
