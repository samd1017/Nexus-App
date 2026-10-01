/**
 * Canvas edges and frames persist in .canvas JSON and come back.
 */
import assert from "node:assert/strict";

if (!process.env.NEXUS_TSX) {
  const { spawnSync } = await import("node:child_process");
  const r = spawnSync("npx", ["--yes", "tsx", "scripts/test-canvas-edges.mjs"], {
    cwd: process.cwd(),
    encoding: "utf8",
    timeout: 30_000,
    env: { ...process.env, NEXUS_TSX: "1" },
  });
  if (r.stdout) process.stdout.write(r.stdout);
  if (r.stderr) process.stderr.write(r.stderr);
  process.exit(r.status ?? 1);
}

const { parseCanvasDoc, serializeCanvas, frameAroundCards, edgeBetweenSelected, withoutEdge, toObsidianCanvas } = await import("../src/lib/vault/canvas.ts");

const doc = {
  cards: [
    { id: "a", x: 0, y: 0, w: 200, h: 80, kind: "text", text: "A" },
    { id: "b", x: 320, y: 40, w: 200, h: 80, kind: "note", notePath: "Welcome.md" },
    { id: "f", x: -20, y: -20, w: 580, h: 180, kind: "group", text: "Frame" },
  ],
  edges: [{ id: "e", from: "a", to: "b", fromSide: "right", toSide: "left", label: "next" }],
  cam: { x: 10, y: 10, k: 1 },
  snap: true,
};
const raw = serializeCanvas("", doc, "Board.canvas");
const back = parseCanvasDoc(raw);
assert.equal(back.edges.length, 1);
assert.equal(back.edges[0].from, "a");
assert.equal(back.edges[0].to, "b");
assert.equal(back.edges[0].label, "next");
const frame = back.cards.find((c) => c.kind === "group");
assert.ok(frame);
assert.equal(frame.text, "Frame");
assert.equal(JSON.parse(raw).edges[0].fromNode, "a");
assert.equal(JSON.parse(raw).nodes.find((n) => n.type === "group").label, "Frame");

const { readFileSync } = await import("node:fs");
const fixture = `{
  "nodes": [
    { "id": "a", "type": "text", "text": "A", "x": 0, "y": 0, "width": 200, "height": 80 },
    { "id": "b", "type": "file", "file": "Welcome.md", "x": 320, "y": 40, "width": 200, "height": 80 },
    { "id": "f", "type": "group", "label": "Frame", "x": -28, "y": -28, "width": 600, "height": 200 }
  ],
  "edges": [
    { "id": "e", "fromNode": "a", "fromSide": "right", "toNode": "b", "toSide": "left" }
  ]
}
`;
const fromFile = parseCanvasDoc(fixture);
assert.equal(fromFile.edges.length, 1);
assert.equal(fromFile.edges[0].from, "a");
assert.equal(fromFile.edges[0].to, "b");
assert.equal(fromFile.cards.find((c) => c.kind === "group")?.text, "Frame");
const board = readFileSync("src/components/canvas/CanvasBoard.tsx", "utf8");
const css = readFileSync("src/styles.css", "utf8");
const keys = readFileSync("src/components/chrome/KeyboardShortcuts.tsx", "utf8");
const shell = readFileSync("src/components/layout/AppShell.tsx", "utf8");
const pair = [
  { id: "a", x: 0, y: 0, w: 200, h: 80, kind: "text", text: "A" },
  { id: "b", x: 300, y: 0, w: 200, h: 80, kind: "text", text: "B" },
];
const framed = frameAroundCards(pair, ["a", "b"], "frame1");
assert.ok(framed);
assert.equal(framed[0].kind, "group");
assert.equal(framed[0].text, "Frame");
const framedFile = serializeCanvas("", { cards: framed, edges: [], cam: { x: 0, y: 0, k: 1 } }, "Board.canvas");
assert.equal(JSON.parse(framedFile).nodes.find((n) => n.id === "frame1").type, "group");
const linked = edgeBetweenSelected({ cards: pair, edges: [], cam: { x: 0, y: 0, k: 1 } }, ["a", "b"], "edge1");
assert.equal(linked.from, "a");
assert.equal(linked.to, "b");
const withEdge = { cards: pair, edges: [linked], cam: { x: 0, y: 0, k: 1 } };
assert.equal(toObsidianCanvas(withEdge).edges[0].fromNode, "a");
const dropped = withoutEdge(withEdge, "edge1");
assert.equal(dropped.edges.length, 0);
assert.equal(dropped.cards.length, 2);
assert.equal(frameAroundCards(pair, ["a"], "x"), null);

assert.match(board, /data-testid="canvas-edge-hit"/);
assert.match(board, /data-testid="canvas-edge-select"/);
assert.match(board, /data-testid="canvas-edge-delete"/);
assert.match(board, /e\.key === "Delete" \|\| e\.key === "Backspace"/);
assert.match(board, /if \(selectedEdge\) \{\s*e\.preventDefault\(\);\s*removeEdge\(selectedEdge\);/s);
assert.match(board, /nexus-canvas-frame/);
assert.match(css, /\.nexus-canvas-edge-hit \{[^}]*width: 44px;/s);
assert.match(board, /data-testid="canvas-connect"/);
assert.match(board, /data-testid="canvas-frame"/);
assert.match(board, /data-canvas-focus/);
assert.match(board, /Shift-click or Ctrl-click/);
assert.match(board, /Still missing: the note rendered inside the card, and community canvas plugins/);
assert.match(board, /live title and a plain preview/);
assert.doesNotMatch(board, /live note embeds/);
assert.doesNotMatch(board, /Not full Obsidian Canvas/);
assert.match(css, /\.nexus-canvas-port \{[^}]*width: 44px;/s);
assert.match(keys, /nexus-canvas\[data-canvas-focus="1"\]/);
assert.match(keys, /isDeleteChord\) \{[\s\S]*?nexus-canvas\[data-canvas-focus="1"\]/);
assert.doesNotMatch(keys, /data-canvas-card].is-selected"\)\.length >= 2/);
assert.match(shell, /nexus-canvas\[data-canvas-focus="1"\]/);
assert.match(shell, /nexus-canvas-frame/);

console.log("canvas-edges: PASS");
