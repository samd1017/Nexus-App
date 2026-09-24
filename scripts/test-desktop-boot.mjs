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
assert.equal(treeSrc.includes("stopImmediatePropagation"), true);
const cssSrc = readFileSync(new URL("../src/styles.css", import.meta.url), "utf8");
assert.equal(cssSrc.includes("outline: 2px solid #5ad8ff"), true);
assert.equal(cssSrc.includes("inset 3px 0 0 #5ad8ff"), true);
assert.equal(cssSrc.includes('data-keyboard-focus="row"'), true);
assert.equal(cssSrc.includes('data-keyboard-focus="control"'), true);
assert.equal(cssSrc.includes("inset 0 0 0 3px #5ad8ff"), true);
assert.equal(cssSrc.includes("nexus-rebuild-btn"), true);
assert.equal(cssSrc.includes("nexus-search-field:focus-within"), true);
assert.equal(storeSrc.includes("Moved to Trash. You can put it back."), true);
const trashSrc = readFileSync(
  new URL("../src/components/chrome/DeleteConfirmHost.tsx", import.meta.url),
  "utf8",
);
assert.equal(trashSrc.includes('testId="trash-confirm"'), true);
assert.equal(trashSrc.includes('initialFocus="cancel"'), true);
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

console.log("desktop-boot: PASS");
