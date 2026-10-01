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
assert.match(evalNoteFormula(alpha, "file.mtime + 1").error, /duration like "7d"/);

const NOW = Date.UTC(2026, 9, 1, 12, 0);
const task = {
  name: "Ship formulas",
  path: "Projects/Ship formulas.md",
  folder: "Projects",
  mtime: NOW - 3 * 86_400_000,
  props: { status: "doing", due: "2026-10-08", estimate: "90", priority: "2", tags: "Writing, Work", "due date": "2026-12-25", "start-day": "[[2026-09-28]]", done: "false" },
};
const f = (src, row = task) => evalNoteFormula(row, src, NOW);
const ok = (src, value, row = task) => {
  const out = f(src, row);
  assert.equal(out.error, null, `${src} → ${out.error}`);
  assert.equal(out.value, value, src);
};
const bad = (src, pattern, row = task) => {
  const out = f(src, row);
  assert.equal(out.value, "", src);
  assert.ok(out.error, `${src} should fail`);
  if (pattern) assert.match(out.error, pattern, src);
};
// Text
ok("upper(status)", "DOING");
ok("status.upper()", "DOING");
ok("file.name.lower()", "ship formulas");
ok('trim("  hi  ")', "hi");
ok('replace(file.name, " ", "-")', "Ship-formulas");
ok("length(status)", "5");
ok("status.length", "5");
ok("slice(file.name, 0, 4)", "Ship");
ok('contains(lower(tags), "writing")', "true");
ok('tags.startsWith("Writ")', "true");
ok('file.name.endsWith("x")', "false");
ok('status & " / " & file.ext', "doing / md");
ok('"Due " + due', "Due 2026-10-08");
ok('note["due date"]', "2026-12-25");
ok("note.status", "doing");
// Numbers
ok("estimate / 60", "1.5");
ok("round(number(estimate) / 7, 2)", "12.86");
ok("priority * 3 + 1", "7");
ok("priority + estimate", "92");
ok("-priority", "-2");
ok("estimate % 7", "6");
ok("floor(7.8) & ceil(7.2) & abs(-3)", "783");
ok("min(priority, estimate, 5)", "2");
ok("max(priority, estimate)", "90");
ok("missing * 2", "");
bad("status * 2", /“doing” is not a number/);
bad("estimate / 0", /Division by zero/);
// Comparisons and logic
ok('status == "doing"', "true");
ok('status != "done"', "true");
ok("priority > 1", "true");
ok("priority >= 2 && estimate < 100", "true");
ok("priority > 5 || !done", "true");
ok('if(status == "done", "Done", status.upper())', "DOING");
ok('if(priority >= 2, "high")', "high");
ok('if(priority > 9, "high")', "");
ok("due > today()", "true");
ok('due < "2026-10-09"', "true");
ok("empty(missing)", "true");
ok("!empty(status)", "true");
ok('done == false', "true");
// Dates
ok("today()", "2026-10-01");
ok("now()", "2026-10-01 12:00");
ok("date(due)", "2026-10-08");
ok('date(due).format("MMM D, YYYY")', "Oct 8, 2026");
ok('format(date(due), "dddd [the] D")', "Thursday the 8");
ok('date(due) + "7d"', "2026-10-15");
ok('date(due) + "1M"', "2026-11-08");
ok('date(due) - "2w"', "2026-09-24");
ok('date(due) + "1 year"', "2027-10-08");
ok("date(due) - today()", "7");
ok("today() - date(start-day)", "3");
ok('if(empty(due), "—", date(due) - today())', "7");
ok("year(due) & \"/\" & month(due) & \"/\" & day(due)", "2026/10/8");
ok("file.mtime.relative()", "3 days ago");
ok("date(due).relative()", "in 7 days");
ok("today().relative()", "today");
ok('file.mtime.format("YYYY-MM-DD HH:mm")', "2026-09-28 12:00");
ok("date(missing)", "");
ok("date(missing).format()", "");
bad('date("next week")', /not a date/);
bad('date("2026-02-31")', /not a date/);
bad("date(due) * 2", /Dates cannot use \*/);
bad("today() + today()", /cannot be added/);
// Syntax errors stay honest
bad("upper(", /closing \)/);
bad("frobnicate(status)", /frobnicate\(\) is not a formula function/);
bad("status.frob()", /\.frob\(\) is not a formula function/);
bad("upper(status, 1)", /upper\(\) takes 1 value/);
bad("status.upper(1)", /\.upper\(\) takes no values/);
bad('status = "doing"', /Use == to compare/);
bad("file.size", /file\. needs name, path, folder, ext, mtime/);
bad('date(due) + 7d', /Durations are quoted, like "7d"/);
bad('"open', /end quote/);
bad("status status", /where it does not fit/);
bad("if(status)", /two or three parts/);

const { FORMULA_EXAMPLES, FORMULA_FUNCTIONS, compileNoteFormula } = await import("../src/lib/vault/note-formula.ts");
assert.ok(FORMULA_EXAMPLES.length >= 6);
for (const example of FORMULA_EXAMPLES) {
  assert.equal(compileNoteFormula(example.formula).error, null, example.formula);
}
for (const name of ["if", "empty", "date", "today", "format", "relative", "upper", "lower", "contains", "replace", "round", "number"]) {
  assert.ok(FORMULA_FUNCTIONS.includes(name), name);
}

const formulaNotes = [
  { id: "x", path: "Tasks/Late.md", name: "Late.md", content: "---\ndue: 2026-09-20\nestimate: 30\n---\n", mtime: NOW },
  { id: "y", path: "Tasks/Soon.md", name: "Soon.md", content: "---\ndue: 2026-10-03\nestimate: 120\n---\n", mtime: NOW },
  { id: "z", path: "Tasks/Odd.md", name: "Odd.md", content: "---\ndue: whenever\nestimate: lots\n---\n", mtime: NOW },
  { id: "w", path: "Tasks/None.md", name: "None.md", content: "No due.\n", mtime: NOW },
];
const daysLeft = buildNoteTable(formulaNotes, "", "date(due) - today()", NOW);
assert.equal(daysLeft.formulaParseError, null);
assert.match(daysLeft.formulaError, /Formula failed on 1 note: “whenever” is not a date/);
const byId = Object.fromEntries(daysLeft.rows.map((row) => [row.id, row]));
assert.equal(byId.x.formula, "-11");
assert.equal(byId.y.formula, "2");
assert.equal(byId.w.formula, "");
assert.equal(byId.w.formulaError, null);
assert.equal(byId.z.formula, "");
assert.match(byId.z.formulaError, /not a date/);
assert.deepEqual(
  sortNoteRows(daysLeft.rows, "formula", "asc").filter((row) => row.formula).map((row) => row.id),
  ["x", "y"],
);
const hours = buildNoteTable(formulaNotes, "", "estimate / 60", NOW);
assert.deepEqual(
  sortNoteRows(hours.rows, "formula", "desc").filter((row) => row.formula).map((row) => row.formula),
  ["2", "0.5"],
);
const broken = buildNoteTable(formulaNotes, "", "upper(", NOW);
assert.match(broken.formulaParseError, /closing \)/);
assert.equal(broken.formulaError, broken.formulaParseError);
assert.ok(broken.rows.every((row) => row.formula === "" && row.formulaError === broken.formulaParseError));
const none = buildNoteTable(formulaNotes, "", "", NOW);
assert.equal(none.formulaError, null);
assert.ok(none.rows.every((row) => row.formulaError === null && row.formula === ""));
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
assert.equal(fromFile.views[1].layout, "table");
const cardsSession = parseBasesSession(JSON.stringify({
  activeId: "saved",
  views: [
    { id: "all", layout: "cards" },
    { id: "saved", layout: "cards" },
  ],
}));
assert.equal(cardsSession.views[0].layout, "cards");
assert.equal(cardsSession.views[1].layout, "cards");
assert.match(serializeNoteTableFile(cardsSession), /"layout": "cards"/);
const legacyLayout = parseBasesSession(JSON.stringify({ query: "Welcome", folder: "Journal" }));
assert.equal(legacyLayout.views[0].layout, "table");

const { readFileSync } = await import("node:fs");
const palette = readFileSync("src/components/search/CommandPalette.tsx", "utf8");
assert.match(palette, /label: "Bases"/);
assert.match(palette, /note table/);
assert.match(palette, /setBasesOpen\(true\)/);
const table = readFileSync("src/components/vault/NoteTable.tsx", "utf8");
assert.match(table, /Not Obsidian Bases/);
assert.match(table, /table and cards/);
assert.doesNotMatch(table, /no cards view/);
assert.match(table, /bases-layout-cards/);
assert.match(table, /data-testid="bases-card"/);
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
assert.doesNotMatch(table, /no full formula language/);
assert.match(table, /one formula column per view/);
assert.match(table, /data-testid="bases-formula-error"/);
assert.match(table, /data-testid="bases-formula-parse-error"/);
assert.match(table, /data-testid="bases-formula-example"/);
assert.match(table, /data-formula-error=\{row\.formulaError/);
assert.doesNotMatch(table, /\.base parity/);
const editor = readFileSync("src/components/editor/EditorPane.tsx", "utf8");
assert.match(editor, /data-testid="bases-open"/);
const workspace = readFileSync("src/components/layout/Workspace.tsx", "utf8");
assert.match(workspace, /NoteTable/);

console.log("note-table: PASS");
