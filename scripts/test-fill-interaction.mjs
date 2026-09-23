/**
 * Mid-fill interaction policy: do not hydrate / upsert on every select.
 * Run: npm run test:fill-interaction
 */
import assert from "node:assert/strict";

if (!process.env.NEXUS_TSX) {
  const { spawnSync } = await import("node:child_process");
  const r = spawnSync("npx", ["--yes", "tsx", "scripts/test-fill-interaction.mjs"], {
    cwd: process.cwd(),
    encoding: "utf8",
    timeout: 30_000,
    env: { ...process.env, NEXUS_TSX: "1" },
  });
  if (r.stdout) process.stdout.write(r.stdout);
  if (r.stderr) process.stderr.write(r.stderr);
  process.exit(r.status ?? 1);
}

const {
  shouldDeferNoteBodyHydrate,
  shouldSkipDurableUpsertOnHydrate,
  shouldSkipBackgroundBodyHydrate,
  scheduleFillSafeHydrate,
} = await import("../src/lib/vault/fill-interaction.ts");

assert.equal(
  shouldDeferNoteBodyHydrate({ fillBusy: true }),
  false,
  "the open note reads from disk while fill runs",
);
assert.equal(
  shouldDeferNoteBodyHydrate({ fillBusy: false }),
  false,
  "an idle vault still reads the open note immediately",
);

assert.equal(
  shouldSkipBackgroundBodyHydrate({ fillBusy: true }),
  true,
  "hover/embed must not pile onto fill I/O",
);
assert.equal(shouldSkipBackgroundBodyHydrate({ fillBusy: false }), false);

assert.equal(
  shouldSkipDurableUpsertOnHydrate({
    fillBusy: true,
    indexKind: "memory",
    slimNotes: 0,
  }),
  true,
  "hydrate must not vault_index_upsert into the live fill writer",
);

assert.equal(
  shouldSkipDurableUpsertOnHydrate({
    fillBusy: false,
    indexKind: "sqlite",
    slimNotes: 0,
  }),
  true,
  "empty JS mirror (slimNotes=0) must not upsert every desktop open",
);

assert.equal(
  shouldSkipDurableUpsertOnHydrate({
    fillBusy: false,
    indexKind: "memory",
    slimNotes: 12,
  }),
  false,
  "small web/memory vaults may still upsert on hydrate",
);

assert.equal(
  shouldSkipDurableUpsertOnHydrate({
    fillBusy: false,
    indexKind: "memory",
    slimNotes: 400,
  }),
  true,
);

let ran = false;
const cancel = scheduleFillSafeHydrate(() => {
  ran = true;
}, { delayMs: 15 });
assert.equal(ran, false, "idle hydrate must not run on the click stack");
cancel();
await new Promise((r) => setTimeout(r, 40));
assert.equal(ran, false, "cancelled idle hydrate must not fire");

let later = false;
scheduleFillSafeHydrate(() => {
  later = true;
}, { delayMs: 10 });
await new Promise((r) => setTimeout(r, 40));
assert.equal(later, true, "scheduled hydrate runs after paint");

console.log("fill-interaction: PASS");
