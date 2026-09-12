import { useMemo } from "react";
import { markdownToHtml } from "@/lib/markdown/serialize";
import { resolveWikilink } from "@/lib/graph/build-graph";
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
        const hit = resolveWikilink(target, useVaultStore.getState().nodes);
        if (hit?.kind === "note") useVaultStore.getState().setActiveNote(hit.id);
      }}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
