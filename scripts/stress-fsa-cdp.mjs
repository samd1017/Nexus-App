/**
 * Drive a REAL Chrome tab that already has a folder open via File System Access.
 * Playwright cannot click showDirectoryPicker for /workspace/nexus-soak-100k.
 *
 *   # Terminal 1 — human Chrome (not Playwright's headless)
 *   google-chrome --remote-debugging-port=9222 --enable-precise-memory-info \
 *     --user-data-dir=/tmp/nexus-fsa-cdp
 *   # Open http://127.0.0.1:8080/ and pick the vault (or confirm the refuse card).
 *
 *   # Terminal 2
 *   node scripts/stress-fsa-cdp.mjs http://127.0.0.1:9222 --opens 20
 *
 * If the tab refused ≥25k, this script records honesty-gate PASS (not 100k FSA PASS).
 * If notes ≤20k, it opens 20 notes + cluster search and fails on discard/crash.
 */
import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";

const CDP = process.argv.find((a) => a.startsWith("http")) || "http://127.0.0.1:9222";
const opensArg = process.argv.find((_, i, a) => a[i - 1] === "--opens");
const OPENS = Math.max(8, Number(opensArg || 20) || 20);
const OUT = "/opt/cursor/artifacts/stress/fsa-cdp.json";
mkdirSync("/opt/cursor/artifacts/stress", { recursive: true });

function fail(report, msg) {
  writeFileSync(OUT, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  console.error(msg);
  process.exit(1);
}

let browser;
try {
  browser = await chromium.connectOverCDP(CDP);
} catch (err) {
  const report = {
    ok: false,
    skipped: true,
    reason: "cdp-unavailable",
    error: String(err),
    how: [
      "Launch Chrome with --remote-debugging-port=9222 --enable-precise-memory-info",
      "Open Nexus and pick the folder (or confirm the ≥25k refuse card)",
      `node scripts/stress-fsa-cdp.mjs ${CDP} --opens ${OPENS}`,
    ],
  };
  writeFileSync(OUT, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  console.error("SKIP fsa-cdp: no Chrome on CDP. Not a 100k PASS.");
  process.exit(2);
}

const page =
  browser.contexts().flatMap((c) => c.pages()).find((p) => {
    const u = p.url();
    return u.includes("127.0.0.1:8080") || u.includes("localhost:8080");
  }) ?? browser.contexts()[0]?.pages()?.[0];

if (!page) {
  await browser.close().catch(() => {});
  fail(
    { ok: false, skipped: true, reason: "no-nexus-tab" },
    "SKIP fsa-cdp: no Nexus tab. Open the app in the debug Chrome first.",
  );
}

page.on("crash", () => {
  console.error("FAIL fsa-cdp: page crashed (tab discard / OOM)");
});

let probe;
try {
  await page.waitForFunction(() => window.__NEXUS_STRESS__ || window.__NEXUS_SOAK__, {
    timeout: 15000,
  });
  probe = await page.evaluate(() => window.__NEXUS_STRESS__?.() ?? {});
} catch (err) {
  await browser.close().catch(() => {});
  fail(
    { ok: false, discarded: true, error: String(err) },
    "FAIL fsa-cdp: tab gone or probes missing",
  );
}

const notes = Number(probe.notes ?? 0);
const limit = probe.chromeFsaLimit ?? null;
const refused =
  limit?.kind === "refuse" ||
  (await page.locator("[data-chrome-fsa-refused]").count().catch(() => 0)) > 0;

if (refused && notes === 0) {
  const report = {
    ok: true,
    honestyGate: true,
    notesAttempted: limit?.notes ?? null,
    message: "Chrome refused the folder. Use desktop/Tauri for 25k+. Not 100k FSA PASS.",
    probe,
  };
  writeFileSync(OUT, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  console.log("PASS fsa-cdp honesty-gate (refused large folder)");
  await browser.close().catch(() => {});
  process.exit(0);
}

if (notes > 25_000) {
  const report = {
    ok: false,
    honestyGate: false,
    notes,
    message: "100k+ mounted in Chrome. Gate should have refused. Not PASS.",
    probe,
  };
  fail(report, "FAIL fsa-cdp: large vault mounted without refuse");
}

try {
  const result = await page.evaluate(async (opens) => {
    return window.__NEXUS_SOAK__.heapTrend(opens);
  }, OPENS);
  const heaps = (result?.trend ?? [])
    .map((row) => row.jsHeapUsedMb)
    .filter((n) => typeof n === "number");
  const report = {
    ok:
      Boolean(result) &&
      (result.opened ?? 0) >= OPENS &&
      result.discarded === false &&
      (result.clusterHits ?? 0) > 0,
    realFsa: true,
    notes,
    opens: OPENS,
    opened: result?.opened ?? 0,
    discarded: result?.discarded ?? true,
    clusterHits: result?.clusterHits ?? 0,
    heapFirstMb: heaps[0] ?? result?.heapFirstMb ?? null,
    heapLastMb: heaps[heaps.length - 1] ?? result?.heapLastMb ?? null,
    heapMaxMb: result?.heapMaxMb ?? null,
    heapLog: result?.heapLog ?? probe.heapLog ?? [],
    treeFlatRows: result?.treeFlatRows ?? probe.treeFlatRows ?? null,
    trend: result?.trend ?? [],
    scaleReady: false,
    note: "Real CDP FSA. Still not SCALE READY / 100k PASS unless notes>=100000 and this stays green.",
  };
  writeFileSync(OUT, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  if (!report.ok) {
    console.error("FAIL fsa-cdp");
    await browser.close().catch(() => {});
    process.exit(1);
  }
  console.log("PASS fsa-cdp (real folder, ≤20k bar)");
} catch (err) {
  const report = {
    ok: false,
    discarded: true,
    notes,
    error: String(err),
  };
  fail(report, "FAIL fsa-cdp: discard or evaluate failed");
}
await browser.close().catch(() => {});
