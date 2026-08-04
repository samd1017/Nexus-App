/**
 * Pure unit test for vault store partialize policy (no browser / zustand).
 * Mirrors src/lib/vault/store.ts partialize rules for large mounts.
 * Run: node scripts/test-partialize-policy.mjs
 */

import assert from "node:assert/strict";

/** @constant Must match large-test-vault.ts LARGE_TEST_VAULT_ID */
const LARGE_TEST_VAULT_ID = "large-test-vault-45k";

/**
 * Inline reimplementation of store partialize large-vault gate.
 * @param {{
 *   mode?: string,
 *   vaultId?: string | null,
 *   vaultName?: string,
 *   vaultPath?: string,
 *   nodes?: Record<string, unknown>,
 *   rootIds?: string[],
 *   activeNoteId?: string | null,
 *   settings?: unknown,
 *   expandedFolders?: string[],
 * }} s
 */
function partialize(s) {
  const disk = s.mode === "fsa" || s.mode === "desktop";
  // Never write the 45k seed (or any huge mount) to localStorage — QuotaExceededError.
  const isLargeTest = s.vaultId === LARGE_TEST_VAULT_ID;
  const nodeCount = s.nodes ? Object.keys(s.nodes).length : 0;
  const tooBig = isLargeTest || nodeCount > 2500;
  if (disk || tooBig) {
    return {
      vaultId: null,
      vaultName: "",
      vaultPath: "",
      mode: "demo",
      nodes: {},
      rootIds: [],
      activeNoteId: null,
      settings: s.settings,
      expandedFolders: [],
    };
  }
  return {
    vaultId: s.vaultId,
    vaultName: s.vaultName,
    vaultPath: s.vaultPath,
    mode: s.mode,
    nodes: s.nodes,
    rootIds: s.rootIds,
    activeNoteId: s.activeNoteId,
    settings: s.settings,
    expandedFolders: s.expandedFolders,
  };
}

function makeNodes(n) {
  /** @type {Record<string, { id: string }>} */
  const nodes = {};
  for (let i = 0; i < n; i++) nodes[`n${i}`] = { id: `n${i}` };
  return nodes;
}

const baseSettings = { theme: "dark" };

// 1) large-test-vault-45k → nodes emptied regardless of small node map
{
  const out = partialize({
    mode: "demo",
    vaultId: LARGE_TEST_VAULT_ID,
    vaultName: "Large Test Vault",
    vaultPath: "Large Test Vault",
    nodes: makeNodes(10),
    rootIds: ["r"],
    activeNoteId: "n0",
    settings: baseSettings,
    expandedFolders: ["r"],
  });
  assert.deepEqual(out.nodes, {}, "large-test-vault-45k must persist empty nodes");
  assert.equal(out.vaultId, null);
  assert.equal(out.mode, "demo");
  assert.equal(out.settings, baseSettings);
  console.log("OK: vaultId large-test-vault-45k → nodes empty");
}

// 2) nodeCount > 2500 → nodes emptied
{
  const out = partialize({
    mode: "demo",
    vaultId: "some-vault",
    vaultName: "Big",
    vaultPath: "/big",
    nodes: makeNodes(2501),
    rootIds: ["r"],
    activeNoteId: "n0",
    settings: baseSettings,
    expandedFolders: [],
  });
  assert.deepEqual(out.nodes, {}, "nodeCount > 2500 must persist empty nodes");
  assert.equal(out.vaultId, null);
  console.log("OK: nodeCount > 2500 → nodes empty");
}

// 3) nodeCount === 2500 → still persisted (threshold is strict >)
{
  const nodes = makeNodes(2500);
  const out = partialize({
    mode: "demo",
    vaultId: "edge-vault",
    vaultName: "Edge",
    vaultPath: "/edge",
    nodes,
    rootIds: ["r"],
    activeNoteId: "n0",
    settings: baseSettings,
    expandedFolders: [],
  });
  assert.equal(Object.keys(out.nodes).length, 2500, "exactly 2500 nodes may persist");
  assert.equal(out.vaultId, "edge-vault");
  console.log("OK: nodeCount === 2500 → nodes kept");
}

// 4) small demo vault → full snapshot
{
  const nodes = makeNodes(3);
  const out = partialize({
    mode: "demo",
    vaultId: "demo",
    vaultName: "Demo",
    vaultPath: "",
    nodes,
    rootIds: ["a"],
    activeNoteId: "n1",
    settings: baseSettings,
    expandedFolders: ["a"],
  });
  assert.deepEqual(out.nodes, nodes);
  assert.equal(out.vaultId, "demo");
  assert.equal(out.activeNoteId, "n1");
  console.log("OK: small demo vault → full snapshot");
}

// 5) fsa / desktop → never persist nodes (disk path)
{
  for (const mode of ["fsa", "desktop"]) {
    const out = partialize({
      mode,
      vaultId: "disk",
      vaultName: "Disk",
      vaultPath: "/path",
      nodes: makeNodes(5),
      rootIds: ["r"],
      activeNoteId: "n0",
      settings: baseSettings,
      expandedFolders: [],
    });
    assert.deepEqual(out.nodes, {}, `${mode} must not persist nodes`);
    assert.equal(out.vaultId, null);
    assert.equal(out.mode, "demo");
  }
  console.log("OK: fsa/desktop → nodes empty");
}

console.log("test-partialize-policy: PASS");
