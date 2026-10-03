import { useEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent } from "react";
import { markdownToHtml } from "@/lib/markdown/serialize";
import { findEmbedTarget, openWikilink } from "@/lib/editor/open-wikilink";
import { getFindFocusPane } from "@/lib/editor/find-target";
import { useVaultStore } from "@/lib/vault/store";
import { noteOpenGesture } from "@/lib/vault/note-tabs";
import { isMacOS } from "@/lib/platform";
import { usePrefsStore } from "@/lib/prefs/preferences";
import { hydratePreviewSpecials, previewTaskAt, refreshTaskQueries, wirePreviewTaskBoxes } from "@/lib/editor/hydrate-preview";
import { isVaultAttachmentHref } from "@/lib/vault/attachments";
import { editTask, openTaskInNote } from "@/lib/tasks/actions";
import { toggleTask } from "@/lib/tasks/edit";
import { currentTasks, subscribeTasks } from "@/lib/tasks/task-index";
import type { VaultTask } from "@/lib/tasks/extract";
import { TaskMenuAt } from "@/components/tasks/TaskRow";

function scrollParent(el: HTMLElement): HTMLElement | null {
  for (let node: HTMLElement | null = el; node; node = node.parentElement) {
    const overflow = getComputedStyle(node).overflowY;
    if (overflow === "auto" || overflow === "scroll") return node;
  }
  return null;
}

const TASK_BLOCK = /^[ \t]*(?:```|~~~)[ \t]*(?:(?:nexus-query|dataview)[ \t]*\r?\n\s*tasks?\b|tasks[ \t]*$)/im;

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
  const [menu, setMenu] = useState<{ task: VaultTask; x: number; y: number } | null>(null);
  const shownNoteRef = useRef<string | null>(null);

  useEffect(() => {
    const root = hostRef.current;
    if (!root) return;
    let cancelled = false;
    const state = useVaultStore.getState();
    const shown = noteId ?? state.activeNoteId;
    // Live blocks are empty until they fill in again; holding the old height keeps the reader's place after an edit.
    const scroller = shownNoteRef.current === shown && root.childElementCount ? scrollParent(root) : null;
    const top = scroller?.scrollTop ?? 0;
    const held = scroller ? root.scrollHeight : 0;
    shownNoteRef.current = shown;
    root.innerHTML = html;
    wirePreviewTaskBoxes(root, content || "", shown);
    let spacer: HTMLDivElement | null = null;
    if (scroller && held > root.scrollHeight) {
      spacer = document.createElement("div");
      spacer.setAttribute("aria-hidden", "true");
      spacer.style.height = `${held - root.scrollHeight}px`;
      root.append(spacer);
      scroller.scrollTop = top;
    }
    const frame = window.requestAnimationFrame(() => {
      if (cancelled || !hostRef.current) return;
      void hydratePreviewSpecials(hostRef.current, theme, state.nodes, shown, () => cancelled, findEmbedTarget).finally(() => {
        spacer?.remove();
      });
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

  const taskMenu = (e: ReactMouseEvent) => {
    const task = previewTaskAt(e.target as Element);
    if (!task) return;
    e.preventDefault();
    setMenu({ task, x: e.clientX, y: e.clientY });
  };

  return (
    <>
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
        onContextMenu={taskMenu}
      />
      {menu ? (
        <TaskMenuAt
          key={`${menu.task.noteId}:${menu.task.line}:${menu.x}:${menu.y}`}
          task={menu.task}
          x={menu.x}
          y={menu.y}
          onClose={() => setMenu(null)}
        />
      ) : null}
    </>
  );
}
