/**
 * Note HTML sanitizer — style attributes are stripped.
 * Run: node src/lib/markdown/__tests__/sanitize-html.mjs
 */
import assert from "node:assert/strict";
import { build } from "esbuild";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const outDir = mkdtempSync(join(tmpdir(), "nexus-sanitize-"));
const outfile = join(outDir, "sanitize-html.mjs");
await build({
  entryPoints: ["src/lib/markdown/sanitize-html.ts"],
  outfile,
  bundle: true,
  format: "esm",
  platform: "neutral",
  logLevel: "silent",
});

const { sanitizeNoteHtml } = await import(pathToFileURL(outfile).href);

function stripped(html) {
  const out = sanitizeNoteHtml(html);
  assert.equal(typeof out, "string");
  assert.doesNotMatch(out, /(?:^|[\s/])style\s*=/i);
  return out;
}

// CSS payload vectors must not survive as a style attribute.
for (const html of [
  `<div style="background:url(javascript:alert(1))">x</div>`,
  `<p style="background-image:url(https://evil.example/x)">x</p>`,
  `<span style="background:url(data:text/html,abc)">x</span>`,
  `<div style="width:expression(alert(1))">x</div>`,
  `<div style="behavior:url(#default#userData)">x</div>`,
  `<div style="-moz-binding:url(https://evil.example/x.xml)">x</div>`,
  `<div style="@import url(https://evil.example/x.css)">x</div>`,
  `<div STYLE="background:url(https://evil.example/a)">x</div>`,
  `<div style='background:url("https://evil.example/a")'>x</div>`,
  `<div style = "background: url( //evil.example/a )">x</div>`,
  "<div style=\"background:\nurl(https://evil.example/a)\">x</div>",
  `<div style=background:url(javascript:alert(1))>x</div>`,
  `<div/style="background:url(https://evil.example/a)">x</div>`,
  `<img style="background:url('http://evil.test/a.png')" src="ok.png" alt="pic">`,
]) {
  const out = stripped(html);
  assert.doesNotMatch(out, /url\s*\(/i);
  assert.doesNotMatch(out, /javascript:/i);
  assert.doesNotMatch(out, /expression\s*\(/i);
  assert.doesNotMatch(out, /evil\.example/i);
  assert.doesNotMatch(out, /data:text\/html/i);
}

assert.equal(
  sanitizeNoteHtml(`<div style="background:url(javascript:alert(1))">x</div>`),
  "<div>x</div>",
);
assert.equal(
  sanitizeNoteHtml(
    `<a href="https://example.com" style="color:red" title="Example">link</a>`,
  ),
  `<a href="https://example.com" title="Example">link</a>`,
);
assert.equal(
  sanitizeNoteHtml(
    `<img style="width: 200px" src="pic.png" alt="a" width="200" data-width="200" data-align="left">`,
  ),
  `<img src="pic.png" alt="a" width="200" data-width="200" data-align="left">`,
);
assert.equal(
  sanitizeNoteHtml(`<p style="text-align: center">Hi</p>`),
  "<p>Hi</p>",
);

// Allowed note markup stays. A style mention inside text or another attribute is not an attribute.
assert.equal(
  sanitizeNoteHtml(
    `<span data-wikilink="Note" data-alias="Alias" class="wikilink-pill">Alias</span>`,
  ),
  `<span data-wikilink="Note" data-alias="Alias" class="wikilink-pill">Alias</span>`,
);
assert.equal(
  sanitizeNoteHtml(
    `<ul data-type="taskList"><li data-type="taskItem" data-checked="true"><label contenteditable="false"><input type="checkbox" checked><span></span></label><div><p>Ship it</p></div></li></ul>`,
  ),
  `<ul data-type="taskList"><li data-type="taskItem" data-checked="true"><label contenteditable="false"><input type="checkbox" checked><span></span></label><div><p>Ship it</p></div></li></ul>`,
);
assert.equal(
  sanitizeNoteHtml(`<p><strong>hi</strong></p>`),
  "<p><strong>hi</strong></p>",
);
assert.equal(
  sanitizeNoteHtml(`<a title="my style=bold" href="https://example.com">x</a>`),
  `<a title="my style=bold" href="https://example.com">x</a>`,
);
assert.equal(
  sanitizeNoteHtml(`<p>prefer style="color:red" in a sentence</p>`),
  `<p>prefer style="color:red" in a sentence</p>`,
);
assert.equal(
  sanitizeNoteHtml(`<div title="a>b" style="background:url(https://evil.example/a)">x</div>`),
  `<div title="a>b">x</div>`,
);
assert.equal(
  sanitizeNoteHtml(`<span data-style="keep">x</span>`),
  `<span data-style="keep">x</span>`,
);

// <style> elements were already dropped; keep that.
assert.equal(
  sanitizeNoteHtml(
    `<style>body{background:url(https://evil.example/a)}</style><p>ok</p>`,
  ),
  "<p>ok</p>",
);

assert.equal(sanitizeNoteHtml(""), "");
assert.equal(sanitizeNoteHtml("   "), "   ");

console.log("sanitize-html style strip: OK");
