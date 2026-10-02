/**
 * Open tabs come back with the vault that owned them, and nowhere else.
 */
import assert from "node:assert/strict";

if (!process.env.NEXUS_TSX) {
  const { spawnSync } = await import("node:child_process");
  const r = spawnSync("npx", ["--yes", "tsx", "scripts/test-tab-session.mjs"], {
    cwd: process.cwd(),
    encoding: "utf8",
    timeout: 30_000,
    env: { ...process.env, NEXUS_TSX: "1" },
  });
  if (r.stdout) process.stdout.write(r.stdout);
  if (r.stderr) process.stderr.write(r.stderr);
  process.exit(r.status ?? 1);
}

const {
  emptyTabSession,
  readVaultTabs,
  resolveTabList,
  writeVaultTabs,
} = await import("../src/lib/vault/tab-session.ts");

const sessionA = {
  ...emptyTabSession(),
  primary: ["Notes/A.md", "Notes/Gone.md", "Notes/B.md"],
  secondary: ["Notes/Side.md"],
  active: "Notes/Gone.md",
  secondaryActive: "Notes/Side.md",
  split: true,
  scroll: [
    { pane: "primary", path: "Notes/A.md", top: 240 },
    { pane: "primary", path: "Notes/Gone.md", top: 80 },
  ],
  at: 10,
};
const sessionB = {
  ...emptyTabSession(),
  primary: ["Other/Only.md"],
  active: "Other/Only.md",
  at: 20,
};

let book = writeVaultTabs({}, "vault-a", sessionA);
book = writeVaultTabs(book, "vault-b", sessionB);
const againA = readVaultTabs(book, "vault-a");
const againB = readVaultTabs(book, "vault-b");
assert.deepEqual(againA.primary, ["Notes/A.md", "Notes/Gone.md", "Notes/B.md"]);
assert.deepEqual(againB.primary, ["Other/Only.md"]);
assert.equal(againA.primary.includes("Other/Only.md"), false);
assert.equal(againB.primary.includes("Notes/A.md"), false);
assert.equal(readVaultTabs(book, "vault-c"), null);

const ids = new Map([
  ["Notes/A.md", "id-a"],
  ["Notes/B.md", "id-b"],
  ["Notes/Side.md", "id-side"],
]);
const primary = resolveTabList(againA.primary, againA.active, ids);
assert.deepEqual(primary.ids, ["id-a", "id-b"]);
assert.deepEqual(primary.paths, ["Notes/A.md", "Notes/B.md"]);
assert.equal(primary.activeId, "id-b");
assert.deepEqual(primary.missing, ["Notes/Gone.md"]);

const secondary = resolveTabList(againA.secondary, againA.secondaryActive, ids);
assert.deepEqual(secondary.ids, ["id-side"]);
assert.equal(secondary.activeId, "id-side");

const none = resolveTabList(["Missing.md"], "Missing.md", ids);
assert.deepEqual(none.ids, []);
assert.equal(none.activeId, null);

const keptActive = resolveTabList(["Notes/A.md", "Notes/B.md"], "Notes/A.md", ids);
assert.equal(keptActive.activeId, "id-a");

const { readFileSync } = await import("node:fs");
const store = readFileSync("src/lib/vault/store.ts", "utf8");
assert.match(store, /restoreSavedTabs/);
assert.match(store, /tabsOwnerVault !== s\.vaultId/);
assert.match(store, /saveTabSession\(state\.vaultId, snapshotTabSession\(state\)\)/);
const persist = readFileSync("src/lib/vault/persist-policy.ts", "utf8");
assert.equal(persist.includes("primaryTabs"), false);
assert.equal(persist.includes("nexus-tabs-v1"), false);

console.log("tab-session: PASS");
