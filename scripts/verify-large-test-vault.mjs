/**
 * Fixture integrity for public/large-test-vault (45k seed).
 * Verifies manifest + chunk files exist and are non-empty without loading all bodies.
 * Run: node scripts/verify-large-test-vault.mjs
 */

import { readFileSync, statSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const vaultDir = join(root, "public", "large-test-vault");
const manifestPath = join(vaultDir, "manifest.json");

function fail(msg) {
  console.error(`FAIL: ${msg}`);
  process.exit(1);
}

function ok(msg) {
  console.log(`OK: ${msg}`);
}

if (!existsSync(manifestPath)) {
  fail(`manifest missing: ${manifestPath}`);
}

let manifest;
try {
  manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
} catch (e) {
  fail(`manifest unreadable/invalid JSON: ${e.message}`);
}

const chunks = Number(manifest.chunks);
if (!Number.isInteger(chunks) || chunks < 1) {
  fail(`manifest.chunks must be a positive integer, got ${JSON.stringify(manifest.chunks)}`);
}

if (typeof manifest.total !== "number" || manifest.total < 1) {
  fail(`manifest.total must be a positive number, got ${JSON.stringify(manifest.total)}`);
}

ok(`manifest.json (chunks=${chunks}, total=${manifest.total})`);

const foldersPath = join(vaultDir, "folders.json");
if (!existsSync(foldersPath)) {
  fail(`folders.json missing: ${foldersPath}`);
}
const foldersStat = statSync(foldersPath);
if (foldersStat.size <= 0) {
  fail("folders.json is empty");
}
ok(`folders.json (${foldersStat.size} bytes)`);

let missing = 0;
let empty = 0;
/** @type {number[]} */
const sizes = [];

for (let i = 0; i < chunks; i++) {
  const name = `notes-${i}.json`;
  const p = join(vaultDir, name);
  if (!existsSync(p)) {
    console.error(`  missing: ${name}`);
    missing++;
    continue;
  }
  const st = statSync(p);
  if (st.size <= 0) {
    console.error(`  empty: ${name}`);
    empty++;
    continue;
  }
  sizes.push(st.size);
}

if (missing > 0 || empty > 0) {
  fail(`${missing} missing, ${empty} empty chunk file(s) of notes-0..notes-${chunks - 1}`);
}

ok(`notes-0..notes-${chunks - 1} all present and non-empty`);

// Sample first chunk only — avoid parsing all ~22MB
const firstPath = join(vaultDir, "notes-0.json");
const firstRaw = readFileSync(firstPath, "utf8");
if (firstRaw.length < 100) {
  fail(`notes-0.json too small to be a real chunk (${firstRaw.length} chars)`);
}
let firstArr;
try {
  firstArr = JSON.parse(firstRaw);
} catch (e) {
  fail(`notes-0.json invalid JSON: ${e.message}`);
}
if (!Array.isArray(firstArr) || firstArr.length === 0) {
  fail("notes-0.json must be a non-empty JSON array");
}
ok(`notes-0.json sample: ${firstArr.length} notes, ${firstRaw.length} chars`);

const totalBytes = sizes.reduce((a, b) => a + b, 0);
console.log(
  `verify-large-test-vault: PASS (${chunks} chunks, ${totalBytes} bytes notes, sample len=${firstArr.length})`
);
