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
  DESKTOP_SAVED_PAGE_KEY,
  readOpenLastVault,
  readLastNotePath,
  shouldPrefetchSavedPage,
  savedPageTitlesLive,
  savedPageRecord,
  readSavedPage,
  savedPageMatchesLaunch,
  rememberSavedPage,
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

const page = savedPageRecord("/vault", [
  { name: " 00-Inbox " },
  { name: "" },
  { name: "Hub 0.md" },
  ...Array.from({ length: 20 }, (_, i) => ({ name: `extra-${i}.md` })),
]);
assert.equal(page.root, "/vault");
assert.equal(page.names.length, 12);
assert.equal(page.names[0], "00-Inbox");
assert.equal(page.names[1], "Hub 0.md");
assert.equal(savedPageRecord("", [{ name: "A" }]), null);
assert.equal(savedPageRecord("/vault", []), null);
assert.equal(savedPageRecord("/vault", [{ name: "  " }]), null);
const roundTrip = readSavedPage(JSON.stringify(page));
assert.deepEqual(roundTrip, page);
assert.equal(readSavedPage("{"), null);
assert.equal(readSavedPage(null), null);
assert.equal(savedPageMatchesLaunch(page, "/vault", true), true);
assert.equal(savedPageMatchesLaunch(page, "/other", true), false);
assert.equal(savedPageMatchesLaunch(page, "/vault", false), false);
assert.equal(savedPageMatchesLaunch(null, "/vault", true), false);

const mem = new Map();
globalThis.localStorage = {
  setItem(key, value) {
    mem.set(key, value);
  },
  getItem(key) {
    return mem.has(key) ? mem.get(key) : null;
  },
};
rememberSavedPage("/vault", [{ name: "Hub 0.md" }, { name: "" }]);
const stored = readSavedPage(mem.get(DESKTOP_SAVED_PAGE_KEY));
assert.deepEqual(stored, { root: "/vault", names: ["Hub 0.md"] });
rememberSavedPage("", [{ name: "nope" }]);
assert.deepEqual(readSavedPage(mem.get(DESKTOP_SAVED_PAGE_KEY)), stored);

const { readFileSync } = await import("node:fs");
const html = readFileSync(new URL("../desktop/index.html", import.meta.url), "utf8");
const pageJs = readFileSync(new URL("../public/saved-page.js", import.meta.url), "utf8");
const bootSrc = readFileSync(new URL("../desktop/boot.ts", import.meta.url), "utf8");
const pageTag = html.indexOf('src="/saved-page.js"');
const bootTag = html.indexOf('src="./boot.ts"');
assert.ok(pageTag > 0 && bootTag > pageTag, "saved page script runs before the module");
assert.equal(pageJs.includes("import "), false);
assert.equal(pageJs.includes("await "), false);
assert.equal(pageJs.includes(SAVED_PAGE_READY_MESSAGE), true);
assert.equal(pageJs.includes(DESKTOP_SAVED_PAGE_KEY), true);
assert.equal(pageJs.includes("nexus-desktop-vault-root"), true);
assert.equal(pageJs.includes('data-open-progress", "ready"'), true);
const bootFn = bootSrc.slice(bootSrc.indexOf("async function bootDesktop"));
const yieldAt = bootFn.indexOf("await afterPaint()");
const prefetchAt = bootFn.indexOf("await prefetchSavedPage()");
const appAt = bootFn.indexOf('import("./main.tsx")');
assert.ok(yieldAt >= 0 && yieldAt < prefetchAt && prefetchAt < appAt);

console.log("desktop-boot: PASS");
