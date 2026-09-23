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
  dropShellIds,
  isShellBusyMessage,
  mergeShellRows,
  nodesFromShellRows,
  shellBusyBudgetMs,
  shellBusyDelayMs,
  shellSessionFromMount,
} from "./src/lib/vault/shell-catalog.ts";
import { unlinkedFromHeads } from "./src/lib/vault/unlinked-mentions.ts";
import { graphFromShellLevel, pinFolderLayout } from "./src/lib/graph/shell-graph.ts";
import {
  BROWSER_BODY_TOKEN_BUDGET,
  BROWSER_HEAD_CHARS,
  BROWSER_POSTING_CAP,
  browserRecord,
  backlinksFromEdges,
  catalogTokens,
  catalogPathsToDrop,
  egoFromEdges,
  folderPollDelta,
  harvestNoteCatalog,
  noteIdentityNorms,
  noteNeedsBodyPass,
  pageChildRows,
  pageRecentRows,
  pageSearchHits,
  pageSuggestRows,
  tagCountsFromPairs,
  tagNoteIds,
  windowNoteCount,
} from "./src/lib/vault/browser-shell.ts";
import { pathsFromObserverRecords } from "./src/lib/vault/watcher.ts";
import { CHROME_FSA_NOTE_CAP, CHROME_FSA_NOTE_WARN } from "./src/lib/vault/chrome-fsa-cap.ts";

assert.equal(SHELL_FULL_MAX_NOTES, 399);
assert.equal(SHELL_CHILD_PAGE, 200);
const busyBudget = shellBusyBudgetMs();
assert.ok(busyBudget < 500, "gesture retry budget " + busyBudget + "ms");
assert.ok(busyBudget >= 156);
assert.equal(shellBusyDelayMs(0), 16);
const mentions = unlinkedFromHeads("Zephyr", [
  { fromId: "self", fromPath: "Self.md", fromTitle: "Self", body: "plain Zephyr here" },
  { fromId: "linked", fromPath: "Linked.md", fromTitle: "Linked", body: "see [[Zephyr]] only" },
  { fromId: "other", fromPath: "Other.md", fromTitle: "Other", body: "a Zephyr mention" },
], "self");
assert.equal(mentions.length, 1);
assert.equal(mentions[0].fromId, "other");

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
const again = mergeShellRows(merged.nodes, merged.rootIds, [{
  id: "n0",
  path: "n0.md",
  name: "n0.md",
  kind: "note",
  parentId: null,
  mtime: 1,
}]);
assert.equal(again.nodes, merged.nodes, "unchanged catalog page keeps node identity");
assert.equal(again.nodes.n0, merged.nodes.n0);
const pinned = pinFolderLayout([
  { id: "f", kind: "folder" },
  { id: "n", kind: "note" },
]);
assert.equal(pinned.length, 2);
assert.equal(pinned[0].fx, pinned[0].x);
assert.equal(pinned[1].fy, pinned[1].y);
assert.ok(Number.isFinite(pinned[0].z));

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

for (const size of [200, 1000, 5000]) {
  const pageLen = Math.min(size, SHELL_CHILD_PAGE);
  const grown = Array.from({ length: pageLen }, (_, i) => ({
    id: "p" + i,
    path: "Pile/n" + i + ".md",
    name: "n" + i + ".md",
    kind: "note",
    parentId: "pile",
    mtime: 1,
  }));
  const held = nodesFromShellRows([
    { id: "pile", path: "Pile", name: "Pile", kind: "folder", parentId: null, mtime: 1 },
    ...grown,
  ]);
  const notes = Object.values(held.nodes).filter((n) => n.kind === "note");
  assert.equal(notes.length, pageLen);
  assert.ok(notes.length <= SHELL_CHILD_PAGE);
  assert.ok(notes.length < size || size <= SHELL_CHILD_PAGE);
  assert.ok(Object.keys(held.nodes).length < size || size <= SHELL_CHILD_PAGE + 1);
}

const gone = dropShellIds(built.nodes, built.rootIds, ["n3"]);
assert.equal(gone.dropped.length, 1);
assert.equal(Object.keys(gone.nodes).length, 9);
assert.ok(!gone.nodes.n3);

const nested = nodesFromShellRows([
  { id: "dir", path: "Dir", name: "Dir", kind: "folder", parentId: null, mtime: 1 },
  { id: "child", path: "Dir/a.md", name: "a.md", kind: "note", parentId: "dir", mtime: 1 },
]);
const droppedDir = dropShellIds(nested.nodes, nested.rootIds, ["dir"]);
assert.equal(Object.keys(droppedDir.nodes).length, 0);

assert.equal(isShellBusyMessage("shell_busy"), true);
assert.equal(isShellBusyMessage("database is locked"), true);
assert.equal(isShellBusyMessage("no such table"), false);
assert.ok(shellBusyDelayMs(0) > 0);
assert.ok(shellBusyDelayMs(2) > shellBusyDelayMs(0));

for (const size of [200, 1000, 5000]) {
  const pile = browserRecord("Pile", "Pile", "folder", 1);
  const notes = Array.from({ length: size }, (_, i) =>
    browserRecord("Pile/n" + String(i).padStart(4, "0") + ".md", "n" + i + ".md", "note", i + 1),
  );
  const page = pageChildRows([pile, ...notes], "Pile", 0, SHELL_CHILD_PAGE);
  assert.ok(page.rows.length <= SHELL_CHILD_PAGE);
  assert.equal(page.noteTotal, size);
  assert.equal(windowNoteCount(page.rows), Math.min(size, SHELL_CHILD_PAGE));
  assert.ok(windowNoteCount(page.rows) < size || size <= SHELL_CHILD_PAGE);
  const center = notes[0];
  const norms = noteIdentityNorms(center);
  const edges = notes.slice(1).map((note) => ({ sourceId: note.id, targetNorm: norms[0] }));
  const back = backlinksFromEdges(center.id, norms, edges, notes, 80);
  assert.ok(back.rows.length <= 80);
  assert.equal(back.total, size - 1);
  assert.ok(back.rows.length < size || size <= 80);
  const ego = egoFromEdges(center.id, edges, [pile, ...notes], 2, 400, 48);
  assert.ok(ego.rows.length > 1);
  assert.ok(ego.rows.length <= 400);
  assert.ok(ego.rows.length < size || size <= 400);
  const tags = tagCountsFromPairs(notes.map(() => ({ tag: "orbit" })), 48);
  assert.equal(tags[0].tag, "orbit");
  assert.equal(tags[0].count, size);
  assert.ok(tags.length <= 48);
  const tagged = tagNoteIds(
    notes.map((note) => ({ tag: "orbit", noteId: note.id, mtime: note.mtime })),
    "orbit",
    80,
  );
  assert.equal(tagged.length, Math.min(80, size));
  const postings = notes.slice(-3).map((note) => ({ token: "zephyr", noteId: note.id }));
  const hits = pageSearchHits(postings, notes, "zephyr", 40);
  assert.equal(hits.length, 3);
  if (size > SHELL_CHILD_PAGE) {
    const windowIds = new Set(page.rows.map((row) => row.id));
    assert.ok(hits.every((hit) => !windowIds.has(hit.id)));
  }
  const held = nodesFromShellRows(page.rows);
  const gone = dropShellIds(held.nodes, held.rootIds, [page.rows[0].id]);
  assert.ok(Object.values(gone.nodes).filter((node) => node.kind === "note").length <= SHELL_CHILD_PAGE);
}
const recent = pageRecentRows(
  [1, 9, 3].map((mtime, i) => browserRecord("r" + i + ".md", "r" + i + ".md", "note", mtime)),
  2,
);
assert.equal(recent[0].mtime, 9);
const suggested = pageSuggestRows(
  ["Alpha.md", "Alpine.md", "Beta.md"].map((name) => browserRecord(name, name, "note", 1)),
  "al",
  40,
);
assert.equal(suggested.length, 2);
assert.ok(suggested.every((row) => row.path !== "Beta.md"));
assert.deepEqual(
  catalogPathsToDrop(["Keep.md", "Dir", "Dir/a.md", "Dir/sub/b.md", "Other/a.md"], ["Dir"]).sort(),
  ["Dir", "Dir/a.md", "Dir/sub/b.md"].sort(),
);
assert.deepEqual(
  pathsFromObserverRecords([
    { type: "disappeared", relativePathComponents: ["Dir", "a.md"] },
    { type: "disappeared", relativePathComponents: [".git", "config"] },
    { type: "moved", relativePathMovedFrom: ["Pile", "n0.md"] },
  ]),
  ["Dir/a.md", "Pile/n0.md"],
);
assert.equal(CHROME_FSA_NOTE_WARN, 15000);
assert.equal(CHROME_FSA_NOTE_CAP, 25000);
assert.equal(noteNeedsBodyPass(BROWSER_HEAD_CHARS), false);
assert.equal(noteNeedsBodyPass(BROWSER_HEAD_CHARS + 1), true);
const headWords = Array.from({ length: BROWSER_BODY_TOKEN_BUDGET }, (_, i) => {
  const a = String.fromCharCode(97 + (i % 26));
  const b = String.fromCharCode(97 + Math.floor(i / 26));
  return "tok" + a + b;
});
let head = headWords.join(" ");
head += " ".repeat(Math.max(0, BROWSER_HEAD_CHARS - head.length));
const full = head + "\\nSee [[Tail Note]] about tailtokenzz.\\n";
const harvested = harvestNoteCatalog(
  browserRecord("n.md", "n.md", "note", 1),
  full,
  new Map(),
);
assert.equal(harvested.posts.length, BROWSER_BODY_TOKEN_BUDGET);
assert.ok(harvested.posts.some((post) => post.token === "tailtokenzz"));
assert.ok(harvested.edges.some((edge) => edge.targetNorm === "tail note"));
const commonCounts = new Map();
let commonStored = 0;
for (let i = 0; i < BROWSER_POSTING_CAP + 20; i++) {
  const piece = harvestNoteCatalog(
    browserRecord("c" + i + ".md", "c" + i + ".md", "note", 1),
    "commonterm appears in the opening",
    commonCounts,
  );
  if (piece.posts.some((post) => post.token === "commonterm")) commonStored += 1;
}
assert.equal(commonStored, BROWSER_POSTING_CAP);
assert.equal(commonCounts.get("commonterm"), BROWSER_POSTING_CAP);
const late = harvestNoteCatalog(
  browserRecord("late.md", "late.md", "note", 1),
  "commonterm zephyrquartz",
  commonCounts,
);
assert.ok(!late.posts.some((post) => post.token === "commonterm"));
assert.ok(late.posts.some((post) => post.token === "zephyrquartz"));
assert.deepEqual(catalogTokens("2024 991"), []);
assert.deepEqual(catalogTokens("zxqwv_nexus_deepbody_991"), ["zxqwv_nexus_deepbody_991"]);
const padWords = Array.from({ length: 180 }, (_, i) => {
  const a = String.fromCharCode(97 + (i % 26));
  const b = String.fromCharCode(97 + ((i * 3) % 26));
  const c = String.fromCharCode(97 + ((i * 7) % 26));
  return "pad" + a + b + c;
});
let opening = padWords.slice(0, 30).join(" ");
opening += " ".repeat(Math.max(0, BROWSER_HEAD_CHARS - opening.length));
const deepText = opening + " " + padWords.slice(30).join(" ") + " zxqwv_nexus_deepbody_991";
const deepRow = browserRecord("DeepProbe.md", "DeepProbe.md", "note", 1);
const deepHarvest = harvestNoteCatalog(deepRow, deepText, new Map());
assert.ok(
  deepHarvest.posts.some((post) => post.token === "zxqwv_nexus_deepbody_991"),
  "a rare id past the head must be indexed even when the tail is crowded",
);
const deepHits = pageSearchHits(
  deepHarvest.posts,
  [deepRow],
  "zxqwv_nexus_deepbody_991",
  10,
);
assert.equal(deepHits.length, 1);
assert.equal(deepHits[0].path, "DeepProbe.md");
const firstPoll = folderPollDelta(["a.md"], ["a.md", "b.md", "c.md"], 1);
assert.deepEqual(firstPoll.reported, ["b.md"]);
assert.ok(firstPoll.next.includes("a.md") && firstPoll.next.includes("b.md"));
assert.ok(!firstPoll.next.includes("c.md"));
const secondPoll = folderPollDelta(firstPoll.next, ["a.md", "b.md", "c.md"], 1);
assert.deepEqual(secondPoll.reported, ["c.md"]);
console.log("shell-catalog: PASS");
`,
  ],
  { encoding: "utf8", timeout: 120000 },
);
if (r.stdout) process.stdout.write(r.stdout);
if (r.stderr) process.stderr.write(r.stderr);
if (r.status !== 0) process.exit(r.status ?? 1);
