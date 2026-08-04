<!-- Open Graph / Twitter Card meta for social previews -->
<meta property="og:title" content="Nexus - Notes for Humans and Agents" />
<meta property="og:description" content="Local-first Markdown knowledge vault with a visual editor, live 3D force-directed graph, and Hermes-compatible plain files." />
<meta property="og:image" content="https://raw.githubusercontent.com/samd1017/Nexus-App/main/social-preview.svg" />
<meta property="og:image:width" content="512" />
<meta property="og:image:height" content="512" />
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:image" content="https://raw.githubusercontent.com/samd1017/Nexus-App/main/social-preview.svg" />

<p align="center">
  <img src="public/favicon.svg" alt="Nexus" width="120" height="120" />
</p>

<h1 align="center">Nexus</h1>

<p align="center">
  <strong>Notes for Humans and Agents</strong><br/>
  Local-first Markdown knowledge vault with a visual editor,<br/>
  live 3D force-directed graph, and Hermes-compatible plain files.
</p>

<p align="center">
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-GPL--3.0--or--later-blue.svg" alt="License: GPL-3.0-or-later" /></a>
  <img src="https://img.shields.io/badge/Tauri-2-24C8DB?logo=tauri&logoColor=white" alt="Tauri 2" />
  <img src="https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=black" alt="React 19" />
  <img src="https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript&logoColor=white" alt="TypeScript" />
  <img src="https://img.shields.io/badge/platform-macOS%20%7C%20Web-0f0f12" alt="Platform" />
</p>

---

## Design System

**Aesthetic**: SpaceX-instrument / metallic steel panels with controlled cyan accent.

| Token          | Value     | Role                                      |
|----------------|-----------|-------------------------------------------|
| Accent         | `#00c8ff` | Primary cyan (nexus node, links, focus)   |
| Deepest BG     | `#050507` | App background                            |
| Primary BG     | `#0f0f12` | Panels / surfaces                         |
| Text           | `#f2f2f7` | Primary text                              |
| Violet         | `#7b61ff` | Secondary accent                          |

**Logo**: 3D extruded metallic **N** monogram with a cyan nexus node at the center.

---

## Features

- **Local-first** — Notes live as plain `.md` files on disk. Zero accounts required.
- **Visual editor** — TipTap-powered rich editing with full Markdown round-trip.
- **Live 3D knowledge graph** — Force-directed view of notes, folders, and backlinks.
- **Native desktop shell** — Tauri 2 (macOS + Windows) with native menus, dialogs, and file watching.
- **Web mode** — File System Access API for browser use.
- **Search & backlinks** — Durable SQLite FTS5 index + in-memory graph.
- **Hermes-compatible** — Plain files, no proprietary format.
- **Command palette** — Fast navigation and actions.

A large test vault is included under `public/large-test-vault/` for stress-testing search, graph, and performance.

---

## Architecture

```
Nexus/
├── src/                 # React + TypeScript frontend
│   ├── components/      # UI (editor, graph, vault, layout, chrome)
│   ├── lib/             # vault adapters, search, graph, markdown
│   └── routes/
├── src-tauri/           # Rust native shell (Tauri 2)
│   ├── src/             # durable_index, vault_watch, vault_scope
│   └── icons/
├── desktop/             # Desktop entry points
├── public/              # favicon.svg + large-test-vault + static assets
└── .github/workflows/   # macOS desktop build
```

- **Markdown is the source of truth**
- Browser uses File System Access API
- Desktop uses Tauri `plugin-fs` + OS folder dialogs + native watch
- Search index is disposable and lives outside the vault

---

## Quick Start

### Web (browser)

```bash
git clone https://github.com/samd1017/Nexus-App.git
cd Nexus-App
npm install
npm run dev
```

### Desktop (Tauri)

See [DESKTOP.md](DESKTOP.md) for full requirements and instructions.

```bash
npm run tauri:dev     # development
npm run tauri:build   # production build
```

## Contributing

Pull requests are welcome. See [CONTRIBUTING.md](CONTRIBUTING.md).

All pull requests are reviewed by the maintainer **together with Grok** before merge.

All contributions must remain under the GPL-3.0-or-later license.

---

## License

This project is licensed under the **GNU General Public License v3.0 or later**.

See [LICENSE](LICENSE) for the full text.

Anyone who improves or distributes this software is required to keep the source open.
