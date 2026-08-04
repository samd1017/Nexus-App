/**
 * Vault structural indexes — O(1)/O(k) tree + path + title lookups.
 *
 * Phase 1 of the 500k scaling plan:
 *   - childrenByParent adjacency (replaces O(n) getChildren scans)
 *   - pathToId map (replaces O(n) path finds)
 *   - title prefix index for wikilink / cmdk title suggest
 *   - generation counters so search/backlinks skip O(n) signature strings
 *
 * Disk markdown remains source of truth. This is a derived cache rebuilt
 * from the in-memory node map (eager today; lazy bodies land in Phase 2).
 */

import type { VaultNode } from "./types";
import { noteTitle } from "./types";
import { normalizeLinkTarget } from "@/lib/markdown/wikilinks";

export type IndexStats = {
  nodeCount: number;
  noteCount: number;
  folderCount: number;
  structureGeneration: number;
  contentGeneration: number;
  rebuildCount: number;
  patchCount: number;
};

type TitleEntry = {
  id: string;
  title: string;
  norm: string;
  path: string;
  kind: "note" | "folder";
};

function sortChildIds(
  ids: string[],
  nodes: Record<string, VaultNode>,
): string[] {
  return ids.sort((a, b) => {
    const na = nodes[a];
    const nb = nodes[b];
    if (!na || !nb) return 0;
    if (na.kind !== nb.kind) return na.kind === "folder" ? -1 : 1;
    return na.name.localeCompare(nb.name);
  });
}

function parentKey(parentId: string | null): string {
  return parentId ?? "__root__";
}

export class VaultStructuralIndex {
  /** parentId (or __root__) → sorted child ids */
  childrenByParent = new Map<string, string[]>();
  pathToId = new Map<string, string>();
  /** normalized title → note/folder ids (collision-safe) */
  titleToIds = new Map<string, string[]>();
  /** Sorted title entries for binary prefix search */
  private titleList: TitleEntry[] = [];
  private titleListDirty = true;

  structureGeneration = 0;
  contentGeneration = 0;
  rebuildCount = 0;
  patchCount = 0;
  nodeCount = 0;
  noteCount = 0;
  folderCount = 0;

  private lastNodesRef: Record<string, VaultNode> | null = null;
  private pendingDirtyIds: string[] | null = null;
  /** id → last seen parentId for reparent detection */
  private parentOf = new Map<string, string | null>();
  private pathOf = new Map<string, string>();
  private nameOf = new Map<string, string>();
  private kindOf = new Map<string, "folder" | "note">();
  private mtimeOf = new Map<string, number>();
  private contentLenOf = new Map<string, number>();

  /** Folder → cheap child signature for React selectors (no O(n) scan) */
  private childSigCache = new Map<string, string>();

  stats(): IndexStats {
    return {
      nodeCount: this.nodeCount,
      noteCount: this.noteCount,
      folderCount: this.folderCount,
      structureGeneration: this.structureGeneration,
      contentGeneration: this.contentGeneration,
      rebuildCount: this.rebuildCount,
      patchCount: this.patchCount,
    };
  }

  /** Store hints content/meta patches before set({ nodes }). */
  markDirty(ids: string[]): void {
    if (!ids.length) return;
    if (!this.pendingDirtyIds) this.pendingDirtyIds = ids.slice();
    else this.pendingDirtyIds.push(...ids);
  }

  /** Sync index to current nodes map. Patches when possible, full rebuild otherwise. */
  sync(nodes: Record<string, VaultNode>): void {
    if (this.lastNodesRef === nodes) return;

    if (!this.lastNodesRef) {
      this.pendingDirtyIds = null;
      this.rebuild(nodes);
      return;
    }

    const prev = this.lastNodesRef;
    const hinted = this.pendingDirtyIds;
    this.pendingDirtyIds = null;

    // Fast path: store-known dirty ids (avoids Object.keys over 45k map)
    if (hinted && hinted.length > 0 && hinted.length <= 64) {
      const uniq = Array.from(new Set(hinted));
      const changed = uniq.filter((id) => nodes[id] !== prev[id] && nodes[id] != null);
      if (
        changed.length > 0 &&
        changed.length === uniq.filter((id) => prev[id] != null || nodes[id] != null).length &&
        changed.every((id) => prev[id] != null && nodes[id] != null)
      ) {
        let structural = false;
        for (const id of changed) {
          const before = prev[id]!;
          const after = nodes[id]!;
          if (
            before.parentId !== after.parentId ||
            before.path !== after.path ||
            before.name !== after.name ||
            before.kind !== after.kind
          ) {
            structural = true;
          }
          this.applyNodeDelta(before, after);
        }
        if (structural) {
          this.structureGeneration += 1;
          this.childSigCache.clear();
          this.titleListDirty = true;
          this.recount(nodes);
        } else {
          this.contentGeneration += 1;
          for (const id of changed) {
            const p = nodes[id]?.parentId;
            if (p) this.childSigCache.delete(p);
            else this.childSigCache.delete("__root__");
          }
          // content-only: skip recount
        }
        this.patchCount += 1;
        this.lastNodesRef = nodes;
        return;
      }
    }

    const prevKeys = Object.keys(prev);
    const nextKeys = Object.keys(nodes);

    // Fast path: same key set (typical content edit clones map with one changed value)
    if (prevKeys.length === nextKeys.length) {
      const changed: string[] = [];
      for (const id of nextKeys) {
        if (nodes[id] !== prev[id]) changed.push(id);
      }
      // Structural create/delete always changes key count; multi-id patches from
      // rename cascades / external snapshots can be large — rebuild past threshold.
      if (changed.length === 0) {
        this.lastNodesRef = nodes;
        return;
      }
      // Raise budget: body hydrate can touch many content-only victims
      if (changed.length <= 64) {
        let structural = false;
        for (const id of changed) {
          const before = prev[id];
          const after = nodes[id];
          if (!after) {
            structural = true;
            break;
          }
          if (
            !before ||
            before.parentId !== after.parentId ||
            before.path !== after.path ||
            before.name !== after.name ||
            before.kind !== after.kind
          ) {
            structural = true;
          }
          this.applyNodeDelta(before, after);
        }
        if (structural) {
          this.structureGeneration += 1;
          this.childSigCache.clear();
          this.titleListDirty = true;
          this.recount(nodes);
        } else {
          this.contentGeneration += 1;
          // content-only: refresh child sigs for parents of changed notes (mtime in sig)
          for (const id of changed) {
            const p = nodes[id]?.parentId;
            if (p) this.childSigCache.delete(p);
            else this.childSigCache.delete("__root__");
          }
          // content-only: skip recount — counts unchanged
        }
        this.patchCount += 1;
        this.lastNodesRef = nodes;
        return;
      }
    }

    // Key set changed or large multi-patch → full rebuild
    this.rebuild(nodes);
  }

  rebuild(nodes: Record<string, VaultNode>): void {
    this.childrenByParent = new Map();
    this.pathToId = new Map();
    this.titleToIds = new Map();
    this.parentOf = new Map();
    this.pathOf = new Map();
    this.nameOf = new Map();
    this.kindOf = new Map();
    this.mtimeOf = new Map();
    this.contentLenOf = new Map();
    this.childSigCache = new Map();
    this.titleList = [];
    this.titleListDirty = true;

    for (const n of Object.values(nodes)) {
      this.insertNode(n, nodes, false);
    }

    // Sort all child lists once
    for (const [pk, ids] of this.childrenByParent) {
      this.childrenByParent.set(pk, sortChildIds(ids, nodes));
    }

    this.structureGeneration += 1;
    this.contentGeneration += 1;
    this.rebuildCount += 1;
    this.lastNodesRef = nodes;
    this.recount(nodes);
  }

  private recount(nodes: Record<string, VaultNode>): void {
    let notes = 0;
    let folders = 0;
    let total = 0;
    for (const n of Object.values(nodes)) {
      total += 1;
      if (n.kind === "note") notes += 1;
      else folders += 1;
    }
    this.nodeCount = total;
    this.noteCount = notes;
    this.folderCount = folders;
  }

  private insertNode(
    n: VaultNode,
    nodes: Record<string, VaultNode>,
    sortNow: boolean,
  ): void {
    const pk = parentKey(n.parentId);
    let list = this.childrenByParent.get(pk);
    if (!list) {
      list = [];
      this.childrenByParent.set(pk, list);
    }
    if (!list.includes(n.id)) list.push(n.id);
    if (sortNow) {
      this.childrenByParent.set(pk, sortChildIds(list, nodes));
    }

    this.pathToId.set(n.path, n.id);
    this.parentOf.set(n.id, n.parentId);
    this.pathOf.set(n.id, n.path);
    this.nameOf.set(n.id, n.name);
    this.kindOf.set(n.id, n.kind);
    this.mtimeOf.set(n.id, n.mtime);
    this.contentLenOf.set(n.id, (n.content ?? "").length);

    const title = n.kind === "note" ? noteTitle(n) : n.name;
    const norm = normalizeLinkTarget(title);
    if (norm) {
      let tids = this.titleToIds.get(norm);
      if (!tids) {
        tids = [];
        this.titleToIds.set(norm, tids);
      }
      if (!tids.includes(n.id)) tids.push(n.id);
    }
  }

  private removeNode(id: string): void {
    const parentId = this.parentOf.get(id) ?? null;
    const pk = parentKey(parentId);
    const list = this.childrenByParent.get(pk);
    if (list) {
      const next = list.filter((x) => x !== id);
      if (next.length) this.childrenByParent.set(pk, next);
      else this.childrenByParent.delete(pk);
    }
    const path = this.pathOf.get(id);
    if (path) this.pathToId.delete(path);

    const name = this.nameOf.get(id);
    const kind = this.kindOf.get(id);
    if (name && kind) {
      const title = kind === "note" ? name.replace(/\.md$/i, "") : name;
      const norm = normalizeLinkTarget(title);
      if (norm) {
        const tids = this.titleToIds.get(norm);
        if (tids) {
          const filtered = tids.filter((x) => x !== id);
          if (filtered.length) this.titleToIds.set(norm, filtered);
          else this.titleToIds.delete(norm);
        }
      }
    }

    this.parentOf.delete(id);
    this.pathOf.delete(id);
    this.nameOf.delete(id);
    this.kindOf.delete(id);
    this.mtimeOf.delete(id);
    this.contentLenOf.delete(id);
    this.childSigCache.delete(id);
    this.childSigCache.delete(pk);
    this.titleListDirty = true;
  }

  private applyNodeDelta(
    before: VaultNode | undefined,
    after: VaultNode,
  ): void {
    if (!before) {
      // treat as insert — caller should have rebuild for creates usually
      return;
    }
    if (before.id !== after.id) return;

    const structural =
      before.parentId !== after.parentId ||
      before.path !== after.path ||
      before.name !== after.name ||
      before.kind !== after.kind;

    if (!structural) {
      this.mtimeOf.set(after.id, after.mtime);
      this.contentLenOf.set(after.id, (after.content ?? "").length);
      return;
    }

    // Remove old membership, insert new
    this.removeNode(before.id);
    // insertNode needs nodes map for sort — use minimal synthetic
    const synthetic: Record<string, VaultNode> = { [after.id]: after };
    // Also need sibling nodes for correct sort — pull from lastNodesRef if present
    const siblings =
      this.lastNodesRef
        ? Object.values(this.lastNodesRef).filter(
            (n) => n.parentId === after.parentId && n.id !== after.id,
          )
        : [];
    for (const s of siblings) synthetic[s.id] = s;
    this.insertNode(after, { ...synthetic, [after.id]: after }, true);
    this.titleListDirty = true;
  }

  getChildIds(parentId: string | null): string[] {
    return this.childrenByParent.get(parentKey(parentId)) ?? [];
  }

  getChildren(
    nodes: Record<string, VaultNode>,
    parentId: string | null,
  ): VaultNode[] {
    this.sync(nodes);
    const ids = this.getChildIds(parentId);
    const out: VaultNode[] = [];
    for (const id of ids) {
      const n = nodes[id];
      if (n) out.push(n);
    }
    return out;
  }

  getIdByPath(nodes: Record<string, VaultNode>, path: string): string | undefined {
    this.sync(nodes);
    return this.pathToId.get(path);
  }

  getByPath(
    nodes: Record<string, VaultNode>,
    path: string,
  ): VaultNode | undefined {
    const id = this.getIdByPath(nodes, path);
    return id ? nodes[id] : undefined;
  }

  /**
   * Cheap fingerprint for a folder's children — O(k) not O(n).
   * Used by FileTree selectors instead of scanning the whole vault.
   */
  childSignature(
    nodes: Record<string, VaultNode>,
    folderId: string,
  ): string {
    this.sync(nodes);
    const cached = this.childSigCache.get(folderId);
    if (cached !== undefined) {
      // Invalidate if structure/content gens moved — cache is per-sync cleared on structure
      // Content mtime changes clear parent cache in patch path; return cached when warm
      return cached;
    }
    const ids = this.getChildIds(folderId);
    const parts: string[] = [];
    for (const id of ids) {
      const n = nodes[id];
      if (!n) continue;
      parts.push(`${n.id}:${n.name}:${n.kind}:${n.mtime}`);
    }
    const sig = parts.join("|");
    this.childSigCache.set(folderId, sig);
    return sig;
  }

  private ensureTitleList(nodes: Record<string, VaultNode>): TitleEntry[] {
    this.sync(nodes);
    if (!this.titleListDirty && this.titleList.length) return this.titleList;
    const list: TitleEntry[] = [];
    for (const n of Object.values(nodes)) {
      const title = n.kind === "note" ? noteTitle(n) : n.name;
      list.push({
        id: n.id,
        title,
        norm: normalizeLinkTarget(title),
        path: n.path,
        kind: n.kind,
      });
    }
    list.sort((a, b) => a.norm.localeCompare(b.norm));
    this.titleList = list;
    this.titleListDirty = false;
    return list;
  }

  /**
   * Prefix / substring suggest over titles + paths.
   * Uses sorted title list for prefix boost; full scan only of title entries
   * (metadata only — not note bodies). O(N titles) worst case but tiny payload.
   */
  suggest(
    nodes: Record<string, VaultNode>,
    query: string,
    limit = 40,
  ): Array<{
    id: string;
    kind: "note" | "folder";
    title: string;
    path: string;
    target: string;
  }> {
    const q = normalizeLinkTarget(query);
    const list = this.ensureTitleList(nodes);
    const hits: Array<{
      id: string;
      kind: "note" | "folder";
      title: string;
      path: string;
      target: string;
      score: number;
    }> = [];

    for (const e of list) {
      if (q) {
        const pathNo = e.path.replace(/\.md$/i, "");
        const hay = `${e.norm} ${normalizeLinkTarget(pathNo)}`;
        if (!hay.includes(q) && !e.norm.includes(q)) continue;
        const prefix = e.norm.startsWith(q) ? 0 : 1;
        const kindBoost = e.kind === "note" ? 0 : 2;
        hits.push({
          id: e.id,
          kind: e.kind,
          title: e.title,
          path: e.path,
          target: e.kind === "note" ? e.title : pathNo,
          score: kindBoost * 10 + prefix,
        });
      } else {
        hits.push({
          id: e.id,
          kind: e.kind,
          title: e.title,
          path: e.path,
          target: e.kind === "note" ? e.title : e.path.replace(/\.md$/i, ""),
          score: e.kind === "note" ? 0 : 2,
        });
      }
      if (hits.length > limit * 8) {
        // Soft cap during scan; we'll sort+slice
      }
    }

    hits.sort((a, b) => {
      if (a.score !== b.score) return a.score - b.score;
      return a.title.localeCompare(b.title);
    });
    return hits.slice(0, limit).map(({ score: _s, ...rest }) => rest);
  }

  /** Combined generation for cache invalidation (search / backlinks). */
  generation(): number {
    // Mix structure + content into one monotonic-ish key for consumers
    return this.structureGeneration * 1_000_000_003 + this.contentGeneration;
  }
}

/** Process-wide index instance (one vault open at a time). */
export const vaultIndex = new VaultStructuralIndex();

/** Ensure index matches nodes; return it. */
export function ensureVaultIndex(
  nodes: Record<string, VaultNode>,
): VaultStructuralIndex {
  vaultIndex.sync(nodes);
  return vaultIndex;
}

/** Reset on vault close / tests. */
export function resetVaultIndex(): void {
  vaultIndex.rebuild({});
  vaultIndex.rebuildCount = 0;
  vaultIndex.patchCount = 0;
  vaultIndex.structureGeneration = 0;
  vaultIndex.contentGeneration = 0;
}
