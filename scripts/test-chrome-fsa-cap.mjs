import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";

const r = spawnSync(
  "npx",
  [
    "--yes",
    "tsx",
    "-e",
    `
import assert from "node:assert/strict";
import {
  CHROME_FSA_GETFILE_MAX,
  CHROME_FSA_NOTE_CAP,
  CHROME_FSA_NOTE_WARN,
  CHROME_FSA_WATCH_MAX,
  ChromeFsaCapError,
  chromeFsaLimitKind,
  chromeFsaRefuseChrome,
  chromeFsaRefuseDesktop,
  chromeFsaRefuseLead,
  chromeFsaRefuseMessage,
  chromeFsaRefuseTitle,
  chromeFsaWarnMessage,
  countVaultNotes,
  isChromeFsaCapError,
} from "./src/lib/vault/chrome-fsa-cap.ts";
import { shouldPollFsaWatch } from "./src/lib/vault/watcher.ts";
assert.equal(CHROME_FSA_NOTE_WARN, 15000);
assert.equal(CHROME_FSA_NOTE_CAP, 25000);
assert.equal(CHROME_FSA_WATCH_MAX, 4000);
assert.equal(CHROME_FSA_GETFILE_MAX, 4000);
assert.equal(chromeFsaLimitKind(100), null);
assert.equal(chromeFsaLimitKind(15000), "warn");
assert.equal(chromeFsaLimitKind(25000), "refuse");
assert.equal(chromeFsaLimitKind(100002), "refuse");
assert.equal(countVaultNotes({ a: { kind: "note" }, b: { kind: "folder" } }), 1);
assert.ok(chromeFsaRefuseMessage(100002).toLowerCase().includes("desktop"));
assert.ok(chromeFsaRefuseMessage(100002).includes("will discard"));
assert.ok(chromeFsaRefuseTitle("MyVault").includes("too large for Chrome"));
assert.ok(chromeFsaRefuseLead(100002).includes("will kill the tab"));
assert.ok(chromeFsaRefuseDesktop().includes("Obsidian"));
assert.ok(chromeFsaRefuseDesktop().includes("SQLite FTS5"));
assert.ok(chromeFsaRefuseChrome().includes("20,000"));
assert.ok(chromeFsaWarnMessage(18000).includes("Nexus Desktop"));
assert.ok(chromeFsaWarnMessage(18000).includes("discarded"));
assert.equal(shouldPollFsaWatch(3999), true);
assert.equal(shouldPollFsaWatch(4000), false);
assert.equal(shouldPollFsaWatch(100002), false);
const capErr = new ChromeFsaCapError(25001);
assert.equal(isChromeFsaCapError(capErr), true);
assert.equal(isChromeFsaCapError(new Error("nope")), false);
console.log("chrome-fsa-cap: PASS");
`,
  ],
  { cwd: process.cwd(), encoding: "utf8", timeout: 30_000 },
);
if (r.stdout) process.stdout.write(r.stdout);
if (r.stderr) process.stderr.write(r.stderr);
if (r.status !== 0) process.exit(r.status ?? 1);
