/**
 * Write a deterministic soak vault to disk (plain Markdown).
 *
 * Probe words: `hub` and `cluster` (every body has "Cluster hub"; Hub titles
 * every 200 notes). `retrieval` is a rotating topic, not every file.
 *
 *   node scripts/generate-synthetic-vault.mjs --notes 10000 --out /tmp/nexus-soak-10k
 *   node scripts/gen-soak-vault.mjs --notes 100000 --out ~/Documents/nexus-soak-100k
 *
 * Default `--out` (when omitted) is ~/Documents/nexus-soak-{n} so Tauri
 * capabilities can read it. Override with --out or NEXUS_SOAK_VAULT.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { build } from "esbuild";
import { tmpdir } from "node:os";
import { pathToFileURL } from "node:url";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defaultSoakVaultPath } from "./soak-vault-path.mjs";

function parseArgs() {
  const args = process.argv.slice(2);
  let notes = 10000;
  let out = "";
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--notes" && args[i + 1]) notes = Number(args[++i]);
    else if (args[i] === "--out" && args[i + 1]) out = args[++i];
  }
  if (!out) out = defaultSoakVaultPath(Number.isFinite(notes) ? notes : 10000);
  return { notes: Number.isFinite(notes) ? notes : 10000, out };
}

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const { notes, out } = parseArgs();
const bundleDir = join(tmpdir(), `nexus-gen-${Date.now()}`);
mkdirSync(bundleDir, { recursive: true });
const bundle = join(bundleDir, "synthetic.mjs");
await build({
  entryPoints: [path.join(root, "src/lib/vault/synthetic-vault.ts")],
  outfile: bundle,
  bundle: true,
  format: "esm",
  platform: "neutral",
  logLevel: "silent",
});
const { writeSyntheticMarkdownFiles } = await import(pathToFileURL(bundle).href);

const t0 = performance.now();
const stats = writeSyntheticMarkdownFiles(notes, (rel, body) => {
  const full = join(out, rel);
  mkdirSync(dirname(full), { recursive: true });
  writeFileSync(full, body);
});
const ms = Math.round(performance.now() - t0);
writeFileSync(
  join(out, "SOAK-MANIFEST.json"),
  JSON.stringify({ notes, ...stats, out, ms, generatedAt: new Date().toISOString() }, null, 2),
);
console.log(
  JSON.stringify({ ok: true, notes, files: stats.files, folders: stats.folders, out, ms }, null, 2),
);
