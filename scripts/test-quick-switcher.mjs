/**
 * Ctrl/Cmd+O quick switcher: fuzzy title/path, recents, not the Ctrl+K palette.
 */
import assert from "node:assert/strict";

if (!process.env.NEXUS_TSX) {
  const { spawnSync } = await import("node:child_process");
  const r = spawnSync("npx", ["--yes", "tsx", "scripts/test-quick-switcher.mjs"], {
    cwd: process.cwd(),
    encoding: "utf8",
    timeout: 30_000,
    env: { ...process.env, NEXUS_TSX: "1" },
  });
  if (r.stdout) process.stdout.write(r.stdout);
  if (r.stderr) process.stderr.write(r.stderr);
  process.exit(r.status ?? 1);
}

const { rankSwitcherNotes, recentSwitcherNotes, scoreSwitcherNote } = await import(
  "../src/lib/search/quick-switcher.ts"
);

const notes = [
  { id: "w", title: "Welcome", path: "Welcome.md" },
  { id: "g", title: "Graph View", path: "Research/Graph View.md" },
  { id: "l", title: "Local-first Vault", path: "Projects/Local-first Vault.md" },
  { id: "n", title: "Note List", path: "Projects/Note List.md" },
];

assert.ok(scoreSwitcherNote(notes[0], "welcome") > scoreSwitcherNote(notes[2], "welcome"));
assert.equal(rankSwitcherNotes(notes, "") .length, 0);
const wel = rankSwitcherNotes(notes, "wel");
assert.equal(wel[0].id, "w");
const pathHit = rankSwitcherNotes(notes, "research/graph");
assert.equal(pathHit[0].id, "g");
const fuzzy = rankSwitcherNotes(notes, "grp");
assert.ok(fuzzy.some((n) => n.id === "g"));
assert.deepEqual(recentSwitcherNotes(notes, ["n", "missing", "w"]).map((n) => n.id), ["n", "w"]);

const { readFileSync } = await import("node:fs");
const keys = readFileSync("src/components/chrome/KeyboardShortcuts.tsx", "utf8");
assert.match(keys, /toggleQuickSwitcher\(\)/);
assert.match(keys, /e\.key\.toLowerCase\(\) === "o"/);
assert.match(keys, /case "quickSwitcher":\s*toggleQuickSwitcher\(\)/);
const shell = readFileSync("src/components/layout/AppShell.tsx", "utf8");
assert.match(shell, /QuickSwitcher/);
assert.match(shell, /toggleQuickSwitcher\(\)/);
const ui = readFileSync("src/components/search/QuickSwitcher.tsx", "utf8");
assert.match(ui, /data-testid="quick-switcher"/);
assert.match(ui, /data-testid="quick-switcher-input"/);
assert.match(ui, /data-testid="quick-switcher-row"/);
assert.match(ui, /newTab: tabs\.length > 0/);
assert.match(ui, /Recent/);
const palette = readFileSync("src/components/search/CommandPalette.tsx", "utf8");
assert.match(palette, /setSwitcherOpen\(false\)/);
assert.match(palette, /setCommandOpen\(true\)/);

console.log("quick-switcher: PASS");
