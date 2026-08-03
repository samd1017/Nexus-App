import type { VaultNode } from "./types";
import { pathJoin } from "./types";

function idFor(path: string): string {
  return "n_" + path.replace(/[^a-zA-Z0-9]+/g, "_");
}

function folder(path: string, name: string, parentId: string | null): VaultNode {
  return {
    id: idFor(path || "__root_folder__" + name),
    path,
    name,
    kind: "folder",
    parentId,
    mtime: Date.now(),
  };
}

function note(
  path: string,
  name: string,
  parentId: string | null,
  content: string,
): VaultNode {
  return {
    id: idFor(path),
    path,
    name,
    kind: "note",
    parentId,
    mtime: Date.now(),
    content,
  };
}

/** Demo vault that showcases Nexus features with clean, linked Markdown */
export function buildDemoVault(): {
  nodes: Record<string, VaultNode>;
  rootIds: string[];
  vaultName: string;
} {
  const nodes: Record<string, VaultNode> = {};
  const add = (n: VaultNode) => {
    nodes[n.id] = n;
    return n;
  };

  const projects = add(folder("Projects", "Projects", null));
  const research = add(folder("Research", "Research", null));
  const journal = add(folder("Journal", "Journal", null));
  const systems = add(folder("Systems", "Systems", null));

  const welcome = add(
    note(
      "Welcome.md",
      "Welcome.md",
      null,
      `# Welcome to Nexus

**Notes for Humans and Agents.**

This demo vault is a tour of everything Nexus does — open notes, follow [[wikilinks]], switch Visual ↔ Source, search with **⌘K**, and watch the **graph** light up.

## Feature tour

| Feature | Try it |
| --- | --- |
| File tree | Folders on the left — Projects, Research, Systems, Journal |
| Visual editor | Default calm writing surface with formatting toolbar |
| Source mode | **⌘E** — same note as clean Markdown |
| Wikilinks | Click pills like [[Graph View]] or [[Linking Notes]] |
| Backlinks | Right panel → see what points here |
| Graph | Right panel → Graph, or **⌘G** for fullscreen |
| Search | **⌘K** — find any note instantly |
| Settings | Gear or **⌘,** — accents, density, editor prefs |
| Hermes | Vault menu → **Simulate Hermes write** |

## Quick path

1. Open [[Local-first Vault]] for how storage works  
2. Open [[Graph View]] and click a node to jump notes  
3. Edit this page, switch to **Source**, then back — content stays in sync  
4. Press **⌘K** and type \`hermes\`

## See the graph first

The right panel is already on **Graph** — orbit, zoom, and click a node. Press **⌘G** for fullscreen, or use the download icon to export a PNG.

## What stays true

- Vault = ordinary **folder of \`.md\` files**
- No accounts required
- Agents can edit the same files you do

---

*Demo data only. Open your own folder anytime.*
`,
    ),
  );

  add(
    note(
      pathJoin("Projects", "Local-first Vault.md"),
      "Local-first Vault.md",
      projects.id,
      `# Local-first Vault

Nexus treats a **folder** as the product. No proprietary database for your notes.

## How it works

1. **Open folder as vault** — grant access to a real directory  
2. Notes are \`.md\` files; folders are directories  
3. Changes save to disk (or stay in-browser for this demo)  
4. External tools and agents write the **same files**

## Why this matters

| You get | Agents get |
| --- | --- |
| Readable Markdown | Same readable Markdown |
| \`git diff\` that makes sense | CLI and Hermes-friendly paths |
| Portability forever | No lock-in API |

## Related

- [[Welcome]]
- [[Hermes Compatibility]]
- [[Linking Notes]]
- [[Settings & Shortcuts]]
`,
    ),
  );

  add(
    note(
      pathJoin("Projects", "Linking Notes.md"),
      "Linking Notes.md",
      projects.id,
      `# Linking Notes

Wikilinks are the connective tissue of the vault.

## Syntax

\`\`\`
[[Note Name]]
[[Note Name|display alias]]
\`\`\`

On disk they stay plain text. In **Visual** mode they render as interactive pills.

## Habits that scale

- Prefer **one idea per note**
- Link when you introduce a concept
- Use the **backlinks** panel to find unexpected structure
- Watch the [[Graph View]] cluster related work

## Map

- [[Welcome]]
- [[Graph View]]
- [[Visual & Source]]
- [[First Light]]
`,
    ),
  );

  add(
    note(
      pathJoin("Research", "Graph View.md"),
      "Graph View.md",
      research.id,
      `# Graph View

The graph turns [[wikilinks]] into a living map of your thinking.

## What you’ll see

- **Nodes** sized by how connected they are  
- **Soft glow** on the active note  
- **Particles** along links (toggle in Settings)  
- **Physics** — Calm / Standard / Energetic  

## Controls

| Action | Result |
| --- | --- |
| Hover | Title + preview |
| Click | Open the note (exits fullscreen) |
| Drag | Reposition nodes |
| Scroll | Zoom |
| **⌘G** | Fullscreen graph |

## Seed network

- [[Welcome]]
- [[Linking Notes]]
- [[Design Language]]
- [[Hermes Compatibility]]
- [[Local-first Vault]]
`,
    ),
  );

  add(
    note(
      pathJoin("Research", "Design Language.md"),
      "Design Language.md",
      research.id,
      `# Design Language

Dark, precise, high-signal — built to feel like an instrument, not a template.

## Palette

- Deepest \`#050507\`
- Surfaces \`#0F0F12\` → \`#16161A\`
- Accent cyan \`#00C8FF\` (changeable in Settings)
- Violet \`#7B61FF\`

## UI principles

- **Calm center** — the writing surface stays quiet  
- **Power on the edges** — tree, graph, search, settings  
- **Glass panels** with hairline borders  
- Motion ~220–280ms, never flashy  

## Try the accents

Open **Settings (⌘,)** and switch Cyan → Violet → Emerald. The whole UI updates live.

## Related

- [[Welcome]]
- [[Settings & Shortcuts]]
- [[Graph View]]
`,
    ),
  );

  add(
    note(
      pathJoin("Research", "Visual & Source.md"),
      "Visual & Source.md",
      research.id,
      `# Visual & Source

Two views. **One note.** Same Markdown on disk.

## Visual

- Default writing mode  
- Headings, lists, tasks, code, tables  
- Wikilink pills you can click  

## Source

- Press **⌘E** or the Source chip  
- Edit raw Markdown  
- Switch back — rich view matches  

## Round-trip rules

Nexus keeps files clean so [[Hermes Compatibility]] and \`git diff\` stay honest. Prefer standard Markdown; avoid proprietary blobs.

## Practice

1. Type a sentence here in Visual  
2. Switch to Source — confirm it appears  
3. Edit the Markdown, return to Visual  

## Links

- [[Welcome]]
- [[Linking Notes]]
`,
    ),
  );

  add(
    note(
      pathJoin("Systems", "Hermes Compatibility.md"),
      "Hermes Compatibility.md",
      systems.id,
      `# Hermes Compatibility

Hermes (and any agent or script) should treat this vault as ordinary files.

## Contract

- Notes = \`.md\` files  
- Folders = directories  
- No proprietary metadata inside note bodies  
- App preferences stay in the browser, not in your Markdown  

## Live watching

Creates, edits, renames, and deletes from outside the app appear in the UI within about **1–2 seconds** when a real folder is open.

## Demo it now

In the vault switcher menu, choose **Simulate Hermes write**. A new note lands under Systems without you typing it.

## Linked

- [[Local-first Vault]]
- [[Welcome]]
- [[Graph View]]
`,
    ),
  );

  add(
    note(
      pathJoin("Systems", "Settings & Shortcuts.md"),
      "Settings & Shortcuts.md",
      systems.id,
      `# Settings & Shortcuts

## Settings (⌘,)

| Section | What you can change |
| --- | --- |
| Appearance | Accent color, density, graph particles |
| Editor | Default Visual/Source, font size, spellcheck |
| Graph | Default panel/hidden, physics intensity |
| Vault | Confirm delete, open last vault on launch |
| Keyboard | Full shortcut list |
| About | Nexus version + vault info |

## Keyboard map

| Shortcut | Action |
| --- | --- |
| ⌘K | Search / command palette |
| ⌘, | Settings |
| ⌘E | Toggle Visual / Source |
| ⌘G | Graph fullscreen |
| ⌘N | New note |
| ⌘S | Save (auto-save is already on) |
| ⌘\\\\ | Toggle left sidebar |
| ⌘⌥\\\\ | Toggle right panel |
| Esc | Close overlay / exit graph |

## Philosophy

Basics never require shortcuts. Power users never leave the keyboard.

## Related

- [[Welcome]]
- [[Design Language]]
- [[Visual & Source]]
`,
    ),
  );

  add(
    note(
      pathJoin("Journal", "First Light.md"),
      "First Light.md",
      journal.id,
      `# First Light

Opened the vault for the first time.

The graph already ties together [[Local-first Vault]], [[Graph View]], and [[Hermes Compatibility]]. That loop — **write, link, see** — is the product.

## Tasks

- [x] Seed demo notes
- [x] Wire wikilinks
- [x] Try Visual ↔ Source
- [ ] Capture a real research thread
- [ ] Open my own folder as a vault

## Log

Felt immediate. Calm center, powerful edges. Settings accents made it mine in one click.

## Next

- [[Welcome]]
- [[Linking Notes]]
- [[Settings & Shortcuts]]
`,
    ),
  );

  const rootIds = [
    welcome.id,
    projects.id,
    research.id,
    systems.id,
    journal.id,
  ];

  return {
    nodes,
    rootIds,
    vaultName: "Demo Vault",
  };
}

export const HERMES_SAMPLE_NOTE = {
  path: pathJoin("Systems", "Hermes Pulse.md"),
  name: "Hermes Pulse.md",
  content: `# Hermes Pulse

This note was written by an **external process** (simulated agent).

Timestamp: ${"${TS}"}

## Observation

The filesystem watcher picked this up without a manual refresh. The vault remains a plain folder of Markdown.

## Links

- [[Hermes Compatibility]]
- [[Local-first Vault]]
- [[Welcome]]
`,
};
