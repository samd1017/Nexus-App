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

const { parseCanvasDoc, serializeCanvas } = await import("../src/lib/vault/canvas.ts");

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
const board = readFileSync("src/components/canvas/CanvasBoard.tsx", "utf8");
assert.match(board, /data-testid="canvas-frame"/);
assert.match(board, /data-testid="canvas-edge"/);
assert.match(board, /data-testid="canvas-port"/);
assert.match(board, /Still missing: live note embeds/);
assert.doesNotMatch(board, /Not full Obsidian Canvas/);

console.log("canvas-edges: PASS");
