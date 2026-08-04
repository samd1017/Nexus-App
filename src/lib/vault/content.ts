/**
 * Wave 1 content contracts — distinguish unloaded vs empty body.
 * undefined = not loaded (lazy); "" = loaded empty note.
 */

import type { VaultNode } from "./types";

/** True when note body is known in memory (including empty string). */
export function isContentLoaded(node: VaultNode | null | undefined): boolean {
  if (!node || node.kind !== "note") return false;
  return node.content !== undefined;
}

/**
 * Synchronous body accessor. Returns null when not loaded.
 * Never treats unloaded as empty string.
 */
export function getNoteBody(node: VaultNode | null | undefined): string | null {
  if (!node || node.kind !== "note") return null;
  if (node.content === undefined) return null;
  return node.content;
}

/** Body for display/search when missing → empty (explicit degrade). */
export function getNoteBodyOrEmpty(node: VaultNode | null | undefined): string {
  return getNoteBody(node) ?? "";
}

/** Guard for write paths — true only when a real body is present. */
export function assertBodyLoaded(
  node: VaultNode | null | undefined,
  action: string,
): node is VaultNode & { content: string } {
  if (!node || node.kind !== "note") return false;
  if (node.content === undefined) {
    if (typeof console !== "undefined") {
      console.warn(`[nexus] refused ${action}: body not loaded for ${node.path}`);
    }
    return false;
  }
  return true;
}
