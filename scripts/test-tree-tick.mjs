/**
 * Regression: FileTree structure tick must stay stable across React's
 * double getSnapshot read. Calling ensureVaultIndex inside that read
 * mutated structureGeneration and looped to "Maximum update depth"
 * on a hot 45k open (demo session already mounted, then the large vault).
 *
 * Run: node scripts/test-tree-tick.mjs
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { build } from "esbuild";
import { mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const tickSrc = readFileSync(
  new URL("../src/lib/vault/tree-tick.ts", import.meta.url),
  "utf8",
);
const snapStart = tickSrc.indexOf("export function getTreeStructureTickSnapshot");
const snapEnd = tickSrc.indexOf("export function subscribeTreeStructureTick");
assert.ok(snapStart >= 0 && snapEnd > snapStart);
const snapBody = tickSrc.slice(snapStart, snapEnd);
assert.equal(
  snapBody.includes("ensureVaultIndex"),
  false,
  "getTreeStructureTickSnapshot must stay pure - no ensureVaultIndex",
);

const treeSrc = readFileSync(
  new URL("../src/components/vault/FileTree.tsx", import.meta.url),
  "utf8",
);
assert.ok(
  treeSrc.includes("useFlushSync: false"),
  "FileTree virtualizer must not flushSync on a hot open",
);

const settingsSrc = readFileSync(
  new URL("../src/components/settings/SettingsPanel.tsx", import.meta.url),
  "utf8",
);
assert.equal(
  settingsSrc.includes("useSyncExternalStore"),
  true,
  "conflict count still uses an external store",
);
let storeAt = 0;
while ((storeAt = settingsSrc.indexOf("useSyncExternalStore(", storeAt)) !== -1) {
  const slice = settingsSrc.slice(storeAt, storeAt + 220);
  assert.equal(
    slice.includes("ensureVaultIndex"),
    false,
    "settings must not call ensureVaultIndex inside getSnapshot",
  );
  storeAt += 20;
}

const outDir = join(tmpdir(), `nexus-tree-tick-${Date.now()}`);
mkdirSync(outDir, { recursive: true });
const outfile = join(outDir, "tick.mjs");

await build({
  entryPoints: [
    new URL("../src/lib/vault/tree-tick.ts", import.meta.url).pathname,
  ],
  outfile,
  bundle: true,
  format: "esm",
  platform: "node",
  logLevel: "silent",
  plugins: [
    {
      name: "stub-store-react",
      setup(api) {
        api.onResolve({ filter: /\/store$/ }, () => ({
          path: "store",
          namespace: "stub",
        }));
        api.onResolve({ filter: /^react$/ }, () => ({
          path: "react",
          namespace: "stub",
        }));
        api.onLoad({ filter: /.*/, namespace: "stub" }, (args) => {
          if (args.path === "react") {
            return {
              contents: "export function useSyncExternalStore() { return null; }\n",
              loader: "js",
            };
          }
          return {
            contents: `
              let state = { nodes: { a: 1 }, rootIds: ["a"] };
              export const useVaultStore = {
                getState: () => state,
                setState: (patch) => { state = { ...state, ...patch }; },
                subscribe: () => () => {},
              };
              globalThis.__NEXUS_TICK_STORE__ = useVaultStore;
            `,
            loader: "js",
          };
        });
      },
    },
  ],
});

const tick = await import(pathToFileURL(outfile).href);
tick.resetTreeTickCache();
const first = tick.getTreeStructureTickSnapshot();
const second = tick.getTreeStructureTickSnapshot();
assert.equal(first, second, "unchanged store must not bump the tick");

globalThis.__NEXUS_TICK_STORE__.setState({
  nodes: { a: 1, b: 2 },
  rootIds: ["a"],
});
const moved = tick.getTreeStructureTickSnapshot();
assert.notEqual(moved, first, "a new nodes map must bump the tick once");
assert.equal(
  tick.getTreeStructureTickSnapshot(),
  moved,
  "second read of the new map must stay stable",
);

rmSync(outDir, { recursive: true, force: true });
console.log("tree-tick: PASS");
