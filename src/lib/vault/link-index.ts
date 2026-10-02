/**
 * Wave 1e — outgoing / reverse wikilink maps (patched on save).
 * Graph and backlinks can use these without scanning all bodies (Wave 2+).
 * Wave A: reverse keys are always normalizeLinkTarget() for case/path match.
 * Desktop: native fill persists link_edge; seedOutgoing hydrates this map
 * without loading note bodies into the UI.
 */

import {
  extractWikilinkTargets,
  normalizeLinkTarget,
} from "@/lib/markdown/wikilinks";
import type { VaultNode } from "./types";

export type LinkIndexStats = {
  noteCount: number;
  edgeCount: number;
  generation: number;
  ready: boolean;
};

export type LinkGroup = {
  sourceId: string;
  targets: string[];
};

class VaultLinkIndex {
  /** noteId → raw targets from body (display / resolve) */
  outgoing = new Map<string, string[]>();
  /** normalized target → source note ids */
  reverse = new Map<string, Set<string>>();
  generation = 0;
  /** False until rebuild (hydrated bodies) or native seed. */
  ready = false;
  private sigOf = new Map<string, string>();

  stats(): LinkIndexStats {
    let edgeCount = 0;
    for (const t of this.outgoing.values()) edgeCount += t.length;
    return {
      noteCount: this.outgoing.size,
      edgeCount,
      generation: this.generation,
      ready: this.ready,
    };
  }

  clear(): void {
    this.outgoing.clear();
    this.reverse.clear();
    this.sigOf.clear();
    this.generation = 0;
    this.ready = false;
  }

  markPending(): void {
    if (!this.ready && this.outgoing.size === 0) {
      this.generation += 1;
      return;
    }
    this.ready = false;
    this.generation += 1;
  }

  private unlink(noteId: string): void {
    const prev = this.outgoing.get(noteId);
    if (!prev) return;
    for (const t of prev) {
      const key = normalizeLinkTarget(t);
      const set = this.reverse.get(key);
      if (!set) continue;
      set.delete(noteId);
      if (set.size === 0) this.reverse.delete(key);
    }
    this.outgoing.delete(noteId);
    this.sigOf.delete(noteId);
  }

  private linkTargets(noteId: string, targets: string[]): void {
    this.outgoing.set(noteId, targets);
    for (const t of targets) {
      const key = normalizeLinkTarget(t);
      if (!key) continue;
      let set = this.reverse.get(key);
      if (!set) {
        set = new Set();
        this.reverse.set(key, set);
      }
      set.add(noteId);
    }
  }

  /**
   * True when a seed or a full rebuild has folded in every note.
   * A lone setNoteLinks leaves noteCount at 1; that must not hide
   * backlinks that still live in the other notes.
   */
  coversNoteCount(noteCount: number): boolean {
    if (noteCount <= 0) return this.ready;
    return this.ready && this.outgoing.size >= noteCount;
  }

  /** Patch one note from loaded content. No-op if content signature unchanged. */
  setNoteLinks(noteId: string, content: string | undefined): void {
    if (content === undefined) {
      // Unloaded — leave existing map entry (Wave 2 cold open / native seed)
      return;
    }
    const sig = `${content.length}\0${content.slice(0, 64)}\0${content.slice(-64)}`;
    if (this.sigOf.get(noteId) === sig) return;
    this.unlink(noteId);
    const targets = extractWikilinkTargets(content);
    this.linkTargets(noteId, targets);
    this.sigOf.set(noteId, sig);
    this.generation += 1;
    // Stay not-ready until a seed or rebuild covers the vault. One patched
    // note used to flip ready and make every other backlink disappear.
  }

  removeNote(noteId: string): void {
    if (!this.outgoing.has(noteId)) return;
    this.unlink(noteId);
    this.generation += 1;
  }

  /**
   * Patch from persisted / extracted outgoing targets (no body required).
   * Replaces the whole map — used after native fill / link_edge list.
   */
  seedOutgoing(groups: LinkGroup[]): void {
    this.outgoing.clear();
    this.reverse.clear();
    this.sigOf.clear();
    for (const g of groups) {
      if (!g?.sourceId) continue;
      const targets = Array.isArray(g.targets) ? g.targets.filter(Boolean) : [];
      this.linkTargets(g.sourceId, targets);
    }
    this.ready = true;
    this.generation += 1;
  }

  /**
   * Rebuild from nodes that have loaded bodies.
   * Keeps seeded entries for notes whose bodies are still lazy.
   */
  rebuild(nodes: Record<string, VaultNode>): void {
    const live = new Set<string>();
    for (const n of Object.values(nodes)) {
      if (n.kind === "note") live.add(n.id);
    }
    for (const id of [...this.outgoing.keys()]) {
      if (!live.has(id)) this.unlink(id);
    }
    let sawLoaded = false;
    for (const n of Object.values(nodes)) {
      if (n.kind !== "note") continue;
      if (n.content === undefined) continue;
      sawLoaded = true;
      this.setNoteLinks(n.id, n.content);
    }
    if (sawLoaded) this.ready = true;
    this.generation += 1;
  }

  getOutgoing(noteId: string): string[] {
    return this.outgoing.get(noteId) ?? [];
  }

  getBacklinkSources(target: string): string[] {
    const key = normalizeLinkTarget(target);
    const set = this.reverse.get(key);
    return set ? [...set] : [];
  }

  /** All edges as [sourceId, targetString] */
  forEachEdge(fn: (sourceId: string, target: string) => void): void {
    for (const [id, targets] of this.outgoing) {
      for (const t of targets) fn(id, t);
    }
  }
}

export const vaultLinkIndex = new VaultLinkIndex();

export function rebuildLinkIndex(nodes: Record<string, VaultNode>): void {
  vaultLinkIndex.rebuild(nodes);
}

export function resetLinkIndex(): void {
  vaultLinkIndex.clear();
}

export function seedLinkIndex(groups: LinkGroup[]): LinkIndexStats {
  vaultLinkIndex.seedOutgoing(groups);
  return vaultLinkIndex.stats();
}
