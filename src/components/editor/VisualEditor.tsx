import { useCallback, useEffect, useRef, useState } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import type { Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { StyledBulletList } from "@/lib/editor/styled-bullet-list";
import Placeholder from "@tiptap/extension-placeholder";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";
import { VaultImage } from "@/lib/editor/vault-image";
import { resolveVaultImageUrl } from "@/lib/vault/image-import";
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
import { registerVisualFlush, flushActiveEditors } from "@/lib/editor/flush";
import {
  buildSuggestItems,
  coordsAtPos,
  detectOpenWikilink,
  insertWikilinkSuggestion,
  type WikilinkSuggestItem,
} from "@/lib/editor/wikilink-suggest";
import { EditorToolbar } from "./EditorToolbar";
import { WikilinkSuggestMenu } from "./WikilinkSuggestMenu";

interface Props {
  noteId: string;
  content: string;
}

function openWikilinkTarget(target: string) {
  const state = useVaultStore.getState();
  // Persist current editor first so graph/backlinks update immediately
  try {
    flushActiveEditors();
  } catch {
    /* ignore */
  }
  const hit = resolveWikilink(target, state.nodes);
  if (!hit) {
    state.setToast(`No note found for [[${target}]]`);
    return;
  }
  if (hit.kind === "folder") {
    if (!state.expandedFolders.includes(hit.id)) {
      state.toggleFolder(hit.id);
    }
    const child = Object.values(state.nodes)
      .filter((n) => n.parentId === hit.id && n.kind === "note")
      .sort((a, b) => a.name.localeCompare(b.name))[0];
    if (child) state.setActiveNote(child.id);
    else state.setToast(`Opened folder “${hit.name}”`);
    return;
  }
  state.setActiveNote(hit.id);
}

/**
 * Visual view of a single note. Parent remounts via key when note/mode changes.
 * Always: Markdown store ↔ GFM HTML (tables, tasks) ↔ TipTap ↔ clean Markdown.
 */
export function VisualEditor({ noteId, content }: Props) {
  const updateNoteContent = useVaultStore((s) => s.updateNoteContent);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const applying = useRef(false);
  const userEdited = useRef(false);
  const baselineMd = useRef(content);
  const noteIdRef = useRef(noteId);
  const contentRef = useRef(content);
  noteIdRef.current = noteId;
  contentRef.current = content;

  const [suggestOpen, setSuggestOpen] = useState(false);
  const [suggestQuery, setSuggestQuery] = useState("");
  const [suggestFrom, setSuggestFrom] = useState(0);
  const [suggestTo, setSuggestTo] = useState(0);
  const [suggestItems, setSuggestItems] = useState<WikilinkSuggestItem[]>([]);
  const [suggestSelected, setSuggestSelected] = useState(0);
  const [suggestRect, setSuggestRect] = useState({
    left: 0,
    top: 0,
    bottom: 0,
  });
  const suggestOpenRef = useRef(false);
  const suggestItemsRef = useRef<WikilinkSuggestItem[]>([]);
  const suggestSelectedRef = useRef(0);
  const suggestRangeRef = useRef({ from: 0, to: 0 });
  suggestOpenRef.current = suggestOpen;
  suggestItemsRef.current = suggestItems;
  suggestSelectedRef.current = suggestSelected;
  suggestRangeRef.current = { from: suggestFrom, to: suggestTo };

  const paintEditorExtras = (ed: Editor) => {
    ed.view.dom.querySelectorAll("span[data-wikilink]").forEach((pill) => {
      const t = pill.getAttribute("data-wikilink") || "";
      const hit = resolveWikilink(t, useVaultStore.getState().nodes);
      pill.classList.toggle("is-missing", !hit);
      pill.classList.add("wikilink-pill");
      (pill as HTMLElement).style.cursor = "pointer";
    });
    void (async () => {
      const imgs = Array.from(
        ed.view.dom.querySelectorAll("img[src], img[data-vault-src]"),
      ) as HTMLImageElement[];
      for (const img of imgs) {
        const srcAttr = img.getAttribute("src") || "";
        const key =
          img.getAttribute("data-vault-src") ||
          (srcAttr &&
          !srcAttr.startsWith("http") &&
          !srcAttr.startsWith("blob:") &&
          !srcAttr.startsWith("data:")
            ? srcAttr
            : null);
        if (!key) continue;
        if (!img.getAttribute("data-vault-src")) {
          img.setAttribute("data-vault-src", key);
        }
        if (srcAttr.startsWith("blob:") || srcAttr.startsWith("data:")) continue;
        const url = await resolveVaultImageUrl(key);
        if (url && !ed.isDestroyed) {
          img.setAttribute("src", url);
        }
      }
    })();
  };

  const refreshSuggest = useCallback((ed: Editor) => {
    const open = detectOpenWikilink(ed);
    if (!open) {
      setSuggestOpen(false);
      return;
    }
    const items = buildSuggestItems(
      useVaultStore.getState().nodes,
      open.query,
    );
    setSuggestOpen(true);
    setSuggestQuery(open.query);
    setSuggestFrom(open.from);
    setSuggestTo(open.to);
    setSuggestItems(items);
    setSuggestSelected(0);
    setSuggestRect(coordsAtPos(ed, open.to));
  }, []);

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
          placeholder: "Start writing… Type [[ to link notes.",
        }),
        TaskList.configure({
          HTMLAttributes: { "data-type": "taskList" },
        }),
        TaskItem.configure({
          nested: true,
          HTMLAttributes: { "data-type": "taskItem" },
        }),
        VaultImage.configure({ inline: false, allowBase64: true }),
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
          onOpen: (target) => openWikilinkTarget(target),
        }),
      ],
      content: markdownWithWikilinksToHtml(content || ""),
      editorProps: {
        attributes: {
          class: "note-editor min-h-[50vh] focus:outline-none",
          "data-note-id": noteId,
        },
        handleKeyDown: (view, event) => {
          if (!suggestOpenRef.current) return false;
          const items = suggestItemsRef.current;
          if (event.key === "ArrowDown") {
            event.preventDefault();
            setSuggestSelected((i) =>
              items.length ? (i + 1) % items.length : 0,
            );
            return true;
          }
          if (event.key === "ArrowUp") {
            event.preventDefault();
            setSuggestSelected((i) =>
              items.length ? (i - 1 + items.length) % items.length : 0,
            );
            return true;
          }
          if (event.key === "Enter" || event.key === "Tab") {
            if (!items.length) return false;
            event.preventDefault();
            const item = items[suggestSelectedRef.current] ?? items[0];
            if (item) {
              // Build a minimal editor-like chain from the view
              const { from, to } = suggestRangeRef.current;
              const { state, dispatch } = view;
              const tr = state.tr;
              tr.delete(from, to);
              const mark = state.schema.marks.wikilink?.create({
                target: item.target,
                alias: item.title,
              });
              const textNode = state.schema.text(
                item.title,
                mark ? [mark] : undefined,
              );
              tr.insert(from, textNode);
              tr.insertText(" ", from + item.title.length);
              dispatch(tr);
              setSuggestOpen(false);
            }
            return true;
          }
          if (event.key === "Escape") {
            event.preventDefault();
            setSuggestOpen(false);
            return true;
          }
          return false;
        },
      },
      onCreate: ({ editor: ed }) => {
        applying.current = true;
        const html = markdownWithWikilinksToHtml(contentRef.current || "");
        ed.commands.setContent(html, { emitUpdate: false });
        baselineMd.current = contentRef.current;
        userEdited.current = false;
        requestAnimationFrame(() => {
          paintEditorExtras(ed);
          applying.current = false;
        });
      },
      onUpdate: ({ editor: ed }) => {
        if (applying.current) return;
        userEdited.current = true;
        refreshSuggest(ed);
        if (saveTimer.current) clearTimeout(saveTimer.current);
        // Faster flush so graph edges appear promptly after linking
        saveTimer.current = setTimeout(() => commit(ed), 160);
      },
      onSelectionUpdate: ({ editor: ed }) => {
        if (applying.current) return;
        refreshSuggest(ed);
      },
    },
    [noteId],
  );

  // External / store content while mounted
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
      paintEditorExtras(editor);
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

  // Keep suggest handleKeyDown closure fresh — rebind via editor prop is static;
  // use DOM keydown fallback on the editor root for Mac reliability
  useEffect(() => {
    if (!editor) return;
    const dom = editor.view.dom;
    const onKey = (event: KeyboardEvent) => {
      if (!suggestOpen) return;
      if (
        event.key === "ArrowDown" ||
        event.key === "ArrowUp" ||
        event.key === "Enter" ||
        event.key === "Tab" ||
        event.key === "Escape"
      ) {
        // handled in editorProps if focus inside; also handle here
      }
    };
    dom.addEventListener("keyup", () => refreshSuggest(editor));
    return () => dom.removeEventListener("keyup", () => refreshSuggest(editor));
  }, [editor, suggestOpen, refreshSuggest]);

  const pickSuggest = (item: WikilinkSuggestItem) => {
    if (!editor) return;
    insertWikilinkSuggestion(
      editor,
      { from: suggestFrom, to: suggestTo },
      item,
    );
    setSuggestOpen(false);
    // Force immediate save for graph
    window.setTimeout(() => {
      if (editor && !editor.isDestroyed) commit(editor, { force: true });
    }, 0);
  };

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
      <div className="relative min-h-0 flex-1 overflow-y-auto px-6 py-4 md:px-10 md:py-6">
        <div className="mx-auto max-w-[720px]">
          <EditorContent editor={editor} />
        </div>
        <WikilinkSuggestMenu
          open={suggestOpen}
          items={suggestItems}
          selected={suggestSelected}
          query={suggestQuery}
          rect={suggestRect}
          onSelect={pickSuggest}
          onHover={setSuggestSelected}
          onClose={() => setSuggestOpen(false)}
        />
      </div>
    </div>
  );
}
