# Scale soak report

**SHA under test:** `9ec34eb` (this branch), vs baseline **`907d8ea`**.
**Verdict: not SCALE READY.**

I would not trust this as my only vault at 300k. Browser 45k common-ops are green on this VM, including graph-panel switch, reload of a non-default seed + split, and **session-created Soak Created.md surviving remount** via the remount-ticket overlay. Disk Wave E wrote real 100k and 300k `.md` folders and searched them through the **memory** inverted index (2.4–2.6ms). That is not a Tauri/FSA mount and not SQLite BM25. Palette on this VM reports `memory-fts-capped`. Desktop 300–500k remains the north star.

Sam’s bar: do not PASS 45k UI on the absence of crashes. Common ops target **<1s app-ready**. Cold open may exceed 1s if progress is visible and the UI stays responsive (no ≥1s long task).

---

## Before / after (907d8ea → `9ec34eb`)

### Core in-process (`bench-vault-stress`)

Core numbers from `9bf8cd7` (path-patch / reconcile unchanged on `9ec34eb`).

| Size | Op | 907d8ea | this branch | Gate |
|------|----|---------|-----------|------|
| 10k | structural rebuild | 33.6ms | **28.9ms** | PASS |
| 10k | **path-patch 20** | 60.0ms | **0.5ms** | PASS (<100ms) |
| 10k | durable reconcile | 32.2ms | **33.2ms** | PASS |
| 50k | structural rebuild | 224.7ms | **165.1ms** | open-time |
| 50k | **path-patch 20** | **371.5ms WARN** | **0.5ms** | PASS |
| 50k | durable reconcile | 171.2ms | **149.6ms** | PASS |
| 100k | structural rebuild | 507.3ms | **445.5ms** | open-time |
| 100k | **path-patch 20** | **790.3ms WARN** | **0.7ms** | PASS |
| 100k | durable reconcile | 347.6ms | **279.9ms** | PASS |

Path-patch 20 is no longer O(n). Production `idOf` is O(1). Scan `nodes` / `signatures` keep the same object identity.

### 45k UI at 907d8ea (FAIL vs ~1s bar)

| Op | 907d8ea wall | Coverage hole |
|----|--------------|---------------|
| open | 2593ms | |
| tree | 3842ms | `switchNotesCount=0` |
| scroll | 504ms | |
| search | 2501ms | |
| graph | 3836ms | |
| new note | 3826ms | |
| after create | 45,001 notes, 3 bodies, no errors | count asserted via toast |
| demo | graph 2070ms / new note 2411ms | `editorTyped=false` |

### 45k UI on this SHA (`stress-ui-multisize` PASS)

Run: `node scripts/stress-ui-multisize.mjs http://127.0.0.1:8080/` on **`9ec34eb`**. Raw: `/opt/cursor/artifacts/stress/ui-multisize.json`.

| Op | 907d8ea | `cfc74f1` | **`9ec34eb`** | Budget | Result |
|----|---------|-----------|---------------|--------|--------|
| open (cold, app-ready) | 2593ms | 2760ms (store 1686) | **1794ms** (store **1148ms**, interactive **410ms**, index **377ms**) | <30s progressive; store ~1.5s | WARN wall / PASS store |
| open long-task max | n/a | n/a | **464ms** (rAF 60ms) | <1000ms freeze | PASS |
| open progress | n/a | banner | walking → indexing (“Workspace ready — in-memory search (not SQLite)”) → ready | must show | PASS |
| search engine | n/a | implied FTS5 | **`memory-fts-capped`** | must not say SQLite | PASS |
| tree | 3842ms | 310ms | **196ms** | <1s | PASS |
| search | 2501ms | 266ms | **108ms** | <1s | PASS |
| graph chrome | 3836ms | 75ms | **43ms** | <1s | PASS |
| new note | 3826ms | 282ms | **222ms** | <1s | PASS |
| lastNotePath on create | n/a | missed | **Soak Created.md** | persist | PASS |
| switch (graph closed) | count=0 | max 906 | p95 **160** | <1s | PASS |
| **switchGraphPanel** | n/a | later 110 | p95 **129** / max **129** | p95 <700 / max <1s | PASS |
| editorTyped | false | true | **true** | must be true | PASS |
| notes after create | toast | 45001 | **45001** | 45001 | PASS |
| reload | unproven | dropped create | **45001**, `Brief-41936-jrg.md` + split + **Soak Created.md restored** (`overlayApplied=10`) | no silent loss | PASS |
| page errors | none | none | none | none | PASS |

Demo same run: editorTyped **true**, search **91ms**, graph chrome **26ms**, newNote **146ms**, `lastNotePath=Soak Created.md`, searchEngine **`inverted`**. Suite **PASS**.

Two-stage open: tree/editor mount at store **interactiveMs** (**410ms** on `9ec34eb`); FTS fill continues under a banner that says the workspace is ready and that this is **in-memory search, not SQLite**. App-ready wall still includes navigation + waiting for FTS `openMs`. Progress banner is visible; long-task max stayed under the 1s freeze bar.

Reload remount **keeps** session-created `Soak Created.md`. Persist still never writes the 45k map (quota). Creates/edits go to the browser overlay (IndexedDB + sync localStorage) **and** a clipped copy on the remount ticket (`ScaleRemount.overlay`, last 80). Title bar says **Test · this browser**; the banner has **Open a folder** for a real on-disk vault. Active note + split also restore from the remount ticket.

---

## What was broken (root cause)

1. **`applyNoteOpsToScan`** copied `{ ...nodes }` and `{ ...signatures }` and called `buildPathToId` (full scan) on every sparse watch batch.
2. **`beginStage` / `createNote`** cloned the entire node map and built `Set(Object.values(nodes).map(path))` — then `flushStageNow` changed map identity so `VaultStructuralIndex.sync` full-rebuilt (225ms @50k / 507ms @100k). That is the 3.8s new-note wall.
3. **`ensureNoteBody` / `updateNoteContent` / `trimBodyCache`** spread the 45k map on hydrate and keystroke.
4. **`partializeVaultPersist`** called `Object.keys(nodes)` on every store set even for 45k/soak.
5. **Editor** subscribed to the whole `nodes` map and counted notes with `Object.values`.
6. **Graph** ran `collectVaultTags` over the vault on every folder-graph paint; note switch called `.refresh()` on ForceGraph3D.
7. **Empty-query palette** sorted every note by mtime.
8. **Memory FTS** copied the entire posting list for ubiquitous tokens (`retrieval` / `hub` appear in every synthetic note) — 205ms @300k.
9. **Cold open** blocked the workspace on Welcome until FTS finished (~1.7s store).
10. **`createNote`** did not write `settings.lastNotePath`.
11. **Playwright** slept, then PASSed on no `pageerror`.

---

## Fixes on this branch

| Area | Change |
|------|--------|
| `path-patch.ts` | In-place mutate; incremental path lookup via `idOf` |
| `indexes.ts` | Hinted dirty even when the node map is the same object |
| `store.ts` | No clone on stage/create/hydrate/edit; two-stage 45k/soak open (mount then FTS); `lastNotePath` on create |
| `persist-policy.ts` | Skip `Object.keys` when vault is already large/disk; remount ticket from settings |
| Editor / graph / palette | One TipTap instance; no graph refresh on note switch; recents-only empty query; `searchWithBackendAsync` when SQLite exposes it |
| Wikilink / backlinks | Index cached on `structureGeneration`; no O(n) reverse/fuzzy at ≥400 notes |
| Graph exit | Esc returns to backlinks so ForceGraph3D does not remount in the panel |
| Memory FTS | Intersect the rarest posting list and **stop at 800 candidates**; body scan only for the top `limit`. Palette labels this **Memory FTS (capped)**, never SQLite BM25 |
| Large-seed writes | Overlay + remount ticket restore creates/edits; banner **Open a folder** is the daily-driver path |
| Playwright | App-ready vs wait; graph-panel switch p95; long-task + progress probe; non-default reload path + split |
| Disk | `generate-synthetic-vault.mjs` + `bench-disk-vault.mjs` + `wave-e-disk.mjs` |

---

## Disk Wave E (this VM)

Not a Tauri/FSA open. Real files at `/tmp/nexus-wave-e/vault-100000` and `vault-300000` (100,000 / 300,000 `.md` files). Bench then writes another copy under tmp and runs the same generate / structural / path-patch / memory-FTS path desktop uses **after** a native scan.

| Size | folder write | bench write | generate | structural | path-patch20 | FTS rebuild | **search** | RSS | Result |
|------|--------------|-------------|----------|------------|--------------|-------------|----------|-----|--------|
| 100k | 1846ms | 2276ms | 491ms | 1532ms | **0.61ms** | 2366ms | **2.4ms** (was 70ms) | 761MB | OK |
| 300k | 7389ms | 6703ms | 1043ms | 11270ms | **0.22ms** | 8071ms | **2.57ms** (was 205ms) | 2595MB | OK |

300k **search 2.57ms** meets the ≤50ms number for this query on memory FTS **because** we cap intersection at 800 postings. That is not BM25 quality. Ubiquitous tokens (`retrieval hub` is in every synthetic note) used to materialize a 300k `Set` (205ms). Architecture that still cannot do 50ms: ranking every posting, or a full title/path fallback (`MEMORY_FTS_FULL_SCAN_MAX_NOTES = 10_000` — skipped at 300k).

**Linux VM cannot:** File System Access picker (needs a user gesture) or Tauri + SQLite FTS5.

### Wave E checklist — real desktop folder open (Mac / Windows)

Do **not** call this SCALE READY until a human or desktop agent completes the 100k+ open below. Palette heading must read **SQLite FTS5 BM25**, not `Memory FTS (capped)`.

**Generate (either OS, from repo root)**

```bash
# macOS
npm run gen:soak-vault -- --notes 100000 --out ~/nexus-soak-100k
npm run gen:soak-vault -- --notes 300000 --out ~/nexus-soak-300k

# Windows (PowerShell)
npm run gen:soak-vault -- --notes 100000 --out $env:USERPROFILE\nexus-soak-100k
npm run gen:soak-vault -- --notes 300000 --out $env:USERPROFILE\nexus-soak-300k
```

Confirm `SOAK-MANIFEST.json` in the folder: `notes` equals 100000 / 300000.

**Open**

1. `npm run tauri:dev` (signed install is also fine).
2. Welcome → **Open folder** → pick `~/nexus-soak-100k` first, then `~/nexus-soak-300k` (Windows: `%USERPROFILE%\nexus-soak-300k`).
3. Title bar must say **On disk** / **Desktop vault**, never `Test · this browser`.
4. Command palette (`⌘K` / `Ctrl+K`) → type `retrieval hub`. Group heading must include **SQLite FTS5 BM25**. If it says `Memory FTS (capped)`, the native index failed — stop and file that, do not pass Wave E.

**Metrics to capture (write into this report)**

| Metric | How | 100k target | 300k target |
|--------|-----|-------------|-------------|
| Open wall (Welcome → tree+editor interactive) | stopwatch or `__NEXUS_SOAK_LAST__.interactiveMs` | <5s progressive | <8s progressive |
| Open progress | banner walking → indexing → ready | visible, no ≥1s freeze | same |
| Search `retrieval hub` app-ready | palette options visible | ≤50ms SQLite | ≤50ms SQLite |
| `describeSearchEngine().id` | DevTools: `__NEXUS_STRESS__().searchEngine` | `sqlite-fts5-bm25` | `sqlite-fts5-bm25` |
| Create + type + reload | new note still on disk after quit/reopen | present | present |
| Switch 8 notes (graph panel open) | p95 / max | p95 <700ms, max <1s | same |
| RSS / CPU | Activity Monitor / Task Manager | note | note |
| Failures | crash, silent Welcome, lost note, palette freeze | none | none |

Run 100k first. Only then 300k. If 100k search is still `memory-fts-capped`, fix desktop wiring before touching 300k.

---

## Hard ceilings (unchanged product limits)

| Cap | Where | Value |
|-----|-------|-------|
| Persist node map | `PARTIALIZE_NODE_CAP` | **>2500 empties nodes** |
| Large-memory vault IDs | `isLargeMemoryVault` | `large-test-vault-45k` + `soak-vault-*` |
| Graph full notes | `egoGraphMinNotes` / `folderGraphMinNotes` | **400** |
| Folder graph draw | `folderMaxNodes` | **320** orbs |
| Body LRU | `bodyLruSize` | **120** |
| Memory FTS candidates | `MEMORY_FTS_CANDIDATE_CAP` | **800** |
| Memory FTS title fallback | `MEMORY_FTS_FULL_SCAN_MAX_NOTES` | **10_000** |
| Browser overlay | `LARGE_VAULT_OVERLAY_CAP` | **400** notes/folders |
| Unlinked scan | `unlinked-mentions.ts` | 400 notes / 24 hits |
| Native SQLite list | `native-sqlite-index.ts` | `limit: 500_000` |
| Docs | `docs/SCALING.md` | Desktop 300–500k; browser “solid 20–50k” |

---

## Browser overlay (45k / soak seeds)

localStorage still cannot hold the 45k map. Creates and edits on large in-memory seeds go to:

1. **IndexedDB + sync localStorage** (`src/lib/vault/large-vault-overlay.ts`, cap 400)
2. **Remount ticket** (`ScaleRemount.overlay`, last 80 entries, bodies clipped to 20k) — this is what survived a fast Playwright reload when IDB lost the last `put`

Remount reapplies both. Title bar says **Test · this browser**. Banner: writes stay in this browser; **Open a folder** for files that survive across machines. Overlay is not a 300k vault and is not cross-browser. Disk vaults already write markdown; they do not use this overlay.

## What is still not proven

- Tauri/FSA **open** of the generated 100k/300k folder (this VM has no folder grant / no Tauri).
- SQLite FTS5 BM25 at 100k+ (memory FTS is capped-candidate; palette must not be labeled FTS5).
- Overlay surviving a different browser / machine (it will not — by design).
- Desktop 300–500k as a daily driver.

**Largest green N on this VM**

- **UI:** browser 45k common-ops (store open 1.15s / interactive 0.41s; wall 1.79s WARN; overlay remount keeps Soak Created; no ≥1s freeze).
- **Disk generate + memory FTS:** 300k files, search 2.57ms.

Do not ship as the only vault at 45k+ on the strength of one Playwright box. Do not claim SCALE READY until a Mac Tauri open of the 300k folder stays responsive end-to-end.
