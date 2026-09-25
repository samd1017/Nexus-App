import { NodeViewWrapper } from "@tiptap/react";
import type { NodeViewProps } from "@tiptap/react";
import { FileText } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useVaultStore } from "@/lib/vault/store";
import { noteTitle } from "@/lib/vault/types";
import { resolveWikilink } from "@/lib/graph/build-graph";
import { catalogLinkTarget, readEmbedBody } from "@/lib/editor/open-wikilink";
import { parseWikilinkInner } from "@/lib/markdown/wikilinks";
import { sliceEmbedBody } from "@/lib/markdown/note-slice";
import { markdownToHtml, previewSnippet } from "@/lib/markdown/serialize";
import { scheduleFillSafeHydrate, shouldSkipBackgroundBodyHydrate } from "@/lib/vault/fill-interaction";

export function EmbedView({ node, editor }: NodeViewProps) {
  const target = String(node.attrs.target || "").trim();
  const parts = useMemo(() => parseWikilinkInner(target), [target]);
  const nodes = useVaultStore((s) => s.nodes);
  const activeNoteId = useVaultStore((s) => s.activeNoteId);
  const setActiveNote = useVaultStore((s) => s.setActiveNote);
  const indexFillBusy = useVaultStore((s) => s.indexFillBusy);
  const [body, setBody] = useState("");
  let hostNoteId = activeNoteId;
  try {
    hostNoteId =
      editor.view.dom.getAttribute("data-note-id") || activeNoteId;
  } catch {
    /* editor not mounted */
  }

  const localHit = useMemo(() => {
    if (parts.noteTarget) return resolveWikilink(parts.noteTarget, nodes);
    if (hostNoteId) {
      const self = nodes[hostNoteId];
      return self?.kind === "note" ? self : null;
    }
    return null;
  }, [parts.noteTarget, nodes, hostNoteId]);

  // Not in the loaded window: ask the whole catalog, as a wikilink click does.
  const shellCatalog = useVaultStore((s) => s.shellCatalog);
  const shellDbPath = useVaultStore((s) => s.shellDbPath);
  const shellLiveTick = useVaultStore((s) => s.shellLiveTick);
  const [outside, setOutside] = useState<{
    target: string;
    id: string | null;
    state: "looking" | "found" | "miss" | "unsure";
  } | null>(null);
  const askCatalog = !localHit && Boolean(parts.noteTarget) && shellCatalog && Boolean(shellDbPath);
  const retryKey = outside?.state === "unsure" ? shellLiveTick : 0;
  useEffect(() => {
    if (!askCatalog) {
      setOutside(null);
      return;
    }
    const noteTarget = parts.noteTarget;
    let cancelled = false;
    setOutside((prev) =>
      prev?.target === noteTarget && prev.state !== "miss" ? prev : { target: noteTarget, id: null, state: "looking" },
    );
    void catalogLinkTarget(noteTarget).then((found) => {
      if (cancelled) return;
      if (found.kind === "node" && found.node.kind === "note") {
        setOutside({ target: noteTarget, id: found.node.id, state: "found" });
      } else {
        setOutside({ target: noteTarget, id: null, state: found.kind === "unsure" ? "unsure" : "miss" });
      }
    });
    return () => {
      cancelled = true;
    };
  }, [askCatalog, parts.noteTarget, shellDbPath, retryKey]);

  const outsideNote =
    outside?.state === "found" && outside.target === parts.noteTarget && outside.id
      ? nodes[outside.id] ?? null
      : null;
  const hit = localHit ?? outsideNote;
  const note = hit?.kind === "note" ? hit : null;
  const finding = !note && askCatalog && (!outside || outside.state === "looking");
  const unsure = !note && askCatalog && outside?.state === "unsure";

  const noteId = note?.id ?? null;
  const noteContent = noteId ? nodes[noteId]?.content : undefined;
  const [bodyState, setBodyState] = useState<"reading" | "ready" | "unread">("reading");
  useEffect(() => {
    if (!noteId) {
      setBody("");
      setBodyState("ready");
      return;
    }
    if (noteContent != null) {
      setBody(noteContent);
      setBodyState("ready");
      return;
    }
    let cancelled = false;
    setBodyState("reading");
    const read = () => {
      void readEmbedBody(noteId).then((md) => {
        if (cancelled) return;
        setBody(md ?? "");
        setBodyState(md == null ? "unread" : "ready");
      });
    };
    // A big fill still gets the read, at an idle moment rather than on the paint.
    const cancelIdle = shouldSkipBackgroundBodyHydrate({ fillBusy: indexFillBusy })
      ? scheduleFillSafeHydrate(read)
      : (read(), () => {});
    return () => {
      cancelled = true;
      cancelIdle();
    };
  }, [noteId, noteContent, indexFillBusy]);

  const sliced = useMemo(
    () => sliceEmbedBody(body, parts.heading, parts.blockId),
    [body, parts.heading, parts.blockId],
  );

  const isSelfFull =
    Boolean(note && note.id === hostNoteId && !parts.heading && !parts.blockId);

  const html = useMemo(() => {
    if (isSelfFull) return "";
    if (!sliced.body) return "";
    try {
      return markdownToHtml(sliced.body.replace(/!\[\[[^\]]+\]\]/g, ""));
    } catch {
      return "";
    }
  }, [sliced.body, isSelfFull]);

  const openTarget = (pane?: "primary" | "secondary") => {
    if (!note) return;
    setActiveNote(note.id, {
      heading: parts.heading,
      blockId: parts.blockId,
      pane,
    });
  };

  const sliceLabel = parts.blockId
    ? `#^${parts.blockId}`
    : parts.heading
      ? `#${parts.heading}`
      : "";

  return (
    <NodeViewWrapper className="nexus-embed" data-type="embed" data-embed-target={target}>
      <div className="nexus-embed-head">
        <FileText size={13} className="text-[var(--accent)]" />
        {note ? (
          <button
            type="button"
            className="min-w-0 truncate font-medium text-[var(--text-primary)] hover:underline"
            onClick={(e) => openTarget(e.altKey ? "secondary" : "primary")}
          >
            {noteTitle(note)}
            {sliceLabel ? (
              <span className="text-[var(--text-muted)]"> {sliceLabel}</span>
            ) : null}
          </button>
        ) : finding || unsure ? (
          <span className="text-[var(--text-muted)]">Finding ![[{target}]]…</span>
        ) : (
          <span className="nexus-embed-missing">Missing embed ![[{target || "note"}]]</span>
        )}
        <span className="ml-auto font-mono text-[10px] text-[var(--text-muted)]">
          ![[{target}]]
        </span>
      </div>
      <div className="nexus-embed-body">
        {note ? (
          isSelfFull ? (
            <p className="nexus-embed-missing">
              This note — add #Heading or #^block to embed a slice.
            </p>
          ) : bodyState === "reading" ? (
            <p className="text-[var(--text-muted)]" data-embed-body="reading">Reading the note…</p>
          ) : bodyState === "unread" ? (
            <p className="text-[var(--text-muted)]" data-embed-body="unread">
              Still reading the vault. This fills in when it can.
            </p>
          ) : html ? (
            <div
              className="note-editor prose-note"
              dangerouslySetInnerHTML={{ __html: html }}
            />
          ) : (
            <p className="text-[var(--text-muted)]">
              {previewSnippet(sliced.body, 280) || "Empty note"}
            </p>
          )
        ) : unsure ? (
          <p className="text-[var(--text-muted)]">Still reading the vault. This fills in when it can.</p>
        ) : finding ? null : (
          <p className="nexus-embed-missing">Create the note or fix the wikilink target.</p>
        )}
        {note && bodyState === "ready" && (parts.heading || parts.blockId) && !sliced.sliced && body ? (
          <p className="nexus-embed-missing px-1 pt-1">
            Section not found — showing the full note.
          </p>
        ) : null}
      </div>
    </NodeViewWrapper>
  );
}
