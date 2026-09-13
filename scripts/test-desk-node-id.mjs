/**
 * TS deskNodeId must match Rust desk_node_id (Wave E FTS join).
 *
 *   npm run test:desk-node-id
 */
import assert from "node:assert/strict";

if (!process.env.NEXUS_TSX) {
  const { spawnSync } = await import("node:child_process");
  const r = spawnSync("npx", ["--yes", "tsx", "scripts/test-desk-node-id.mjs"], {
    cwd: process.cwd(),
    encoding: "utf8",
    timeout: 30_000,
    env: { ...process.env, NEXUS_TSX: "1" },
  });
  if (r.stdout) process.stdout.write(r.stdout);
  if (r.stderr) process.stderr.write(r.stderr);
  process.exit(r.status ?? 1);
}

const { deskNodeId } = await import("../src/lib/vault/desk-node-id.ts");

function rustDeskNodeId(path) {
  let out = "desk_";
  let prevUs = false;
  for (const raw of path) {
    const c = raw === "\\" ? "/" : raw;
    const ok = /[A-Za-z0-9._/-]/.test(c);
    if (ok) {
      out += c;
      prevUs = false;
    } else if (!prevUs) {
      out += "_";
      prevUs = true;
    }
  }
  return out;
}

const win = "a\\b.md";
const cases = [
  "Hub/Note-1.md",
  win,
  "weird  name.md",
  "foo@@@bar.md",
  "Cluster hub/Brief-02800-z66.md",
  "notes/retrieval-hub.md",
];
for (const c of cases) {
  assert.equal(deskNodeId(c), rustDeskNodeId(c), c);
}
assert.equal(deskNodeId(win), "desk_a/b.md");
assert.equal(deskNodeId("weird  name.md"), "desk_weird_name.md");
console.log("desk-node-id: PASS");
