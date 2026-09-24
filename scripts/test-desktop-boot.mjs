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
    timeout: 90_000,
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
  vaultRootsMatch,
  savedPageBannerUp,
  rememberSavedPage,
  readSavedPageCookie,
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
assert.equal(savedPageMatchesLaunch(page, "/vault/", true), true);
assert.equal(savedPageMatchesLaunch(page, "\\vault", true), true);
assert.equal(vaultRootsMatch("/vault/", "\\vault"), true);
assert.equal(vaultRootsMatch("", "/vault"), false);
assert.equal(savedPageMatchesLaunch(page, "/other", true), false);
assert.equal(savedPageMatchesLaunch(page, "/vault", false), false);
assert.equal(savedPageMatchesLaunch(null, "/vault", true), false);
assert.deepEqual(savedPageRecord("/vault", [{ path: "00-Inbox/Hub 0.md" }]), {
  root: "/vault",
  names: ["Hub 0.md"],
});
globalThis.document = {
  getElementById(id) {
    if (id !== "nexus-boot-banner") return null;
    return { hidden: false, textContent: "Ready · titles and open notesHub 0" };
  },
};
assert.equal(savedPageBannerUp(), true);
globalThis.document = {
  getElementById() {
    return { hidden: true, textContent: "Ready · titles and open notes" };
  },
};
assert.equal(savedPageBannerUp(), false);

const mem = new Map();
globalThis.localStorage = {
  setItem(key, value) {
    mem.set(key, value);
  },
  getItem(key) {
    return mem.has(key) ? mem.get(key) : null;
  },
};
assert.equal(rememberSavedPage("/vault", [{ name: "Hub 0.md" }, { name: "" }]), true);
const stored = readSavedPage(mem.get(DESKTOP_SAVED_PAGE_KEY));
assert.deepEqual(stored, { root: "/vault", names: ["Hub 0.md"] });
assert.equal(rememberSavedPage("", [{ name: "nope" }]), false);
assert.deepEqual(readSavedPage(mem.get(DESKTOP_SAVED_PAGE_KEY)), stored);

let cookieJar = "";
globalThis.localStorage = {
  setItem() {
    throw new Error("storage denied");
  },
  getItem() {
    return null;
  },
};
globalThis.document = {
  get cookie() {
    return cookieJar;
  },
  set cookie(value) {
    cookieJar = value;
  },
  getElementById() {
    return { hidden: true, textContent: "" };
  },
};
globalThis.window = { __NEXUS_BOOT__: {} };
assert.equal(rememberSavedPage("/vault", [{ name: "Hub 0.md" }]), true);
assert.equal(globalThis.window.__NEXUS_BOOT__.savedPageWrite, "ok");
const fromCookie = readSavedPage(readSavedPageCookie(cookieJar));
assert.deepEqual(fromCookie, { root: "/vault", names: ["Hub 0.md"] });
globalThis.document = {
  get cookie() {
    return "";
  },
  set cookie(_value) {
    throw new Error("cookie denied");
  },
  getElementById() {
    return null;
  },
};
assert.equal(rememberSavedPage("/vault", [{ name: "Hub 0.md" }]), false);
assert.equal(globalThis.window.__NEXUS_BOOT__.savedPageWrite, "failed");

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
assert.equal(pageJs.includes("document.cookie"), true);
assert.equal(pageJs.includes("NEXUS_READY_CLOCK"), true);
assert.equal(pageJs.includes('phase=" + phase'), true);
for (const token of [
  "no-root",
  "open-last-off",
  "no-page",
  "root-mismatch",
  "no-names",
  "no-host",
  "painted",
  "throw",
]) {
  assert.equal(pageJs.includes(token), true, token);
}
assert.equal(pageJs.includes('host.style.top = "44px"'), true);
const clockOrder = ["window=", "document=", "early=", "hit=", "reason=", "shell="];
let cursor = 0;
for (const field of clockOrder) {
  const at = pageJs.indexOf(field, cursor);
  assert.ok(at > cursor, field);
  cursor = at;
}
assert.equal(bootSrc.includes('host.style.top = "44px"'), true);
assert.equal(bootSrc.includes('publishReadyClock("module")'), true);
const storeSrc = readFileSync(new URL("../src/lib/vault/store.ts", import.meta.url), "utf8");
assert.equal(storeSrc.includes('publishReadyClock("shell")'), true);
const clockSrc = readFileSync(new URL("../src/lib/vault/ready-clock.ts", import.meta.url), "utf8");
assert.equal(clockSrc.includes("NEXUS_READY_CLOCK"), true);
const rustSrc = readFileSync(new URL("../src-tauri/src/lib.rs", import.meta.url), "utf8");
assert.equal(rustSrc.includes('ready_clock_line("window"'), true);
assert.equal(rustSrc.includes('ready_clock_line("focus"'), true);
assert.equal(rustSrc.includes('ready_clock_line("document-native"'), true);
assert.equal(rustSrc.includes("fn ready_clock_log"), true);
const { publishReadyClock } = await import("../src/lib/vault/ready-clock.ts");
const clockLogs = [];
const log = console.log;
console.log = (...args) => {
  clockLogs.push(args.join(" "));
};
globalThis.window = { __NEXUS_BOOT__: {} };
publishReadyClock("early", { hit: 0, reason: "no-page" });
publishReadyClock("shell");
console.log = log;
assert.match(clockLogs[0], /^NEXUS_READY_CLOCK phase=early /);
assert.match(clockLogs[0], /hit=0/);
assert.match(clockLogs[0], /reason=no-page/);
assert.match(clockLogs[1], /^NEXUS_READY_CLOCK phase=shell /);
assert.equal(globalThis.window.__NEXUS_READY_CLOCK__.earlyHit, 0);
assert.equal(globalThis.window.__NEXUS_SOAK_LAST__.readyClock.earlyReason, "no-page");
assert.equal(typeof globalThis.window.__NEXUS_SOAK_LAST__.readyClock.shell, "number");
const bootFn = bootSrc.slice(bootSrc.indexOf("async function bootDesktop"));
const yieldAt = bootFn.indexOf("await afterPaint()");
const prefetchAt = bootFn.indexOf("await prefetchSavedPage()");
const appAt = bootFn.indexOf('import("./main.tsx")');
assert.ok(yieldAt >= 0 && yieldAt < prefetchAt && prefetchAt < appAt);
assert.equal(bootSrc.includes("hidden = true"), false);
assert.equal(bootSrc.includes(".remove("), false);

const shellSrc = readFileSync(new URL("../src/components/layout/AppShell.tsx", import.meta.url), "utf8");
const removeAt = shellSrc.indexOf('getElementById("nexus-boot-banner")?.remove()');
assert.ok(removeAt > 0);
const handoff = shellSrc.slice(Math.max(0, removeAt - 500), removeAt);
assert.equal(handoff.includes('progress.phase !== "ready"'), true);
assert.equal(handoff.includes("titles and open notes"), true);
assert.equal(handoff.includes('progress.phase !== "error"'), false);

const { spawnSync } = await import("node:child_process");
const { fileURLToPath } = await import("node:url");
const built = spawnSync(
  "npx",
  ["vite", "build", "--config", "vite.desktop.config.ts", "--logLevel", "error"],
  {
    cwd: fileURLToPath(new URL("..", import.meta.url)),
    encoding: "utf8",
    timeout: 60_000,
  },
);
if (built.stdout) process.stdout.write(built.stdout);
if (built.status !== 0) {
  if (built.stderr) process.stderr.write(built.stderr);
  throw new Error("desktop production build failed");
}
const distHtml = readFileSync(new URL("../dist-desktop/index.html", import.meta.url), "utf8");
const distPage = readFileSync(new URL("../dist-desktop/saved-page.js", import.meta.url), "utf8");
assert.match(distHtml, /<script src="\.\/saved-page\.js"><\/script>/);
assert.equal(distHtml.includes('type="module" src="./saved-page.js"'), false);
assert.equal(distPage.includes(SAVED_PAGE_READY_MESSAGE), true);
const tauriConf = JSON.parse(
  readFileSync(new URL("../src-tauri/tauri.conf.json", import.meta.url), "utf8"),
);
const scriptSrc = tauriConf.app.security.csp
  .split(";")
  .map((part) => part.trim())
  .find((part) => part.startsWith("script-src"));
assert.equal(scriptSrc, "script-src 'self'");

console.log("desktop-boot: PASS");
