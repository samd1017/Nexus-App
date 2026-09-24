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
assert.equal(pageJs.includes('host.style.top = "0"'), true);
assert.equal(pageJs.includes('host.style.paddingTop = "44px"'), true);
assert.equal(pageJs.includes("background:#000000"), true);
assert.equal(pageJs.includes("color:#ffffff"), true);
assert.equal(pageJs.includes("font-size:32px"), true);
assert.equal(pageJs.includes("document.title = READY"), true);
assert.equal(pageJs.includes("requestAnimationFrame"), true);
assert.equal(pageJs.includes("offsetHeight"), true);
assert.equal(pageJs.includes('meta[name="nexus-boot-src"]'), true);
const clockOrder = ["window=", "document=", "early=", "hit=", "reason=", "shell="];
let cursor = 0;
for (const field of clockOrder) {
  const at = pageJs.indexOf(field, cursor);
  assert.ok(at > cursor, field);
  cursor = at;
}
assert.equal(bootSrc.includes('host.style.top = "0"'), true);
assert.equal(bootSrc.includes('host.style.paddingTop = "44px"'), true);
assert.equal(bootSrc.includes("background:#000000"), true);
assert.equal(bootSrc.includes("font-size:32px"), true);
assert.equal(bootSrc.includes('publishReadyClock("module")'), true);
const storeSrc = readFileSync(new URL("../src/lib/vault/store.ts", import.meta.url), "utf8");
assert.equal(storeSrc.includes('publishReadyClock("shell")'), true);
const clockSrc = readFileSync(new URL("../src/lib/vault/ready-clock.ts", import.meta.url), "utf8");
assert.equal(clockSrc.includes("NEXUS_READY_CLOCK"), true);
const rustSrc = readFileSync(new URL("../src-tauri/src/lib.rs", import.meta.url), "utf8");
assert.equal(rustSrc.includes('ready_clock_line("process"'), true);
assert.equal(rustSrc.includes('ready_clock_line("window"'), true);
assert.equal(rustSrc.includes('ready_clock_line("focus"'), true);
assert.equal(rustSrc.includes("fn log_ready_phase"), true);
const runtimeAt = rustSrc.indexOf('ready_phase_plugin("nexus-clock-runtime", "runtime")');
const fsAt = rustSrc.indexOf("tauri_plugin_fs::init()");
const pluginsAt = rustSrc.indexOf('ready_phase_plugin("nexus-clock-plugins", "plugins")');
const windowAt = rustSrc.indexOf('ready_clock_line("window"');
assert.ok(runtimeAt > 0 && runtimeAt < fsAt && fsAt < pluginsAt && pluginsAt < windowAt);
assert.equal(rustSrc.includes('"document-native"'), true);
assert.equal(rustSrc.includes('"document-finished"'), true);
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
const earlyHold = shellSrc.indexOf("data-early-ready");
const startingAt = shellSrc.indexOf("Starting");
assert.ok(earlyHold > 0 && startingAt > earlyHold);
const paletteSrc = readFileSync(
  new URL("../src/components/search/CommandPalette.tsx", import.meta.url),
  "utf8",
);
assert.equal(paletteSrc.includes('placeholder="Search notes"'), true);
assert.equal(paletteSrc.includes('data-testid="search-field"'), true);
assert.equal(paletteSrc.includes("nexus-search-field"), true);
assert.equal(paletteSrc.includes("searchEmptyStatus"), true);
assert.equal(paletteSrc.includes('data-testid={emptyStatus === "miss" ? "search-miss"'), true);
assert.equal(paletteSrc.includes('emptyStatus !== "miss"'), true);
assert.equal(paletteSrc.includes("what links Hermes"), false);
assert.equal(paletteSrc.includes('data-search-empty="trash"'), true);
assert.equal(paletteSrc.includes('data-search-empty="orphans"'), true);
assert.equal(paletteSrc.includes('data-search-empty="broken"'), true);
assert.equal(paletteSrc.includes("onSelect={() => {}}"), false);
const settingsSrc = readFileSync(
  new URL("../src/components/settings/SettingsPanel.tsx", import.meta.url),
  "utf8",
);
assert.equal(settingsSrc.includes('initialFocus="cancel"'), true);
assert.equal(settingsSrc.includes("data-settings-rebuild"), true);
assert.equal(settingsSrc.includes('data-testid="settings-rebuild"'), true);
assert.equal(settingsSrc.includes("nexus-rebuild-btn"), true);
assert.equal(settingsSrc.includes("nexus-open-rebuild"), true);
assert.equal(settingsSrc.includes('e.key !== "Enter" && e.key !== " "'), true);
assert.equal(settingsSrc.includes("Rebuild search"), true);
assert.equal(settingsSrc.includes('testId={confirmKind === "rebuild" ? "rebuild-confirm"'), true);
const rebuildBtn = settingsSrc.indexOf('data-testid="settings-rebuild"');
const settingsBody = settingsSrc.indexOf("settings-body");
assert.ok(rebuildBtn > 0 && settingsBody > rebuildBtn);
assert.equal(settingsSrc.includes('data-settings-nav="appearance"'), true);
assert.equal(settingsSrc.includes('data-settings-lead="appearance"'), true);
assert.equal(settingsSrc.includes('data-settings-lead="editor"'), true);
assert.equal(settingsSrc.includes('data-settings-lead="graph"'), true);
assert.equal(
  settingsSrc.includes("This vault has no notes yet. Enter starts a note."),
  true,
);
const treeSrc = readFileSync(
  new URL("../src/components/vault/FileTree.tsx", import.meta.url),
  "utf8",
);
assert.equal(treeSrc.includes("Enter starts a note."), true);
assert.equal(treeSrc.includes('status="vault"'), true);
assert.equal(treeSrc.includes('data-testid="tree-empty-folder-status"'), true);
assert.equal(treeSrc.includes('data-testid="tree-empty-folder-banner"'), true);
assert.equal(treeSrc.includes('data-folder-empty={folderEmpty ? "1" : undefined}'), true);
assert.equal(treeSrc.includes("data-focused-empty-folder"), true);
assert.equal(treeSrc.includes("folderHasNothing"), true);
assert.equal(treeSrc.includes("emptyFolderIdFromTarget"), true);
assert.equal(treeSrc.includes("onEmptyEnter"), true);
assert.equal(treeSrc.includes('data-folder-empty="1"'), true);
assert.equal(
  /data-testid="tree-empty-folder"[\s\S]{0,240}tabIndex=\{-1\}/.test(treeSrc),
  true,
);
const editorSrc = readFileSync(
  new URL("../src/components/editor/EditorPane.tsx", import.meta.url),
  "utf8",
);
assert.equal(editorSrc.includes("data-editor-empty"), true);
assert.equal(editorSrc.includes("Enter starts a note."), true);
assert.equal(editorSrc.includes("Click a note in the list to open it."), true);
const panelSrc = readFileSync(
  new URL("../src/components/right/RightPanel.tsx", import.meta.url),
  "utf8",
);
for (const kind of ["note", "backlinks", "unlinked", "broken", "tags", "outline"]) {
  assert.equal(panelSrc.includes(`kind="${kind}"`), true, kind);
}
assert.equal(
  panelSrc.includes("Open a note. Enter starts a note in the list."),
  true,
);
const keysSrc = readFileSync(
  new URL("../src/components/chrome/KeyboardShortcuts.tsx", import.meta.url),
  "utf8",
);
assert.equal(keysSrc.includes("focusedEmptyFolderId"), true);
assert.equal(keysSrc.includes('"[data-file-tree]"'), true);
assert.equal(keysSrc.includes('"[data-testid=\'nexus-editor\']"'), true);
const confirmSrc = readFileSync(
  new URL("../src/components/chrome/ConfirmDialog.tsx", import.meta.url),
  "utf8",
);
const cancelAt = confirmSrc.indexOf("data-confirm-cancel");
const actionAt = confirmSrc.indexOf("data-confirm-action");
assert.ok(cancelAt > 0 && actionAt > cancelAt);
assert.equal(confirmSrc.includes("confirmEnterAction"), true);
assert.equal(confirmSrc.includes('data-testid="confirm-cancel"'), true);
assert.equal(storeSrc.includes('new Event("nexus-open-rebuild")'), true);

const { confirmEnterAction, openRebuildConfirmIn } = await import(
  "../src/lib/chrome/rebuild-confirm.ts"
);
const { emptyFolderIdFromTarget } = await import(
  "../src/lib/vault/empty-folder-target.ts"
);
assert.equal(confirmEnterAction("cancel"), "dismiss");
assert.equal(confirmEnterAction("confirm"), "rebuild");
assert.equal(confirmEnterAction("other"), "stay");

class MiniEl {
  constructor(doc, tag) {
    this.doc = doc;
    this.tag = tag;
    this.attrs = new Map();
    this.children = [];
    this.parent = null;
    this.listeners = new Map();
    this.textContent = "";
    this.type = "";
  }
  setAttribute(name, value) {
    this.attrs.set(name, String(value));
  }
  getAttribute(name) {
    return this.attrs.has(name) ? this.attrs.get(name) : null;
  }
  append(...nodes) {
    for (const node of nodes) {
      node.parent = this;
      this.children.push(node);
    }
  }
  remove() {
    if (this.parent) {
      this.parent.children = this.parent.children.filter((child) => child !== this);
    }
    this.parent = null;
    if (this.doc.activeElement === this) this.doc.activeElement = this.doc.body;
  }
  focus() {
    this.doc.activeElement = this;
  }
  addEventListener(type, fn) {
    const list = this.listeners.get(type) ?? [];
    list.push(fn);
    this.listeners.set(type, list);
  }
  dispatchEvent(event) {
    for (const fn of this.listeners.get(event.type) ?? []) fn(event);
    return true;
  }
  closest(selector) {
    let el = this;
    while (el) {
      if (
        selector === "[data-folder-empty='1']" &&
        el.getAttribute?.("data-folder-empty") === "1"
      ) {
        return el;
      }
      el = el.parent;
    }
    return null;
  }
}

const miniDoc = {
  activeElement: null,
  body: null,
  createElement(tag) {
    return new MiniEl(this, tag);
  },
};
miniDoc.body = new MiniEl(miniDoc, "body");
miniDoc.activeElement = miniDoc.body;

const rebuildButton = miniDoc.createElement("button");
rebuildButton.textContent = "Rebuild search";
miniDoc.body.append(rebuildButton);
let rebuilt = 0;
const host = openRebuildConfirmIn(miniDoc, rebuildButton, () => {
  rebuilt += 1;
});
assert.equal(host.dialog.getAttribute("data-testid"), "rebuild-confirm");
assert.equal(miniDoc.activeElement, host.cancel);
assert.equal(host.cancel.textContent, "Cancel");
host.dialog.dispatchEvent({ type: "keydown", key: "Enter", preventDefault() {} });
assert.equal(rebuilt, 0);
assert.equal(host.dialog.parent, null);
assert.equal(miniDoc.activeElement, rebuildButton);

const again = openRebuildConfirmIn(miniDoc, rebuildButton, () => {
  rebuilt += 1;
});
again.confirm.focus();
again.dialog.dispatchEvent({ type: "keydown", key: "Enter", preventDefault() {} });
assert.equal(rebuilt, 1);
assert.equal(again.dialog.parent, null);

const folderRow = new MiniEl(miniDoc, "div");
folderRow.setAttribute("data-folder-empty", "1");
folderRow.setAttribute("data-node-id", "folder-9");
const folderLabel = new MiniEl(miniDoc, "span");
folderLabel.parent = folderRow;
assert.equal(emptyFolderIdFromTarget(folderLabel), "folder-9");
assert.equal(emptyFolderIdFromTarget(rebuildButton), null);
assert.equal(emptyFolderIdFromTarget(null), null);
const { claimEmptyFolderEnter, isProgrammaticFocusSteal } = await import(
  "../src/lib/chrome/empty-folder-enter.ts"
);
assert.equal(
  claimEmptyFolderEnter({
    key: "Enter",
    fromTarget: "folder-9",
    fromActive: null,
    treeHasKey: false,
    treeFolder: null,
    armedFolder: null,
    targetStole: false,
  }),
  "folder-9",
);
assert.equal(
  claimEmptyFolderEnter({
    key: "Enter",
    fromTarget: null,
    fromActive: null,
    treeHasKey: true,
    treeFolder: "folder-9",
    armedFolder: null,
    targetStole: false,
  }),
  "folder-9",
);
assert.equal(
  claimEmptyFolderEnter({
    key: "Enter",
    renameField: true,
    fromTarget: "folder-9",
    fromActive: null,
    treeHasKey: false,
    treeFolder: null,
    armedFolder: "folder-9",
    targetStole: false,
  }),
  null,
);
assert.equal(
  claimEmptyFolderEnter({
    key: "Enter",
    fromTarget: null,
    fromActive: null,
    treeHasKey: false,
    treeFolder: null,
    armedFolder: "folder-9",
    targetStole: true,
  }),
  "folder-9",
);
assert.equal(
  claimEmptyFolderEnter({
    key: "Enter",
    fromTarget: null,
    fromActive: null,
    treeHasKey: false,
    treeFolder: null,
    armedFolder: "folder-9",
    targetStole: false,
    targetIdle: true,
  }),
  "folder-9",
);
assert.equal(
  claimEmptyFolderEnter({
    key: "Enter",
    fromTarget: null,
    fromActive: null,
    treeHasKey: false,
    treeFolder: "folder-9",
    armedFolder: null,
    targetStole: true,
    targetIdle: false,
  }),
  null,
);
assert.equal(
  claimEmptyFolderEnter({
    key: "Enter",
    ctrl: true,
    fromTarget: "folder-9",
    fromActive: null,
    treeHasKey: false,
    treeFolder: null,
    armedFolder: null,
    targetStole: false,
  }),
  null,
);
const graphHost = miniDoc.createElement("div");
graphHost.setAttribute("data-graph-host", "");
assert.equal(isProgrammaticFocusSteal(graphHost, true, false), false);
graphHost.closest = (selector) =>
  selector.includes("data-graph-host") ? graphHost : null;
assert.equal(isProgrammaticFocusSteal(graphHost, true, false), true);
assert.equal(isProgrammaticFocusSteal(graphHost, true, true), false);
assert.equal(treeSrc.includes("claimEmptyFolderEnter"), true);
assert.equal(treeSrc.includes("isIdleEnterTarget"), true);
assert.equal(treeSrc.includes("data-empty-armed"), true);
assert.equal(treeSrc.includes("stopImmediatePropagation"), true);
const cssSrc = readFileSync(new URL("../src/styles.css", import.meta.url), "utf8");
assert.equal(cssSrc.includes("outline: 2px solid #5ad8ff"), true);
assert.equal(cssSrc.includes("inset 3px 0 0 #5ad8ff"), true);
assert.equal(cssSrc.includes('data-keyboard-focus="row"'), true);
assert.equal(cssSrc.includes('data-keyboard-focus="control"'), true);
assert.equal(cssSrc.includes("inset 0 0 0 3px #5ad8ff"), true);
assert.equal(cssSrc.includes("nexus-rebuild-btn"), true);
assert.equal(cssSrc.includes("nexus-search-field:focus-within"), true);
assert.equal(cssSrc.includes("caret-color: #5ad8ff"), true);
assert.equal(cssSrc.includes(".nexus-settings-nav:focus"), true);
assert.equal(storeSrc.includes("Moved to Trash. You can put it back."), true);
const trashSrc = readFileSync(
  new URL("../src/components/chrome/DeleteConfirmHost.tsx", import.meta.url),
  "utf8",
);
assert.equal(trashSrc.includes('testId="trash-confirm"'), true);
assert.equal(trashSrc.includes('initialFocus="cancel"'), true);
assert.equal(confirmSrc.includes("data-confirm-message"), true);
assert.equal(confirmSrc.includes("data-confirm-focus"), true);
assert.equal(confirmSrc.includes("data-confirm-landed"), true);
assert.equal(confirmSrc.includes("panel.contains"), true);
assert.equal(confirmSrc.includes("reclaimAfterFocus"), true);
assert.equal(confirmSrc.includes("queueMicrotask") || confirmSrc.includes("reclaimAfterFocus"), true);
assert.equal(settingsSrc.includes('returnTo={'), true);
assert.equal(settingsSrc.includes('[data-testid="settings-rebuild"]'), true);
assert.equal(treeSrc.includes("reclaimAfterFocus"), true);
assert.equal(treeSrc.includes("scheduleEmptyNoteRename"), true);
const enterSrc = readFileSync(
  new URL("../src/lib/chrome/empty-folder-enter.ts", import.meta.url),
  "utf8",
);
assert.equal(enterSrc.includes("aria-label='Folder map'"), true);
assert.equal(enterSrc.includes("scheduleEmptyNoteRename"), true);
const { reclaimAfterFocus } = await import("../src/lib/chrome/focus-ring.ts");
const { scheduleEmptyNoteRename } = await import(
  "../src/lib/chrome/empty-folder-enter.ts"
);
const order = [];
function stealFocus() {
  order.push("steal");
  reclaimAfterFocus(() => order.push("reclaim"));
  order.push("steal-returns");
}
stealFocus();
await new Promise((resolve) => setTimeout(resolve, 40));
assert.ok(order.indexOf("steal-returns") < order.indexOf("reclaim"));
let opened = 0;
let visible = false;
scheduleEmptyNoteRename(
  "note-1",
  () => {
    opened += 1;
    if (opened >= 2) visible = true;
  },
  () => visible,
  4,
);
await new Promise((resolve) => setTimeout(resolve, 80));
assert.equal(opened, 2);
assert.equal(visible, true);
assert.equal(cssSrc.includes(".editor-status"), true);
assert.equal(cssSrc.includes("[data-nexus-confirm] [role=\"dialog\"]"), true);
assert.equal(cssSrc.includes("[data-settings-lead]"), true);
assert.equal(cssSrc.includes("[data-panel-empty]"), true);
assert.equal(cssSrc.includes('data-testid="vault-first-run"'), true);
assert.equal(settingsSrc.includes("holdOpenFocus"), true);
assert.equal(settingsSrc.includes("data-settings-nav=\"appearance\""), true);
assert.equal(paletteSrc.includes("holdOpenFocus"), true);
assert.equal(paletteSrc.includes("data-search-caret") || paletteSrc.includes("holdOpenFocus"), true);
assert.equal(keysSrc.includes("reclaimAfterFocus"), true);
assert.equal(
  editorSrc.includes('data-editor-empty={emptyVault ? "vault" : "note"}'),
  true,
);
const focusSrc = readFileSync(
  new URL("../src/lib/chrome/focus-ring.ts", import.meta.url),
  "utf8",
);
assert.equal(focusSrc.includes("export function holdOpenFocus"), true);
assert.equal(focusSrc.includes("data-settings-landed"), true);
assert.equal(focusSrc.includes("data-search-caret"), true);
assert.equal(focusSrc.includes("data-settings-rebuild"), true);
assert.equal(confirmSrc.includes("lateReclaim"), true);
const toastSrc = readFileSync(
  new URL("../src/components/chrome/Toast.tsx", import.meta.url),
  "utf8",
);
assert.equal(toastSrc.includes('data-testid={trashStatus ? "trash-status" : undefined}'), true);
assert.equal(treeSrc.includes('data-keyboard-focus={isFocused ? "row" : undefined}'), true);
assert.equal(treeSrc.includes('data-testid="tree-rename"'), true);
assert.equal(treeSrc.includes("data-rename-original"), true);
assert.equal(treeSrc.includes("renameKeyAction"), true);
assert.equal(treeSrc.includes('e.key === "F2"'), true);
assert.equal(editorSrc.includes('data-testid={emptyVault ? "vault-first-run"'), true);
const emptySrc = readFileSync(
  new URL("../src/components/ui/EmptyState.tsx", import.meta.url),
  "utf8",
);
assert.equal(emptySrc.includes('data-testid={status === "vault" ? "vault-first-run-list"'), true);
const { shouldSkipLaunchNote } = await import("../src/lib/vault/launch-note.ts");
assert.equal(shouldSkipLaunchNote(0), true);
assert.equal(shouldSkipLaunchNote(1), false);
assert.equal(storeSrc.includes("shouldSkipLaunchNote(noteCount)"), true);
assert.equal(storeSrc.includes("openEmptyVault"), true);
const { renameKeyAction } = await import("../src/lib/chrome/rename-key.ts");
assert.equal(renameKeyAction("Escape"), "restore");
assert.equal(renameKeyAction("Enter"), "commit");
assert.equal(renameKeyAction("F2"), "ignore");
const { treeRowIdFromTarget } = await import("../src/lib/vault/empty-folder-target.ts");
const noteRow = {
  getAttribute(name) {
    return name === "data-node-id" ? "note-1" : null;
  },
  closest(selector) {
    return selector === "[role='treeitem'][data-node-id]" ? this : null;
  },
};
assert.equal(treeRowIdFromTarget(noteRow), "note-1");
assert.equal(treeRowIdFromTarget(null), null);
assert.equal(shellSrc.includes("focusedEmptyFolderId()"), true);
assert.equal(shellSrc.includes("paintedFromPage"), true);
assert.equal(shellSrc.includes("bg-black"), true);
assert.equal(shellSrc.includes("text-[32px]"), true);
assert.equal(shellSrc.includes("text-white"), true);
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
assert.equal(tauriConf.app.windows[0].visible, false);
assert.equal(rustSrc.includes('ready_clock_line("shown"'), true);
assert.equal(rustSrc.includes('phase=early '), true);
const finishedAt = rustSrc.indexOf('document-finished');
const startedAt = rustSrc.indexOf("PageLoadEvent::Started");
assert.ok(finishedAt > 0 && startedAt > finishedAt);
const finished = rustSrc.slice(finishedAt, startedAt);
assert.equal(finished.includes("reveal_main_window"), false);
const savedAt = distHtml.indexOf('src="./saved-page.js"');
assert.ok(savedAt > 0);
assert.equal(distHtml.includes('type="module"'), false);
assert.match(distHtml, /<meta name="nexus-boot-src" content="\.\/assets\/index-/);

// A collapsed list must not strand Esc, F2, first-run, or folder jumps.
const revealSrc = readFileSync(new URL("../src/lib/chrome/reveal-list.ts", import.meta.url), "utf8");
assert.equal(revealSrc.includes("setLeftOpen(true)"), true);
assert.equal(keysSrc.includes("revealFileList("), true);
assert.equal(keysSrc.includes('e.key === "F2"'), true);
assert.equal(keysSrc.includes("nexus-list-home"), true);
assert.equal(editorSrc.includes("revealFileList("), true);
assert.equal(editorSrc.includes("startFirstNote"), true);
assert.equal(paletteSrc.includes("revealFolderInList("), true);
assert.equal(paletteSrc.includes('data-testid="search-folder-hit"'), true);
assert.equal(treeSrc.includes("nexus-reveal-folder"), true);
// Hidden-before-Ready width must not collapse the desktop list.
assert.ok(shellSrc.indexOf("if (isDesktopShell())") < shellSrc.indexOf("let wasNarrow"));
assert.equal(storeSrc.includes("fullscreenPanelSnapshot?.leftOpen ?? true"), true);
// A click behind Settings or an ask is not a dismiss.
assert.equal(settingsSrc.includes('aria-label="Close settings"'), false);
assert.equal(settingsSrc.includes("settings-stay-hint"), true);
assert.equal(confirmSrc.includes("if (e.target === e.currentTarget) onCancel()"), false);
assert.equal(cssSrc.includes(".nexus-search-input:focus-visible"), true);
// Rename is one clear field; the editor head folds labels before clipping the title.
assert.equal(treeSrc.includes("nexus-rename-input"), true);
assert.equal(cssSrc.includes("container-type: inline-size"), true);
assert.equal(paletteSrc.includes('data-testid="search-miss-actions"'), true);
assert.equal(keysSrc.includes("[data-right-panel]"), true);
// A large vault never reports its loaded page as its size; System theme is settled, not live.
assert.equal(settingsSrc.includes("Counting notes…"), true);
assert.equal(settingsSrc.includes("if (shellCatalog) return catalogNoteCount > 0 ? catalogNoteCount : -1;"), true);
const prefsSrc = readFileSync(new URL("../src/lib/prefs/preferences.ts", import.meta.url), "utf8");
assert.equal(prefsSrc.includes("settledSystemTheme"), true);
assert.equal(storeSrc.includes("export function noteBodyFailed"), true);
// A readable new vault is never reported as a scope failure.
assert.equal(storeSrc.includes("await assertDesktopRootReadable(root);"), true);
// Naming a new note hands the cursor to its body; every close has a home.
const visualSrc = readFileSync(new URL("../src/components/editor/VisualEditor.tsx", import.meta.url), "utf8");
assert.equal(visualSrc.includes("nexus-write-note"), true);
assert.equal(treeSrc.includes("justCreatedRef"), true);
assert.equal(confirmSrc.includes("restoreFocusOrList"), true);
assert.equal(paletteSrc.includes("focusBeforeSearch"), true);
// A stolen Enter in a Cancel-first ask cancels; the tree never fights an open ask.
assert.equal(confirmSrc.includes("if (outside && preferCancel) onCancelRef.current();"), true);
assert.equal(confirmSrc.includes("slowReclaim"), true);
assert.equal(treeSrc.includes("const dialogOpen = () =>"), true);
// The early band never swallows clicks on the title bar.
const savedPageSrc = readFileSync(new URL("../public/saved-page.js", import.meta.url), "utf8");
assert.equal(savedPageSrc.includes('host.style.pointerEvents = "none"'), true);
assert.equal(settingsSrc.includes("setCommandOpen(false)"), true);
// A first note asked for while the vault is still opening is made once it opens.
const whenReadySrc = readFileSync(new URL("../src/lib/vault/create-when-ready.ts", import.meta.url), "utf8");
assert.equal(whenReadySrc.includes("if (s.connecting || done) return;"), true);
// Every first-note entry (list, empty pane, folder map, Enter anywhere) waits for the vault.
const firstNoteSrc = readFileSync(new URL("../src/lib/vault/first-note.ts", import.meta.url), "utf8");
assert.equal(firstNoteSrc.includes('createNoteWhenReady(null, "Untitled"'), true);
assert.equal(firstNoteSrc.includes('if (s.settings.graphMode === "fullscreen") exitGraphForViewport();'), true);
assert.equal(editorSrc.includes("startFirstNoteAnywhere()"), true);
assert.equal(treeSrc.includes("createNoteWhenReady("), true);
{
  const graphSrc = readFileSync(new URL("../src/components/graph/GraphView.tsx", import.meta.url), "utf8");
  assert.equal(graphSrc.includes('data-testid="graph-empty-new-note"'), true);
  assert.equal(graphSrc.includes("onClick={() => startFirstNote()}"), true);
  assert.equal(keysSrc.includes("vaultHasNoNotes()") && keysSrc.includes("startFirstNote();"), true);
  assert.equal(shellSrc.includes("exitGraphForViewport();") && shellSrc.includes("vaultHasNoNotes()"), true);
}
assert.equal(settingsSrc.includes('data-current={currentSection === id ? "1" : undefined}'), true);
// Shared first-run path, in order: leave the map, open the list, wait for the
// vault, create Untitled, mark it new, then open its name.
{
  const at = (s) => firstNoteSrc.indexOf(s);
  const exitAt = at('if (s.settings.graphMode === "fullscreen") exitGraphForViewport();');
  const revealAt = at("revealFileList(() => {");
  const createAt = at('createNoteWhenReady(null, "Untitled", (id) => {');
  const markAt = at('new CustomEvent("nexus-created-note", { detail: id })');
  const renameAt = at("scheduleEmptyNoteRename(");
  assert.ok(exitAt > 0 && exitAt < revealAt && revealAt < createAt && createAt < markAt && markAt < renameAt);
  assert.equal(firstNoteSrc.includes('new CustomEvent("nexus-rename-node", { detail: noteId })'), true);
  // Empty means no notes, and a large vault still at zero with nothing listed.
  assert.equal(firstNoteSrc.includes("if (!s.vaultId) return false;"), true);
  assert.equal(
    firstNoteSrc.includes("if (s.shellCatalog) return s.catalogNoteCount <= 0 && s.rootIds.length === 0;"),
    true,
  );
  // The map card never calls a bare create that a still-opening vault would drop.
  const graphSrc = readFileSync(new URL("../src/components/graph/GraphView.tsx", import.meta.url), "utf8");
  assert.equal(graphSrc.includes('onClick={() => createNote(null, "Untitled")}'), false);
  assert.equal(graphSrc.includes('import { startFirstNote } from "@/lib/vault/first-note";'), true);
  // Enter anywhere: only in an empty vault, never over a modal, and never from a
  // field, a button, a link, the note, or the list (which has its own Enter).
  const enterAt = keysSrc.indexOf("vaultHasNoNotes() &&");
  assert.ok(enterAt > 0);
  const enterBlock = keysSrc.slice(enterAt - 300, keysSrc.indexOf("startFirstNote();", enterAt) + 40);
  assert.equal(enterBlock.includes('e.key === "Enter"'), true);
  assert.equal(enterBlock.includes("!e.metaKey") && enterBlock.includes("!e.ctrlKey") && enterBlock.includes("!e.shiftKey"), true);
  assert.equal(enterBlock.includes("[data-nexus-confirm], [role='dialog'][aria-modal='true']"), true);
  assert.equal(
    enterBlock.includes("input, textarea, select, button, a, [contenteditable='true'], [data-file-tree]"),
    true,
  );
  assert.equal(enterBlock.includes("e.preventDefault();"), true);
  // It runs before the rename and Escape handling in the same listener.
  assert.ok(enterAt < keysSrc.indexOf('e.key === "F2"'));
  // Auto-leave the map: only for an empty vault, only in the first seconds after open.
  const landAt = shellSrc.indexOf("const openedAt = Date.now();");
  assert.ok(landAt > 0);
  const landBlock = shellSrc.slice(landAt, shellSrc.indexOf("}, [vaultId]);", landAt));
  assert.equal(landBlock.includes("if (Date.now() - openedAt > 5000) return;"), true);
  assert.equal(landBlock.includes('if (st.settings.graphMode !== "fullscreen" || !vaultHasNoNotes()) return;'), true);
  assert.equal(landBlock.includes("exitGraphForViewport();"), true);
  assert.equal(landBlock.includes("revealFileList("), true);
  assert.equal(landBlock.includes("window.setTimeout(unsub, 5200)"), true);
  // The first-run pane uses the same path, so there is one way to make the first note.
  assert.equal(editorSrc.includes("startFirstNote as startFirstNoteAnywhere"), true);
  assert.equal(editorSrc.includes('useVaultStore.getState().createNote(null, "Untitled")'), false);
}
// After a new note is named, the body takes the cursor by path, for a few seconds,
// and never pulls it back from the list, a field, or a dialog.
{
  const intentSrc = readFileSync(new URL("../src/lib/editor/write-intent.ts", import.meta.url), "utf8");
  assert.equal(intentSrc.includes("export const WRITE_FOCUS_MS = 6000;"), true);
  assert.equal(intentSrc.includes("export function requestWriteFocus(path: string, ms = WRITE_FOCUS_MS)"), true);
  assert.equal(treeSrc.includes("requestWriteFocus(node.path);"), true);
  assert.equal(paletteSrc.includes("if (path) requestWriteFocus(path);"), true);
  assert.equal(visualSrc.includes("writeFocusPending(pathNow())"), true);
  // A field or a dialog keeps the cursor. The list row the name was typed in
  // does not: moving in the list ends the request instead.
  assert.equal(visualSrc.includes(`"input, textarea, select, [role='dialog'], [data-nexus-confirm], [cmdk-root]"`), true);
  assert.equal(visualSrc.includes(`!active.closest?.("[data-testid='tree-rename']") &&`), true);
  // The committed name field ignores the blur the handoff causes.
  assert.ok(treeSrc.indexOf("skipBlur.current = true;") > 0);
  assert.equal(visualSrc.includes("writeFocusPending(pathAtApply)"), true);
  assert.equal(visualSrc.includes("writeWantedUntil"), false);
  // Text held for the note is written as a normal edit once the refill is done.
  assert.equal(visualSrc.includes("writeHeldText(editor, pathAtApply, refillPending);"), true);
  assert.equal(visualSrc.includes("writeHeldText(editor, pathNow(), refillPending);"), true);
  // It waits for a body the store has and the editor has not shown yet.
  assert.equal(visualSrc.includes("if (body === baselineMd.current || body === lastWrittenRef.current) return false;"), true);
  assert.equal(visualSrc.includes("if (!ed.view.pasteText(text)) ed.commands.insertContent(text);"), true);
  // The cursor is taken in the same tick, not a frame later, so a paste sent
  // right after the name is set lands in the body on any webview.
  const caretAt = visualSrc.indexOf("function caretToWritingLine(ed: Editor): void {");
  assert.ok(caretAt > 0);
  const caretBody = visualSrc.slice(caretAt, visualSrc.indexOf("\n}\n", caretAt));
  assert.equal(caretBody.includes("ed.view.focus();"), true);
  assert.equal(caretBody.includes('insertContentAt(doc.content.size, { type: "paragraph" })'), true);
  // A click under a note that ends in its title starts a line below the title.
  assert.equal(visualSrc.includes("return ed ? clickBelowTitle(ed, event) : false;"), true);
  assert.equal(visualSrc.includes("if (e.clientY <= lastDom.getBoundingClientRect().bottom + 2) return false;"), true);
  // "Just created" lives outside the list, which may mount after the note is made.
  assert.equal(treeSrc.includes("const fresh = takeJustCreated(id) || Boolean(id && justCreatedRef.current === id);"), true);
  assert.equal(treeSrc.includes("if (st.activeNoteId !== node.id) st.setActiveNote(node.id);"), true);
  const firstSrc = readFileSync(new URL("../src/lib/vault/first-note.ts", import.meta.url), "utf8");
  assert.ok(firstSrc.indexOf("markJustCreated(id);") > 0 && firstSrc.indexOf("markJustCreated(id);") < firstSrc.indexOf('"nexus-created-note"'));
  assert.equal(storeSrc.includes("writeIntent: writeIntentState(),"), true);
}
// Runtime: typing and pasting after naming a note, before its editor has the
// cursor, are held for that note; moving away ends the request.
{
  const saved = { window: globalThis.window, CustomEvent: globalThis.CustomEvent };
  const listeners = {};
  const fired = [];
  globalThis.window = {
    addEventListener: (type, fn) => { (listeners[type] ??= []).push(fn); },
    dispatchEvent: (ev) => fired.push(ev),
  };
  globalThis.CustomEvent = class { constructor(type, init) { this.type = type; this.detail = init?.detail; } };
  const inList = { closest: (sel) => (sel.includes("[data-editor-pane]") ? null : sel.includes("input") ? null : {}) };
  const inField = { closest: (sel) => (sel.includes("input") ? {} : null) };
  const key = (k, target = inList, extra = {}) => {
    const ev = { key: k, target, isComposing: false, defaultPrevented: false, metaKey: false, ctrlKey: false, altKey: false, ...extra,
      preventDefault() { this.defaultPrevented = true; }, stopImmediatePropagation() {} };
    for (const fn of listeners.keydown ?? []) fn(ev);
    return ev;
  };
  const paste = (text, target = inList) => {
    const ev = { target, defaultPrevented: false, clipboardData: { getData: () => text },
      preventDefault() { this.defaultPrevented = true; }, stopImmediatePropagation() {} };
    for (const fn of listeners.paste ?? []) fn(ev);
    return ev;
  };
  try {
    const wi = await import(new URL("../src/lib/editor/write-intent.ts", import.meta.url).href);
    assert.equal(wi.writeFocusPending("FirstRun Note.md"), false);
    // Nothing is held before a note asks for the cursor.
    assert.equal(key("a").defaultPrevented, false);
    wi.requestWriteFocus("FirstRun Note.md");
    assert.equal(fired.at(-1)?.type, "nexus-write-note");
    assert.equal(wi.writeFocusPending("FirstRun Note.md"), true);
    assert.equal(wi.writeFocusPending("Untitled.md"), false);
    // A paste and keys that land in the list are held for the note, in order.
    assert.equal(paste("body after name").defaultPrevented, true);
    assert.equal(key(" ").defaultPrevented, true);
    assert.equal(key("x").defaultPrevented, true);
    assert.equal(key("Enter").defaultPrevented, true);
    // A field keeps its own typing.
    assert.equal(key("q", inField).defaultPrevented, false);
    assert.equal(paste("into a field", inField).defaultPrevented, false);
    // Ctrl/Cmd+V asks the editor for the cursor so the paste lands there.
    const before = fired.length;
    assert.equal(key("v", inList, { ctrlKey: true }).defaultPrevented, false);
    assert.equal(fired.length, before + 1);
    // While text is held, keys in the note's editor queue behind it, in order.
    const inEditor = { closest: (sel) => (sel === ".ProseMirror" || sel.includes("contenteditable") ? {} : null) };
    assert.equal(key("y", inEditor).defaultPrevented, true);
    // Only the note's own editor gets the text, once.
    assert.equal(wi.takeHeldWrite("Untitled.md"), null);
    assert.equal(wi.takeHeldWrite("FirstRun Note.md"), "body after name x\ny");
    assert.equal(wi.takeHeldWrite("FirstRun Note.md"), null);
    // Nothing held: the editor types for itself.
    assert.equal(key("z", inEditor).defaultPrevented, false);
    // Moving in the list ends the request; later typing stays in the list.
    key("ArrowDown");
    assert.equal(wi.writeFocusPending("FirstRun Note.md"), false);
    assert.equal(key("b").defaultPrevented, false);
    // A click outside the editor ends it too; a click in the editor does not.
    wi.requestWriteFocus("FirstRun Note.md");
    for (const fn of listeners.pointerdown ?? []) fn({ target: { closest: (sel) => (sel === "[data-editor-pane]" ? {} : null) } });
    assert.equal(wi.writeFocusPending("FirstRun Note.md"), true);
    for (const fn of listeners.pointerdown ?? []) fn({ target: { closest: () => null } });
    assert.equal(wi.writeFocusPending("FirstRun Note.md"), false);
    // A note made moments ago is known as new wherever the list was when it
    // was made, once. Naming it goes on to writing.
    assert.equal(wi.takeJustCreated("desk_Untitled.md"), false);
    wi.markJustCreated("desk_Untitled.md");
    assert.equal(wi.takeJustCreated("desk_Untitled.md"), true);
    assert.equal(wi.takeJustCreated("desk_Untitled.md"), false);
    wi.requestWriteFocus("FirstRun Note.md");
    assert.deepEqual(wi.writeIntentState(), { path: "FirstRun Note.md", heldChars: 0 });
    paste("abc");
    assert.deepEqual(wi.writeIntentState(), { path: "FirstRun Note.md", heldChars: 3 });
    wi.takeHeldWrite("FirstRun Note.md");
    // The request outlasts the rescan after a rename (six seconds), then ends.
    const realNow = Date.now;
    try {
      const t0 = realNow();
      Date.now = () => t0;
      wi.requestWriteFocus("FirstRun Note.md");
      Date.now = () => t0 + 5900;
      assert.equal(wi.writeFocusPending("FirstRun Note.md"), true);
      Date.now = () => t0 + 6100;
      assert.equal(wi.writeFocusPending("FirstRun Note.md"), false);
    } finally {
      Date.now = realNow;
    }
  } finally {
    globalThis.window = saved.window;
    globalThis.CustomEvent = saved.CustomEvent;
  }
}
// Runtime: a folder rescan that races the app's own create/rename keeps the
// open note, its name, and its text. An outside edit is still taken.
{
  const { keepIdsByPath, keepRecentLocalBodies, keepRenamedShellIds } = await import(
    new URL("../src/lib/vault/stable-ids.ts", import.meta.url).href
  );
  const note = (id, path, content, extra = {}) => ({ id, path, name: path.split("/").pop(), kind: "note", parentId: null, mtime: 1, content, ...extra });
  const typed = "# FirstRun Note\n\nbody after name HAND OFF\n";
  // Renamed in the app; the store still uses the id from the old name.
  const prev = { "desk_Untitled.md": note("desk_Untitled.md", "FirstRun Note.md", typed) };
  const oursAll = new Set(["FirstRun Note.md", "Untitled.md"]);
  const written = { "FirstRun Note.md": ["# FirstRun Note\n\n"], "Untitled.md": ["# Untitled\n\n"] };
  const ours = (path, body) => oursAll.has(path) && (body === undefined || (written[path] ?? []).includes(body));
  const settle = (incoming, roots) => {
    const kept = keepIdsByPath(prev, incoming, roots);
    return keepRecentLocalBodies(prev, kept.nodes, kept.rootIds, ours);
  };
  // 1. Scan taken before the disk rename: the old name, same id, title-only copy.
  let r = settle({ "desk_Untitled.md": note("desk_Untitled.md", "Untitled.md", "# Untitled\n\n") }, ["desk_Untitled.md"]);
  assert.equal(r.nodes["desk_Untitled.md"].path, "FirstRun Note.md", "the note keeps its new name");
  assert.equal(r.nodes["desk_Untitled.md"].content, typed, "the typed text stays");
  assert.deepEqual(r.rootIds, ["desk_Untitled.md"]);
  // 2. Scan taken before the file was written at all.
  r = settle({}, []);
  assert.equal(r.nodes["desk_Untitled.md"].content, typed);
  assert.deepEqual(r.rootIds, ["desk_Untitled.md"]);
  // 3. Scan after the rename, lazy (no bodies): the id is kept, the text stays.
  r = settle({ "desk_FirstRun Note.md": note("desk_FirstRun Note.md", "FirstRun Note.md", undefined) }, ["desk_FirstRun Note.md"]);
  assert.deepEqual(Object.keys(r.nodes), ["desk_Untitled.md"]);
  assert.equal(r.nodes["desk_Untitled.md"].content, typed);
  // 4. Scan after the rename with the title-only copy the rename wrote.
  r = settle({ "desk_FirstRun Note.md": note("desk_FirstRun Note.md", "FirstRun Note.md", "# FirstRun Note\n\n") }, ["desk_FirstRun Note.md"]);
  assert.equal(r.nodes["desk_Untitled.md"].content, typed);
  // 5. A body the app never wrote is an outside edit: taken, not hidden.
  r = settle({ "desk_FirstRun Note.md": note("desk_FirstRun Note.md", "FirstRun Note.md", "# From another app\n") }, ["desk_FirstRun Note.md"]);
  assert.equal(r.nodes["desk_Untitled.md"].content, "# From another app\n");
  // 6. Old writes expire: past the window the scan is taken as is.
  oursAll.clear();
  r = settle({}, []);
  assert.deepEqual(Object.keys(r.nodes), []);
  // 7. Rename, then a new Untitled under the old name: both keep their ids.
  const prev2 = {
    "desk_Untitled.md": note("desk_Untitled.md", "X.md", "# X\n"),
    "desk_Untitled.md__1": note("desk_Untitled.md__1", "Untitled.md", "# Untitled\n"),
  };
  const k2 = keepIdsByPath(prev2, {
    "desk_X.md": note("desk_X.md", "X.md", undefined),
    "desk_Untitled.md": note("desk_Untitled.md", "Untitled.md", undefined),
  }, ["desk_X.md", "desk_Untitled.md"]);
  assert.equal(k2.nodes["desk_Untitled.md"].path, "X.md");
  assert.equal(k2.nodes["desk_Untitled.md__1"].path, "Untitled.md");
  // 8. Paged catalog: "Untitled.md is gone" must not drop the note renamed from it.
  const shellNodes = {
    "desk_Untitled.md": note("desk_Untitled.md", "FirstRun Note.md", typed),
    "desk_Gone.md": note("desk_Gone.md", "Gone.md", undefined),
    "desk_Old": { id: "desk_Old", path: "Old", name: "Old", kind: "folder", parentId: null, mtime: 1 },
    "desk_Old/a.md": note("desk_Old/a.md", "Old/a.md", undefined, { parentId: "desk_Old" }),
  };
  const gone = keepRenamedShellIds(shellNodes, ["desk_Untitled.md", "desk_Gone.md", "desk_Old/a.md", "desk_Missing.md"], ["Untitled.md", "Gone.md", "Old"], () => false);
  assert.deepEqual(gone, ["desk_Gone.md", "desk_Old/a.md", "desk_Missing.md"]);
  assert.deepEqual(keepRenamedShellIds(shellNodes, ["desk_Gone.md"], ["Gone.md"], (p) => p === "Gone.md"), []);
}
// Store wiring for the above: every app write is recorded with its body, the
// rescan and the catalog forget use it, and a mid-write note is not let go.
{
  assert.equal(storeSrc.includes("markLocalWrite(path, content);"), true);
  assert.equal(storeSrc.includes("markLocalWrite(newPath, node.kind === \"note\" ? contentForDiskWrite(nodes[id]) : undefined, oldPath);"), true);
  assert.equal(storeSrc.includes("const held = keepRecentLocalBodies(prev, kept.nodes, kept.rootIds, diskCopyIsOurs);"), true);
  assert.equal(storeSrc.includes("goneIds = keepRenamedShellIds(live.nodes, goneIds, gonePaths, wroteHereRecently);"), true);
  assert.equal(storeSrc.includes("if (!nextActive && active && nodes[active]?.kind === \"note\") nextActive = active;"), true);
  assert.equal(editorSrc.includes("if (wroteHereRecently(path) && tries < 8) {"), true);
}
// Vault scale, with the count and the memory line, sits directly under the Vault lead.
{
  const lead = settingsSrc.indexOf('data-settings-lead="vault"');
  const scale = settingsSrc.indexOf("Vault scale", lead);
  const toggle = settingsSrc.indexOf('label="Confirm before delete"', lead);
  assert.ok(lead > 0 && scale > lead && toggle > scale);
  assert.equal(settingsSrc.includes('data-testid="settings-memory-line"'), true);
  assert.equal(settingsSrc.includes('onDemand: mode === "desktop" || mode === "fsa" || shellCatalog,'), true);
}
// An open empty folder shows a short tag; the row below carries the full line.
assert.equal(treeSrc.includes('data-testid="tree-empty-folder-tag"'), true);
assert.equal(cssSrc.includes('.tree-item [data-testid="tree-empty-folder-status"] {'), true);
// Large vaults: the name-field retry waits longer, never reopens a settled name,
// and a revealed folder that is not on screen is still armed for Enter.
{
  const { scheduleEmptyNoteRename, settleRename } = await import(
    new URL("../src/lib/chrome/empty-folder-enter.ts", import.meta.url).href
  );
  let opens = 0;
  scheduleEmptyNoteRename("settle-me", () => { opens += 1; }, () => false, 2);
  await new Promise((r) => setTimeout(r, 130));
  const before = opens;
  settleRename("settle-me");
  await new Promise((r) => setTimeout(r, 700));
  assert.ok(before > 0);
  assert.equal(opens, before, "a settled name must not reopen");
  // The retry keeps asking until the field first opens, then stops for good.
  let reopen = 0;
  let open = false;
  scheduleEmptyNoteRename("first-open", () => { reopen += 1; }, () => open, 1);
  await new Promise((r) => setTimeout(r, 150));
  assert.ok(reopen >= 2, "the retry asks again while the field is not on screen");
  open = true;
  await new Promise((r) => setTimeout(r, 200));
  const seenAt = reopen;
  open = false;
  await new Promise((r) => setTimeout(r, 400));
  assert.equal(reopen, seenAt, "once the field was on screen the retry is done");
  // Commit, cancel, and a typed-ahead commit all report the rename as finished.
  assert.equal((treeSrc.match(/onRenameFinished\?\.\(node\.id, (true|false)\)/g) ?? []).length >= 3, true);
  assert.equal(enterSrc.includes("waits >= 18"), true);
  assert.equal(enterSrc.includes("export function startRenameBuffer(id: string, ms = 2600)"), true);
  assert.equal(treeSrc.includes("if (id) settleRename(id);"), true);
  assert.equal(treeSrc.includes("if (folderHasNothing(id)) armEmptyFolder(id);"), true);
}
// Paged vaults: an exact folder name not yet loaded is looked up in the catalog,
// merged, its children fetched, and listed. Desktop catalog only; never the browser shell.
{
  const at = paletteSrc.indexOf("void fetchShellByPaths(shellDbPath, [wanted])");
  assert.ok(at > 0);
  const block = paletteSrc.slice(paletteSrc.lastIndexOf("useEffect(() => {", at), paletteSrc.indexOf("}, [q, qLower", at));
  assert.equal(block.includes("if (!shellCatalog || !shellDbPath || shellDbPath === BROWSER_SHELL_DB) return;"), true);
  assert.equal(block.includes('(rows ?? []).filter((r) => r.kind === "folder")'), true);
  assert.equal(block.includes("mergeShellRows(st.nodes, st.rootIds, folders)"), true);
  assert.equal(block.includes("loadShellChildren(f.id)"), true);
  assert.equal(block.includes("window.setTimeout(() => {") && block.includes("}, 200);"), true);
  // It stays quiet when a loaded folder already matches.
  assert.equal(block.includes("n.name.toLowerCase() === wantedLower"), true);
}
// Dialogs are one opaque dark card in both themes and never start transparent.
assert.equal(settingsSrc.includes("nexus-dark-island"), true);
assert.equal(confirmSrc.includes("nexus-dark-island"), true);
assert.equal(paletteSrc.includes("nexus-dark-island"), true);
assert.equal(settingsSrc.includes('data-testid="settings-title"'), true);
{
  const kf = cssSrc.slice(cssSrc.indexOf("@keyframes nexusDialogIn"), cssSrc.indexOf(".nexus-dialog-in {"));
  assert.equal(kf.includes("opacity"), false);
}
// The quick tour is not a modal and stays away from a vault that opened empty.
const coachSrc = readFileSync(new URL("../src/components/chrome/FirstRunCoach.tsx", import.meta.url), "utf8");
assert.equal(coachSrc.includes('role="dialog"'), false);
assert.equal(coachSrc.includes("emptyVaultId === vaultId"), true);
assert.equal(keysSrc.includes("[role='dialog'][aria-modal='true']"), true);
// A name typed before its field mounts is kept; the field sets its text once.
assert.equal(enterSrc.includes("export function bufferRenameKey"), true);
assert.equal(treeSrc.includes("renameInitFor.current === node.id"), true);
assert.equal(storeSrc.includes("probeFirstRun"), true);
{
  const { startRenameBuffer, bufferRenameKey, takeRenameBuffer } = await import(
    new URL("../src/lib/chrome/empty-folder-enter.ts", import.meta.url).href
  );
  startRenameBuffer("n1");
  for (const key of ["S", "o", "a", "k", "Enter"]) {
    assert.equal(bufferRenameKey({ key, ctrlKey: false, metaKey: false, altKey: false }), true);
  }
  assert.deepEqual(takeRenameBuffer("n1"), { text: "Soak", commit: true });
  assert.equal(takeRenameBuffer("n1"), null);
  const plain = { ctrlKey: false, metaKey: false, altKey: false };
  // Nothing is buffered without a pending create.
  assert.equal(bufferRenameKey({ key: "a", ...plain }), false);
  // Chords, arrows, and Escape are never swallowed.
  startRenameBuffer("n2");
  assert.equal(bufferRenameKey({ key: "k", ...plain, ctrlKey: true }), false);
  assert.equal(bufferRenameKey({ key: "n", ...plain, metaKey: true }), false);
  assert.equal(bufferRenameKey({ key: "ArrowDown", ...plain }), false);
  assert.equal(bufferRenameKey({ key: "Escape", ...plain }), false);
  // Backspace edits the held name; another note's field does not take it.
  for (const key of ["P", "l", "x", "Backspace", "a", "n"]) bufferRenameKey({ key, ...plain });
  assert.equal(takeRenameBuffer("other"), null);
  assert.deepEqual(takeRenameBuffer("n2"), { text: "Plan", commit: false });
  // Enter alone keeps the default name, and nothing after it is taken.
  startRenameBuffer("n3");
  assert.equal(bufferRenameKey({ key: "Enter", ...plain }), true);
  assert.equal(bufferRenameKey({ key: "z", ...plain }), false);
  assert.deepEqual(takeRenameBuffer("n3"), { text: "", commit: true });
  // The hold expires.
  startRenameBuffer("n4", -1);
  assert.equal(bufferRenameKey({ key: "a", ...plain }), false);
  // Keys are only held while no name field is on screen, never under a dialog.
  const holdAt = treeSrc.indexOf("bufferRenameKey(e)");
  assert.ok(holdAt > 0);
  const holdGate = treeSrc.slice(Math.max(0, holdAt - 400), holdAt);
  assert.equal(holdGate.includes("[data-testid='tree-rename']"), true);
  assert.ok(treeSrc.indexOf("if (dialogOpen()) return;", holdAt - 600) < holdAt);
}
// probeFirstRun reports the fields the box harness reads.
{
  const at = storeSrc.indexOf("probeFirstRun: () => {");
  assert.ok(at > 0);
  const body = storeSrc.slice(at, storeSrc.indexOf("\n\t\t},", at));
  for (const key of [
    "mode:",
    "vaultPath:",
    "connecting:",
    "notes,",
    "listOpen:",
    "listFocused:",
    "firstRunShown:",
    "renameOpen:",
    "renameValue:",
    "renameSelected:",
    "activePath:",
    "writingInNote:",
    "diskWriteError,",
  ]) {
    assert.equal(body.includes(key), true, `probeFirstRun missing ${key}`);
  }
  // Read-only: it never creates, opens, or writes.
  assert.equal(/createNote|setState|set\(|openLocalVault|persist/.test(body), false);
}
// A first note waits for the vault to open instead of being dropped.
{
  assert.equal(whenReadySrc.includes("if (!st.connecting)"), true);
  assert.equal(whenReadySrc.includes("useVaultStore.subscribe"), true);
  assert.equal(whenReadySrc.includes("window.setTimeout(finish, budgetMs)"), true);
  // It never calls createNote while connecting, which would toast and drop it.
  const subAt = whenReadySrc.indexOf("useVaultStore.subscribe");
  assert.ok(whenReadySrc.indexOf("createNote(", subAt) > whenReadySrc.indexOf("if (s.connecting || done) return;"));
  assert.equal(firstNoteSrc.includes('createNoteWhenReady(null, "Untitled"'), true);
  assert.equal(treeSrc.includes('createNoteWhenReady(null, "Untitled", openCreatedRename)'), true);
}
// The quick tour is a region, never a modal, and key homes only yield to modals.
{
  assert.equal(coachSrc.includes('role="region"'), true);
  assert.equal(coachSrc.includes("aria-modal"), false);
  assert.equal(editorSrc.includes("[role='dialog'][aria-modal='true']"), true);
  assert.equal(/querySelector\("\[role='dialog'\]"\)/.test(keysSrc), false);
  assert.equal(/"\[data-nexus-confirm\], \[role='dialog'\]"\)/.test(editorSrc), false);
}
// Dialog cards are opaque and the two moving pieces never fade.
{
  const island = cssSrc.slice(cssSrc.indexOf(".nexus-dark-island {"), cssSrc.indexOf("}", cssSrc.indexOf(".nexus-dark-island {")));
  assert.equal(island.includes("background: #16161a;"), true);
  assert.equal(island.includes("backdrop-filter: none;"), true);
  assert.equal(/rgba\([^)]*,\s*0?\.\d+\)\s*;\s*$/m.test(island.split("background:")[1]?.split(";")[0] + ";"), false);
  const toast = cssSrc.slice(cssSrc.indexOf("@keyframes nexusToastIn"), cssSrc.indexOf(".nexus-toast-in {"));
  assert.equal(toast.includes("opacity"), false);
  // The early band never takes clicks, in either painter.
  const bootSrc = readFileSync(new URL("../desktop/boot.ts", import.meta.url), "utf8");
  assert.equal(bootSrc.includes('host.style.pointerEvents = "none"'), true);
}
// Key pills are readable in both themes; light panels keep dark ink.
assert.equal(cssSrc.includes('[data-theme="light"] [data-testid="note-keys-hint"]'), true);
assert.equal(cssSrc.includes('[data-theme="light"] .editor-status'), true);
assert.equal(cssSrc.includes('[data-theme="light"] .nexus-keys-hint kbd'), true);
assert.equal(confirmSrc.includes('data-testid="confirm-esc-hint"'), true);
assert.equal(settingsSrc.includes('data-testid="settings-esc-hint"'), true);
assert.equal(editorSrc.includes("<kbd>Arrows</kbd>"), true);
// Light panels: every white helper line has a dark-ink override, and dialogs keep white.
{
  const start = cssSrc.indexOf('[data-theme="light"] .editor-status,');
  assert.ok(start > 0);
  const block = cssSrc.slice(start, cssSrc.indexOf("}", start));
  for (const sel of [
    '[data-theme="light"] [data-panel-empty]',
    '[data-theme="light"] [data-testid="tree-empty-folder-banner"]',
    '[data-theme="light"] [data-testid="tree-empty-folder-status"]',
    '[data-theme="light"] [data-editor-empty] h2',
    '[data-theme="light"] [data-editor-empty] p',
    '[data-theme="light"] [data-testid="vault-first-run-list"] p',
    '[data-theme="light"] [data-testid="vault-first-run"]',
    '[data-theme="light"] [data-testid="vault-first-run-invite"]',
    '[data-theme="light"] [data-testid="note-keys-hint"]',
    '[data-theme="light"] .tree-item.is-active',
  ]) {
    assert.equal(block.includes(sel), true, `light ink missing ${sel}`);
  }
  assert.equal(block.includes("color: #12141a;"), true);
  // No dialog surface is in that list.
  assert.equal(/nexus-dark-island|data-nexus-confirm|settings-lead/.test(block), false);
  // Pills flip to dark-on-white on light panels, but stay white-on-black on dialog cards.
  const light = cssSrc.indexOf('[data-theme="light"] .nexus-keys-hint kbd,');
  const island = cssSrc.indexOf('[data-theme="light"] .nexus-dark-island .nexus-rename-hint kbd {');
  assert.ok(light > 0 && island > light);
  assert.equal(cssSrc.slice(island, cssSrc.indexOf("}", island)).includes("color: #fff;"), true);
}
// Esc pills carry their word, and the Trash action never wraps beside them.
assert.match(confirmSrc, /<kbd>Esc<\/kbd>\s*<span className="ml-1\.5 self-center">cancels<\/span>/);
assert.match(settingsSrc, /<kbd>Esc<\/kbd>\s*<span className="ml-1\.5 self-center">closes<\/span>/);
assert.equal((confirmSrc.match(/whitespace-nowrap/g) ?? []).length >= 2, true);
assert.equal(treeSrc.includes("<kbd>Enter</kbd>") && treeSrc.includes("<kbd>Esc</kbd>"), true);
// The memory line never shows the loaded count without the vault total.
assert.equal(settingsSrc.includes("totalNotes={noteCount}"), true);
{
  const { memoryLine } = await import(new URL("../src/lib/settings/memory-copy.ts", import.meta.url).href);
  const stats = (loaded, max = 200, extra = {}) => ({ loaded, max, protected: 0, underPressure: false, ...extra });
  assert.equal(memoryLine({ vaultOpen: false, stats: null, total: 0, onDemand: false }), "Shown after you open a folder.");
  assert.equal(memoryLine({ vaultOpen: true, stats: stats(0, 0), total: 0, onDemand: false }), "No notes yet, so no note text is held in memory.");
  // A small vault keeps every note's text.
  assert.equal(memoryLine({ vaultOpen: true, stats: stats(0, 0), total: 42, onDemand: false }), "All 42 notes keep their text in memory.");
  // A large paged vault: never a bare number.
  assert.equal(
    memoryLine({ vaultOpen: true, stats: stats(42), total: 100000, onDemand: true }),
    "Note text loads when you open a note. Text for 42 of 100,000 notes is in memory right now.",
  );
  assert.equal(
    memoryLine({ vaultOpen: true, stats: stats(0), total: 100000, onDemand: true }),
    "No note text is in memory yet. It loads when you open a note.",
  );
  // Still counting: says so instead of implying the loaded count is the vault.
  assert.match(memoryLine({ vaultOpen: true, stats: stats(42), total: -1, onDemand: true }), /Text for 42 notes .* The vault total appears once the folder is listed\.$/);
  assert.match(
    memoryLine({ vaultOpen: true, stats: stats(300, 200, { underPressure: true, protected: 2 }), total: 100000, onDemand: true }),
    /Text for 300 of 100,000 notes is in memory, including 2 you are editing\./,
  );
  // A desktop vault with lazy text switched off never claims every note is in memory.
  assert.equal(
    memoryLine({ vaultOpen: true, stats: stats(0, 0), total: 100000, onDemand: true }),
    "Note text loads when you open a note.",
  );
  // No line ever shows the loaded count without "of" a total or a counting note.
  for (const total of [100000, -1]) {
    for (const loaded of [1, 42, 5000]) {
      const line = memoryLine({ vaultOpen: true, stats: stats(loaded), total, onDemand: true });
      assert.ok(line.includes(" of ") || line.includes("once the folder is listed"), line);
    }
  }
}
// The first-run probe has a string form that survives CDP without returnByValue.
assert.equal(storeSrc.includes("probeFirstRunText: () => {"), true);
assert.equal(storeSrc.includes("return JSON.stringify(soak?.probeFirstRun?.() ?? {});"), true);
// The quick tour never sits on top of Settings or Trash.
assert.equal(coachSrc.includes("|| settingsOpen || deleteAsking ||"), true);
// A rescan after an in-app rename keeps the note's id, so the open editor does
// not save into a missing id and reload the note from disk.
{
  const { keepIdsByPath } = await import(new URL("../src/lib/vault/stable-ids.ts", import.meta.url).href);
  const note = (id, path, parentId = null, content) => ({ id, path, name: path.split("/").pop(), kind: "note", parentId, mtime: 1, content });
  const folder = (id, path, parentId = null) => ({ id, path, name: path.split("/").pop(), kind: "folder", parentId, mtime: 1 });
  // The renamed note: created as Untitled, renamed in the app, rescanned by its new path.
  const prev = { n_Untitled_md: note("n_Untitled_md", "FirstRun Note.md", null, "# FirstRun Note\n\nHello") };
  const incoming = { "desk_FirstRun Note.md": note("desk_FirstRun Note.md", "FirstRun Note.md", null, "# FirstRun Note\n\n") };
  const kept = keepIdsByPath(prev, incoming, ["desk_FirstRun Note.md"]);
  assert.deepEqual(Object.keys(kept.nodes), ["n_Untitled_md"]);
  assert.equal(kept.nodes.n_Untitled_md.id, "n_Untitled_md");
  assert.deepEqual(kept.rootIds, ["n_Untitled_md"]);
  assert.equal(kept.remapped, 1);
  // Children follow a folder that keeps its id.
  const prev2 = { f1: folder("f1", "Ideas"), a: note("a", "Ideas/One.md", "f1") };
  const inc2 = { desk_Ideas: folder("desk_Ideas", "Ideas"), "desk_Ideas/One.md": note("desk_Ideas/One.md", "Ideas/One.md", "desk_Ideas") };
  const k2 = keepIdsByPath(prev2, inc2, ["desk_Ideas"]);
  assert.equal(k2.nodes.a.parentId, "f1");
  assert.deepEqual(Object.keys(k2.nodes).sort(), ["a", "f1"]);
  // An id the rescan already uses for another file is never taken.
  const prev3 = { x: note("x", "Old.md") };
  const inc3 = { x: note("x", "Other.md"), desk_Old: note("desk_Old", "Old.md") };
  const k3 = keepIdsByPath(prev3, inc3, ["x", "desk_Old"]);
  assert.equal(k3.nodes.x.path, "Other.md");
  assert.equal(k3.nodes.desk_Old.path, "Old.md");
  // Nothing to keep: the same objects come back.
  const same = { y: note("y", "Y.md") };
  const k4 = keepIdsByPath({ y: note("y", "Y.md") }, same, ["y"]);
  assert.equal(k4.nodes, same);
  assert.equal(k4.remapped, 0);
  // Wired into the rescan, and the editor saves by path if an id still changes.
  assert.equal(storeSrc.includes("const kept = keepIdsByPath(prev, nodesIn, rootIdsIn);"), true);
  assert.equal(visualSrc.includes("if (!nodesNow[id] && path) {"), true);
  assert.equal(visualSrc.includes("if (notePath && noteIdRef.current === noteId) notePathRef.current = notePath;"), true);
}
// Enter pressed while a searched folder is still landing is held for that folder
// and applied once it is armed; the hold ends when the reveal lands or expires.
{
  const revealSrc2 = readFileSync(new URL("../src/lib/chrome/reveal-list.ts", import.meta.url), "utf8");
  assert.equal(revealSrc2.includes("inFlight = { id: folderId, until: Date.now() + 3000, enter: false };"), true);
  assert.equal(revealSrc2.includes("export function finishReveal(id: string): boolean"), true);
  const holdAt = keysSrc.indexOf("revealInFlight() &&");
  assert.ok(holdAt > 0);
  const hold = keysSrc.slice(holdAt - 300, keysSrc.indexOf("return;", holdAt) + 10);
  assert.equal(hold.includes('e.key === "Enter"'), true);
  assert.equal(hold.includes("input, textarea, select, [data-testid='tree-rename']"), true);
  assert.equal(hold.includes("queueRevealEnter()") && hold.includes("e.stopImmediatePropagation();"), true);
  // It runs before the empty-vault Enter and the rest of the key handling.
  assert.ok(holdAt < keysSrc.indexOf("vaultHasNoNotes() &&"));
  // Both landings (row found, or armed off-screen) apply a held Enter.
  assert.equal((treeSrc.match(/applyHeldEnter\(id\);/g) ?? []).length >= 2, true);
  assert.equal(treeSrc.includes("if (finishReveal(id) && folderHasNothing(id)) createInFolderRef.current(id);"), true);
  // A plain Enter and a held Enter fill the folder the same way, and wait out
  // a vault that is still opening instead of dropping the key.
  assert.equal(treeSrc.includes('createNoteWhenReady(folderId, "Untitled", openCreatedRename);'), true);
  assert.equal(treeSrc.includes("createInFolderRef.current(folderId);"), true);
  assert.equal(treeSrc.includes('useVaultStore.getState().createNote(folderId, "Untitled")'), false);
}
// Search: a folder reveal closes search so it cannot take the next Enter, and a
// plain Enter goes to the folder even when it was found after the list settled.
{
  const revealSrc3 = readFileSync(new URL("../src/lib/chrome/reveal-list.ts", import.meta.url), "utf8");
  const at = revealSrc3.indexOf("export function revealFolderInList");
  const body = revealSrc3.slice(at, revealSrc3.indexOf("\n}\n", at));
  assert.equal(body.includes("if (st.commandOpen) st.setCommandOpen(false);"), true);
  assert.ok(body.indexOf("setCommandOpen(false)") < body.indexOf("revealFileList("));
  assert.equal(paletteSrc.includes("restoreFocusOrList(revealInFlight() ? null : prev)"), true);
  assert.equal(paletteSrc.includes("const folder = hits.length === 0 ? folderForEnter(folderHits, q) : null;"), true);
  assert.equal(paletteSrc.includes("if (folder && (!selected || folder.exact)) {"), true);
  // While the catalog is still being asked, Enter waits instead of running the
  // selected "Create note" beside the folder. No folder: the selection runs.
  assert.equal(paletteSrc.includes("if (!folder && hits.length === 0 && catalogFolderPending) {"), true);
  assert.equal(paletteSrc.includes("pendingFolderEnterRef.current = { q, timer: window.setTimeout(runHeldEnter, 4000) };"), true);
  assert.equal(paletteSrc.includes("if (pendingFolderEnterRef.current?.q === q) runHeldEnter();"), true);
  assert.equal(paletteSrc.includes("selected?.click();"), true);
  assert.equal((paletteSrc.match(/catalogAnsweredRef\.current = q;/g) ?? []).length >= 3, true);
  const { folderForEnter } = await import(new URL("../src/lib/search/folder-enter.ts", import.meta.url).href);
  const fs = [
    { id: "a", name: "EmptyFolder old", path: "Archive/EmptyFolder old" },
    { id: "b", name: "EmptyFolder", path: "EmptyFolder" },
  ];
  assert.deepEqual(folderForEnter(fs, "emptyfolder"), { id: "b", exact: true });
  assert.deepEqual(folderForEnter(fs, "/EmptyFolder/ "), { id: "b", exact: true });
  assert.deepEqual(folderForEnter(fs, "Empty"), { id: "a", exact: false });
  assert.equal(folderForEnter([], "EmptyFolder"), null);
}
// Runtime: the held-Enter queue. The module imports the app store, so load a
// copy with a stub store and a minimal document/window, then drive the real code.
{
  const { writeFileSync, mkdtempSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const src = readFileSync(new URL("../src/lib/chrome/reveal-list.ts", import.meta.url), "utf8");
  const stubbed =
    `const useVaultStore = { getState: () => globalThis.__revealStore };\n` +
    src.replace(/^import \{ useVaultStore \} from "@\/lib\/vault\/store";\n/m, "");
  assert.notEqual(stubbed, src, "store import was replaced");
  const dir = mkdtempSync(join(tmpdir(), "nexus-reveal-"));
  const file = join(dir, "reveal-list.ts");
  writeFileSync(file, stubbed);
  const events = [];
  const saved = {
    document: globalThis.document,
    window: globalThis.window,
    CustomEvent: globalThis.CustomEvent,
  };
  globalThis.__revealStore = { settings: { leftOpen: true }, setLeftOpen() {} };
  globalThis.document = { querySelector: () => ({ id: "tree" }) };
  globalThis.window = {
    dispatchEvent: (ev) => events.push(ev),
    requestAnimationFrame: (cb) => setTimeout(cb, 0),
    cancelAnimationFrame: () => {},
    setTimeout,
    clearTimeout,
  };
  globalThis.CustomEvent = class { constructor(type, init) { this.type = type; this.detail = init?.detail; } };
  try {
    const m = await import(file);
    // Nothing in flight: Enter is not held.
    assert.equal(m.revealInFlight(), null);
    assert.equal(m.queueRevealEnter(), false);
    // A reveal starts: the tree is asked to show the folder, and Enter is held.
    m.revealFolderInList("folder-1");
    assert.equal(events.at(-1)?.type, "nexus-reveal-folder");
    assert.equal(events.at(-1)?.detail, "folder-1");
    assert.equal(m.revealInFlight(), "folder-1");
    assert.equal(m.queueRevealEnter(), true);
    // Another folder landing does not take this Enter.
    assert.equal(m.finishReveal("folder-2"), false);
    assert.equal(m.revealInFlight(), "folder-1");
    // The right folder lands: the held Enter is applied once, then the hold is gone.
    assert.equal(m.finishReveal("folder-1"), true);
    assert.equal(m.revealInFlight(), null);
    assert.equal(m.finishReveal("folder-1"), false);
    assert.equal(m.queueRevealEnter(), false);
    // Landing without an Enter ends the hold and applies nothing.
    m.revealFolderInList("folder-3");
    assert.equal(m.finishReveal("folder-3"), false);
    assert.equal(m.revealInFlight(), null);
    // The hold expires after three seconds and never takes a later Enter.
    const realNow = Date.now;
    try {
      const t0 = realNow();
      Date.now = () => t0;
      m.revealFolderInList("folder-4");
      Date.now = () => t0 + 2900;
      assert.equal(m.revealInFlight(), "folder-4");
      assert.equal(m.queueRevealEnter(), true);
      Date.now = () => t0 + 3100;
      assert.equal(m.revealInFlight(), null);
      assert.equal(m.queueRevealEnter(), false);
      assert.equal(m.finishReveal("folder-4"), false, "an expired hold applies nothing");
    } finally {
      Date.now = realNow;
    }
    // A folder asked for before the tree was listening is handed over once.
    m.revealFolderInList("folder-5");
    assert.equal(m.takePendingFolderReveal(), "folder-5");
    assert.equal(m.takePendingFolderReveal(), null);
  } finally {
    globalThis.document = saved.document;
    globalThis.window = saved.window;
    globalThis.CustomEvent = saved.CustomEvent;
    delete globalThis.__revealStore;
  }
}
// The saved-page Ready shows no page count beside it.
assert.equal(shellSrc.includes('!(isReady && progress.message.includes("titles and open notes"))'), true);

console.log("desktop-boot: PASS");
