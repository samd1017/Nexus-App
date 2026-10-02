/**
 * Flat local graph: center stays at the origin, neighbors sit on a ring.
 * The saved graph style defaults to the local map.
 */
import assert from "node:assert/strict";

if (!process.env.NEXUS_TSX) {
  const { spawnSync } = await import("node:child_process");
  const r = spawnSync("npx", ["--yes", "tsx", "scripts/test-local-graph.mjs"], {
    cwd: process.cwd(),
    encoding: "utf8",
    timeout: 30_000,
    env: { ...process.env, NEXUS_TSX: "1" },
  });
  if (r.stdout) process.stdout.write(r.stdout);
  if (r.stderr) process.stderr.write(r.stderr);
  process.exit(r.status ?? 1);
}

const { layoutLocalRing } = await import("../src/lib/graph/local-layout.ts");
const { DEFAULT_PREFS } = await import("../src/lib/prefs/preferences.ts");

const points = layoutLocalRing([
  { id: "a", title: "Center", center: true },
  { id: "b", title: "One", center: false },
  { id: "c", title: "Two", center: false },
  { id: "d", title: "Three", center: false },
]);
const center = points.find((p) => p.id === "a");
assert.ok(center);
assert.equal(center.x, 0);
assert.equal(center.y, 0);
assert.equal(center.center, true);
for (const p of points.filter((n) => n.id !== "a")) {
  const dist = Math.hypot(p.x, p.y);
  assert.ok(dist > 100, `${p.id} sits away from the center`);
}
assert.equal(DEFAULT_PREFS.graphSurface, "local");

const { surfaceForGraphHotkey } = await import("../src/lib/layout/graph-hotkey.ts");
assert.equal(surfaceForGraphHotkey("explore"), "local");
assert.equal(surfaceForGraphHotkey("overview"), "local");
assert.equal(surfaceForGraphHotkey("local"), "local");
assert.equal(surfaceForGraphHotkey(null), "local");

const { readFileSync } = await import("node:fs");
const slot = readFileSync("src/components/graph/GraphSlot.tsx", "utf8");
assert.match(slot, /Folder Map/);
assert.match(slot, /graph-folder-map/);
assert.match(slot, /resetGraphBrowse/);
assert.match(slot, /graphSurface === "explore"/);
assert.doesNotMatch(slot, /3D Explore/);
const panel = readFileSync("src/components/right/RightPanel.tsx", "utf8");
assert.match(panel, /<GraphSlot mode="panel"/);
assert.match(panel, /<GraphSlot mode="fullscreen"/);
assert.equal(panel.includes("<GraphView"), false);

const viewport = readFileSync("src/lib/layout/viewport.ts", "utf8");
assert.match(viewport, /surfaceForGraphHotkey\(prefs\.graphSurface\)/);
assert.match(viewport, /updatePrefs\(\{ graphSurface: surface \}\)/);
const keys = readFileSync("src/components/chrome/KeyboardShortcuts.tsx", "utf8");
const graphCase = keys.slice(keys.indexOf('case "graph":'));
assert.match(graphCase, /toggleGraphForViewport\(\)/);
assert.match(slot, /choose\("explore"\)|choose\(\"explore\"\)/);
const help = readFileSync("src/components/settings/SettingsPanel.tsx", "utf8");
assert.match(help, /always opens the Local graph/);
const welcome = readFileSync("src/components/vault/WelcomeScreen.tsx", "utf8");
assert.match(welcome, /opens the Local graph of this note/);
const labels = readFileSync("src/lib/prefs/hotkeys.ts", "utf8");
assert.match(labels, /Fullscreen Local graph/);

console.log("local-graph: PASS");
