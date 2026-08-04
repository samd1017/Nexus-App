/**
 * Wave 1e — outgoing / reverse wikilink maps (patched on save).
 * Graph and backlinks can use these without scanning all bodies (Wave 2+).
 * Wave A: reverse keys are always normalizeLinkTarget() for case/path match.
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
};

class VaultLinkIndex {
  /** noteId → raw targets from body (display / resolve) */
  outgoing = new Map<string, string[]>();
  /** normalized target → source note ids */
  reverse = new Map<string, Set<string>>();
  generation = 0;
  private sigOf = new Map<string, string>();

  stats(): LinkIndexStats {
    let edgeCount = 0;
    for (const t of this.outgoing.values()) edgeCount += t.length;
    return {
      noteCount: this.outgoing.size,
      edgeCount,
      generation: this.generation,
    };
  }

  clear(): void {
    this.outgoing.clear();
    this.reverse.clear();
    this.sigOf.clear();
    this.generation = 0;
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

  /** Patch one note from loaded content. No-op if content signature unchanged. */
  setNoteLinks(noteId: string, content: string | undefined): void {
    if (content === undefined) {
      // Unloaded — leave existing map entry (Wave 2 cold open)
      return;
    }
    const sig = `${content.length}\0${content.slice(0, 64)}\0${content.slice(-64)}`;
    if (this.sigOf.get(noteId) === sig) return;
    this.unlink(noteId);
    const targets = extractWikilinkTargets(content);
    this.outgoing.set(noteId, targets);
    this.sigOf.set(noteId, sig);
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
    this.generation += 1;
  }

  removeNote(noteId: string): void {
    if (!this.outgoing.has(noteId)) return;
    this.unlink(noteId);
    this.generation += 1;
  }

  /** Full rebuild from nodes that have loaded bodies. */
  rebuild(nodes: Record<string, VaultNode>): void {
    this.clear();
    for (const n of Object.values(nodes)) {
      if (n.kind !== "note") continue;
      if (n.content === undefined) continue;
      this.setNoteLinks(n.id, n.content);
    }
    // setNoteLinks bumps gen per note; normalize
    this.generation = 1;
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
