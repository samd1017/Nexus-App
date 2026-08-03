import { useCallback, useEffect, useRef } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import type { Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { StyledBulletList } from "@/lib/editor/styled-bullet-list";
import Placeholder from "@tiptap/extension-placeholder";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";
import Image from "@tiptap/extension-image";
import Link from "@tiptap/extension-link";
import TextAlign from "@tiptap/extension-text-align";
import { Table } from "@tiptap/extension-table";
import { TableRow } from "@tiptap/extension-table-row";
import { TableCell } from "@tiptap/extension-table-cell";
import { TableHeader } from "@tiptap/extension-table-header";
import { Wikilink } from "@/lib/markdown/wikilink-extension";
import {
  markdownWithWikilinksToHtml,
  htmlDocToMarkdown,
} from "@/lib/markdown/serialize";
import { useVaultStore } from "@/lib/vault/store";
import { resolveWikilink } from "@/lib/graph/build-graph";
import {
  isOnlySerializationNoise,
  preferCleanWrite,
} from "@/lib/markdown/purity";
import { registerVisualFlush } from "@/lib/editor/flush";
import { EditorToolbar } from "./EditorToolbar";

interface Props {
  noteId: string;
  content: string;
}

/**
 * Visual view of a single note. Parent remounts via key when note/mode changes.
 * Always: Markdown store ↔ GFM HTML (tables, tasks) ↔ TipTap ↔ clean Markdown.
 */
export function VisualEditor({ noteId, content }: Props) {
  const updateNoteContent = useVaultStore((s) => s.updateNoteContent);
  const setActiveNote = useVaultStore((s) => s.setActiveNote);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const applying = useRef(false);
  const userEdited = useRef(false);
  const baselineMd = useRef(content);
  const noteIdRef = useRef(noteId);
  const contentRef = useRef(content);
  noteIdRef.current = noteId;
  contentRef.current = content;

  const paintWikilinks = (ed: Editor) => {
    ed.view.dom.querySelectorAll("span[data-wikilink]").forEach((pill) => {
      const t = pill.getAttribute("data-wikilink") || "";
      const hit = resolveWikilink(t, useVaultStore.getState().nodes);
      pill.classList.toggle("is-missing", !hit);
    });
  };

  const commit = useCallback(
    (ed: Editor, opts?: { force?: boolean }) => {
      if (applying.current) return;
      if (!ed || ed.isDestroyed) return;
      const id = noteIdRef.current;
      let serialized: string;
      try {
        serialized = htmlDocToMarkdown(ed.view.dom as HTMLElement);
      } catch {
        return;
      }
      const prev =
        useVaultStore.getState().nodes[id]?.content ?? baselineMd.current;
      if (
        !opts?.force &&
        isOnlySerializationNoise(prev, serialized) &&
        !userEdited.current
      ) {
        return;
      }
      if (isOnlySerializationNoise(prev, serialized)) {
        userEdited.current = false;
        return;
      }
      const md = preferCleanWrite(prev, serialized);
      if (md === prev) {
        userEdited.current = false;
        return;
      }
      baselineMd.current = md;
      userEdited.current = false;
      updateNoteContent(id, md);
    },
    [updateNoteContent],
  );

  const editor = useEditor(
    {
      immediatelyRender: false,
      extensions: [
        StarterKit.configure({
          heading: { levels: [1, 2, 3, 4] },
          codeBlock: { HTMLAttributes: { class: "note-code" } },
          bulletList: false,
        }),
        StyledBulletList,
        Placeholder.configure({
          placeholder: "Start writing… Use [[wikilinks]] to connect ideas.",
        }),
        TaskList.configure({
          HTMLAttributes: { "data-type": "taskList" },
        }),
        TaskItem.configure({
          nested: true,
          HTMLAttributes: { "data-type": "taskItem" },
        }),
        Image.configure({ inline: false, allowBase64: true }),
        Link.configure({ openOnClick: false, autolink: true }),
        TextAlign.configure({
          types: ["heading", "paragraph"],
          alignments: ["left", "center", "right"],
        }),
        Table.configure({
          resizable: true,
          HTMLAttributes: { class: "note-table" },
        }),
        TableRow,
        TableHeader,
        TableCell,
        Wikilink.configure({
          onOpen: (target) => {
            const hit = resolveWikilink(target, useVaultStore.getState().nodes);
            if (hit) setActiveNote(hit.id);
          },
        }),
      ],
      content: markdownWithWikilinksToHtml(content || ""),
      editorProps: {
        attributes: {
          class: "note-editor min-h-[50vh] focus:outline-none",
          "data-note-id": noteId,
        },
      },
      onCreate: ({ editor: ed }) => {
        applying.current = true;
        const html = markdownWithWikilinksToHtml(contentRef.current || "");
        ed.commands.setContent(html, { emitUpdate: false });
        baselineMd.current = contentRef.current;
        userEdited.current = false;
        requestAnimationFrame(() => {
          paintWikilinks(ed);
          applying.current = false;
        });
      },
      onUpdate: ({ editor: ed }) => {
        if (applying.current) return;
        userEdited.current = true;
        if (saveTimer.current) clearTimeout(saveTimer.current);
        saveTimer.current = setTimeout(() => commit(ed), 200);
      },
    },
    [noteId],
  );

  // External / store content while mounted (Hermes, title rename, Source flush)
  useEffect(() => {
    if (!editor || editor.isDestroyed) return;
    if (userEdited.current) return;
    if (isOnlySerializationNoise(baselineMd.current, content)) return;
    applying.current = true;
    baselineMd.current = content;
    contentRef.current = content;
    const html = markdownWithWikilinksToHtml(content || "");
    editor.commands.setContent(html, { emitUpdate: false });
    requestAnimationFrame(() => {
      paintWikilinks(editor);
      applying.current = false;
    });
  }, [editor, content]);

  useEffect(() => {
    if (!editor) return;
    const flushNow = () => {
      if (saveTimer.current) {
        clearTimeout(saveTimer.current);
        saveTimer.current = null;
      }
      try {
        if (!editor.isDestroyed) commit(editor, { force: true });
      } catch {
        /* destroyed */
      }
    };
    registerVisualFlush(flushNow);
    return () => {
      flushNow();
      registerVisualFlush(null);
      if (saveTimer.current) {
        clearTimeout(saveTimer.current);
        saveTimer.current = null;
      }
    };
  }, [editor, commit]);

  if (!editor) {
    return (
      <div
        className="flex h-40 items-center justify-center text-[var(--text-muted)]"
        data-note-id={noteId}
      >
        <div className="h-5 w-5 animate-pulse rounded-md bg-[rgba(0,200,255,0.2)]" />
      </div>
    );
  }

  return (
    <div className="fade-in flex h-full min-h-0 flex-col" data-note-id={noteId}>
      <EditorToolbar editor={editor} />
      <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4 md:px-10 md:py-6">
        <div className="mx-auto max-w-[720px]">
          <EditorContent editor={editor} />
        </div>
      </div>
    </div>
  );
}
