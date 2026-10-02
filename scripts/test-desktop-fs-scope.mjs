/**
 * Desktop FS scope + scale default path contract (no Tauri).
 *
 *   npm run test:desktop-fs-scope
 */
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";

if (!process.env.NEXUS_TSX) {
  const { spawnSync } = await import("node:child_process");
  const r = spawnSync("npx", ["--yes", "tsx", "scripts/test-desktop-fs-scope.mjs"], {
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
  DesktopFsForbiddenError,
  desktopFsForbiddenMessage,
  isForbiddenFsError,
} = await import("../src/lib/vault/desktop-fs-scope.ts");
const { defaultScaleVaultPath, documentsDir } = await import("./scale-vault-path.mjs");

assert.equal(
  isForbiddenFsError(new Error("forbidden path: C:\\vault\\nexus-scale-100k")),
  true,
);
assert.equal(
  isForbiddenFsError(
    new Error(
      "path not allowed on the configured scope: path: /vault/nexus-scale-100k",
    ),
  ),
  true,
);
assert.equal(
  isForbiddenFsError(new Error("Path denied by fs scope")),
  true,
);
assert.equal(isForbiddenFsError(new Error("ENOENT: no such file")), false);
assert.equal(isForbiddenFsError(new Error("read failed")), false);

const msg = desktopFsForbiddenMessage("C:\\\\vault\\\\nexus-scale-100k");
assert.match(msg, /desktop FS scope denied/i);
assert.match(msg, /Open folder|Documents/i);
const boom = new DesktopFsForbiddenError("/tmp/out-of-scope");
assert.equal(boom.name, "DesktopFsForbiddenError");
assert.equal(isForbiddenFsError(boom), true);

const prevVault = process.env.NEXUS_SCALE_VAULT;
const prevDocs = process.env.NEXUS_SCALE_DOCUMENTS;
delete process.env.NEXUS_SCALE_VAULT;
delete process.env.NEXUS_SCALE_DOCUMENTS;
try {
  const docs = documentsDir();
  assert.equal(path.basename(docs), "Documents");
  const scale = defaultScaleVaultPath(100000);
  assert.equal(path.basename(scale), "nexus-scale-100k");
  assert.ok(
    scale.startsWith(docs),
    `scale vault must sit under Documents (got ${scale})`,
  );
  assert.ok(
    !scale.startsWith(path.join(os.homedir(), "nexus-scale")),
    "must not default to $HOME/nexus-scale-N",
  );
} finally {
  if (prevVault == null) delete process.env.NEXUS_SCALE_VAULT;
  else process.env.NEXUS_SCALE_VAULT = prevVault;
  if (prevDocs == null) delete process.env.NEXUS_SCALE_DOCUMENTS;
  else process.env.NEXUS_SCALE_DOCUMENTS = prevDocs;
}

console.log("desktop-fs-scope: PASS");
