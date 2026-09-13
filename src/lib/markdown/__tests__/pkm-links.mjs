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
const unlinkedOut = join(outDir, "unlinked.mjs");
const diffOut = join(outDir, "diff.mjs");
const embedOut = join(outDir, "embed.mjs");
const askOut = join(outDir, "ask-extract.mjs");

await bundle("src/lib/markdown/wikilinks.ts", wikiOut);
await bundle("src/lib/markdown/note-slice.ts", sliceOut);
await bundle("src/lib/vault/note-history.ts", histOut);
await bundle("src/lib/search/rank-fusion.ts", rankOut);
await bundle("src/lib/vault/unlinked-mentions.ts", unlinkedOut);
await bundle("src/lib/vault/line-diff.ts", diffOut);
await bundle("src/lib/search/lexical-embed.ts", embedOut);
await bundle("src/lib/search/ask-extract.ts", askOut);

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
const { getUnlinkedMentions, wrapUnlinkedMention } = await import(
  pathToFileURL(unlinkedOut).href
);
const { diffLines, countDiffHunks } = await import(pathToFileURL(diffOut).href);
const { cosineSim, embedText } = await import(pathToFileURL(embedOut).href);
const { sentencesFromMarkdown, scoreAskSentence, isAskCatalogNoise } = await import(
  pathToFileURL(askOut).href
);

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

{
  const welcome = {
    id: "w",
    path: "Welcome.md",
    name: "Welcome.md",
    kind: "note",
    parentId: null,
    mtime: 1,
    content: "# Welcome\n",
  };
  const agent = {
    id: "a",
    path: "Systems/Agent Day.md",
    name: "Agent Day.md",
    kind: "note",
    parentId: null,
    mtime: 1,
    content: "Welcome already has the feature tour.\nSee [[Local-first Vault]].\n",
  };
  const hits = getUnlinkedMentions(welcome, { w: welcome, a: agent });
  assert.equal(hits.length, 1);
  assert.equal(hits[0].fromId, "a");
  const linked = wrapUnlinkedMention(agent.content, "Welcome");
  assert.equal(linked.did, true);
  assert.match(linked.next, /\[\[Welcome\]\]/);
}

{
  const { mine, theirs } = diffLines("keep\nmine\n", "keep\ntheirs\n");
  assert.ok(mine.some((l) => l.side === "del" && l.text === "mine"));
  assert.ok(theirs.some((l) => l.side === "add" && l.text === "theirs"));
  const hunks = countDiffHunks("a\nb\n", "a\nc\n");
  assert.equal(hunks.removed, 1);
  assert.equal(hunks.added, 1);
}

{
  const a = embedText("how do agents share this vault");
  const b = embedText("agents share the same markdown folder");
  const c = embedText("purple elephant recipes");
  assert.ok(cosineSim(a, b) > cosineSim(a, c));
}

{
  const tokens = "How do agents share this vault?"
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter((t) => t.length >= 2);
  assert.ok(tokens.includes("agents"));
  assert.ok(tokens.includes("share"));
}

{
  const tabley = `# Welcome
| Feature | Try it |
| --- | --- |
| Ask | **⌘K** then \`ask: how do agents share this vault\` |
| Files | Right rail |

Agents can edit the same files you do.
`;
  const sents = sentencesFromMarkdown(tabley);
  assert.ok(sents.some((s) => /same files/i.test(s)));
  assert.ok(!sents.some((s) => s.includes("|") || /ask:/i.test(s)));
  const tokens = ["agents", "share", "vault", "files"];
  const phrase = "how do agents share this vault";
  const answer = scoreAskSentence(
    "External tools and agents write the same files.",
    tokens,
    phrase,
  );
  const catalog = scoreAskSentence(
    "⌘K then ask: how do agents share this vault",
    tokens,
    phrase,
  );
  assert.ok(isAskCatalogNoise("Ask | ⌘K then ask: how do agents share this vault"));
  assert.ok(answer > catalog);
}

rmSync(outDir, { recursive: true, force: true });
console.log("pkm-links contract: OK");
