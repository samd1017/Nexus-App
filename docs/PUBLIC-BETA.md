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
Do not claim a download exists unless that release tag has DMG/EXE assets. `v0.1.1-alpha` is a source checkpoint. Build from source via `DESKTOP.md` when assets are missing.
