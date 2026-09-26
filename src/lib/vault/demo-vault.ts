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

#nexus #demo #local-first

This demo vault is a tour of everything Nexus does — open notes, follow wikilink pills, switch Visual ↔ Source, search with **Ctrl/⌘K**, and watch the **graph** light up.

## Feature tour

| Feature | Try it |
| --- | --- |
| File tree | Folders on the left — Projects, Research, Systems, Journal |
| Visual editor | Default calm writing surface with formatting toolbar |
| Source mode | **Ctrl/⌘E** — same note as clean Markdown |
| Split | Source + live preview side by side |
| Slash | Type / in Visual to insert headings, mermaid, embeds, queries |
| Embeds | ![[Linking Notes#Syntax]] a heading; ![[First Light#^next-step]] a block |
| Wikilinks | [[Graph View]] · [[Linking Notes#Syntax]] · [[First Light#^next-step]] |
| Backlinks | Right panel → see what points here |
| Graph | Right panel → Graph, or **Ctrl/⌘G** for fullscreen |
| Search | **Ctrl/⌘K** — find any note instantly |
| Callouts | Open [[Callouts]] or insert from the toolbar More menu |
| Diagrams | Open [[Diagrams & Math]] — mermaid charts and $math$ |
| Canvas | Open [[Welcome board]] — **tour board** (cards in this vault; not Obsidian Canvas parity) |
| Theme | Sun/moon in the title bar — Dark, Light, or System |
| Settings | Gear or **Ctrl/⌘,** — theme and remappable hotkeys |
| Dual pane | **Pane** or **⌘2** — two notes at once. Alt-click a file to park it beside |
| Files | Right rail → **Files** for images and PDFs |
| History | Right rail → **History** after you edit — restore a prior version |
| Ask | **⌘K** then \`ask: how do agents share this vault\` |
| Unlinked | Right panel — mentions of this title that are not [[linked]] yet |
| Pins | Pin a note (⌘⇧P) — it stays in the sidebar |
| Trash | Delete a note — toast **Restore**, sidebar Trash, or ⌘K \`is:deleted\` |
| Agents | Vault menu → **Practice agent conflict** → Conflict Studio (Keep mine / Take theirs) |

## Quick path

1. Open [[Heading & Block Links]] — jump to a section, then Alt-click a link to split  
2. Open [[Callouts]] and [[Diagrams & Math]]  
3. Press **⌘K** and type \`ask: how do agents share this vault\`  
4. Vault menu → **Practice agent conflict** — Conflict Studio opens  
5. Pin this note (⌘⇧P). Stay here — right panel **Unlinked mentions** should list Agent Day. Click **Link**.

## See the graph

Open the right panel → **Graph**, or press **Ctrl/⌘G** for fullscreen. Orbit, zoom, and click a node. Use the download icon to export a PNG.

## What stays true

- Vault = ordinary **folder of \`.md\` files**
- No accounts required
- Agents can edit the same files you do

![Nexus mark](/favicon.svg)

Brief: [agent-brief.pdf](assets/agent-brief.pdf)

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

Nexus treats a **folder** as the product. #architecture #local-first No proprietary database for your notes.

## How it works

1. **Open folder as vault** — grant access to a real directory  
2. Notes are \`.md\` files; folders are directories  
3. Changes save to disk (or stay in-browser for this demo)  
4. External tools and agents write the **same files**

## Why this matters

| You get | Agents get |
| --- | --- |
| Readable Markdown | Same readable Markdown |
| \`git diff\` that makes sense | Ordinary file paths |
| Portability forever | No lock-in API |

## Related

- [[Welcome]]
- [[External Agents]]
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
[[Note Name#Heading]]
[[Note Name#^block-id]]
![[Note Name#Heading]]
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
- [[Heading & Block Links]]
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

#graph #links

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
- [[External Agents]]
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
      pathJoin("Research", "Callouts.md"),
      "Callouts.md",
      research.id,
      `# Callouts

#writing #callouts

Callouts are ordinary Markdown. They look rich in Visual and stay portable in Source.

> [!NOTE]
> Local-first notes. Same files on disk for you, git, and agents.

> [!TIP] Toolbar
> Open **More → Callout** and pick a type. Source writes \`> [!TIP]\`.

> [!WARNING]
> Huge vaults stay fast because callouts are per-note HTML — never a whole-vault scan.

> [!DANGER]
> Don't paste proprietary blobs. Callouts round-trip to standard blockquotes.

> [!SUCCESS]
> Highlights use ==this==. Properties sit above the editor.

See also [[Visual & Source]] and [[Welcome]].
`,
    ),
  );

  add(
    note(
      pathJoin("Research", "Diagrams & Math.md"),
      "Diagrams & Math.md",
      research.id,
      `# Diagrams & Math

#writing #mermaid #math

**Mermaid** turns a fenced code block into a diagram. **Math** is LaTeX between \`$…$\` (inline) or \`$$…$$\` (block). Both stay plain Markdown on disk — edit in Visual (double-click) or Source.

## Flow

\`\`\`mermaid
flowchart LR
  Write[Write a note] --> Link[Link with wikilinks]
  Link --> See[See it on the graph]
\`\`\`

## Formula

The mass–energy relation is $E = mc^2$.

$$
\\int_0^1 x^2 \\, dx = \\frac{1}{3}
$$

Insert from **More → Mermaid diagram** or **Math block**. See also [[Welcome board]] and [[Visual & Source]].
`,
    ),
  );

  const canvases = add(folder("Canvases", "Canvases", null));
  add(
    note(
      pathJoin("Canvases", "Welcome board.md"),
      "Welcome board.md",
      canvases.id,
      [
        "---",
        "type: canvas",
        "---",
        "",
        "# Welcome board",
        "",
        "````canvas",
        '{"cam":{"x":36,"y":24,"k":1},"snap":true,"cards":[{"id":"c_group","x":12,"y":8,"w":580,"h":300,"kind":"group","text":"Welcome","color":"6"},{"id":"c_welcome","x":36,"y":48,"w":240,"h":140,"kind":"text","color":"5","text":"Welcome board\\n\\nDrag a card. Hover a side to connect."},{"id":"c_welcome_link","x":320,"y":48,"w":240,"h":120,"kind":"note","notePath":"Welcome.md","color":"4"},{"id":"c_diagrams","x":320,"y":184,"w":240,"h":100,"kind":"note","notePath":"Research/Diagrams & Math.md"}],"edges":[{"id":"e_next","from":"c_welcome","to":"c_welcome_link","fromSide":"right","toSide":"left","label":"open","color":"5"}]}',
        "````",
        "",
      ].join("\n"),
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

## Split

Source on the left, live preview on the right — no second editor, no lost fences.

Type / in Visual for headings, callouts, mermaid, math, embeds, and live queries.

Transclude a note with \`![[Welcome]]\`.

\`\`\`query
folder:Research
\`\`\`

## Round-trip rules

Nexus keeps files clean so [[External Agents]] and \`git diff\` stay honest. Prefer standard Markdown; avoid proprietary blobs.

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
      pathJoin("Systems", "External Agents.md"),
      "External Agents.md",
      systems.id,
      `# External Agents

#agents #pulse

Any agent or script should treat this vault as ordinary files.

## Contract

- Notes = \`.md\` files  
- Folders = directories  
- No proprietary metadata inside note bodies  
- App preferences stay in the browser, not in your Markdown  

## Live watching

Creates, edits, renames, and deletes from outside the app appear in the UI within about **1–2 seconds** when a real folder is open.

## Demo it now

In the vault switcher menu (More), choose **Simulate agent write**. A new note lands under Systems. Pulse opens so you can treat it like an outside write.

To see a conflict: **Practice agent conflict** (vault menu, Pulse, Settings → External agents, or ⌘K). Conflict Studio opens with a line diff — Keep mine or Take theirs.

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
| ⌘⇧? | Ask your notes |
| ⌘, | Settings |
| ⌘E | Toggle Visual / Source |
| ⌘F | Find in note |
| ⌘G | Graph fullscreen |
| ⌘N | New note |
| ⌘D | Today's daily note |
| ⌘2 | Dual-note workspace (restores the last companion) |
| ⌘⇧P | Pin / unpin this note |
| ⌘⇧L | Insert [[ wikilink |
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
      pathJoin("Projects", "Heading & Block Links.md"),
      "Heading & Block Links.md",
      projects.id,
      `# Heading & Block Links

Obsidian-class links. Click through — Nexus jumps to the section.

## Syntax

- Note: [[Welcome]]
- Heading: [[Linking Notes#Syntax]]
- Block: [[First Light#^next-step]]
- Same-note heading: [[#Embeds]]

## Embeds

Heading transclusion:

![[Linking Notes#Syntax]]

Block transclusion (the task that still needs doing):

![[First Light#^next-step]]

## Dual pane

Alt-click [[Graph View]] to open it beside this note. **⌘2** toggles the workspace.

## Related

- [[Welcome]]
- [[Visual & Source]]
- [[External Agents]]
`,
    ),
  );

  add(
    note(
      pathJoin("Systems", "Agent Day.md"),
      "Agent Day.md",
      systems.id,
      `# Agent Day

#agents #pulse

First-hour path for a person and an outside writer on the same folder.

Welcome already has the feature tour — this note is the five-minute switch: open, ask, let an agent write, resolve a conflict.

## Open

This demo vault is already open. For a real folder: **Open…** and point at any directory of \`.md\` files.

## Agent write

1. Vault menu → **More → Practice agent conflict**
2. Or press **⌘K**, type \`agent\`
3. Pulse shows **Agent Pulse** — an external write

On disk, the same thing happens when another app or a script saves a file.

## Conflict

Edit a note in Nexus (leave it dirty) while an agent writes the same path. Nexus shelves the disk copy as \`Note.conflict-…md\` and opens **Conflict Studio**: Keep mine, Take theirs, or Open both.

## Ask

**⌘K** → \`ask: how do agents share this vault\` — extractive answer with citations. No cloud model required.

## Related

- [[External Agents]]
- [[Local-first Vault]]
- [[Welcome]]
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

The graph already ties together [[Local-first Vault]], [[Graph View]], and [[External Agents]]. That loop — **write, link, see** — is the product.

## Tasks

- [x] Seed demo notes
- [x] Wire wikilinks
- [x] Try Visual ↔ Source
- [ ] Capture a real research thread
  - [ ] File the interview
  - [ ] Link it from [[Heading & Block Links]]
- [ ] Open my own folder as a vault ^next-step

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
    canvases.id,
    systems.id,
    journal.id,
  ];

  return {
    nodes,
    rootIds,
    vaultName: "Demo Vault",
  };
}

/** Empty first-hour vault — Welcome note only, no demo tour. */
export function buildBlankVault(vaultName = "Nexus Vault"): {
  nodes: Record<string, VaultNode>;
  rootIds: string[];
  vaultName: string;
} {
  const nodes: Record<string, VaultNode> = {};
  const welcome = note(
    "Welcome.md",
    "Welcome.md",
    null,
    `# Welcome

This is your vault. Notes are ordinary Markdown in a folder — you, git, and agents share the same files.

## First moves

- Type \`[[\` to link a note
- **⌘K** to search or \`ask:\` a question
- **⌘2** to open a second note beside this one
- Vault menu → **Practice agent conflict** to open Conflict Studio

— Nexus · Notes for Humans and Agents
`,
  );
  nodes[welcome.id] = welcome;
  return { nodes, rootIds: [welcome.id], vaultName };
}

export const AGENT_SAMPLE_NOTE = {
  path: pathJoin("Systems", "Agent Pulse.md"),
  name: "Agent Pulse.md",
  content: `# Agent Pulse

This note was written by an **external process** (simulated agent).

Timestamp: ${"${TS}"}

## Observation

The filesystem watcher picked this up without a manual refresh. The vault remains a plain folder of Markdown.

## Links

- [[External Agents]]
- [[Local-first Vault]]
- [[Welcome]]
`,
};
