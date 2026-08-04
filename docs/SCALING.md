# Nexus Vault Scaling — Single Path to 300k–500k

**Goal:** Comfortably handle **300k–500k** notes on Desktop (plain-folder markdown), with headroom beyond. Web = demo/QA only. Mobile later via shared DurableIndex schema.

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
- **Wave E:** real-disk 100k/300k open numbers on Mac; closed beta → 1.0
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
3. **DurableIndex** FTS (memory on web/FSA; SQLite on desktop)
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
- Kill switch: `folderGraph: false` in scale-flags restores ego/full only
- Never materializes 300k–500k orbs — claims are “whole vault **structure**”, not every note as an orb

See [`docs/GRAPH-FOLDER-HIERARCHY.md`](./GRAPH-FOLDER-HIERARCHY.md).

---

| Operation | Target |
|-----------|--------|
| Open vault (metadata) | < 3–5s progressive |
| Expand folder / scroll tree | 60fps, ≤50 DOM rows |
| Title / wikilink suggest | ≤ 10–20ms |
| Full-text top-20 | ≤ 50ms (FTS5) |
| Save note → indexes ready | O(tokens of that note) |
| Path-patch 20 notes | << full tree rebuild |
| Graph | Ego / cluster only — never 500k orbs |
| RAM | Metadata ~150–300MB + LRU bodies |

---

## Decision log

1. **Markdown-on-disk remains canonical** (Hermes-compatible).
2. **Desktop is the 500k primary path**; browser aims for solid 20–50k with progressive limits.
3. **One scale-safe path** — no user Large Vault Mode toggle.
4. **Indexes are derived** — safe to wipe and rebuild from files.
5. **Conflict policy** — keep local on diverge; shelf disk as `.conflict-*`; Studio resolves after the fact.
6. **Wave C polish** — first-hour UX; does not replace real-disk stress (Wave E).

---

## Stress fixture: large-test-vault (45k)

| Path | Purpose |
|------|---------|
| `fixtures/large-test-vault.zip` | Source archive (unzip for desktop **Open folder…**) |
| `public/large-test-vault/*` | Prebuilt seed for in-app **Open 45k test vault** |
| `src/lib/vault/large-test-vault.ts` | Loader → `openLargeTestVault()` |

Welcome CTA opens the seed in the real app shell so graph/tree/search can be QA’d without picking a folder.
