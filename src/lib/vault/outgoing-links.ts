/**
 * Outgoing links for the note that is open.
 * Wikilinks come from the same parser the link index uses. A markdown
 * link to a .md file is read from that same note body. Nothing is invented
 * when the body and the index are both empty.
 */

import { buildWikilinkIndex, resolveWikilink } from "@/lib/graph/build-graph";
import { extractWikilinks, stripCodeForLinkScan } from "@/lib/markdown/wikilinks";
import { ensureVaultIndex } from "./indexes";
import type { VaultNode } from "./types";
import { noteTitle } from "./types";

export type OutgoingResolved = {
  kind: "resolved";
  key: string;
  label: string;
  noteId: string;
  title: string;
  path: string;
  heading?: string | null;
};

export type OutgoingUnresolved = {
  kind: "unresolved";
  key: string;
  label: string;
  /** Title passed to create-note. Empty when there is nothing to create. */
  createTitle: string;
};

export type OutgoingLink = OutgoingResolved | OutgoingUnresolved;

const MD_HREF = /\[[^\]]*\]\(([^)\s]+)\)/g;

function pushResolved(
  out: OutgoingLink[],
  seen: Set<string>,
  key: string,
  node: VaultNode,
  label: string,
  heading?: string | null,
) {
  if (seen.has(key) || node.kind !== "note") return;
  seen.add(key);
  out.push({
    kind: "resolved",
    key,
    label,
    noteId: node.id,
    title: noteTitle(node),
    path: node.path,
    heading: heading ?? null,
  });
}

function pushUnresolved(
  out: OutgoingLink[],
  seen: Set<string>,
  key: string,
  label: string,
  createTitle: string,
) {
  if (seen.has(key)) return;
  seen.add(key);
  out.push({ kind: "unresolved", key, label, createTitle });
}

export function listOutgoingLinks(
  content: string,
  nodes: Record<string, VaultNode>,
  selfId: string | null,
): OutgoingLink[] {
  const out: OutgoingLink[] = [];
  const seen = new Set<string>();
  const self = selfId ? nodes[selfId] : null;
  const index = buildWikilinkIndex(nodes);
  const paths = ensureVaultIndex(nodes);

  for (const link of extractWikilinks(content || "")) {
    const label = link.alias || link.target || link.heading || link.raw;
    if (!link.noteTarget) {
      if (self?.kind === "note") {
        pushResolved(out, seen, `self:${link.target}`, self, label, link.heading);
      }
      continue;
    }
    const hit = resolveWikilink(link.noteTarget, nodes, index);
    if (hit?.kind === "note") {
      pushResolved(out, seen, `note:${hit.id}`, hit, label, link.heading);
      continue;
    }
    // A folder is already in the vault. Do not offer to create a note for it.
    if (hit) continue;
    pushUnresolved(out, seen, `miss:${link.noteTarget.toLowerCase()}`, label, link.noteTarget);
  }

  const plain = stripCodeForLinkScan(content || "");
  MD_HREF.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = MD_HREF.exec(plain)) !== null) {
    const href = (match[1] || "").trim();
    if (!href || /^(https?:|mailto:|#)/i.test(href)) continue;
    const path = href.replace(/^\.\//, "").split("#")[0].split("?")[0];
    if (!path || !/\.md$/i.test(path)) continue;
    const id = paths.getIdByPath(nodes, path);
    const node = id ? nodes[id] : null;
    if (node?.kind === "note") {
      pushResolved(out, seen, `note:${node.id}`, node, path, null);
    } else if (!node) {
      pushUnresolved(out, seen, `md:${path.toLowerCase()}`, path, path.replace(/\.md$/i, ""));
    }
  }
  return out;
}

/** Targets already stored on the link index, resolved the same way. */
export function listOutgoingTargets(
  targets: readonly string[],
  nodes: Record<string, VaultNode>,
): OutgoingLink[] {
  const out: OutgoingLink[] = [];
  const seen = new Set<string>();
  const index = buildWikilinkIndex(nodes);
  for (const target of targets) {
    const name = target.trim();
    if (!name) continue;
    const hit = resolveWikilink(name, nodes, index);
    if (hit?.kind === "note") pushResolved(out, seen, `note:${hit.id}`, hit, name, null);
    else if (!hit) pushUnresolved(out, seen, `miss:${name.toLowerCase()}`, name, name);
  }
  return out;
}
