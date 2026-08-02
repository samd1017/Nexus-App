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
- [Xcode Command Line Tools](https://developer.apple.com/xcode/)
- [Rust](https://rustup.rs/) (`rustup default stable`)
- Node 22+

## Develop

```bash
npm install
npm run tauri:dev
```

This starts the Vite dev server on port 8080 and opens the Tauri window.

## Build Nexus.app

```bash
npm run tauri:build
```

Artifacts land under:

- `src-tauri/target/release/bundle/macos/Nexus.app`
- `src-tauri/target/release/bundle/dmg/` (if DMG enabled)

## Architecture

| Layer | Path |
|--------|------|
| UI | `src/components/*` |
| Browser FS (File System Access) | `src/lib/vault/fs-adapter.ts` |
| Desktop FS (Tauri plugins) | `src/lib/vault/tauri-adapter.ts` |
| Platform detect | `src/lib/platform.ts` |
| Desktop SPA build | `vite.desktop.config.ts` → `dist-desktop/` |
| Native shell | `src-tauri/` |

Browser preview (`npm run dev`) stays on **0.0.0.0:8080** and does not require Rust.

## Notes

- Building a signed Mac app must happen **on macOS** (or CI with macOS runners).
- Linux/Windows builds are possible with the same tree; this product targets Mac first.
- Optional cloud OAuth remains unused by default; desktop vaults are pure folders.
