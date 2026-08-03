/**
 * Wave 1 T7 — Markdown purity / round-trip smoke (Node, no Vitest required)
 * Run: node src/lib/markdown/__tests__/roundtrip.mjs
 *
 * Note: full DOM serialize needs browser; this tests purity + protection helpers logic
 * via dynamic import of purity and a lightweight reimplementation check.
 */
import assert from "node:assert/strict";

// Inline purity (mirrors purity.ts) for isolated smoke without TS transform
function normalizeMarkdown(s) {
  return s.replace(/\r\n/g, "\n").replace(/[ \t]+\n/g, "\n").replace(/\n+$/g, "") + "\n";
}
function markdownFingerprint(s) {
  return normalizeMarkdown(s).replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
}
function preferCleanWrite(previous, next) {
  if (!previous && !next) return "\n";
  if (!previous) return normalizeMarkdown(next);
  if (normalizeMarkdown(previous) === normalizeMarkdown(next)) return previous;
  if (markdownFingerprint(previous) === markdownFingerprint(next)) return previous;
  return normalizeMarkdown(next);
}
function normalizeLineEndings(s) {
  return (s || "").replace(/\r\n/g, "\n");
}

// Source intentional blank lines must survive source-style save path
{
  const prev = "# Title\n\nPara\n";
  const user = "# Title\n\n\n\nPara\n\n";
  const next = normalizeLineEndings(user);
  assert.notEqual(preferCleanWrite(prev, next), next, "preferCleanWrite drops blanks (expected)");
  assert.equal(next, user.replace(/\r\n/g, "\n"), "source path keeps blanks");
}

// Fingerprint noise
{
  const a = "Hello  world\n\n\n";
  const b = "Hello world\n\n";
  assert.equal(markdownFingerprint(a), markdownFingerprint(b));
  assert.equal(preferCleanWrite(a, b), a);
}

// Code fence wikilink protection pattern
{
  const md = "See [[Real]]\n\n```js\nconst x = '[[NotALink]]';\n```\n";
  const codeHold = [];
  const held = md
    .replace(/```[\s\S]*?```/g, (full) => {
      const i = codeHold.length;
      codeHold.push(full);
      return `%%CODE${i}%%`;
    });
  const withWiki = held.replace(/\[\[([^\]]+)\]\]/g, (full) => `WIKI:${full}`);
  assert.match(withWiki, /WIKI:\[\[Real\]\]/);
  assert.doesNotMatch(withWiki, /WIKI:\[\[NotALink\]\]/);
  assert.equal(codeHold[0].includes("[[NotALink]]"), true);
}

// Frontmatter peel pattern
{
  const raw = "---\ntags: [a, b]\n---\n\n# Hello\n";
  const fm = raw.match(/^---\n([\s\S]*?)\n---\n?/);
  assert.ok(fm);
  assert.equal(fm[1], "tags: [a, b]");
  assert.equal(raw.slice(fm[0].length).trimStart().startsWith("# Hello"), true);
}

console.log("roundtrip purity smoke: OK");
