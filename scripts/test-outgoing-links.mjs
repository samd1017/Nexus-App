/**
 * Outgoing links for the open note: resolved targets and unresolved names.
 */
import assert from "node:assert/strict";

if (!process.env.NEXUS_TSX) {
  const { spawnSync } = await import("node:child_process");
  const r = spawnSync("npx", ["--yes", "tsx", "scripts/test-outgoing-links.mjs"], {
    cwd: process.cwd(),
    encoding: "utf8",
    timeout: 30_000,
    env: { ...process.env, NEXUS_TSX: "1" },
  });
  if (r.stdout) process.stdout.write(r.stdout);
  if (r.stderr) process.stderr.write(r.stderr);
  process.exit(r.status ?? 1);
}

const { listOutgoingLinks, listOutgoingTargets } = await import(
  "../src/lib/vault/outgoing-links.ts"
);

const nodes = {
  a: { id: "a", path: "A.md", name: "A.md", kind: "note", parentId: null, mtime: 0, content: "" },
  b: { id: "b", path: "Notes/Beta.md", name: "Beta.md", kind: "note", parentId: null, mtime: 0, content: "" },
};

const links = listOutgoingLinks(
  "See [[Beta]] and [[Missing note]] and [file](Notes/Beta.md) and [web](https://example.com).",
  nodes,
  "a",
);
const resolved = links.filter((l) => l.kind === "resolved");
const unresolved = links.filter((l) => l.kind === "unresolved");
assert.equal(resolved.length, 1);
assert.equal(resolved[0].noteId, "b");
assert.equal(resolved[0].path, "Notes/Beta.md");
assert.equal(unresolved.length, 1);
assert.equal(unresolved[0].createTitle, "Missing note");
assert.equal(listOutgoingLinks("No links here.", nodes, "a").length, 0);

const fromIndex = listOutgoingTargets(["Beta", "Gone"], nodes);
assert.equal(fromIndex[0].kind, "resolved");
assert.equal(fromIndex[1].kind, "unresolved");

const { readFileSync } = await import("node:fs");
const panel = readFileSync("src/components/right/RightPanel.tsx", "utf8");
assert.match(panel, /OutgoingRail/);
assert.match(panel, /Outgoing links/);
const palette = readFileSync("src/components/search/CommandPalette.tsx", "utf8");
assert.match(palette, /label: "Outgoing links"/);
assert.match(palette, /setRightTab\("outgoing"\)/);
const rail = readFileSync("src/components/right/OutgoingRail.tsx", "utf8");
assert.match(rail, /Create note/);
assert.match(rail, /No outgoing links in this note/);
assert.match(rail, /Indexing links/);

console.log("outgoing-links: PASS");
