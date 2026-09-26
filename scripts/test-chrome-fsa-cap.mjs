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
import { readFileSync } from "node:fs";
import {
  CHROME_FSA_GETFILE_MAX,
  CHROME_FSA_NOTE_CAP,
  CHROME_FSA_NOTE_WARN,
  CHROME_FSA_SUPPORTED_MAX,
  CHROME_FSA_WATCH_MAX,
  ChromeFsaCapError,
  chromeFsaHonestyLine,
  chromeFsaLimitKind,
  chromeFsaRefuseChrome,
  chromeFsaRefuseDesktop,
  chromeFsaRefuseLead,
  chromeFsaRefuseMessage,
  chromeFsaRefuseTitle,
  chromeFsaWarnMessage,
  chromeFsaWelcomeDetail,
  countVaultNotes,
  isChromeFsaCapError,
  FORCED_LARGE_FSA_CONFIRM,
  allowForcedLargeFsa,
  forceLargeFsaRequested,
  isForcedLargeFsaBuildAllowed,
} from "./src/lib/vault/chrome-fsa-cap.ts";
import { shouldPollFsaWatch } from "./src/lib/vault/watcher.ts";
assert.equal(CHROME_FSA_NOTE_WARN, 15000);
assert.equal(CHROME_FSA_NOTE_CAP, 25000);
assert.equal(CHROME_FSA_SUPPORTED_MAX, 20000);
assert.equal(chromeFsaHonestyLine(), "Desktop for large vaults; Chrome ≤20k.");
const welcomeDetail = chromeFsaWelcomeDetail();
assert.ok(welcomeDetail.includes("20,000"));
assert.ok(welcomeDetail.includes("25,000"));
assert.ok(welcomeDetail.includes("Nexus Desktop"));
assert.ok(welcomeDetail.includes("will not open"));
const readme = readFileSync("README.md", "utf8");
assert.ok(readme.includes(chromeFsaHonestyLine()), "README missing honesty line");
assert.ok(readme.includes(welcomeDetail), "README missing welcome detail");
const beta = readFileSync("docs/PUBLIC-BETA.md", "utf8");
assert.ok(beta.includes(chromeFsaHonestyLine()), "PUBLIC-BETA missing honesty line");
assert.ok(beta.includes(welcomeDetail), "PUBLIC-BETA missing welcome detail");
const welcome = readFileSync("src/components/vault/WelcomeScreen.tsx", "utf8");
assert.ok(welcome.includes("chromeFsaHonestyLine("));
assert.ok(welcome.includes("chromeFsaWelcomeDetail("));
const honestyAt = welcome.indexOf("data-chrome-fsa-honesty");
const openAt = welcome.indexOf("Open folder…");
assert.ok(honestyAt !== -1 && openAt !== -1 && honestyAt < openAt);
assert.equal(welcome.includes("20,000"), false);
assert.equal(welcome.includes("25,000"), false);
assert.equal(welcome.includes("20k"), false);
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
assert.ok(FORCED_LARGE_FSA_CONFIRM.includes("STOP"));
assert.ok(FORCED_LARGE_FSA_CONFIRM.includes("discarded"));
assert.ok(FORCED_LARGE_FSA_CONFIRM.includes("Desktop"));
assert.ok(FORCED_LARGE_FSA_CONFIRM.includes("SQLite FTS5"));
assert.equal(forceLargeFsaRequested(), false);
assert.equal(allowForcedLargeFsa(), false);
assert.equal(typeof isForcedLargeFsaBuildAllowed(), "boolean");
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
