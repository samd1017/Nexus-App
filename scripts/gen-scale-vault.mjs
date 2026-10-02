/**
 * Large test vault writer — same tokens as generate-synthetic-vault.mjs.
 *
 * Probe words (every official vault): `hub`, `cluster`, `retrieval`.
 * Hub titles every 200 notes; every note body contains "Cluster hub".
 *
 *   npm run gen:scale-vault -- --notes 100000 --out ~/Documents/nexus-scale-100k
 *   node scripts/gen-scale-vault.mjs --notes 100000 --out ./nexus-scale-100k
 *
 * Do not use a one-off generator that omits `hub`. An unofficial generator
 * wrote Meeting-* files with cluster_files=100000 and hub_files=0 — `hub`
 * search is a false alarm on that folder. Probe that vault with `cluster`
 * only, or regenerate with this script.
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
