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
  formulaColumnId,
  formulaKey,
  formulaStatusLine,
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
const col = (id, expr, name = id) => ({ id, name, expr });
const daysLeft = buildNoteTable(formulaNotes, "", [col("days", "date(due) - today()", "Days left")], NOW);
assert.equal(daysLeft.formulaStatus[0].parseError, null);
assert.equal(daysLeft.formulaStatus[0].failed, 1);
assert.match(formulaStatusLine(daysLeft.formulaStatus), /“Days left” failed on 1 note: “whenever” is not a date/);
const byId = Object.fromEntries(daysLeft.rows.map((row) => [row.id, row.formulas.days]));
assert.equal(byId.x.value, "-11");
assert.equal(byId.y.value, "2");
assert.equal(byId.w.value, "");
assert.equal(byId.w.error, null);
assert.equal(byId.z.value, "");
assert.match(byId.z.error, /not a date/);
assert.deepEqual(
  sortNoteRows(daysLeft.rows, "formula:days", "asc").filter((row) => row.formulas.days.value).map((row) => row.id),
  ["x", "y"],
);
const hours = buildNoteTable(formulaNotes, "", [col("hours", "estimate / 60")], NOW);
assert.deepEqual(
  sortNoteRows(hours.rows, "formula:hours", "desc").filter((row) => row.formulas.hours.value).map((row) => row.formulas.hours.value),
  ["2", "0.5"],
);
const broken = buildNoteTable(formulaNotes, "", [col("bad", "upper(")], NOW);
assert.match(broken.formulaStatus[0].parseError, /closing \)/);
assert.equal(formulaStatusLine(broken.formulaStatus), null);
assert.ok(broken.rows.every((row) => row.formulas.bad.value === "" && row.formulas.bad.error === broken.formulaStatus[0].parseError));
const none = buildNoteTable(formulaNotes, "", [col("blank", "")], NOW);
assert.equal(formulaStatusLine(none.formulaStatus), null);
assert.ok(none.rows.every((row) => row.formulas.blank.error === null && row.formulas.blank.value === ""));
assert.deepEqual(buildNoteTable(formulaNotes, "", [], NOW).rows[0].formulas, {});
const withFormula = buildNoteTable(
  [{ id: "a", path: "Projects/Alpha.md", name: "Alpha.md", content: "---\nstatus: draft\n---\n", mtime: Date.UTC(2026, 9, 1, 15, 30) }],
  "",
  [col("formula", "file.mtime")],
);
assert.equal(withFormula.formulaStatus[0].failed, 0);
assert.equal(withFormula.rows[0].formulas.formula.value, "2026-10-01 15:30");

// Several formula columns: each runs per note, later columns read earlier ones.
const multi = buildNoteTable(
  formulaNotes,
  "",
  [
    col("due_on", "date(due)", "Due on"),
    col("days", "formula.due_on - today()", "Days left"),
    col("label", 'if(formula["Days left"] < 0, "late", "ok") & " · " & formula.days', "Label"),
    col("hours", "estimate / 60", "Hours"),
    col("ahead", "formula.later", "Ahead"),
    col("later", "1", "Later"),
    col("self", "formula.self + 1", "Self"),
  ],
  NOW,
);
const m = Object.fromEntries(multi.rows.map((row) => [row.id, row.formulas]));
assert.equal(Object.keys(m.x).length, 7);
assert.equal(m.x.due_on.value, "2026-09-20");
assert.equal(m.x.days.value, "-11");
assert.equal(m.x.label.value, "late · -11");
assert.equal(m.y.label.value, "ok · 2");
assert.equal(m.x.hours.value, "0.5");
assert.equal(m.y.hours.value, "2");
assert.match(m.x.ahead.error, /formula\.later is not a formula column to the left/);
assert.equal(m.x.later.value, "1");
assert.match(m.x.self.error, /formula\.self is not a formula column to the left/);
assert.match(m.z.due_on.error, /not a date/);
assert.match(m.z.days.error, /formula\.due_on has an error/);
assert.match(m.z.label.error, /has an error/);
assert.ok(m.z.hours.error, "estimate “lots” / 60 should fail on its own column");
assert.equal(m.z.later.value, "1");
assert.equal(m.w.days.error, null);
const statusOf = Object.fromEntries(multi.formulaStatus.map((s) => [s.id, s]));
assert.equal(statusOf.due_on.failed, 1);
assert.equal(statusOf.ahead.failed, 4);
assert.equal(statusOf.later.failed, 0);
const line = formulaStatusLine(multi.formulaStatus);
assert.match(line, /“Due on” failed on 1 note/);
assert.match(line, /“Ahead” failed on 4 notes/);
assert.doesNotMatch(line, /“Later”/);
assert.deepEqual(
  sortNoteRows(multi.rows, "formula:hours", "desc").filter((row) => row.formulas.hours.value).map((row) => row.id),
  ["y", "x"],
);
assert.deepEqual(filterNoteRows(multi.rows, "late ·").map((row) => row.id), ["x"]);
assert.ok(buildNoteTable(formulaNotes, "", Array.from({ length: 12 }, (_, i) => col(`c${i}`, "1")), NOW).formulaStatus.length === 8);
assert.match(evalNoteFormula(task, "formula.").error ?? "", /formula\. needs a column name/);
assert.match(evalNoteFormula(task, "formula[days]").error ?? "", /quoted column name/);

assert.equal(formulaKey("Days left", []), "days_left");
assert.equal(formulaKey("Days left", ["days_left"]), "days_left_2");
assert.equal(formulaKey("2nd pass", []), "f_2nd_pass");
assert.equal(formulaKey("  ", []), "formula");
assert.equal(formulaKey("Formula", ["FORMULA"]), "formula_2");
assert.equal(formulaColumnId("days"), "formula:days");

const session = parseBasesSession(null);
assert.equal(session.views.length, 2);
assert.equal(session.views[0].name, "All notes");
assert.deepEqual(session.views[0].formulas, [{ id: "formula", name: "Formula", expr: "file.mtime" }]);
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
assert.deepEqual(restored.views[1].formulas, [{ id: "formula", name: "Formula", expr: "file.name" }]);
assert.equal(restored.views[1].column, "formula:formula");
const emptyLegacy = parseBasesSession(JSON.stringify({ activeId: "all", views: [{ id: "all", formula: "", column: "formula" }] }));
assert.deepEqual(emptyLegacy.views[0].formulas, []);
assert.equal(emptyLegacy.views[0].column, "name");
const messy = parseBasesSession(JSON.stringify({
  activeId: "all",
  views: [{
    id: "all",
    column: "formula:gone",
    formulas: [
      { id: "days", name: "Days", expr: "1" },
      { id: "days", name: "Days again", expr: "2" },
      { id: "Bad Id!", name: "  ", expr: 3 },
      "junk",
      ...Array.from({ length: 10 }, (_, i) => ({ id: `x${i}`, name: `X${i}`, expr: "1" })),
    ],
  }],
}));
assert.equal(messy.views[0].column, "name");
assert.equal(messy.views[0].formulas.length, 8);
assert.deepEqual(messy.views[0].formulas.slice(0, 3).map((f) => f.id), ["days", "days_2", "formula"]);
assert.equal(messy.views[0].formulas[2].name, "Formula");
assert.equal(messy.views[0].formulas[2].expr, "");
assert.equal(new Set(messy.views[0].formulas.map((f) => f.id)).size, 8);
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
    { id: "all", name: "All notes", query: "", folder: "", column: "name", dir: "asc", formulas: [col("formula", "file.mtime", "Formula")], columns: [] },
    {
      id: "saved",
      name: "Saved view",
      query: "draft",
      folder: "Projects",
      column: "formula:days",
      dir: "desc",
      formulas: [col("due_on", "date(due)", "Due on"), col("days", "formula.due_on - today()", "Days left")],
      columns: ["status", "related"],
      relations: ["related"],
    },
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
assert.deepEqual(fromFile.views[1].formulas, [col("due_on", "date(due)", "Due on"), col("days", "formula.due_on - today()", "Days left")]);
assert.equal(fromFile.views[1].column, "formula:days");
assert.equal(fromFile.views[1].dir, "desc");
const fileJson = JSON.parse(file);
assert.equal(fileJson.version, 2);
assert.equal(fileJson.views[1].formula, "date(due)");
assert.equal(fileJson.views[1].formulas.length, 2);
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
assert.doesNotMatch(table, /one formula column per view/);
assert.match(table, /formula columns/);
assert.match(table, /no list, regex, or link functions, no group-by or summaries/);
assert.match(table, /\.base files import and export/);
assert.match(table, /data-testid="bases-add-formula"/);
assert.match(table, /data-testid="bases-formula-remove"/);
assert.match(table, /data-testid="bases-import-base"/);
assert.match(table, /data-testid="bases-export-base"/);
assert.match(table, /data-testid="bases-import-undo"/);
assert.match(table, /view\.formulas\.map/);
assert.match(table, /data-testid="bases-formula-error"/);
assert.match(table, /data-testid="bases-formula-parse-error"/);
assert.match(table, /data-testid="bases-formula-example"/);
assert.match(table, /data-formula-error=\{cell\.error \?\? undefined\}/);
assert.match(table, /data-formula-error=\{cell\?\.error \?\? undefined\}/);
assert.doesNotMatch(table, /\.base parity/);
const editor = readFileSync("src/components/editor/EditorPane.tsx", "utf8");
assert.match(editor, /data-testid="bases-open"/);
const workspace = readFileSync("src/components/layout/Workspace.tsx", "utf8");
assert.match(workspace, /NoteTable/);

// .base import / export
const { BASE_EXPORT_FILE, exportBaseFile, importBaseFile } = await import("../src/lib/vault/bases-file.ts");
const { parse: parseYaml } = await import("yaml");
assert.equal(BASE_EXPORT_FILE, "Nexus Bases.base");
const exportSession = {
  activeId: "all",
  views: [
    {
      id: "all",
      name: "All notes",
      query: "",
      folder: "",
      column: "formula:days",
      dir: "desc",
      formulas: [col("due_on", "date(due)", "Due on"), col("days", "formula.due_on - today()", "Days left"), col("blank", "", "Blank")],
      columns: [],
      relations: [],
      layout: "table",
    },
    {
      id: "saved",
      name: "Projects",
      query: "draft",
      folder: "/Projects/",
      column: "status",
      dir: "asc",
      formulas: [col("days", "1 + 1", "Other days")],
      columns: ["status"],
      relations: ["related"],
      layout: "cards",
    },
  ],
};
const exported = exportBaseFile(exportSession, ["status", "due"]);
assert.match(exported.text, /^# Exported from Nexus/);
const doc = parseYaml(exported.text);
assert.deepEqual(doc.formulas, { due_on: "date(due)", days: "formula.due_on - today()", days_2: "1 + 1" });
assert.equal(doc.properties["formula.days"].displayName, "Days left");
assert.equal(doc.properties["formula.days_2"].displayName, "Other days");
assert.equal(doc.views.length, 2);
assert.equal(doc.views[0].type, "table");
assert.equal(doc.views[0].filters, undefined);
assert.deepEqual(doc.views[0].order, ["file.name", "status", "due", "formula.due_on", "formula.days"]);
assert.deepEqual(doc.views[0].sort, [{ property: "formula.days", direction: "DESC" }]);
assert.equal(doc.views[1].type, "cards");
assert.equal(doc.views[1].name, "Projects");
assert.deepEqual(doc.views[1].filters, { and: ['file.inFolder("Projects")'] });
assert.deepEqual(doc.views[1].order, ["file.name", "status", "related", "formula.days_2"]);
assert.deepEqual(doc.views[1].sort, [{ property: "status", direction: "ASC" }]);
assert.equal(exported.notes.length, 1);
assert.match(exported.notes[0], /“Projects” text filter “draft” has no \.base equivalent/);

const back = importBaseFile(exported.text);
assert.ok(!("error" in back));
assert.deepEqual(back.notes, []);
assert.equal(back.session.activeId, "all");
assert.deepEqual(back.session.views.map((v) => v.id), ["all", "saved"]);
assert.deepEqual(back.session.views[0].formulas, [col("due_on", "date(due)", "Due on"), col("days", "formula.due_on - today()", "Days left")]);
assert.equal(back.session.views[0].column, "formula:days");
assert.equal(back.session.views[0].dir, "desc");
assert.deepEqual(back.session.views[0].columns, ["status", "due"]);
assert.equal(back.session.views[1].folder, "Projects");
assert.equal(back.session.views[1].layout, "cards");
assert.deepEqual(back.session.views[1].formulas, [col("days_2", "1 + 1", "Other days")]);
assert.deepEqual(back.session.views[1].columns, ["status", "related"]);
assert.equal(back.session.views[1].column, "status");
const reparsed = parseBasesSession(serializeNoteTableFile(back.session));
assert.deepEqual(reparsed.views[0].formulas, back.session.views[0].formulas);
const roundTable = buildNoteTable(formulaNotes, "", back.session.views[0].formulas, NOW);
assert.equal(roundTable.rows.find((row) => row.id === "x").formulas.days.value, "-11");

const obsidianBase = `
filters:
  and:
    - file.inFolder("Tasks")
    - 'status != "done"'
formulas:
  late: 'if(date(due) < today(), "late", "")'
  words: 'file.name.split(" ").length'
properties:
  formula.late:
    displayName: Late?
views:
  - type: table
    name: Open tasks
    order:
      - file.name
      - note.status
      - note["due date"]
      - file.mtime
      - file.size
      - formula.late
      - formula.words
      - formula.missing
    sort:
      - property: file.mtime
        direction: DESC
    groupBy:
      property: status
    limit: 20
  - type: list
    name: List
    filters:
      or:
        - file.hasTag("x")
  - type: table
    name: Third
`;
const imported = importBaseFile(obsidianBase);
assert.ok(!("error" in imported));
const [open, listView] = imported.session.views;
assert.equal(open.name, "Open tasks");
assert.equal(open.folder, "Tasks");
assert.deepEqual(open.columns, ["status", "due date"]);
assert.deepEqual(open.formulas.map((f) => [f.id, f.name]), [["file_mtime", "Modified"], ["late", "Late?"], ["words", "words"]]);
assert.equal(open.column, "formula:file_mtime");
assert.equal(open.dir, "desc");
assert.equal(listView.name, "List");
assert.equal(listView.layout, "table");
assert.equal(listView.folder, "Tasks");
const notesText = imported.notes.join("\n");
assert.match(notesText, /Filter status != "done" was not imported/);
assert.match(notesText, /Column file\.size has no Nexus equivalent/);
assert.match(notesText, /Column formula\.missing has no formula in this file/);
assert.match(notesText, /Formula “words” uses syntax Nexus does not read yet/);
assert.match(notesText, /groups rows; Nexus shows them ungrouped/);
assert.match(notesText, /row limit/);
assert.match(notesText, /“List” is a list view; it opens as a table/);
assert.match(notesText, /“or” filter group was not imported/);
assert.match(notesText, /Nexus keeps two views; “Third” was not imported/);
const lateRows = buildNoteTable(formulaNotes, open.folder, open.formulas, NOW);
const lateById = Object.fromEntries(lateRows.rows.map((row) => [row.id, row.formulas]));
assert.equal(lateById.x.late.value, "late");
assert.equal(lateById.y.late.value, "");
assert.ok(lateById.x.words.error);

const bare = importBaseFile("formulas:\n  a: '1 + 1'\n  b: 'formula.a * 2'\nviews:\n  - type: cards\n");
assert.ok(!("error" in bare));
assert.equal(bare.session.views[0].name, "All notes");
assert.equal(bare.session.views[0].layout, "cards");
assert.deepEqual(bare.session.views[0].formulas.map((f) => f.id), ["a", "b"]);
assert.equal(bare.session.views[1].id, "saved");
assert.equal(buildNoteTable(formulaNotes, "", bare.session.views[0].formulas, NOW).rows[0].formulas.b.value, "4");
assert.match(importBaseFile("views: [\n").error, /^Not a readable \.base file/);
assert.equal(importBaseFile("formulas:\n  a: '1'\n").error, "This .base file has no views to import.");
assert.equal(importBaseFile("").error, "This .base file has no views to import.");
assert.equal(importBaseFile("- 1\n- 2\n").error, "This .base file has no views to import.");
const many = importBaseFile(
  `formulas:\n${Array.from({ length: 10 }, (_, i) => `  f${i}: '${i}'`).join("\n")}\nviews:\n  - type: table\n    name: Wide\n`,
);
assert.equal(many.session.views[0].formulas.length, 8);
assert.match(many.notes.join("\n"), /Only 8 formula columns fit in a view/);
assert.match(readFileSync("src/lib/vault/desktop-write-path.ts", "utf8"), /base\)\$\/i/);

const clash = exportBaseFile({
  activeId: "all",
  views: [
    { ...exportSession.views[0], formulas: [col("a", "1", "A")], column: "name" },
    { ...exportSession.views[1], query: "", formulas: [col("a", "2", "A two"), col("b", 'formula.a + formula["A two"]', "B")], column: "formula:b" },
  ],
});
const clashDoc = parseYaml(clash.text);
assert.deepEqual(clashDoc.formulas, { a: "1", a_2: "2", b: "formula.a_2 + formula.a_2" });
assert.deepEqual(clashDoc.views[1].order.slice(-2), ["formula.a_2", "formula.b"]);
assert.deepEqual(clashDoc.views[1].sort, [{ property: "formula.b", direction: "ASC" }]);
const clashBack = importBaseFile(clash.text);
assert.equal(buildNoteTable(formulaNotes, "", clashBack.session.views[1].formulas, NOW).rows[0].formulas.b.value, "4");

const tangled = importBaseFile(`formulas:
  a: 'formula.b + 1'
  b: '2'
  c: 'formula.hidden * 2'
  hidden: '5'
  total: 'formula["Base price"] * 2'
  price: '10'
  loop1: 'formula.loop2'
  loop2: 'formula.loop1'
properties:
  formula.price:
    displayName: Base price
views:
  - type: table
    name: Ordered
    order: [file.name, formula.a, formula.b, formula.c, formula.total, formula.price]
  - type: table
    name: Loop
    order: [formula.loop1]
`);
const [ordered, loop] = tangled.session.views;
assert.deepEqual(ordered.formulas.map((f) => f.id), ["b", "a", "hidden", "c", "price", "total"]);
assert.equal(ordered.formulas.find((f) => f.id === "total").expr, "formula.price * 2");
const tangledRow = buildNoteTable(formulaNotes, "", ordered.formulas, NOW).rows[0].formulas;
assert.deepEqual(
  Object.fromEntries(Object.entries(tangledRow).map(([id, cell]) => [id, cell.error ?? cell.value])),
  { b: "2", a: "3", hidden: "5", c: "10", price: "10", total: "20" },
);
const tangledNotes = tangled.notes.join("\n");
assert.match(tangledNotes, /“c” reads formula\.hidden, so “hidden” was added as a column/);
assert.match(tangledNotes, /“Ordered” formula columns were reordered/);
assert.match(tangledNotes, /Formula loop between “loop2”, “loop1”; those columns show an error/);
assert.deepEqual(loop.formulas.map((f) => f.id), ["loop2", "loop1"]);
const loopRow = buildNoteTable(formulaNotes, "", loop.formulas, NOW).rows[0].formulas;
assert.match(loopRow.loop2.error, /formula\.loop1 is not a formula column to the left/);
assert.match(loopRow.loop1.error, /formula\.loop2 has an error/);
assert.doesNotMatch(importBaseFile(exported.text).notes.join("\n"), /reordered|added as a column|loop/);

console.log("note-table: PASS");
