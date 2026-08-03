# Nexus Vault Scaling Plan — 400k–500k Notes

**Repo:** `cinder-apple-pine-blend` (dev). `nexus-app` stays until public release.  
**Goal:** Comfortably handle **400,000–500,000** notes (Hermes-compatible plain-folder markdown), with headroom beyond that on desktop.

---

## Current state (why 1–2k walls)

Today the vault is an **eager in-memory mirror** of every `.md` body:

| Layer | Behavior | Wall |
|-------|----------|------|
| **Store** | `nodes: Record<id, VaultNode>` with **full `content`** | RAM + shallow-copy on every edit |
| **Tree** | `getChildren` = `Object.values.filter(parentId)` **O(n)** | Expanded folders thrash |
| **FileTree** | No virtualization; `childSig` rescans whole vault | DOM + O(F×n) selectors |
| **Search** | Fuse.js over **full bodies** (2nd copy); O(n) cache keys | Main-thread freezes |
| **Backlinks/tags** | Full rebuild / full scan on edit | Panel open + save jank |
| **Graph** | Builds from all bodies; renders LOD 400 | Build is the killer |
| **FS/Tauri** | Sequential full-text walk on open | Minutes + multi-GB at 500k |

**Verdict:** Demo-scale architecture. **500k is not a polish pass** — it needs tree indexes + lazy content + real FTS + virtualized UI.

---

## Target architecture

```
┌──────────────────────────────────────────────────────────────┐
│  UI (Zustand): active note, expanded folders, settings, UI   │
│  Hot metadata cache: id → {path,name,kind,parentId,mtime}    │
├──────────────────────────────────────────────────────────────┤
│  Structural indexes (always hot)                             │
│  • childrenByParent  • pathToId  • titleToIds / prefix list  │
│  • forward/reverse links  • tags                             │
├──────────────────────────────────────────────────────────────┤
│  Full-text (worker / native)                                 │
│  Browser: MiniSearch/Orama (title+path+snippet)              │
│  Desktop: SQLite FTS5 (Tauri)                                │
├──────────────────────────────────────────────────────────────┤
│  Bodies: disk is source of truth; LRU cache (~50–200 open)   │
└──────────────────────────────────────────────────────────────┘
```

**Performance targets @ 500k notes (desktop):**

| Operation | Target |
|-----------|--------|
| Open vault (metadata) | < 3–5s progressive |
| Expand folder / scroll tree | 60fps, ≤50 DOM rows |
| Title / wikilink suggest | ≤ 10–20ms |
| Full-text top-20 | ≤ 50ms (FTS5) |
| Save note → indexes ready | O(tokens of that note) |
| Graph | Ego / cluster only — never 500k orbs |
| RAM | Metadata ~150–300MB + LRU bodies, not multi-GB of all text |

---

## Phased plan (agent mix)

### Phase 0 — Measure (½ day)
- Synthetic vault generator (10 / 1k / 10k / 50k notes)
- Bench: open, getChildren×100, search, backlinks, graph build
- Baseline numbers committed under `scripts/bench-scale.mjs`

### Phase 1 — Tree + structural indexes  ✅ IN PROGRESS
**Unblocks: 1k → ~10–20k (with full content still in RAM)**

| Workstream | Agent focus | Deliverable |
|------------|-------------|-------------|
| **Index engine** | Data structures | `src/lib/vault/indexes.ts` — children, path, title, generations |
| **Store wiring** | Zustand | `getChildren` O(k); path lookups via index; generation hooks |
| **FileTree selectors** | UI perf | Replace O(n) `childSig` with `childSignature` |
| **Search invalidation** | Search | Drop O(n) vaultKey strings; use index generation; truncate Fuse body |
| **Wikilink suggest** | Editor | Title index path (no body scan) |
| **Backlinks** | Index | Generation-based cache; later incremental patch |
| **Tests** | QA | Unit + microbench for indexes |

### Phase 2 — Virtualized tree + subscription hygiene
**Unblocks: large folders (10k+ notes in one dir)**

| Workstream | Deliverable |
|------------|-------------|
| Flattened visible rows + windowing | `@tanstack/react-virtual` or custom window |
| Selectors | Never `useVaultStore(s => s.nodes)` for chrome |
| Content edit identity | Isolate body updates from structure subscribers |
| DnD | Hit-test virtual rows |

### Phase 3 — Lazy bodies + adapter meta walk
**Unblocks: 50k–100k without OOM**

| Workstream | Deliverable |
|------------|-------------|
| Meta-only scan | `walkVaultMeta` / Tauri bulk walk command |
| `readNote(path)` on open | Content only for active + dirty + LRU |
| Incremental watch | Path patches; raise/remove “40 changes → full rescan” cliff |
| Graph link index | Store outgoing links on save; no full-body graph key |

### Phase 4 — Real search engine
**Unblocks: snappy search at 100k+**

| Workstream | Browser | Desktop |
|------------|---------|---------|
| Engine | MiniSearch/Orama in **Worker** | **SQLite FTS5** via Tauri |
| Docs | title + path + first 2–4KB | Full body FTS |
| Updates | Incremental add/remove/update | Delta on watch |
| Tags / orphans | Persistent maps | SQL tables |

### Phase 5 — Graph at scale
- Default **ego graph** (1–2 hops from active)
- Folder supernodes / cluster overview
- Never force-layout full vault
- Precomputed edge table in SQLite/IDB

### Phase 6 — Desktop native path (500k headroom)
- Rust: parallel walk, `notify` FS events, SQLite index DB beside vault (or in app data)
- One IPC round-trip for meta listing
- Optional: content hash for conflict/sync
- Stress test 500k synthetic vault on Mac build

### Phase 7 — Hardening
- Progressive hydrate + open progress UI
- Memory budgets / “large vault mode” prefs
- Import tooling (Obsidian/Hermes folder) chunked
- Docs for power users

---

## Agent roster (specialized)

Use parallel agents per phase; one owner integrates.

| Agent | Owns |
|-------|------|
| **Architect** | Contracts, phase gates, non-goals |
| **Index engineer** | `indexes.ts`, backlinks, tags, path/title maps |
| **Store engineer** | `store.ts` mutations, generations, lazy content API |
| **Search engineer** | Fuse → MiniSearch/Orama/FTS5, worker, cmdk debounce |
| **Tree/UI engineer** | FileTree virtualization, LeftSidebar, selectors |
| **FS/Desktop engineer** | fs-adapter, tauri-adapter, watcher, Rust walk |
| **Graph engineer** | build-graph, GraphView LOD / ego mode |
| **Perf/QA** | benches, Playwright large-vault smoke, memory snapshots |

---

## Implementation status

| Phase | Status |
|-------|--------|
| Phase 0 benches | Scaffolded (`scripts/bench-scale.mjs`) |
| Phase 1 indexes | **Shipped:** structural index + store/search/tree/suggest wiring |
| Phase 2 virtualization | Next |
| Phase 3 lazy bodies | Planned |
| Phase 4 FTS | Planned |
| Phase 5–7 | Planned |

### Phase 1 files

- `src/lib/vault/indexes.ts` — core adjacency + path + title + generations
- `src/lib/vault/store.ts` — `getChildren` via index
- `src/components/vault/FileTree.tsx` — O(k) child signatures
- `src/lib/search/fuse-search.ts` — generation cache + truncated content docs
- `src/lib/vault/backlink-index.ts` — generation invalidation
- `src/lib/editor/wikilink-suggest.ts` — title index suggest
- `scripts/bench-scale.mjs` — microbench

---

## Non-goals (for now)

- Multi-user CRDT / cloud-native note DB (disk markdown stays source of truth)
- Shipping index format into Hermes (index is disposable cache)
- Rendering 500k nodes in 3D graph

---

## Decision log

1. **Markdown-on-disk remains canonical** (Hermes-compatible).
2. **Desktop is the 500k primary path**; browser aims for solid 20–50k with progressive limits.
3. **Fuse is transitional** — not the long-term full-text engine.
4. **Indexes are derived** — safe to wipe and rebuild from files.
