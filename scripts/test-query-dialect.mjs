/**
 * The shared query dialect: LIST / TABLE / CARDS blocks, Bases view filters,
 * dataview fences, and the save path that keeps query blocks in the file.
 */
import assert from "node:assert/strict";

if (!process.env.NEXUS_TSX) {
  const { spawnSync } = await import("node:child_process");
  const r = spawnSync("npx", ["--yes", "tsx", "scripts/test-query-dialect.mjs"], {
    cwd: process.cwd(),
    encoding: "utf8",
    timeout: 120_000,
    env: { ...process.env, NEXUS_TSX: "1" },
  });
  if (r.stdout) process.stdout.write(r.stdout);
  if (r.stderr) process.stderr.write(r.stderr);
  process.exit(r.status ?? 1);
}

const { runNexusQuery, parseNexusQuery, frontmatterHydrateIds } = await import("../src/lib/vault/nexus-query.ts");
const { toFormulaSyntax, compileQueryFilter, problemExcerpt, filterAndParts } = await import("../src/lib/vault/query-expr.ts");
const { looksLikeDialect } = await import("../src/lib/vault/query-dialect.ts");
const { resetVaultIndex, ensureVaultIndex } = await import("../src/lib/vault/indexes.ts");
const { buildNoteTable, parseBasesSession, defaultBasesSession } = await import("../src/lib/vault/note-table.ts");
const { importBaseFile, exportBaseFile } = await import("../src/lib/vault/bases-file.ts");
const { readLiveBase, writeLiveBase } = await import("../src/lib/vault/bases-live.ts");
const { basesViewToQuery } = await import("../src/lib/vault/bases-query.ts");
const { queryStarters } = await import("../src/lib/vault/query-starters.ts");
const { invalidateVaultTagsCache } = await import("../src/lib/vault/tags.ts");
const { buildDemoVault } = await import("../src/lib/vault/demo-vault.ts");
const { markdownToHtml, htmlToMarkdown, htmlDocToMarkdown } = await import("../src/lib/markdown/serialize.ts");
const { promoteNexusQueryBlocks } = await import("../src/lib/editor/special-blocks.ts");
const { marked } = await import("marked");
const domino = (await import("@mixmark-io/domino")).default;

function note(id, path, content, extra = {}) {
  return { id, path, name: path.split("/").pop(), kind: "note", parentId: null, mtime: 0, content, ...extra };
}
function folder(id, path) {
  return { id, path, name: path.split("/").pop(), kind: "folder", parentId: null, mtime: 0 };
}
const ids = (model) => model.rows.map((r) => r.id);
const sortedIds = (model) => ids(model).sort();
const DAY = 86_400_000;
const NOW = Date.UTC(2026, 9, 2, 12, 0);

// --- Dataview spellings become Bases formulas, outside quotes only.
assert.equal(toFormulaSyntax('status = "done" AND NOT archived'), 'status == "done" && ! archived');
assert.equal(toFormulaSyntax('file.name = "a = b OR c"'), 'file.name == "a = b OR c"');
assert.equal(toFormulaSyntax("due < date(today) + 7d"), 'due < today() + "7d"');
assert.equal(toFormulaSyntax("file.mtime >= date(2026-01-05)"), 'file.mtime >= date("2026-01-05")');
assert.equal(toFormulaSyntax("due > date(now) - dur(2 weeks)"), 'due > now() - "2 weeks"');
assert.equal(toFormulaSyntax('contains(file.outlinks, [[Project X|the project]])'), 'contains(file.links, link("Project X"))');
assert.equal(toFormulaSyntax('contains(file.tags, "#idea")'), 'contains(file.tags, "idea")');
assert.equal(toFormulaSyntax("file.inlinks"), "file.backlinks");
assert.equal(toFormulaSyntax("status != done"), "status != done");
assert.deepEqual(filterAndParts('a = 1 AND (b = 2 OR c = 3) && d'), ["a = 1", "(b = 2 OR c = 3)", "d"]);
assert.deepEqual(filterAndParts("a = 1 OR b = 2 AND c"), ["a = 1 OR b = 2 AND c"]);

// --- Which parser reads a block.
assert.equal(parseNexusQuery("LIST FROM path:Research").kind, "ok");
assert.equal(parseNexusQuery('TABLE status FROM "Research" WHERE status = "draft"').kind, "ok");
assert.equal(parseNexusQuery('TABLE status AS "State" FROM "Research"').kind, "dialect");
assert.equal(parseNexusQuery("CARDS FROM #idea").kind, "dialect");
assert.equal(parseNexusQuery("TABLE WITHOUT ID file.link FROM #idea").kind, "dialect");
assert.equal(looksLikeDialect('LIST WHERE status == "x"'), true);
assert.equal(looksLikeDialect("LIST FROM path:Research"), false);

// --- Errors name the clause and the exact text.
function problemOf(source) {
  const model = runNexusQuery(source, {});
  assert.ok(model.error, `expected an error for ${source}`);
  assert.ok(model.problem, `expected a problem span for ${source}`);
  return { ...model.problem, text: source.slice(model.problem.start, model.problem.end), error: model.error };
}
{
  const typo = problemOf('TABLE lenght(file.name) FROM "Research"');
  assert.match(typo.error, /lenght\(\) is not a function Nexus knows/);
  assert.match(typo.error, /Did you mean length\(\)\?/);
  assert.equal(typo.clause, "TABLE");
  assert.equal(typo.text, "lenght(file.name)");

  const half = problemOf('LIST FROM "Research" WHERE status = "draft" AND contains(status)');
  assert.equal(half.clause, "WHERE");
  assert.equal(half.text, "contains(status)");

  const open = problemOf('LIST WHERE status = "draft');
  assert.match(open.error, /end quote/);
  assert.equal(open.clause, "WHERE");

  const incomplete = problemOf("LIST WHERE status =");
  assert.match(incomplete.error, /incomplete/);

  const flatten = problemOf("TABLE file.name FLATTEN file.tags");
  assert.match(flatten.error, /FLATTEN/);

  const listTwo = problemOf("LIST status, due");
  assert.match(listTwo.error, /LIST shows one value/);

  const head = problemOf("SHOW status");
  assert.match(head.error, /Start with LIST, TABLE, or CARDS/);
  assert.equal(head.text, "SHOW");

  const self = problemOf("LIST WHERE this.status = status");
  assert.match(self.error, /this\./);

  const excerpt = problemExcerpt('TABLE status\nWHERE contains(status)\nSORT due', {
    message: "x",
    clause: "WHERE",
    start: 19,
    end: 35,
  });
  assert.deepEqual(excerpt, { line: 2, before: "WHERE ", bad: "contains(status)", after: "" });
  assert.equal(compileQueryFilter('status = "a" AND').ok, false);
  assert.equal(compileQueryFilter('status = "a" AND due > date(today)').ok, true);
}

// --- The engine: sources, filters, columns, sort, groups, limits.
resetVaultIndex();
const vault = {
  p: folder("p", "Projects"),
  a: { ...folder("a", "Projects/Archive"), parentId: "p" },
  r: folder("r", "Reading"),
  alpha: note("alpha", "Projects/Alpha.md", "---\nstatus: active\ndue: 2026-10-05\npriority: 2\ntags: [work, launch]\n---\n# Alpha\nSee [[Beta]] and [[Gamma]].\n", { parentId: "p", mtime: NOW - DAY }),
  beta: note("beta", "Projects/Beta.md", "---\nstatus: blocked\ndue: 2026-09-20\npriority: 1\ntags: [work]\n---\n# Beta\nBack to [[Alpha]].\n", { parentId: "p", mtime: NOW - 3 * DAY }),
  gamma: note("gamma", "Projects/Gamma.md", "---\nstatus: done\ndue: 2026-08-01\npriority: 3\n---\n# Gamma\n#work #archive-me\n", { parentId: "p", mtime: NOW - 30 * DAY }),
  old: note("old", "Projects/Archive/Old.md", "---\nstatus: done\n---\n# Old\n#work\n", { parentId: "a", mtime: NOW - 400 * DAY }),
  book: note("book", "Reading/Dune.md", "---\nrating: 5\nauthor: Frank Herbert\ntags: book\n---\n# Dune\nMentions [[Alpha]].\n", { parentId: "r", mtime: NOW - 2 * DAY }),
  book2: note("book2", "Reading/Emma.md", "---\nrating: 3\nauthor: Jane Austen\ntags: book\n---\n# Emma\n", { parentId: "r", mtime: NOW - 10 * DAY }),
  loose: note("loose", "Inbox.md", "# Inbox\n#work\n", { mtime: NOW }),
};
const run = (q) => runNexusQuery(q, vault, null, NOW);

{
  const table = run('TABLE status AS "State", due FROM "Projects" WHERE status != "done" SORT due ASC');
  assert.equal(table.error, null);
  assert.equal(table.mode, "table");
  assert.deepEqual(table.columns, ["State", "due"]);
  assert.deepEqual(ids(table), ["beta", "alpha"]);
  assert.deepEqual(table.rows[0].fields.map((f) => f.value), ["blocked", "2026-09-20"]);
  assert.equal(table.showPath, false);

  const nested = run('LIST FROM "Projects"');
  assert.deepEqual(sortedIds(nested), ["alpha", "beta", "gamma", "old"]);
  const notArchive = run('LIST FROM "Projects" AND -"Projects/Archive"');
  assert.deepEqual(sortedIds(notArchive), ["alpha", "beta", "gamma"]);

  assert.deepEqual(sortedIds(run("LIST FROM #work")), ["alpha", "beta", "gamma", "loose", "old"]);
  assert.deepEqual(sortedIds(run("LIST FROM #work AND -#archive-me")), ["alpha", "beta", "loose", "old"]);
  assert.deepEqual(sortedIds(run("LIST FROM #book OR #launch")), ["alpha", "book", "book2"]);
  assert.deepEqual(sortedIds(run("LIST FROM [[Alpha]]")), ["beta", "book"]);
  assert.deepEqual(sortedIds(run("LIST FROM outgoing([[Alpha]])")), ["beta", "gamma"]);

  const vaultWide = run("LIST WHERE file.mtime >= date(today) - 7d SORT file.mtime DESC");
  assert.deepEqual(ids(vaultWide), ["loose", "alpha", "book", "beta"]);

  const multiSort = run('TABLE priority FROM #work WHERE priority SORT status DESC, priority ASC');
  assert.deepEqual(ids(multiSort), ["gamma", "beta", "alpha"]);

  const grouped = run('TABLE file.link FROM "Projects" GROUP BY status');
  assert.deepEqual(
    grouped.rows.map((r) => [r.group, r.id]),
    [["active", "alpha"], ["blocked", "beta"], ["done", "gamma"], ["done", "old"]],
  );

  const limited = run('LIST FROM "Projects" SORT file.name DESC LIMIT 2');
  assert.deepEqual(ids(limited), ["old", "gamma"]);
  assert.equal(limited.total, 4);
  assert.equal(limited.truncated, false);

  const cards = run('CARDS author AS "By", rating FROM #book SORT rating DESC');
  assert.equal(cards.mode, "cards");
  assert.deepEqual(cards.columns, ["By", "rating"]);
  assert.deepEqual(cards.rows.map((r) => r.fields[0].value), ["Frank Herbert", "Jane Austen"]);

  const noId = run('TABLE WITHOUT ID file.name AS "Book", rating FROM "Reading"');
  assert.equal(noId.withoutId, true);
  assert.deepEqual(noId.rows.map((r) => r.fields[0].value), ["Dune", "Emma"]);

  const formulaCols = run('TABLE priority * 10 AS "Score", formula.score + 1 AS "Next" FROM "Projects" WHERE priority SORT formula.score DESC');
  assert.equal(formulaCols.error, null);
  assert.deepEqual(ids(formulaCols), ["gamma", "alpha", "beta"]);
  assert.deepEqual(formulaCols.rows[0].fields.map((f) => f.value), ["30", "31"]);

  const statusBoard = run('TABLE due, if(due < date(today), "late", "on time") AS "When" FROM #work WHERE status != "done" GROUP BY status');
  assert.deepEqual(statusBoard.rows.map((r) => [r.group, r.fields[1].value]), [["active", "on time"], ["blocked", "late"], ["—", "on time"]]);

  const links = run('TABLE file.outlinks AS "Out", file.inlinks AS "In" FROM "Projects" WHERE file.name = "Alpha"');
  assert.deepEqual(links.rows[0].fields.map((f) => f.value), ["Beta, Gamma", "Beta, Dune"]);
  assert.deepEqual(ids(run('LIST WHERE contains(file.outlinks, [[Alpha]])')), ["beta", "book"]);
  assert.deepEqual(sortedIds(run('LIST FROM "Projects" WHERE file.hasTag("launch") OR status = "blocked"')), ["alpha", "beta"]);
  assert.deepEqual(ids(run('LIST FROM "Projects" WHERE !contains(file.tags, "#work")')), []);

  const typoProp = run('TABLE stauts FROM "Projects"');
  assert.equal(typoProp.error, null);
  assert.match(typoProp.fieldNote, /“stauts”.*Did you mean “status”\?/);
  assert.match(run('TABLE stauts AS "S" FROM "Projects"').fieldNote, /No note in scope has the property “stauts”\. Did you mean “status”\?/);

  const columnFail = run('TABLE number(author) * 2 AS "Twice" FROM "Reading"');
  assert.equal(columnFail.error, null);
  assert.ok(columnFail.rows.every((r) => r.fields[0].value === "⚠" || r.fields[0].value === "—"));

  for (const q of ['LIST FROM "Nope"', 'TABLE status AS "S" FROM "Nope"']) {
    const missingFolder = run(q);
    assert.match(missingFolder.error, /No folder/);
    assert.equal(missingFolder.problem.clause, "FROM");
    assert.equal(q.slice(missingFolder.problem.start, missingFolder.problem.end), '"Nope"');
  }
}

// --- Notes without a loaded body wait instead of silently missing.
{
  resetVaultIndex();
  const partial = {
    p: folder("p", "Projects"),
    seen: note("seen", "Projects/Seen.md", "---\nstatus: active\n---\n", { parentId: "p" }),
    later: { id: "later", path: "Projects/Later.md", name: "Later.md", kind: "note", parentId: "p", mtime: 1 },
  };
  const q = 'LIST FROM "Projects" WHERE status = "active"';
  const model = runNexusQuery(q, partial, null, NOW);
  assert.deepEqual(ids(model), ["seen"]);
  assert.match(model.fieldNote, /1 note is not loaded/);
  assert.deepEqual(frontmatterHydrateIds(q, partial), ["later"]);
  assert.deepEqual(frontmatterHydrateIds('LIST FROM "Projects" SORT file.mtime', partial), []);
}

// --- Large vaults: scoped queries read the folder or tag index, not the vault.
{
  resetVaultIndex();
  const big = {};
  const FOLDERS = 40;
  const PER = 500;
  for (let f = 0; f < FOLDERS; f += 1) {
    big[`f${f}`] = folder(`f${f}`, `Area ${f}`);
    for (let n = 0; n < PER; n += 1) {
      const id = `n${f}_${n}`;
      big[id] = note(id, `Area ${f}/Note ${n}.md`, `---\nstatus: ${n % 3 === 0 ? "done" : "open"}\nscore: ${n % 17}\n---\n# Note ${n}\n${n % 50 === 0 ? "#flag" : ""}\n`, {
        parentId: `f${f}`,
        mtime: NOW - n * 60_000,
      });
    }
  }
  ensureVaultIndex(big);
  const warm = runNexusQuery('TABLE score FROM "Area 7" WHERE status = "open" SORT score DESC LIMIT 20', big, null, NOW);
  assert.equal(warm.error, null);
  let t = performance.now();
  for (let i = 0; i < 20; i += 1) {
    runNexusQuery(`TABLE score, status FROM "Area ${i}" WHERE status = "open" AND score > 3 SORT score DESC LIMIT 50`, big, null, NOW);
  }
  const perFolder = (performance.now() - t) / 20;
  const scoped = runNexusQuery('TABLE score FROM "Area 3" WHERE status = "open" AND score > 3 SORT score DESC', big, null, NOW);
  assert.equal(scoped.total, Array.from({ length: PER }, (_, n) => n).filter((n) => n % 3 !== 0 && n % 17 > 3).length);
  t = performance.now();
  const wide = runNexusQuery('LIST WHERE file.mtime > date(today) - 1d SORT file.mtime DESC LIMIT 10', big, null, NOW);
  const vaultWideMs = performance.now() - t;
  assert.equal(wide.rows.length, 10);
  assert.ok(perFolder < 60, `a folder query over a ${FOLDERS * PER}-note vault took ${perFolder.toFixed(1)} ms`);
  assert.ok(vaultWideMs < 1500, `a vault-wide metadata query took ${vaultWideMs.toFixed(0)} ms`);
  console.log(`query-dialect perf: ${FOLDERS * PER} notes · folder query ${perFolder.toFixed(1)} ms · vault-wide ${vaultWideMs.toFixed(0)} ms`);
}

// --- The folder index keeps up when a create and a delete land together.
{
  resetVaultIndex();
  const before = { r: folder("r", "R"), a: note("a", "R/A.md", "", { parentId: "r" }), b: note("b", "R/B.md", "", { parentId: "r" }) };
  assert.deepEqual(ensureVaultIndex(before).getChildIds("r").sort(), ["a", "b"]);
  const after = { r: before.r, a: before.a, c: note("c", "R/C.md", "", { parentId: "r" }) };
  assert.deepEqual(ensureVaultIndex(after).getChildIds("r").sort(), ["a", "c"]);
  assert.deepEqual(sortedIds(runNexusQuery('LIST FROM "R"', after)), ["a", "c"]);
}

// --- Empty blocks offer starters that work on this vault.
{
  resetVaultIndex();
  invalidateVaultTagsCache();
  const demo = buildDemoVault();
  const starters = queryStarters(demo.nodes);
  assert.ok(starters.length >= 3);
  for (const starter of starters) {
    const model = runNexusQuery(starter.query, demo.nodes, null, Date.now());
    assert.equal(model.error, null, `${starter.label}: ${model.error}`);
    assert.ok(model.rows.length > 0, `${starter.label} found nothing`);
  }
  assert.ok(starters.some((s) => /^TABLE/.test(s.query) && /FROM "/.test(s.query)));
  assert.ok(starters.some((s) => /^CARDS/.test(s.query)));
}

// --- ```dataview renders natively and saves back as ```dataview; dataviewjs is never run.
{
  const md = '# Plan\n\n```dataview\nTABLE status FROM "Projects"\nWHERE status != "done"\n```\n\n```nexus-query\nLIST FROM #idea\n```\n\n```dataviewjs\ndv.list([1])\n```\n';
  const html = markdownToHtml(md);
  assert.match(html, /data-type="nexus-query"[^>]*data-lang="dataview"/);
  assert.match(html, /language-dataviewjs/);
  assert.equal((html.match(/data-type="nexus-query"/g) || []).length, 2);
  const back = htmlToMarkdown(html);
  assert.match(back, /```dataview\nTABLE status FROM "Projects"\nWHERE status != "done"\n```/);
  assert.match(back, /```nexus-query\nLIST FROM #idea\n```/);
  assert.match(back, /```dataviewjs\ndv\.list\(\[1\]\)\n```/);
  const promoted = promoteNexusQueryBlocks(marked.parse("```dataviewjs\nx\n```"));
  assert.doesNotMatch(promoted, /data-type="nexus-query"/);

  const win = domino.createWindow(
    '<div id="pm"><p>Before</p><div data-type="nexus-query" data-query="LIST FROM #idea" data-lang="dataview" class="nexus-note-list"><div class="nexus-query-head">LIST FROM #idea</div><div>2 notes</div></div><div data-type="embed" data-embed-target="Welcome" class="nexus-embed"><div>Welcome</div></div><div data-type="mermaid" data-source="graph TD; A-->B" class="nexus-mermaid"><svg></svg></div><p>After</p></div>',
  );
  const savedHtmlElement = globalThis.HTMLElement;
  globalThis.HTMLElement = win.HTMLElement;
  try {
    const saved = htmlDocToMarkdown(win.document.getElementById("pm"));
    assert.equal(saved, "Before\n\n```dataview\nLIST FROM #idea\n```\n\n![[Welcome]]\n\n```mermaid\ngraph TD; A-->B\n```\n\nAfter\n");
  } finally {
    globalThis.HTMLElement = savedHtmlElement;
  }
}

// --- Bases views filter with the same WHERE.
const tableNotes = Object.values(vault)
  .filter((n) => n.kind === "note")
  .map((n) => ({ id: n.id, path: n.path, name: n.name, content: n.content, mtime: n.mtime }));
{
  const plain = buildNoteTable(tableNotes, "Projects", [], NOW);
  assert.equal(plain.rows.length, 4);
  assert.equal(plain.filterStatus.problem, null);
  const open = buildNoteTable(tableNotes, "Projects", [], NOW, 'status != "done" AND due < date(today) + 7d');
  assert.deepEqual(open.rows.map((r) => r.id).sort(), ["alpha", "beta"]);
  const byFormula = buildNoteTable(tableNotes, "", [{ id: "score", name: "Score", expr: "priority * 10" }], NOW, "formula.score >= 20");
  assert.deepEqual(byFormula.rows.map((r) => r.id).sort(), ["alpha", "gamma"]);
  const tagged = buildNoteTable(tableNotes, "", [], NOW, 'file.hasTag("book") OR contains(file.links, link("Gamma"))');
  assert.deepEqual(tagged.rows.map((r) => r.id).sort(), ["alpha", "book", "book2"]);
  const broken = buildNoteTable(tableNotes, "Projects", [], NOW, 'status = "x" AND lenght(file.name) > 2');
  assert.equal(broken.rows.length, 4, "a broken filter keeps every note");
  assert.match(broken.filterStatus.problem.message, /Did you mean length\(\)/);
  assert.equal('status = "x" AND lenght(file.name) > 2'.slice(broken.filterStatus.problem.start, broken.filterStatus.problem.end), "lenght(file.name)");
  const pending = buildNoteTable(
    [...tableNotes, { id: "unloaded", path: "Projects/Unloaded.md", name: "Unloaded.md", mtime: 1 }],
    "Projects",
    [],
    NOW,
    'status = "active"',
  );
  assert.deepEqual(pending.rows.map((r) => r.id).sort(), ["alpha", "unloaded"]);
  assert.equal(pending.filterStatus.pending, 1);
  const metaOnly = buildNoteTable(
    [...tableNotes, { id: "unloaded", path: "Projects/Unloaded.md", name: "Unloaded.md", mtime: 1 }],
    "Projects",
    [],
    NOW,
    'file.name != "Alpha"',
  );
  assert.deepEqual(metaOnly.rows.map((r) => r.id).sort(), ["beta", "gamma", "old", "unloaded"]);
  assert.equal(metaOnly.filterStatus.pending, 0);

  assert.equal(parseBasesSession(JSON.stringify({ activeId: "all", views: [{ name: "x", filter: "a = 1" }] })).views[0].filter, "a = 1");
  assert.equal(defaultBasesSession().views[0].filter, "");
}

// --- A view copied as a query shows the same notes.
{
  const view = {
    ...defaultBasesSession().views[0],
    name: "Open work",
    folder: "Projects",
    filter: 'status != "done"',
    columns: ["status", "due"],
    formulas: [
      { id: "score", name: "Score", expr: "priority * 10" },
      { id: "next", name: "Next", expr: "formula.score + 1" },
    ],
    column: "formula:score",
    dir: "desc",
    groupBy: null,
    layout: "table",
  };
  const { text, notes } = basesViewToQuery(view, []);
  assert.equal(
    text,
    'TABLE status, due, priority * 10 AS "Score", (priority * 10) + 1 AS "Next"\nFROM "Projects"\nWHERE status != "done"\nSORT priority * 10 DESC',
  );
  assert.deepEqual(notes, []);
  const model = runNexusQuery(text, vault, null, NOW);
  assert.equal(model.error, null);
  const table = buildNoteTable(tableNotes, view.folder, view.formulas, NOW, view.filter);
  assert.deepEqual(ids(model), table.rows.sort((a, b) => b.formulas.score.sort - a.formulas.score.sort).map((r) => r.id));
  assert.deepEqual(model.rows[0].fields.map((f) => f.value), ["active", "2026-10-05", "20", "21"]);
  const odd = basesViewToQuery({ ...view, columns: ["due date", "from"], formulas: [], column: "name", dir: "asc", query: "abc", layout: "cards", groupBy: { column: "status", dir: "desc" } }, []);
  assert.equal(odd.text, 'CARDS note["due date"] AS "due date", note["from"] AS "from"\nFROM "Projects"\nWHERE status != "done"\nGROUP BY status');
  assert.equal(runNexusQuery(odd.text, vault, null, NOW).error, null);
  assert.equal(odd.notes.length, 2);
}

// --- .base files: every filter imports, and edits write back.
{
  const obsidian = `filters:
  and:
    - file.inFolder("Projects")
views:
  - type: table
    name: Active
    filters:
      or:
        - 'status == "active"'
        - and:
            - 'priority <= 1'
            - not:
                - file.hasTag("archive-me")
    order:
      - file.name
      - status
`;
  const imported = importBaseFile(obsidian);
  assert.ok(!("error" in imported));
  const view = imported.session.views[0];
  assert.equal(view.folder, "Projects");
  assert.equal(view.filter, 'status == "active" || (priority <= 1 && !(file.hasTag("archive-me")))');
  assert.deepEqual(imported.notes, []);
  const rows = buildNoteTable(tableNotes, view.folder, view.formulas, NOW, view.filter);
  assert.deepEqual(rows.rows.map((r) => r.id).sort(), ["alpha", "beta"]);

  const exported = exportBaseFile({ ...imported.session, views: [{ ...view, filter: 'status = "active" AND due < date(today) + 7d' }, imported.session.views[1]] }, []);
  assert.match(exported.text, /- file\.inFolder\("Projects"\)\n\s+- status == "active"\n\s+- due < today\(\) \+ "7d"/);
  const again = importBaseFile(exported.text);
  assert.equal(again.session.views[0].filter, 'status == "active" && due < today() + "7d"');

  const read = readLiveBase(obsidian);
  assert.ok(read.ok);
  assert.equal(read.session.views[0].filter, view.filter);
  assert.equal(writeLiveBase({ text: obsidian, session: read.session }, read.session, []), obsidian, "no change, no rewrite");
  const edited = structuredClone(read.session);
  edited.views[0].filter = 'status = "blocked"';
  const written = writeLiveBase({ text: obsidian, session: read.session }, edited, []);
  assert.match(written, /filters:\n\s+and:\n\s+- file\.inFolder\("Projects"\)\nviews:/, "the file-wide folder stays");
  assert.match(written, /name: Active\n\s+filters:\n\s+and:\n\s+- status == "blocked"/);
  assert.doesNotMatch(written, /priority <= 1/);
  const reread = readLiveBase(written);
  assert.ok(reread.ok);
  assert.equal(reread.session.views[0].filter, 'status = "blocked"', "the typed spelling comes back from the nexus block");
  assert.equal(reread.outside, false);
  const outsideEdit = written.replace('status == "blocked"', 'status == "active"');
  const readOutside = readLiveBase(outsideEdit);
  assert.ok(readOutside.ok);
  assert.equal(readOutside.session.views[0].filter, 'status == "active"', "an edit made elsewhere wins");
}

console.log("query-dialect: PASS");
