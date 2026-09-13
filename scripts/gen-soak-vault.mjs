/**
 * Official soak vault writer — same tokens as generate-synthetic-vault.mjs.
 *
 * Probe words (every official vault): `hub`, `cluster`, `retrieval`.
 * Hub titles every 200 notes; every note body contains "Cluster hub".
 *
 *   npm run gen:soak-vault -- --notes 100000 --out ~/Documents/nexus-soak-100k
 *   node scripts/gen-soak-vault.mjs --notes 100000 --out ./nexus-soak-100k
 *
 * Do not use a one-off generator that omits `hub`. The unofficial
 * /workspace/gen-soak-vault.mjs (not in this repo) wrote Meeting-* files
 * with cluster_files=100000 and hub_files=0 — `hub` search is a false alarm
 * on that folder. Probe that vault with `cluster` only, or regenerate.
 */
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const child = spawn(
  process.execPath,
  [path.join(here, "generate-synthetic-vault.mjs"), ...process.argv.slice(2)],
  { stdio: "inherit" },
);
child.on("exit", (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  process.exit(code ?? 1);
});
