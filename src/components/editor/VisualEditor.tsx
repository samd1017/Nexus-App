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
import {
  isOnlySerializationNoise,
  preferCleanWrite,
} from "@/lib/markdown/purity";
import { EditorToolbar } from "./EditorToolbar";

interface Props {
  noteId: string;
  content: string;
}

/**
 * Visual editor with purity-preserving autosave:
 * - Hermes/external content is loaded as-is
 * - Disk writes only when user edits change semantic content
 * - Serialization noise never rewrites on-disk Markdown
 */
export function VisualEditor({ noteId, content }: Props) {
  const updateNoteContent = useVaultStore((s) => s.updateNoteContent);
  const setActiveNote = useVaultStore((s) => s.setActiveNote);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastNoteId = useRef(noteId);
  const applying = useRef(false);
  /** Baseline markdown last loaded from store/disk (Hermes-safe) */
  const baselineMd = useRef(content);
  const userEdited = useRef(false);

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
      userEdited.current = true;
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => {
        const root = ed.view.dom as HTMLElement;
        const serialized = htmlDocToMarkdown(root);
        const prev =
          useVaultStore.getState().nodes[noteId]?.content ?? baselineMd.current;
        // Never rewrite Hermes notes for serialization noise alone
        if (isOnlySerializationNoise(prev, serialized)) return;
        const md = preferCleanWrite(prev, serialized);
        if (md === prev) return;
        baselineMd.current = md;
        updateNoteContent(noteId, md);
      }, 400);
    },
  });

  // Load content when note changes or external update
  useEffect(() => {
    if (!editor) return;
    const switched = lastNoteId.current !== noteId;
    lastNoteId.current = noteId;

    if (!switched) {
      // External update while same note open — only if user isn't dirty-editing
      if (userEdited.current) {
        const root = editor.view.dom as HTMLElement;
        const current = htmlDocToMarkdown(root);
        if (!isOnlySerializationNoise(current, content) && current !== content) {
          // Conflict: prefer disk (Hermes) when external and user idle > soft merge
          // If fingerprints differ, take external (Hermes wins for external mtime path)
        }
        // If content matches baseline fingerprint, ignore
        if (isOnlySerializationNoise(baselineMd.current, content)) return;
      }
      if (isOnlySerializationNoise(baselineMd.current, content)) return;
    }

    applying.current = true;
    userEdited.current = false;
    baselineMd.current = content;
    const html = markdownWithWikilinksToHtml(content || "");
    editor.commands.setContent(html, { emitUpdate: false });
    requestAnimationFrame(() => {
      const pills = editor.view.dom.querySelectorAll("span[data-wikilink]");
      pills.forEach((pill) => {
        const t = pill.getAttribute("data-wikilink") || "";
        const hit = resolveWikilink(t, useVaultStore.getState().nodes);
        pill.classList.toggle("is-missing", !hit);
      });
      applying.current = false;
    });
  }, [editor, noteId, content]);

  useEffect(() => {
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, []);

  if (!editor) {
    return (
      <div className="flex h-40 items-center justify-center text-[var(--text-muted)]">
        <div className="h-5 w-5 animate-pulse rounded-md bg-[rgba(0,200,255,0.2)]" />
      </div>
    );
  }

  return (
    <div className="fade-in flex h-full min-h-0 flex-col">
      <EditorToolbar editor={editor} />
      <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4 md:px-10 md:py-6">
        <div className="mx-auto max-w-[720px]">
          <EditorContent editor={editor} />
        </div>
      </div>
    </div>
  );
}
