import { NodeViewWrapper } from "@tiptap/react";
import type { NodeViewProps } from "@tiptap/react";
import { FileText } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useVaultStore } from "@/lib/vault/store";
import { noteTitle } from "@/lib/vault/types";
import { resolveWikilink } from "@/lib/graph/build-graph";
import { parseWikilinkInner } from "@/lib/markdown/wikilinks";
import { sliceEmbedBody } from "@/lib/markdown/note-slice";
import { markdownToHtml, previewSnippet } from "@/lib/markdown/serialize";

export function EmbedView({ node, editor }: NodeViewProps) {
  const target = String(node.attrs.target || "").trim();
  const parts = useMemo(() => parseWikilinkInner(target), [target]);
  const nodes = useVaultStore((s) => s.nodes);
  const activeNoteId = useVaultStore((s) => s.activeNoteId);
  const setActiveNote = useVaultStore((s) => s.setActiveNote);
  const ensureNoteBody = useVaultStore((s) => s.ensureNoteBody);
  const [body, setBody] = useState("");
  let hostNoteId = activeNoteId;
  try {
    hostNoteId =
      editor.view.dom.getAttribute("data-note-id") || activeNoteId;
  } catch {
    /* editor not mounted */
  }

  const hit = useMemo(() => {
    if (parts.noteTarget) return resolveWikilink(parts.noteTarget, nodes);
    if (hostNoteId) {
      const self = nodes[hostNoteId];
      return self?.kind === "note" ? self : null;
    }
    return null;
  }, [parts.noteTarget, nodes, hostNoteId]);
  const note = hit?.kind === "note" ? hit : null;

  useEffect(() => {
    if (!note) {
      setBody("");
      return;
    }
    const live = nodes[note.id]?.content;
    if (live != null) {
      setBody(live);
      return;
    }
    let cancelled = false;
    void ensureNoteBody(note.id).then((md: string | null) => {
      if (!cancelled) setBody(md ?? "");
    });
    return () => {
      cancelled = true;
    };
  }, [note, nodes, ensureNoteBody]);

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
        ) : (
          <p className="nexus-embed-missing">Create the note or fix the wikilink target.</p>
        )}
        {note && (parts.heading || parts.blockId) && !sliced.sliced && body ? (
          <p className="nexus-embed-missing px-1 pt-1">
            Section not found — showing the full note.
          </p>
        ) : null}
      </div>
    </NodeViewWrapper>
  );
}
