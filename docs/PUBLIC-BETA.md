# Nexus public beta scope

## Supported
- **Web** (Chrome/Edge folder vault + in-browser demo/local)
- **Desktop (Mac/Win/Linux via Tauri)** — local folder vault, native menu, window state
- Large vaults: meta-only open, lazy bodies, durable FTS, folder/ego graph
- Heading/block wikilinks and embeds, dual-note workspace, attachments rail, note history
- Lexical hybrid search + extractive Ask-your-notes (citations; no cloud LLM)
- Pulse + Conflict Studio for humans and external agents on the same folder

## Explicitly not in v1 public
- Mobile Tauri shell polish
- Multiplayer / sync servers
- Full Obsidian plugin parity
- Semantic embedding index (vector rerank)
- Signed / notarized installers (unsigned Alpha only)
- Background bulk indexer UI
- 2D mobile graph

## Privacy
- Vault content stays on your disk / browser storage
- No account required for core editing
- No upload of note bodies by default
- Ask-your-notes is extractive and local (no model API)

## Quality gates before release
```bash
npm run typecheck
npm run build
npm run qa:gate
npm run smoke   # with dev server up
```

## Version
Align `package.json`, Settings About (`NEXUS_VERSION`), and `src-tauri/tauri.conf.json`.
Desktop release workflow reads the version from `package.json` (do not hardcode tags).

## Installers

The primary desktop path is **build from source** — see [DESKTOP.md](../DESKTOP.md).

Unsigned installer assets (not notarized / not code-signed) exist on **[`v0.1.0-alpha`](https://github.com/samd1017/Nexus-App/releases/tag/v0.1.0-alpha) only**: `Nexus_0.1.0_aarch64.dmg` and `Nexus_0.1.0_x64-setup.exe`. They are not on Latest and not on `v0.1.1-alpha` (source checkpoint, zero DMG/EXE). Do not point anyone at `/releases/latest` expecting installers. Files on the older `v0.1.0-alpha` tag whose names contain `0.1.1` are not Latest.
