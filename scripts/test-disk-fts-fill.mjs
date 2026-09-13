/**
 * Meta-only disk FTS: body terms must appear only after file-head fill.
 * Run: node scripts/test-disk-fts-fill.mjs
 */
import { spawnSync } from "node:child_process";

const r = spawnSync("npx", ["--yes", "tsx", "scripts/test-disk-fts-fill-run.mts"], {
  cwd: process.cwd(),
  encoding: "utf8",
  timeout: 60_000,
});
if (r.stdout) process.stdout.write(r.stdout);
if (r.stderr) process.stderr.write(r.stderr);
if (r.status !== 0) {
  console.error("disk-fts-fill tests failed", r.error);
  process.exit(r.status ?? 1);
}
