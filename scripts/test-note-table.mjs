/**
 * Built-in note table: frontmatter columns, sort, filter. Not Obsidian Bases.
 */
import assert from "node:assert/strict";

if (!process.env.NEXUS_TSX) {
  const { spawnSync } = await import("node:child_process");
  const r = spawnSync("npx", ["--yes", "tsx", "scripts/test-note-table.mjs"], {
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
  buildNoteTable,
  evalNoteFormula,
  filterNoteRows,
  basesPropertiesReading,
  filterRowsByRelation,
  parseBasesSession,
  rankLinkChoices,
  relationTargets,
  resolveNoteLink,
  serializeNoteTableFile,
  sortNoteRows,
  withNoteRelation,
  NOTE_TABLE_FILE,
} = await import("../src/lib/vault/note-table.ts");

const notes = [
  {
    id: "a",
    path: "Projects/Alpha.md",
    name: "Alpha.md",
    content: "---\nstatus: draft\ntags: writing\n---\n\n# Alpha\n",
  },
  {
    id: "b",
    path: "Journal/Beta.md",
    name: "Beta.md",
    content: "---\nstatus: live\n---\n\nBeta body\n",
  },
  {
    id: "c",
    path: "Projects/Board.canvas",
    name: "Board.canvas",
    content: "{}\n",
  },
  {
    id: "d",
    path: "Loose.md",
    name: "Loose.md",
    content: "No properties here.\n",
  },
];

const all = buildNoteTable(notes);
assert.equal(all.rows.length, 3);
assert.ok(!all.rows.some((row) => row.path.endsWith(".canvas")));
assert.deepEqual(all.keys, ["status", "tags"]);
assert.equal(all.rows.find((row) => row.id === "a")?.folder, "Projects");
assert.equal(all.rows.find((row) => row.id === "a")?.name, "Alpha");
assert.equal(all.rows.find((row) => row.id === "a")?.props.status, "draft");
assert.equal(all.rows.find((row) => row.id === "d")?.folder, "");

const projects = buildNoteTable(notes, "Projects");
assert.deepEqual(projects.rows.map((row) => row.id), ["a"]);

const writing = filterNoteRows(all.rows, "writing");
assert.deepEqual(writing.map((row) => row.id), ["a"]);
const titled = filterNoteRows(all.rows, "beta");
assert.deepEqual(titled.map((row) => row.id), ["b"]);

const byStatus = sortNoteRows(all.rows, "status", "asc");
assert.deepEqual(byStatus.map((row) => row.id), ["a", "b", "d"]);
const byNameDesc = sortNoteRows(all.rows, "name", "desc");
assert.equal(byNameDesc[0].name, "Loose");

const alpha = {
  name: "Alpha",
  path: "Projects/Alpha.md",
  folder: "Projects",
  mtime: Date.UTC(2026, 9, 1, 15, 30),
  props: { status: "draft" },
};
const blank = { ...alpha, name: "Blank", props: {} };
assert.equal(evalNoteFormula(alpha, "file.mtime").value, "2026-10-01 15:30");
assert.equal(evalNoteFormula(alpha, "file.name").value, "Alpha");
assert.equal(evalNoteFormula(alpha, 'status & " · " & file.folder').value, "draft · Projects");
assert.equal(evalNoteFormula(alpha, 'if(status, status, "—")').value, "draft");
assert.equal(evalNoteFormula(blank, 'if(status, status, "—")').value, "—");
assert.equal(evalNoteFormula(blank, "if(empty(status), \"none\", status)").value, "none");
assert.ok(evalNoteFormula(alpha, "file.mtime + 1").error);
assert.equal(evalNoteFormula(alpha, "file.mtime + 1").value, "");
const withFormula = buildNoteTable(
  [{ id: "a", path: "Projects/Alpha.md", name: "Alpha.md", content: "---\nstatus: draft\n---\n", mtime: Date.UTC(2026, 9, 1, 15, 30) }],
  "",
  "file.mtime",
);
assert.equal(withFormula.formulaError, null);
assert.equal(withFormula.rows[0].formula, "2026-10-01 15:30");
const session = parseBasesSession(null);
assert.equal(session.views.length, 2);
assert.equal(session.views[0].name, "All notes");
assert.equal(session.views[0].formula, "file.mtime");
assert.equal(session.views[1].id, "saved");
const restored = parseBasesSession(JSON.stringify({
  activeId: "saved",
  views: [
    { id: "all", name: "All notes", query: "", folder: "", column: "name", dir: "asc", formula: "file.mtime" },
    { id: "saved", name: "Saved view", query: "draft", folder: "Projects", column: "formula", dir: "desc", formula: "file.name" },
  ],
}));
assert.equal(restored.activeId, "saved");
assert.equal(restored.views[1].folder, "Projects");
assert.equal(restored.views[1].formula, "file.name");
const legacy = parseBasesSession(JSON.stringify({ query: "Welcome", folder: "Journal", column: "name", dir: "asc" }));
assert.equal(legacy.views[0].query, "Welcome");
assert.equal(legacy.views[0].folder, "Journal");

const catalog = [
  { id: "b", path: "Projects/Beta.md", name: "Beta.md" },
  { id: "g", path: "Journal/Gamma.md", name: "Gamma.md" },
];
assert.deepEqual(relationTargets("[[Beta]]"), ["Beta"]);
assert.deepEqual(relationTargets("[[Journal/Gamma|G]] and [[Beta]]"), ["Journal/Gamma", "Beta"]);
assert.deepEqual(relationTargets("Projects/Beta.md"), ["Projects/Beta"]);
assert.deepEqual(relationTargets("draft"), []);
assert.equal(resolveNoteLink("Beta", catalog).id, "b");
assert.equal(resolveNoteLink("Journal/Gamma", catalog).title, "Gamma");
assert.equal(resolveNoteLink("Missing", catalog).id, null);
const related = buildNoteTable([
  {
    id: "a",
    path: "Projects/Alpha.md",
    name: "Alpha.md",
    content: "---\nrelated: \"[[Beta]]\"\nstatus: draft\n---\n\n# Alpha\n",
  },
  { id: "b", path: "Projects/Beta.md", name: "Beta.md", content: "# Beta\n" },
]);
assert.equal(related.rows.find((row) => row.id === "a")?.links.related?.[0]?.id, "b");
assert.equal(related.rows.find((row) => row.id === "a")?.links.related?.[0]?.title, "Beta");
assert.equal(related.rows.find((row) => row.id === "a")?.links.status, undefined);
const linked = withNoteRelation("# Alpha\n", "related", "Welcome");
assert.match(linked, /related: \[\[Welcome\]\]/);
assert.match(linked, /# Alpha/);
const again = withNoteRelation(linked, "related", "Welcome");
assert.equal(again.match(/\[\[Welcome\]\]/g).length, 1);
const also = withNoteRelation(linked, "related", "Beta");
assert.match(also, /\[\[Welcome\]\]/);
assert.match(also, /\[\[Beta\]\]/);
const onlyWelcome = filterRowsByRelation(related.rows, "Welcome", ["related"]);
assert.equal(onlyWelcome.length, 0);
const onlyBeta = filterRowsByRelation(related.rows, "beta", ["related"]);
assert.deepEqual(onlyBeta.map((row) => row.id), ["a"]);
const nonsense = filterRowsByRelation(related.rows, "ZZZ", ["related"]);
assert.equal(nonsense.length, 0);
const choices = rankLinkChoices(
  [
    { id: "w3", name: "Welcome 3.md", path: "Projects/Welcome 3.md" },
    { id: "w", name: "Welcome.md", path: "Welcome.md" },
    { id: "other", name: "Local-first Vault.md", path: "Projects/Local-first Vault.md" },
    { id: "canvas", name: "Board.canvas", path: "Projects/Board.canvas" },
  ],
  "Welcome",
);
assert.equal(choices[0].id, "w");
assert.equal(choices.some((note) => note.id === "canvas"), false);
assert.equal(basesPropertiesReading(0, true), false);
assert.equal(basesPropertiesReading(4, false), false);
assert.equal(basesPropertiesReading(4, true), true);

const { desktopWriteParent, mkdirTargetForFolder, mkdirTargetForWrite } = await import(
  "../src/lib/vault/desktop-write-path.ts"
);
assert.equal(desktopWriteParent("Projects/Soak-Typed-Link.md"), "Projects");
assert.equal(desktopWriteParent("Projects/Soak-Typed-Link.md/extra"), "Projects");
assert.equal(desktopWriteParent("Welcome.md"), "");
assert.equal(desktopWriteParent(".nexus/note-table.json"), ".nexus");
assert.equal(mkdirTargetForWrite("Projects/Soak-Typed-Link.md", true), null);
assert.equal(mkdirTargetForWrite("Projects/Soak-Typed-Link.md", false), "Projects");
assert.equal(mkdirTargetForWrite("Projects/Soak-Typed-Link.md/extra", false), "Projects");
assert.equal(mkdirTargetForFolder("Projects/Soak-Typed-Link.md", "file"), null);
assert.equal(mkdirTargetForFolder("Projects/Soak-Typed-Link.md", "missing"), null);
assert.equal(mkdirTargetForFolder("Projects", "dir"), null);
assert.equal(mkdirTargetForFolder("Projects", "missing"), "Projects");
for (const target of [
  mkdirTargetForWrite("Projects/Soak-Typed-Link.md", true),
  mkdirTargetForWrite("Projects/Soak-Typed-Link.md", false),
  mkdirTargetForWrite("Projects/Soak-Typed-Link.md/extra", false),
  mkdirTargetForFolder("Projects/Soak-Typed-Link.md", "file"),
]) {
  assert.ok(!target || !target.endsWith(".md"));
}
const file = serializeNoteTableFile({
  activeId: "saved",
  views: [
    { id: "all", name: "All notes", query: "", folder: "", column: "name", dir: "asc", formula: "file.mtime", columns: [] },
    { id: "saved", name: "Saved view", query: "draft", folder: "Projects", column: "status", dir: "asc", formula: "file.name", columns: ["status", "related"], relations: ["related"] },
  ],
});
assert.equal(NOTE_TABLE_FILE, ".nexus/note-table.json");
assert.match(file, /nexus-note-table/);
assert.doesNotMatch(file, /"type":\s*"base"/);
const fromFile = parseBasesSession(file);
assert.equal(fromFile.activeId, "saved");
assert.equal(fromFile.views[1].folder, "Projects");
assert.deepEqual(fromFile.views[1].columns, ["status", "related"]);
assert.deepEqual(fromFile.views[1].relations, ["related"]);
assert.equal(fromFile.views[1].formula, "file.name");

const { readFileSync } = await import("node:fs");
const palette = readFileSync("src/components/search/CommandPalette.tsx", "utf8");
assert.match(palette, /label: "Bases"/);
assert.match(palette, /note table/);
assert.match(palette, /setBasesOpen\(true\)/);
const table = readFileSync("src/components/vault/NoteTable.tsx", "utf8");
assert.match(table, /Not Obsidian Bases/);
assert.match(table, /typed note links/);
assert.match(table, /not an Obsidian \.base file/);
assert.match(table, /bases-add-relation/);
assert.match(table, /bases-relation-filter/);
assert.match(table, /bases-link-note/);
assert.match(table, /ensureNoteBody\(rowId\)/);
assert.match(table, /updateNoteContent\(rowId, next, \{ source: true \}\)/);
assert.match(table, /confirmTopLink/);
assert.match(table, /setBodyEpoch/);
assert.match(table, /min-h-11/);
assert.match(table, /data-active=\{active \? "1" : "0"\}/);
assert.match(table, /basesPropertiesReading/);
assert.match(table, /e\.key === "Enter"/);
assert.doesNotMatch(table, /ids\.length >= 24/);
assert.match(readFileSync("src/lib/vault/tauri-adapter.ts", "utf8"), /mkdirTargetForWrite/);
assert.match(readFileSync("src/lib/vault/tauri-adapter.ts", "utf8"), /destKind === "file"/);
assert.doesNotMatch(table, /no typed relations/);
assert.match(table, /bases-relation/);
assert.match(table, /NOTE_TABLE_FILE|note-table\.json/);
assert.match(table, /data-testid="bases-row"/);
assert.match(table, /data-testid="bases-filter"/);
assert.match(table, /data-testid="bases-sort"/);
assert.match(table, /data-testid="bases-view"/);
assert.match(table, /data-testid="bases-formula"/);
assert.match(table, /data-testid="bases-save-view"/);
assert.match(table, /setActiveNote\(row\.id\)/);
assert.match(readFileSync("src/lib/vault/note-table-file.ts", "utf8"), /NOTE_TABLE_FILE/);
assert.match(readFileSync("src/lib/vault/note-table-file.ts", "utf8"), /could not write/);
const scope = readFileSync("src-tauri/src/vault_scope.rs", "utf8");
assert.match(scope, /p\.join\("\.nexus"\)/);
assert.match(scope, /require_literal_leading_dot/);
assert.doesNotMatch(table, /No formulas, relations, or extra views/);
assert.doesNotMatch(table, /Obsidian Bases formulas/);
assert.doesNotMatch(table, /\.base parity/);
const editor = readFileSync("src/components/editor/EditorPane.tsx", "utf8");
assert.match(editor, /data-testid="bases-open"/);
const workspace = readFileSync("src/components/layout/Workspace.tsx", "utf8");
assert.match(workspace, /NoteTable/);

console.log("note-table: PASS");
