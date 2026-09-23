import { useEffect, useMemo, useState } from "react";
import { useVaultStore } from "@/lib/vault/store";
import { fetchShellBacklinks } from "@/lib/vault/shell-catalog";
import { isCanvasNote } from "@/lib/vault/canvas";
import { vaultLinkIndex } from "@/lib/vault/link-index";
import { noteTargetKeys } from "@/lib/vault/backlink-index";
import { getBacklinks } from "@/lib/vault/backlinks";
import { ensureVaultIndex } from "@/lib/vault/indexes";
import { isLargeMemoryVault, shouldUseEgoGraph } from "@/lib/vault/scale-flags";
import { extractWikilinkTargets, normalizeLinkTarget } from "@/lib/markdown/wikilinks";
import type { VaultNode } from "@/lib/vault/types";
import { formatWordCount, noteMass } from "@/lib/editor/note-mass";

function linkTargetKey(raw: string): string {
  const base = raw.split("#")[0]?.split("^")[0] ?? raw;
  return normalizeLinkTarget(base);
}

function outgoingCount(noteId: string, content: string): number {
  const indexed = vaultLinkIndex.getOutgoing(noteId);
  const list = indexed.length > 0 ? indexed : extractWikilinkTargets(content);
  const seen = new Set<string>();
  for (const t of list) {
    const key = linkTargetKey(t);
    if (key) seen.add(key);
  }
  return seen.size;
}

function incomingCount(
  note: VaultNode,
  nodes: Record<string, VaultNode>,
): number {
  const ids = new Set<string>();
  const noteCount = ensureVaultIndex(nodes).noteCount;
  // A seeded map can be one note short (today's daily, not in the index yet).
  // That must not zero every incoming count. Read the map first; only a small
  // vault with a cold map falls through to a body scan.
  for (const key of noteTargetKeys(note)) {
    for (const src of vaultLinkIndex.getBacklinkSources(key)) {
      if (src !== note.id) ids.add(src);
    }
  }
  if (
    ids.size > 0 ||
    vaultLinkIndex.coversNoteCount(noteCount) ||
    shouldUseEgoGraph(noteCount)
  ) {
    return ids.size;
  }
  for (const b of getBacklinks(note, nodes)) ids.add(b.fromId);
  return ids.size;
}

/**
 * Quiet instrument under the note: how long it is, how it connects, whether it is kept.
 */
export function EditorStatusBar({ noteId }: { noteId: string }) {
  const note = useVaultStore((s) => s.nodes[noteId] ?? null);
  const content = note?.kind === "note" ? (note.content ?? "") : "";
  const mode = useVaultStore((s) => s.mode);
  const vaultId = useVaultStore((s) => s.vaultId);
  const dirty = useVaultStore((s) => s.dirtyNoteIds.includes(noteId));
  const nodes = useVaultStore((s) => s.nodes);
  const shellCatalog = useVaultStore((s) => s.shellCatalog);
  const shellDbPath = useVaultStore((s) => s.shellDbPath);
  const setRightOpen = useVaultStore((s) => s.setRightOpen);
  const setRightTab = useVaultStore((s) => s.setRightTab);
  const [shellIn, setShellIn] = useState<number | null>(null);

  useEffect(() => {
    if (!shellCatalog || !shellDbPath || !note || note.kind !== "note") {
      setShellIn(null);
      return;
    }
    let cancel = false;
    const id = note.id;
    void fetchShellBacklinks(shellDbPath, id).then((page) => {
      if (!cancel) setShellIn(page?.total ?? 0);
    });
    return () => {
      cancel = true;
    };
  }, [shellCatalog, shellDbPath, note?.id]);

  const mass = useMemo(() => noteMass(content), [content]);
  const links = useMemo(() => {
    if (!note || note.kind !== "note" || !nodes) return { out: 0, inn: 0 };
    if (shellCatalog) {
      return { out: outgoingCount(note.id, content), inn: shellIn ?? 0 };
    }
    return {
      out: outgoingCount(note.id, content),
      inn: incomingCount(note, nodes),
    };
  }, [nodes, note, content, shellCatalog, shellIn]);

  if (isCanvasNote(content)) {
    return (
      <div
        className="editor-status flex h-7 shrink-0 items-center border-t border-[var(--border)] px-3 text-[11px] text-[var(--text-muted)]"
        role="status"
      >
        Canvas
      </div>
    );
  }

  const kept = dirty
    ? "Unsaved"
    : mode === "demo" || isLargeMemoryVault(vaultId)
      ? "In session"
      : "Saved";
  const read =
    mass.words >= 40
      ? mass.minutes === 1
        ? "1 min"
        : `${mass.minutes} min`
      : null;

  const openLinks = (tab: "graph" | "backlinks") => {
    setRightOpen(true);
    setRightTab(tab);
  };

  return (
    <div
      className="editor-status flex h-7 shrink-0 items-center gap-2 border-t border-[var(--border)] px-3 text-[11px] tabular-nums text-[var(--text-muted)]"
      role="status"
      aria-label={`${formatWordCount(mass.words)}${read ? `, about ${read}` : ""}, ${links.out} outgoing, ${links.inn} incoming, ${kept}`}
    >
      <span>{formatWordCount(mass.words)}</span>
      {read ? (
        <>
          <span aria-hidden className="opacity-40">
            ·
          </span>
          <span>{read}</span>
        </>
      ) : null}
      <span className="ml-auto flex items-center gap-2">
        <button
          type="button"
          className="rounded px-1 py-0.5 hover:bg-white/[0.06] hover:text-[var(--text-primary)]"
          title="Outgoing links — open the graph"
          onClick={() => openLinks("graph")}
        >
          {links.out} out
        </button>
        <span aria-hidden className="opacity-40">
          ·
        </span>
        <button
          type="button"
          className="rounded px-1 py-0.5 hover:bg-white/[0.06] hover:text-[var(--text-primary)]"
          title="Incoming links — open backlinks"
          onClick={() => openLinks("backlinks")}
        >
          {links.inn} in
        </button>
        <span aria-hidden className="opacity-40">
          ·
        </span>
        <span className={dirty ? "text-[var(--warning)]" : undefined}>{kept}</span>
      </span>
    </div>
  );
}
