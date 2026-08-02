import { useEffect, useRef } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";
import Image from "@tiptap/extension-image";
import Link from "@tiptap/extension-link";
import { Table } from "@tiptap/extension-table";
import { TableRow } from "@tiptap/extension-table-row";
import { TableCell } from "@tiptap/extension-table-cell";
import { TableHeader } from "@tiptap/extension-table-header";
import {
  Wikilink,
  markdownWithWikilinksToHtml,
  htmlDocToMarkdown,
} from "@/lib/markdown/wikilink-extension";
import { useVaultStore } from "@/lib/vault/store";
import { resolveWikilink } from "@/lib/graph/build-graph";
import { preferCleanWrite } from "@/lib/markdown/serialize";
import { EditorToolbar } from "./EditorToolbar";

interface Props {
  noteId: string;
  content: string;
}

export function VisualEditor({ noteId, content }: Props) {
  const updateNoteContent = useVaultStore((s) => s.updateNoteContent);
  const setActiveNote = useVaultStore((s) => s.setActiveNote);
  const nodes = useVaultStore((s) => s.nodes);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastNoteId = useRef(noteId);
  const applying = useRef(false);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3, 4] },
        codeBlock: { HTMLAttributes: { class: "note-code" } },
      }),
      Placeholder.configure({
        placeholder: "Start writing… Use [[wikilinks]] to connect ideas.",
      }),
      TaskList,
      TaskItem.configure({ nested: true }),
      Image.configure({ inline: false, allowBase64: true }),
      Link.configure({ openOnClick: false, autolink: true }),
      Table.configure({ resizable: false }),
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
    editorProps: {
      attributes: {
        class: "note-editor min-h-[50vh] focus:outline-none",
      },
    },
    onUpdate: ({ editor: ed }) => {
      if (applying.current) return;
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => {
        const root = ed.view.dom as HTMLElement;
        const md = preferCleanWrite(
          useVaultStore.getState().nodes[noteId]?.content ?? "",
          htmlDocToMarkdown(root),
        );
        updateNoteContent(noteId, md);
      }, 350);
    },
  });

  // Load content when note changes or external update
  useEffect(() => {
    if (!editor) return;
    const switched = lastNoteId.current !== noteId;
    lastNoteId.current = noteId;

    // Skip if local edit produced same content
    if (!switched) {
      const root = editor.view.dom as HTMLElement;
      const current = htmlDocToMarkdown(root);
      if (preferCleanWrite(current, content) === current) return;
    }

    applying.current = true;
    const html = markdownWithWikilinksToHtml(content || "");
    editor.commands.setContent(html, { emitUpdate: false });
    // mark missing wikilinks
    requestAnimationFrame(() => {
      const pills = editor.view.dom.querySelectorAll("span[data-wikilink]");
      pills.forEach((pill) => {
        const t = pill.getAttribute("data-wikilink") || "";
        const hit = resolveWikilink(t, useVaultStore.getState().nodes);
        pill.classList.toggle("is-missing", !hit);
      });
      applying.current = false;
    });
  }, [editor, noteId, content, nodes]);

  useEffect(() => {
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, []);

  if (!editor) {
    return (
      <div className="flex h-40 items-center justify-center text-[var(--text-muted)]">
        Loading editor…
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <EditorToolbar editor={editor} />
      <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4 md:px-10 md:py-6">
        <div className="mx-auto max-w-[720px]">
          <EditorContent editor={editor} />
        </div>
      </div>
    </div>
  );
}
