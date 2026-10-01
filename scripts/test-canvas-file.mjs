/**
 * .canvas files open as a board, save as JSON, and are created from chrome.
 */
import assert from "node:assert/strict";

if (!process.env.NEXUS_TSX) {
  const { spawnSync } = await import("node:child_process");
  const r = spawnSync("npx", ["--yes", "tsx", "scripts/test-canvas-file.mjs"], {
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
  emptyCanvasFile,
  isCanvasNote,
  parseCanvasDoc,
  serializeCanvas,
} = await import("../src/lib/vault/canvas.ts");

const empty = parseCanvasDoc(emptyCanvasFile());
assert.equal(empty.cards.length, 0);
assert.equal(isCanvasNote(emptyCanvasFile(), "Projects/Board.canvas"), true);
assert.equal(isCanvasNote("# Hello\n", "Notes/Hello.md"), false);

const obsidian = JSON.stringify({
  nodes: [{ id: "a", type: "file", file: "Welcome.md", x: 10, y: 20, width: 200, height: 80 }],
  edges: [],
});
const parsed = parseCanvasDoc(obsidian);
assert.equal(parsed.cards.length, 1);
assert.equal(parsed.cards[0].kind, "note");
assert.equal(parsed.cards[0].notePath, "Welcome.md");

const saved = serializeCanvas(emptyCanvasFile(), parsed, "Board.canvas");
assert.match(saved, /"type": "file"/);
assert.match(saved, /Welcome\.md/);
assert.equal(parseCanvasDoc(saved).cards[0].notePath, "Welcome.md");

const fenced = "---\ntype: canvas\n---\n\n````canvas\n{\"cards\":[],\"edges\":[],\"cam\":{\"x\":0,\"y\":0,\"k\":1}}\n````\n";
assert.equal(isCanvasNote(fenced, "Old.md"), true);
assert.equal(parseCanvasDoc(fenced).cards.length, 0);

const { readFileSync } = await import("node:fs");
const palette = readFileSync("src/components/search/CommandPalette.tsx", "utf8");
assert.match(palette, /label: "New canvas"/);
assert.match(palette, /label: "Open canvas"/);
assert.match(palette, /createCanvas\(/);
const menu = readFileSync("src/components/vault/NewNoteMenu.tsx", "utf8");
assert.match(menu, /New canvas/);
assert.match(menu, /data-testid="new-canvas"/);
const tree = readFileSync("src/components/vault/FileTree.tsx", "utf8");
assert.match(tree, /label="New canvas"/);
const board = readFileSync("src/components/canvas/CanvasBoard.tsx", "utf8");
assert.match(board, /data-testid="canvas-empty"/);
assert.match(board, /data-testid="canvas-add-note"/);
assert.match(board, /data-testid="canvas-open-note"/);
assert.match(board, /serializeCanvas/);
assert.match(board, /Not full Obsidian Canvas/);
const pane = readFileSync("src/components/editor/EditorPane.tsx", "utf8");
assert.match(pane, /isCanvasNote\(body, note\.path\)/);
assert.match(pane, /canvasNote \? \(\s*<CanvasBoard/);

console.log("canvas-file: PASS");
