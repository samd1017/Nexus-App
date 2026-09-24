# Nexus Desktop (Tauri 2)

Nexus ships as a local-first web app and a **native desktop shell** powered by [Tauri 2](https://tauri.app) for **macOS** and **Windows**.

## Pre-built Alpha downloads

Unsigned Alpha installers are published on [Releases](https://github.com/samd1017/Nexus-App/releases) when CI finishes.

**These builds are not code-signed or notarized.** That is expected for Alpha.

### macOS (Apple Silicon) — unsigned

1. Download the `.dmg`.
2. Open it and drag Nexus to Applications.
3. First launch: right-click → **Open**, or System Settings → Privacy & Security → **Open Anyway**.
4. Gatekeeper will warn about an unidentified developer. Confirm Open.

### Windows — unsigned

1. Download the NSIS `.exe` installer.
2. If SmartScreen appears (“Windows protected your PC”), click **More info** → **Run anyway**.

### What would be needed for signed installs later

| Platform | What’s required |
|----------|-----------------|
| **macOS** | Apple Developer Program account, Developer ID Application certificate, notarization via `notarytool`, stapling. Secrets in CI: signing identity + Apple ID / app-specific password or API key. |
| **Windows** | Code-signing certificate (EV preferred for fewer SmartScreen prompts), sign the NSIS/MSI in CI. |

Until those are set up, users must approve the OS warnings once.

---

## What you get

- Native window (overlay title bar on macOS, native menus)
- **Open Vault…** uses the native folder dialog
- Notes are plain `.md` files on disk (Hermes-compatible)
- **OS-level folder watching** for external edits
- **On-disk SQLite search index** (disposable cache under app data — not inside the vault)
- Same UI as the browser product (editor, graph, settings, search)

## Requirements (build from source)

### macOS

- macOS 11+
- [Xcode Command Line Tools](https://developer.apple.com/xcode/): `xcode-select --install`
- [Rust](https://rustup.rs/)
- Node **22+**

### Windows

- Windows 10/11
- [Rust](https://rustup.rs/) (MSVC toolchain)
- Node **22+**
- WebView2 (usually already present on recent Windows)

## Install & run from source

```bash
git clone https://github.com/samd1017/Nexus-App.git
cd Nexus-App
npm install
```

### Dev

```bash
npm run tauri:dev
```

### Production build

```bash
npm run tauri:build
```

## Wave E — 100k then 300k (SQLite FTS5 BM25)

Chrome in the browser is **not** this path. Chrome refuses ≥25k. SCALE READY is a **desktop** claim only.

### Build from source (Mac / Windows)

1. Install [Rust](https://rustup.rs/) and Node **22+**.
2. macOS: `xcode-select --install`. Windows: MSVC toolchain + WebView2.
3. `npm install && npm run tauri:dev`
4. Confirm the window is the Tauri shell (not `npm run dev` in Chrome).

### Generate soak vaults

```bash
npm run soak:wave-e-desktop -- --notes 100000
npm run soak:wave-e-desktop -- --notes 300000
```

That writes `~/Documents/nexus-soak-100k` / `~/Documents/nexus-soak-300k` (Windows: `%USERPROFILE%\Documents\…`) if missing, then prints the prove steps. Documents is inside the production `fs:scope` allow-list; a home-dir folder like `%USERPROFILE%\nexus-soak-100k` still works if you open it programmatically — Wave E registers that path with plugin-fs persisted-scope the same way **Open folder** does. Exit code **2** means no Tauri proof was collected — that is intentional. This command is not SCALE READY.

### Prove (must all hold) — honest phases

Cold 100k must **not** wait for every note body to enter FTS before the vault is usable. Obsidian-class first open: tree/editor in seconds; search becomes useful while heads fill in the background.

| Phase | What works | Browse blocked? |
|--------|------------|-----------------|
| `ready-meta` | Tree, open notes, title/path FTS for the open window | No — this is “vault usable”. It does not wait for the rest of the folder listing. |
| `ready-fts-partial` | Titles and note text for the open window. The rest of the titles are still being listed | No |
| `ready-fts` | The open window covered every note (a small vault) | No |

1. Open the folder in `tauri:dev` (Welcome → Open folder), **or** DevTools:

   ```js
   await __NEXUS_SOAK__.runWaveE("~/Documents/nexus-soak-100k")
   ```

2. First paint: tree/editor interactive in seconds. Banner may still say heads are filling. Palette heading includes **SQLite FTS5 BM25** (may append `· titles` / `· heads` until deep FTS finishes). Never `Memory FTS (capped)`.
3. When the banner says title search is on, search a title that is in the open folder. It should hit without waiting for the rest of the vault to be listed. A title in a folder the listing has not reached yet can miss, then hit on its own. Do not expect every Hub in a 100k vault at that moment. After the banner says Ready, open a note, scroll it, open the graph, and search a title that is already listed — those stay responsive while the remaining names are still being listed. `cluster` in a note you have not opened stays missing until you open that note. **Official vault only** (`npm run gen:soak-vault` / `SOAK-MANIFEST.json`). Unofficial Meeting-* folders with `hub_files=0` are a false alarm.
4. Open 20 notes. UI stays responsive.
5. Create a note, reload (or `await __NEXUS_SOAK__.reloadDesktop()`), confirm it is still on disk.

### Drive from the script (Windows WebView2)

```bat
set WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS=--remote-debugging-port=9223
npm run tauri:dev
npm run soak:wave-e-desktop -- --cdp http://127.0.0.1:9223 --vault %USERPROFILE%\Documents\nexus-soak-100k
```

`pass: true` is one automated run. Do **not** claim SCALE READY until a human watches a 100k+ session stay responsive.

### Code path

| Layer | What |
|--------|------|
| Rust | `vault_index_fill_from_disk` is **async** (blocking pool) and **phased**: folders in name order, Hub-named files smallest first (`Hub 0` before later hubs in the same folder), until a first title page (`TITLE_READY_FLUSH`) → **`ready-meta` and `done` / Ready before the rest of the folder is listed** → deep heads for the open window, at most `EAGER_CONTENT_CAP` files. The remaining names are listed afterward and yield between batches. A later fill reads that same window again only where it is still shallow. It does **not** read a body for every remaining note, and it does **not** wait to stat every file before title search is useful. The open page may already have a short peek during the walk, capped once a few hundred notes already have a head. Incremental: skip notes whose path+mtime+size already match at that `fill_depth`. While writing a head it extracts `[[wikilinks]]` into `link_edge`. A warm FTS index filled before that path gets a one-shot backfill from `note_fts` bodies (no JS hydrate). Emits `ready-meta` and `done` together for that first page (`ready-fts-partial`), then `ready-fts-partial` again when the open-window heads land, then `catalog-counted` when the listing finishes. `done` on a large vault stays `ready-fts-partial`: titles plus the notes that were opened. Dedicated writer connection so the UI/search mutex is not held. A second fill for the same DB **joins** the in-flight job (never `already running` as a user-visible failure). UI connections use a 15s busy timeout; close/wipe/rebuild wait out an in-flight fill. PASSIVE WAL checkpoint only (no TRUNCATE). IDs via `desk_node_id`. `vault_index_list_links` returns grouped edges for the JS link index. Opening a note after Ready writes that note's deep head into SQLite. |
| JS | `fillFromDisk({ settleAtPhase: "meta" })` returns when the title window is live (`ready-meta`), not after the folder has been listed. Tree/editor do not wait for body FTS or for the rest of the names. Command palette treats `ready-meta` as title search live — empty results are not “try again when Ready” while heads fill. The invoke stays single-flight per DB — a remount joins the leader instead of painting a red banner. Ready is the open window: later title batches do not put the banner back on a folder listing. When that listing finishes, the note count updates. After heads land, `listLinkGroups` seeds `vaultLinkIndex` so Graph → Links works without opening every note. Reopening the same desktop root reuses the live SQLite adapter (does not close mid-fill). Desktop does **not** fall back to a JS 100k head walk if native fill fails. |
| Soak (DEV) | `__NEXUS_SOAK__.openDesktop(absPath)` / `runWaveE(absPath)` — registers `vault_register_root` (plugin-fs persisted-scope) before scan. `searchReady` means **ready-meta** (vault usable), not “100k bodies indexed”. `runWaveE` polls hub/cluster until short-head FTS is useful. `forceRebuild: true` re-reads heads in the background. Throws if fill errors. `__NEXUS_SOAK_LAST__.linkEdges` reports persisted wikilink count. |
| Tests | `npm run test:sqlite-fill` (banner/phase/settle + join/Open-gate rules). `npm run test:sqlite-fill-rust` (phased fill + 1k/10k timing + wikilink `link_edge` + in-flight join; GTK-free crate). `npm run test:first-open`. `npm run test:link-index` + `test:graph-empty` + `test:tree-expand`. |

**Fill expectations (not SCALE READY):**

- Cold 100k: tree/editor in **seconds**. `Hub 0` (in `00-Inbox`) should be searchable in that same band, before later folders are listed. The first page stays that size on a larger folder: Ready stops reading a fat folder once that page is in hand (it does not read every name there first), it does not stat every file in that folder, and it does not snapshot the catalog. The banner should say Ready with the open page, and it must not show the full note count at 100%. Reopening a catalog that already has a stored total does not count every row before that page, and it does not turn that reopen into a folder-permission error. The remaining names keep listing in the background in small batches that yield, with a checkpoint so the journal does not grow with the vault, and must not block open, scroll, graph, or title search. Reopening a vault whose titles are already searchable announces that page before it reads the folder again. Opening the index does not replay a journal larger than a checkpoint already saved in the database file; the fill catches up after the page. When that page was already searchable, Ready is the saved page and does not wait for the database file to open again. That page is drawn before the rest of the app finishes loading. Reopening draws that page as soon as the window has it, before the rest of the app is fetched. The time until the window appears is separate from Ready. Ready on that reopen is the saved page, as soon as the document has it. If the folder cannot be read, that page stays up. The next open keeps that page when the window was able to save it. That includes the open that runs when the app starts, and a second open while the index is still opening in the background. The index file itself opens off the webview thread. The first launch after an upgrade, before that page is saved, still shows the first folder page from disk and does not open a large index file to paint it. That page stops after one bucket of names, so a flat folder of hundreds of thousands of files does not delay it, and Hub 0 is included when that file is there. A stored note total beside the index replaces the page count without opening the database. A filled vault does not list the folder again, rewrite names, or check every saved path after Ready. It also does not open a second writer or turn WAL mode on again, which would checkpoint the whole index. If the catalog cannot be read, Ready does not fall back to listing every file. Opening one note indexes that note. Titles on that page answer a search immediately. After Ready, a vault that is not filled yet still lists names in batches of 16 that commit and yield. A full-index merge and title/path index build do not run in front of the first keystroke. An empty title search after Ready is a miss, not a notice that search is still filling. A title the listing has not reached yet is missing until that batch lands. A body word in a note you have not opened stays missing until you open it. Do **not** claim SCALE READY from one soak.
- A vault under Documents, Desktop, or Downloads is readable on every launch. Any other path is granted when that folder is opened, and the grant is repeated if the first read is refused. A soak folder outside those three (for example under `/workspace`) can still be refused after a relaunch when the desktop sandbox does not keep that grant; put that soak folder under Documents if the refusal remains.
- Fill-harness timings (not a desktop window). Cancel at the first Ready page. A catalog already holding 500,000 rows: 2 ms empty vs 4 ms crowded, page still Hub 0 and at most 32 titles. Official shape (the soak layout, first bucket is a slice of the vault): 8,000 files 2 ms, 80,000 files 2 ms. That is the stand-in for a half-million-note official vault; a half-million-file tree was not opened. The first bucket of that vault is a few thousand names, inside the flat-directory stand-in above. One flat directory: 2,000 names and 40,000 names both reach Ready in 2 ms (Hub 0, first page only). Previously the 40,000-name folder took 88 ms because every name was read first. Background listing still visits every file afterward.
- Re-open of the same unchanged 100k vault: **seconds** (stat + skip), not another hour.
- Do not claim SCALE READY from this first-open architecture alone.
| FS scope | Production capabilities allow Documents / Desktop / Downloads + app data. Programmatic path open grants that folder only (not `$HOME/**`). Forbidden reads fail the progress banner — they do not spin at scanned:0. |

Outputs (typical paths):

- macOS: `src-tauri/target/release/bundle/macos/Nexus.app` and `.../dmg/*.dmg`
- Windows: `src-tauri/target/release/bundle/nsis/*.exe`

## Architecture

| Layer | Path |
|--------|------|
| UI | `src/components/*` |
| Browser FS (File System Access) | `src/lib/vault/fs-adapter.ts` |
| Desktop FS (Tauri plugins) | `src/lib/vault/tauri-adapter.ts` |
| On-disk DurableIndex (SQLite FTS5) | `src-tauri/src/durable_index.rs` + `src/lib/vault/native-sqlite-index.ts` |
| OS notify watch | `src-tauri/src/vault_watch.rs` |
| Platform detect | `src/lib/platform.ts` |
| Desktop SPA | `desktop/` + `vite.desktop.config.ts` → `dist-desktop/` |
| Native shell | `src-tauri/` |

### Search index location

```
{appDataDir}/indexes/{hash(absolute_vault_root)}.sqlite
```

Markdown remains the source of truth. The SQLite file can be deleted; Nexus rebuilds it on next open.

Browser preview (`npm run dev`) stays separate and does not require Rust.

## CI builds

GitHub Actions workflow: `.github/workflows/build-desktop.yml`

- Triggers: new GitHub Release, or manual **Run workflow**
- Produces macOS Apple Silicon `.dmg` and Windows NSIS `.exe`
- Attaches assets to a **draft pre-release** (Alpha)

## Troubleshooting

### Blank window / white screen
1. Quit the app.
2. Run `npm run build:desktop` — must produce `dist-desktop/index.html`.
3. Re-run `npm run tauri:dev` (not only `npm run dev`).

### “Permission denied” / empty vault after pick
- Prefer a folder under your home directory first.

### Search misses after external rename
- Close and reopen the vault, or delete the vault’s index under app data `indexes/`.

### Building on the wrong OS
- A **Mac** is required to produce `.app` / `.dmg`.
- **Windows** is required to produce the NSIS installer locally (CI uses `windows-latest`).
