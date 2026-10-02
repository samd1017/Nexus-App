/**
 * Vault templates: variables, prompts, date math, carryover, properties.
 */
import assert from "node:assert/strict";

if (!process.env.NEXUS_TSX) {
  const { spawnSync } = await import("node:child_process");
  const r = spawnSync("npx", ["--yes", "tsx", "scripts/test-templates.mjs"], {
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
  renderTemplate,
  templatePrompts,
  usesCarryover,
  insertTemplateAt,
  appendTemplate,
  fillBlankNote,
  isBlankNote,
  mergeTemplateProperties,
} = await import("../src/lib/vault/template-engine.ts");
const { buildDailyNoteContent, buildTemplateContent, extractCarryForwardItems } = await import(
  "../src/lib/vault/templates.ts"
);
const { listVaultTemplates, findTemplateNamed, isTemplatePath, DAILY_TEMPLATE_NAMES } = await import(
  "../src/lib/vault/vault-templates.ts"
);

const date = new Date(2026, 2, 1, 9, 5); // Sun 1 Mar 2026, 09:05

// Variables
assert.equal(
  renderTemplate("# {{title}}\n{{date}} {{time}} y={{yesterday}}", { title: "Standup", date }),
  "# Standup\n2026-03-01 09:05 y=2026-02-28",
);
assert.equal(renderTemplate("{{ Title }} {{DATE}}", { title: "A", date }), "A 2026-03-01");
assert.equal(
  renderTemplate("{{date:YYYY}} {{tp.file.title}} {{nope}}", { title: "A", date }),
  "{{date:YYYY}} {{tp.file.title}} {{nope}}",
  "unknown tokens stay as written",
);
assert.equal(
  renderTemplate("{{title}}", { title: "{{date}}", date }),
  "{{date}}",
  "substituted values are not expanded again",
);

// Date math
assert.equal(renderTemplate("{{date+7}}", { title: "", date }), "2026-03-08");
assert.equal(renderTemplate("{{date-1}}", { title: "", date }), "2026-02-28");
assert.equal(renderTemplate("{{ date + 30 }}", { title: "", date }), "2026-03-31");
assert.equal(renderTemplate("{{date-366}}", { title: "", date }), "2025-02-28");
assert.equal(renderTemplate("{{date*2}}", { title: "", date }), "{{date*2}}");

// Prompts
const tpl = "With {{prompt:Attendees}} about {{prompt: Topic }}. Again: {{prompt:Attendees}}";
assert.deepEqual(templatePrompts(tpl), ["Attendees", "Topic"]);
assert.deepEqual(templatePrompts("{{title}} {{date+1}}"), []);
assert.equal(
  renderTemplate(tpl, { title: "", date, prompts: { Attendees: "Ana, Bo", Topic: "launch" } }),
  "With Ana, Bo about launch. Again: Ana, Bo",
);
assert.equal(renderTemplate("[{{prompt:Missing}}]", { title: "", date }), "[]");

// Carryover reuses the daily note helper
const yesterday = [
  "# Yesterday",
  "## Focus",
  "- [ ] Ship templates",
  "- [x] Done already",
  "## Notes",
  "- [ ] Call Ana",
].join("\n");
const items = extractCarryForwardItems(yesterday);
assert.deepEqual(items, ["- [ ] Ship templates", "- [ ] Call Ana"]);
assert.equal(usesCarryover("## Open\n{{ carryover }}\n"), true);
assert.equal(usesCarryover("## Open\n"), false);
assert.equal(
  renderTemplate("## Open\n{{carryover}}\n## Next", { title: "", date, carryover: items }),
  "## Open\n- [ ] Ship templates\n- [ ] Call Ana\n## Next",
);
assert.equal(
  renderTemplate("## Open\n{{carryover}}\n## Next", { title: "", date, carryover: [] }),
  "## Open\n## Next",
  "an empty carryover line goes away",
);

// Built-in starters render through the same engine, unchanged
assert.equal(
  buildTemplateContent("meeting", "Sync.md", date),
  "# Sync\n\n**Date:** 2026-03-01\n\n## Attendees\n\n- \n\n## Agenda\n\n1. \n\n## Notes\n\n\n## Action items\n\n- [ ] \n",
);
const daily = buildDailyNoteContent(date, yesterday);
assert.match(daily, /^# .+\n\n\*2026-03-01\*\n\n## Focus/);
assert.match(daily, /## From yesterday\n\n- \[ \] Ship templates\n- \[ \] Call Ana\n\n## Later/);

// Properties merge into the note; the note's values win
const merged = mergeTemplateProperties("---\ntags: work\n---\n\nBody", "tags: meeting\ntype: meeting\naliases:\n  - sync");
assert.equal(merged.markdown, "---\ntags: work\ntype: meeting\naliases:\n  - sync\n---\n\nBody");
assert.equal(merged.markdown.slice(merged.newBodyStart), "\nBody");
const unchanged = mergeTemplateProperties("---\ntags: work\n---\nBody", "tags: other");
assert.equal(unchanged.markdown, "---\ntags: work\n---\nBody");
const listMerge = mergeTemplateProperties("Body", "tags:\n- a\n- b");
assert.equal(listMerge.markdown, "---\ntags:\n- a\n- b\n---\n\nBody");

// Insert at the caret
const note = "---\ntags: work\n---\n\n# Plan\n\nBefore|After";
const caret = note.indexOf("|");
const ins = insertTemplateAt(note.replace("|", ""), caret, "---\nstatus: draft\n---\n\n- [ ] {{x}}\n");
assert.equal(ins.markdown, "---\ntags: work\nstatus: draft\n---\n\n# Plan\n\nBefore- [ ] {{x}}\nAfter");
assert.equal(ins.markdown.slice(0, ins.caret).endsWith("- [ ] {{x}}\n"), true);
const plain = insertTemplateAt("ab", 1, "X");
assert.deepEqual(plain, { markdown: "aXb", caret: 2 }, "a one-line template stays inline");
const block = insertTemplateAt("Intro\n\nNext\n", 5, "## Standup\n- a\n");
assert.equal(block.markdown, "Intro\n## Standup\n- a\n\n\nNext\n", "a multi-line template starts its own line");
const atLineStart = insertTemplateAt("Intro\n\nNext\n", 7, "## Standup\n- a\n");
assert.equal(atLineStart.markdown, "Intro\n\n## Standup\n- a\nNext\n");

// Blank notes take the template whole, keeping their title unless replaced
assert.equal(isBlankNote("# Untitled\n\n"), true);
assert.equal(isBlankNote("---\na: 1\n---\n\n"), true);
assert.equal(isBlankNote("# Untitled\n\ntext"), false);
assert.equal(fillBlankNote("# Untitled\n\n", "## Agenda\n- "), "# Untitled\n\n## Agenda\n- ");
assert.equal(fillBlankNote("# Untitled\n\n", "---\ntags: x\n---\n# Sync\n"), "---\ntags: x\n---\n\n# Sync\n");
assert.equal(appendTemplate("Notes\n\n\n", "More"), "Notes\n\nMore");

// Discovery: notes under the top-level Templates folder
const nodes = {
  a: { id: "a", kind: "note", path: "Templates/Meeting.md" },
  b: { id: "b", kind: "note", path: "templates/Journal/Daily.md" },
  c: { id: "c", kind: "note", path: "Notes/Templates/Not one.md" },
  d: { id: "d", kind: "folder", path: "Templates" },
  e: { id: "e", kind: "note", path: "Templates/board.canvas" },
};
assert.deepEqual(
  listVaultTemplates(nodes).map((t) => t.name),
  ["Daily", "Meeting"],
);
assert.equal(isTemplatePath("Templates.md"), false);
assert.equal(findTemplateNamed(listVaultTemplates(nodes), DAILY_TEMPLATE_NAMES)?.id, "b");
assert.equal(findTemplateNamed(listVaultTemplates(nodes), ["Project"]), null);

console.log("templates contract: OK");
