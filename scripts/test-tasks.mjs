/**
 * Built-in tasks: open checkboxes, one due pattern, complete flips the line.
 */
import assert from "node:assert/strict";

if (!process.env.NEXUS_TSX) {
  const { spawnSync } = await import("node:child_process");
  const r = spawnSync("npx", ["--yes", "tsx", "scripts/test-tasks.mjs"], {
    cwd: process.cwd(),
    encoding: "utf8",
    timeout: 30_000,
    env: { ...process.env, NEXUS_TSX: "1" },
  });
  if (r.stdout) process.stdout.write(r.stdout);
  if (r.stderr) process.stderr.write(r.stderr);
  process.exit(r.status ?? 1);
}

const { tasksInNote, completeTaskLine, taskMatchesPath, dueOnTaskLine, taskDueBucket, localToday, priorityOnTaskLine, taskIsHigh, taskIsMedium, taskIsLow, recurrenceOnTaskLine } = await import(
  "../src/lib/tasks/extract.ts"
);

const body = [
  "---",
  "due: 2020-01-01",
  "---",
  "",
  "- [x] already done",
  "- [ ] Buy milk 📅 2026-04-01",
  "* [ ] Call home",
  "  - [ ] Nested",
  "- [ ]",
].join("\n");

const tasks = tasksInNote({ id: "n1", path: "Day.md", title: "Day", body });
assert.equal(tasks.length, 3);
assert.equal(tasks[0].text, "Buy milk");
assert.equal(tasks[0].priority, null);
assert.equal(tasks[0].recurrence, null);
assert.equal(tasks[0].due, "2026-04-01");
assert.equal(tasks[0].line, 6);
assert.equal(tasks[1].text, "Call home");
assert.equal(tasks[1].due, "2020-01-01");
assert.equal(tasks[2].text, "Nested");
assert.equal(tasks[2].due, "2020-01-01");
assert.equal(dueOnTaskLine("no date"), null);
assert.equal(taskMatchesPath(tasks[0], "day"), true);
assert.equal(taskMatchesPath(tasks[0], "Other"), false);

const done = completeTaskLine(body, 6);
assert.ok(done);
assert.match(done, /- \[x\] Buy milk/);
assert.equal(completeTaskLine(body, 5), null);
assert.equal(tasksInNote({ id: "n1", path: "Day.md", title: "Day", body: done }).some((t) => t.text === "Buy milk"), false);

const big = Array.from({ length: 2000 }, (_, i) => `- [ ] item ${i}`).join("\n");
const started = Date.now();
const many = tasksInNote({ id: "n", path: "Big.md", title: "Big", body: big });
assert.equal(many.length, 40);
assert.equal(many[0].due, null);
assert.ok(Date.now() - started < 200);

const quoted = tasksInNote({
  id: "q",
  path: "Quoted.md",
  title: "Quoted",
  body: '---\ndue: "2026-10-15"\n---\n\n- [ ] Inherit yaml\n- [ ] Line wins 📅 2026-10-05\n',
});
assert.equal(quoted[0].due, "2026-10-15");
assert.equal(quoted[1].due, "2026-10-05");
assert.equal(quoted[1].text, "Line wins");

const bad = tasksInNote({
  id: "b",
  path: "Bad.md",
  title: "Bad",
  body: "---\ndue: tomorrow\n---\n\n- [ ] No date\n",
});
assert.equal(bad[0].due, null);

const today = "2026-10-02";
assert.equal(taskDueBucket("2026-10-02", today), "today");
assert.equal(taskDueBucket("2026-10-01", today), "overdue");
assert.equal(taskDueBucket("2020-01-01", today), "overdue");
assert.equal(taskDueBucket("2026-10-03", today), "upcoming");
assert.equal(taskDueBucket("2027-01-15", today), "upcoming");
assert.equal(taskDueBucket(null, today), null);
assert.equal(taskDueBucket("tomorrow", today), null);
assert.match(localToday(new Date(2026, 9, 2, 15, 0)), /^2026-10-02$/);

const dated = tasksInNote({
  id: "due",
  path: "Research/Callouts.md",
  title: "Callouts",
  body: [
    "---",
    "due: 2026-09-01",
    "---",
    "",
    "- [ ] Inherit overdue",
    "- [ ] Line today 📅 2026-10-02",
    "- [ ] Line future 📅 2026-10-03",
  ].join("\n"),
});
const undated = tasksInNote({
  id: "plain",
  path: "Journal/Plain.md",
  title: "Plain",
  body: "- [ ] No due\n",
});
const pool = [...dated, ...undated];
const inBucket = (bucket) =>
  pool.filter((task) => taskDueBucket(task.due, today) === bucket && taskMatchesPath(task, "Research"));
assert.deepEqual(inBucket("today").map((task) => task.text), ["Line today"]);
assert.deepEqual(inBucket("overdue").map((task) => task.text), ["Inherit overdue"]);
assert.deepEqual(inBucket("upcoming").map((task) => task.text), ["Line future"]);
assert.equal(dated.find((task) => task.text === "Line today").due, "2026-10-02");
assert.equal(pool.filter((task) => taskDueBucket(task.due, today) === "today" && task.text === "Line future").length, 0);
assert.equal(pool.filter((task) => taskDueBucket(task.due, today) === "overdue" && task.text === "Line future").length, 0);
assert.equal(pool.filter((task) => taskDueBucket(task.due, today) != null && task.text === "No due").length, 0);
assert.equal(inBucket("upcoming").some((task) => task.text === "Line today" || task.text === "Inherit overdue" || task.text === "No due"), false);
assert.equal(inBucket("today").some((task) => task.path.startsWith("Journal")), false);

assert.equal(priorityOnTaskLine("Ship ⏫"), "highest");
assert.equal(priorityOnTaskLine("Lift 🔼"), "high");
assert.equal(priorityOnTaskLine("Mid 🔽"), "medium");
assert.equal(priorityOnTaskLine("Later ⏬"), "low");
assert.equal(priorityOnTaskLine("Bang ❗"), "high-alt");
assert.equal(priorityOnTaskLine("plain"), null);
assert.equal(priorityOnTaskLine("first 🔽 then ⏫"), "medium");
assert.equal(taskIsHigh("highest"), true);
assert.equal(taskIsHigh("high-alt"), true);
assert.equal(taskIsHigh("high"), false);
assert.equal(taskIsHigh("medium"), false);
assert.equal(taskIsHigh("low"), false);
assert.equal(taskIsHigh(null), false);
assert.equal(taskIsMedium("medium"), true);
assert.equal(taskIsMedium("low"), false);
assert.equal(taskIsMedium("high"), false);
assert.equal(taskIsMedium("highest"), false);
assert.equal(taskIsMedium("high-alt"), false);
assert.equal(taskIsMedium(null), false);
assert.equal(taskIsLow("low"), true);
assert.equal(taskIsLow("medium"), false);
assert.equal(taskIsLow("high"), false);
assert.equal(taskIsLow("highest"), false);
assert.equal(taskIsLow(null), false);

const ranked = tasksInNote({
  id: "pri",
  path: "Research/Ranked.md",
  title: "Ranked",
  body: [
    "- [ ] Ship highest ⏫",
    "- [ ] Alt high ❗ 📅 2026-10-02",
    "- [ ] Medium down 🔽",
    "- [ ] Low down ⏬",
    "- [ ] Unmarked plain",
    "- [ ] Elsewhere ⏫",
  ].join("\n"),
});
ranked[5].path = "Journal/Elsewhere.md";
assert.equal(ranked.find((task) => task.text === "Ship highest").priority, "highest");
assert.equal(ranked.find((task) => task.text === "Alt high").priority, "high-alt");
assert.equal(ranked.find((task) => task.text === "Alt high").due, "2026-10-02");
assert.equal(ranked.find((task) => task.text === "Medium down").priority, "medium");
assert.equal(ranked.find((task) => task.text === "Low down").priority, "low");
assert.equal(ranked.find((task) => task.text === "Unmarked plain").priority, null);
const highHere = ranked.filter((task) => taskIsHigh(task.priority) && taskMatchesPath(task, "Research"));
assert.deepEqual(highHere.map((task) => task.text), ["Ship highest", "Alt high"]);
assert.equal(highHere.some((task) => task.text === "Medium down" || task.text === "Low down" || task.text === "Unmarked plain"), false);
const medHere = ranked.filter((task) => taskIsMedium(task.priority) && taskMatchesPath(task, "Research"));
assert.deepEqual(medHere.map((task) => task.text), ["Medium down"]);
const lowHere = ranked.filter((task) => taskIsLow(task.priority) && taskMatchesPath(task, "Research"));
assert.deepEqual(lowHere.map((task) => task.text), ["Low down"]);
assert.equal(medHere.some((task) => taskIsHigh(task.priority) || taskIsLow(task.priority)), false);
assert.equal(lowHere.some((task) => taskIsHigh(task.priority) || taskIsMedium(task.priority)), false);

assert.equal(recurrenceOnTaskLine("Water 🔁 every day"), "every day");
assert.equal(recurrenceOnTaskLine("Water 🔁 every week"), "every week");
assert.equal(recurrenceOnTaskLine("Water 🔁 every week 📅 2026-10-02 ⏫"), "every week");
assert.equal(recurrenceOnTaskLine("plain"), null);
assert.equal(recurrenceOnTaskLine("Water 🔁"), null);
const recurred = tasksInNote({
  id: "rec",
  path: "Research/Loop.md",
  title: "Loop",
  body: [
    "- [ ] Water 🔁 every day 📅 2026-10-02 ⏫",
    "- [ ] Weekly 🔁 every week",
    "- [ ] Once",
    "- [ ] Elsewhere 🔁 every day",
  ].join("\n"),
});
recurred[3].path = "Journal/Elsewhere.md";
assert.equal(recurred[0].text, "Water");
assert.equal(recurred[0].recurrence, "every day");
assert.equal(recurred[0].due, "2026-10-02");
assert.equal(recurred[0].priority, "highest");
assert.equal(recurred[1].recurrence, "every week");
assert.equal(recurred[2].recurrence, null);
const recurringHere = recurred.filter((task) => task.recurrence && taskMatchesPath(task, "Research"));
assert.deepEqual(recurringHere.map((task) => task.text), ["Water", "Weekly"]);
const recurBody = "- [ ] Water 🔁 every day 📅 2026-10-02\n";
const recurDone = completeTaskLine(recurBody, 1);
assert.match(recurDone, /- \[x\] Water 🔁 every day 📅 2026-10-02/);
assert.equal(recurDone.split("\n").filter((line) => line.includes("[ ]")).length, 0);
assert.equal(tasksInNote({ id: "rec", path: "Research/Loop.md", title: "Loop", body: recurDone }).length, 0);

const { readFileSync } = await import("node:fs");
const panel = readFileSync("src/components/right/RightPanel.tsx", "utf8");
assert.match(panel, /TasksRail/);
assert.match(panel, /\["tasks", ListChecks, "Tasks"\]/);
const palette = readFileSync("src/components/search/CommandPalette.tsx", "utf8");
assert.match(palette, /label: "Tasks"/);
assert.match(palette, /setRightTab\("tasks"\)/);
const welcome = readFileSync("src/components/vault/WelcomeScreen.tsx", "utf8");
assert.match(welcome, /Tasks list/);
assert.match(welcome, /No plugin API/);
const help = readFileSync("src/components/settings/SettingsPanel.tsx", "utf8");
assert.match(help, /Dataview queries are not supported/);
assert.match(help, /recurrence/i);
assert.match(help, /Due today and Overdue/);
assert.match(help, /Upcoming keeps incomplete tasks whose due date is after today/);
assert.match(help, /High keeps incomplete tasks marked/);
assert.match(help, /Med keeps incomplete tasks marked/);
assert.match(help, /Low keeps incomplete tasks marked/);
assert.match(help, /Dataview queries are not supported/);
assert.match(help, /does not schedule the next one/);
assert.doesNotMatch(help, /Recurrence and Dataview queries are not supported/);
assert.doesNotMatch(help, /priorities, and Dataview/);
assert.doesNotMatch(help, /due: frontmatter/);
const rail = readFileSync("src/components/right/TasksRail.tsx", "utf8");
assert.match(rail, /due:/);
assert.match(rail, /recurrence/i);
assert.match(rail, /tasks-filter-due-today/);
assert.match(rail, /tasks-filter-overdue/);
assert.match(rail, /tasks-filter-upcoming/);
assert.match(rail, /Due today/);
assert.match(rail, /Overdue/);
assert.match(rail, /Upcoming keeps incomplete tasks due after this local day/);
assert.match(rail, /taskDueBucket/);
assert.match(rail, /tasks-filter-high/);
assert.match(rail, /taskIsHigh/);
assert.match(rail, /tasks-filter-medium/);
assert.match(rail, /tasks-filter-low/);
assert.match(rail, /taskIsMedium/);
assert.match(rail, /taskIsLow/);
assert.match(rail, /Med keeps those incomplete tasks/);
assert.match(rail, /Low keeps those incomplete tasks/);
assert.match(rail, /tasks-filter-recurring/);
assert.match(rail, /does not schedule the next one/);
assert.match(rail, /Dataview queries are not supported/);
assert.doesNotMatch(rail, /Recurrence and Dataview queries are not supported/);
assert.doesNotMatch(rail, /priorities, and Dataview/);
assert.doesNotMatch(rail, /due: frontmatter/);
assert.match(rail, /setActiveNote\(task\.noteId/);
assert.match(rail, /completeTaskLine/);
assert.doesNotMatch(rail, /Dataview query language/);

console.log("tasks: PASS");
