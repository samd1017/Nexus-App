import { useCallback, useEffect, useRef, useState } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import type { Editor } from "@tiptap/react";
import { clearWriteFocus, takeHeldWrite, writeFocusPending } from "@/lib/editor/write-intent";
import StarterKit from "@tiptap/starter-kit";
import { StyledBulletList } from "@/lib/editor/styled-bullet-list";
import { SafePlaceholder } from "@/lib/editor/safe-placeholder";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";
import { VaultImage } from "@/lib/editor/vault-image";
import { resolveVaultImageUrl } from "@/lib/vault/image-import";
import { isVaultAttachmentHref } from "@/lib/vault/attachments";
import {
  handleVisualDrop,
  handleVisualPaste,
} from "@/lib/editor/paste-import";
import {
  registerVisualFindAdapter,
  setFindFocusPane,
  type FindMatch,
} from "@/lib/editor/find-target";
import { findMatchesInPmDoc } from "@/lib/editor/find-pm";
import { FindHighlight } from "@/lib/editor/find-highlight";
import { HighlightMark } from "@/lib/editor/highlight-mark";
import { Callout } from "@/lib/editor/callout-node";
import { Mermaid } from "@/lib/editor/mermaid-node";
import { MathBlock, MathInline } from "@/lib/editor/math-node";
import { Embed } from "@/lib/editor/embed-node";
import { QueryBlock } from "@/lib/editor/query-node";
import {
  detectSlashCommand,
  ensureEditableGaps,
  filterSlashItems,
  shouldBreakForSlash,
  type SlashItem,
} from "@/lib/editor/slash-commands";
import { usePrefsStore } from "@/lib/prefs/preferences";
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
import { splitFrontmatter } from "@/lib/editor/frontmatter";
import { useVaultStore } from "@/lib/vault/store";
import {
  dailyNotePath,
  isJournalDailyPath,
  upgradeSparseDailySkeleton,
} from "@/lib/vault/templates";
import { cn } from "@/lib/utils";
import { buildWikilinkIndex, resolveWikilink } from "@/lib/graph/build-graph";
import { ensureVaultIndex } from "@/lib/vault/indexes";
import { parseWikilinkInner } from "@/lib/markdown/wikilinks";
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
  suggestItemsFromHits,
  type WikilinkSuggestItem,
} from "@/lib/editor/wikilink-suggest";
import { fetchShellSuggest, onShellCatalogWake } from "@/lib/vault/shell-catalog";
import { EditorToolbar } from "./EditorToolbar";
import { WikilinkSuggestMenu } from "./WikilinkSuggestMenu";
import { SlashMenu } from "./SlashMenu";
import { WikilinkHoverCard } from "./WikilinkHoverCard";
import { registerInsertWikilink } from "@/lib/editor/insert-wikilink";

interface Props {
  noteId: string;
  content: string;
  pane?: "primary" | "secondary";
}

function countFence(md: string, lang: string): number {
  const re = new RegExp("```" + lang + "\\b", "g");
  return (md.match(re) || []).length;
}

/** Don't persist a Visual serialize that dropped mermaid/math the file still has. */
function lostSpecialMarkdown(prev: string, next: string): boolean {
  if (countFence(next, "mermaid") < countFence(prev, "mermaid")) return true;
  if (countFence(next, "query") < countFence(prev, "query")) return true;
  if ((next.match(/\$\$/g) || []).length < (prev.match(/\$\$/g) || []).length) {
    return true;
  }
  if ((next.match(/!\[\[/g) || []).length < (prev.match(/!\[\[/g) || []).length) {
    return true;
  }
  return false;
}

function openWikilinkTarget(target: string, event?: Event, hostNoteId?: string) {
  const state = useVaultStore.getState();
  // Persist current editor first so graph/backlinks update immediately
  try {
    flushActiveEditors();
  } catch {
    /* ignore */
  }
  const parts = parseWikilinkInner(target);
  const ev = event as MouseEvent | undefined;
  const pane =
    ev && (ev.altKey || (ev.metaKey && ev.shiftKey))
      ? ("secondary" as const)
      : ("primary" as const);
  const jump = {
    heading: parts.heading,
    blockId: parts.blockId,
    pane,
  };
  const hostId = hostNoteId || state.activeNoteId;
  const hit = parts.noteTarget
    ? resolveWikilink(parts.noteTarget, state.nodes)
    : hostId
      ? state.nodes[hostId]
      : null;
  const activateNote = (id: string) => {
    const noteCount = ensureVaultIndex(state.nodes).noteCount;
    // Large vaults: wikilink open → ego neighborhood (does not thrash setActiveNote scope)
    if (shouldUseFolderGraph(noteCount) && pane !== "secondary") {
      state.enterGraphEgo?.({ returnPath: state.graphBrowsePath || "" });
    }
    state.setActiveNote(id, jump);
  };
  if (!hit) {
    const title = (parts.noteTarget || "").trim();
    if (!title) {
      state.setToast(`No note found for [[${target}]]`);
      return;
    }
    const created = state.createNote(null, title, { activate: false });
    if (created) {
      state.setToast(`Created “${title}”`);
      activateNote(created);
      return;
    }
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
  return lines.every((line) => /^\s*\\?-\s*(\[[ xX]\]\s*)?$/.test(line));
}

/** Place caret in first empty paragraph under ## Focus, else focus end of first list item. */
/** A new note is often only its title heading. Writing starts on the line below it. */
function placeCaretForWriting(ed: Editor): void {
  if (ed.isDestroyed) return;
  try {
    const { doc, selection } = ed.state;
    const inHeading = selection.$from.parent.type.name === "heading";
    if (ed.isFocused && !inHeading) return;
    if (!ed.isFocused) {
      // The reader already moved on (a field, a dialog). Let them. The list
      // row the name was typed in does not count: moving in the list with
      // keys or a click ends the request in write-intent. Nor does the name
      // field itself, which still has focus for a frame after it commits.
      const active = document.activeElement as HTMLElement | null;
      if (
        active &&
        active !== document.body &&
        !active.closest?.("[data-testid='tree-rename']") &&
        active.closest?.(
          "input, textarea, select, [role='dialog'], [data-nexus-confirm], [cmdk-root]",
        )
      ) {
        clearWriteFocus();
        return;
      }
    }
    if (doc.lastChild?.type.name === "heading") {
      ed.chain()
        .insertContentAt(doc.content.size, { type: "paragraph" })
        .focus("end")
        .run();
    } else {
      ed.commands.focus("end");
    }
  } catch {
    /* ignore */
  }
}

/**
 * Writes what was typed or pasted for this note before its editor had the
 * cursor, at the writing line under the title, as a normal edit so it saves.
 * `busy` is true while the editor is refilling from the store.
 */
function writeHeldText(
  ed: Editor,
  path: string | null | undefined,
  busy?: () => boolean,
  tries = 0,
): void {
  if (ed.isDestroyed || !path) return;
  if (busy?.()) {
    if (tries < 30) requestAnimationFrame(() => writeHeldText(ed, path, busy, tries + 1));
    return;
  }
  const text = takeHeldWrite(path);
  if (!text) return;
  try {
    const inHeading = ed.state.selection.$from.parent.type.name === "heading";
    if (!ed.isFocused || inHeading) {
      if (ed.state.doc.lastChild?.type.name === "heading") {
        ed.chain().insertContentAt(ed.state.doc.content.size, { type: "paragraph" }).focus("end").run();
      } else {
        ed.commands.focus("end");
      }
    }
    if (!ed.view.pasteText(text)) ed.commands.insertContent(text);
  } catch {
    /* editor went away mid-write; the text was already taken */
  }
}

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
export function VisualEditor({ noteId, content, pane = "primary" }: Props) {
  const notePath = useVaultStore((s) => s.nodes[noteId]?.path ?? "");
  const isDaily = isJournalDailyPath(notePath);
  const updateNoteContent = useVaultStore((s) => s.updateNoteContent);
  const spellCheck = usePrefsStore((s) => s.spellCheck);
  const editorFontSize = usePrefsStore((s) => s.editorFontSize);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const applying = useRef(false);
  const selectionSigRef = useRef("");
  const userEdited = useRef(false);
  const baselineMd = useRef(upgradeSparseDailySkeleton(content || ""));
  const lastWrittenRef = useRef(baselineMd.current);
  const noteIdRef = useRef(noteId);
  const contentRef = useRef(content);
  // Bumps so a note switch does not apply a stale setContent.
  const contentApplyGen = useRef(0);
  /** Path of the note this editor last showed, for saves after a re-key. */
  const notePathRef = useRef<string | null>(null);
  // Follow renames of the note this editor is showing.
  if (notePath && noteIdRef.current === noteId) notePathRef.current = notePath;
  /** Morning autofocus: once per note id open */
  const morningFocusedFor = useRef<string | null>(null);
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
  const editorRef = useRef<Editor | null>(null);
  const [slashOpen, setSlashOpen] = useState(false);
  const [slashQuery, setSlashQuery] = useState("");
  const [slashFrom, setSlashFrom] = useState(0);
  const [slashTo, setSlashTo] = useState(0);
  const [slashItems, setSlashItems] = useState<SlashItem[]>([]);
  const [slashSelected, setSlashSelected] = useState(0);
  const [slashRect, setSlashRect] = useState({ left: 0, top: 0, bottom: 0 });
  const slashOpenRef = useRef(false);
  const slashItemsRef = useRef<SlashItem[]>([]);
  const slashSelectedRef = useRef(0);
  const slashRangeRef = useRef({ from: 0, to: 0 });
  const [hoverLink, setHoverLink] = useState<{
    target: string;
    x: number;
    y: number;
  } | null>(null);
  suggestOpenRef.current = suggestOpen;
  suggestQueryRef.current = suggestQuery;
  suggestItemsRef.current = suggestItems;
  suggestSelectedRef.current = suggestSelected;
  suggestRangeRef.current = { from: suggestFrom, to: suggestTo };
  slashOpenRef.current = slashOpen;
  slashItemsRef.current = slashItems;
  slashSelectedRef.current = slashSelected;
  slashRangeRef.current = { from: slashFrom, to: slashTo };

  const paintEditorExtras = (ed: Editor) => {
    if (!ed || ed.isDestroyed) return;
    let dom: HTMLElement;
    try {
      dom = ed.view.dom;
    } catch {
      return;
    }
    if (isDaily) {
      const h1 = dom.querySelector(":scope > h1");
      const next = h1?.nextElementSibling;
      if (
        next instanceof HTMLElement &&
        next.tagName === "P" &&
        /^\d{4}-\d{2}-\d{2}$/.test((next.textContent || "").trim())
      ) {
        next.setAttribute("data-daily-meta", "1");
      }
    }
    const nodes = useVaultStore.getState().nodes;
    const widx = buildWikilinkIndex(nodes);
    dom.querySelectorAll("span[data-wikilink]").forEach((pill) => {
      const t = pill.getAttribute("data-wikilink") || "";
      const hit = resolveWikilink(t, nodes, widx);
      pill.classList.toggle("is-missing", !hit);
      pill.classList.add("wikilink-pill");
      (pill as HTMLElement).style.cursor = "pointer";
      if (t && !pill.getAttribute("title")) {
        pill.setAttribute("title", hit ? `Open [[${t}]]` : `Missing [[${t}]]`);
      }
    });
    void (async () => {
      if (ed.isDestroyed) return;
      let liveDom: HTMLElement;
      try {
        liveDom = ed.view.dom;
      } catch {
        return;
      }
      const imgs = Array.from(
        liveDom.querySelectorAll("img[src], img[data-vault-src]"),
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
    const live = useVaultStore.getState();
    if (live.shellCatalog && live.shellDbPath) {
      const q = open.query;
      const db = live.shellDbPath;
      setSuggestOpen(true);
      setSuggestQuery(q);
      setSuggestFrom(open.from);
      setSuggestTo(open.to);
      setSuggestSelected(0);
      setSuggestRect(coordsAtPos(ed, open.to));
      const paint = (hits: Awaited<ReturnType<typeof fetchShellSuggest>>) => {
        if (!hits || suggestQueryRef.current !== q) return;
        setSuggestItems(suggestItemsFromHits(hits));
      };
      void fetchShellSuggest(db, q).then((hits) => {
        if (suggestQueryRef.current !== q) return;
        if (!hits) {
          const stop = onShellCatalogWake(() => {
            stop();
            if (suggestQueryRef.current !== q) return;
            void fetchShellSuggest(db, q).then(paint);
          });
          return;
        }
        paint(hits);
      });
      return;
    }
    const items = buildSuggestItems(live.nodes, open.query);
    setSuggestOpen(true);
    setSuggestQuery(open.query);
    setSuggestFrom(open.from);
    setSuggestTo(open.to);
    setSuggestItems(items);
    setSuggestSelected(0);
    setSuggestRect(coordsAtPos(ed, open.to));
  }, []);

  const refreshSlash = useCallback((ed: Editor) => {
    if (suggestOpenRef.current) {
      setSlashOpen(false);
      return;
    }
    const open = detectSlashCommand(ed);
    if (!open) {
      setSlashOpen(false);
      return;
    }
    const items = filterSlashItems(open.query);
    setSlashOpen(true);
    setSlashQuery(open.query);
    setSlashFrom(open.from);
    setSlashTo(open.to);
    setSlashItems(items);
    setSlashSelected(0);
    setSlashRect(coordsAtPos(ed, open.to));
  }, []);

  const commit = useCallback(
    (ed: Editor, opts?: { force?: boolean }) => {
      // Mid setContent: skip unless force flush after real user input
      if (applying.current && !(opts?.force && userEdited.current)) return;
      // Navigation and unmount also call commit. The visual doc omits
      // properties, so an unedited flush would save the body and drop them.
      if (!userEdited.current) return;
      if (!ed || ed.isDestroyed) return;
      let id = noteIdRef.current;
      // A rescan can re-key a renamed note. Save into the note that now has the
      // path this editor was showing, instead of an id that no longer exists.
      {
        const nodesNow = useVaultStore.getState().nodes;
        const path = notePathRef.current;
        if (!nodesNow[id] && path) {
          for (const nid in nodesNow) {
            if (nodesNow[nid]?.kind === "note" && nodesNow[nid]?.path === path) {
              id = nid;
              break;
            }
          }
        }
      }
      let serialized: string;
      try {
        serialized = htmlDocToMarkdown(ed.view.dom as HTMLElement);
      } catch {
        return;
      }
      const prev =
        useVaultStore.getState().nodes[id]?.content ?? baselineMd.current;
      const { yaml } = splitFrontmatter(prev);
      if (yaml != null) {
        const bodyOut = serialized.replace(/^\n+/, "");
        serialized = `---\n${yaml.replace(/\n+$/, "")}\n---\n\n${bodyOut}`;
      }
      const edited = userEdited.current;
      const noise = isOnlySerializationNoise(prev, serialized);

      // Serialization-only rewrites: skip unless the user actually typed
      if (noise && !edited) {
        return;
      }
      if (lostSpecialMarkdown(prev, serialized)) {
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
      lastWrittenRef.current = md;
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
          heading: { levels: [1, 2, 3, 4, 5, 6] },
          codeBlock: { HTMLAttributes: { class: "note-code" } },
          bulletList: false,
          // Link is registered separately — avoid duplicate extension warning
          link: false,
          // Keep one PM doc. Depth 2: switch notes without retaining 24 trees.
          undoRedo: { depth: 2 },
        }),
        StyledBulletList,
        SafePlaceholder.configure({
          showOnlyCurrent: true,
          includeChildren: true,
          placeholder: ({ editor, pos }) => {
            try {
              const $pos = editor.state.doc.resolve(pos);
              if ($pos.parent?.type.name === "taskItem") return "Add an item…";
              let heading = "";
              editor.state.doc.nodesBetween(0, pos, (node) => {
                if (node.type.name === "heading") {
                  heading = node.textContent.trim().toLowerCase();
                }
              });
              if (heading === "focus") return "What matters today…";
              if (heading === "notes") return "Capture a thought…";
              if (heading === "later") return "Park it for later…";
            } catch {
              /* ignore */
            }
            return "Start writing… Type [[ to link, / to insert.";
          },
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
          onOpen: (target, event) =>
            openWikilinkTarget(target, event, noteIdRef.current),
        }),
        HighlightMark,
        Callout,
        Mermaid,
        MathBlock,
        MathInline,
        Embed,
        QueryBlock,
        FindHighlight,
      ],
      content: markdownWithWikilinksToHtml(
        upgradeSparseDailySkeleton(content || ""),
      ),
      editorProps: {
        attributes: {
          class: "note-editor min-h-[50vh] focus:outline-none",
          "data-note-id": noteId,
          spellcheck: spellCheck ? "true" : "false",
        },
        handleDOMEvents: {
          click: (_view, event) => {
            const a = (event.target as HTMLElement | null)?.closest?.("a[href]");
            if (!(a instanceof HTMLAnchorElement)) return false;
            const href = a.getAttribute("href") || "";
            if (!isVaultAttachmentHref(href)) return false;
            event.preventDefault();
            useVaultStore.getState().openAttachmentsRail();
            return true;
          },
        },
        handlePaste: (view, event) => {
          const ed = editorRef.current;
          if (!ed || ed.isDestroyed) return false;
          return handleVisualPaste(ed, view, event);
        },
        handleDrop: (view, event, slice, moved) => {
          const ed = editorRef.current;
          if (!ed || ed.isDestroyed) return false;
          return handleVisualDrop(ed, view, event, slice, moved);
        },
        handleKeyDown: (view, event) => {
          const edLive = editorRef.current;
          if (
            edLive &&
            !edLive.isDestroyed &&
            event.key === "/" &&
            !event.ctrlKey &&
            !event.metaKey &&
            !event.altKey &&
            shouldBreakForSlash(edLive)
          ) {
            event.preventDefault();
            edLive.chain().focus().splitBlock().insertContent("/").run();
            refreshSlash(edLive);
            return true;
          }
          if (
            edLive &&
            !edLive.isDestroyed &&
            event.key === "Enter" &&
            !event.shiftKey
          ) {
            try {
              if (edLive.isActive("table") && !edLive.can().goToNextCell()) {
                event.preventDefault();
                const { $from } = edLive.state.selection;
                let tableEnd: number | null = null;
                for (let d = $from.depth; d > 0; d--) {
                  if ($from.node(d).type.name === "table") {
                    tableEnd = $from.after(d);
                    break;
                  }
                }
                if (tableEnd != null) {
                  edLive
                    .chain()
                    .focus()
                    .insertContentAt(tableEnd, { type: "paragraph" })
                    .setTextSelection(tableEnd + 1)
                    .run();
                }
                return true;
              }
            } catch {
              /* table commands unavailable */
            }
          }
          if (slashOpenRef.current && !suggestOpenRef.current) {
            const items = slashItemsRef.current;
            if (event.key === "ArrowDown") {
              event.preventDefault();
              setSlashSelected((i) => (items.length ? (i + 1) % items.length : 0));
              return true;
            }
            if (event.key === "ArrowUp") {
              event.preventDefault();
              setSlashSelected((i) =>
                items.length ? (i - 1 + items.length) % items.length : 0,
              );
              return true;
            }
            if (event.key === "Enter" || event.key === "Tab") {
              const item = items[slashSelectedRef.current] ?? items[0];
              if (item) {
                event.preventDefault();
                item.run(editorRef.current!, slashRangeRef.current);
                setSlashOpen(false);
                return true;
              }
            }
            if (event.key === "Escape") {
              event.preventDefault();
              setSlashOpen(false);
              return true;
            }
          }
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
        try {
          ensureEditableGaps(ed);
        } catch {
          /* schema without paragraph */
        }
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
        refreshSlash(ed);
        if (saveTimer.current) clearTimeout(saveTimer.current);
        // Faster flush so graph edges appear promptly after linking
        saveTimer.current = setTimeout(() => commit(ed), 160);
      },
      onSelectionUpdate: ({ editor: ed }) => {
        if (applying.current) return;
        // WebKit fires selectionchange while the note scrolls. An unchanged
        // caret must not walk suggest/slash on every frame.
        const sel = ed.state.selection;
        const sig = `${sel.from}:${sel.to}`;
        if (sig === selectionSigRef.current) return;
        selectionSigRef.current = sig;
        refreshSuggest(ed);
        refreshSlash(ed);
      },
      onFocus: () => {
        setFindFocusPane(pane);
      },
    },
    [spellCheck, pane],
  );

  editorRef.current = editor && !editor.isDestroyed ? editor : null;

  // Keep ProseMirror spellcheck + font size in sync with prefs
  useEffect(() => {
    if (!editor || editor.isDestroyed) return;
    try {
      const dom = editor.view.dom as HTMLElement;
      dom.setAttribute("spellcheck", spellCheck ? "true" : "false");
      dom.style.fontSize = `${editorFontSize}px`;
    } catch {
      /* view gone */
    }
  }, [editor, spellCheck, editorFontSize]);

  useEffect(() => {
    if (!editor || editor.isDestroyed) return;
    return registerInsertWikilink((focusedOnly) => {
      if (!editor || editor.isDestroyed) return false;
      if (focusedOnly && !editor.isFocused) return false;
      if (
        !focusedOnly &&
        noteIdRef.current !== useVaultStore.getState().activeNoteId
      ) {
        return false;
      }
      editor.chain().focus().insertContent("[[").run();
      refreshSuggest(editor);
      return true;
    });
  }, [editor, refreshSuggest]);

  // Register find-in-note adapter for Visual mode
  useEffect(() => {
    if (!editor || editor.isDestroyed) {
      registerVisualFindAdapter(null, pane);
      return;
    }
    let cached: FindMatch[] = [];
    registerVisualFindAdapter({
      findAll: (query) => {
        if (editor.isDestroyed) return [];
        cached = findMatchesInPmDoc(editor.state.doc, query);
        try {
          editor.commands.setFindHighlights(cached, 0);
        } catch {
          /* ignore */
        }
        return cached;
      },
      reveal: (match: FindMatch, index: number) => {
        if (editor.isDestroyed) return;
        try {
          editor
            .chain()
            .setFindHighlights(cached.length ? cached : [match], index)
            .focus()
            .setTextSelection({ from: match.from, to: match.to })
            .scrollIntoView()
            .run();
        } catch {
          /* invalid range */
        }
      },
      clear: () => {
        cached = [];
        if (editor.isDestroyed) return;
        try {
          editor.commands.clearFindHighlights();
        } catch {
          /* ignore */
        }
      },
      replace: (match, text) => {
        if (editor.isDestroyed) return false;
        try {
          const { from, to } = match;
          if (from < 0 || to < from || to > editor.state.doc.content.size) {
            return false;
          }
          editor
            .chain()
            .focus()
            .insertContentAt({ from, to }, text || "")
            .run();
          return true;
        } catch {
          return false;
        }
      },
      replaceAll: (query, text) => {
        if (editor.isDestroyed) return 0;
        const all = findMatchesInPmDoc(editor.state.doc, query);
        if (!all.length) return 0;
        const replacement = text || "";
        try {
          let { tr } = editor.state;
          for (let i = all.length - 1; i >= 0; i--) {
            const m = all[i]!;
            tr = tr.insertText(replacement, m.from, m.to);
          }
          editor.view.dispatch(tr);
          return all.length;
        } catch {
          return 0;
        }
      },
    }, pane);
    return () => registerVisualFindAdapter(null, pane);
  }, [editor, pane]);

  // The store holds a body this editor has not shown yet (the renamed title,
  // a rescan). Held text waits for it, or the refill would write over it.
  const refillPending = useCallback(() => {
    if (applying.current) return true;
    const body = useVaultStore.getState().nodes[noteIdRef.current]?.content;
    if (body === undefined) return false;
    if (body === baselineMd.current || body === lastWrittenRef.current) return false;
    return !isOnlySerializationNoise(baselineMd.current, body);
  }, []);

  // Turn leftover empty `-` Focus/Later bullets into tasks, then sync.
  // Keep one TipTap instance across notes — remounting @45k is a 0.7–1.1s hitch.
  useEffect(() => {
    if (noteIdRef.current !== noteId && editor && !editor.isDestroyed) {
      if (saveTimer.current) {
        clearTimeout(saveTimer.current);
        saveTimer.current = null;
      }
      try {
        commit(editor, { force: true });
      } catch {
        /* previous note already flushed */
      }
      userEdited.current = false;
      morningFocusedFor.current = null;
    }
    noteIdRef.current = noteId;
    notePathRef.current = useVaultStore.getState().nodes[noteId]?.path ?? notePathRef.current;
    try {
      if (editor && !editor.isDestroyed) {
        editor.view.dom.setAttribute("data-note-id", noteId);
      }
    } catch {
      /* view gone */
    }
    const incoming = upgradeSparseDailySkeleton(content || "");
    if (incoming !== (content || "")) {
      userEdited.current = false;
      updateNoteContent(noteId, incoming, { source: true });
    }
    if (!editor || editor.isDestroyed) return;
    if (userEdited.current) {
      const external =
        incoming !== lastWrittenRef.current &&
        !isOnlySerializationNoise(incoming, lastWrittenRef.current);
      if (!external) return;
      userEdited.current = false;
    }
    if (isOnlySerializationNoise(baselineMd.current, incoming)) return;
    applying.current = true;
    baselineMd.current = incoming;
    lastWrittenRef.current = incoming;
    contentRef.current = incoming;
    const html = markdownWithWikilinksToHtml(incoming);
    // TipTap mounts React node views with flushSync. Doing that inside this
    // effect is a React lifecycle, and React 19 logs "flushSync was called
    // from inside a lifecycle method" on every note switch. A microtask is
    // outside the commit, so the paint still happens before the next frame.
    const applyGen = ++contentApplyGen.current;
    const noteAtSchedule = noteId;
    queueMicrotask(() => {
      if (applyGen !== contentApplyGen.current) return;
      if (noteIdRef.current !== noteAtSchedule) return;
      if (editor.isDestroyed) return;
      applying.current = true;
      editor.commands.setContent(html, { emitUpdate: false });
      const pathAtApply = useVaultStore.getState().nodes[noteAtSchedule]?.path;
      if (writeFocusPending(pathAtApply)) {
        placeCaretForWriting(editor);
      }
      requestAnimationFrame(() => {
        if (applyGen !== contentApplyGen.current) return;
        paintEditorExtras(editor);
        applying.current = false;
        writeHeldText(editor, pathAtApply, refillPending);
      });
    });
  }, [editor, content, noteId, updateNoteContent, commit]);

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

  // A note that was just named in the list hands the cursor to its body. The
  // request is kept by path, so an editor that mounts or refills a moment later
  // for the same note (a desktop rename is also a file rename) still takes it.
  useEffect(() => {
    if (!editor) return;
    const pathNow = () => useVaultStore.getState().nodes[noteId]?.path ?? null;
    const writeTimers: number[] = [];
    const begin = () => {
      writeHeldText(editor, pathNow(), refillPending);
      if (!writeFocusPending(pathNow())) return;
      // The renamed title rewrites the body a moment later, and a folder rescan
      // can refill it after that. The content apply above places the caret
      // again after each refill; these cover a refill that changes nothing.
      const place = () => {
        if (writeFocusPending(pathNow())) placeCaretForWriting(editor);
      };
      place();
      writeTimers.push(
        window.setTimeout(place, 180),
        window.setTimeout(place, 420),
        window.setTimeout(place, 900),
        window.setTimeout(place, 1800),
        window.setTimeout(place, 3200),
      );
    };
    begin();
    window.addEventListener("nexus-write-note", begin);
    return () => {
      window.removeEventListener("nexus-write-note", begin);
      for (const t of writeTimers) window.clearTimeout(t);
    };
  }, [editor, noteId]);

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
    registerVisualFlush(flushNow, pane);
    return () => {
      flushNow();
      registerVisualFlush(null, pane);
      if (saveTimer.current) {
        clearTimeout(saveTimer.current);
        saveTimer.current = null;
      }
    };
  }, [editor, commit, pane]);

  // Keep suggest handleKeyDown closure fresh — rebind via editor prop is static;
  // use DOM keyup on the editor root for Mac reliability
  useEffect(() => {
    if (!editor || editor.isDestroyed) return;
    let dom: HTMLElement;
    try {
      dom = editor.view.dom;
    } catch {
      return;
    }
    const onKeyUp = () => {
      if (editor.isDestroyed) return;
      try {
        refreshSuggest(editor);
        refreshSlash(editor);
      } catch {
        /* view not available during teardown */
      }
    };
    const onOver = (e: MouseEvent) => {
      const el = (e.target as HTMLElement).closest("[data-wikilink]");
      if (!(el instanceof HTMLElement)) {
        setHoverLink(null);
        return;
      }
      setHoverLink({
        target: el.getAttribute("data-wikilink") || "",
        x: e.clientX,
        y: e.clientY,
      });
    };
    const onLeave = () => setHoverLink(null);
    dom.addEventListener("keyup", onKeyUp);
    dom.addEventListener("mouseover", onOver);
    dom.addEventListener("mouseleave", onLeave);
    return () => {
      dom.removeEventListener("keyup", onKeyUp);
      dom.removeEventListener("mouseover", onOver);
      dom.removeEventListener("mouseleave", onLeave);
    };
  }, [editor, refreshSuggest, refreshSlash]);

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
    if (!id) return;
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
    <div
      className="fade-in flex h-full min-h-0 flex-col"
      data-note-id={noteId}
      onClickCapture={(e) => {
        const a = (e.target as HTMLElement).closest("a[href]");
        if (!(a instanceof HTMLAnchorElement)) return;
        const href = a.getAttribute("href") || "";
        if (!isVaultAttachmentHref(href)) return;
        e.preventDefault();
        e.stopPropagation();
        useVaultStore.getState().openAttachmentsRail();
      }}
    >
      <EditorToolbar editor={editor} />
      <div className="editor-scrollport relative min-h-0 flex-1 overflow-y-auto px-4 py-3 sm:px-6 sm:py-4 md:px-10 md:py-6">
        <div className={cn("mx-auto max-w-[720px]", isDaily && "daily-visual")}>
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
        <SlashMenu
          open={slashOpen && !suggestOpen}
          items={slashItems}
          selected={slashSelected}
          query={slashQuery}
          rect={slashRect}
          onSelect={(item) => {
            if (!editor) return;
            item.run(editor, slashRangeRef.current);
            setSlashOpen(false);
          }}
          onHover={setSlashSelected}
          onClose={() => setSlashOpen(false)}
        />
        {hoverLink && !suggestOpen && !slashOpen ? (
          <WikilinkHoverCard
            target={hoverLink.target}
            x={hoverLink.x}
            y={hoverLink.y}
          />
        ) : null}
      </div>
    </div>
  );
}
