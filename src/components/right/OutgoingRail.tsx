import { useEffect, useMemo, useSyncExternalStore } from "react";
import { ArrowUpRight } from "lucide-react";
import { noteBodyFailed, useVaultStore } from "@/lib/vault/store";
import { getBodyGen, subscribeBodyGen } from "@/lib/vault/content";
import { vaultLinkIndex } from "@/lib/vault/link-index";
import { listOutgoingLinks, listOutgoingTargets, type OutgoingLink } from "@/lib/vault/outgoing-links";
import { getFindFocusPane } from "@/lib/editor/find-target";

export function OutgoingRail() {
  const activeId = useVaultStore((s) => s.activeNoteId);
  const content = useVaultStore((s) => {
    const node = activeId ? s.nodes[activeId] : null;
    return node?.kind === "note" ? node.content : undefined;
  });
  const nodes = useVaultStore((s) => s.nodes);
  const ensureNoteBody = useVaultStore((s) => s.ensureNoteBody);
  const setActiveNote = useVaultStore((s) => s.setActiveNote);
  const createNote = useVaultStore((s) => s.createNote);
  const setToast = useVaultStore((s) => s.setToast);
  const bodyGen = useSyncExternalStore(subscribeBodyGen, getBodyGen, getBodyGen);

  useEffect(() => {
    if (!activeId || content !== undefined) return;
    void ensureNoteBody(activeId);
  }, [activeId, content, ensureNoteBody]);

  const links = useMemo((): OutgoingLink[] | null => {
    if (!activeId) return [];
    if (typeof content === "string") return listOutgoingLinks(content, nodes, activeId);
    const indexed = vaultLinkIndex.getOutgoing(activeId);
    if (indexed.length) return listOutgoingTargets(indexed, nodes);
    if (noteBodyFailed(activeId)) return [];
    return null;
  }, [activeId, content, nodes, bodyGen]);

  const openResolved = (link: Extract<OutgoingLink, { kind: "resolved" }>) => {
    const store = useVaultStore.getState();
    const split = Boolean(store.settings.workspaceSplit && store.secondaryNoteId);
    const pane = split ? getFindFocusPane() : "primary";
    setActiveNote(link.noteId, { pane, heading: link.heading || undefined });
  };

  const createStub = (link: Extract<OutgoingLink, { kind: "unresolved" }>) => {
    const title = link.createTitle.trim();
    if (!title) {
      setToast("That link has no note name to create.");
      return;
    }
    const id = createNote(null, title);
    if (!id) setToast(`Couldn't create “${title}”.`);
  };

  if (!activeId) {
    return (
      <p className="p-3 text-[13px] text-[var(--text-muted)]" data-testid="outgoing-empty">
        Open a note to see its outgoing links.
      </p>
    );
  }

  if (links === null) {
    return (
      <p className="p-3 text-[13px] text-[var(--text-secondary)]" role="status" data-testid="outgoing-loading">
        {vaultLinkIndex.ready ? "Loading this note’s links…" : "Indexing links…"}
      </p>
    );
  }

  if (links.length === 0) {
    return (
      <p className="p-3 text-[13px] text-[var(--text-muted)]" data-testid="outgoing-empty">
        No outgoing links in this note.
      </p>
    );
  }

  const resolved = links.filter((link) => link.kind === "resolved");
  const unresolved = links.filter((link) => link.kind === "unresolved");

  return (
    <div className="flex flex-col gap-4 p-3" data-testid="outgoing-rail">
      {resolved.length > 0 ? (
        <section>
          <h3 className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--text-muted)]">
            Resolved
          </h3>
          <ul className="flex flex-col gap-1">
            {resolved.map((link) => (
              <li key={link.key}>
                <button
                  type="button"
                  className="w-full rounded-[10px] px-2 py-1.5 text-left hover:bg-white/[0.05]"
                  data-testid="outgoing-resolved"
                  onClick={() => openResolved(link)}
                >
                  <div className="truncate text-[13px] text-[var(--text-primary)]">{link.title}</div>
                  <div className="truncate text-[11px] text-[var(--text-muted)]">{link.path}</div>
                </button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      {unresolved.length > 0 ? (
        <section>
          <h3 className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--text-muted)]">
            Unresolved
          </h3>
          <ul className="flex flex-col gap-1">
            {unresolved.map((link) => (
              <li key={link.key}>
                <button
                  type="button"
                  className="w-full rounded-[10px] px-2 py-1.5 text-left hover:bg-white/[0.05]"
                  data-testid="outgoing-unresolved"
                  onClick={() => createStub(link)}
                >
                  <div className="truncate text-[13px] text-[var(--text-primary)]">{link.label}</div>
                  <div className="text-[11px] text-[var(--text-muted)]">
                    Unresolved · Create note
                  </div>
                </button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      <p className="flex items-center gap-1 text-[10.5px] text-[var(--text-muted)]">
        <ArrowUpRight size={12} />
        Links from this note. Unresolved rows create a note.
      </p>
    </div>
  );
}
