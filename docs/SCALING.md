# Nexus Vault Scaling — Single Path to 300k–500k

**Goal:** Comfortably handle **300k–500k** notes on Desktop (plain-folder markdown), with headroom beyond. Web = demo/QA only. Mobile later via shared DurableIndex schema.

The interactive shell does not hold the catalog. See [SHELL-CATALOG.md](./SHELL-CATALOG.md) and [VAULT-CONTRACT.md](./VAULT-CONTRACT.md). A large desktop vault keeps a window of notes in the renderer and asks SQLite for the next page. A large browser folder uses the same window and still refuses above the Chrome cap. The metadata RAM budget below is the old in-memory mirror, not the shell path.

## Scale continuum (product law)

Nexus is one product from a handful of notes through about 500,000. Same craft. There is no toy mode that breaks at scale, and no enterprise mode that feels heavy or empty on a small vault. The switch is automatic. Drawing 500k orbs is the wrong picture: the folder map and the ego neighborhood stay buttery, and a 12-note vault still gets the full galaxy.

| Band | Vault | Flawless means |
|------|--------|----------------|
| Small | a handful, under 400 notes | Instant open. Full note graph, not a folder stub. First-run is the product. No dead chrome. |
| Mid | ~20k–45k | No freezes. Links and backlinks match the notes. Graph Exit and HUD stay solid. Folder map or ego, not every note. |
| Huge | ~100k–500k desktop | Cold open is useful in seconds. Search fills progressively without freezing the UI. Graph stays inside the folder budget (320) and the ego budget (400). Clicks stay snappy while the index fills. |

This law binds the release gates:

- **Gate A — reliability.** The graph does not throw, and `[[wikilinks]]` are indexed before large-vault bodies are stripped. AppShell stays the real shell.
- **Gate B — craft.** Prove the same craft on a demo/small vault and on a large soak vault before calling craft done.
- **Gate C — scale.** Cold open and progressive keyword search at 100k. Honest retrieval (no fake semantic rank). Desktop is the 500k path. The browser stays capped.
- **Gate D — soak.** A human pass on both ends of the continuum. Stay draft until that pass.

Browser vaults refuse around 25k notes. A 500k vault is a desktop folder.

## Honest limits (measured)

These are the budgets the app actually uses, and what has been opened.

| Vault | What you see | Status |
|-------|----------------|--------|
| Under 400 notes | Full note graph. Not a folder stub. | Demo vault, checked. |
| 400 notes and up | Folder map, at most 320 nodes, or an ego neighborhood, at most 400 nodes and 2 hops. | 45k in-browser seed draws a folder map (9 folders, 0 note orbs) and an ego of the open note. |
| Browser folder | Warns around 15,000 notes. Refuses at 25,000. | Cap in `chrome-fsa-cap.ts`. The 45k seed is a dev fixture, not a Chrome folder. |
| Desktop 100k | Cold open stays usable while search heads fill. SQLite FTS5 BM25. Folder map, not one orb per note. | A local 100k folder stayed mounted through the fill. Around 81% the search palette returned 16 SQLite FTS5 hits, a folder expanded, and a note opened while the counter kept climbing. A remount joins that fill instead of dumping you on Welcome. |
| Desktop 500k | Same path as 100k: folder map or ego, progressive FTS, bodies on demand. | Not opened. Do not treat 500k as a timed result. |

A hot 45k open (demo session, then the large seed, graph panel still mounted) used to loop React until "Maximum update depth." The file-tree and graph snapshots no longer touch the vault index during render. Fresh and hot opens of that seed stay up.

---

## Public-release plan (99%)

| Wave | Name | Status |
|------|------|--------|
| **A** | Trust (ship-stoppers) | **Shipped** |
| **B** | Engine & agents | **Shipped** |
| **C** | Product polish (first hour) | **Shipped** |
| **D** | Desktop public package | Pending |
| **E** | Proof & GA | Pending |

---

## Wave A — Trust (shipped 2026-08)

| Item | Status |
|------|--------|
| Sanitize Markdown HTML before Visual mode | **Done** |
| Escape image attrs on serialize | **Done** |
| Desktop CSP non-null | **Done** |
| FS scope narrowed (no `/Users/**` whole-home write) | **Done** |
| Rust vault root register + index path under app data | **Done** |
| FSA trash hydrates body (never write empty then delete) | **Done** |
| Unique `.trash/` names | **Done** |
| Dirty badge + click-to-save + `beforeunload` | **Done** |
| `closeVault` awaits `flushDirty` | **Done** |
| Demo stays on Welcome (no launch-note hijack) | **Done** |
| Unsupported folder-picker messaging | **Done** |
| `__NOTEAPP__` DEV-only | **Done** |
| Reverse link keys normalized | **Done** |
| Wikilinks in code fences ignored | **Done** |

## Wave B — Engine (shipped 2026-08)

| Item | Status |
|------|--------|
| Open FTS reconcile without wipe | **Done** |
| Memory mirror hydrate from SQLite on open | **Done** |
| Upsert preserves FTS body when note unloaded | **Done** |
| Path-incremental desktop watch (notify paths) | **Done** |
| Raised full-rescan cliffs (not 40-change) | **Done** |
| Native watch resync threshold 400 paths | **Done** |
| External apply uses durable reconcile | **Done** |
| Conflict Studio MVP (keep mine / take theirs / open both) | **Done** |
| Automatic memory budget (LRU, no user toggle) | **Done** |
| DurableIndex v3 contract frozen for mobile | **Done** |
| Path-patch pure merge (`path-patch.ts`) | **Done** |
| Stress harness `bench:stress` (50k meta) | **Done** |

## Wave C — Product polish (shipped 2026-08)

**Goal:** first hour feels finished · Design + UX re-score ≥ 85% · no first-run dead ends

| Item | Status |
|------|--------|
| Visual system pass — solid panels, type tokens, accent CTAs, compact density | **Done** |
| Editor paste (MD + images) + create-from-wikilink + task/table/image serialize fixes | **Done** |
| Tag rail (vault tags) · empty vault CTAs · in-app trash restore (Pulse → Recently deleted) | **Done** |
| Agent inbox vault-scoped · mark read · Open Pulse from toast | **Done** |
| Keyboard file tree + icon aria-labels | **Done** |
| EN-only UI · shortcuts show ⌘ or Ctrl by platform | **Done** |
| Honest Settings copy (progressive open, cloud = synced folder) | **Done** |
| Welcome: disable dead Open/Create when folder API unavailable | **Done** |

### Wave C modules

| Module | Role |
|--------|------|
| `src/lib/platform.ts` | `formatShortcut`, `isAppleModPlatform` |
| `src/lib/vault/pulse.ts` | vaultId · read · clear · unread |
| `src/lib/vault/trash.ts` | parse / list / restore helpers |
| `src/lib/markdown/serialize.ts` | task normalize before sanitize; image chrome strip |
| `src/components/right/PulseRail.tsx` | mark read · Recently deleted |
| `src/components/chrome/Toast.tsx` | action → Open Pulse |
| `src/components/layout/LeftSidebar.tsx` | Tags rail · solid panel · platform shortcuts |

Still pending later (release ops / real hardware):

- **Wave D:** sign + notarize + DMG + auto-update + product docs
- **Wave E:** real-disk 100k/300k open numbers on Mac/Windows (`npm run soak:wave-e-desktop` + `tauri:dev`). Not proven. Not SCALE READY.
- Optional store-level O(k) apply without shallow-copy map

---

## DurableIndex v3 contract (frozen for mobile)

Canonical module: [`src/lib/vault/index-contract.ts`](../src/lib/vault/index-contract.ts)

- Schema version **3** (TS + Rust must match)
- Tables: `meta_kv`, `note_meta`, `link_edge`, `tag_map`, `note_fts`, `vault_registry`, `capture_queue`
- Index is **disposable** — markdown remains source of truth
- Desktop path: `{appDataDir}/indexes/{fnv64(vault_root)}.sqlite`
- Mobile path: vault under `Documents/NexusVaults/{vault_id}/`, index under `Library/NexusIndexes/{vault_id}.sqlite`
- Migration: wipe derived tables + re-DDL when stored version < current
- Upsert must **preserve FTS body** when note body is unloaded

---

## Current architecture (single path)

Disk vaults always:

1. **Meta-only open** + progressive open progress
2. **Lazy body hydrate** + automatic LRU memory budget
3. **DurableIndex** — two different engines, do not conflate:
   - **Desktop Tauri:** SQLite FTS5 BM25 via `searchFtsAsync` (≤50ms target)
   - **Web / FSA / this VM:** in-memory inverted index, **800-candidate cap** (not BM25). Palette heading always shows `Memory FTS (capped)`.
   - **FSA/disk Ready means search is filled:** after the meta scan, a second pass reads a 2k file head into FTS and drops the string. Store nodes stay meta-only. Do not mark Ready after metadata alone.
4. **Ego graph** (neighborhood)
5. **Virtualized file tree**
6. **Path-patch watch** for small external change sets (FSA + desktop)
7. **Conflict Studio** for dirty vs disk diverge
8. **Pulse inbox** vault-scoped with mark-read
9. **Soft trash** + in-app restore

Demo/local stay eager in-memory (not a size-based mode flip).

---

## Graph modes (hierarchical folder map)

| Mode | When | Draw budget |
|------|------|-------------|
| **FullNotes** | `noteCount < 400` (demo / small vaults) | All notes + ghosts |
| **FolderBrowse** | Large vault, map intent (root or drilled folder) | ≤320 child orbs |
| **EgoLinks** | Large vault + ego intent + active note | ~2-hop neighborhood |

- Folder spheres use the same metal `createOrb` pipeline (size via `val` only)
- Click folder → enter level; click note → open + ego links; Esc → up one folder
- Note-select on a large folder map highlights + restyles edges; it must not rebuild `graphData()` or restart physics. Ego hops stay ≤2 / ≤400 nodes. Map/Links, filters (tag, folder, orphan, ghosts), and an out/in inspector are the daily-driver chrome. Particles stay off at ≥400 notes. See the checklist in [`GRAPH-FOLDER-HIERARCHY.md`](./GRAPH-FOLDER-HIERARCHY.md).
- Kill switch: `folderGraph: false` in scale-flags restores ego/full only
- Never materializes 300k–500k orbs — claims are “whole vault **structure**”, not every note as an orb

See [`docs/GRAPH-FOLDER-HIERARCHY.md`](./GRAPH-FOLDER-HIERARCHY.md).

---

| Operation | Target |
|-----------|--------|
| Open vault (metadata) | < 3–5s progressive |
| Expand folder / scroll tree | 60fps, ≤50 DOM rows |
| Title / wikilink suggest | ≤ 10–20ms |
| Full-text top-20 | ≤ 50ms **SQLite FTS5 BM25 on desktop**. Memory FTS is capped JS (honest floor, not BM25). |
| Save note → indexes ready | O(tokens of that note) |
| Path-patch 20 notes | << full tree rebuild |
| Graph | Ego / cluster only — never 500k orbs |
| RAM | Metadata ~150–300MB + LRU bodies |

---

## Decision log

1. **Markdown-on-disk remains canonical** (Hermes-compatible).
2. **Desktop is the 100k–500k primary path** (SQLite FTS5). Chrome in the browser is **≤20,000 notes** (warn 15k, refuse 25k). Not 50k.
3. **One scale-safe path** — no user Large Vault Mode toggle.
4. **Indexes are derived** — safe to wipe and rebuild from files.
5. **Conflict policy** — keep local on diverge; shelf disk as `.conflict-*`; Studio resolves after the fact.
6. **Wave C polish** — first-hour UX; does not replace real-disk stress (Wave E).

---

## Stress fixture: large-test-vault (45k)

| Path | Purpose |
|------|---------|
| `fixtures/large-test-vault.zip` | Optional local archive under gitignored `fixtures/`. Unzip for desktop **Open folder…**. Do not commit. |
| `public/large-test-vault/*` | Local gitignored seed for in-app **Open 45k test vault**. Generate on disk. Do not commit. |
| `src/lib/vault/large-test-vault.ts` | Loader → `openLargeTestVault()` |

Welcome CTA opens the seed in the real app shell so graph/tree/search can be QA’d without picking a folder. Session creates/edits on that seed stay in a **browser overlay** (not files); the title bar says `Test · this browser` and the banner offers **Open a folder**. Disk vaults write markdown; do not treat overlay remount as SCALE READY.
