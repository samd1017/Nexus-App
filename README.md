<p align="center">
  <img src="public/favicon.svg" alt="Nexus" width="120" height="120" />
</p>

<h1 align="center">Nexus</h1>

<p align="center">
  <strong>Local-first Markdown knowledge vault built for retrieval.</strong>
</p>

<p align="center">
  Plain <code>.md</code> files on disk · disposable SQLite FTS index · hybrid ranking as the product north star
</p>

Nexus is a notes app where the primary experience is finding the right note quickly — even in large vaults — with plain Markdown as the only source of truth.

```
Markdown on disk  →  disposable SQLite FTS index  →  hybrid ranking (goal)
```

Writing, the 3D graph, and visual design matter. Ranking quality and grounded retrieval matter more.

---

## Why Nexus

**Desktop for large vaults; Chrome ≤20k.** Chrome in the browser supports about 20,000 notes or fewer. We will not open a folder of about 25,000 notes in Chrome. Use Nexus Desktop for large vaults — same markdown folder.

- **Local-first by design** — no accounts for core editing; vault contents stay on your device
- **Retrieval-first** — DurableIndex FTS (memory or SQLite) scaled for large vaults, with lazy bodies
- **Plain files** — ordinary Markdown; no proprietary format
- **Desktop + web** — Tauri 2 (macOS / Windows) for large vaults; File System Access API in Chrome/Edge for about 20,000 notes or fewer
- **Agent-friendly** — live on-disk sync when other tools write into the vault folder

---

## Desktop: build from source

The primary desktop path is **build from source**. Requirements (Rust, Xcode Command Line Tools on macOS, Node 22+) and the full steps are in [DESKTOP.md](DESKTOP.md).

```bash
npm install
npm run tauri:dev      # development
npm run tauri:build    # production build
```

> **Installer assets exist on [`v0.1.0-alpha`](https://github.com/samd1017/Nexus-App/releases/tag/v0.1.0-alpha) only** — not on Latest, and not on `v0.1.1-alpha` (source checkpoint, zero DMG/EXE). Do not open `/releases/latest` expecting installers. Those builds are **unsigned** (not notarized / not code-signed). The durable path is [DESKTOP.md](DESKTOP.md).

### Optional: v0.1.0-alpha installers (unsigned)

Use only these files from the [`v0.1.0-alpha` release](https://github.com/samd1017/Nexus-App/releases/tag/v0.1.0-alpha):

- macOS (Apple Silicon): `Nexus_0.1.0_aarch64.dmg`
- Windows: `Nexus_0.1.0_x64-setup.exe`

Files on that same older tag whose names contain `0.1.1` are not Latest. The `v0.1.1-alpha` tag itself has no installer assets.

#### macOS (unsigned)

1. Download `Nexus_0.1.0_aarch64.dmg` from [`v0.1.0-alpha`](https://github.com/samd1017/Nexus-App/releases/tag/v0.1.0-alpha) (not Latest).
2. Open it and drag **Nexus** into Applications.
3. First launch: **right-click** the app → **Open** (or System Settings → Privacy & Security → **Open Anyway**).
4. macOS Gatekeeper will warn because the developer is unidentified. Confirm Open.

#### Windows (unsigned)

1. Download `Nexus_0.1.0_x64-setup.exe` from [`v0.1.0-alpha`](https://github.com/samd1017/Nexus-App/releases/tag/v0.1.0-alpha) (not Latest).
2. Run it. If **SmartScreen** appears (“Windows protected your PC”), click **More info** → **Run anyway**.
3. That warning is normal for unsigned Alpha builds.

---

## Vision

A user types a half-remembered phrase or a natural-language question and receives the correct note(s) ranked highly, with clear provenance, quickly, even on vaults of 100k–500k notes.

Everything else (editor, graph, command palette) supports that core loop.

---

## Status (honest)

**Desktop for large vaults; Chrome ≤20k.** Chrome in the browser supports about 20,000 notes or fewer. We will not open a folder of about 25,000 notes in Chrome. Use Nexus Desktop for large vaults — same markdown folder.

**What works well today**
- Local-first Markdown vault (plain `.md` files)
- TipTap visual editor with Markdown round-trip (callouts, tables, nested tasks, mermaid/math)
- `[[Note#Heading]]` / `[[Note#^block]]` navigation and heading/block embeds
- Dual-note workspace (two notes, not just source+preview)
- Attachments rail (images, PDFs, vault files) and per-note version history
- Live 3D force-directed knowledge graph
- Tauri 2 desktop shell (macOS + Windows) + web mode via File System Access API
- Search: desktop uses disposable SQLite FTS5 BM25 (`searchFtsAsync`); web / FSA uses an in-memory inverted index with an 800-candidate cap (not BM25). Palette heading names the live engine.
- Grounded **Ask your notes** (`ask:` in ⌘K) with extractive citations — no cloud model
- Pulse + Conflict Studio for humans and agents on the same folder
- Command palette, backlinks, large-test-vault stress tooling
- Lazy body loading + durable FTS snippets for large in-memory / disk vaults

**What is still early**
- Semantic embeddings (vector rerank) are not shipped; lexical hybrid + Ask is the daily-driver path
- Scale targets of 100k–500k notes are being pursued; real-disk proof at those sizes is still in progress
- Desktop Alpha builds are **unsigned** (not notarized / not code-signed)
- Installer assets exist on [`v0.1.0-alpha`](https://github.com/samd1017/Nexus-App/releases/tag/v0.1.0-alpha) only. Latest (`v0.1.1-alpha`) is source-only (zero DMG/EXE). Durable path: build from source ([DESKTOP.md](DESKTOP.md))

Contributions and hard feedback are welcome. See [CONTRIBUTING.md](CONTRIBUTING.md).

---

## Architecture overview

| Layer | Role |
|-------|------|
| **Markdown files on disk** | Only source of truth. Ordinary Markdown. No proprietary format. |
| **DurableIndex** | Desktop: SQLite FTS5 BM25 via `searchFtsAsync`. Web/FSA: in-memory FTS (800-candidate cap, not BM25). Disposable; lives outside the vault. |
| **In-memory graph** | Backlinks, structure, 3D view. |
| **Hybrid ranking (goal)** | Lexical (FTS5 + BM25 + title/path boosts) + semantic (local embeddings) + structural signals. |

Desktop path uses Tauri `plugin-fs` + native folder watching.  
Browser path uses the File System Access API.

See [`docs/SCALING.md`](docs/SCALING.md) for the scaling plan and DurableIndex contract.  
See [`docs/PUBLIC-BETA.md`](docs/PUBLIC-BETA.md) for release-readiness notes.

---

## Features

- **Local-first** — Zero accounts. Notes are plain files you control.
- **Visual editor** — TipTap with Markdown fidelity (callouts, nested tasks, tables, mermaid, math).
- **Heading & block links** — `[[Note#Heading]]`, `[[Note#^id]]`, heading/block embeds.
- **Dual-note workspace** — Two notes side by side; Alt-click to open beside.
- **Attachments** — Browse images, PDFs, and vault files.
- **Version history** — Snapshots before each edit; restore from the History rail.
- **3D knowledge graph** — Force-directed view of notes, folders, and links.
- **Native desktop** — Tauri 2 (macOS + Windows).
- **Web mode** — File System Access API.
- **Search + Ask** — FTS operators, fused ranking, `ask:` answers with citations.
- **Agents** — Pulse inbox + Conflict Studio; simulate agent write in demo.
- **Command palette** — Fast navigation and actions.
- **Large test vault** — Generate locally into gitignored `public/large-test-vault/` for stress testing. Not stored in git.

---

## Quick start

### Prerequisites

- Node.js **22+**
- npm 10+

### Web (browser)

```bash
git clone https://github.com/samd1017/Nexus-App.git
cd Nexus-App
npm install
npm run dev
```

Open the URL Vite prints (usually `http://localhost:8080`).

### Desktop (Tauri)

**Build from source** — see [DESKTOP.md](DESKTOP.md) (Rust, Xcode CLT on macOS, Node 22+). Published installers are on [`v0.1.0-alpha`](https://github.com/samd1017/Nexus-App/releases/tag/v0.1.0-alpha) only, not Latest / not `v0.1.1-alpha`, and they are unsigned.

```bash
npm install
npm run tauri:dev      # development
npm run tauri:build    # production build
```

### Quality checks

```bash
npm run typecheck
npm run qa:gate
```

---

## Security posture

- Core editing requires **no account** and **no cloud upload** of vault contents
- The search index is **disposable** and lives outside the vault
- Desktop shell uses Tauri with a narrowed filesystem scope
- Report vulnerabilities privately — see [SECURITY.md](SECURITY.md)

Never commit `.env`, tokens, private keys, or vault contents into the repository.

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

See [CONTRIBUTING.md](CONTRIBUTING.md). Pull requests should be focused and reviewable.

## License

MIT — see [LICENSE](LICENSE).

Copyright (c) 2026 Sam
