# Hierarchical Folder Graph — Implementation Plan (12-Agent Review)

**Status:** **Implemented** (Waves 1–5) · 2026-08-03  
**Reviewed:** 2026-08-03 · Architecture · UX continuity · Scale · Product/IA · State · A11y · Platform · QA · Risk · Phasing · Docs honesty · Integration  
**Hard constraint:** Must **not** break the current metal-orb / galaxy graph look and feel.

---

## Executive summary

| Question | Answer |
|----------|--------|
| What ships? | Smart “whole vault” map: **folder spheres → click enter → notes/subfolders**, plus existing FullNotes (small) and EgoLinks (large + note focus) |
| Why? | Huge vaults need structure without drawing 300k–500k orbs |
| Look & feel? | **Same `createOrb` metal pipeline**, galaxy void, glass badges — folders differ by **size (`val`)** only (+ optional tiny clearcoat delta) |
| When? | After **you review this plan** → implement Waves 1→5 |
| Kill switch | `folderGraph: false` in scale-flags restores today’s ego/full path |

**Consensus GO:** all 12 agents **GO for implement** after this freeze.  
**NO-GO until Wave 1 pure API tests green** before any GraphView UI.

---

## 1. Problem

| Vault size | Today | Gap |
|------------|--------|-----|
| Small / demo (`N < ~400`) | Full note wikilink graph | OK — **must stay** |
| Large | Ego (2-hop near active) only | No honest **whole-vault structure** overview |
| Huge (300k–500k) | Must never materialize all notes | Need folder levels without freeze |

User proposal (**accepted**): folder spheres for overview → click enter → content spheres. Same orb language.

---

## 2. Locked product principles

1. **Same look & feel** — only `createOrb` metal materials, galaxy void, glass badge chrome, existing icon-btn cluster. No cubes/icons/portals in 3D.
2. **Never 500k orbs** — hard draw budget **`folderMaxNodes = 320`** (LOD belt 400 for note modes).
3. **Automatic scale** — no user “Large Vault Mode” toggle.
4. **Honest labels** — `4 folders · 1 note · whole vault` vs `87 of 10,240 notes · near active`.
5. **Demo stays delightful** — `N < 400` always **FullNotes**.
6. **Tree = hierarchy truth** — graph is a spatial projection of the same folders.
7. **Link thinking stays ego** — opening a note on a large vault still uses neighborhood graph for `[[wikilinks]]`.

---

## 3. Three graph modes (auto)

| Mode | Drawn | When (automatic) |
|------|--------|------------------|
| **FullNotes** | Every note (+ ghosts), soft folder clustering | `noteCount < 400` |
| **FolderBrowse** | Immediate **child folders** + **notes in this folder** as orbs | Large vault + map intent (root or drilled path) |
| **EgoLinks** | Active note + ~2-hop wikilinks | Large vault + ego intent + active note |

### Mode resolution (frozen)

```
if N < folderGraphMinNotes (400) OR forceFull (tests only):
  → FullNotes  (buildGraph forceFull)
else if graphScopeMode === "ego" AND activeNoteId:
  → EgoLinks   (buildEgoGraph)
else:
  → FolderBrowse at graphBrowsePath  (buildFolderGraph)
     // vault | folder scope; empty path = root
```

**Store holds intent + path only.** Display mode is **derived** in GraphView / `resolveGraphData` — never stored as FullNotes|FolderBrowse|EgoLinks.

### Event → scope

| Event | Scope write |
|-------|-------------|
| Folder orb click | `enterGraphFolder(path)` → mode vault/folder, path set |
| Note orb (large) from map | `enterGraphEgo({ returnPath })` + `setActiveNote` |
| Globe / Vault map | `resetGraphBrowse()` → vault root FolderBrowse |
| Esc / breadcrumb Up | `exitGraphFolder()` (one segment) |
| Wikilink open (large) | `enterGraphEgo()` after `setActiveNote` |
| FileTree / CmdK note select | **`setActiveNote` only** — no scope thrash |
| closeVault / vault open | Reset scope to vault / `""` / null |

---

## 4. Look & feel lock (UX continuity — ship-block if violated)

### Unchanged (pixel-level contract)

| Layer | Rule |
|-------|------|
| Void | `#03050a` host + galaxy backdrop (`buildSpaceBackdrop`) |
| Orbs | **Only** `createOrb` → `SphereGeometry` + `MeshPhysicalMaterial` + shell + optional torus |
| Palette | `folderTintColor` HSL slots only; CSS `--accent` for emissive/edges |
| Size curve | `base + pow(max(1,val), 0.55) * scale * rank` |
| Chrome | Glass pill: `rounded-full border-white/[0.06] bg-black/40 backdrop-blur-sm` |
| Controls | icon-btn cluster; order Ghost → 1-hop/Globe → Export → Fullscreen |
| Camera | `zoomToFit(650, pad)` / fly-to 750ms — **no** cinematic wipes |

### Allowed deltas for folder orbs

| Parameter | Allowed |
|-----------|---------|
| Size | **Yes — via `val` only** (from direct note count); clamp `val ∈ [1, ~80]` |
| Color | Same `folderTintColor(parentPath)` |
| Clearcoat | Optional **+0.06…0.10** on folders only; never above active 0.75 |
| Aggregate `+N more` | Dimmer opacity ~0.38–0.55, **not** `ghost:true` |
| Edges between folders | **None** in v1 |

### Forbidden

New 3D shapes · second material system · new accent · portal transitions · card breadcrumb UI · ghosts in FolderBrowse · user hierarchy toggle · demo forced into folder map · dishonest “full graph” copy.

---

## 5. Interaction model

| Action | Result |
|--------|--------|
| Click **folder** sphere | Enter folder (one level of children) |
| Click **note** sphere | Open note; large → EgoLinks; remember return path |
| Click **aggregate** | No-op v1 (or later list); never explode 50k orbs |
| Click **ghost** | Create missing note (**note modes only**) |
| Breadcrumb / Esc (drilled) | Up one level (**Esc before fullscreen exit**) |
| 1-hop / ghosts | FullNotes / Ego only; **hide** in FolderBrowse |
| Globe | Large: Vault map root FolderBrowse; small: leave 1-hop as today |
| Export PNG / fullscreen | Unchanged chrome; **scope-aware footer** |

**Hint (FolderBrowse):**  
`Orbit · Zoom · Pan · Click folder to enter · Click note to open · Esc up`

**Badge patterns (copy-paste):**

| Mode | Pattern |
|------|---------|
| FullNotes | `{N} notes · {L} links` |
| FolderBrowse root | `{F} folders · {n} notes · whole vault` |
| FolderBrowse drilled | `{F} folders · {n} notes · in {FolderName}` |
| FolderBrowse capped | + `Showing {shown} of {total}` |
| EgoLinks | `{shown} of {vaultN} notes · {L} links · near active` |

**Breadcrumb:** second glass pill under badge — `Vault · Projects · Specs` (middots, not a card).

---

## 6. Public API (implementation-ready)

### 6.1 `src/lib/graph/folder-graph.ts` (new)

```ts
export type FolderGraphOpts = {
  /** Folder node id; null = vault root children */
  levelFolderId: string | null;
  maxNodes?: number; // default scale-flags.folderMaxNodes (320)
};

export type FolderGraphStats = {
  levelFolderId: string | null;
  levelPath: string; // "" at root
  childFolderCount: number;
  childNoteCount: number;
  shownNodeCount: number;
  capped: boolean;
  omittedCount: number;
};

export function buildFolderGraph(
  nodes: Record<string, VaultNode>,
  index: VaultStructuralIndex,
  opts: FolderGraphOpts,
): { mode: "folder"; nodes: GraphNode[]; edges: GraphEdge[]; stats: FolderGraphStats };
```

**Rules:**
- Children via **`index.getChildIds` only** — O(k), never full-vault scan
- Cap: folders first (name), then notes (mtime desc); remainder → one `kind:"aggregate"` `+N more`
- Edges: **always `[]`** in v1
- Ghosts: **never**
- Folder `degree` / size signal = direct child note count (MVP)

### 6.2 `resolveGraphData` facade (`build-graph.ts`)

```ts
export type GraphViewMode = "full" | "folder" | "ego";

export function resolveGraphData(
  nodes: Record<string, VaultNode>,
  opts: {
    noteCount: number;
    activeNoteId: string | null;
    graphBrowsePath: string;           // "" = root
    graphScopeMode: "vault" | "folder" | "ego";
    forceFull?: boolean;               // tests only
    maxFolderNodes?: number;
  },
): {
  mode: GraphViewMode;
  nodes: GraphNode[];
  edges: GraphEdge[];
  ego?: boolean;
  capped: boolean;
  stats: { /* vaultNoteCount, shownNoteCount, shownFolderCount, linkCount,
              ghostCount, levelPath, omittedCount, isPartialVault */ };
};
```

Keep exports: `buildGraph`, `buildEgoGraph`, `resolveWikilink` (no mode side-effects inside resolver).

### 6.3 GraphNode (additive only)

```ts
export type GraphNodeKind = "note" | "folder" | "aggregate";

// on GraphNode — optional:
kind?: GraphNodeKind;      // absent = note (legacy FullNotes/Ego)
noteCount?: number;        // folder/aggregate sizing
aggregate?: boolean;       // prefer kind === "aggregate"
```

### 6.4 Scale flags

```ts
folderGraph: true,
folderGraphMinNotes: 400,
folderMaxNodes: 320,
// keep
egoGraph: true,
egoGraphMinNotes: 400,

shouldUseFolderGraph(n) // n >= folderGraphMinNotes && folderGraph
```

Kill switch: `folderGraph: false` → today’s path only.

---

## 7. State (store session — not settings)

**Do not** overload `settings.graphMode` (`panel | fullscreen | hidden`).

| Field | Type | Default | Persist |
|-------|------|---------|---------|
| `graphScopeMode` | `"vault" \| "folder" \| "ego"` | `"vault"` | Session only |
| `graphBrowsePath` | `string` | `""` | Session only |
| `graphEgoReturnPath` | `string \| null` | `null` | Session only |

**Actions:**  
`enterGraphFolder` · `exitGraphFolder` (returns boolean if popped) · `resetGraphBrowse` · `enterGraphEgo` · `returnFromGraphEgo` · `revealInGraph` (Wave 5) · `ensureGraphVisible` (Wave 5)

**Critical thrash rule:** `setActiveNote` must **not** write graph scope. Callers that need ego call `enterGraphEgo` themselves (graph note click, wikilink).

**Local to GraphView:** 1-hop, ghosts, hover, camera, force-graph instance, hint visibility.

**Dual GraphView (panel/fullscreen):** exclusive mount; **scope in store** so drill survives remount.

---

## 8. Fingerprints & performance

| Mode | Rebuild key | Cost |
|------|-------------|------|
| FolderBrowse | `structureGeneration + graphBrowsePath + folderMaxNodes` | **O(1)** key; rebuild O(k) capped |
| EgoLinks | link-index gen + centerId + hops | Avoid full-vault string join |
| FullNotes (`N < 400`) | existing link structure key OK | O(N) acceptable under 400 |

**R5 (P0):** Folder mode must **not** reuse `linkStructureKey` (O(N) + `getContentLinkSig` every keystroke).

**LOD:** Skip `applyLodCap` in FolderBrowse (builder already capped; degree-0 folders would be culled).

**Counts:** MVP = **direct children** only. `descendantNoteCount` later (structure rebuild only).

---

## 9. Accessibility

| Priority | Esc / chrome |
|----------|----------------|
| 0–2 | Settings / CmdK / dialogs first |
| **3** | `exitGraphFolder` if path non-empty |
| 4 | Exit fullscreen |
| 5 | Focus mode |

- Canvas host: `aria-hidden="true"`; outer `.graph-host` = `role="region"` + dynamic `aria-label`
- Breadcrumb: real buttons; `nav[data-graph-breadcrumb]`
- Live region: `Entered Projects. 12 notes, 4 subfolders.`
- P0 listbox for keyboard enter (Wave 5 polish OK; needed for keyboard-complete FolderBrowse)
- Must not break `formatShortcut("G")` / ⌘G

---

## 10. Platform tiers

| Tier | Graph default | Budget | FX |
|------|---------------|--------|-----|
| Web demo | FullNotes if small | ≤320–400 | Light WebGL (`desktopBoost=false`) |
| Desktop Tauri | FolderBrowse + Ego | ≤320–400 | Current metal boost |
| Mobile (future) | FolderBrowse first | **≤120** | Particles off, 44px chrome — **do not** use `isDesktopShell()` alone (`tauri-mobile` pitfall) |

**Ship now:** web + desktop. Mobile tier deferred.

---

## 11. Implementation waves (ship-safe)

| Wave | Deliverable | Exit criteria |
|------|-------------|-----------------|
| **1** | Pure `folder-graph.ts` + types + flags + unit tests | 50k flat → ≤320 nodes; **app identical** (no GraphView wire) |
| **2** | `resolveGraphData` + GraphView auto mode + mode-gated fingerprint | Demo FullNotes; large non-blank folder/ego |
| **3** | Store session + enter/exit + breadcrumb + badge + Esc | Drill works panel + fullscreen |
| **4** | Caps, aggregates, empty folder, mega-folder honesty | Never > cap; showing N of M |
| **5** | Tree/CmdK reveal, a11y list, SCALING + Settings one-liner, double QA | `qa:gate` green; D1–D8 + large matrix |

```
W1 (pure) ──► W2 (auto mode) ──► W3 (nav chrome) ──► W4 (caps) ──► W5 (integration)
                 ▲
                 └── UI agents MUST NOT start before W1 green
```

**Do not merge waves.** Big-bang on GraphView (~1.7k LOC) + store (~3.6k) is critical risk.

---

## 12. QA gates

### Unit (`folder-graph.contract.mjs` — Node + esbuild, like wave-c)

U1 empty · U2 root mixed · U3 enter folder · U4 empty folder · U5 nested · U6 cap · U7 **50k flat** · U8 multi-folder overview · U9 determinism · U10 no folder edges · U11 no ghosts · U12 val clamp · U13 content-edit fingerprint stable · U14 structure change · U15 path normalize · U16 O(k) children only  

R1–R5: mode matrix via `resolveGraphData`.

### Demo regression (block ship if fail)

D1–D8: full note galaxy feel, ~9–10 notes as orbs + links, ghosts/1-hop/export, **not** folder-only map.

### Block-ship

| # | Condition |
|---|-----------|
| B1 | Demo forced folder-only |
| B2 | Large vault draws ≫400 note orbs |
| B3 | 50k → ~50k nodes |
| B4 | Blank graph / WebGL crash |
| B5 | Esc exits fullscreen before folder up |
| B6 | New 3D chrome / broken metal look |
| B7 | Ghosts in pure FolderBrowse |
| B8 | typecheck / `qa:gate` red |
| B9 | Double-QA independent fail |
| B10 | Dishonest 500k-orbs copy |
| B11 | `forceFull` on disk large vaults |
| B12 | O(N) folder fingerprint on keystroke |

### Screenshots

`screenshots/folder-graph/` — demo panel/fs/select · large root · enter folder · ego · cap · chrome.

---

## 13. Risk register (ranked)

| ID | Sev | Risk | Mitigation |
|----|-----|------|------------|
| R3 | P0 | Full-vault materialize | Cap in builder; never forceFull product path |
| R5 | P0 | O(N) linkStructureKey | Mode-gated folder fingerprint |
| R1 | P0 | Wrong mode / blank graph | Explicit resolve matrix; never empty without EmptyState |
| R4 | P1 | Selection thrash | setActiveNote ≠ scope |
| R6 | P1 | Demo regression | N<400 hard FullNotes |
| R2 | P1 | Folder orbs “new product” | createOrb only |
| R8 | P1 | Flat mega-folder | Cap + aggregate |
| R10–R12 | P1–P2 | Ghosts / export / Esc | Mode-gate + scope-aware footer + Esc order |

**Rollback:** W1 delete module · W2 `folderGraph:false` · W3 clear path chrome · never half-wire full buildGraph on large N.

---

## 14. Docs honesty (ship with UI)

| Say | Never say |
|-----|-----------|
| Whole vault **structure** (tree + folder map) | “Renders all 500k notes as orbs” |
| Folder map · near active · showing N of M | “Global graph unlimited” |
| Small vaults: full note wikilink graph | Implying large vaults draw every note |

**Settings Help (on ship):**  
`The graph maps [[wikilinks]] and a folder map for large vaults: folder spheres open a level; notes open and show links near the active note. Small vaults still show every note. Click a node to open it.`

**SCALING.md:** add Graph modes section (FullNotes / FolderBrowse / EgoLinks) when implementing Wave 5.

**Export footer:** scope-aware (`folder map · …` / `near active` / full notes).

---

## 15. Integration touch points

| File | Change |
|------|--------|
| `src/lib/graph/folder-graph.ts` | **NEW** pure builder |
| `src/lib/graph/build-graph.ts` | `resolveGraphData` facade |
| `src/lib/vault/types.ts` | Additive GraphNode fields + scope types |
| `src/lib/vault/scale-flags.ts` | folder flags + helpers |
| `src/lib/vault/store.ts` | Session fields + actions; reset on open/close |
| `src/components/graph/GraphView.tsx` | Mode data, click, chrome, fingerprint (single owner) |
| `src/components/chrome/KeyboardShortcuts.tsx` | Esc folder-up before fullscreen |
| `src/components/editor/VisualEditor.tsx` | Wikilink → `enterGraphEgo` (large) |
| `src/components/vault/FileTree.tsx` | Wave 5 Reveal in graph |
| `src/components/search/CommandPalette.tsx` | Wave 5 reveal action |
| `src/components/settings/SettingsPanel.tsx` | Help one-liner |
| `docs/SCALING.md` | Graph modes honesty |
| `package.json` | `test:folder-graph` → `qa:gate` |

**Untouched:** Pulse, conflicts, createOrb geometry language, exclusive RightPanel dual mount, `resolveWikilink` purity.

---

## 16. Decision freeze (implementers — do not reopen)

| Question | Decision |
|----------|----------|
| Enter folder | **Single click** on folder orb |
| Level key | **Path string** in store (`graphBrowsePath`); builder resolves folder id via `pathToId` / root null |
| Note from folder map | Open + **EgoLinks**; remember return path |
| Demo | **Always FullNotes** if N < 400 |
| Folder–folder edges v1 | **No** |
| Ghosts in folder overview | **Off** |
| User hierarchy toggle | **No** |
| Draw budget | **≤ 320** builder / **400** LOD belt |
| setActiveNote vs scope | **Decoupled** |
| Dual GraphView scope | **Store**, not local React state |
| LOD on folder results | **Off** |
| Cap selection | Folders first, then notes by mtime; one aggregate |
| `settings.graphMode` | Panel/fullscreen only — never scope |
| Mobile | Deferred; fix `isDesktopShell` FX split later |

### Agent consensus (12/12)

| # | Agent | Verdict |
|---|--------|---------|
| 1 | Architecture | **GO** Wave 1 now; W2+ with store freeze |
| 2 | UX continuity | **GO** if createOrb-only + glass pills |
| 3 | Scale / perf | **GO** if cap pre-materialize + O(1) fingerprint |
| 4 | Product / IA | **GO** stories + freeze locked |
| 5 | State | **GO** session fields; no settings pollution |
| 6 | A11y | **GO** design; listbox P0 for keyboard ship |
| 7 | Platform | **GO** web+desktop first |
| 8 | QA | **GO** plan; **NO-GO ship** until units + double QA |
| 9 | Risk | **GO** with kill switch + canaries |
| 10 | Phasing | **GO** sequential W1→W5 |
| 11 | Docs honesty | **GO** claims; ship docs with UI |
| 12 | Integration | **GO** design; exclusive dual-host + store scope |

---

## 17. What to try after implement (preview checklist)

1. **Demo** — full note galaxy, click notes, ghosts, 1-hop (unchanged feel)
2. **Large vault** — root folder map badge `folders · notes · whole vault`
3. **Click folder** — enter level; breadcrumb; Esc up
4. **Click note** — open + near-active ego; Globe back to map
5. **Cap** — mega-folder shows `+N more`, never freezes

---

## Next step

**You review this plan → say proceed** → implement Waves 1→5 with multi-agent build + double QA, preserving metal-orb / galaxy aesthetics.
