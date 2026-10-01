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

const { tasksInNote, completeTaskLine, taskMatchesPath, dueOnTaskLine } = await import(
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
assert.equal(tasks[1].due, null);
assert.equal(tasks[2].text, "Nested");
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
assert.ok(Date.now() - started < 200);

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
const rail = readFileSync("src/components/right/TasksRail.tsx", "utf8");
assert.match(rail, /setActiveNote\(task\.noteId/);
assert.match(rail, /completeTaskLine/);
assert.doesNotMatch(rail, /Dataview query language/);

console.log("tasks: PASS");
