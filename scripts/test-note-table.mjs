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

// Lists, regexes, and note links
const listy = {
  name: "Weekly review",
  path: "Reviews/Weekly review.md",
  folder: "Reviews",
  mtime: NOW,
  props: {
    tags: "[writing, work, writing/drafts]",
    scores: "[3, 4.5, 12]",
    owners: "[[Ada Lovelace]] [[Projects/Grace Hopper|Grace]]",
    parent: "[[Q4 Plan]]",
    quoted: '["a, b", \'it\'\'s\', "[[Inbox]]"]',
    status: "Draft – needs edits",
    ticket: "NEX-482 and NEX-17",
    plain: "Writing, Work",
    opened: "[[2026-09-28]]",
  },
  outlinks: () => [
    { target: "Ada Lovelace" },
    { target: "2026-09-30", display: null },
    { target: "Projects/Grace Hopper", display: "Grace" },
    { target: "Q4 Plan" },
  ],
  backlinks: () => [{ target: "Journal/2026-10-01", display: "2026-10-01" }, { target: "Hub", display: "Hub" }],
  tags: () => ["planning/q4", "review"],
};
const L = (src, value) => ok(src, value, listy);
const LB = (src, pattern) => bad(src, pattern, listy);
// List literals, indexing, and frontmatter lists
L("[1, 2, 3]", "1, 2, 3");
L("[]", "");
L("[1, 2, 3].length", "3");
L("[1, 2, 3][0]", "1");
L("[1, 2, 3][-1]", "3");
L("[1, 2, 3][5]", "");
L("tags", "writing, work, writing/drafts");
L("tags.length", "3");
L("tags[1]", "work");
L('tags.contains("work")', "true");
L('tags.contains("wor")', "false");
L('tags.containsAll("work", "writing")', "true");
L('tags.containsAll("work", "home")', "false");
L('tags.containsAny("home", "work")', "true");
L('plain.contains("Wri")', "true");
L("plain.length", "13");
L("quoted.length", "3");
L("quoted[0]", "a, b");
L("quoted[1]", "it's");
L("quoted[2]", "Inbox");
L('tags.join(" | ")', "writing | work | writing/drafts");
L("tags.join()", "writing, work, writing/drafts");
L("tags.sort()", "work, writing, writing/drafts");
L("tags.reverse()", "writing/drafts, work, writing");
L("tags.slice(1)", "work, writing/drafts");
L("[3, 1, 2, 1].sort()", "1, 1, 2, 3");
L('[2, "10", 1].sort()', "1, 2, 10");
L('["b", null, "a"].sort()', "a, b");
L("[1, 1, 2, \"1\"].unique()", "1, 2");
L("[[1, [2]], 3].flat()", "1, 2, 3");
L("[[1, [2]], 3].flat().length", "3");
L("[1, 2] + [3]", "1, 2, 3");
L("[1, 2] + 3", "1, 2, 3");
L("[1, 2] == [1, 2]", "true");
L("[1, 2] == [2, 1]", "false");
L("list(status).length", "1");
L("list(tags).length", "3");
L("list(missing).length", "0");
L("empty([])", "true");
L("[].isEmpty()", "true");
L("tags.isEmpty()", "false");
L("if(tags, \"has tags\", \"none\")", "has tags");
L("if([], \"has\", \"none\")", "none");
L("max(scores)", "12");
L("min(scores, 1)", "1");
L('"stressed".reverse()', "desserts");
// filter, map, reduce
L('tags.filter(value != "work")', "writing, writing/drafts");
L('tags.filter(value.startsWith("writing")).length', "2");
L("scores.filter(value > 4)", "4.5, 12");
L("scores.map(value * 2)", "6, 9, 24");
L('tags.map(upper(value)).join("/")', "WRITING/WORK/WRITING/DRAFTS");
L('tags.map(index & ":" & value)', "0:writing, 1:work, 2:writing/drafts");
L("scores.reduce(acc + value, 0)", "19.5");
L("scores.reduce(max(acc, value), 0)", "12");
L("scores.reduce(acc + value)", "19.5");
L("[].reduce(acc + value, 0)", "0");
L("[[1, 2], [3]].map(value.length)", "2, 1");
L("[[1, 2], [3, 4]].map(value.map(value * 10)).flat()", "10, 20, 30, 40");
L('filter(tags, value == "work")', "work");
L("map(scores, value + 1)", "4, 5.5, 13");
L("status.map(upper(value))", "DRAFT – NEEDS EDITS");
L("scores.filter(value > 100).length", "0");
LB("tags.filter()", /filter\(\) keeps the items that pass a test/);
LB("tags.filter", /filter\(\) keeps the items that pass a test/);
LB("tags.map(value, 1)", /map\(\) changes every item/);
LB("scores.reduce()", /reduce\(\) folds a list into one value/);
LB("tags.filter(acc > 1)", /acc only works inside reduce\(\)/);
LB("scores.map(value.frob())", /\.frob\(\) is not a formula function/);
LB("scores + 1 * tags", /The list \[“writing”, “work”, “writing\/drafts”\] is not a number/);
LB("scores * 2", /is not a number\. Use \.length to count it, or \.reduce\(acc \+ value, 0\) to add it up/);
LB("date(tags)", /is not a date\. Pick one item, like dates\[0\]/);
LB("status[0]", /“Draft – needs edits” is not a list, so it has no \[0\]/);
LB("tags[0.5]", /List positions are whole numbers/);
LB("tags[]", /\[ \] needs a position/);
LB("tags[0", /A position needs a closing \]/);
LB("[1, 2", /List needs a closing \]/);
LB("today().filter(value)", /filter\(\) works on lists/);
// value, index, acc outside a list method are properties again
ok("value", "", { ...task, props: { value: "" } });
ok("value", "42", { ...task, props: { value: "42" } });
ok("index & acc", "ab", { ...task, props: { index: "a", acc: "b" } });
ok("[1, 2].map(value + note.value)", "11, 12", { ...task, props: { value: "10" } });
// Regex
L("status.matches(/^draft/i)", "true");
L("status.matches(/^draft/)", "false");
L("/^draft/i.matches(status)", "true");
L("matches(status, /needs/)", "true");
L("missing.matches(/x/)", "false");
L('ticket.replace(/NEX-(\\d+)/g, "#$1")', "#482 and #17");
L('ticket.replace(/NEX-(\\d+)/, "#$1")', "#482 and NEX-17");
L('ticket.replace("NEX-", "")', "482 and 17");
L('ticket.replace("$", "x")', "NEX-482 and NEX-17");
L("ticket.split(/\\s+and\\s+/)", "NEX-482, NEX-17");
L('ticket.split(" ")', "NEX-482, and, NEX-17");
L('ticket.split(" ", 2)', "NEX-482, and");
L('ticket.split(" ").length', "3");
L('"a/b".matches(/a\\/b/)', "true");
L('"x".matches(/[/]/)', "false");
L('"a/b".matches(/[/]/)', "true");
L("tags.filter(value.matches(/^w.*s$/))", "writing/drafts");
L("scores.filter(!string(value).matches(/\\./))", "3, 12");
L("12 / 4 / 3", "1");
L("(12) / 4", "3");
L("/x/g == /x/g", "true");
L("/x/g", "/x/g");
L('if(true, /a/, "b").matches("cat")', "true");
LB("status.matches(\"Draft\")", /matches\(\) needs a regex, like status\.matches\(\/\^draft\/i\)\. Use contains\(\) for plain text/);
LB("/a/.matches(/b/)", /compares a regex with text, not two regexes/);
LB("status.matches(/(/)", /Regex \/\(\/ is not valid: /);
LB("status.matches(/a/x)", /Regex flag “x” is not supported\. Use g, i, m, s, or u/);
LB("status.matches(/a/gg)", /Regex flag “g” is repeated/);
LB("status.matches(/abc)", /Regex is missing its closing \//);
LB('status.replace("a", /b/)', /replace\(\) takes text here, not the regex \/b\//);
LB('status.split(",", 1.5)', /split\(\) keeps a whole number of parts/);
// Note links
L("parent", "Q4 Plan");
L('parent == "Q4 Plan"', "true");
L('parent == "q4 plan"', "true");
L('parent == "[[Q4 Plan]]"', "true");
L('parent == link("Q4 Plan")', "true");
L('parent == link("Other")', "false");
L("owners", "Ada Lovelace, Grace");
L("owners.length", "2");
L('owners.contains(link("Grace Hopper"))', "true");
L('owners.contains("Projects/Grace Hopper")', "true");
L('owners.contains("Other/Grace Hopper")', "false");
L('owners.contains("Ada Lovelace")', "true");
L('owners.map(value == link("Ada Lovelace"))', "true, false");
L('link("Projects/Spec")', "Projects/Spec");
L('link("Projects/Spec", "the spec")', "the spec");
L('link("[[Projects/Spec#Scope|scope]]")', "scope");
L('link("Spec#Scope")', "Spec > Scope");
L('link("Spec.md") == link("spec")', "true");
L('link("")', "");
L('link(parent, "Plan")', "Plan");
L("today() - opened", "3");
L("opened.format(\"MMM D\")", "Sep 28");
L("opened < today()", "true");
LB("link(3)", /link\(\) needs a note title or path, not 3/);
// file.links, file.backlinks, file.tags
L("file.links", "Ada Lovelace, 2026-09-30, Grace, Q4 Plan");
L("file.links.length", "4");
L('file.links.filter(!value.matches(/^\\d{4}-/)).slice(0, 3)', "Ada Lovelace, Grace, Q4 Plan");
L("file.backlinks", "2026-10-01, Hub");
L("file.backlinks.length", "2");
L('file.backlinks.contains("Hub")', "true");
L("file.tags", "planning/q4, review");
L('file.tags.map("#" & value).join(" ")', "#planning/q4 #review");
L('file.hasLink("Q4 Plan")', "true");
L('file.hasLink(link("grace hopper"))', "true");
L('file.hasLink(parent)', "true");
L('file.hasLink("Nope")', "false");
L('file.hasLink("")', "false");
L('file.hasTag("review")', "true");
L('file.hasTag("#planning")', "true");
L('file.hasTag("plan")', "false");
L('file.hasTag("nope", "review")', "true");
L('file.hasProperty("Status")', "true");
L('file.hasProperty("nope")', "false");
L('file.inFolder("Reviews")', "true");
L('file.inFolder("reviews/")', "true");
L('file.inFolder("Rev")', "false");
L("file.asLink()", "Weekly review");
L('file.asLink("this")', "this");
L("file.asLink() == link(\"Weekly review\")", "true");
ok("file.links.length", "0");
ok("file.backlinks", "");
ok('file.hasTag("x")', "false");
LB("file.hasTag", /file\.hasTag needs \(…\), like file\.hasTag\("…"\)/);
LB("file.hasTag()", /file\.hasTag\(\) takes 1 or more values/);
LB('file.inFolder("a", "b")', /file\.inFolder\(\) takes 1 value/);
LB('hasTag("x")', /hasTag\(\) is a file method\. Write file\.hasTag\(…\)/);
LB("file.size", /file\. needs name, path, folder, ext, mtime, links, backlinks, tags, or hasLink\(\)/);
// Later columns get the typed list, not its text
{
  const refs = new Map([["picked", { value: ["a", "b"] }]]);
  ok("formula.picked.length", "2", { ...listy, refs });
  ok('formula.picked.contains("b")', "true", { ...listy, refs });
}

const { FORMULA_EXAMPLES, FORMULA_FUNCTIONS, compileNoteFormula } = await import("../src/lib/vault/note-formula.ts");
assert.ok(FORMULA_EXAMPLES.length >= 6);
for (const example of FORMULA_EXAMPLES) {
  assert.equal(compileNoteFormula(example.formula).error, null, example.formula);
}
for (const name of ["if", "empty", "date", "today", "format", "relative", "upper", "lower", "contains", "replace", "round", "number"]) {
  assert.ok(FORMULA_FUNCTIONS.includes(name), name);
}
for (const name of ["list", "filter", "map", "reduce", "join", "sort", "unique", "flat", "reverse", "split", "containsAll", "containsAny", "isEmpty", "matches", "link"]) {
  assert.ok(FORMULA_FUNCTIONS.includes(name), name);
}
{
  const { FORMULA_FUNCTION_GROUPS } = await import("../src/lib/vault/note-formula.ts");
  const groups = Object.fromEntries(FORMULA_FUNCTION_GROUPS.map((g) => [g.group, g.names]));
  assert.ok(groups.list.includes("filter") && groups.regex.includes("matches") && groups.link.includes("link"));
  assert.deepEqual(groups.file, ["file.hasLink", "file.hasTag", "file.hasProperty", "file.inFolder", "file.asLink"]);
  const listed = FORMULA_FUNCTION_GROUPS.flatMap((g) => g.names);
  assert.equal(new Set(listed).size, listed.length);
  assert.equal(listed.filter((name) => !name.startsWith("file.")).length, FORMULA_FUNCTIONS.length);
  assert.ok(FORMULA_FUNCTION_GROUPS.every((g) => g.names.length));
}
// Every example compiles and runs cleanly on a note with links and tags
for (const example of FORMULA_EXAMPLES) {
  const out = evalNoteFormula(
    {
      ...task,
      outlinks: () => [{ target: "Ada" }, { target: "2026-09-30" }],
      backlinks: () => [{ target: "Hub", display: "Hub" }],
      tags: () => ["review"],
    },
    example.formula,
    NOW,
  );
  assert.equal(out.error, null, `${example.formula} → ${out.error}`);
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
// Linking keeps block lists, comments, and other keys exactly as written
const blocky = "---\ntitle: X\naliases:\n  - Old name\n  - Other\n# keep me\nrelated: [[A]]\nstatus: draft\n---\nBody\n";
const blockLinked = withNoteRelation(blocky, "related", "B");
assert.equal(blockLinked, "---\ntitle: X\naliases:\n  - Old name\n  - Other\n# keep me\nrelated: [[A]] [[B]]\nstatus: draft\n---\nBody\n");
assert.equal(withNoteRelation(blockLinked, "related", "b"), blockLinked);
const blockRelated = "---\nrelated:\n  - \"[[A]]\"\n  - \"[[Folder/C]]\"\naliases:\n  - Keep\n---\n# T\n";
assert.equal(withNoteRelation(blockRelated, "related", "B"), "---\nrelated: [[A]] [[C]] [[B]]\naliases:\n  - Keep\n---\n# T\n");
assert.equal(withNoteRelation("---\ntitle: X\n---\nBody\n", "related", "B"), "---\ntitle: X\nrelated: [[B]]\n---\nBody\n");
assert.equal(withNoteRelation("---\r\ntitle: X\r\n---\r\nBody\r\n", "related", "B"), "---\r\ntitle: X\r\nrelated: [[B]]\r\n---\r\nBody\r\n");

// Block lists read as lists; links, backlinks, and tags come from note text
const { noteTableProperties } = await import("../src/lib/vault/note-table.ts");
assert.deepEqual(
  noteTableProperties("---\ntags:\n  - writing\n  - \"has, comma\"\n\n  - '[[Q4 Plan]]'\nempty:\nnested:\n  key: v\nafter: 1\n---\n"),
  { tags: '[writing, "has, comma", "[[Q4 Plan]]"]', after: "1" },
);
const linkVault = [
  {
    id: "hub",
    path: "Hub.md",
    name: "Hub.md",
    content: "---\ntags:\n  - planning/q4\n  - Review\nowner: \"[[Ada]]\"\n---\nSee [[Ada]], [[Projects/Spec#Scope|the spec]], [[Ada|again]], ![[diagram.png]], ![[Ada]] and `[[Code]]`.\n#inline tag\n",
    mtime: NOW,
  },
  { id: "ada", path: "People/Ada.md", name: "Ada.md", content: "Works on [[Hub]] and [[Spec]].\n", mtime: NOW },
  { id: "spec", path: "Projects/Spec.md", name: "Spec.md", content: "Back to [[hub]]. Also [[Hub]] and [[Spec]] (self).\n", mtime: NOW },
  { id: "lazy", path: "Projects/Lazy.md", name: "Lazy.md", content: null, mtime: NOW },
];
const linkTable = buildNoteTable(
  linkVault,
  "",
  [
    col("out", "file.links"),
    col("back", "file.backlinks"),
    col("tags", "file.tags"),
    col("owner", "owner"),
    col("count", "file.backlinks.length"),
    col("mixed", '[owner, "text"]'),
    col("none", "file.links.filter(false)"),
  ],
  NOW,
);
const cell = (id, column) => linkTable.rows.find((row) => row.id === id).formulas[column];
assert.equal(cell("hub", "out").value, "Ada, the spec");
assert.deepEqual(cell("hub", "out").links, [{ id: "ada", title: "Ada" }, { id: "spec", title: "the spec" }]);
assert.equal(cell("hub", "back").value, "Ada, Spec");
assert.deepEqual(cell("hub", "back").links, [{ id: "ada", title: "Ada" }, { id: "spec", title: "Spec" }]);
assert.equal(cell("spec", "back").value, "Ada, Hub");
assert.equal(cell("ada", "back").value, "Hub");
assert.equal(cell("lazy", "back").value, "");
assert.equal(cell("lazy", "back").kind, "empty");
assert.equal(cell("hub", "tags").value, "inline, planning/q4, review");
assert.equal(cell("hub", "owner").value, "Ada");
assert.deepEqual(cell("hub", "owner").links, [{ id: "ada", title: "Ada" }]);
assert.equal(cell("hub", "count").value, "2");
assert.equal(cell("hub", "count").kind, "number");
assert.equal(cell("hub", "out").kind, "text");
assert.equal(cell("hub", "mixed").links, undefined);
assert.equal(cell("hub", "none").links, undefined);
assert.equal(cell("hub", "none").kind, "empty");
// A folder view still sees backlinks from notes outside the folder
const folderLinks = buildNoteTable(linkVault, "Projects", [col("back", "file.backlinks")], NOW);
assert.equal(folderLinks.rows.find((row) => row.id === "spec").formulas.back.value, "Ada, Hub");
assert.ok(!folderLinks.rows.some((row) => row.id === "hub"));
// A stray [[ in text is not a link and does not swallow the next real one
const stray = buildNoteTable(
  [
    { id: "s", path: "S.md", name: "S.md", content: "| ⌘⇧L | Insert [[ wikilink |\n| x | y |\n\n- [[Hub]]\n- [[Two\nlines]]\n", mtime: NOW },
    { id: "hub2", path: "Hub.md", name: "Hub.md", content: "", mtime: NOW },
  ],
  "",
  [col("out", "file.links"), col("back", "file.backlinks")],
  NOW,
);
assert.equal(stray.rows.find((row) => row.id === "s").formulas.out.value, "Hub");
assert.equal(stray.rows.find((row) => row.id === "hub2").formulas.back.value, "S");
// Links to missing notes still show, but do not open anything
const ghost = buildNoteTable([{ id: "g", path: "G.md", name: "G.md", content: "[[Nowhere]]", mtime: NOW }], "", [col("out", "file.links")], NOW);
assert.deepEqual(ghost.rows[0].formulas.out.links, [{ id: null, title: "Nowhere" }]);
// Group and summarize a list formula by its text
const { groupNoteRows: groupLinkRows, summarize: summarizeLinks } = await import("../src/lib/vault/bases-groups.ts");
assert.deepEqual(
  groupLinkRows(linkTable.rows, { column: "formula:count", dir: "desc" }).map((g) => [g.label, g.rows.length]),
  [["2", 2], ["1", 1], ["0", 1]],
);
assert.equal(summarizeLinks(linkTable.rows, "formula:count", "sum").text, "5");

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
assert.doesNotMatch(table, /no list, regex, or link functions/);
assert.match(table, /formula columns with list, regex, and link functions/);
assert.match(table, /two views, no custom summary formulas, links do not open into files \(no asFile or linksTo\)/);
assert.match(table, /some Obsidian functions are missing/);
assert.match(table, /data-testid="bases-formula-link"/);
assert.match(table, /data-testid="bases-formula-lists"/);
assert.match(table, /FORMULA_FUNCTION_GROUPS\.map/);
assert.doesNotMatch(table, /no group-by or summaries/);
assert.match(table, /group-by, summary rows/);
assert.match(table, /data-testid="bases-group-by"/);
assert.match(table, /data-testid="bases-summary-select"/);
assert.match(table, /data-testid="bases-group"/);
assert.match(table, /data-testid="bases-card-group"/);
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
assert.doesNotMatch(notesText, /Formula “words” uses syntax Nexus does not read yet/);
assert.deepEqual(open.groupBy, { column: "status", dir: "asc" });
assert.doesNotMatch(notesText, /ungrouped/);
assert.match(notesText, /row limit/);
assert.match(notesText, /“List” is a list view; it opens as a table/);
assert.match(notesText, /“or” filter group was not imported/);
assert.match(notesText, /Nexus keeps two views; “Third” was not imported/);
const lateRows = buildNoteTable(formulaNotes, open.folder, open.formulas, NOW);
const lateById = Object.fromEntries(lateRows.rows.map((row) => [row.id, row.formulas]));
assert.equal(lateById.x.late.value, "late");
assert.equal(lateById.y.late.value, "");
assert.equal(lateById.x.words.error, null);
assert.equal(lateById.x.words.value, "1");
const obsidianLists = importBaseFile(`
formulas:
  drafts: 'file.tags.filter(value.startsWith("draft")).length'
  people: 'file.links.filter(value.matches(/^People\\//)).join(" · ")'
  first: 'list(owner)[0]'
  total: 'scores.reduce(acc + value, 0)'
views:
  - type: table
    name: Linked
    order:
      - file.name
      - file.tags
      - file.backlinks
      - file.links
      - formula.drafts
      - formula.people
      - formula.first
      - formula.total
`);
assert.ok(!("error" in obsidianLists));
assert.deepEqual(
  obsidianLists.session.views[0].formulas.map((f) => [f.id, f.name, f.expr]),
  [
    ["file_tags", "Tags", "file.tags"],
    ["file_backlinks", "Backlinks", "file.backlinks"],
    ["file_links", "Links", "file.links"],
    ["drafts", "drafts", 'file.tags.filter(value.startsWith("draft")).length'],
    ["people", "people", 'file.links.filter(value.matches(/^People\\//)).join(" · ")'],
    ["first", "first", "list(owner)[0]"],
    ["total", "total", "scores.reduce(acc + value, 0)"],
  ],
);
assert.doesNotMatch(obsidianLists.notes.join("\n"), /does not read yet|no Nexus equivalent/);
for (const f of obsidianLists.session.views[0].formulas) assert.equal(compileNoteFormula(f.expr).error, null, f.expr);

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

// Group-by and summaries
const { groupNoteRows, summarize, summaryKindsFor, columnCell, EMPTY_GROUP_LABEL, ERROR_GROUP_LABEL } = await import(
  "../src/lib/vault/bases-groups.ts"
);
const shop = [
  { id: "p1", path: "Shop/Apples.md", name: "Apples.md", content: "---\nstatus: open\nprice: 3\nbought: 2026-09-01\ndone: false\n---\n", mtime: NOW },
  { id: "p2", path: "Shop/Bread.md", name: "Bread.md", content: "---\nstatus: done\nprice: 4.5\nbought: 2026-09-20\ndone: true\n---\n", mtime: NOW },
  { id: "p3", path: "Shop/Cheese.md", name: "Cheese.md", content: "---\nstatus: open\nprice: 12\nbought: 2026-08-15\ndone: true\n---\n", mtime: NOW },
  { id: "p4", path: "Shop/Dates.md", name: "Dates.md", content: "---\nprice: lots\n---\n", mtime: NOW },
  { id: "p5", path: "Home/Eggs.md", name: "Eggs.md", content: "---\nstatus: open\nprice: 2\n---\n", mtime: NOW },
];
const shopTable = buildNoteTable(shop, "", [col("tax", "number(price) * 0.1", "Tax"), col("when", "date(bought)", "When")], NOW);
const shopRows = sortNoteRows(shopTable.rows, "name", "asc");
const byStatusGroup = groupNoteRows(shopRows, { column: "status", dir: "asc" });
assert.deepEqual(byStatusGroup.map((g) => [g.label, g.rows.map((r) => r.id)]), [
  ["done", ["p2"]],
  ["open", ["p1", "p3", "p5"]],
  [EMPTY_GROUP_LABEL, ["p4"]],
]);
assert.deepEqual(groupNoteRows(shopRows, { column: "status", dir: "desc" }).map((g) => g.label), ["open", "done", EMPTY_GROUP_LABEL]);
assert.deepEqual(groupNoteRows(shopRows, { column: "price", dir: "asc" }).map((g) => g.label), ["2", "3", "4.5", "12", "lots"]);
assert.deepEqual(groupNoteRows(shopRows, { column: "folder", dir: "asc" }).map((g) => [g.label, g.rows.length]), [["Home", 1], ["Shop", 4]]);
const taxGroups = groupNoteRows(shopRows, { column: "formula:tax", dir: "asc" });
assert.equal(taxGroups[taxGroups.length - 1].label, ERROR_GROUP_LABEL);
assert.deepEqual(taxGroups[taxGroups.length - 1].rows.map((r) => r.id), ["p4"]);
const whenGroups = groupNoteRows(shopRows, { column: "formula:when", dir: "asc" });
assert.deepEqual(whenGroups.map((g) => g.label), ["2026-08-15", "2026-09-01", "2026-09-20", EMPTY_GROUP_LABEL]);
assert.equal(columnCell(shopRows[0], "formula:when").date, Date.UTC(2026, 8, 1));
assert.ok(Math.abs(columnCell(shopRows[0], "formula:tax").num - 0.3) < 1e-9);

const sum = (column, kind, rows = shopRows) => summarize(rows, column, kind);
assert.equal(sum("price", "sum").text, "21.5");
assert.match(sum("price", "sum").detail, /Of 4 numbers; 1 notes have none/);
assert.equal(sum("price", "average").text, "5.375");
assert.equal(sum("price", "median").text, "3.75");
assert.equal(sum("price", "min").text, "2");
assert.equal(sum("price", "max").text, "12");
assert.equal(sum("price", "range").text, "10");
assert.equal(sum("price", "stddev").text, "3.9271");
assert.equal(sum("price", "count").text, "5");
assert.equal(sum("status", "filled").text, "4");
assert.equal(sum("status", "empty").text, "1");
assert.equal(sum("status", "unique").text, "2");
assert.equal(sum("status", "sum").text, "—");
assert.match(sum("status", "sum").detail, /No numbers/);
assert.equal(sum("bought", "earliest").text, "2026-08-15");
assert.equal(sum("bought", "latest").text, "2026-09-20");
assert.equal(sum("bought", "range").text, "36 days");
assert.equal(sum("formula:when", "latest").text, "2026-09-20");
assert.equal(sum("done", "checked").text, "2");
assert.equal(sum("done", "unchecked").text, "1");
assert.equal(sum("name", "checked").text, "—");
assert.equal(sum("formula:tax", "sum").text, "2.15");
assert.match(sum("formula:tax", "sum").detail, /1 note with an error left out/);
assert.equal(sum("formula:tax", "filled").text, "4");
assert.equal(sum("formula:tax", "empty").text, "0");
const openGroup = byStatusGroup.find((g) => g.label === "open");
assert.equal(summarize(openGroup.rows, "price", "sum").text, "17");
assert.equal(summarize([], "price", "sum").text, "—");
assert.equal(summarize([], "price", "count").text, "0");
assert.deepEqual(summaryKindsFor(shopRows, "status"), ["count", "filled", "empty", "unique"]);
assert.ok(summaryKindsFor(shopRows, "price").includes("sum"));
assert.ok(!summaryKindsFor(shopRows, "price").includes("earliest"));
assert.ok(summaryKindsFor(shopRows, "bought").includes("earliest"));
assert.ok(summaryKindsFor(shopRows, "done").includes("checked"));
assert.ok(summaryKindsFor(shopRows, "formula:when").includes("latest"));

const grouped = parseBasesSession(JSON.stringify({
  activeId: "all",
  views: [
    {
      id: "all",
      formulas: [col("tax", "1")],
      groupBy: { column: "status", dir: "desc" },
      summaries: { price: "sum", "formula:tax": "average", "formula:gone": "sum", status: "bogus", name: "count" },
    },
    { id: "saved", groupBy: { column: "formula:gone" } },
  ],
}));
assert.deepEqual(grouped.views[0].groupBy, { column: "status", dir: "desc" });
assert.deepEqual(grouped.views[0].summaries, { price: "sum", "formula:tax": "average", name: "count" });
assert.equal(grouped.views[1].groupBy, null);
assert.deepEqual(grouped.views[1].summaries, {});
assert.deepEqual(parseBasesSession(null).views[0].groupBy, null);
assert.deepEqual(parseBasesSession(null).views[0].summaries, {});
const groupedFile = JSON.parse(serializeNoteTableFile(grouped));
assert.deepEqual(groupedFile.views[0].groupBy, { column: "status", dir: "desc" });
assert.equal(groupedFile.views[0].summaries.price, "sum");
assert.deepEqual(parseBasesSession(serializeNoteTableFile(grouped)).views[0], grouped.views[0]);

const groupExport = exportBaseFile({
  activeId: "all",
  views: [
    { ...grouped.views[0], name: "Shop", column: "name", dir: "asc", columns: ["status", "price"], relations: [], layout: "table" },
    { ...grouped.views[1], groupBy: { column: "formula:formula", dir: "asc" }, summaries: { folder: "unique" } },
  ],
});
const groupDoc = parseYaml(groupExport.text);
assert.deepEqual(groupDoc.views[0].groupBy, { property: "status", direction: "DESC" });
assert.deepEqual(groupDoc.views[0].summaries, { price: "Sum", "formula.tax": "Average" });
assert.match(groupExport.notes.join("\n"), /“Shop” count summary on file\.name has no \.base equivalent/);
assert.deepEqual(groupDoc.views[1].groupBy, { property: "formula.formula", direction: "ASC" });
assert.deepEqual(groupDoc.views[1].summaries, { "file.folder": "Unique" });
assert.deepEqual(groupDoc.views[1].order.slice(0, 2), ["file.name", "file.folder"]);
assert.ok(!groupDoc.views[0].order.includes("file.folder"));
const groupBack = importBaseFile(groupExport.text);
assert.deepEqual(groupBack.session.views[0].groupBy, { column: "status", dir: "desc" });
assert.deepEqual(groupBack.session.views[0].summaries, { price: "sum", "formula:tax": "average" });
assert.deepEqual(groupBack.session.views[1].groupBy, { column: "formula:formula", dir: "asc" });
assert.deepEqual(groupBack.session.views[1].summaries, { folder: "unique" });

const obsidianGroups = importBaseFile(`
formulas:
  total: 'number(price) * 2'
summaries:
  doubled: 'values.reduce(acc + value, 0) * 2'
views:
  - type: table
    name: Grouped
    order: [file.name, note.price, formula.total]
    groupBy:
      property: note.status
      direction: DESC
    summaries:
      note.price: Average
      formula.total: stddev
      file.mtime: Latest
      note.qty: doubled
  - type: cards
    name: By folder
    groupBy: file.folder
    summaries:
      file.size: Sum
`);
const [og, oc] = obsidianGroups.session.views;
assert.deepEqual(og.groupBy, { column: "status", dir: "desc" });
assert.deepEqual(og.summaries, { price: "average", "formula:total": "stddev" });
assert.deepEqual(oc.groupBy, { column: "folder", dir: "asc" });
assert.deepEqual(oc.summaries, {});
const ogNotes = obsidianGroups.notes.join("\n");
assert.match(ogNotes, /Custom summary formulas \(doubled\) were not imported/);
assert.match(ogNotes, /“Grouped” summary doubled on note\.qty is not a built-in summary/);
assert.match(ogNotes, /“Grouped” summary on file\.mtime did not carry over/);
assert.match(ogNotes, /“By folder” summary on file\.size did not carry over/);
const badGroup = importBaseFile("views:\n  - type: table\n    groupBy:\n      property: file.size\n");
assert.equal(badGroup.session.views[0].groupBy, null);
assert.match(badGroup.notes.join("\n"), /groups by file\.size, which did not carry over/);

console.log("note-table: PASS");
