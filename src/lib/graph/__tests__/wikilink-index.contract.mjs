/**
 * Wikilink index + reverse-backlink cache must not rescan on content-only patches.
 * Run: node src/lib/graph/__tests__/wikilink-index.contract.mjs
 */
import assert from "node:assert/strict";
import { build } from "esbuild";
import { mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "../../../..");
const outDir = join(tmpdir(), `nexus-wikilink-index-${Date.now()}`);
mkdirSync(outDir, { recursive: true });

async function bundle(entry, outfile) {
  await build({
    entryPoints: [entry],
    outfile,
    bundle: true,
    format: "esm",
    platform: "node",
    logLevel: "silent",
  });
}

function manyNodes(n) {
  /** @type {Record<string, any>} */
  const nodes = {};
  for (let i = 0; i < n; i++) {
    const id = `n_${i}`;
    nodes[id] = {
      id,
      path: `notes/Note ${i}.md`,
      name: `Note ${i}.md`,
      kind: "note",
      parentId: null,
      mtime: 1,
      content: i < 3 ? `# Note ${i}\nSee [[Note 0]]\n` : undefined,
    };
  }
  return nodes;
}

async function main() {
  const graphOut = join(outDir, "graph.js");
  const backOut = join(outDir, "back.js");
  await bundle(path.join(root, "src/lib/graph/build-graph.ts"), graphOut);
  await bundle(path.join(root, "src/lib/vault/backlink-index.ts"), backOut);

  const graph = await import(pathToFileURL(graphOut).href);
  const back = await import(pathToFileURL(backOut).href);

  const small = manyNodes(8);
  const idx1 = graph.buildWikilinkIndex(small);
  const idx2 = graph.buildWikilinkIndex(small);
  assert.equal(idx1, idx2, "wikilink index is cached on the same node map");
  assert.equal(graph.resolveWikilink("Note 1", small)?.id, "n_1");

  small.n_1 = { ...small.n_1, content: "# Note 1\nhydrated" };
  const idx3 = graph.buildWikilinkIndex(small);
  assert.equal(idx3, idx1, "content-only hydrate must reuse the wikilink index");

  const rev1 = back.buildReverseIndex(small);
  const rev2 = back.buildReverseIndex(small);
  assert.equal(rev1, rev2, "reverse index cached on structure generation");
  small.n_2 = { ...small.n_2, content: "# Note 2\nhydrated" };
  const rev3 = back.buildReverseIndex(small);
  assert.equal(rev3, rev1, "content-only hydrate must not rebuild reverse index");

  const large = manyNodes(500);
  const miss = graph.resolveWikilink("no-such-note-zzz", large);
  assert.equal(miss, null, "large vaults skip O(n) fuzzy resolve");

  console.log("wikilink-index.contract: ok");
  rmSync(outDir, { recursive: true, force: true });
}

main().catch((e) => {
  console.error(e);
  try {
    rmSync(outDir, { recursive: true, force: true });
  } catch {}
  process.exit(1);
});
