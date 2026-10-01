/**
 * Live `.base` file: round trips, merges that keep what Nexus does not show,
 * migration, and the save/reload queue against a fake vault.
 */
import assert from "node:assert/strict";

if (!process.env.NEXUS_TSX) {
  const { spawnSync } = await import("node:child_process");
  const r = spawnSync("npx", ["--yes", "tsx", "scripts/test-bases-live.mjs"], {
    cwd: process.cwd(),
    encoding: "utf8",
    timeout: 30_000,
    env: { ...process.env, NEXUS_TSX: "1" },
  });
  if (r.stdout) process.stdout.write(r.stdout);
  if (r.stderr) process.stderr.write(r.stderr);
  process.exit(r.status ?? 1);
}

const { parse } = await import("yaml");
const { readFileSync } = await import("node:fs");
const live = await import("../src/lib/vault/bases-live.ts");
const { LiveBasesSync } = await import("../src/lib/vault/bases-live-sync.ts");
const { defaultBasesSession, serializeNoteTableFile, NOTE_TABLE_FILE } = await import("../src/lib/vault/note-table.ts");
const { exportBaseFile } = await import("../src/lib/vault/bases-file.ts");
const { LIVE_BASE_FILE, LIVE_BASE_BACKUP, readLiveBase, writeLiveBase, sameBasesSession } = live;

const clone = (value) => JSON.parse(JSON.stringify(value));
const ok = (text) => {
  const read = readLiveBase(text);
  assert.equal(read.ok, true, read.error);
  return read;
};
const roundTrip = (session, keys = []) => {
  const text = writeLiveBase(null, session, keys);
  const read = ok(text);
  assert.ok(sameBasesSession(read.session, session), `round trip:\n${text}`);
  assert.equal(read.outside, false);
  assert.deepEqual(read.notes, []);
  assert.equal(writeLiveBase({ text, session: read.session }, read.session, keys), text, "unchanged views write the same text");
  return { text, read };
};

assert.equal(LIVE_BASE_FILE, "Nexus Bases.base");
assert.equal(LIVE_BASE_BACKUP, ".nexus/Nexus Bases.unreadable.base");

// Defaults and a full session survive a write and read exactly.
const defaults = roundTrip(defaultBasesSession(), ["status"]);
assert.match(defaults.text, /^# Nexus Bases live views/);
assert.doesNotMatch(defaults.text, /Exported from Nexus/);
const doc0 = parse(defaults.text);
assert.equal(doc0.views.length, 2);
assert.equal(doc0.views[0].type, "table");
assert.equal(doc0.nexus.version, 1);

const rich = defaultBasesSession();
rich.activeId = "saved";
rich.views[0] = {
  ...rich.views[0],
  query: "draft",
  folder: "Projects",
  column: "formula:days",
  dir: "desc",
  formulas: [
    { id: "due_on", name: "Due on", expr: "date(due)" },
    { id: "days", name: "Days left", expr: "formula.due_on - today()" },
    { id: "blank", name: "Blank", expr: "" },
  ],
  columns: ["status", "related"],
  relations: ["related"],
  layout: "cards",
  groupBy: { column: "status", dir: "desc" },
  summaries: { status: "filled", name: "count", "formula:days": "average" },
};
rich.views[1] = { ...rich.views[1], name: "Reading", formulas: [{ id: "days", name: "Other", expr: "1 + 1" }], columns: [] };
const richTrip = roundTrip(rich, ["status", "due"]);
const richDoc = parse(richTrip.text);
assert.equal(richDoc.views[0].type, "cards");
assert.deepEqual(richDoc.views[0].filters, { and: ['file.inFolder("Projects")'] });
assert.deepEqual(richDoc.views[0].groupBy, { property: "status", direction: "DESC" });
assert.equal(richDoc.views[0].summaries.status, "Filled");
assert.equal(richDoc.views[0].summaries["formula.days"], "Average");
assert.equal(richDoc.formulas.days, "formula.due_on - today()");
assert.equal(richDoc.formulas.days_2, "1 + 1");
assert.equal(richDoc.nexus.activeView, "saved");
assert.equal(richDoc.nexus.views[0].query, "draft");
assert.deepEqual(richDoc.nexus.views[0].relations, ["related"]);
assert.equal(richDoc.nexus.views[0].summaries.name, "count");
assert.equal(ok(richTrip.text).session.activeId, "saved");

// An Obsidian-written file: Nexus reads it, and a change keeps everything it does not show.
const obsidian = `# My base, keep this comment
filters:
  and:
    - 'status != "done"'
formulas:
  price: "cost * 2"
  unused: "1 + 2"
  third_only: "price + 1"
properties:
  note.status:
    displayName: State
  formula.price:
    displayName: Price
summaries:
  doubled: "values.length * 2"
views:
  - type: table
    name: Main
    limit: 20
    filters:
      and:
        - file.hasTag("x")
    order:
      - file.name
      - status
      - file.size
      - formula.price
    sort:
      - property: status
        direction: ASC
      - property: file.size
        direction: DESC
    summaries:
      formula.price: doubled
      status: Filled
  - type: cards
    name: Board # second view comment
    order:
      - file.name
  - type: map
    name: Places
    order:
      - formula.third_only
`;
const obs = ok(obsidian);
assert.equal(obs.outside, true);
assert.equal(obs.session.views[0].name, "Main");
assert.ok(obs.notes.some((line) => /stays in the file/.test(line)), obs.notes.join("\n"));
assert.ok(obs.notes.some((line) => /Nexus shows two views; “Places” stays in the file/.test(line)), obs.notes.join("\n"));
assert.ok(!obs.notes.some((line) => /not imported|was left out/.test(line)), obs.notes.join("\n"));
assert.equal(writeLiveBase({ text: obsidian, session: obs.session }, obs.session, []), obsidian, "no change, no rewrite");

const sorted = clone(obs.session);
sorted.views[0].dir = "desc";
const merged = writeLiveBase({ text: obsidian, session: obs.session }, sorted, ["status"]);
const mergedDoc = parse(merged);
assert.match(merged, /^# My base, keep this comment/);
assert.match(merged, /name: Board # second view comment/, "untouched view keeps its comment");
assert.deepEqual(mergedDoc.filters, { and: ['status != "done"'] });
assert.deepEqual(mergedDoc.summaries, { doubled: "values.length * 2" });
assert.equal(mergedDoc.views.length, 3);
assert.equal(mergedDoc.views[2].type, "map");
assert.equal(mergedDoc.views[0].limit, 20);
assert.deepEqual(mergedDoc.views[0].filters, { and: ['file.hasTag("x")'] });
assert.deepEqual(mergedDoc.views[0].sort, [
  { property: "status", direction: "DESC" },
  { property: "file.size", direction: "DESC" },
]);
assert.ok(mergedDoc.views[0].order.includes("file.size"), "unknown order entries stay");
assert.equal(mergedDoc.views[0].summaries["formula.price"], "doubled", "custom summary formula stays");
assert.equal(mergedDoc.views[0].summaries.status, "Filled");
assert.equal(mergedDoc.formulas.unused, "1 + 2", "formulas no view of Nexus owned stay");
assert.equal(mergedDoc.formulas.third_only, "price + 1");
assert.equal(mergedDoc.properties["note.status"].displayName, "State");
const mergedRead = ok(merged);
assert.ok(sameBasesSession(mergedRead.session, sorted));
assert.equal(mergedRead.outside, false, "a Nexus write marks its views as synced");

// Deleting a formula drops it from the file unless something Nexus keeps still reads it.
const shared = `formulas:
  a: "1"
  b: "2"
views:
  - type: table
    name: One
    order: [file.name, formula.a, formula.b]
  - type: table
    name: Two
    order: [file.name]
  - type: table
    name: Three
    order: [file.name, formula.b]
`;
const sharedRead = ok(shared);
const dropped = clone(sharedRead.session);
dropped.views[0].formulas = [];
const droppedDoc = parse(writeLiveBase({ text: shared, session: sharedRead.session }, dropped, []));
assert.deepEqual(droppedDoc.formulas, { b: "2" });
assert.deepEqual(droppedDoc.views[0].order, ["file.name"]);
assert.ok(sameBasesSession(ok(writeLiveBase({ text: shared, session: sharedRead.session }, dropped, [])).session, dropped));

// A folder set for the whole file moves into each view once one view's folder differs.
const topFolder = `filters: 'file.inFolder("Work")'
views:
  - type: table
    name: A
  - type: table
    name: B
  - type: table
    name: C
`;
const topRead = ok(topFolder);
assert.equal(topRead.session.views[0].folder, "Work");
const moved = clone(topRead.session);
moved.views[0].folder = "Home";
const movedText = writeLiveBase({ text: topFolder, session: topRead.session }, moved, []);
const movedDoc = parse(movedText);
assert.equal(movedDoc.filters, undefined);
assert.deepEqual(movedDoc.views[0].filters, { and: ['file.inFolder("Home")'] });
assert.deepEqual(movedDoc.views[1].filters, { and: ['file.inFolder("Work")'] });
assert.deepEqual(movedDoc.views[2].filters, { and: ['file.inFolder("Work")'] });
const movedBack = ok(movedText).session;
assert.equal(movedBack.views[0].folder, "Home");
assert.equal(movedBack.views[1].folder, "Work");

// Outside edits to a Nexus-written view: the Obsidian keys win, Nexus-only settings stay.
const nexusText = richTrip.text;
const edited = nexusText.replace("    name: All notes\n", "    name: All notes\n    limit: 5\n");
assert.notEqual(edited, nexusText);
const editedRead = ok(edited);
assert.equal(editedRead.outside, true);
assert.equal(editedRead.session.views[0].query, "draft");
assert.deepEqual(editedRead.session.views[0].relations, ["related"]);
assert.equal(editedRead.session.views[0].summaries.name, "count");
assert.equal(editedRead.session.views[1].name, "Reading");
const renamed = nexusText.replace("\n    name: All notes\n", "\n    name: Renamed\n");
assert.notEqual(renamed, nexusText);
assert.equal(ok(renamed).session.views[0].query, "", "a renamed view does not take another view's text filter");

// Unreadable files never read as empty views.
assert.equal(readLiveBase("views: [\n").ok, false);
assert.match(readLiveBase("views: [\n").error, /^Not a readable \.base file/);
assert.equal(readLiveBase("").error, "Nexus Bases.base has no views.");
assert.equal(readLiveBase("formulas:\n  a: 1\n").error, "Nexus Bases.base has no views.");
assert.match(readLiveBase("x".repeat(1024 * 1024 + 1)).error, /larger than 1 MB/);
assert.equal(readLiveBase("", "Other.base").error, "Other.base has no views.");

// An export from an older Nexus is recognised and its header replaced on write.
const oldExport = `# Exported from Nexus. Nexus keeps editing .nexus/note-table.json; export again after changes.
# Formulas use Nexus syntax, which mostly matches Obsidian Bases; check any that error there.
${exportBaseFile(rich, ["status"]).text.split("\n").slice(2).join("\n")}`;
const oldRead = ok(oldExport);
assert.equal(oldRead.oldExport, true);
const freshened = writeLiveBase({ text: oldExport, session: oldRead.session }, oldRead.session, []);
assert.doesNotMatch(freshened, /Exported from Nexus|keeps editing/);
assert.match(freshened, /^# Nexus Bases live views/);
assert.equal(ok(freshened).oldExport, false);

// ---- Sync queue against a fake vault ----

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));
function fakeVault({ file = null, legacy = null } = {}) {
  const vault = {
    file,
    legacy,
    backup: null,
    writes: 0,
    failWrites: 0,
    readError: null,
    name: LIVE_BASE_FILE,
    where: LIVE_BASE_FILE,
    legacyWhere: NOTE_TABLE_FILE,
    async read() {
      await tick();
      if (vault.readError) return { error: vault.readError };
      return vault.file === null ? { missing: true } : { text: vault.file };
    },
    async write(text) {
      await tick();
      if (vault.failWrites > 0) {
        vault.failWrites -= 1;
        throw new Error("disk full");
      }
      vault.writes += 1;
      vault.file = text;
    },
    async backup(text) {
      await tick();
      vault.backup = text;
    },
    async readLegacy() {
      await tick();
      return vault.legacy;
    },
  };
  return vault;
}
const edit = (session, patch) => {
  const next = clone(session);
  Object.assign(next.views[0], patch);
  return next;
};

{
  // A new vault: opening writes nothing; the first change creates the file.
  const vault = fakeVault();
  const sync = new LiveBasesSync(vault);
  assert.deepEqual(await sync.open(), { kind: "new" });
  assert.deepEqual(await sync.save(defaultBasesSession(), []), { kind: "unchanged" });
  assert.equal(vault.file, null);
  const changed = edit(defaultBasesSession(), { query: "alpha" });
  assert.deepEqual(await sync.save(changed, ["status"]), { kind: "saved" });
  assert.ok(sameBasesSession(ok(vault.file).session, changed));
  assert.deepEqual(await sync.check(), { kind: "same" }, "own write is not an outside change");
  assert.deepEqual(await sync.save(changed, ["status"]), { kind: "unchanged" });
  assert.equal(vault.writes, 1);
}

{
  // Migration from .nexus/note-table.json: views move into the file, the JSON is left alone.
  const legacy = serializeNoteTableFile(rich);
  const vault = fakeVault({ legacy });
  const sync = new LiveBasesSync(vault);
  const opened = await sync.open();
  assert.equal(opened.kind, "migrated");
  assert.equal(opened.from, "legacy");
  assert.equal(opened.saveError, null);
  assert.ok(sameBasesSession(opened.session, rich));
  assert.ok(sameBasesSession(ok(vault.file).session, rich));
  assert.equal(vault.legacy, legacy);
  assert.equal((await sync.open()).kind, "migrated", "a view that closed before showing the notice gets it on the next open");
  sync.seen();
  assert.equal((await sync.open()).kind, "loaded", "the file wins once it exists");
  const again = new LiveBasesSync(vault);
  assert.equal((await again.open()).kind, "loaded");
}

{
  // A migration write that fails is retried by the next save.
  const vault = fakeVault({ legacy: serializeNoteTableFile(rich) });
  vault.failWrites = 1;
  const sync = new LiveBasesSync(vault);
  const opened = await sync.open();
  assert.equal(opened.kind, "migrated");
  assert.equal(opened.saveError, "disk full");
  assert.equal(vault.file, null);
  assert.deepEqual(await sync.save(opened.session, []), { kind: "saved" });
  assert.ok(sameBasesSession(ok(vault.file).session, rich));
}

{
  // Unreadable JSON never becomes default views written over it.
  const vault = fakeVault({ legacy: "{ not json" });
  const sync = new LiveBasesSync(vault);
  assert.deepEqual(await sync.open(), { kind: "legacy-unreadable" });
  assert.equal(vault.file, null);
  assert.equal(vault.legacy, "{ not json");
}

{
  // An old export plus the JSON it came from: the JSON was live, so it wins; Undo offers the export.
  const exportedViews = edit(rich, { query: "", name: "Exported name" });
  const exportText = `# Exported from Nexus. Nexus keeps editing .nexus/note-table.json; export again after changes.\n${exportBaseFile(exportedViews, []).text.split("\n").slice(2).join("\n")}`;
  const vault = fakeVault({ file: exportText, legacy: serializeNoteTableFile(rich) });
  const sync = new LiveBasesSync(vault);
  const opened = await sync.open();
  assert.equal(opened.kind, "migrated");
  assert.equal(opened.from, "old-export");
  assert.equal(opened.usedLegacy, true);
  assert.ok(sameBasesSession(opened.session, rich));
  assert.equal(opened.undo.views[0].name, "Exported name");
  assert.doesNotMatch(vault.file, /keeps editing/);
  assert.ok(sameBasesSession(ok(vault.file).session, rich));

  const alone = fakeVault({ file: exportText });
  const openedAlone = await new LiveBasesSync(alone).open();
  assert.equal(openedAlone.kind, "migrated");
  assert.equal(openedAlone.usedLegacy, false);
  assert.equal(openedAlone.undo, null);
  assert.equal(openedAlone.session.views[0].name, "Exported name");
  assert.doesNotMatch(alone.file, /keeps editing/);
}

{
  // A corrupt file blocks saves until it is fixed or replaced; replacing copies it aside first.
  const vault = fakeVault({ file: "views: [\n  - broken" });
  const sync = new LiveBasesSync(vault);
  const opened = await sync.open();
  assert.equal(opened.kind, "blocked");
  assert.equal(opened.replaceable, true);
  assert.match(opened.reason, /^Nexus Bases\.base can't be read: Not a readable \.base file/);
  assert.equal((await sync.save(edit(rich, { query: "x" }), [])).kind, "blocked");
  assert.equal(vault.file, "views: [\n  - broken");
  assert.deepEqual(await sync.check(), { kind: "same" });
  vault.file = defaults.text;
  const fixed = await sync.check();
  assert.equal(fixed.kind, "changed");
  assert.equal(fixed.wasBlocked, true);
  assert.equal(sync.blocked, null);
  assert.equal((await sync.save(edit(fixed.session, { query: "after fix" }), [])).kind, "saved");

  const broken = fakeVault({ file: "views:\n  - [oops" });
  const replacing = new LiveBasesSync(broken);
  assert.equal((await replacing.open()).kind, "blocked");
  assert.deepEqual(await replacing.replace(rich, []), { kind: "saved" });
  assert.equal(broken.backup, "views:\n  - [oops");
  assert.ok(sameBasesSession(ok(broken.file).session, rich));
  assert.equal(replacing.blocked, null);
}

{
  // A file that cannot be read at all blocks saves and is never offered for replacing.
  const vault = fakeVault({ file: defaults.text });
  vault.readError = "permission denied";
  const sync = new LiveBasesSync(vault);
  const opened = await sync.open();
  assert.deepEqual(opened, { kind: "blocked", reason: "Couldn't read Nexus Bases.base: permission denied", replaceable: false });
  assert.equal((await sync.save(rich, [])).kind, "blocked");
  assert.equal(vault.writes, 0);
  vault.readError = null;
  const back = await sync.check();
  assert.equal(back.kind, "changed");
  assert.equal(back.wasBlocked, true);
}

{
  // Write failures report and the next save retries.
  const vault = fakeVault({ file: defaults.text });
  const sync = new LiveBasesSync(vault);
  await sync.open();
  vault.failWrites = 1;
  const next = edit(defaultBasesSession(), { query: "retry me" });
  assert.deepEqual(await sync.save(next, []), { kind: "failed", message: "disk full" });
  assert.equal(vault.file, defaults.text);
  assert.deepEqual(await sync.save(next, []), { kind: "saved" });
  assert.ok(sameBasesSession(ok(vault.file).session, next));
}

{
  // An outside edit before a save: the file wins, nothing is written, the attempted views come back.
  const vault = fakeVault({ file: obsidian });
  const sync = new LiveBasesSync(vault);
  const opened = await sync.open();
  vault.file = obsidian.replace("name: Board", "name: Board 2");
  const attempted = edit(opened.session, { query: "mine" });
  const conflict = await sync.save(attempted, []);
  assert.equal(conflict.kind, "conflict");
  assert.equal(conflict.session.views[1].name, "Board 2");
  assert.equal(vault.writes, 0);
  // "Keep my version" saves the attempted views on top of the outside edit, keeping its other changes.
  const kept = { ...attempted, views: [attempted.views[0], conflict.session.views[1]] };
  assert.deepEqual(await sync.save(kept, []), { kind: "saved" });
  const keptDoc = parse(vault.file);
  assert.equal(keptDoc.views[1].name, "Board 2");
  assert.equal(keptDoc.views[2].name, "Places");
  assert.equal(ok(vault.file).session.views[0].query, "mine");
}

{
  // A save queued before a reload is dropped, so it cannot overwrite the views just loaded.
  const vault = fakeVault({ file: defaults.text });
  const sync = new LiveBasesSync(vault);
  await sync.open();
  vault.file = richTrip.text;
  const checking = sync.check();
  const late = sync.save(edit(defaultBasesSession(), { query: "typed before reload" }), []);
  assert.equal((await checking).kind, "changed");
  assert.deepEqual(await late, { kind: "stale" });
  assert.equal(vault.file, richTrip.text);
}

{
  // Saves in flight never interleave: the last session wins and every check after sees its own write.
  const vault = fakeVault({ file: defaults.text });
  const sync = new LiveBasesSync(vault);
  await sync.open();
  const results = await Promise.all(
    ["a", "ab", "abc"].map((query, i) => (i === 1 ? sync.check() : sync.save(edit(defaultBasesSession(), { query }), []))),
  );
  assert.deepEqual(results.map((r) => r.kind), ["saved", "same", "saved"]);
  assert.equal(ok(vault.file).session.views[0].query, "abc");
  assert.deepEqual(await sync.check(), { kind: "same" });
}

{
  // A reformat that reads as the same views loads silently on the Nexus side (same session back).
  const vault = fakeVault({ file: richTrip.text });
  const sync = new LiveBasesSync(vault);
  const opened = await sync.open();
  vault.file = `${richTrip.text}\n# trailing comment\n`;
  const result = await sync.check();
  assert.equal(result.kind, "changed");
  assert.ok(sameBasesSession(result.session, opened.session));
  assert.deepEqual(await sync.save(opened.session, []), { kind: "unchanged" });
  assert.match(vault.file, /# trailing comment/);
}

{
  // Deleted outside Nexus: reported once, then written again on the next change.
  const vault = fakeVault({ file: richTrip.text });
  const sync = new LiveBasesSync(vault);
  const opened = await sync.open();
  vault.file = null;
  assert.deepEqual(await sync.check(), { kind: "missing" });
  assert.deepEqual(await sync.check(), { kind: "same" });
  assert.deepEqual(await sync.save(edit(opened.session, { query: "back" }), []), { kind: "saved" });
  assert.equal(ok(vault.file).session.views[0].query, "back");
}

{
  // Import adopts the imported file as the template; Undo puts the old file back byte for byte.
  const vault = fakeVault({ file: obsidian });
  const sync = new LiveBasesSync(vault);
  const opened = await sync.open();
  const before = sync.template();
  const imported = ok(shared);
  sync.adopt({ text: shared, session: imported.session });
  assert.deepEqual(await sync.save(imported.session, []), { kind: "saved" });
  assert.equal(vault.file, shared, "an unchanged import is the imported file");
  sync.adopt(before);
  assert.deepEqual(await sync.save(opened.session, []), { kind: "saved" });
  assert.equal(vault.file, obsidian);
}

// Wiring: Bases reads and writes the live file, and the disclosure names it.
const table = readFileSync("src/components/vault/NoteTable.tsx", "utf8");
assert.match(table, /liveBasesSync\(\)/);
assert.match(table, /live\.sync\.open\(\)/);
assert.match(table, /live\.sync\.save\(/);
assert.match(table, /live\.sync\s*\.check\(\)/);
assert.match(table, /setInterval\(tick, 2000\)/);
assert.match(table, /addEventListener\("focus", tick\)/);
assert.match(table, /data-testid="bases-live-retry"/);
assert.match(table, /data-testid="bases-live-replace"/);
assert.match(table, /Keep my version/);
assert.match(table, /Views live in \$\{LIVE_BASE_FILE\} at the vault root, an Obsidian \.base file Nexus saves to and reloads when it changes\./);
assert.doesNotMatch(table, /not an Obsidian \.base file/);
assert.doesNotMatch(table, /note-table\.json/);
assert.doesNotMatch(table, /saveNoteTableConfig|loadNoteTableConfig/);
const storage = readFileSync("src/lib/vault/bases-live-storage.ts", "utf8");
assert.match(storage, /NOTE_TABLE_FILE/);
assert.match(storage, /isMissingFileError/);
assert.doesNotMatch(storage, /write[A-Za-z]*\([^)]*NOTE_TABLE_FILE/, "the old JSON is never written");

console.log("bases-live ok");
