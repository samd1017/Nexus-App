# Nexus Desktop (macOS via Tauri 2)

Nexus ships as a local-first web app and a **native Mac shell** powered by [Tauri 2](https://tauri.app).

## What you get

- Real **Nexus.app** window (overlay title bar, native menus)
- **Open Vault…** uses the native folder dialog
- Notes are plain `.md` files on disk (Hermes-compatible)
- **OS-level folder watching** (notify) for external edits, with a slow safety poll
- **On-disk SQLite search index** (disposable cache under app data — not inside the vault)
- Same UI as the browser product (editor, graph, settings, search)

## Requirements (on a Mac)

- macOS 11+
- [Xcode Command Line Tools](https://developer.apple.com/xcode/): `xcode-select --install`
- [Rust](https://rustup.rs/): `curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh`
- Node **22+** (`brew install node`)

## Install & run

```bash
git clone https://github.com/samd1017/Nexus-App.git
cd Nexus-App
npm install
```

### Dev (recommended while fixing UI)

```bash
npm run tauri:dev
```

This runs the **desktop SPA** (not the browser SSR stack) on port 8080 and opens the native window.

### Production app

```bash
npm run tauri:build
open src-tauri/target/release/bundle/macos/Nexus.app
```

DMG (when produced): `src-tauri/target/release/bundle/dmg/`

## Architecture

| Layer | Path |
|--------|------|
| UI | `src/components/*` |
| Browser FS (File System Access) | `src/lib/vault/fs-adapter.ts` |
| Desktop FS (Tauri plugins) | `src/lib/vault/tauri-adapter.ts` |
| On-disk DurableIndex (SQLite FTS5) | `src-tauri/src/durable_index.rs` + `src/lib/vault/native-sqlite-index.ts` |
| OS notify watch | `src-tauri/src/vault_watch.rs` + `startDesktopWatch` |
| Platform detect | `src/lib/platform.ts` |
| Desktop SPA | `desktop/` + `vite.desktop.config.ts` → `dist-desktop/` |
| Native shell | `src-tauri/` |

### Search index location

```
{appDataDir}/indexes/{hash(absolute_vault_root)}.sqlite
```

Markdown remains the source of truth. The SQLite file can be deleted; Nexus rebuilds it on next open.

Browser preview (`npm run dev`) stays separate and does not require Rust.

## Troubleshooting

### Blank window / white screen
1. Quit the app.
2. Run `npm run build:desktop` — must produce `dist-desktop/index.html`.
3. Re-run `npm run tauri:dev` (not only `npm run dev`).
4. Open WebView inspector if needed: set env `WEBKIT_DISABLE_COMPOSITING_MODE=1` only if graphics crash.

### “Permission denied” / empty vault after pick
- Pick a folder under your Home directory first (`~/Documents`, `~/Notes`).
- External volumes under `/Volumes` are allowed; iCloud Desktop & Documents may need re-pick after reboot (persisted-scope should remember dialog grants).

### Search misses after external rename
- Close and reopen the vault (triggers index rebuild), or delete the vault’s file under app data `indexes/`.

### `failed to run custom build command for glib-sys` (Linux only)
Building the **Mac** app requires a **Mac**. Linux can develop the UI but cannot produce `.app`.

### Rust / Xcode errors
```bash
xcode-select --install
rustup update stable
cd src-tauri && cargo clean && cd ..
npm run tauri:build
```
