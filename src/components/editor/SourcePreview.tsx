import { useEffect, useMemo, useRef } from "react";
import { markdownToHtml } from "@/lib/markdown/serialize";
import { openWikilink } from "@/lib/editor/open-wikilink";
import { useVaultStore } from "@/lib/vault/store";
import { usePrefsStore } from "@/lib/prefs/preferences";
import { hydratePreviewSpecials } from "@/lib/editor/hydrate-preview";
import { isVaultAttachmentHref } from "@/lib/vault/attachments";

export function SourcePreview({
  content,
  noteId,
  reading = false,
}: {
  content: string;
  noteId?: string | null;
  /** The whole pane: takes focus so arrows and Page Down scroll it. */
  reading?: boolean;
}) {
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
        noteId ?? state.activeNoteId,
        () => cancelled,
      );
    });
    return () => {
      cancelled = true;
      window.cancelAnimationFrame(frame);
    };
  }, [html, theme, noteId]);

  return (
    <div
      ref={hostRef}
      className={reading ? "nexus-source-preview note-editor outline-none" : "nexus-source-preview note-editor"}
      tabIndex={reading ? -1 : undefined}
      aria-label={reading ? "Reading view" : undefined}
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
        e.preventDefault();
        void openWikilink(el.getAttribute("data-wikilink") || "", {
          hostId: noteId || useVaultStore.getState().activeNoteId,
          pane: e.altKey ? "secondary" : "primary",
        });
      }}
    />
  );
}
