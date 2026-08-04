# Nexus public beta scope

## Supported
- **Web** (Chrome/Edge folder vault + in-browser demo/local)
- **Desktop (Mac/Win/Linux via Tauri)** — local folder vault, native menu, window state
- Large vaults: meta-only open, lazy bodies, durable FTS, folder/ego graph

## Explicitly not in v1 public
- Mobile Tauri shell polish
- Multiplayer / sync servers
- Full Obsidian plugin parity
- Background bulk indexer UI
- Pinned notes, split editor, 2D mobile graph

## Privacy
- Vault content stays on your disk / browser storage
- No account required for core editing
- No upload of note bodies by default

## Quality gates before release
```bash
npm run typecheck
npm run build
npm run qa:gate
npm run smoke   # with dev server up
```

## Version
Align `package.json`, Settings About (`NEXUS_VERSION`), and `src-tauri/tauri.conf.json`.
