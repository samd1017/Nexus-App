<p align="center">
  <img src="public/favicon.svg" alt="Nexus" width="96" height="96" />
</p>

<h1 align="center">Nexus</h1>

<p align="center">
  <strong>Notes for Humans and Agents</strong><br/>
  Local-first Markdown knowledge vault with a visual editor, live 3D graph, and Hermes-compatible plain files.
</p>

<p align="center">
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-GPL--3.0--or--later-blue.svg" alt="License: GPL-3.0-or-later" /></a>
  <img src="https://img.shields.io/badge/Tauri-2-24C8DB?logo=tauri&logoColor=white" alt="Tauri 2" />
  <img src="https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=black" alt="React 19" />
  <img src="https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript&logoColor=white" alt="TypeScript" />
</p>

---

## Design System

**Aesthetic**: SpaceX-instrument / metallic steel panels with controlled cyan accent.

| Token | Value | Role |
|-------|-------|------|
| Accent | `#00c8ff` | Primary cyan (nexus node, links, focus) |
| Deepest BG | `#050507` | App background |
| Primary BG | `#0f0f12` | Panels / surfaces |
| Text | `#f2f2f7` | Primary text |
| Violet | `#7b61ff` | Secondary accent |

**Logo**: 3D extruded metallic **N** monogram with a cyan nexus node at the center.

---

## Features

- **Local-first** — your notes live as plain `.md` files on disk. Zero accounts required.
- **Visual editor** — TipTap-powered rich editing with full Markdown round-trip.
- **Live 3D knowledge graph** — force-directed view of notes, folders, and backlinks.
- **Native desktop shell** — Tauri 2 (macOS, Windows) with native menus, dialogs, and file watching.
- **Web mode** — File System Access API for browser use.
- **Search & backlinks** — durable SQLite FTS5 index + in-memory graph.
- **Hermes-compatible** — plain files, no proprietary format.
- **Command palette** — fast navigation and actions.

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
├── public/              # favicon.svg + static assets
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

See [DESKTOP.md](DESKTOP.md) for full instructions.

```bash
npm run tauri:dev     # development
npm run tauri:build   # production build
```

---

## Contributing

Pull requests are welcome. See [CONTRIBUTING.md](CONTRIBUTING.md).

All contributions must remain under the GPL-3.0-or-later license.

---

## License

This project is licensed under the **GNU General Public License v3.0 or later**.

See [LICENSE](LICENSE) for the full text.

Anyone who improves or distributes this software is required to keep the source open.
