<p align="center">
  <img src="public/favicon.svg" alt="Nexus" width="120" height="120" />
</p>

<h1 align="center">Nexus</h1>

Nexus is a notes app for a folder of Markdown files on your own computer. Every note is a plain `.md` file you can open in any editor. There is no account, and the app does not upload your notes.

## What it does

**Write.** The editor saves real Markdown, including tables, callouts, nested lists, checkboxes, diagrams (Mermaid) and math. Switch to the raw text at any time, or to a Reading view.

**Link and find.**
- Link notes with `[[Note]]`, or link to a heading or a single paragraph. Embed any of them in another note.
- Each note shows its backlinks. A graph shows how your notes connect.
- Search covers the whole folder. Narrow it with `path:`, `folder:`, `#tag` or `-word`.
- **Ask your notes** pulls the sentences that answer a question out of your notes and links to each one. It works on your machine and does not use a language model.

**Templates.** A template is an ordinary note in your `Templates` folder. Start a new note from one, or insert one into the note you're writing. Templates can fill in `{{title}}`, `{{date}}` and `{{time}}` in any format, ask you for a value with `{{prompt:Attendees}}`, and carry over yesterday's open tasks into today's daily note. A template's properties are added to the note without overwriting values you already set.

**Query blocks.** A query block is a live list, table or set of cards built from your notes. It updates as you write. You write it as plain text inside the note:

````markdown
```nexus-query
TABLE status, due AS "Due"
FROM "Projects"
WHERE status != "done"
SORT due
```
````

Queries can read folders, tags, links, frontmatter properties and `key:: value` lines. If part of a query is wrong, that part is underlined and the rest of the note keeps working. An empty block offers starter queries built from your own folders and tags.

**Tasks.**
- A task is a checkbox line in any note, such as `- [ ] Send the invoice 📅 2026-10-09 ⏫`. Due, scheduled and start dates, priority, repeat rules (`🔁 every week`) and tags all live on that line.
- The **Tasks panel** lists every task in the folder: overdue, today, upcoming, no date, and done. You can filter by tag, folder and priority.
- Add a task by typing plain words, such as `Pay rent fri !high every month`.
- Tick a task in the panel, in the editor or in Reading view. Right-click it in the panel or in Reading view to move its due date, change its priority, mark it in progress or cancel it. Every change is written straight back to that task's line in the note.
- Ticking a repeating task adds the next copy with its dates moved forward.
- **Task query blocks** list tasks the same way query blocks list notes. For example, this lists open tasks in Projects that are due within the next week, most urgent first:

````markdown
```nexus-query
TASK FROM "Projects"
WHERE !done AND due <= date(today) + 7d
SORT urgency DESC
```
````

- Existing ` ```tasks ` blocks run as they are, with lines like `not done`, `due before next week`, `priority is high`, `path includes Work` and `(A) OR (B)`. If a line can't be read, Nexus shows the problem on that line with a suggested rewrite you can apply in one click.

**Everything else.** Two notes side by side, tabs, a command palette, daily notes, a canvas for laying notes out on a board, attachments, version history for each note, themes (Dark, Light, Midnight, Paper or System) and a choice of accent color.

Nexus keeps its search index outside your folder. Delete the index and Nexus rebuilds it. Your notes are always the Markdown files.

## Desktop or the browser

Use **Nexus Desktop** for a large folder. It is built with [Tauri 2](https://tauri.app) for macOS and Windows.

Use the **browser** version for a smaller folder. Chrome and Edge can open a folder from your disk, and that works well up to about 20,000 notes. Nexus won't open a folder of about 25,000 notes or more in the browser. Both versions work on the same folder of `.md` files.

## Quick start

You need Node.js 22 or newer.

### Browser

```bash
git clone https://github.com/samd1017/Nexus-App.git
cd Nexus-App
npm install
npm run dev
```

Open the address Vite prints, usually `http://localhost:8080`, in Chrome or Edge, then choose a folder or try the demo folder.

### Desktop

Build from source, or install the unsigned build from the current release. [DESKTOP.md](DESKTOP.md) lists what to install (Rust, Xcode Command Line Tools on macOS, Node.js 22+) and the full steps.

```bash
npm install
npm run tauri:dev
```

`npm run tauri:build` produces a local production build.

## Releases

The current release, [`v0.1.2-alpha`](https://github.com/samd1017/Nexus-App/releases/tag/v0.1.2-alpha), has unsigned installers:

- macOS (Apple Silicon): `Nexus_0.1.2-alpha_aarch64.dmg`
- Windows: `Nexus_0.1.2-alpha_x64-setup.exe`

These installers are not signed or notarized. [DESKTOP.md](DESKTOP.md) explains the warnings you'll see the first time you open the app.

## Security

Your notes stay on your machine. To report a vulnerability, do it privately; [SECURITY.md](SECURITY.md) explains how.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

[MIT](LICENSE).
