# Nexus

**Local-first Markdown knowledge vault built for retrieval.**

Nexus is a notes app where the primary experience is finding the right note quickly — even in large vaults — with plain Markdown files as the only source of truth.

```
Markdown on disk  →  disposable SQLite FTS index  →  hybrid ranking (goal)
```

Writing, the 3D graph, and the visual design matter. Ranking quality and grounded retrieval matter more.

---

## Vision

A user types a half-remembered phrase or a natural-language question and receives the correct note(s) ranked highly, with clear provenance, quickly, even on vaults of 100k–500k notes.

Everything else (editor, graph, command palette) supports that core loop.

---

## Status (honest)

**What works well today**
- Local-first Markdown vault (plain `.md` files)
- TipTap visual editor with full Markdown round-trip
- Live 3D force-directed knowledge graph
- Tauri 2 desktop shell (macOS + Windows) + web mode via File System Access API
- Durable SQLite FTS5 index (disposable, lives outside the vault)
- Command palette, backlinks, large-test-vault stress tooling

**What is still early**
- Hybrid ranking (lexical + semantic) is the current north star, not yet production-quality
- Grounded “Ask your notes” with reliable citations is planned, not finished
- Scale targets of 100k–500k notes are being pursued; real-disk proof at those sizes is still in progress
- No public release / notarized desktop package yet

This project was created by a non-professional developer directing AI tools (primarily Grok). It is intentionally open so others can inspect, use, and improve it. Contributions and hard feedback are welcome.

---

## Architecture overview

| Layer | Role |
|-------|------|
| **Markdown files on disk** | Only source of truth. Hermes-compatible. No proprietary format. |
| **DurableIndex (SQLite FTS5)** | Disposable search index. Lives outside the vault under app data. Can be wiped and rebuilt. |
| **In-memory graph** | Backlinks, structure, 3D view. |
| **Hybrid ranking (goal)** | Lexical (FTS5 + BM25 + title/path boosts) + semantic (local embeddings) + structural signals. |

Desktop path uses Tauri `plugin-fs` + native folder watching.  
Browser path uses the File System Access API.

See `docs/SCALING.md` for the current scaling plan and DurableIndex contract.

---

## Features

- **Local-first** — Zero accounts. Notes are plain files you control.
- **Visual editor** — TipTap with Markdown fidelity.
- **3D knowledge graph** — Force-directed view of notes, folders, and links.
- **Native desktop** — Tauri 2 (macOS + Windows).
- **Web mode** — File System Access API.
- **Search** — SQLite FTS5 + in-memory graph.
- **Command palette** — Fast navigation and actions.
- **Large test vault** — Included under `public/large-test-vault/` for stress testing.

---

## Quick start

### Web (browser)

```bash
git clone https://github.com/samd1017/Nexus-App.git
cd Nexus-App
npm install
npm run dev
```

Open the URL Vite prints (usually `http://localhost:8080`).

### Desktop (Tauri)

See [DESKTOP.md](DESKTOP.md) for requirements (Rust, Xcode CLT on macOS, Node 22+).

```bash
npm install
npm run tauri:dev      # development
npm run tauri:build    # production build
```

---

## Design system

SpaceX-instrument / metallic steel panels with controlled cyan accent.

| Token | Value | Role |
|-------|-------|------|
| Accent | `#00c8ff` | Primary cyan |
| Deepest BG | `#050507` | App background |
| Primary BG | `#0f0f12` | Panels |
| Text | `#f2f2f7` | Primary text |
| Violet | `#7b61ff` | Secondary accent |

---

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

Pull requests are welcome. Keep them focused. All PRs are reviewed by the maintainer together with Grok.

## Security

See [SECURITY.md](SECURITY.md) for how to report issues privately and the basic security posture of the project.

## License

MIT — see [LICENSE](LICENSE).

Copyright (c) 2026 Sam
