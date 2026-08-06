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
import { shouldUseFolderGraph } from "@/lib/vault/scale-flags";
import {
  isOnlySerializationNoise,
  normalizeMarkdown,
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
import { dailyNotePath } from "@/lib/vault/templates";
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
  const activateNote = (id: string) => {
    const noteCount = Object.values(state.nodes).filter(
      (n) => n.kind === "note",
    ).length;
    // Large vaults: wikilink open → ego neighborhood (does not thrash setActiveNote scope)
    if (shouldUseFolderGraph(noteCount)) {
      state.enterGraphEgo?.({ returnPath: state.graphBrowsePath || "" });
    }
    state.setActiveNote(id);
  };
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
    if (child) activateNote(child.id);
    else state.setToast(`Opened folder “${hit.name}”`);
    return;
  }
  activateNote(hit.id);
}

/**
 * True when daily template Focus section still has only empty bullets
 * (e.g. `## Focus\n\n- \n`).
 */
function hasEmptyFocusBullet(markdown: string): boolean {
  const focusMatch =
    /^##\s+Focus\s*\n([\s\S]*?)(?=^##\s+|\s*$)/m.exec(markdown);
  if (!focusMatch) return false;
  const body = focusMatch[1].trim();
  if (!body) return true;
  const lines = body.split("\n").filter((l) => l.trim().length > 0);
  if (lines.length === 0) return true;
  return lines.every((line) => /^\s*-\s*$/.test(line));
}

/** Place caret in first empty paragraph under ## Focus, else focus end of first list item. */
function morningAutofocusEditor(ed: Editor): void {
  let afterFocus = false;
  let targetPos: number | null = null;
  ed.state.doc.descendants((node, pos) => {
    if (targetPos != null) return false;
    if (node.type.name === "heading") {
      const text = node.textContent.trim().toLowerCase();
      if (text === "focus") {
        afterFocus = true;
        return;
      }
      if (afterFocus) {
        afterFocus = false;
        return false;
      }
    }
    if (
      afterFocus &&
      node.type.name === "paragraph" &&
      node.textContent.trim() === ""
    ) {
      targetPos = pos + 1;
      return false;
    }
  });
  if (targetPos != null) {
    ed.chain().focus().setTextSelection(targetPos).run();
  } else {
    ed.commands.focus();
  }
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
  /** Morning autofocus: once per note id open */
  const morningFocusedFor = useRef<string | null>(null);
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
  const suggestQueryRef = useRef("");
  const suggestItemsRef = useRef<WikilinkSuggestItem[]>([]);
  const suggestSelectedRef = useRef(0);
  const suggestRangeRef = useRef({ from: 0, to: 0 });
  const createFromSuggestRef = useRef<(title: string) => void>(() => {});
  const pickSuggestRef = useRef<(item: WikilinkSuggestItem) => void>(() => {});
  suggestOpenRef.current = suggestOpen;
  suggestQueryRef.current = suggestQuery;
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
      // Mid setContent: skip unless force flush after real user input
      if (applying.current && !(opts?.force && userEdited.current)) return;
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
      const edited = userEdited.current;
      const noise = isOnlySerializationNoise(prev, serialized);

      // Serialization-only rewrites: skip unless the user actually typed
      if (noise && !edited) {
        return;
      }

      // User-typed path: honor normalize-level diffs (preferCleanWrite would
      // drop fingerprint-equal but normalize-different edits). Force flush
      // with userEdited still reaches here so rapid Visual↔Source never drops input.
      const md = edited
        ? normalizeMarkdown(prev) === normalizeMarkdown(serialized)
          ? prev
          : normalizeMarkdown(serialized)
        : preferCleanWrite(prev, serialized);
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
          // Link is registered separately — avoid duplicate extension warning
          link: false,
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
            if (!items.length) {
              const q = suggestQueryRef.current.trim();
              if (q && event.key === "Enter") {
                event.preventDefault();
                createFromSuggestRef.current(q);
                return true;
              }
              return false;
            }
            event.preventDefault();
            const item = items[suggestSelectedRef.current] ?? items[0];
            if (item) {
              pickSuggestRef.current(item);
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

  // Morning autofocus: today's daily with empty Focus bullet — once per note open
  useEffect(() => {
    if (!editor || editor.isDestroyed) return;
    if (morningFocusedFor.current === noteId) return;
    const node = useVaultStore.getState().nodes[noteId];
    if (!node || node.kind !== "note") return;
    if (node.path !== dailyNotePath(new Date())) return;
    const body = node.content ?? content;
    if (!hasEmptyFocusBullet(body)) return;
    morningFocusedFor.current = noteId;
    // Wait for onCreate setContent paint
    const t = window.setTimeout(() => {
      if (editor.isDestroyed) return;
      try {
        morningAutofocusEditor(editor);
      } catch {
        /* ignore */
      }
    }, 40);
    return () => window.clearTimeout(t);
  }, [editor, noteId, content]);

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
  // use DOM keyup on the editor root for Mac reliability
  useEffect(() => {
    if (!editor) return;
    const dom = editor.view.dom;
    const onKeyUp = () => refreshSuggest(editor);
    dom.addEventListener("keyup", onKeyUp);
    return () => dom.removeEventListener("keyup", onKeyUp);
  }, [editor, refreshSuggest]);

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

  const createFromSuggest = (title: string) => {
    const cleaned = title.trim();
    if (!cleaned) return;
    const state = useVaultStore.getState();
    // Stay on current note — create linked note without activating
    const id = state.createNote(null, cleaned, { activate: false });
    const node = useVaultStore.getState().nodes[id];
    const item: WikilinkSuggestItem = {
      id,
      kind: "note",
      title: cleaned,
      path: node?.path ?? `${cleaned}.md`,
      target: cleaned,
    };
    state.setToast(`Created “${cleaned}”`);
    pickSuggest(item);
  };

  pickSuggestRef.current = pickSuggest;
  createFromSuggestRef.current = createFromSuggest;

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
          onCreate={createFromSuggest}
          onHover={setSuggestSelected}
          onClose={() => setSuggestOpen(false)}
        />
      </div>
    </div>
  );
}
