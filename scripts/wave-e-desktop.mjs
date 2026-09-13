/**
 * Wave E desktop runner — Mac / Windows Tauri + SQLite FTS5 BM25.
 *
 * This Linux VM cannot prove SCALE READY. Chrome 100k is refused. Mock-20k
 * is not Wave E. Run this script on the machine that has `npm run tauri:dev`.
 *
 *   npm run soak:wave-e-desktop -- --notes 100000
 *   npm run soak:wave-e-desktop -- --notes 300000
 *   npm run soak:wave-e-desktop -- --cdp http://127.0.0.1:9223 --vault ~/Documents/nexus-soak-100k
 *
 * Windows WebView2 CDP:
 *   set WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS=--remote-debugging-port=9223
 *   npm run tauri:dev
 *
 * macOS: enable the Tauri webview inspector, or run the DevTools console
 * snippet printed below. Playwright against `npm run dev` is NOT Wave E.
 *
 * Do not claim SCALE READY unless a real desktop open of 100k+ stays
 * responsive (search, 20 opens, create+reload) and the palette heading is
 * SQLite FTS5 BM25.
 */
import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defaultSoakVaultPath } from "./soak-vault-path.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
function arg(name, fallback = "") {
  const i = args.indexOf(name);
  if (i >= 0 && args[i + 1]) return args[i + 1];
  return fallback;
}

const NOTES = Math.max(1000, Number(arg("--notes", process.env.NEXUS_SOAK_NOTES || "100000")) || 100000);
const CDP = arg("--cdp", process.env.NEXUS_TAURI_CDP || "");
const URL = arg("--url", process.env.NEXUS_TAURI_URL || "");
const defaultVault = defaultSoakVaultPath(NOTES);
const VAULT = path.resolve(arg("--vault", defaultVault));
const OUT_DIR =
  process.env.NEXUS_WAVE_E_OUT ||
  (existsSync("/opt/cursor/artifacts/stress")
    ? "/opt/cursor/artifacts/stress"
    : path.join(root, "artifacts", "wave-e"));
mkdirSync(OUT_DIR, { recursive: true });

const steps = {
  generate: [
    `npm run gen:soak-vault -- --notes ${NOTES} --out ${VAULT}`,
    "Confirm SOAK-MANIFEST.json notes equals the size you intend.",
  ],
  build: [
    "Install Rust (rustup) + Node 22+.",
    "macOS: xcode-select --install",
    "Windows: MSVC toolchain + WebView2.",
    "npm install",
    "npm run tauri:dev",
  ],
  prove: [
    "Welcome → Open folder → pick the generated vault (or DevTools: await __NEXUS_SOAK__.runWaveE(absPath))",
    "Title bar: On disk / Desktop — never Test · this browser",
    "Cold open: tree/editor in seconds (ready-meta). Do not wait for full 100k 8k-head FTS before browsing.",
    "Banner must show live scanned/total while heads fill. Window Responding=True.",
    "Re-open the same vault: seconds (unchanged skip), banner Ready · SQLite FTS5 BM25.",
    "⌘K / Ctrl+K  retrieval hub  — heading includes SQLite FTS5 BM25 (may say · titles / · heads), not Memory FTS (capped)",
    "Search cluster (every official soak body has Cluster hub)",
    "Open 20 notes. UI stays responsive. No discard.",
    "Create a note, quit or run reloadDesktop, confirm the file is still on disk.",
    "Then repeat at 300k. Do not claim SCALE READY before 100k desktop proof.",
  ],
  windowsCdp: [
    "set WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS=--remote-debugging-port=9223",
    "npm run tauri:dev",
    `npm run soak:wave-e-desktop -- --cdp http://127.0.0.1:9223 --vault ${VAULT} --notes ${NOTES}`,
  ],
  macosConsole: [
    "In the Tauri window DevTools console:",
    `await __NEXUS_SOAK__.runWaveE(${JSON.stringify(VAULT)})`,
    "Expect searchEngine.id === 'sqlite-fts5-bm25' and pass:true",
    "pass:true is one run. SCALE READY still needs a human-confirmed responsive 100k+ session.",
  ],
};

function manifestNotes(dir) {
  const p = path.join(dir, "SOAK-MANIFEST.json");
  if (!existsSync(p)) return null;
  try {
    const j = JSON.parse(readFileSync(p, "utf8"));
    return Number(j.notes) || null;
  } catch {
    return null;
  }
}

function generateVault() {
  const have = manifestNotes(VAULT);
  if (have === NOTES) {
    console.log(`vault already present: ${VAULT} (${have} notes)`);
    return { generated: false, notes: have, out: VAULT };
  }
  console.log(`=== generate ${NOTES} → ${VAULT} ===`);
  const r = spawnSync(
    "node",
    [
      "scripts/generate-synthetic-vault.mjs",
      "--notes",
      String(NOTES),
      "--out",
      VAULT,
    ],
    { cwd: root, encoding: "utf8", timeout: 60 * 60 * 1000, stdio: "pipe" },
  );
  if (r.status !== 0) {
    throw new Error(`generate failed\n${r.stdout}\n${r.stderr}`);
  }
  const written = manifestNotes(VAULT);
  let raw = null;
  try {
    const start = r.stdout.indexOf("{");
    const end = r.stdout.lastIndexOf("}");
    raw = start >= 0 && end > start ? JSON.parse(r.stdout.slice(start, end + 1)) : null;
  } catch {
    raw = null;
  }
  return { generated: true, notes: written, raw, out: VAULT };
}

async function driveTauriCdp(cdpUrl) {
  const { chromium } = await import("playwright");
  const browser = await chromium.connectOverCDP(cdpUrl);
  const contexts = browser.contexts();
  const pages = contexts.flatMap((c) => c.pages());
  const page =
    pages.find((p) => p.url().includes("localhost") || p.url().includes("127.0.0.1") || p.url().startsWith("tauri://") || p.url().startsWith("https://tauri.localhost")) ||
    pages[0];
  if (!page) {
    await browser.close();
    throw new Error("CDP connected but no pages. Is tauri:dev running?");
  }
  await page.waitForFunction(() => window.__NEXUS_SOAK__, { timeout: 60_000 });
  const tauri = await page.evaluate(
    () => !!(window.__TAURI_INTERNALS__ || window.__TAURI__ || window.isTauri),
  );
  if (!tauri) {
    await browser.close();
    throw new Error(
      "Connected page is not Tauri. Playwright against npm run dev is not Wave E.",
    );
  }
  const result = await page.evaluate(async (vault) => {
    return window.__NEXUS_SOAK__.runWaveE(vault);
  }, VAULT);
  const probe = await page.evaluate(() => window.__NEXUS_STRESS__?.());
  await browser.close();
  return { result, probe };
}

const generated = generateVault();
const ticket = {
  generatedAt: new Date().toISOString(),
  platform: `${os.platform()} ${os.release()}`,
  notes: NOTES,
  vault: VAULT,
  generated,
  verdict: "not SCALE READY",
  why:
    "SCALE READY requires a real Nexus Desktop (Tauri) open of 100k+ that stays responsive: palette SQLite FTS5 BM25, retrieval hub + cluster hits, 20 note opens, create+reload. This VM / Chrome FSA 100k refuse is not that proof.",
  steps,
  cdp: CDP || null,
  url: URL || null,
};

let driven = null;
if (CDP) {
  try {
    driven = await driveTauriCdp(CDP);
    ticket.driven = driven;
    const engine = driven?.result?.searchEngine?.id;
    const pass = driven?.result?.pass === true && engine === "sqlite-fts5-bm25";
    ticket.desktopPass = pass;
    ticket.verdict = pass
      ? "desktop Wave E run recorded — still not SCALE READY until a human confirms the 100k+ session stayed responsive"
      : "desktop Wave E run failed — not SCALE READY";
  } catch (err) {
    ticket.drivenError = err instanceof Error ? err.message : String(err);
  }
} else if (URL) {
  ticket.urlNote =
    "Passing --url without --cdp does not drive Tauri. Open that URL only if it is the Tauri webview with CDP. npm run dev Chrome is not Wave E.";
}

const ticketFile = path.join(OUT_DIR, "WAVE_E_DESKTOP_TICKET.json");
writeFileSync(ticketFile, JSON.stringify(ticket, null, 2));
console.log(JSON.stringify(ticket, null, 2));
console.log(`wrote ${ticketFile}`);
console.log("");
console.log("=== Mac / Windows next ===");
for (const line of steps.build) console.log(`  • ${line}`);
console.log("  prove:");
for (const line of steps.prove) console.log(`  • ${line}`);
if (os.platform() === "win32") {
  console.log("  Windows CDP:");
  for (const line of steps.windowsCdp) console.log(`  • ${line}`);
} else {
  console.log("  macOS console:");
  for (const line of steps.macosConsole) console.log(`  • ${line}`);
}

if (CDP && ticket.desktopPass) {
  process.exit(0);
}
if (CDP && ticket.drivenError) {
  process.exit(2);
}
// No Tauri proof collected — honest non-zero so CI cannot treat this as SCALE READY.
process.exit(2);
