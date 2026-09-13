import { useEffect, useMemo, useRef } from "react";
import { markdownToHtml } from "@/lib/markdown/serialize";
import { resolveWikilink } from "@/lib/graph/build-graph";
import { parseWikilinkInner } from "@/lib/markdown/wikilinks";
import { useVaultStore } from "@/lib/vault/store";
import { usePrefsStore } from "@/lib/prefs/preferences";
import { hydratePreviewSpecials } from "@/lib/editor/hydrate-preview";
import { isVaultAttachmentHref } from "@/lib/vault/attachments";

export function SourcePreview({ content }: { content: string }) {
  const theme = usePrefsStore((s) => s.theme);
  const html = useMemo(() => {
    try {
      return markdownToHtml(content || "");
    } catch {
      return "<p></p>";
    }
  }, [content]);
  const hostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = hostRef.current;
    if (!root) return;
    let cancelled = false;
    root.innerHTML = html;
    const state = useVaultStore.getState();
    const frame = window.requestAnimationFrame(() => {
      if (cancelled || !hostRef.current) return;
      void hydratePreviewSpecials(
        hostRef.current,
        theme,
        state.nodes,
        state.activeNoteId,
        () => cancelled,
      );
    });
    return () => {
      cancelled = true;
      window.cancelAnimationFrame(frame);
    };
  }, [html, theme]);

  return (
    <div
      ref={hostRef}
      className="nexus-source-preview note-editor"
      onClick={(e) => {
        const hrefEl = (e.target as HTMLElement).closest("a[href]");
        if (hrefEl instanceof HTMLAnchorElement) {
          const href = hrefEl.getAttribute("href") || "";
          if (isVaultAttachmentHref(href)) {
            e.preventDefault();
            useVaultStore.getState().openAttachmentsRail();
            return;
          }
        }
        const openBtn = (e.target as HTMLElement).closest("[data-open-note]");
        if (openBtn instanceof HTMLElement) {
          const id = openBtn.getAttribute("data-open-note") || "";
          const heading = openBtn.getAttribute("data-jump-heading") || undefined;
          const blockId = openBtn.getAttribute("data-jump-block") || undefined;
          if (id) {
            useVaultStore.getState().setActiveNote(id, {
              heading: heading || undefined,
              blockId: blockId || undefined,
              pane: e.altKey ? "secondary" : "primary",
            });
          }
          return;
        }
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
          return;
        }
        const title = (parts.noteTarget || "").trim();
        if (!title) return;
        const created = state.createNote(null, title, { activate: false });
        if (created) {
          state.setToast(`Created “${title}”`);
          state.setActiveNote(created, {
            heading: parts.heading,
            blockId: parts.blockId,
            pane: e.altKey ? "secondary" : "primary",
          });
        }
      }}
    />
  );
}
