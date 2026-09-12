import { NodeViewWrapper } from "@tiptap/react";
import type { NodeViewProps } from "@tiptap/react";
import { FileText } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useVaultStore } from "@/lib/vault/store";
import { noteTitle } from "@/lib/vault/types";
import { resolveWikilink } from "@/lib/graph/build-graph";
import { markdownToHtml, previewSnippet } from "@/lib/markdown/serialize";

export function EmbedView({ node }: NodeViewProps) {
  const target = String(node.attrs.target || "").trim();
  const nodes = useVaultStore((s) => s.nodes);
  const setActiveNote = useVaultStore((s) => s.setActiveNote);
  const ensureNoteBody = useVaultStore((s) => s.ensureNoteBody);
  const [body, setBody] = useState("");

  const hit = useMemo(
    () => (target ? resolveWikilink(target, nodes) : null),
    [target, nodes],
  );
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

  const html = useMemo(() => {
    if (!body) return "";
    try {
      return markdownToHtml(body.replace(/!\[\[[^\]]+\]\]/g, ""));
    } catch {
      return "";
    }
  }, [body]);

  return (
    <NodeViewWrapper className="nexus-embed" data-type="embed" data-embed-target={target}>
      <div className="nexus-embed-head">
        <FileText size={13} className="text-[var(--accent)]" />
        {note ? (
          <button
            type="button"
            className="min-w-0 truncate font-medium text-[var(--text-primary)] hover:underline"
            onClick={() => setActiveNote(note.id)}
          >
            {noteTitle(note)}
          </button>
        ) : (
          <span className="nexus-embed-missing">Missing embed ![[{target || "note"}]]</span>
        )}
        <span className="ml-auto font-mono text-[10px] text-[var(--text-muted)]">![[{target}]]</span>
      </div>
      <div className="nexus-embed-body">
        {note ? (
          html ? (
            <div
              className="note-editor prose-note"
              dangerouslySetInnerHTML={{ __html: html }}
            />
          ) : (
            <p className="text-[var(--text-muted)]">{previewSnippet(body, 280) || "Empty note"}</p>
          )
        ) : (
          <p className="nexus-embed-missing">Create the note or fix the wikilink target.</p>
        )}
      </div>
    </NodeViewWrapper>
  );
}
