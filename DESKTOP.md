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
