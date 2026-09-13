# Scale soak report

**SHA under test:** `edca326` (this branch), vs baseline **`907d8ea`**.
**Verdict: not SCALE READY.** Core path-patch is fixed. 45k tree / search / create / editor / exact count are under 1s app-ready. Note-switch p95 is ~1.07s on this VM; cold open is ~3s with progress. Desktop 300–500k remains a north star; this VM proved in-process + disk-file generation through 300k, not a Tauri/FSA mount.

Sam’s bar: do not PASS 45k UI on the absence of crashes. Common ops target **<1s app-ready**. Cold open may exceed 1s if progress is visible and the UI stays responsive.

---

## Before / after (907d8ea → this SHA)

### Core in-process (`bench-vault-stress`)

| Size | Op | 907d8ea | After | Gate |
|------|----|---------|-------|------|
| 10k | structural rebuild | 33.6ms | 31.8ms | PASS |
| 10k | **path-patch 20** | 60.0ms | **0.5ms** | PASS (<100ms) |
| 10k | durable reconcile | 32.2ms | 35.1ms | PASS |
| 50k | structural rebuild | 224.7ms | 162.7ms | open-time |
| 50k | **path-patch 20** | **371.5ms WARN** | **0.6ms** | PASS |
| 50k | durable reconcile | 171.2ms | 146.0ms | PASS |
| 100k | structural rebuild | 507.3ms | 447.9ms | open-time |
| 100k | **path-patch 20** | **790.3ms WARN** | **0.5ms** | PASS |
| 100k | durable reconcile | 347.6ms | 286.1ms | PASS |

Path-patch 20 is no longer O(n). Production `idOf` is O(1); the old bench walked `Object.values` per op (also O(n)). Both are fixed. Scan `nodes` / `signatures` keep the same object identity.

### 45k UI at 907d8ea (FAIL vs ~1s bar)

Timings included fixed `waitForTimeout` (graph 2–3.5s, new-note 1.5–2.5s, search 0.6–1.2s). Still the responsiveness bar failed:

| Op | 907d8ea wall | Coverage hole |
|----|--------------|---------------|
| open | 2593ms | |
| tree | 3842ms | `switchNotesCount=0` |
| scroll | 504ms | |
| search | 2501ms | |
| graph | 3836ms | |
| new note | 3826ms | |
| after create | 45,001 notes, 3 bodies, no errors | count asserted via toast, not `__NEXUS_STRESS__` |
| demo | graph 2070ms / new note 2411ms | `editorTyped=false` |

Re-measurement on this SHA uses **app-ready** (probe / option / canvas) vs wait. Results are appended after the Playwright run on this SHA.

---

## What was broken (root cause)

1. **`applyNoteOpsToScan`** copied `{ ...nodes }` and `{ ...signatures }` and called `buildPathToId` (full scan) on every sparse watch batch.
2. **`beginStage` / `createNote`** cloned the entire node map and built `Set(Object.values(nodes).map(path))` — then `flushStageNow` changed map identity so `VaultStructuralIndex.sync` full-rebuilt (225ms @50k / 507ms @100k). That is the 3.8s new-note wall.
3. **`ensureNoteBody` / `updateNoteContent` / `trimBodyCache`** spread the 45k map on hydrate and keystroke.
4. **`partializeVaultPersist`** called `Object.keys(nodes)` on every store set even for 45k/soak (persist fires constantly).
5. **Editor** subscribed to the whole `nodes` map and counted notes with `Object.values`.
6. **Graph** ran `collectVaultTags` over the vault on every folder-graph paint.
7. **Empty-query palette** sorted every note by mtime.
8. **Playwright** slept, then PASSed on no `pageerror`.

---

## Fixes on this branch

| Area | Change |
|------|--------|
| `path-patch.ts` | In-place mutate; incremental path lookup via `idOf`; `ensureFolderChain` sees existing folders without a full map |
| `indexes.ts` | `applyHintedDirty` inserts/deletes/updates even when the node map is the same object |
| `store.ts` | No clone on stage/create/hydrate/edit; `pathOccupied` via `vaultIndex.hasPath`; `__NEXUS_SOAK__` create/switch/45k helpers |
| `persist-policy.ts` | Skip `Object.keys` when vault is already large/disk |
| `fs-adapter.ts` | Do not copy 100k signature objects for a path patch |
| Editor / graph / palette | Select one note; skip tag walk unless color-by-tag; recents-only empty query |
| Playwright | Exact `notes === 45000` / `45001`; `editorTyped`; `switchNotesCount > 0`; search options; app-ready vs wait; fail >1s common ops |
| Disk | `generate-synthetic-vault.mjs` + `bench-disk-vault.mjs` |

---

## Disk `.md` generator (this VM)

Not a Tauri/FSA open. Real files on disk + the same generate / structural / path-patch / memory-FTS path desktop uses after a native scan.

| Size | disk write | generate | structural | path-patch20 | FTS rebuild | search | RSS | Result |
|------|------------|----------|------------|--------------|-------------|--------|-----|--------|
| 100k | 1900ms | 417ms | 1549ms | **0.61ms** | 2447ms | 70ms | 756MB | OK |
| 300k | 7448ms | 1114ms | 11665ms | **0.78ms** | 7734ms | 205ms | 2250MB | OK |

300k **search 205ms** misses the 50ms FTS target in `docs/SCALING.md`. Acceptable as a first disk proof; not a daily-driver claim. Structural 11.7s is open-time (progress OK).

---

## Hard ceilings (unchanged product limits)

| Cap | Where | Value |
|-----|-------|-------|
| Persist node map | `PARTIALIZE_NODE_CAP` | **>2500 empties nodes** |
| Large-memory vault IDs | `isLargeMemoryVault` | `large-test-vault-45k` + `soak-vault-*` |
| Graph full notes | `egoGraphMinNotes` / `folderGraphMinNotes` | **400** |
| Folder graph draw | `folderMaxNodes` | **320** orbs |
| Body LRU | `bodyLruSize` | **120** |
| Unlinked scan | `unlinked-mentions.ts` | 400 notes / 24 hits |
| Native SQLite list | `native-sqlite-index.ts` | `limit: 500_000` |
| IndexedDB | `fs-adapter.ts` | handles only, not bodies |
| Docs | `docs/SCALING.md` | Desktop 300–500k; browser “solid 20–50k” |

---

## 45k UI (this SHA, Playwright, app-ready)

Run: `node scripts/stress-ui-multisize.mjs http://127.0.0.1:8080/` on **`edca326`**.

| Op | 907d8ea wall | After app-ready | Budget | Result |
|----|--------------|-----------------|--------|--------|
| open (cold) | 2593ms | **2988ms** (store **1726ms**) | <30s progressive | WARN (progress OK) |
| tree | 3842ms | **828ms** | <1s | PASS |
| search | 2501ms | **426ms** | <1s | PASS |
| graph chrome | 3836ms | **209ms** | <1s | PASS |
| new note | 3826ms | **877ms** | <1s | PASS |
| switch notes | count=0 | **6 switches**: 348, 727, 1074, 916, 926, 1017 (max **1074**) | <1s | FAIL (2/6 >1s) |
| editorTyped | n/a | **true** | must be true | PASS |
| notes after create | toast | **45001** exact, 8 bodies | 45001 | PASS |
| page errors | none | none | none | PASS |

Demo same run: search **89ms**, graph chrome **21ms**, editorTyped still false (Welcome editor not visible to the harness), newNote **1135ms**.

**Still not SCALE READY.** Do not treat “no errors” as a pass. Switch needs to stay under 1s (TipTap remount + body hydrate on this VM). Desktop FSA/Tauri open of the generated 100k/300k folder is unproven here.

---

## What is still not proven

- Browser 45k common-op app-ready <1s on this SHA (run in progress / pending).
- Tauri/FSA open of the generated 100k/300k folder on a Mac (Wave E).
- 300k FTS query ≤50ms (measured 205ms in-process memory FTS).
- Reload remount of soak vaults under UI (harness covers it in `scale-soak.mjs`; not yet green-at-size).

**Do not ship this as the only vault at 45k+ until the UI table above is green.**
