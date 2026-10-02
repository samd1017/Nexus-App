<p align="center">
  <img src="public/favicon.svg" alt="Nexus" width="120" height="120" />
</p>

<h1 align="center">Nexus</h1>

Nexus is a local notes app for a folder of Markdown files. You keep the files. Nexus is there to help you find the right one. There is no account, and the app does not upload your notes.

## Desktop or the browser

Open **Nexus Desktop** when the folder is large. The desktop app is [Tauri 2](https://tauri.app) for macOS and Windows.

Open the **browser** app for a smaller folder. Chrome and Edge can read a folder through the File System Access API. That path is for about 20,000 notes or fewer. Nexus will not open a folder of about 25,000 notes in the browser. Either way, it is the same folder of `.md` files.

## What works today

- A visual editor that saves real Markdown, including callouts, tables, nested tasks, Mermaid diagrams, and math.
- Links between notes (`[[Note]]`), including a heading or a block, and embeds of those.
- Two notes open at once, a command palette, backlinks, attachments, and history for each note.
- Search over the folder, and **Ask your notes**, which answers from your files and cites them. Search matches words on your machine. Embeddings are not included.
- A graph of how notes connect, a task list, and a table of notes.
- Themes (Dark, Light, Midnight, Paper, or System) and a choice of accent color.

The search index sits outside the folder. Delete it and Nexus rebuilds it. The Markdown files are the notes.

## Quick start

You need Node.js 22 or newer.

### Browser

```bash
git clone https://github.com/samd1017/Nexus-App.git
cd Nexus-App
npm install
npm run dev
```

Open the address Vite prints, usually `http://localhost:8080`, in Chrome or Edge, then choose a folder.

### Desktop

Build from source. That is how you run the current desktop app. [DESKTOP.md](DESKTOP.md) lists what to install (Rust, Xcode Command Line Tools on macOS, Node.js 22+) and the full steps.

```bash
npm install
npm run tauri:dev
```

`npm run tauri:build` produces a local production build.

## Releases

The version in this repo is **0.1.1-alpha**.

Build from source if you want the current app. See [DESKTOP.md](DESKTOP.md).

Unsigned installers exist only on the older [`v0.1.0-alpha`](https://github.com/samd1017/Nexus-App/releases/tag/v0.1.0-alpha) release:

- macOS (Apple Silicon): `Nexus_0.1.0_aarch64.dmg`
- Windows: `Nexus_0.1.0_x64-setup.exe`

Those builds are not notarized and not code-signed. [Latest](https://github.com/samd1017/Nexus-App/releases/latest) and [`v0.1.1-alpha`](https://github.com/samd1017/Nexus-App/releases/tag/v0.1.1-alpha) have no DMG or EXE. A file on the `v0.1.0-alpha` release whose name contains `0.1.1` is still that older release, not Latest. First-launch warnings are covered in [DESKTOP.md](DESKTOP.md).

## Security

Notes stay on your machine. If you find a vulnerability, report it privately. See [SECURITY.md](SECURITY.md).

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

[MIT](LICENSE).

Copyright (c) 2026 Sam
