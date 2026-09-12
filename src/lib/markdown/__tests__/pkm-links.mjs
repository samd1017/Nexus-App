/**
 * Heading/block wikilinks + note slices + rank/ask + history.
 * Run: node src/lib/markdown/__tests__/pkm-links.mjs
 */
import assert from "node:assert/strict";
import { build } from "esbuild";
import { mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const outDir = join(tmpdir(), `nexus-pkm-${Date.now()}`);
mkdirSync(outDir, { recursive: true });

async function bundle(entry, outfile) {
  await build({
    entryPoints: [entry],
    outfile,
    bundle: true,
    format: "esm",
    platform: "neutral",
    packages: "external",
    logLevel: "silent",
  });
}

const wikiOut = join(outDir, "wikilinks.mjs");
const sliceOut = join(outDir, "slice.mjs");
const histOut = join(outDir, "history.mjs");
const rankOut = join(outDir, "rank.mjs");

await bundle("src/lib/markdown/wikilinks.ts", wikiOut);
await bundle("src/lib/markdown/note-slice.ts", sliceOut);
await bundle("src/lib/vault/note-history.ts", histOut);
await bundle("src/lib/search/rank-fusion.ts", rankOut);

const { parseWikilinkInner, extractWikilinkTargets } = await import(
  pathToFileURL(wikiOut).href
);
const {
  sliceMarkdownByHeading,
  sliceMarkdownByBlockId,
  headingsMatch,
} = await import(pathToFileURL(sliceOut).href);
const { recordNoteRevision, listNoteRevisions, getNoteRevision } = await import(
  pathToFileURL(histOut).href
);
const { fuseSearchHits } = await import(pathToFileURL(rankOut).href);

{
  const a = parseWikilinkInner("Linking Notes#Syntax|alias");
  assert.equal(a.noteTarget, "Linking Notes");
  assert.equal(a.heading, "Syntax");
  assert.equal(a.blockId, null);
  assert.equal(a.alias, "alias");
}

{
  const b = parseWikilinkInner("First Light#^next-step");
  assert.equal(b.noteTarget, "First Light");
  assert.equal(b.blockId, "next-step");
  assert.equal(b.heading, null);
}

{
  const c = parseWikilinkInner("#Embeds");
  assert.equal(c.noteTarget, "");
  assert.equal(c.heading, "Embeds");
}

{
  const md = "See [[Welcome#Feature tour]] and [[First Light#^next-step]].";
  const targets = extractWikilinkTargets(md);
  assert.deepEqual(targets.sort(), ["First Light", "Welcome"]);
}

{
  const md = `# Title\n\nIntro\n\n## Syntax\n\nUse [[links]].\n\n## Other\n\nNope.\n`;
  const slice = sliceMarkdownByHeading(md, "syntax");
  assert.match(slice, /^## Syntax/);
  assert.match(slice, /Use \[\[links\]\]/);
  assert.doesNotMatch(slice, /## Other/);
  assert.equal(headingsMatch("Feature tour", "feature-tour"), true);
}

{
  const md = `Para one.\n\nKeep this task\n- [ ] Open my own folder as a vault ^next-step\n\nAfter.\n`;
  const slice = sliceMarkdownByBlockId(md, "next-step");
  assert.match(slice, /\^next-step/);
  assert.doesNotMatch(slice, /Para one/);
}

{
  const md = `- [x] Seed demo notes\n- [ ] Parent\n  - [ ] Nested\n- [ ] Open my own folder as a vault ^next-step\n- [ ] After\n`;
  const slice = sliceMarkdownByBlockId(md, "next-step");
  assert.match(slice, /Open my own folder/);
  assert.doesNotMatch(slice, /Seed demo notes/);
  assert.doesNotMatch(slice, /After/);
}

{
  recordNoteRevision("n1", "Welcome.md", "# A\n");
  recordNoteRevision("n1", "Welcome.md", "# B\n");
  const list = listNoteRevisions("n1");
  assert.equal(list.length, 2);
  assert.equal(list[0].content, "# B\n");
  assert.equal(getNoteRevision("n1", list[1].id).content, "# A\n");
}

{
  const fused = fuseSearchHits(
    [
      { noteId: "a", path: "A.md", title: "A", snippet: "", score: 1, matchType: "content" },
      { noteId: "b", path: "B.md", title: "B", snippet: "", score: 2, matchType: "title" },
    ],
    { recentIds: ["a"], activeNoteId: "z" },
  );
  assert.equal(fused[0].noteId, "b");
  assert.ok(fused.find((h) => h.noteId === "a").score > 0);
}

{
  const STOP = new Set(["how", "do", "the", "this"]);
  const tokens = "How do agents share this vault?"
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter((t) => t.length >= 2 && !STOP.has(t));
  assert.ok(tokens.includes("agents"));
  assert.ok(tokens.includes("share"));
}

rmSync(outDir, { recursive: true, force: true });
console.log("pkm-links contract: OK");
