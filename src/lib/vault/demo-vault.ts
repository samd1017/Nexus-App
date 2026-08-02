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

function note(path: string, name: string, parentId: string | null, content: string): VaultNode {
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

/** Seed knowledge vault — SpaceX-inspired knowledge OS demo content */
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
      `# Welcome to Note App

A personal knowledge vault built for **clarity**, **speed**, and **Hermes-compatible** plain Markdown.

## What this is

- Your vault is a **folder of \`.md\` files** — nothing proprietary
- The default editor is **visual / WYSIWYG** with clean round-trip Markdown
- \`[[wikilinks]]\` render as interactive pills and stay standard on disk
- An interactive **graph** reveals the shape of your thinking

## Quick start

1. Browse the file tree on the left
2. Open [[Knowledge OS]] or [[Graph Thinking]]
3. Press **⌘K** to search · **⌘E** for source mode · **⌘\\\\** to toggle sidebars
4. Explore the graph in the right panel — expand to full canvas

## Hermes-ready

External agents can create, edit, and delete notes in this folder. Changes appear live within ~1–2 seconds.

Try the **Simulate Hermes write** action in the vault menu to watch an external edit land.

---

*This is a demo vault. Open any local folder to use your own files.*
`,
    ),
  );

  add(
    note(
      pathJoin("Projects", "Knowledge OS.md"),
      "Knowledge OS.md",
      projects.id,
      `# Knowledge OS

The next decade of personal knowledge software is not another notes app — it is a **knowledge operating system**.

## Principles

1. **Files first** — the vault is the source of truth
2. **Agent-native** — [[Hermes Compatibility]] means machines write the same files you do
3. **Spatial memory** — the [[Graph Thinking]] view is first-class, not a gimmick
4. **Calm writing surface** — complexity lives in progressive disclosure

## Architecture sketch

| Layer | Role |
| --- | --- |
| Vault folder | Plain \`.md\` + \`assets/\` |
| Index cache | Optional \`.noteapp/\` only |
| Editor | Visual default, source on demand |
| Graph | Force-directed map of [[wikilinks]] |

## Related

- [[Welcome]]
- [[Design Language]]
- [[Linking Strategy]]
`,
    ),
  );

  add(
    note(
      pathJoin("Projects", "Linking Strategy.md"),
      "Linking Strategy.md",
      projects.id,
      `# Linking Strategy

Wikilinks are the connective tissue of the vault.

## Syntax

Use standard double-bracket links:

\`\`\`
[[Note Name]]
[[Note Name|display alias]]
\`\`\`

## Rules of thumb

- Prefer **concept notes** over dumping everything in daily logs
- Link **forward** when you introduce a new idea
- Review **backlinks** weekly — they surface unexpected structure

## Map

- [[Knowledge OS]]
- [[Graph Thinking]]
- [[Welcome]]
`,
    ),
  );

  add(
    note(
      pathJoin("Research", "Graph Thinking.md"),
      "Graph Thinking.md",
      research.id,
      `# Graph Thinking

Graphs make invisible structure **visible**.

## Why force-directed graphs work

Nodes repel; links attract. Over time, tightly related notes cluster. Orphans float. Hubs dominate.

### Visual language

- **Accent cyan** nodes with soft outer glow
- **Size by degree** — highly connected notes read as gravity wells
- **Edges** stay low-opacity so the field stays calm

## Interaction model

- Hover → title + preview
- Click → open note
- Drag / zoom / pan for spatial exploration
- Panel mode for context; fullscreen for deep work

## Seed links

- [[Knowledge OS]]
- [[Linking Strategy]]
- [[Design Language]]
- [[Hermes Compatibility]]
`,
    ),
  );

  add(
    note(
      pathJoin("Research", "Design Language.md"),
      "Design Language.md",
      research.id,
      `# Design Language

Inspired by high-precision engineering interfaces — dark, confident, technically sophisticated.

## Palette

- Deepest background \`#050507\`
- Surfaces \`#0F0F12\` → \`#1C1C21\`
- Accent electric cyan \`#00C8FF\`
- Soft violet secondary \`#7B61FF\`

## Glass

Floating panels use translucent surfaces with \`backdrop-filter: blur(24px)\` and hairline borders.

## Motion

- 220–280ms ease curves
- Restrained scale on hover (\`1.02\`)
- Graph physics should feel like soft springs — never chaotic

## Related

- [[Knowledge OS]]
- [[Welcome]]
`,
    ),
  );

  add(
    note(
      pathJoin("Systems", "Hermes Compatibility.md"),
      "Hermes Compatibility.md",
      systems.id,
      `# Hermes Compatibility

Hermes (and any external process) must be able to treat this vault as ordinary files.

## Contract

- Notes = \`.md\` files
- Folders = directories
- Images = relative paths (prefer \`assets/\`)
- No proprietary metadata inside note bodies
- App cache only under \`.noteapp/\`

## Live watching

Creates, edits, renames, and deletes from outside the app must appear in the UI within **1–2 seconds**.

## Clean Markdown

When the app writes a note, the result must remain readable by:

- Any text editor
- \`git diff\`
- Agents and CLI tools

## Linked ideas

- [[Knowledge OS]]
- [[Welcome]]
- [[Graph Thinking]]
`,
    ),
  );

  add(
    note(
      pathJoin("Systems", "Keyboard Map.md"),
      "Keyboard Map.md",
      systems.id,
      `# Keyboard Map

| Shortcut | Action |
| --- | --- |
| ⌘K | Command palette / search |
| ⌘E | Toggle visual / source |
| ⌘\\\\ | Toggle left sidebar |
| ⌘⌥\\\\ | Toggle right panel |
| ⌘G | Toggle full graph |
| ⌘N | New note |
| ⌘S | Save (auto-save is on) |
| ⌘B / ⌘I | Bold / italic in editor |

## Philosophy

Keyboard is the primary interface for power users. Mouse is always available; shortcuts never required for basics.
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

The graph already shows structure forming between [[Knowledge OS]], [[Graph Thinking]], and [[Hermes Compatibility]]. That feedback loop — write, link, see — is the product.

## Tasks

- [x] Seed demo notes
- [x] Wire wikilinks
- [ ] Capture a real research thread
- [ ] Attach a diagram to assets/

## Log

Felt immediate. Calm center, powerful edges.
`,
    ),
  );

  const rootIds = [welcome.id, projects.id, research.id, systems.id, journal.id];

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

This note was written by an **external process** (simulated Hermes agent).

Timestamp: ${"${TS}"}

## Observation

The filesystem watcher picked this up without manual refresh. The vault remains a plain folder of Markdown.

## Links

- [[Hermes Compatibility]]
- [[Knowledge OS]]
- [[Welcome]]
`,
};
