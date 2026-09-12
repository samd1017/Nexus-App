/**
 * Nested task serialize contract (mirrors serialize.ts taskListItem rule).
 * Run: node src/lib/markdown/__tests__/nested-tasks.mjs
 */
import assert from "node:assert/strict";

function taskItemToMd(content, checked) {
  const raw = content
    .replace(/^\s*\[[ xX]\]\s*/, "")
    .replace(/^\n+/, "")
    .replace(/\n+$/, "");
  const lines = raw.split("\n");
  const first = (lines[0] ?? "").trim();
  const rest = lines
    .slice(1)
    .map((line) => {
      if (!line.trim()) return "";
      if (/^\s*[-*+]/.test(line) || /^\s*\d+\./.test(line)) {
        return `  ${line.replace(/^\s+/, "")}`;
      }
      return `  ${line.trim()}`;
    })
    .filter(Boolean);
  const body = rest.length ? `${first}\n${rest.join("\n")}` : first;
  return `- [${checked ? "x" : " "}] ${body}\n`;
}

const parent = taskItemToMd(
  "Capture a real research thread\n- [ ] File the interview\n- [ ] Link it",
  false,
);
assert.match(parent, /^- \[ \] Capture a real research thread\n/);
assert.match(parent, /^\s{2}- \[ \] File the interview$/m);
assert.match(parent, /^\s{2}- \[ \] Link it$/m);
assert.doesNotMatch(parent.replace(/\n/g, " "), /Capture a real research thread - \[ \] File/);

const flat = taskItemToMd("Open my own folder as a vault", true);
assert.equal(flat, "- [x] Open my own folder as a vault\n");

console.log("nested-tasks contract: OK");
