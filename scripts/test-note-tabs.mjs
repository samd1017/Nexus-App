/**
 * Open-note tabs: replace, new, close, reorder, cycle, and the chords that drive them.
 */
import assert from "node:assert/strict";

if (!process.env.NEXUS_TSX) {
  const { spawnSync } = await import("node:child_process");
  const r = spawnSync("npx", ["--yes", "tsx", "scripts/test-note-tabs.mjs"], {
    cwd: process.cwd(),
    encoding: "utf8",
    timeout: 30_000,
    env: { ...process.env, NEXUS_TSX: "1" },
  });
  if (r.stdout) process.stdout.write(r.stdout);
  if (r.stderr) process.stderr.write(r.stderr);
  process.exit(r.status ?? 1);
}

const {
  openNoteTab,
  closeNoteTab,
  reorderNoteTabs,
  cycleNoteTab,
  noteOpenGesture,
  settlePaneTabs,
} = await import("../src/lib/vault/note-tabs.ts");
const { rememberPaneScroll, recallPaneScroll, clearPaneScroll } = await import(
  "../src/lib/editor/pane-scroll.ts"
);

const replaced = openNoteTab(["a"], "a", "b", "replace");
assert.deepEqual(replaced, { tabs: ["b"], activeId: "b" });

const added = openNoteTab(["a"], "a", "b", "new");
assert.deepEqual(added, { tabs: ["a", "b"], activeId: "b" });

const list = ["a", "b"];
const again = openNoteTab(list, "b", "a", "new");
assert.deepEqual(again, { tabs: ["a", "b"], activeId: "a" });
assert.equal(again.tabs, list);

const first = openNoteTab([], null, "a", "replace");
assert.deepEqual(first, { tabs: ["a"], activeId: "a" });

const mid = closeNoteTab(["a", "b", "c"], "b", "b");
assert.deepEqual(mid, { tabs: ["a", "c"], activeId: "c" });

const end = closeNoteTab(["a", "b", "c"], "c", "c");
assert.deepEqual(end, { tabs: ["a", "b"], activeId: "b" });

const only = closeNoteTab(["a"], "a", "a");
assert.deepEqual(only, { tabs: [], activeId: null });

const other = closeNoteTab(["a", "b", "c"], "a", "c");
assert.deepEqual(other, { tabs: ["a", "b"], activeId: "a" });

assert.deepEqual(reorderNoteTabs(["a", "b", "c"], "c", "a"), ["c", "a", "b"]);
assert.deepEqual(reorderNoteTabs(["a", "b", "c"], "a", "c"), ["b", "c", "a"]);
assert.deepEqual(reorderNoteTabs(["a", "b"], "a", "a"), ["a", "b"]);

assert.equal(cycleNoteTab(["a", "b", "c"], "c", 1), "a");
assert.equal(cycleNoteTab(["a", "b", "c"], "a", -1), "c");
assert.equal(cycleNoteTab(["a"], "a", 1), "a");
assert.equal(cycleNoteTab([], null, 1), null);

assert.equal(noteOpenGesture({ altKey: true }, { mac: false }), "secondary");
assert.equal(noteOpenGesture({ metaKey: true, shiftKey: true }, { mac: true }), "secondary");
assert.equal(noteOpenGesture({ button: 1 }, { mac: true }), "new");
assert.equal(noteOpenGesture({ metaKey: true }, { mac: true }), "new");
assert.equal(noteOpenGesture({ ctrlKey: true }, { mac: true }), "replace");
assert.equal(noteOpenGesture({ ctrlKey: true }, { mac: false }), "new");
assert.equal(noteOpenGesture({}, { mac: false }), "replace");

const notes = new Set(["a", "b", "c"]);
const alive = (id) => notes.has(id);
const replacedActive = settlePaneTabs({
  prevTabs: ["a"],
  prevActive: "a",
  nextTabs: ["a"],
  nextActive: "b",
  tabsTouched: false,
  alive,
});
assert.deepEqual(replacedActive, { tabs: ["b"], activeId: "b" });

const stayed = settlePaneTabs({
  prevTabs: ["a", "b"],
  prevActive: "a",
  nextTabs: ["a", "b"],
  nextActive: "b",
  tabsTouched: false,
  alive,
});
assert.deepEqual(stayed, { tabs: ["a", "b"], activeId: "b" });

const closedOne = settlePaneTabs({
  prevTabs: ["a", "b"],
  prevActive: "a",
  nextTabs: ["a", "b"],
  nextActive: null,
  tabsTouched: false,
  alive,
});
assert.deepEqual(closedOne, { tabs: ["b"], activeId: "b" });

const explicitEmpty = settlePaneTabs({
  prevTabs: ["a", "b"],
  prevActive: "a",
  nextTabs: [],
  nextActive: null,
  tabsTouched: true,
  alive,
});
assert.deepEqual(explicitEmpty, { tabs: [], activeId: null });

const inflight = settlePaneTabs({
  prevTabs: [],
  prevActive: null,
  nextTabs: [],
  nextActive: "shell-id",
  tabsTouched: false,
  alive: () => false,
});
assert.deepEqual(inflight, { tabs: ["shell-id"], activeId: "shell-id" });

const dropped = settlePaneTabs({
  prevTabs: ["gone", "b"],
  prevActive: "b",
  nextTabs: ["gone", "b"],
  nextActive: "b",
  tabsTouched: false,
  alive: (id) => id === "b",
});
assert.deepEqual(dropped, { tabs: ["b"], activeId: "b" });

clearPaneScroll();
rememberPaneScroll("primary", "a", 240);
assert.equal(recallPaneScroll("primary", "a"), 240);
assert.equal(recallPaneScroll("primary", "b"), 0);
rememberPaneScroll("secondary", "a", 12);
assert.equal(recallPaneScroll("secondary", "a"), 12);
assert.equal(recallPaneScroll("primary", "a"), 240);

const { readFileSync } = await import("node:fs");
const tree = readFileSync("src/components/vault/FileTree.tsx", "utf8");
assert.match(tree, /noteOpenGesture/);
assert.match(tree, /newTab: gesture === "new"/);
assert.match(tree, /onAuxClick/);
assert.match(tree, /openListedNote/);

const keys = readFileSync("src/components/chrome/KeyboardShortcuts.tsx", "utf8");
assert.match(keys, /cycleNoteTab/);
assert.match(keys, /e\.key === "Tab"/);
assert.match(keys, /PageDown/);
assert.match(keys, /PageUp/);
assert.match(keys, /preventDefault\(\)/);
assert.match(keys, /focusEditorPane/);

const bar = readFileSync("src/components/editor/NoteTabBar.tsx", "utf8");
assert.match(bar, /role="tablist"/);
assert.match(bar, /data-testid="note-tab"/);
assert.match(bar, /data-testid="note-tab-close"/);
assert.match(bar, /aria-selected/);
assert.match(bar, /reorderNoteTabs/);

const pane = readFileSync("src/components/editor/EditorPane.tsx", "utf8");
assert.match(pane, /NoteTabBar/);
assert.match(pane, /No file is open/);
assert.match(pane, /Open a second note/);
assert.match(pane, /closeNoteTab/);

const store = readFileSync("src/lib/vault/store.ts", "utf8");
assert.match(store, /primaryTabs/);
assert.match(store, /secondaryTabs/);
assert.match(store, /closeNoteTab:/);
assert.match(store, /evictBodiesKeeping/);

const persist = readFileSync("src/lib/vault/persist-policy.ts", "utf8");
assert.equal(persist.includes("primaryTabs"), false);

const wiki = readFileSync("src/lib/markdown/wikilink-extension.ts", "utf8");
assert.match(wiki, /auxclick/);

const visual = readFileSync("src/components/editor/VisualEditor.tsx", "utf8");
assert.match(visual, /rememberPaneScroll/);
assert.match(visual, /newTab: gesture === "new"/);

console.log("note-tabs: PASS");
