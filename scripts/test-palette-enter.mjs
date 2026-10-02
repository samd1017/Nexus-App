/**
 * Ctrl+K: Enter opens the highlighted row, or the first note hit.
 */
import assert from "node:assert/strict";

if (!process.env.NEXUS_TSX) {
  const { spawnSync } = await import("node:child_process");
  const r = spawnSync("npx", ["--yes", "tsx", "scripts/test-palette-enter.mjs"], {
    cwd: process.cwd(),
    encoding: "utf8",
    timeout: 30_000,
    env: { ...process.env, NEXUS_TSX: "1" },
  });
  if (r.stdout) process.stdout.write(r.stdout);
  if (r.stderr) process.stderr.write(r.stderr);
  process.exit(r.status ?? 1);
}

const { paletteEnterOpensNow } = await import("../src/lib/search/palette-enter.ts");

const base = {
  hasSelection: false,
  selectedIsFolder: false,
  selectedIsCreate: false,
  hitCount: 0,
  catalogPending: false,
  exactNote: false,
  commandMode: false,
  askMode: false,
  tagBrowse: false,
};

assert.equal(
  paletteEnterOpensNow({ ...base, hitCount: 3, catalogPending: true }),
  "first-hit",
);
assert.equal(
  paletteEnterOpensNow({ ...base, hasSelection: true, hitCount: 3, catalogPending: true }),
  "selected",
);
assert.equal(
  paletteEnterOpensNow({ ...base, hasSelection: true, selectedIsFolder: true, hitCount: 2 }),
  "selected",
);
assert.equal(
  paletteEnterOpensNow({
    ...base,
    hasSelection: true,
    selectedIsCreate: true,
    catalogPending: true,
  }),
  "wait",
);
assert.equal(
  paletteEnterOpensNow({ ...base, commandMode: true, hasSelection: true }),
  "selected",
);
assert.equal(
  paletteEnterOpensNow({ ...base, commandMode: true, hitCount: 0 }),
  "wait",
);
assert.equal(paletteEnterOpensNow({ ...base, hitCount: 0, catalogPending: true }), "wait");

const { readFileSync } = await import("node:fs");
const palette = [
  "src/components/search/CommandPalette.tsx",
  "src/components/search/palette-search.ts",
  "src/components/search/palette-results.tsx",
]
  .map((rel) => readFileSync(rel, "utf8"))
  .join("\n");
assert.match(palette, /paletteEnterOpensNow/);
assert.match(palette, /search-note-hit/);
assert.match(palette, /cmdk-item-select/);
assert.match(palette, /setActiveNote\(top\.noteId\)/);
assert.match(palette, /if \(!folder && !exactNote && catalogFolderPending\)/);
assert.match(palette, /selected\?\.click\(\)/);
const enterAt = palette.indexOf("onKeyDownCapture={(e) => {");
const enterBody = palette.slice(enterAt, palette.indexOf("}}\n          />", enterAt));
assert.ok(enterBody.indexOf('if (e.key !== "Enter"') >= 0);
assert.equal(enterBody.includes("ArrowDown"), false);
const holdAt = enterBody.indexOf("if (!folder && !exactNote && catalogFolderPending)");
assert.ok(holdAt > 0);
assert.ok(enterBody.indexOf('enterNow === "selected"') < holdAt);
assert.ok(enterBody.indexOf('enterNow === "first-hit"') < holdAt);

const keys = readFileSync("src/components/chrome/KeyboardShortcuts.tsx", "utf8");
assert.match(keys, /if \(store\.commandOpen\) \{\s*store\.setCommandOpen\(false\);/);

console.log("palette-enter: PASS");
