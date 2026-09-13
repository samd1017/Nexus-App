/**
 * Partialize policy — must match persist-policy.ts (bundled).
 * Run: node scripts/test-partialize-policy.mjs
 */
import assert from "node:assert/strict";
import { build } from "esbuild";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { pathToFileURL } from "node:url";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outDir = join(tmpdir(), `nexus-partialize-${Date.now()}`);
mkdirSync(outDir, { recursive: true });
const outFile = join(outDir, "persist-policy.mjs");

await build({
  entryPoints: [path.join(root, "src/lib/vault/persist-policy.ts")],
  outfile: outFile,
  bundle: true,
  format: "esm",
  platform: "neutral",
  logLevel: "silent",
});

const { partializeVaultPersist, PARTIALIZE_NODE_CAP } = await import(
  pathToFileURL(outFile).href
);

const LARGE_TEST_VAULT_ID = "large-test-vault-45k";

function makeNodes(n) {
  const nodes = {};
  for (let i = 0; i < n; i++) nodes[`n${i}`] = { id: `n${i}` };
  return nodes;
}

const baseSettings = {
  theme: "dark",
  workspaceSplit: false,
  lastNotePath: null,
  lastSecondaryNotePath: null,
};

{
  const out = partializeVaultPersist({
    mode: "demo",
    vaultId: LARGE_TEST_VAULT_ID,
    vaultName: "Large Test Vault",
    vaultPath: "Large Test Vault",
    nodes: makeNodes(10),
    rootIds: ["r"],
    activeNoteId: "n0",
    settings: { ...baseSettings, lastNotePath: "00-Inbox/a.md", workspaceSplit: true },
    expandedFolders: ["r"],
  });
  assert.deepEqual(out.nodes, {}, "large-test must persist empty nodes");
  assert.equal(out.vaultId, null);
  assert.equal(out.mode, "demo");
  assert.ok(out.scaleRemount, "large-test writes a remount ticket");
  assert.equal(out.scaleRemount.kind, "large-test");
  assert.equal(out.scaleRemount.lastNotePath, "00-Inbox/a.md");
  assert.equal(out.scaleRemount.workspaceSplit, true);
  assert.equal(out.settings.workspaceSplit, true);
  console.log("OK: 45k → empty nodes + remount ticket (split/path kept)");
}

{
  const out = partializeVaultPersist({
    mode: "local",
    vaultId: "soak-vault-10000",
    vaultName: "Soak 10,000",
    nodes: makeNodes(100),
    settings: { ...baseSettings, soakNoteCount: 10000, workspaceSplit: true, lastSecondaryNotePath: "Hub.md" },
  });
  assert.deepEqual(out.nodes, {});
  assert.equal(out.scaleRemount.kind, "soak");
  assert.equal(out.scaleRemount.noteCount, 10000);
  assert.equal(out.scaleRemount.lastSecondaryNotePath, "Hub.md");
  console.log("OK: soak-vault-* → remount ticket, no nodes");
}

{
  const out = partializeVaultPersist({
    mode: "demo",
    vaultId: "some-vault",
    vaultName: "Big",
    nodes: makeNodes(PARTIALIZE_NODE_CAP + 1),
    settings: baseSettings,
  });
  assert.deepEqual(out.nodes, {});
  assert.equal(out.vaultId, null);
  assert.equal(out.scaleRemount, null);
  console.log(`OK: nodeCount > ${PARTIALIZE_NODE_CAP} → nodes empty`);
}

{
  const nodes = makeNodes(PARTIALIZE_NODE_CAP);
  const out = partializeVaultPersist({
    mode: "demo",
    vaultId: "edge-vault",
    nodes,
    settings: baseSettings,
    activeNoteId: "n0",
  });
  assert.equal(Object.keys(out.nodes).length, PARTIALIZE_NODE_CAP);
  assert.equal(out.vaultId, "edge-vault");
  console.log(`OK: nodeCount === ${PARTIALIZE_NODE_CAP} → nodes kept`);
}

{
  const nodes = makeNodes(3);
  const settings = { workspaceSplit: true, lastSecondaryNotePath: "Callouts.md" };
  const out = partializeVaultPersist({
    mode: "demo",
    vaultId: "demo",
    vaultName: "Demo",
    nodes,
    rootIds: ["a"],
    activeNoteId: "n1",
    secondaryNoteId: "n2",
    settings,
  });
  assert.deepEqual(out.nodes, nodes);
  assert.equal(out.settings.workspaceSplit, true);
  assert.equal(out.secondaryNoteId, "n2");
  console.log("OK: small demo → full snapshot + dual-pane");
}

{
  for (const mode of ["fsa", "desktop"]) {
    const out = partializeVaultPersist({
      mode,
      vaultId: "disk",
      vaultName: "Disk",
      nodes: makeNodes(5),
      settings: { ...baseSettings, lastNotePath: "Welcome.md", workspaceSplit: true },
    });
    assert.deepEqual(out.nodes, {}, `${mode} must not persist nodes`);
    assert.equal(out.vaultId, null);
    assert.equal(out.settings.lastNotePath, "Welcome.md");
    assert.equal(out.settings.workspaceSplit, true);
  }
  console.log("OK: fsa/desktop → nodes empty, last path + split kept");
}

rmSync(outDir, { recursive: true, force: true });
console.log("test-partialize-policy: PASS");
