# Scale soak report

**SHA under test:** this branch (Wave E desktop runner + DEV-only force-large + blunt refuse), vs baseline **`907d8ea`**.
**Verdict: not SCALE READY.** Chrome 100k is refused. A real Nexus Desktop (Tauri) open of 100k+ with **SQLite FTS5 BM25** has not been proven. Do not claim SCALE READY until that exists.

### Box GUI verified PASS on tip `09b2534` (Chrome only)

| Folder | Result |
|--------|--------|
| 100k real FSA | Refuse card shown. No Ready. No discard. **PASS** for the honesty gate — not an open. |
| 20k real FSA | Ready, `cluster` hits, 10+ opens, On disk, warn banner at 20k. **PASS** for the Chrome bar. |

That is **not** SCALE READY and **not** a 100k desktop proof. Later tips (`2f202d3`+) add copy/LRU/native fill and this Wave E runner; re-verify Chrome refuse + 20k on those tips if the box is available.

### Supported N (honest)

| Surface | Max N | Behavior |
|---------|-------|----------|
| **Chrome / Edge (File System Access)** | **20,000 notes** | Supported daily-driver bar: 20 opens + search, no tab discard. **Warn at 15,000.** **Refuse at 25,000** — we will not open it. Same markdown folder belongs in **Nexus Desktop**. |
| In-browser 45k test vault | 45,000 (overlay) | QA only. Title bar: `Test · this browser`. Not files. |
| **Nexus Desktop (Tauri)** | **100k then 300k** (north star 300–500k) | SQLite FTS5 BM25. Palette must say **SQLite FTS5 BM25**. Same folder as Obsidian. |

**Refuse (Chrome ≥25k):** Welcome card `data-chrome-fsa-refused` — Chrome will kill the tab; Desktop is required; Chrome max is ~20k, not a lifetime Obsidian archive. Saved handle is cleared. Walk aborts so we do not allocate 100k nodes first. `?forceLargeFsa` / `nexus-force-large-fsa=1` works **only in DEV** and pops a scary `window.confirm`. Production ignores both.

**Desktop north star:** `~/Documents/nexus-soak-100k` then `~/Documents/nexus-soak-300k` via `npm run tauri:dev`. Native fill is **phased** (title/path catalog → short heads → 8k heads). Cold open must paint the tree in seconds (`ready-meta`); full body FTS is background. Incremental skip on reopen. Live progress. Programmatic Wave E open registers the folder with plugin-fs persisted-scope (same as dialog). Not proven on this Linux VM.

Real Chrome FSA of a 100k folder:

| Tip | Result |
|-----|--------|
| `d68b055` | `cluster` 16, Ready 100,002, **11 notes**, discard on 12th search |
| `024c28a` | `cluster` 16 before and after reopen, **7 notes**, discard while opening note 8 (`Brief-02800-z66`). Box 15GB RAM / ~9GB free. Chrome ~1.8GB RSS + renderer ~1.8GB. Flaky and worse. |

**`hub` → 0 hits on the unofficial one-off folder is a FALSE ALARM.** That vault was written by `/workspace/gen-soak-vault.mjs` (not in this repo) with **zero `hub` tokens**. Official generators emit Hub + `Cluster hub`. Probe unofficial folders with **`cluster` only**.

This SHA does not claim 100k Chrome works. It (A) logs `jsHeapUsedMb` after every note open (`[nexus-heap]` / `__NEXUS_STRESS__().heapLog`), (B) **refuses Open folder at ≥25k** in Chrome (“use desktop/Tauri”), (C) caps the file-tree flatten at 2400 and accordion-expands at ≥400 notes, and **stops FSA signature poll / FileSystemObserver rescans above 4k** (the likely note-8 discard: every open re-walked the vault). DEV-only override: `?forceLargeFsa` or `localStorage nexus-force-large-fsa=1` plus a scary confirm. Production cannot force a 25k+ Chrome open.

**Do not PASS 100k FSA on mock-800 or mock-20k.** Mock-20k (`npm run soak:fsa-20k`) is the in-browser FSA-path stand-in. Real folder: `scripts/stress-fsa-cdp.mjs` after attaching Chrome on port 9222.

I would not trust this as my only vault at 300k. Browser 45k common-ops are green on this VM. Disk generate + memory FTS through 300k is not a Tauri/FSA mount and not SQLite BM25.

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
npm run gen:soak-vault -- --notes 100000 --out ~/Documents/nexus-soak-100k
npm run gen:soak-vault -- --notes 300000 --out ~/Documents/nexus-soak-300k

# Windows (PowerShell)
npm run gen:soak-vault -- --notes 100000 --out $env:USERPROFILE\Documents\nexus-soak-100k
npm run gen:soak-vault -- --notes 300000 --out $env:USERPROFILE\Documents\nexus-soak-300k
```

Confirm `SOAK-MANIFEST.json` in the folder: `notes` equals 100000 / 300000.

**Open (or automate)**

```bash
# Generates ~/Documents/nexus-soak-100k if needed and prints Mac/Windows steps.
# Exit 2 unless a Tauri CDP session actually ran — this is not SCALE READY.
npm run soak:wave-e-desktop -- --notes 100000
npm run soak:wave-e-desktop -- --notes 300000

# Windows: drive the live Tauri webview
set WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS=--remote-debugging-port=9223
npm run tauri:dev
npm run soak:wave-e-desktop -- --cdp http://127.0.0.1:9223 --vault %USERPROFILE%\Documents\nexus-soak-100k
```

1. `npm run tauri:dev` (a local unsigned `npm run tauri:build` is also fine; there is no signed installer).
2. Welcome → **Open folder** → pick `~/Documents/nexus-soak-100k` first, then `~/Documents/nexus-soak-300k` (Windows: `%USERPROFILE%\Documents\nexus-soak-300k`).
   Or DevTools (DEV build): `await __NEXUS_SOAK__.runWaveE("/Users/you/Documents/nexus-soak-100k")`.
   A home-dir path such as `C:\Users\you\nexus-soak-100k` is still valid: programmatic open grants that folder on persisted-scope before scan. Forbidden reads fail the progress banner.
3. Title bar must say **On disk** / **Desktop vault**, never `Test · this browser`.
4. Command palette (`⌘K` / `Ctrl+K`) → type `retrieval hub`. Group heading must include **SQLite FTS5 BM25**. If it says `Memory FTS (capped)`, the native index failed — stop and file that, do not pass Wave E.

**Metrics to capture (write into this report)**

| Metric | How | 100k target | 300k target |
|--------|-----|-------------|-------------|
| Open wall (Welcome → tree+editor interactive) | stopwatch or `runWaveE.openMs` (`ready-meta`) | <3s (100k target) | <5s progressive |
| Open progress | walking → ready-meta → heads in background | live scanned/total; never a browse gate on 8k FTS | same |
| Search `retrieval hub` useful | `runWaveE.searchUsefulMs` (short-head / poll) | <15s first useful; then ≤50ms SQLite | same |
| `describeSearchEngine().id` | DevTools: `__NEXUS_STRESS__().searchEngine` | `sqlite-fts5-bm25` | `sqlite-fts5-bm25` |
| Create + type + reload | new note still on disk after quit/reopen | present | present |
| Switch 8 notes (graph panel open) | p95 / max | p95 <700ms, max <1s | same |
| RSS / CPU | Activity Monitor / Task Manager | note | note |
| Failures | crash, silent Welcome, lost note, palette freeze | none | none |

Run 100k first. Only then 300k. If 100k search is still `memory-fts-capped`, fix desktop wiring before touching 300k.

### Wave E code path (desktop open / index)

Closed on this SHA (needs a Mac/Windows Tauri run to prove):

| Gap | Fix |
|-----|-----|
| JS `fillDurableIndexFromReader` + per-note `vault_index_upsert` at 100k–300k | Desktop skips JS fill when SQLite is open; **`vault_index_fill_from_disk`** walks `.md` in Rust |
| Sync fill froze WebView ~1h at `scanned: 0` (100k already in SQLite) | Async blocking-pool fill + `vault-index-progress`; incremental path+mtime+size skip; no JS fallback on native failure |
| Cold open waited on full 8k-head FTS of 100k notes | **Meta-first:** `ready-meta` settles open; short heads then 8k heads in background; Wave E does not require `ready-fts` for a basic pass |
| `vault_index_list` hydrated 300k FTS rows into the JS mirror | `openNative` no longer hydrates the mirror; palette uses `searchFtsAsync` |
| `maybeSyncDurableIndex` reconciled every meta row over IPC | Skipped when `getDurableIndex().kind === "sqlite"` |
| Desktop watch safety poll re-walked 100k signatures | No signature poll above 10k when native OS notify is live |
| Progress banner said “not SQLite” on desktop | “indexing SQLite FTS5 from disk” → **Ready · SQLite FTS5 BM25** |
| No desktop soak hook / Mac-Windows runner | `__NEXUS_SOAK__.openDesktop` / `runWaveE` (DEV+Tauri) + `npm run soak:wave-e-desktop` |
| Programmatic path open skipped plugin-fs persisted-scope (`$HOME/nexus-soak-N` forbidden) | `vault_register_root` calls `fs_scope.allow_directory` (dialog-equivalent) before scan/index; soak default is `Documents/nexus-soak-N`; forbidden reads fail the progress banner |
| `desk_node_id` vs TS `deskNodeId` (Windows `\\`) | Shared `desk-node-id.ts`; Rust normalizes `\\` → `/`; `npm run test:desk-node-id` |
| `?forceLargeFsa` in production | DEV-only + scary confirm. Production ignores query and localStorage |

Still unproven / remaining:

| Gap | Owner |
|-----|-------|
| Real Tauri open of 100k then 300k with `describeSearchEngine().id === sqlite-fts5-bm25` | Human / desktop agent on Mac or Windows |
| `cargo check` / Rust fill compile on this Linux VM | Missing crates (`bitflags` / notify). Compile on the desktop machine. |
| First-open fill wall at 300k (deep 8k-head FTS) | Background only. Tree must be interactive at `ready-meta` (seconds). Reopen of an unchanged vault should be seconds (incremental skip). Not SCALE READY. |
| Windows path separators vs POSIX rel paths | Contract test exists; confirm on a real NTFS vault |
| Signed / notarized install (Wave D) | Release ops |

---

## Hard ceilings (unchanged product limits)

| Cap | Where | Value |
|-----|-------|-------|
| Persist node map | `PARTIALIZE_NODE_CAP` | **>2500 empties nodes** |
| Large-memory vault IDs | `isLargeMemoryVault` | `large-test-vault-45k` + `soak-vault-*` |
| Graph full notes | `egoGraphMinNotes` / `folderGraphMinNotes` | **400** |
| Folder graph draw | `folderMaxNodes` | **320** orbs |
| Body LRU | `bodyLruSize` / `bodyLruMax()` | **120** default; **16** at ≥400 notes; **8** at ≥20k |
| Memory FTS candidates | `MEMORY_FTS_CANDIDATE_CAP` | **800** |
| Memory FTS postings per token | `MEMORY_FTS_POSTING_CAP` | **800** |
| Memory FTS inv keys | `MEMORY_FTS_INV_TOKEN_CAP` | **12_000** (drop unique keys first) |
| Slim tokens | `tokenize(..., { slim })` | length ≥ 3 and no digits (`hub`/`cluster` stay; `10949`/`1oo` drop) |
| Memory FTS title fallback | `MEMORY_FTS_FULL_SCAN_MAX_NOTES` | **10_000** |
| FSA watch full `lastScan` | `WATCH_RETAIN_SCAN_MAX` | **10_000** (above: signatures only) |
| Chrome FSA watch poll | `CHROME_FSA_WATCH_MAX` | **4_000** (no signature poll / observer rescan) |
| Chrome FSA getFile during meta | `CHROME_FSA_GETFILE_MAX` | **4_000** |
| Chrome FSA supported max | `CHROME_FSA_SUPPORTED_MAX` | **20_000** |
| Chrome FSA warn / refuse | `CHROME_FSA_NOTE_WARN` / `CAP` | **15_000** / **25_000** |
| File-tree flatten | `TREE_FLAT_CAP` | **2_400** (virtualizer mounts ~30) |
| TipTap undo | `StarterKit.undoRedo.depth` | **2** |
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

## FSA 100k (Grok Bot Linux box, `907d8ea`)

| Fact | Result |
|------|--------|
| Vault | `/workspace/nexus-soak-100k` (100k `.md`) |
| Open | Real Chrome FSA picker. Title: **On disk / Local folder · live watch** |
| Metadata | Ready ~100,408 items in ~20–30s; could open a note |
| Search `hub` | **No hits** — only “Create note: hub” |
| Palette engine | **Hidden** (heading only rendered when hits > 0) |
| Memory | Chrome discarded the tab twice; reopen recent restored |

Root cause on current mainline too: `loadDiskVaultScan` marked Ready after a **meta-only** walk. DurableIndex then had title/path tokens only. `hub` lives in file bodies (`Cluster hub`). Palette hid the engine label when there were zero hits.

Fix on this branch: `completeDiskSearchIndex()` reads a 2k file head, tokens it, stores an 180-char snippet, drops the string. Ready waits for that pass. Palette always shows `data-search-engine` + heading. Empty index says “still reading files”.

Prove (this SHA):

| Run | Notes | Fill | Search `hub`/`cluster` | Engine | Memory | Result |
|-----|-------|------|------------------------|--------|--------|--------|
| `npm run test:disk-fts` | 400 + 1200 cap | 9ms | 16 / 16; rare token 16; `largestPosting=800`, `noteTokenSets=0` | memory-fts-capped | — | PASS |
| `npm run soak:disk-fts -- --notes 2000` | 2000 | 44ms | 16 / 16 | memory-fts-capped | RSS **95MB** (was 107) | PASS |
| `npm run soak:disk-fts -- --notes 10000` | 10000 | 165ms | 16 / 16 | memory-fts-capped | RSS **142MB** (was 175); posting 800; slim 10000 | PASS |
| `npm run soak:fsa` Playwright mock FSA | 800 | open 55ms | 16 / 16 after **20 note opens** | `memory-fts-capped` | heap **42MB** / 4096; bodies **20**; tab not discarded | PASS |

`cluster` is body-only. Before fill it is 0 hits; after file-head fill it hits. Store keeps LRU bodies only (20 after the mock open-20 probe). That is the memory path 100k FSA must use.

```bash
npm run test:disk-fts
npm run soak:disk-fts -- --notes 2000
npm run soak:fsa -- http://127.0.0.1:8080/ --notes 800
npm run soak:fsa-open -- http://127.0.0.1:8080/ --notes 800 --opens 20
npm run soak:fsa-20k --   # in-page mock 20k + 20 opens. Not a real picker.
npm run soak:fsa-cdp --   # attach Chrome :9222 after a human picks the folder
```

### Chrome FSA honesty + CDP

| Size | Chrome behavior |
|------|-----------------|
| &lt;15k | Open normally. Watch poll only below 4k. |
| 15k–24,999 | Open + amber banner. Prefer desktop. |
| ≥25k | **Refuse.** Clear the saved handle. Welcome card `data-chrome-fsa-refused`. No silent OOM. |
| Force | DEV only: `?forceLargeFsa` or `localStorage.nexus-force-large-fsa=1` plus a scary confirm. Production ignores both. |

Playwright cannot drive `showDirectoryPicker` for `/workspace/nexus-soak-100k`. Attach a real Chrome:

```
google-chrome --remote-debugging-port=9222 --enable-precise-memory-info --user-data-dir=/tmp/nexus-fsa-cdp
# Open Nexus, pick the folder (or confirm the refuse card)
node scripts/stress-fsa-cdp.mjs http://127.0.0.1:9222 --opens 20
```

`__NEXUS_STRESS__()` includes `heapLog`, `jsHeapUsedMb`, `treeFlatRows`, `chromeFsaLimit`. Each `setActiveNote` prints `[nexus-heap] open:<path> heap=…MB`.

## Soak probe words

| Vault | Generator | Probe |
|-------|-----------|-------|
| Official (`SOAK-MANIFEST.json` from this repo) | `npm run gen:soak-vault` → `scripts/generate-synthetic-vault.mjs` (alias `scripts/gen-soak-vault.mjs`) | **`hub`**, **`cluster`** (every body has `Cluster hub`; Hub titles every 200 notes). `retrieval` is a rotating topic. Wave E desktop query: `retrieval hub`. |
| One-off `/workspace/nexus-soak-100k` on the Grok box | `/workspace/gen-soak-vault.mjs` (**not in repo**); names like `Meeting-10949-1oo` | **`cluster` only.** `rg` hub_files=0. Do not treat a `hub` miss as an engine bug. |

Regenerate unofficial folders with `npm run gen:soak-vault -- --notes 100000 --out ~/Documents/nexus-soak-100k` so `hub` and `cluster` both hit.

## 100k FSA memory (why the tab discarded)

Opening one note after Ready was the last straw. Baseline heap was already huge:

| Retainer | Before | This SHA |
|----------|--------|----------|
| DurableIndex postings | ubiquitous tokens → Set of 100k ids | **`MEMORY_FTS_POSTING_CAP` 800**; search uses rare (complete) lists first |
| Unique Meeting-* tokens | `10949` / `1oo` → 100k size-1 Sets | slim tokenize drops digits; compact drops leftover unique keys over 12k |
| Open note fattens FTS | 4000-char snippet + `noteTokens` | **no FTS upsert on hydrate** when slimNotes > 400 |
| Palette double search | sync + async intersect on every keystroke | async-only when DurableIndex is ready |
| Body LRU | 120 (never evicted in 11 opens) | **16** at ≥400 notes, **8** at ≥20k |
| TipTap `undoRedo` | depth 24 (default was 100) | **depth 2** |
| `noteTokens` + snippets × 100k | two fat maps | slim fill: **no per-note token Set, no snippet** |
| `VaultWatcher.lastScan` | second 100k node map | signatures only above 10k |
| `indexed-search` | second inverted index | skipped while DurableIndex is ready |
| Full in-memory FTS at 100k | still required for `cluster` hits today | **not SQLite wasm**. Tradeoff: numeric / unique-id search may miss. Desktop Tauri + FTS5 remains the 300k path. |
| Store file map / structural index | still 100k meta nodes | unchanged |

`__NEXUS_STRESS__()` now reports `jsHeapUsedMb`, `ftsLargestPosting`, `ftsNoteTokenSets`, `ftsSlimNotes`.

## What is still not proven

- Chrome **refuse card** on a real ≥25k / 100k folder (Grok Bot on the Linux box).
- Real Chrome FSA **≤20k** folder: 20 opens, no discard, `cluster` hits (Grok Bot).
- Tauri open of `~/Documents/nexus-soak-100k` then `~/Documents/nexus-soak-300k` with SQLite FTS5 BM25. **Required for SCALE READY.**
- Overlay surviving a different browser / machine (it will not — by design).
- Desktop 300–500k as a daily driver.

**Largest green N on this VM**

- **UI:** browser 45k common-ops (store open 1.15s / interactive 0.41s; wall 1.79s WARN; overlay remount keeps Soak Created; no ≥1s freeze).
- **Disk generate + memory FTS:** 300k files, search 2.57ms.
- **Disk file-head FTS (this SHA):** 10k fill 165ms / search 3ms / RSS **142MB** (was 175); slim fill `noteTokenSets=0`, `largestPosting=800`.
- **Playwright mock FSA 800:** `soak:fsa-open` 20 opens. Not a 100k picker. Do not treat as PASS.
- **Playwright mock FSA 20k (`npm run soak:fsa-20k`):** 20 opens, no discard, `cluster` 16 every step, heap **90→85MB** (max 116), LRU **bodiesLoaded plateau 8**, graph **hidden**, tree flatten **170**, chromeFsaLimit **warn**. In-page mock (in-memory heads). **Not a real directory picker. Not 100k PASS.**
- **CDP real FSA:** `soak:fsa-cdp` skipped here (nothing on :9222). Still required for a real-folder verdict.
- **Real 100k FSA on `d68b055`:** `cluster` 16, Ready 100,002, **11 notes then discard on 12th search**. Not PASS.
- **Real 100k FSA on `024c28a`:** opened **7**, discard on note **8**. Not PASS. Worse/flaky.
- **Real 100k FSA after this SHA:** Chrome must **refuse** at ≥25k unless forced. Forced 100k is still not a daily driver. Not PASS.

Do not ship as the only vault at 45k+ on the strength of one Playwright box. **Do not claim SCALE READY without a desktop Tauri 100k+ open whose palette heading is SQLite FTS5 BM25.** Chrome 100k is refused, not supported.
