/**
 * Wave E disk path on a Linux VM (no Tauri / no FSA user gesture).
 *
 * 1) Write real .md folders at 100k then 300k
 * 2) Run the same in-process generate / structural / path-patch / memory-FTS
 *    path desktop uses after a native scan
 * 3) Print exact Mac Tauri steps (cannot be automated here)
 *
 *   node scripts/wave-e-disk.mjs [--sizes 100000,300000] [--out /tmp/nexus-wave-e]
 */
import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sizesArg = process.argv.find((_, i, a) => a[i - 1] === "--sizes");
const outArg = process.argv.find((_, i, a) => a[i - 1] === "--out");
const SIZES = (sizesArg || "100000,300000")
  .split(",")
  .map((s) => Number(s.trim()))
  .filter((n) => Number.isFinite(n) && n > 0);
const outRoot = outArg || "/tmp/nexus-wave-e";
mkdirSync(outRoot, { recursive: true });

const tauriSteps = {
  platform: "macOS (or any Tauri desktop build)",
  whyLinuxVmCannot: [
    "File System Access picker requires a user gesture; headless Chrome has no folder grant.",
    "Tauri desktop + SQLite FTS5 is not installed in this browser-first VM.",
  ],
  steps: [
    "macOS: npm run gen:soak-vault -- --notes 100000 --out ~/Documents/nexus-soak-100k",
    "macOS: npm run gen:soak-vault -- --notes 300000 --out ~/Documents/nexus-soak-300k",
    "Windows: npm run gen:soak-vault -- --notes 100000 --out %USERPROFILE%\\Documents\\nexus-soak-100k",
    "Windows: npm run gen:soak-vault -- --notes 300000 --out %USERPROFILE%\\Documents\\nexus-soak-300k",
    "Preferred: npm run soak:wave-e-desktop -- --notes 100000  (then 300000)",
    "npm run tauri:dev → Welcome → Open folder → pick the generated vault",
    "Or DEV console: await __NEXUS_SOAK__.runWaveE(absPath) — searchEngine.id must be sqlite-fts5-bm25",
    "Title bar must say On disk / Desktop — never Test · this browser",
    "⌘K / Ctrl+K 'retrieval hub' — heading must include SQLite FTS5 BM25 (not Memory FTS capped)",
    "Capture: interactiveMs, search app-ready, __NEXUS_STRESS__().searchEngine.id, create+reload, graph-panel switch p95, RSS",
    "This VM only benches memory inverted index. Do not record those ms as SQLite BM25.",
  ],
};

function run(cmd, args) {
  const r = spawnSync(cmd, args, { cwd: root, encoding: "utf8", timeout: 30 * 60 * 1000 });
  if (r.status !== 0) {
    throw new Error(`${cmd} ${args.join(" ")}\n${r.stdout}\n${r.stderr}`);
  }
  return r.stdout;
}

const generated = [];
for (const n of SIZES) {
  const dir = join(outRoot, `vault-${n}`);
  console.log(`=== generate ${n} → ${dir} ===`);
  const stdout = run("node", [
    "scripts/generate-synthetic-vault.mjs",
    "--notes",
    String(n),
    "--out",
    dir,
  ]);
  generated.push({ n, dir, generate: JSON.parse(stdout) });
}

console.log("=== bench-disk-vault (memory FTS, not Tauri) ===");
const benchOut = run("node", ["scripts/bench-disk-vault.mjs", "--sizes", SIZES.join(",")]);
let benchJson = null;
try {
  const start = benchOut.indexOf("{");
  const end = benchOut.lastIndexOf("}");
  benchJson = start >= 0 ? JSON.parse(benchOut.slice(start, end + 1)) : { raw: benchOut };
} catch {
  benchJson = { raw: benchOut };
}

const report = {
  generatedAt: new Date().toISOString(),
  outRoot,
  generated,
  bench: benchJson,
  tauriSteps,
  honestFloor:
    "Browser / FSA / this VM: memory inverted index. After candidate-cap intersection, 300k 'retrieval hub' measured ~2.5ms (was ~205ms when the full posting list was copied). That is not SQLite BM25 quality. Desktop Tauri remains the ranked ≤50ms architecture. This VM cannot FSA-pick or Tauri-open the generated folders.",
};
const outFile = join(outRoot, "WAVE_E_REPORT.json");
writeFileSync(outFile, JSON.stringify(report, null, 2));
if (existsSync("/opt/cursor/artifacts/stress")) {
  writeFileSync("/opt/cursor/artifacts/stress/wave-e.json", JSON.stringify(report, null, 2));
}
console.log(JSON.stringify(report, null, 2));
console.log(`wrote ${outFile}`);
