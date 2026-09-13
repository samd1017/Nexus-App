/**
 * Links empty copy must explain when the link index is not ready.
 * Run: node src/lib/graph/__tests__/graph-empty.contract.mjs
 */
import assert from "node:assert/strict";

if (!process.env.NEXUS_TSX) {
  const { spawnSync } = await import("node:child_process");
  const r = spawnSync(
    "npx",
    ["--yes", "tsx", "src/lib/graph/__tests__/graph-empty.contract.mjs"],
    {
      cwd: process.cwd(),
      encoding: "utf8",
      timeout: 30_000,
      env: { ...process.env, NEXUS_TSX: "1" },
    },
  );
  if (r.stdout) process.stdout.write(r.stdout);
  if (r.stderr) process.stderr.write(r.stderr);
  process.exit(r.status ?? 1);
}

const { graphEmptyCopy } = await import("../graph-empty.ts");

const pending = graphEmptyCopy({
  viewMode: "ego",
  vaultNoteCount: 100_000,
  drawnNodeCount: 1,
  activeNoteId: "n1",
  linkIndexReady: false,
  linkEdgeCount: 0,
  hasFilters: false,
  folderHasPath: false,
});
assert.equal(pending.show, true);
assert.match(pending.title, /isn.t ready/i);
assert.match(pending.description, /link index/i);

const readyEmpty = graphEmptyCopy({
  viewMode: "ego",
  vaultNoteCount: 100_000,
  drawnNodeCount: 1,
  activeNoteId: "n1",
  linkIndexReady: true,
  linkEdgeCount: 0,
  hasFilters: false,
  folderHasPath: false,
});
assert.equal(readyEmpty.show, true);
assert.match(readyEmpty.title, /wikilinks/i);

const readyLinks = graphEmptyCopy({
  viewMode: "ego",
  vaultNoteCount: 100_000,
  drawnNodeCount: 12,
  activeNoteId: "n1",
  linkIndexReady: true,
  linkEdgeCount: 4000,
  hasFilters: false,
  folderHasPath: false,
});
assert.equal(readyLinks.show, false);

const folder = graphEmptyCopy({
  viewMode: "folder",
  vaultNoteCount: 100_000,
  drawnNodeCount: 8,
  activeNoteId: "n1",
  linkIndexReady: false,
  linkEdgeCount: 0,
  hasFilters: false,
  folderHasPath: false,
});
assert.equal(folder.show, false, "folder map stays visible while links index");

console.log("graph-empty.contract: ok");
