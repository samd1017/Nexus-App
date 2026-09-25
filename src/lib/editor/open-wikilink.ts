/**
 * Wikilink clicks from the visual editor and the reading view. A large vault
 * keeps only a window of notes in memory, so a miss there is not a miss:
 * the catalog is asked before a note is created.
 */

import { resolveWikilink } from "@/lib/graph/build-graph";
import { parseWikilinkInner } from "@/lib/markdown/wikilinks";
import { fetchShellResolveLink } from "@/lib/vault/shell-catalog";
import { useVaultStore } from "@/lib/vault/store";
import type { VaultNode } from "@/lib/vault/types";

export type LinkPane = "primary" | "secondary";

export type LinkJump = {
  heading?: string;
  blockId?: string;
  pane: LinkPane;
};

export type LinkTarget =
  | { kind: "node"; node: VaultNode }
  | { kind: "miss" }
  /** The catalog could not answer in time; creating now could duplicate a note. */
  | { kind: "unsure" };

export async function catalogLinkTarget(noteTarget: string): Promise<LinkTarget> {
  const state = useVaultStore.getState();
  const db = state.shellDbPath;
  if (!state.shellCatalog || !db) return { kind: "miss" };
  const found = await fetchShellResolveLink(db, noteTarget);
  const live = useVaultStore.getState();
  if (!found || live.shellDbPath !== db) return { kind: "unsure" };
  if (!found.row) return found.settled ? { kind: "miss" } : { kind: "unsure" };
  live.ingestShellRows([found.row]);
  const node = useVaultStore.getState().nodes[found.row.id];
  return node ? { kind: "node", node } : { kind: "unsure" };
}

let clickSeq = 0;

export function openWikilink(
  target: string,
  opts: {
    hostId?: string | null;
    pane: LinkPane;
    open?: (id: string, jump: LinkJump) => void;
    onFolder?: (folder: VaultNode, jump: LinkJump) => void;
  },
): Promise<void> {
  const parts = parseWikilinkInner(target);
  const jump: LinkJump = {
    heading: parts.heading || undefined,
    blockId: parts.blockId || undefined,
    pane: opts.pane,
  };
  const open =
    opts.open ?? ((id: string, j: LinkJump) => useVaultStore.getState().setActiveNote(id, j));
  const state = useVaultStore.getState();
  const seq = ++clickSeq;
  const show = (node: VaultNode) => {
    if (node.kind === "folder") {
      if (opts.onFolder) opts.onFolder(node, jump);
      else useVaultStore.getState().setToast(`“${node.name}” is a folder`);
      return;
    }
    open(node.id, jump);
  };
  if (!parts.noteTarget) {
    const host = opts.hostId || state.activeNoteId;
    const node = host ? state.nodes[host] : null;
    if (node) show(node);
    return Promise.resolve();
  }
  const title = parts.noteTarget.trim();
  // A hit in the loaded window opens in this tick, as it always has.
  const local = resolveWikilink(parts.noteTarget, state.nodes);
  if (local) {
    show(local);
    return Promise.resolve();
  }
  const from = state.activeNoteId;
  return catalogLinkTarget(parts.noteTarget).then((result) => {
    const live = useVaultStore.getState();
    if (seq !== clickSeq || live.activeNoteId !== from) return;
    if (result.kind === "node") {
      show(result.node);
      return;
    }
    if (result.kind === "unsure") {
      live.setToast(`Still reading the vault. Try [[${title}]] again in a moment.`);
      return;
    }
    if (!title) return;
    const created = live.createNote(null, title, { activate: false });
    if (!created) {
      live.setToast(`No note found for [[${target}]]`);
      return;
    }
    live.setToast(`Created “${title}”`);
    if (useVaultStore.getState().readingView) useVaultStore.getState().setReadingView(false);
    open(created, jump);
  });
}
