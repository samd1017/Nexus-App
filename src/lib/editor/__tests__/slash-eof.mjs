import assert from "node:assert/strict";

/** Mirrors isSlashCommandText in slash-commands.ts */
function isSlashCommandText(textBefore) {
  const m = textBefore.match(/^\s*\/([^\n]*)$/);
  if (!m) return false;
  return !(m[1] ?? "").includes("\0");
}

assert.equal(isSlashCommandText("/"), true);
assert.equal(isSlashCommandText("/call"), true);
assert.equal(isSlashCommandText("  /note"), true);
assert.equal(isSlashCommandText("hello/"), false);
assert.equal(isSlashCommandText("Demo data only. /"), false);
assert.equal(isSlashCommandText(""), false);
console.log("slash-eof: PASS");
