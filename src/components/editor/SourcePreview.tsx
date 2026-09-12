import { useMemo } from "react";
import { markdownToHtml } from "@/lib/markdown/serialize";
import { resolveWikilink } from "@/lib/graph/build-graph";
import { parseWikilinkInner } from "@/lib/markdown/wikilinks";
import { useVaultStore } from "@/lib/vault/store";

export function SourcePreview({ content }: { content: string }) {
  const html = useMemo(() => {
    try {
      return markdownToHtml(content || "");
    } catch {
      return "<p></p>";
    }
  }, [content]);

  return (
    <div
      className="nexus-source-preview note-editor"
      onClick={(e) => {
        const el = (e.target as HTMLElement).closest("[data-wikilink]");
        if (!(el instanceof HTMLElement)) return;
        const target = el.getAttribute("data-wikilink") || "";
        const parts = parseWikilinkInner(target);
        const state = useVaultStore.getState();
        const hit = parts.noteTarget
          ? resolveWikilink(parts.noteTarget, state.nodes)
          : state.activeNoteId
            ? state.nodes[state.activeNoteId]
            : null;
        if (hit?.kind === "note") {
          state.setActiveNote(hit.id, {
            heading: parts.heading,
            blockId: parts.blockId,
            pane: e.altKey ? "secondary" : "primary",
          });
        }
      }}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
