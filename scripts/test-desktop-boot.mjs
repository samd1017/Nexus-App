/**
 * Saved-page boot decisions. The desktop window paints Ready before the app bundle.
 * Run: npm run test:desktop-boot
 */
import assert from "node:assert/strict";

if (!process.env.NEXUS_TSX) {
  const { spawnSync } = await import("node:child_process");
  const r = spawnSync("npx", ["--yes", "tsx", "scripts/test-desktop-boot.mjs"], {
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
  SAVED_PAGE_READY_MESSAGE,
  readOpenLastVault,
  readLastNotePath,
  shouldPrefetchSavedPage,
  savedPageTitlesLive,
  takePrefetchedDesktopShell,
} = await import("../src/lib/vault/desktop-boot.ts");

assert.equal(SAVED_PAGE_READY_MESSAGE, "Ready · titles and open notes");
assert.equal(readOpenLastVault(null), true);
assert.equal(readOpenLastVault("{"), true);
assert.equal(
  readOpenLastVault(JSON.stringify({ state: { openLastVault: false } })),
  false,
);
assert.equal(
  readLastNotePath(JSON.stringify({ state: { settings: { lastNotePath: "00-Inbox/00/Hub 0.md" } } })),
  "00-Inbox/00/Hub 0.md",
);
assert.equal(readLastNotePath(null), null);
assert.equal(
  shouldPrefetchSavedPage({ inTauri: true, root: "/vault", openLastVault: true }),
  true,
);
assert.equal(
  shouldPrefetchSavedPage({ inTauri: false, root: "/vault", openLastVault: true }),
  false,
);
assert.equal(
  shouldPrefetchSavedPage({ inTauri: true, root: null, openLastVault: true }),
  false,
);
assert.equal(
  shouldPrefetchSavedPage({ inTauri: true, root: "/vault", openLastVault: false }),
  false,
);
assert.equal(
  savedPageTitlesLive({ titlesLive: true, rows: [{ id: "a" }] }),
  true,
);
assert.equal(savedPageTitlesLive({ titles_live: true, rows: [{ id: "a" }] }), true);
assert.equal(savedPageTitlesLive({ titlesLive: true, pending: true, rows: [{ id: "a" }] }), false);
assert.equal(savedPageTitlesLive({ titlesLive: false, rows: [{ id: "a" }] }), false);
assert.equal(savedPageTitlesLive({ titlesLive: true, rows: [] }), false);
assert.equal(savedPageTitlesLive(null), false);

const g = globalThis;
g.window = {
  __NEXUS_BOOT__: {
    root: "/vault",
    mount: { titlesLive: true, rows: [{ id: "a" }] },
  },
};
assert.equal(takePrefetchedDesktopShell("/other"), null);
const taken = takePrefetchedDesktopShell("/vault");
assert.equal(taken.titlesLive, true);
assert.equal(takePrefetchedDesktopShell("/vault"), null);

console.log("desktop-boot: PASS");
