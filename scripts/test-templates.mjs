/**
 * Vault templates: variables, formats, prompts, date math, carryover,
 * properties, the folder setting, and their hotkeys.
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

// Settings persist to browser storage, which Node does not have.
const warn = console.warn;
console.warn = (...args) => {
  if (!String(args[0]).includes("[zustand persist middleware]")) warn(...args);
};

const {
  renderTemplate,
  formatDate,
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
const {
  listVaultTemplates,
  findTemplateNamed,
  isTemplatePath,
  normalizeTemplateFolder,
  templatesFolderNode,
  DAILY_TEMPLATE_NAMES,
} = await import("../src/lib/vault/vault-templates.ts");

const date = new Date(2026, 2, 1, 9, 5); // Sun 1 Mar 2026, 09:05

// Variables
assert.equal(
  renderTemplate("# {{title}}\n{{date}} {{time}} y={{yesterday}}", { title: "Standup", date }),
  "# Standup\n2026-03-01 09:05 y=2026-02-28",
);
assert.equal(renderTemplate("{{ Title }} {{DATE}}", { title: "A", date }), "A 2026-03-01");
assert.equal(
  renderTemplate("{{tp.file.title}} {{nope}} {{time+1}} {{tp.date.now()}}", { title: "A", date }),
  "{{tp.file.title}} {{nope}} {{time+1}} {{tp.date.now()}}",
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

// Formats after a colon, as in Obsidian
const fmt = (src, extra = {}) => renderTemplate(src, { title: "", date, ...extra });
assert.equal(fmt("{{date:YYYY-MM-DD}} {{time:HH:mm}}"), "2026-03-01 09:05");
assert.equal(fmt("{{date:dddd, MMMM Do YYYY}}"), "Sunday, March 1st 2026");
assert.equal(fmt("{{date:ddd D MMM YY}}"), "Sun 1 Mar 26");
assert.equal(fmt("{{ date : DD/MM/YYYY }}"), "01/03/2026");
assert.equal(fmt("{{time:h:mm A}} {{time:hh:mm a}} {{time:HH:mm:ss}}"), "9:05 AM 09:05 am 09:05:00");
assert.equal(fmt("{{date:[Week] WW, GGGG}} {{date:gggg-[W]ww}}"), "Week 09, 2026 2026-W10");
assert.equal(fmt("{{date:}}"), "2026-03-01", "an empty format is the default");
assert.equal(fmt("{{DATE:YYYY}}"), "2026");
assert.equal(fmt("{{date+7:MMM D}} {{date-1:YYYY/MM/DD}} {{yesterday:dddd}}"), "Mar 8 2026/02/28 Saturday");
assert.equal(fmt("{{date+1:YYYY-MM-DD HH:mm}}"), "2026-03-02 09:05", "date math keeps the time");
// Default formats apply to bare tokens only
assert.equal(
  fmt("{{date}} {{time}} {{yesterday}} {{date+1}} {{date:YYYY}}", { dateFormat: "DD.MM.YYYY", timeFormat: "h:mm a" }),
  "01.03.2026 9:05 am 28.02.2026 02.03.2026 2026",
);
assert.equal(fmt("{{date}}", { dateFormat: "  " }), "2026-03-01", "a blank default falls back to ISO");
assert.equal(fmt("{{date:YYYY}}", { title: "{{date:YYYY}}" }), "2026");
// Format tokens
assert.equal(formatDate(new Date(2026, 0, 11), "Do"), "11th");
assert.equal(formatDate(new Date(2026, 0, 22), "Do"), "22nd");
assert.equal(formatDate(new Date(2026, 0, 3), "Do M/D"), "3rd 1/3");
assert.equal(formatDate(date, "DDDD DDD Q E d e dd"), "060 60 1 7 0 0 Su");
assert.equal(formatDate(new Date(2026, 2, 1, 0, 7), "h k kk H"), "12 24 24 0");
assert.equal(formatDate(new Date(2026, 2, 1, 13, 7, 9, 45), "hh A SSS"), "01 PM 045");
assert.equal(formatDate(date, "[YYYY] [at] HH"), "YYYY at 09", "brackets keep text as written");
assert.equal(formatDate(date, "x") , String(date.getTime()));
assert.equal(formatDate(date, "X"), String(Math.floor(date.getTime() / 1000)));
assert.match(formatDate(date, "Z"), /^[+-]\d\d:\d\d$/);
assert.match(formatDate(date, "ZZ"), /^[+-]\d{4}$/);
// Weeks at the turn of the year
assert.equal(formatDate(new Date(2027, 0, 1), "GGGG-[W]WW"), "2026-W53");
assert.equal(formatDate(new Date(2024, 11, 30), "GGGG-[W]WW"), "2025-W01");
assert.equal(formatDate(new Date(2023, 11, 31), "gggg-[W]ww"), "2024-W01");
assert.equal(formatDate(new Date(2026, 0, 4), "gggg-[W]w"), "2026-W2");

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

// Properties merge into the note: missing ones are added, lists combine,
// empty ones fill, and any other value the note has stays
const props = (note, tpl) => mergeTemplateProperties(`---\n${note}\n---\n\nBody`, tpl).markdown;
const merged = mergeTemplateProperties("---\ntags: work\n---\n\nBody", "tags: meeting\ntype: meeting\naliases:\n  - sync");
assert.equal(merged.markdown, "---\ntags:\n  - work\n  - meeting\ntype: meeting\naliases:\n  - sync\n---\n\nBody");
assert.equal(merged.markdown.slice(merged.newBodyStart), "\nBody");
const unchanged = mergeTemplateProperties("---\nstatus: done\n---\nBody", "status: draft");
assert.equal(unchanged.markdown, "---\nstatus: done\n---\nBody", "a value the note has wins");
assert.equal(unchanged.newBodyStart, unchanged.oldBodyStart);
const listMerge = mergeTemplateProperties("Body", "tags:\n- a\n- b");
assert.equal(listMerge.markdown, "---\ntags:\n- a\n- b\n---\n\nBody");
assert.equal(props("tags: [a, b]", "tags: [b, c]"), "---\ntags: [a, b, c]\n---\n\nBody", "flow lists combine");
assert.equal(props("tags:\n- a", "tags: [A, '#c', c]"), "---\ntags:\n- a\n- '#c'\n---\n\nBody", "tags compare without case or #");
assert.equal(props("tags:\n  - a\n  - b", "tags:\n  - b\n  - a"), "---\ntags:\n  - a\n  - b\n---\n\nBody");
assert.equal(props("aliases: Sync", "aliases:\n  - Standup"), "---\naliases:\n  - Sync\n  - Standup\n---\n\nBody");
assert.equal(props("tags: a, b", "tags: c"), "---\ntags:\n  - a\n  - b\n  - c\n---\n\nBody");
assert.equal(props("people:\n  - Ana", "people: [Bo, Ana]"), "---\npeople:\n  - Ana\n  - Bo\n---\n\nBody", "any list on both sides combines");
assert.equal(props("owner: Ana", "owner: [Bo]"), "---\nowner: Ana\n---\n\nBody", "a single value is not turned into a list");
assert.equal(props("status:", "status: draft"), "---\nstatus: draft\n---\n\nBody", "an empty property is filled");
assert.equal(props("due: \"\"\ntags: []", "due: 2026-03-08\ntags: [x]"), "---\ndue: 2026-03-08\ntags: [x]\n---\n\nBody");
assert.equal(props("tags:\n  - ", "tags:\n  - x"), "---\ntags:\n  - x\n---\n\nBody");
assert.equal(props("status: done", "status:\ntags:"), "---\nstatus: done\ntags:\n---\n\nBody", "an empty template value never clears the note's");
assert.equal(
  props("\"due date\": x", "due date: y\n'Owner': z"),
  "---\n\"due date\": x\n'Owner': z\n---\n\nBody",
  "quoted and plain keys are the same property",
);
assert.equal(props("# kept\ntags: a # first", "tags: b"), "---\n# kept\ntags:\n  - a\n  - b\n---\n\nBody");
assert.equal(props("url: https://x.test/a:b", "url: https://y.test"), "---\nurl: https://x.test/a:b\n---\n\nBody");
assert.equal(props("tags: [a]", "tags: [a]\nstatus:"), "---\ntags: [a]\nstatus:\n---\n\nBody");
assert.equal(mergeTemplateProperties("Body", "").markdown, "Body");

// Insert at the caret
const note = "---\ntags: work\n---\n\n# Plan\n\nBefore|After";
const caret = note.indexOf("|");
const ins = insertTemplateAt(note.replace("|", ""), caret, "---\nstatus: draft\n---\n\n- [ ] {{x}}\n");
assert.equal(ins.markdown, "---\ntags: work\nstatus: draft\n---\n\n# Plan\n\nBefore- [ ] {{x}}\nAfter");
assert.equal(ins.markdown.slice(0, ins.caret).endsWith("- [ ] {{x}}\n"), true);
// Properties land wherever the caret is, and the body still goes at the caret
const mid = "---\ntags: [work]\nstatus: done\n---\n\n# Plan\n\nFirst line\nSecond| line";
const midIns = insertTemplateAt(
  mid.replace("|", ""),
  mid.indexOf("|"),
  "---\ntags: [meeting, work]\nstatus: draft\nowner: Ana\n---\n\nX",
);
assert.equal(
  midIns.markdown,
  "---\ntags: [work, meeting]\nstatus: done\nowner: Ana\n---\n\n# Plan\n\nFirst line\nSecondX line",
);
assert.equal(midIns.markdown.slice(0, midIns.caret).endsWith("SecondX"), true);
const inYaml = insertTemplateAt("---\ntags: a\n---\nBody", 6, "---\ntags: b\n---\nZ");
assert.equal(inYaml.markdown, "---\ntags:\n  - a\n  - b\n---\n\nBodyZ", "a caret inside the properties inserts after the note");
const onlyProps = insertTemplateAt("# T\n\nText", 5, "---\ntags: x\n---\n");
assert.equal(onlyProps.markdown, "---\ntags: x\n---\n\n# T\n\nText", "a template of only properties still applies them");
const crlf = mergeTemplateProperties("---\r\ntags: a\r\n---\r\nBody", "tags: b");
assert.equal(crlf.markdown, "---\ntags:\n  - a\n  - b\n---\n\nBody", "Windows line endings merge too");
assert.equal(appendTemplate("---\ntags: a\n---\nNotes", "---\ntags: [b]\n---\nMore"), "---\ntags:\n  - a\n  - b\n---\n\nNotes\n\nMore");
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
assert.equal(
  fillBlankNote("---\ntags: [a]\n---\n# Untitled\n", "---\ntags: [b]\nstatus: new\n---\nBody"),
  "---\ntags: [a, b]\nstatus: new\n---\n\n# Untitled\n\nBody",
);
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

// The templates folder is a setting: any vault-relative folder
assert.equal(normalizeTemplateFolder(""), "Templates");
assert.equal(normalizeTemplateFolder(undefined), "Templates");
assert.equal(normalizeTemplateFolder(" /Meta\\Templates/ "), "Meta/Templates");
assert.equal(normalizeTemplateFolder("a//b/./../c"), "a/b/c");
assert.equal(normalizeTemplateFolder("."), "Templates");
assert.equal(normalizeTemplateFolder("My: Templates?"), "My Templates");
const nested = {
  f1: { id: "f1", kind: "folder", path: "Meta" },
  f2: { id: "f2", kind: "folder", path: "Meta/Templates" },
  m1: { id: "m1", kind: "note", path: "Meta/Templates/Meeting.md" },
  m2: { id: "m2", kind: "note", path: "Meta/Templates/Weekly/Daily note.md" },
  m3: { id: "m3", kind: "note", path: "Templates/Meeting.md" },
  m4: { id: "m4", kind: "note", path: "Meta/TemplatesOld/Idea.md" },
  m5: { id: "m5", kind: "note", path: "Meta/Templates.md" },
};
assert.deepEqual(
  listVaultTemplates(nested, "Meta/Templates").map((t) => t.path),
  ["Meta/Templates/Weekly/Daily note.md", "Meta/Templates/Meeting.md"],
);
assert.deepEqual(listVaultTemplates(nested, "meta/templates/").map((t) => t.id), ["m2", "m1"]);
assert.deepEqual(listVaultTemplates(nested).map((t) => t.id), ["m3"], "the default is still Templates");
assert.equal(isTemplatePath("Meta/Templates/x.md", "Meta/Templates"), true);
assert.equal(isTemplatePath("Meta/TemplatesOld/x.md", "Meta/Templates"), false);
assert.equal(isTemplatePath("Templates/x.md", "Meta/Templates"), false);
assert.equal(templatesFolderNode(nested, "META/templates")?.id, "f2");
assert.equal(templatesFolderNode(nested, "Elsewhere"), null);
// Overrides follow the folder
const metaTemplates = listVaultTemplates(nested, "Meta/Templates");
assert.equal(findTemplateNamed(metaTemplates, ["Meeting"])?.id, "m1");
assert.equal(findTemplateNamed(metaTemplates, DAILY_TEMPLATE_NAMES)?.id, "m2");
assert.equal(findTemplateNamed(metaTemplates, ["Idea"]), null);

// Settings resolve to the folder and formats templates use
const { usePrefsStore, DEFAULT_PREFS } = await import("../src/lib/prefs/preferences.ts");
const { templateFolder, templateFormats } = await import("../src/lib/vault/templates.ts");
assert.equal(DEFAULT_PREFS.templateFolder, "Templates");
assert.equal(templateFolder(), "Templates");
usePrefsStore.getState().updatePrefs({ templateFolder: " Meta\\Templates/ " });
assert.equal(usePrefsStore.getState().templateFolder, "Meta/Templates");
assert.equal(templateFolder(), "Meta/Templates");
usePrefsStore.getState().updatePrefs({ templateFolder: "  " });
assert.equal(templateFolder(), "Templates", "a cleared folder goes back to Templates");
usePrefsStore.getState().updatePrefs({ templateDateFormat: "D MMMM YYYY", templateTimeFormat: "h:mm A" });
assert.deepEqual(templateFormats(), { dateFormat: "D MMMM YYYY", timeFormat: "h:mm A" });
assert.match(buildTemplateContent("meeting", "Sync", date), /\*\*Date:\*\* 1 March 2026\n/);
usePrefsStore.getState().resetPrefs();
assert.deepEqual(templateFormats(), { dateFormat: "YYYY-MM-DD", timeFormat: "HH:mm" });

// Hotkeys for templates, remappable like the rest
const { DEFAULT_HOTKEYS, HOTKEY_IDS, HOTKEY_LABELS, conflictingHotkeyId, sanitizeHotkeyOverrides } = await import(
  "../src/lib/prefs/hotkeys.ts"
);
for (const id of ["insertTemplate", "newFromTemplate", "insertDate", "insertTime"]) {
  assert.ok(HOTKEY_IDS.includes(id) && HOTKEY_LABELS[id] && DEFAULT_HOTKEYS[id]);
  assert.equal(conflictingHotkeyId(id, DEFAULT_HOTKEYS[id], {}), null, `${id} has a free default`);
}
assert.deepEqual(sanitizeHotkeyOverrides({ insertTemplate: { key: "I", alt: true } }), {
  insertTemplate: { key: "i", alt: true },
});
const defaults = HOTKEY_IDS.map((id) => JSON.stringify(DEFAULT_HOTKEYS[id]));
assert.equal(new Set(defaults).size, defaults.length, "every default chord is distinct");

// Insert current date / time type the formatted moment at the caret
const { registerInsertText, requestInsertText } = await import("../src/lib/editor/insert-text.ts");
let typed = null;
const off = registerInsertText((noteId, text) => (noteId === "n1" ? ((typed = text), true) : false));
assert.equal(requestInsertText("n2", "x"), false, "only the editor showing that note takes it");
assert.equal(requestInsertText("n1", formatDate(date, "YYYY-MM-DD")), true);
assert.equal(typed, "2026-03-01");
off();
assert.equal(requestInsertText("n1", "x"), false);

console.log("templates contract: OK");
