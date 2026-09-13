/**
 * Synthetic vault generator contract.
 * Run: node src/lib/vault/__tests__/synthetic-vault.contract.mjs
 */
import assert from "node:assert/strict";
import { build } from "esbuild";
import { mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { pathToFileURL } from "node:url";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const outDir = join(tmpdir(), `nexus-syn-c-${Date.now()}`);
mkdirSync(outDir, { recursive: true });
const out = join(outDir, "synthetic.mjs");
await build({
  entryPoints: [path.join(root, "src/lib/vault/synthetic-vault.ts")],
  outfile: out,
  bundle: true,
  format: "esm",
  platform: "neutral",
  logLevel: "silent",
});
const m = await import(pathToFileURL(out).href);

const a = m.buildSyntheticVaultSync({ noteCount: 80, seed: 1 });
const b = m.buildSyntheticVaultSync({ noteCount: 80, seed: 1 });
assert.equal(a.noteCount, 80);
assert.equal(Object.keys(a.nodes).length, Object.keys(b.nodes).length);
const noteA = Object.values(a.nodes).find((n) => n.kind === "note" && n.path.endsWith("Topic 1.md"));
assert.ok(noteA?.content?.includes("[["));
assert.ok(noteA?.content?.includes("#scale"));
assert.ok(noteA?.content?.includes("## Overview"));
assert.equal(m.soakVaultId(10000), "soak-vault-10000");
assert.equal(m.parseSoakNoteCount("soak-vault-50000"), 50000);
assert.equal(m.isSyntheticSoakVault("soak-vault-1"), true);
assert.equal(m.isSyntheticSoakVault("demo-vault"), false);
const hub = Object.values(a.nodes).find((n) => n.kind === "note" && n.name.startsWith("Hub"));
assert.ok(hub, "hub notes exist");
assert.equal(m.noteTitleForIndex(0), "Hub 0");
assert.equal(m.noteTitleForIndex(200), "Hub 200");
assert.equal(m.noteTitleForIndex(1), "Topic 1");
assert.match(m.notePathForIndex(0), /Hub 0\.md$/);
assert.equal(
  [...Array(3200)].filter((_, i) => m.noteTitleForIndex(i).startsWith("Hub ")).length,
  16,
  "official 3200-note vault has 16 Hub titles (every 200)",
);
rmSync(outDir, { recursive: true, force: true });
console.log("synthetic-vault.contract: PASS");
