/**
 * Disk FTS fill against a generated folder (same indexer FSA uses).
 *
 *   node scripts/stress-disk-fts.mjs --notes 2000 --out /tmp/nexus-disk-fts-2k
 */
import { spawnSync } from "node:child_process";

const args = process.argv.slice(2);
let notes = 2000;
let out = "";
for (let i = 0; i < args.length; i++) {
  if (args[i] === "--notes" && args[i + 1]) notes = Number(args[++i]);
  else if (args[i] === "--out" && args[i + 1]) out = args[++i];
}
if (!out) out = `/tmp/nexus-disk-fts-${notes}`;

const gen = spawnSync(
  "node",
  ["scripts/generate-synthetic-vault.mjs", "--notes", String(notes), "--out", out],
  { cwd: process.cwd(), encoding: "utf8", timeout: 180_000 },
);
if (gen.status !== 0) {
  console.error(gen.stdout, gen.stderr);
  process.exit(gen.status ?? 1);
}
if (gen.stdout) process.stdout.write(gen.stdout);

const r = spawnSync("npx", ["--yes", "tsx", "scripts/stress-disk-fts-run.mts", out], {
  cwd: process.cwd(),
  encoding: "utf8",
  timeout: 180_000,
});
if (r.stdout) process.stdout.write(r.stdout);
if (r.stderr) process.stderr.write(r.stderr);
process.exit(r.status ?? 1);
