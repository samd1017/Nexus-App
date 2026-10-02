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

const { tasksInNote, completeTaskLine, taskMatchesPath, dueOnTaskLine, taskDueBucket, localToday } = await import(
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
assert.equal(taskDueBucket("2026-10-03", today), null);
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
assert.equal(dated.find((task) => task.text === "Line today").due, "2026-10-02");
assert.equal(pool.filter((task) => taskDueBucket(task.due, today) === "today" && task.text === "Line future").length, 0);
assert.equal(pool.filter((task) => taskDueBucket(task.due, today) != null && task.text === "No due").length, 0);
assert.equal(inBucket("today").some((task) => task.path.startsWith("Journal")), false);

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
assert.match(help, /Recurrence/);
assert.match(help, /Due today and Overdue/);
assert.doesNotMatch(help, /due: frontmatter/);
const rail = readFileSync("src/components/right/TasksRail.tsx", "utf8");
assert.match(rail, /due:/);
assert.match(rail, /Recurrence/);
assert.match(rail, /tasks-filter-due-today/);
assert.match(rail, /tasks-filter-overdue/);
assert.match(rail, /Due today/);
assert.match(rail, /Overdue/);
assert.match(rail, /taskDueBucket/);
assert.doesNotMatch(rail, /due: frontmatter/);
assert.match(rail, /setActiveNote\(task\.noteId/);
assert.match(rail, /completeTaskLine/);
assert.doesNotMatch(rail, /Dataview query language/);

console.log("tasks: PASS");
