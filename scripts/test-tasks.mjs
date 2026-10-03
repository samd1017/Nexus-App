/**
 * Tasks: the line grammar, recurrence, write-back to the note, quick add,
 * editor checkbox flips, the rail's views, and TASK query blocks.
 */
import assert from "node:assert/strict";

if (!process.env.NEXUS_TSX) {
  const { spawnSync } = await import("node:child_process");
  const r = spawnSync("npx", ["--yes", "tsx", "scripts/test-tasks.mjs"], {
    cwd: process.cwd(),
    encoding: "utf8",
    timeout: 120_000,
    env: { ...process.env, NEXUS_TSX: "1" },
  });
  if (r.stdout) process.stdout.write(r.stdout);
  if (r.stderr) process.stderr.write(r.stderr);
  process.exit(r.status ?? 1);
}

const { readFileSync } = await import("node:fs");
const { parseTaskLine } = await import("../src/lib/tasks/syntax.ts");
const { tasksInNote, taskUrgency, taskMatchesPath, taskDueBucket, PER_NOTE_CAP } = await import("../src/lib/tasks/extract.ts");
const { parseRecurrence, nextOccurrence } = await import("../src/lib/tasks/recurrence.ts");
const { resolveNaturalDate, localToday, friendlyDay, addMonths } = await import("../src/lib/tasks/dates.ts");
const edit = await import("../src/lib/tasks/edit.ts");
const { groupTasks, viewCounts, filterAsQuery, openTaskTags, EMPTY_FILTER } = await import("../src/lib/tasks/filter.ts");
const { runNexusQuery, parseNexusQuery, taskQueryProps } = await import("../src/lib/vault/nexus-query.ts");
const { resetVaultIndex } = await import("../src/lib/vault/indexes.ts");
const { invalidateVaultTagsCache } = await import("../src/lib/vault/tags.ts");

const TODAY = "2026-10-02"; // a Friday
const note = (body, path = "Day.md", id = "n1") => tasksInNote({ id, path, title: path.replace(/\.md$/, "").split("/").pop(), body }, TODAY);
const ok = (result) => {
  assert.equal(result.ok, true, result.reason);
  return result.markdown;
};
const ref = (task) => ({ line: task.line, raw: task.raw });

// ---------------------------------------------------------------- grammar
{
  const p = parseTaskLine("- [ ] Pay rent #home ⏫ 🔁 every month 🛫 2026-10-01 ⏳ 2026-10-03 📅 2026-10-05 ➕ 2026-09-30 🆔 rent1 ^blk", TODAY);
  assert.equal(p.status, "todo");
  assert.equal(p.text, "Pay rent #home");
  assert.deepEqual(p.tags, ["#home"]);
  assert.equal(p.priority, "high");
  assert.equal(p.recurrence, "every month");
  assert.ok(p.rule);
  assert.equal(p.start, "2026-10-01");
  assert.equal(p.scheduled, "2026-10-03");
  assert.equal(p.due, "2026-10-05");
  assert.equal(p.created, "2026-09-30");
  assert.equal(p.id, "rent1");
  assert.equal(p.blockId, "blk");
  assert.equal(p.format, "emoji");
  assert.deepEqual(p.problems, []);
}
{
  // Every status Obsidian Tasks writes by default, every list marker, quotes and numbered lists.
  assert.equal(parseTaskLine("- [x] a").status, "done");
  assert.equal(parseTaskLine("- [X] a").status, "done");
  assert.equal(parseTaskLine("- [/] a").status, "doing");
  assert.equal(parseTaskLine("- [-] a").status, "cancelled");
  assert.equal(parseTaskLine("* [ ] a").status, "todo");
  assert.equal(parseTaskLine("+ [ ] a").status, "todo");
  assert.equal(parseTaskLine("1. [ ] a").status, "todo");
  assert.equal(parseTaskLine("> - [ ] quoted").text, "quoted");
  assert.equal(parseTaskLine("- [ ]"), null);
  assert.equal(parseTaskLine("- [] a"), null);
  assert.equal(parseTaskLine("plain text"), null);
  // Priorities as Obsidian Tasks reads them.
  assert.equal(parseTaskLine("- [ ] a 🔺").priority, "highest");
  assert.equal(parseTaskLine("- [ ] a ⏫").priority, "high");
  assert.equal(parseTaskLine("- [ ] a ❗").priority, "high");
  assert.equal(parseTaskLine("- [ ] a 🔼").priority, "medium");
  assert.equal(parseTaskLine("- [ ] a 🔽").priority, "low");
  assert.equal(parseTaskLine("- [ ] a ⏬").priority, "lowest");
  assert.equal(parseTaskLine("- [ ] a").priority, "none");
}
{
  // Dataview field spellings read the same.
  const p = parseTaskLine("- [x] Ship [due:: 2026-10-05] [priority:: high] [repeat:: every week] [completion:: 2026-10-02] [owner:: Sam]");
  assert.equal(p.format, "field");
  assert.equal(p.due, "2026-10-05");
  assert.equal(p.priority, "high");
  assert.equal(p.recurrence, "every week");
  assert.equal(p.done, "2026-10-02");
  assert.equal(p.fields.owner, "Sam");
  assert.equal(p.text, "Ship");
}
{
  // Pointed problems, each with a fix where one is clear.
  const bad = parseTaskLine("- [ ] Call 📅 tomorrow", TODAY);
  assert.equal(bad.due, null);
  assert.equal(bad.problems.length, 1);
  assert.match(bad.problems[0].message, /due date/);
  assert.equal(bad.problems[0].fix, "2026-10-03");
  const impossible = parseTaskLine("- [ ] Call 📅 2026-02-30", TODAY);
  assert.match(impossible.problems[0].message, /2026-02-30/);
  const dup = parseTaskLine("- [ ] Call 📅 2026-10-05 📅 2026-10-06", TODAY);
  assert.equal(dup.due, "2026-10-05");
  assert.equal(dup.text, "Call");
  assert.match(dup.problems[0].message, /more than one|twice|second/i);
  const order = parseTaskLine("- [ ] Call 🛫 2026-10-09 📅 2026-10-05", TODAY);
  assert.match(order.problems[0].message, /start/i);
  const rule = parseTaskLine("- [ ] Call 🔁 every blue moon", TODAY);
  assert.equal(rule.rule, null);
  assert.match(rule.problems[0].message, /every blue moon/);
  const word = parseTaskLine("- [ ] Call [priority:: urgent]", TODAY);
  assert.match(word.problems[0].message, /urgent/);
}
{
  // A whole note: frontmatter and code fences are not tasks; note due: fills in; nesting is kept.
  const tasks = note(
    [
      "---",
      "due: 2026-10-20",
      "tasks: - [ ] not a task",
      "---",
      "- [ ] Parent 📅 2026-10-05",
      "  - [ ] Child",
      "    - [x] Grandchild ✅ 2026-10-01",
      "```",
      "- [ ] in a fence",
      "```",
      "- [ ]",
      "1. [/] Numbered",
    ].join("\n"),
  );
  assert.deepEqual(
    tasks.map((t) => [t.text, t.line, t.depth, t.parentLine, t.due, t.dueFromNote]),
    [
      ["Parent", 5, 0, null, "2026-10-05", false],
      ["Child", 6, 1, 5, "2026-10-20", true],
      ["Grandchild", 7, 2, 6, "2026-10-20", true],
      ["Numbered", 12, 0, null, "2026-10-20", true],
    ],
  );
  assert.equal(tasks[2].status, "done");
  assert.equal(tasks[2].done, "2026-10-01");
  assert.equal(tasks[3].status, "doing");
  assert.equal(note('---\ndue: "2026-10-15"\n---\n- [ ] q')[0].due, "2026-10-15");
  assert.equal(note("---\ndue: tomorrow\n---\n- [ ] q")[0].due, null);
  assert.equal(taskMatchesPath({ path: "Projects/A.md" }, "projects"), true);
  assert.equal(taskDueBucket("2026-10-01", TODAY), "overdue");
}
{
  // A huge checklist note still reads fast and stops at the cap.
  const big = Array.from({ length: PER_NOTE_CAP + 500 }, (_, i) => `- [ ] item ${i} 📅 2026-10-0${(i % 9) + 1} #t${i % 7}`).join("\n");
  const started = performance.now();
  const many = note(big, "Big.md");
  const ms = performance.now() - started;
  assert.equal(many.length, PER_NOTE_CAP);
  assert.ok(ms < 400, `parsing ${PER_NOTE_CAP} tasks took ${ms} ms`);
}

// ---------------------------------------------------------------- dates and recurrence
assert.equal(resolveNaturalDate("today", TODAY), "2026-10-02");
assert.equal(resolveNaturalDate("tomorrow", TODAY), "2026-10-03");
assert.equal(resolveNaturalDate("mon", TODAY), "2026-10-05");
assert.equal(resolveNaturalDate("friday", TODAY), "2026-10-09");
assert.equal(resolveNaturalDate("next week", TODAY), "2026-10-09");
assert.equal(resolveNaturalDate("in 3 days", TODAY), "2026-10-05");
assert.equal(resolveNaturalDate("oct 5", TODAY), "2026-10-05");
assert.equal(resolveNaturalDate("sep 1", TODAY), "2027-09-01");
assert.equal(resolveNaturalDate("2026/1/5", TODAY), "2026-01-05");
assert.equal(resolveNaturalDate("someday", TODAY), null);
assert.equal(localToday(new Date(2026, 9, 2, 23, 59)), "2026-10-02");
assert.equal(friendlyDay("2026-10-02", TODAY), "Today");
assert.equal(friendlyDay("2026-10-03", TODAY), "Tomorrow");
assert.equal(addMonths("2026-01-31", 1), "2026-02-28");

const next = (rule, basis) => nextOccurrence(parseRecurrence(rule), basis);
assert.equal(next("every day", "2026-10-02"), "2026-10-03");
assert.equal(next("every 2 weeks", "2026-10-02"), "2026-10-16");
assert.equal(next("every month", "2026-01-31"), "2026-02-28");
assert.equal(next("every year", "2028-02-29"), "2029-02-28");
assert.equal(next("every weekday", "2026-10-02"), "2026-10-05");
assert.equal(next("every mon, wed", "2026-10-05"), "2026-10-07");
assert.equal(next("every month on the 15th", "2026-10-02"), "2026-10-15");
assert.equal(next("every month on the last friday", "2026-10-02"), "2026-10-30");
assert.equal(next("every month on the last", "2026-02-10"), "2026-02-28");
assert.equal(next("every year on march 3", "2026-10-02"), "2027-03-03");
assert.equal(next("weekly", "2026-10-02"), "2026-10-09");
assert.equal(parseRecurrence("every week when done").whenDone, true);
assert.equal(parseRecurrence("every blue moon"), null);

// ---------------------------------------------------------------- write-back
{
  const md = "# Day\n\n- [ ] Water plants 🔁 every 3 days ⏳ 2026-09-30 📅 2026-10-01 ^w\n- [ ] Other\n";
  const [water] = note(md);
  const done = ok(edit.toggleTask(md, ref(water), TODAY));
  assert.equal(
    done,
    "# Day\n\n- [ ] Water plants 🔁 every 3 days ⏳ 2026-10-03 📅 2026-10-04\n- [x] Water plants 🔁 every 3 days ⏳ 2026-09-30 📅 2026-10-01 ✅ 2026-10-02 ^w\n- [ ] Other\n",
  );
  // Ticking it back clears the done date (the next copy stays, as in Obsidian Tasks).
  const doneTask = note(done).find((t) => t.status === "done");
  const reopened = ok(edit.toggleTask(done, ref(doneTask), TODAY));
  assert.match(reopened, /^- \[ \] Water plants 🔁 every 3 days ⏳ 2026-09-30 📅 2026-10-01 \^w$/m);

  // "when done" counts from today, not from the old date.
  const whenDone = "- [ ] Haircut 🔁 every 4 weeks when done 📅 2026-09-01\n";
  assert.match(ok(edit.toggleTask(whenDone, ref(note(whenDone)[0]), TODAY)), /^- \[ \] Haircut 🔁 every 4 weeks when done 📅 2026-10-30$/m);

  // No date on the line: the next copy gets one; a note due: is the basis.
  const yaml = "---\ndue: 2026-10-02\n---\n- [ ] Review 🔁 every week\n";
  assert.match(ok(edit.toggleTask(yaml, ref(note(yaml)[0]), TODAY)), /^- \[ \] Review 🔁 every week 📅 2026-10-09$/m);

  // 🏁 delete: the finished copy goes away, only the next one stays.
  const del = "- [ ] Standup 🔁 every weekday 🏁 delete 📅 2026-10-02\n";
  assert.equal(ok(edit.toggleTask(del, ref(note(del)[0]), TODAY)), "- [ ] Standup 🔁 every weekday 🏁 delete 📅 2026-10-05\n");

  // Dataview-style lines stay Dataview-style.
  const dv = "- [ ] Ship [due:: 2026-10-05]\n";
  assert.equal(ok(edit.toggleTask(dv, ref(note(dv)[0]), TODAY)), "- [x] Ship [due:: 2026-10-05] [completion:: 2026-10-02]\n");
  assert.equal(ok(edit.setTaskPriority(dv, ref(note(dv)[0]), "high")), "- [ ] Ship [due:: 2026-10-05] [priority:: high]\n");

  // Cancel, start, dates, priority, all on the one line.
  const one = "- [ ] Call Sam ⏫ ^c\n";
  const t = note(one)[0];
  assert.equal(ok(edit.setTaskStatus(one, ref(t), "cancelled", TODAY)), "- [-] Call Sam ⏫ ❌ 2026-10-02 ^c\n");
  assert.equal(ok(edit.setTaskStatus(one, ref(t), "doing", TODAY)), "- [/] Call Sam ⏫ ^c\n");
  assert.equal(ok(edit.setTaskDate(one, ref(t), "due", "2026-10-09")), "- [ ] Call Sam ⏫ 📅 2026-10-09 ^c\n");
  assert.equal(ok(edit.setTaskPriority(one, ref(t), "lowest")), "- [ ] Call Sam ⏬ ^c\n");
  assert.equal(ok(edit.setTaskPriority(one, ref(t), "none")), "- [ ] Call Sam ^c\n");
  const dated = ok(edit.setTaskDate(one, ref(t), "due", "2026-10-09"));
  assert.equal(ok(edit.setTaskDate(dated, ref(note(dated)[0]), "due", null)), one);
  assert.equal(edit.setTaskDate(one, ref(t), "due", "soon").ok, false);

  // Fix buttons rewrite just the bad token.
  const badMd = "- [ ] Call 📅 tomorrow\n";
  const bad = note(badMd)[0];
  assert.equal(ok(edit.fixTaskProblem(badMd, ref(bad), bad.problems[0])), "- [ ] Call 📅 2026-10-03\n");
  const dupMd = "- [ ] Call 📅 2026-10-05 📅 2026-10-06\n";
  const dupTask = note(dupMd)[0];
  assert.equal(ok(edit.fixTaskProblem(dupMd, ref(dupTask), dupTask.problems[0])), "- [ ] Call 📅 2026-10-05\n");

  // The note changed under the list: a moved line is found again; a rewritten one is refused.
  const before = "- [ ] A\n- [ ] B\n";
  const b = note(before)[1];
  assert.equal(ok(edit.toggleTask("- [ ] new first\n" + before, ref(b), TODAY)), "- [ ] new first\n- [ ] A\n- [x] B ✅ 2026-10-02\n");
  const refused = edit.toggleTask("- [ ] A\n- [ ] B changed\n", ref(b), TODAY);
  assert.equal(refused.ok, false);
  assert.equal(refused.reason, edit.TASK_MOVED);

  // CRLF notes keep CRLF.
  const crlf = "- [ ] A\r\n- [ ] B\r\n";
  assert.equal(ok(edit.toggleTask(crlf, ref(note(crlf)[0]), TODAY)), "- [x] A ✅ 2026-10-02\r\n- [ ] B\r\n");
}

// ---------------------------------------------------------------- ticking a box in the note editor
{
  const prev = "# Day\n- [ ] Water 🔁 every day 📅 2026-10-02\n- [ ] Plain\n";
  const ticked = prev.replace("- [ ] Water", "- [x] Water");
  assert.equal(
    edit.applyCheckboxFlips(prev, ticked, TODAY),
    "# Day\n- [ ] Water 🔁 every day 📅 2026-10-03\n- [x] Water 🔁 every day 📅 2026-10-02 ✅ 2026-10-02\n- [ ] Plain\n",
  );
  const plain = prev.replace("- [ ] Plain", "- [x] Plain");
  assert.equal(edit.applyCheckboxFlips(prev, plain, TODAY), "# Day\n- [ ] Water 🔁 every day 📅 2026-10-02\n- [x] Plain ✅ 2026-10-02\n");
  const doneBefore = "- [x] Plain ✅ 2026-10-01\n";
  assert.equal(edit.applyCheckboxFlips(doneBefore, "- [ ] Plain ✅ 2026-10-01\n", TODAY), "- [ ] Plain\n");
  // Typing anywhere else is left alone.
  assert.equal(edit.applyCheckboxFlips(prev, prev.replace("# Day", "# Days"), TODAY), null);
  assert.equal(edit.applyCheckboxFlips(prev, ticked.replace("Plain", "Plainer"), TODAY), null);
}

// ---------------------------------------------------------------- quick add
{
  const c = edit.composeTaskLine("Call Sam tomorrow !high #home", TODAY);
  assert.equal(c.line, "- [ ] Call Sam #home ⏫ 📅 2026-10-03");
  assert.equal(c.warning, null);
  assert.equal(edit.composeTaskLine("Pay rent due oct 5 every month", TODAY).line, "- [ ] Pay rent 🔁 every month 📅 2026-10-05");
  assert.equal(edit.composeTaskLine("Standup every weekday", TODAY).line, "- [ ] Standup 🔁 every weekday 📅 2026-10-02");
  assert.equal(edit.composeTaskLine("Read scheduled mon !!!", TODAY).line, "- [ ] Read 🔺 ⏳ 2026-10-05");
  assert.equal(edit.composeTaskLine("Buy milk", TODAY).line, "- [ ] Buy milk");
  assert.match(edit.composeTaskLine("Moon every blue moon", TODAY).warning, /blue moon/);

  // Into the daily skeleton's empty placeholder, else after the last task, else at the end.
  const daily = "# Fri\n\n## Focus\n\n- [ ] \n\n## Notes\n";
  assert.deepEqual(edit.insertTaskLine(daily, "- [ ] New"), { markdown: "# Fri\n\n## Focus\n\n- [ ] New\n\n## Notes\n", line: 5 });
  const list = "# P\n- [ ] One\n  - [ ] Sub\nText\n";
  assert.deepEqual(edit.insertTaskLine(list, "- [ ] Two"), { markdown: "# P\n- [ ] One\n  - [ ] Sub\n- [ ] Two\nText\n", line: 4 });
  assert.equal(edit.insertTaskLine("# Empty\n\n", "- [ ] One").markdown, "# Empty\n\n- [ ] One\n");
}

// ---------------------------------------------------------------- the vault used by the rail and TASK queries
const bodies = {
  "Journal/2026-10-02.md": [
    "# Fri",
    "- [ ] Overdue bill 📅 2026-09-28 ⏫",
    "- [ ] Due today #home 📅 2026-10-02",
    "- [ ] Scheduled today ⏳ 2026-10-02 🔽",
    "- [ ] Not started yet ⏳ 2026-10-01 🛫 2026-10-10",
    "- [x] Finished ✅ 2026-10-01",
    "- [-] Dropped ❌ 2026-09-30",
  ].join("\n"),
  "Projects/Alpha.md": [
    "---",
    "tags: [work]",
    "---",
    "- [ ] Write spec 📅 2026-10-04 🔺 🆔 spec",
    "- [ ] Review spec ⛔ spec 📅 2026-10-06",
    "- [ ] Someday idea",
    "- [/] In flight #deep 📅 2026-10-30",
    "- [ ] Weekly sync 🔁 every week 📅 2026-10-09",
  ].join("\n"),
  "Projects/Beta.md": "- [ ] Beta task #home\n- [ ] Bad date 📅 2026-13-01\n",
  "Notes/Plain.md": "No tasks here.\n",
};
const nodes = {
  fJ: { id: "fJ", path: "Journal", name: "Journal", kind: "folder", parentId: null, mtime: 0 },
  fP: { id: "fP", path: "Projects", name: "Projects", kind: "folder", parentId: null, mtime: 0 },
  fN: { id: "fN", path: "Notes", name: "Notes", kind: "folder", parentId: null, mtime: 0 },
};
const parentOf = { Journal: "fJ", Projects: "fP", Notes: "fN" };
const all = [];
for (const [path, content] of Object.entries(bodies)) {
  const id = `n:${path}`;
  nodes[id] = { id, path, name: path.split("/").pop(), kind: "note", parentId: parentOf[path.split("/")[0]], mtime: 0, content };
  all.push(...tasksInNote({ id, path, title: path.split("/").pop().replace(/\.md$/, ""), body: content }, TODAY));
}
resetVaultIndex?.();
invalidateVaultTagsCache?.();
const texts = (list) => list.map((t) => t.text);
const groupTexts = (groups) => groups.map((g) => [g.label, texts(g.tasks)]);

// ---------------------------------------------------------------- rail views
{
  const f = (patch) => ({ ...EMPTY_FILTER, ...patch });
  assert.deepEqual(groupTexts(groupTasks(all, f({ view: "today" }), TODAY)), [
    ["Overdue", ["Overdue bill"]],
    ["Today", ["Due today #home", "Scheduled today"]],
  ]);
  const upcoming = groupTasks(all, f({ view: "upcoming" }), TODAY);
  assert.deepEqual(upcoming.map((g) => g.label).slice(0, 2), ["Sun, Oct 4", "Tue, Oct 6"].map((l) => upcoming.find((g) => g.key === (l.includes("4") ? "2026-10-04" : "2026-10-06")).label));
  assert.deepEqual(texts(upcoming.find((g) => g.key === "2026-10-04").tasks), ["Write spec"]);
  assert.deepEqual(texts(upcoming.find((g) => g.key === "later").tasks), ["Not started yet", "In flight #deep"]);
  assert.deepEqual(texts(groupTasks(all, f({ view: "nodate" }), TODAY)[0].tasks).sort(), ["Beta task #home", "Bad date", "Someday idea"].sort());
  assert.deepEqual(texts(groupTasks(all, f({ view: "done" }), TODAY)[0].tasks), ["Finished", "Dropped"]);
  assert.deepEqual(texts(groupTasks(all, f({ view: "note", noteId: "n:Projects/Beta.md" }), TODAY)[0].tasks), ["Beta task #home", "Bad date"]);
  assert.deepEqual(texts(groupTasks(all, f({ view: "open", tag: "home" }), TODAY)[0].tasks), ["Due today #home", "Beta task #home"]);
  assert.deepEqual(texts(groupTasks(all, f({ view: "open", path: "projects/" , minPriority: "high" }), TODAY)[0].tasks), ["Write spec"]);
  assert.deepEqual(texts(groupTasks(all, f({ view: "open", search: "spec review" }), TODAY)[0].tasks), ["Review spec"]);
  const counts = viewCounts(all, f({ noteId: "n:Projects/Beta.md" }), TODAY);
  assert.deepEqual(counts, { today: 3, upcoming: 5, nodate: 3, open: 11, done: 2, note: 2 });
  assert.deepEqual(openTaskTags(all).map((t) => t.tag), ["home", "deep"]);
  // Open first, most urgent first.
  const open = groupTasks(all, f({ view: "open" }), TODAY)[0].tasks;
  assert.deepEqual(texts(open.slice(0, 2)), ["Write spec", "Overdue bill"]);
  assert.ok(taskUrgency(open[0], TODAY) >= taskUrgency(open[1], TODAY));
}

// ---------------------------------------------------------------- TASK query blocks
const NOW = new Date(2026, 9, 2, 12, 0).getTime();
const run = (q, host = null) => runNexusQuery(q, nodes, null, NOW, host, all);
const qtexts = (m) => {
  assert.equal(m.error, null, m.error);
  return m.tasks.map((r) => r.task.text);
};
{
  assert.equal(parseNexusQuery("TASK").kind, "dialect");
  assert.equal(parseNexusQuery("TASK").query.view, "task");
  assert.equal(parseNexusQuery("tasks where !done").query.view, "task");
  assert.equal(run("TASK").mode, "task");
  assert.equal(run("TASK").tasks.length, all.length);
  assert.deepEqual(qtexts(run("TASK WHERE !done AND due <= date(today)")).sort(), ["Overdue bill", "Due today #home"].sort());
  assert.deepEqual(qtexts(run('TASK FROM "Projects" WHERE !completed SORT priority')).slice(0, 1), ["Write spec"]);
  assert.deepEqual(qtexts(run("TASK FROM #home")).sort(), ["Beta task #home", "Due today #home"].sort());
  assert.equal(run("TASK FROM #work").tasks.length, 5, "a note tag scopes every task in that note");
  assert.deepEqual(qtexts(run("TASK FROM #work AND -#deep WHERE open SORT due DESC LIMIT 2")), ["Weekly sync", "Review spec"]);
  assert.deepEqual(qtexts(run("TASK WHERE blocked")), ["Review spec"]);
  assert.deepEqual(qtexts(run("TASK WHERE recurring")), ["Weekly sync"]);
  assert.deepEqual(qtexts(run("TASK WHERE doing")), ["In flight #deep"]);
  assert.deepEqual(qtexts(run('TASK WHERE status = "cancelled"')), ["Dropped"]);
  assert.deepEqual(qtexts(run('TASK WHERE contains(tags, "#deep")')), ["In flight #deep"]);
  assert.deepEqual(qtexts(run('TASK WHERE file.hasTag("deep")')), ["In flight #deep"]);
  assert.deepEqual(qtexts(run("TASK WHERE completion = date(2026-10-01)")), ["Finished"]);
  assert.deepEqual(qtexts(run("TASK WHERE overdue")), ["Overdue bill"]);
  assert.deepEqual(qtexts(run('TASK WHERE file.name = "Beta"')), ["Beta task #home", "Bad date"]);
  const grouped = run('TASK FROM "Journal" WHERE open GROUP BY file.name');
  assert.ok(grouped.tasks.every((r) => r.group === "2026-10-02"));
  const byPriority = run("TASK WHERE open GROUP BY priority");
  assert.deepEqual([...new Set(byPriority.tasks.map((r) => r.group))], ["highest", "high", "none", "low"]);
  assert.deepEqual(qtexts(run("TASK FROM [[]] WHERE open", "n:Projects/Beta.md")), []);
  assert.equal(run("TASK WHERE line = this.file.name", null).error !== null, true);
  // The same view in the rail and as a copied query shows the same tasks.
  for (const view of ["today", "upcoming", "nodate", "open", "done"]) {
    const filter = { ...EMPTY_FILTER, view, path: view === "open" ? "Projects" : "" };
    const rail = groupTasks(all, filter, TODAY).flatMap((g) => g.tasks).map((t) => t.raw).sort();
    const query = run(filterAsQuery(filter));
    assert.deepEqual(query.tasks.map((r) => r.task.raw).sort(), rail, `${view}: ${filterAsQuery(filter)}`);
  }
  const tagged = { ...EMPTY_FILTER, view: "open", tag: "home", minPriority: "none", search: "beta" };
  assert.deepEqual(run(filterAsQuery(tagged)).tasks.map((r) => r.task.text), ["Beta task #home"]);
}
{
  // Errors point at the clause.
  const cols = run("TASK text, due");
  assert.match(cols.error, /TASK shows the task lines themselves/);
  assert.equal(cols.problem.clause, "TASK");
  const folder = run('TASK FROM "Nowhere"');
  assert.match(folder.error, /No folder matches “Nowhere”/);
  const typo = run("TASK WHERE prority = \"high\"");
  assert.match(typo.fieldNote, /No task has “prority”\. Did you mean “priority”\?/);
  assert.match(run("SORT x").error, /Start with LIST, TABLE, CARDS, or TASK/);
  assert.equal(run("TASK WHERE !done").footer.includes("Ticking a box here writes the note"), true);
}
{
  const props = taskQueryProps(all.find((t) => t.text === "Write spec"), TODAY);
  assert.equal(props.priority, "highest");
  assert.equal(props.due, "2026-10-04");
  assert.equal(props.done, "false");
  assert.equal(props.id, "spec");
}

// ---------------------------------------------------------------- ```tasks blocks written for the Tasks plugin
{
  const { tasksBlockToQuery, tasksDateRange, applyRewrite, blockQuery } = await import("../src/lib/tasks/tasks-block.ts");
  const { headingText } = await import("../src/lib/tasks/extract.ts");
  const { promoteNexusQueryBlocks } = await import("../src/lib/editor/special-blocks.ts");
  const plan = (src, host = null) => tasksBlockToQuery(src, TODAY, host);
  const ordered = (src, host = null) => {
    const p = plan(src, host);
    assert.deepEqual(p.problems.filter((x) => x.blocking), [], src);
    return qtexts(run(p.query));
  };
  const block = (src, host = null) => ordered(src, host).sort();
  const journalOpen = ["Due today #home", "Not started yet", "Overdue bill", "Scheduled today"];

  // Status, dates, and ranges.
  assert.deepEqual(block("done"), ["Dropped", "Finished"]);
  assert.deepEqual(block("not done\ndue before tomorrow"), ["Due today #home", "Overdue bill"]);
  assert.deepEqual(block("due today"), ["Due today #home"]);
  assert.deepEqual(block("due on 2026-10-04"), ["Write spec"]);
  assert.deepEqual(block("due this week"), ["Due today #home", "Overdue bill", "Write spec"]);
  assert.deepEqual(block("due after 2026-10-06\nnot done"), ["In flight #deep", "Weekly sync"]);
  assert.deepEqual(block("scheduled on today"), ["Scheduled today"]);
  assert.deepEqual(block("has start date\nstarts after today"), ["Not started yet"]);
  assert.deepEqual(block("happens before tomorrow\nnot done"), journalOpen);
  assert.deepEqual(block("done on 2026-10-01"), ["Finished"]);
  assert.deepEqual(block("no due date\nnot done\npath includes alpha"), ["Someday idea"]);
  // Priority.
  assert.deepEqual(block("priority is high"), ["Overdue bill"]);
  assert.deepEqual(block("priority is above medium"), ["Overdue bill", "Write spec"]);
  assert.deepEqual(block("priority is below none"), ["Scheduled today"]);
  // Path, file name, heading, description, tags.
  assert.deepEqual(block("path includes Projects/Beta"), ["Bad date", "Beta task #home"]);
  assert.deepEqual(block("filename includes Beta.md"), ["Bad date", "Beta task #home"]);
  assert.deepEqual(block("heading includes fri\nnot done"), journalOpen);
  assert.deepEqual(block("description includes SPEC"), ["Review spec", "Write spec"]);
  assert.deepEqual(block("description does not include spec\npath includes alpha"), ["In flight #deep", "Someday idea", "Weekly sync"]);
  assert.deepEqual(block("tags include #home"), ["Beta task #home", "Due today #home"]);
  assert.deepEqual(block("is recurring"), ["Weekly sync"]);
  assert.deepEqual(block("status.type is in_progress"), ["In flight #deep"]);
  // AND / OR / NOT groups.
  assert.deepEqual(block("(due today) OR (priority is highest)"), ["Due today #home", "Write spec"]);
  assert.deepEqual(block("NOT (path includes projects)\nnot done"), journalOpen);
  assert.deepEqual(block("(not done) AND NOT (path includes projects)"), journalOpen);
  assert.deepEqual(block('("not done") AND ((due before today) OR (priority is low))'), ["Overdue bill", "Scheduled today"]);
  // Sort, group, limit, and lines that only change the look.
  assert.deepEqual(ordered("not done\nsort by due\nlimit 3"), ["Overdue bill", "Due today #home", "Write spec"]);
  assert.deepEqual(ordered("not done\nsort by priority\nlimit 1"), ["Write spec"]);
  assert.deepEqual(ordered("not done\nhas due date\nsort by due reverse\nlimit 1"), ["In flight #deep"]);
  const grouped = run(plan("not done\ngroup by heading\npath includes journal").query);
  assert.deepEqual([...new Set(grouped.tasks.map((r) => r.group))], ["Fri"]);
  const quiet = plan("# my comment\nnot done\nhide edit button\nshort mode\nshow tree");
  assert.deepEqual(quiet.problems, []);
  assert.equal(quiet.query, "TASK\nWHERE open");
  assert.equal(plan("not done\nexplain").explain, true);
  assert.deepEqual(block(""), all.map((t) => t.text).sort(), "an empty block lists every task, as the plugin does");
  // {{query.file.*}} reads the note the block is in.
  assert.deepEqual(block("path includes {{query.file.folder}}\nnot done\nno due date", { path: "Projects/Beta.md" }), ["Beta task #home", "Bad date", "Someday idea"].sort());
  // Lines that cannot be read point at the line and offer a rewrite.
  const typo = plan("not done\ndew today");
  assert.deepEqual(typo.problems.map((p) => [p.line, p.blocking, p.rewrite]), [[1, true, "due today"]]);
  assert.equal(applyRewrite("not done\n  dew today", typo.problems[0]), "not done\n  due today");
  assert.equal(plan("not done AND due today").problems[0].rewrite, "(not done) AND (due today)");
  assert.equal(plan("path regex matches /alpha/i").problems[0].rewrite, "path includes alpha");
  assert.match(plan("filter by function task.urgency > 5").problems[0].message, /does not run code/);
  assert.match(plan("due on someday").problems[0].message, /“someday” is not a day/);
  const soft = plan("not done\nsort by tag\ngroup by filename\ngroup by priority");
  assert.deepEqual(soft.problems.map((p) => [p.line, p.blocking]), [[1, false], [3, false]], "a sort or group that cannot be read is skipped, not fatal");
  assert.match(soft.query, /GROUP BY file\.name/);
  // Date words.
  assert.deepEqual(tasksDateRange("next month", TODAY), ["2026-11-01", "2026-11-30"]);
  assert.deepEqual(tasksDateRange("last week", TODAY), ["2026-09-21", "2026-09-27"]);
  assert.deepEqual(tasksDateRange("this quarter", TODAY), ["2026-10-01", "2026-12-31"]);
  assert.deepEqual(tasksDateRange("in two weeks", TODAY), ["2026-10-16", "2026-10-16"]);
  assert.deepEqual(tasksDateRange("3 days ago", TODAY), ["2026-09-29", "2026-09-29"]);
  assert.deepEqual(tasksDateRange("2026-10-09 2026-10-01", TODAY), ["2026-10-01", "2026-10-09"]);
  // Headings on tasks, other fences untouched, and the fence kept on disk.
  assert.equal(headingText("## Errands ##"), "Errands");
  assert.equal(headingText("#tag line"), null);
  assert.equal(all.find((t) => t.text === "Overdue bill").heading, "Fri");
  assert.equal(all.find((t) => t.text === "Write spec").heading, null);
  assert.deepEqual(blockQuery("TASK WHERE open", "nexus-query", TODAY, null), { query: "TASK WHERE open", plan: null });
  assert.match(promoteNexusQueryBlocks('<pre><code class="language-tasks">not done\n</code></pre>'), /data-type="nexus-query" data-query="not done" data-lang="tasks"/);
  const { htmlToMarkdown } = await import("../src/lib/markdown/serialize.ts");
  assert.equal(htmlToMarkdown('<div data-type="nexus-query" data-query="not done&#10;due today" data-lang="tasks"></div>').trim(), "```tasks\nnot done\ndue today\n```");
}

// ---------------------------------------------------------------- the demo vault's Task Board
{
  const { buildDemoVault } = await import("../src/lib/vault/demo-vault.ts");
  resetVaultIndex?.();
  invalidateVaultTagsCache?.();
  const demo = buildDemoVault();
  const demoTasks = Object.values(demo.nodes)
    .filter((n) => n.kind === "note" && /\.md$/.test(n.path))
    .flatMap((n) => tasksInNote({ id: n.id, path: n.path, title: n.name.replace(/\.md$/, ""), body: n.content }));
  const board = Object.values(demo.nodes).find((n) => n.path === "Projects/Task Board.md");
  const boardTasks = demoTasks.filter((t) => t.noteId === board.id);
  assert.ok(boardTasks.length >= 12);
  assert.equal(boardTasks.filter((t) => t.problems.length).map((t) => t.text).join(), "Try a natural date: fix this one");
  assert.ok(boardTasks.some((t) => t.recurring && t.recurrence === "every week on friday"));
  const blocks = [...board.content.matchAll(/```nexus-query\n([\s\S]*?)\n```/g)].map((m) => m[1]);
  assert.equal(blocks.length, 2);
  for (const block of blocks) {
    const model = runNexusQuery(block, demo.nodes, null, Date.now(), board.id, demoTasks);
    assert.equal(model.error, null, `${block}: ${model.error}`);
    assert.ok(model.tasks.length > 0, `${block} found nothing`);
    assert.equal(model.fieldNote, null, model.fieldNote);
  }
  const { blockQuery } = await import("../src/lib/tasks/tasks-block.ts");
  const plugin = [...board.content.matchAll(/```tasks\n([\s\S]*?)\n```/g)].map((m) => m[1]);
  assert.equal(plugin.length, 1);
  const { query, plan } = blockQuery(plugin[0], "tasks", localToday(), { path: board.path });
  assert.deepEqual(plan.problems, []);
  assert.ok(runNexusQuery(query, demo.nodes, null, Date.now(), board.id, demoTasks).tasks.length > 0);
}

// ---------------------------------------------------------------- a Visual save writes task lines back as typed
{
  const { htmlToMarkdown } = await import("../src/lib/markdown/serialize.ts");
  const item = (text, { checked = false, status = null, nested = "" } = {}) =>
    `<li data-type="taskItem" data-checked="${checked}"${status ? ` data-status="${status}"` : ""}><label><input type="checkbox"${checked ? " checked" : ""}></label><div><p>${text}</p>${nested}</div></li>`;
  const list = (...items) => `<ul data-type="taskList">${items.join("")}</ul>`;
  assert.equal(
    htmlToMarkdown(
      list(
        item("doing", { status: "/" }),
        item("was doing", { status: "/", checked: true }),
        item("dropped ❌ 2026-09-30", { status: "-" }),
        item("parent", { nested: list(item("child", { nested: list(item("grandchild", { checked: true })) })) }),
      ),
    ),
    "- [/] doing\n- [x] was doing\n- [-] dropped ❌ 2026-09-30\n- [ ] parent\n  - [ ] child\n    - [x] grandchild\n",
    "status symbols and every nesting level survive",
  );
  assert.equal(
    htmlToMarkdown("<p>Fields [owner:: Sam] and [due:: 2026-10-03], text [a](b), [ref]: x</p>"),
    "Fields [owner:: Sam] and [due:: 2026-10-03], text \\[a\\](b), \\[ref\\]: x\n",
    "brackets that cannot start a link are written as typed",
  );
  assert.equal(
    htmlToMarkdown("<ul data-bullet=\"disc\"><li><p>a bullet</p></li><li><p>[ ] task kept as text</p></li></ul>"),
    "- a bullet\n- [ ] task kept as text\n",
  );
  assert.equal(
    htmlToMarkdown(
      '<table><tr><th>Write</th><th>Means</th></tr><tr><td><code>- [ ]</code></td><td>to do <span data-wikilink="Task Board" data-alias="Task Board">Task Board</span></td></tr></table>',
    ),
    "| Write | Means |\n| --- | --- |\n| `- [ ]` | to do [[Task Board]] |\n",
    "table cells keep code and links",
  );
  assert.equal(htmlToMarkdown("<ol><li><p>[ ] one</p></li><li><p>[x] two</p></li></ol>"), "1. [ ] one\n2. [x] two\n");

  const serialize = readFileSync("src/lib/markdown/serialize.ts", "utf8");
  assert.match(serialize, /export function markdownWithWikilinksToHtml\(md: string\): string \{\n  return markdownToHtml\(md, \{ editor: true \}\);/);
  assert.match(serialize, /Array\.from\(root\.querySelectorAll\("ul, ol"\)\)\.reverse\(\)/, "subtask lists convert before their parents");
  assert.match(readFileSync("src/components/editor/VisualEditor.tsx", "utf8"), /StatusTaskItem\.configure\(/);
  assert.match(readFileSync("src/lib/markdown/sanitize-html.ts", "utf8"), /"data-status"/);
}

// ---------------------------------------------------------------- Preview wiring
{
  const preview = readFileSync("src/lib/editor/hydrate-preview.ts", "utf8");
  assert.match(preview, /if \(found < 0\) continue;/, "a box with no matching line stays read-only");
  assert.match(preview, /await whenTasksReady\(\)/);
  assert.match(preview, /data-task-toggle/);
  const sourcePreview = readFileSync("src/components/editor/SourcePreview.tsx", "utf8");
  assert.match(sourcePreview, /editTask\(/);
  assert.match(sourcePreview, /refreshTaskQueries\(/);
  assert.match(sourcePreview, /wirePreviewTaskBoxes\(root/);
  assert.match(sourcePreview, /onContextMenu=\{taskMenu\}/, "right-click on a task in Preview opens the task menu");
  assert.match(sourcePreview, /<TaskMenuAt/);
  assert.match(sourcePreview, /tasks\[ \\t\]\*\$/, "a ```tasks block refreshes when tasks change");
  assert.match(preview, /export function previewTaskAt\(/);
  assert.match(preview, /blockQuery\(written, fence/);
  assert.match(readFileSync("src/components/editor/NexusQueryView.tsx", "utf8"), /blockQuery\(written, fence/);
  assert.doesNotMatch(readFileSync("src/lib/tasks/tasks-block.ts", "utf8"), /\beval\(|new Function\(/);
}

// ---------------------------------------------------------------- wiring
{
  const panel = readFileSync("src/components/right/RightPanel.tsx", "utf8");
  assert.match(panel, /TasksRail/);
  assert.match(panel, /\["tasks", ListChecks, "Tasks"\]/);
  const rail = readFileSync("src/components/right/TasksRail.tsx", "utf8");
  assert.match(rail, /useTaskIndex\(\)/);
  assert.match(rail, /tasks-quick-add/);
  assert.match(rail, /filterAsQuery/);
  assert.match(rail, /tasks-empty/);
  assert.doesNotMatch(rail, /TASK_CAP/);
  const view = readFileSync("src/components/editor/NexusQueryView.tsx", "utf8");
  assert.match(view, /useTaskIndex\(/);
  assert.match(view, /<TaskRow /);
  const editor = readFileSync("src/components/editor/VisualEditor.tsx", "utf8");
  assert.match(editor, /applyCheckboxFlips\(prev, md, localToday\(\)\)/);
  const actions = readFileSync("src/lib/tasks/actions.ts", "utf8");
  assert.match(actions, /updateNoteContent\(task\.noteId, result\.markdown, \{ source: true \}\)/);
  for (const file of ["src/lib/tasks/syntax.ts", "src/lib/tasks/edit.ts", "src/lib/tasks/filter.ts", "src/lib/tasks/task-index.ts"]) {
    const src = readFileSync(file, "utf8");
    assert.doesNotMatch(src, /\beval\(|new Function\(/, `${file} runs no code from notes`);
  }
}

console.log("tasks: PASS");
