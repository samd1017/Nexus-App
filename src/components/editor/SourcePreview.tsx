import { useEffect, useMemo, useRef, type MouseEvent as ReactMouseEvent } from "react";
import { markdownToHtml } from "@/lib/markdown/serialize";
import { findEmbedTarget, openWikilink } from "@/lib/editor/open-wikilink";
import { getFindFocusPane } from "@/lib/editor/find-target";
import { useVaultStore } from "@/lib/vault/store";
import { noteOpenGesture } from "@/lib/vault/note-tabs";
import { isMacOS } from "@/lib/platform";
import { usePrefsStore } from "@/lib/prefs/preferences";
import { hydratePreviewSpecials, refreshTaskQueries, wirePreviewTaskBoxes } from "@/lib/editor/hydrate-preview";
import { isVaultAttachmentHref } from "@/lib/vault/attachments";
import { editTask, openTaskInNote } from "@/lib/tasks/actions";
import { toggleTask } from "@/lib/tasks/edit";
import { currentTasks, subscribeTasks } from "@/lib/tasks/task-index";

const TASK_BLOCK = /^[ \t]*(?:```|~~~)[ \t]*(?:nexus-query|dataview)[ \t]*\r?\n\s*tasks?\b/im;

export function SourcePreview({
  content,
  noteId,
  reading = false,
  pane = "primary",
}: {
  content: string;
  noteId?: string | null;
  /** The whole pane: takes focus so arrows and Page Down scroll it. */
  reading?: boolean;
  pane?: "primary" | "secondary";
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
    wirePreviewTaskBoxes(root, content || "", noteId ?? state.activeNoteId);
    const frame = window.requestAnimationFrame(() => {
      if (cancelled || !hostRef.current) return;
      void hydratePreviewSpecials(
        hostRef.current,
        theme,
        state.nodes,
        noteId ?? state.activeNoteId,
        () => cancelled,
        findEmbedTarget,
      );
    });
    return () => {
      cancelled = true;
      window.cancelAnimationFrame(frame);
    };
    // content only changes together with html
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [html, theme, noteId]);

  const hasTaskBlock = useMemo(() => TASK_BLOCK.test(content || ""), [content]);
  useEffect(() => {
    if (!hasTaskBlock) return;
    let gen = currentTasks().gen;
    let timer = 0;
    const stop = subscribeTasks(() => {
      const next = currentTasks().gen;
      if (next === gen) return;
      gen = next;
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        const root = hostRef.current;
        if (root) void refreshTaskQueries(root, noteId ?? useVaultStore.getState().activeNoteId);
      }, 80);
    });
    return () => {
      stop();
      window.clearTimeout(timer);
    };
  }, [hasTaskBlock, noteId]);

  const taskClick = (e: ReactMouseEvent): boolean => {
    const target = e.target as HTMLElement;
    const box = target.closest("[data-task-toggle]");
    if (box instanceof HTMLElement) {
      e.preventDefault();
      void editTask(
        {
          noteId: box.getAttribute("data-task-note") || "",
          line: Number(box.getAttribute("data-task-line")),
          raw: box.getAttribute("data-task-raw") || "",
          title: box.getAttribute("data-task-title") || "",
        },
        toggleTask,
      );
      return true;
    }
    const text = target.closest("[data-task-open]");
    if (text instanceof HTMLElement) {
      e.preventDefault();
      openTaskInNote({ noteId: text.getAttribute("data-task-open") || "", text: text.getAttribute("data-task-text") || "" });
      return true;
    }
    return false;
  };

  const openPreviewTarget = (e: ReactMouseEvent) => {
    if (e.type === "click" && taskClick(e)) return;
    const hrefEl = (e.target as HTMLElement).closest("a[href]");
    if (hrefEl instanceof HTMLAnchorElement) {
      const href = hrefEl.getAttribute("href") || "";
      if (isVaultAttachmentHref(href)) {
        e.preventDefault();
        useVaultStore.getState().openAttachmentsRail();
        return;
      }
    }
    const gesture = noteOpenGesture(e, { mac: isMacOS() });
    const live = useVaultStore.getState();
    const split = Boolean(live.settings.workspaceSplit && live.secondaryNoteId);
    const home = gesture === "secondary" ? "secondary" : pane || (split ? getFindFocusPane() : "primary");
    const openBtn = (e.target as HTMLElement).closest("[data-open-note]");
    if (openBtn instanceof HTMLElement) {
      const id = openBtn.getAttribute("data-open-note") || "";
      const heading = openBtn.getAttribute("data-jump-heading") || undefined;
      const blockId = openBtn.getAttribute("data-jump-block") || undefined;
      if (id) {
        live.setActiveNote(id, {
          heading: heading || undefined,
          blockId: blockId || undefined,
          pane: home,
          newTab: gesture === "new",
        });
      }
      return;
    }
    const el = (e.target as HTMLElement).closest("[data-wikilink]");
    if (!(el instanceof HTMLElement)) return;
    e.preventDefault();
    void openWikilink(el.getAttribute("data-wikilink") || "", {
      hostId: noteId || live.activeNoteId,
      pane: home,
      open: (id, jump) =>
        useVaultStore.getState().setActiveNote(id, {
          ...jump,
          pane: home,
          newTab: gesture === "new",
        }),
    });
  };

  return (
    <div
      ref={hostRef}
      className="nexus-source-preview note-editor"
      tabIndex={reading ? -1 : undefined}
      aria-label={reading ? "Reading view" : undefined}
      onClick={(e) => openPreviewTarget(e)}
      onAuxClick={(e) => {
        if (e.button !== 1) return;
        openPreviewTarget(e);
      }}
    />
  );
}
