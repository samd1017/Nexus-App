/**
 * Graph filters + inspect — O(drawn) / O(degree), not O(vault).
 * Run: node src/lib/graph/__tests__/graph-filters.contract.mjs
 */

import assert from "node:assert/strict";
import { build } from "esbuild";
import { mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "../../../..");
const outDir = join(tmpdir(), `nexus-graph-filters-${Date.now()}`);
mkdirSync(outDir, { recursive: true });

async function bundle(entry, outfile) {
  await build({
    entryPoints: [entry],
    outfile,
    bundle: true,
    format: "esm",
    platform: "node",
    logLevel: "silent",
    plugins: [
      {
        name: "stub-heavy",
        setup(api) {
          api.onResolve(
            { filter: /^(marked|turndown|fuse\.js|3d-force-graph|three)$/ },
            (args) => ({ path: args.path, namespace: "stub" }),
          );
          api.onLoad({ filter: /.*/, namespace: "stub" }, () => ({
            contents: `
              const marked = { parse: (s) => String(s||''), setOptions: () => {}, use: () => {} };
              export default marked;
              export { marked };
            `,
            loader: "js",
          }));
        },
      },
    ],
  });
}

async function main() {
  const filtOut = join(outDir, "filters.mjs");
  const inspOut = join(outDir, "inspect.mjs");
  await bundle(path.join(root, "src/lib/graph/graph-filters.ts"), filtOut);
  await bundle(path.join(root, "src/lib/graph/graph-inspect.ts"), inspOut);
  const f = await import(pathToFileURL(filtOut).href);
  const insp = await import(pathToFileURL(inspOut).href);

  const nodes = [
    { id: "a", name: "Alpha", path: "P/Alpha.md", tag: "work", degree: 2, kind: "note" },
    { id: "b", name: "Beta", path: "P/Beta.md", tag: "life", degree: 0, kind: "note" },
    { id: "g", name: "Ghost", path: "", tag: "", degree: 1, kind: "note", ghost: true },
    { id: "f", name: "P", path: "P", tag: "", degree: 0, kind: "folder" },
  ];
  const links = [{ source: "a", target: "g" }];

  assert.equal(f.filtersAreIdle({
    query: "", showGhosts: true, orphansOnly: false, tag: "", folderPrefix: "",
  }), true);

  const idle = f.applyGraphFilters(
    { nodes, links },
    { query: "", showGhosts: true, orphansOnly: false, tag: "", folderPrefix: "" },
  );
  assert.equal(idle.nodes, nodes, "idle filter must keep array identity");

  const noGhost = f.applyGraphFilters(
    { nodes, links },
    { query: "", showGhosts: false, orphansOnly: false, tag: "", folderPrefix: "" },
  );
  assert.ok(!noGhost.nodes.some((n) => n.ghost));

  const orphans = f.applyGraphFilters(
    { nodes, links },
    { query: "", showGhosts: true, orphansOnly: true, tag: "", folderPrefix: "" },
  );
  assert.deepEqual(orphans.nodes.map((n) => n.id), ["b"]);

  const tagged = f.applyGraphFilters(
    { nodes, links },
    { query: "", showGhosts: true, orphansOnly: false, tag: "work", folderPrefix: "" },
  );
  assert.deepEqual(tagged.nodes.map((n) => n.id), ["a"]);

  const foldered = f.applyGraphFilters(
    { nodes, links },
    { query: "", showGhosts: true, orphansOnly: false, tag: "", folderPrefix: "P" },
  );
  assert.ok(foldered.nodes.every((n) => n.path === "P" || n.path.startsWith("P/")));

  const q = f.applyGraphFilters(
    { nodes, links },
    { query: "beta", showGhosts: true, orphansOnly: false, tag: "", folderPrefix: "" },
    "a",
  );
  assert.ok(q.nodes.some((n) => n.id === "b"));
  assert.ok(q.nodes.some((n) => n.id === "a"), "keepId survives a query miss");

  assert.equal(f.scaleParticlesEnabled(12, true, false), true);
  assert.equal(f.scaleParticlesEnabled(100_000, true, false), false);
  assert.equal(f.scaleParticlesEnabled(12, true, true), false);

  const opts = f.folderFilterOptions(nodes);
  assert.ok(opts.includes("P"));

  const vault = {
    n1: {
      id: "n1",
      path: "Hub.md",
      name: "Hub.md",
      kind: "note",
      parentId: null,
      mtime: 1,
      content: "# Hub\n[[Spoke]]\n",
    },
    n2: {
      id: "n2",
      path: "Spoke.md",
      name: "Spoke.md",
      kind: "note",
      parentId: null,
      mtime: 1,
      content: "# Spoke\n[[Hub]]\n",
    },
  };
  const card = insp.inspectGraphNote(vault, "n1", 6);
  assert.ok(card);
  assert.equal(card.kind, "note");
  assert.ok(card.outCount >= 1);
  assert.ok(card.out.some((l) => l.id === "n2"));

  console.log("graph-filters.contract: ok");
  rmSync(outDir, { recursive: true, force: true });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
