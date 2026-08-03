# Nexus Desktop (macOS via Tauri 2)

Nexus ships as a local-first web app and a **native Mac shell** powered by [Tauri 2](https://tauri.app).

## What you get

- Real **Nexus.app** window (overlay title bar, native menus)
- **Open Vault…** uses the native folder dialog
- Notes are plain `.md` files on disk (Hermes-compatible)
- Live folder polling for external edits
- Same UI as the browser product (editor, graph, settings, search)

## Requirements (on a Mac)

- macOS 11+
- [Xcode Command Line Tools](https://developer.apple.com/xcode/): `xcode-select --install`
- [Rust](https://rustup.rs/): `curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh`
- Node **22+** (`brew install node`)

## Install & run

```bash
git clone https://github.com/samd1017/cinder-apple-pine-blend.git
cd cinder-apple-pine-blend
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
| Platform detect | `src/lib/platform.ts` |
| Desktop SPA | `desktop/` + `vite.desktop.config.ts` → `dist-desktop/` |
| Native shell | `src-tauri/` |

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

### `failed to run custom build command for glib-sys` (Linux only)
Building the **Mac** app requires a **Mac**. Linux can develop the UI but cannot produce `.app`.

### Rust / Xcode errors
```bash
xcode-select --install
rustup update stable
cd src-tauri && cargo clean && cd ..
npm run tauri:build
```

### Port 8080 already in use
```bash
lsof -i :8080
kill <pid>
npm run tauri:dev
```

### Gatekeeper blocks Nexus.app
Right-click → **Open**, or **System Settings → Privacy & Security → Open Anyway**.

## Scripts

| Script | Purpose |
|--------|---------|
| `npm run dev` | Browser live preview (SSR stack) |
| `npm run dev:desktop` | Desktop SPA only (used by Tauri dev) |
| `npm run build:desktop` | Static SPA for Tauri bundle |
| `npm run tauri:dev` | Native window + desktop SPA HMR |
| `npm run tauri:build` | Release `.app` / DMG |
