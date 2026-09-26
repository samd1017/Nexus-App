import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useVirtualizer } from "@tanstack/react-virtual";
import {
  ChevronRight,
  FileText,
  Folder,
  FolderOpen,
  MoreHorizontal,
  Trash2,
  Pencil,
  FolderPlus,
  FilePlus,
  Users,
  Lightbulb,
  FolderKanban,
  Network,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useVaultStore } from "@/lib/vault/store";
import { vaultIndex } from "@/lib/vault/indexes";
import type { VaultNode } from "@/lib/vault/types";
import { noteTitle } from "@/lib/vault/types";
import type { NoteTemplateId } from "@/lib/vault/templates";
import { setLastTreeFlatCount } from "@/lib/vault/heap-log";
import {
  flattenVisibleTree,
  TREE_FLAT_CAP,
  TREE_FOLDER_NOTE_WINDOW,
  type FlatTreeRow,
} from "@/lib/vault/file-tree-flat";
import { useTreeStructureTick } from "@/lib/vault/tree-tick";
import { EmptyState } from "@/components/ui/EmptyState";
import { closeDrawersIfNarrow } from "@/lib/layout/viewport";
import { renameKeyAction } from "@/lib/chrome/rename-key";
import { emptyFolderIdFromTarget, treeRowIdFromTarget } from "@/lib/vault/empty-folder-target";
import { treeGuideCss, treeIndentCss } from "@/lib/vault/tree-indent";
import { bufferRenameKey, claimEmptyFolderEnter, isIdleEnterTarget, isProgrammaticFocusSteal, scheduleEmptyNoteRename, settleRename, startRenameBuffer, takeRenameBuffer } from "@/lib/chrome/empty-folder-enter";
import { reclaimAfterFocus } from "@/lib/chrome/focus-ring";
import { finishReveal, takePendingFolderReveal } from "@/lib/chrome/reveal-list";
import { createNoteWhenReady } from "@/lib/vault/create-when-ready";
import { markJustCreated, requestWriteFocus, takeJustCreated } from "@/lib/editor/write-intent";

function folderHasNothing(id: string): boolean {
  const extra = useVaultStore.getState().shellUnloaded?.[id] ?? 0;
  return vaultIndex.getChildIds(id).length === 0 && extra === 0;
}

/** Label only: in a paged vault a folder whose page never loaded is not known to be empty. */
function emptyKnown(id: string): boolean {
  const s = useVaultStore.getState();
  return !s.shellCatalog || s.shellLoaded?.[id] !== undefined;
}


/**
 * Pointer-based tree DnD — works in browser AND Tauri/WKWebView (Mac app).
 * Wave 1: flattened + virtualized rows for large vaults.
 */

type CtxMenu =
  | { kind: "item"; nodeId: string; x: number; y: number }
  | { kind: "empty"; x: number; y: number; parentId: string | null }
  | null;

type DropTarget =
  | { type: "folder"; id: string }
  | { type: "root" }
  | null;

type DragSession = {
  id: string;
  startX: number;
  startY: number;
  active: boolean;
  pointerId: number;
};

type FlatRow = FlatTreeRow;

/** Slightly above accidental jitter so clicks open reliably at 45k. */
const DRAG_THRESHOLD_PX = 10;

function displayName(node: VaultNode): string {
  return node.kind === "note" ? noteTitle(node) : node.name;
}

function isDescendant(
  nodes: Record<string, VaultNode>,
  ancestorId: string,
  maybeChildId: string,
): boolean {
  let p: string | null = maybeChildId;
  while (p) {
    if (p === ancestorId) return true;
    p = nodes[p]?.parentId ?? null;
  }
  return false;
}

function resolveDropFromPoint(
  clientX: number,
  clientY: number,
  dragId: string,
  nodes: Record<string, VaultNode>,
): DropTarget {
  const el = document.elementFromPoint(clientX, clientY) as HTMLElement | null;
  if (!el) return { type: "root" };
  const row = el.closest("[data-node-id]") as HTMLElement | null;
  if (row) {
    const id = row.getAttribute("data-node-id");
    const kind = row.getAttribute("data-node-kind");
    if (id && kind === "folder" && id !== dragId) {
      if (!isDescendant(nodes, dragId, id)) {
        return { type: "folder", id };
      }
    }
    if (id && kind === "note") {
      const parentId = nodes[id]?.parentId ?? null;
      if (parentId && parentId !== dragId && !isDescendant(nodes, dragId, parentId)) {
        return { type: "folder", id: parentId };
      }
      return { type: "root" };
    }
  }
  if (el.closest("[data-file-tree]")) return { type: "root" };
  return null;
}

function dropTargetsEqual(a: DropTarget, b: DropTarget): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  if (a.type !== b.type) return false;
  if (a.type === "folder" && b.type === "folder") return a.id === b.id;
  return true; // both root
}

export { TREE_FLAT_CAP, TREE_FOLDER_NOTE_WINDOW };

const ROW_H = 30;

const TreeRow = memo(function TreeRow({
  nodeId,
  depth,
  renamingId,
  setRenamingId,
  openCtx,
  dragId,
  dropTarget,
  onPointerDragStart,
  isFocused,
  onFocusRow,
  onToggleFolder,
  onRenameFinished,
  folderEmpty = false,
  onEmptyEnter,
}: {
  nodeId: string;
  depth: number;
  renamingId: string | null;
  setRenamingId: (id: string | null) => void;
  openCtx: (menu: CtxMenu) => void;
  dragId: string | null;
  dropTarget: DropTarget;
  onPointerDragStart: (id: string, e: React.PointerEvent) => void;
  isFocused?: boolean;
  onFocusRow?: (id: string) => void;
  onToggleFolder: (id: string) => void;
  onRenameFinished?: (id: string, committed: boolean) => void;
  folderEmpty?: boolean;
  onEmptyEnter?: (folderId: string) => void;
}) {
  // Narrow selectors — avoid whole-nodes subscription
  const node = useVaultStore((s) => s.nodes[nodeId]);
  const isActive = useVaultStore(
    (s) => s.activeNoteId === nodeId && s.nodes[nodeId]?.kind === "note",
  );
  const expanded = useVaultStore((s) => s.expandedFolders.includes(nodeId));
  // Folders on the way to the open note carry a quiet accent, so the open
  // note can be found again from a collapsed branch.
  const onActivePath = useVaultStore((s) => {
    const active = s.activeNoteId;
    if (!active || s.nodes[nodeId]?.kind !== "folder") return false;
    let cur = s.nodes[active]?.parentId ?? null;
    let guard = 0;
    while (cur && guard++ < 64) {
      if (cur === nodeId) return true;
      cur = s.nodes[cur]?.parentId ?? null;
    }
    return false;
  });
  const setActiveNote = useVaultStore((s) => s.setActiveNote);
  const renameNode = useVaultStore((s) => s.renameNode);

  const renaming = renamingId === nodeId;
  const [nameDraft, setNameDraft] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const skipBlur = useRef(false);

  useEffect(() => {
    if (!node) return;
    if (!renaming) setNameDraft(displayName(node));
  }, [node?.id, node?.name, node?.content, renaming, node]);

  // Set the field once when rename opens. A save or index update changes the
  // node object while the name is being typed; that must not reset the text.
  const renameInitFor = useRef<string | null>(null);
  useEffect(() => {
    if (!renaming) renameInitFor.current = null;
  }, [renaming]);
  useEffect(() => {
    if (!node || !renaming) return;
    if (renameInitFor.current === node.id) return;
    renameInitFor.current = node.id;
    skipBlur.current = false;
    const typed = takeRenameBuffer(node.id);
    if (typed?.commit) {
      // The name, and Enter, arrived before this field did.
      const next = typed.text.trim();
      skipBlur.current = true;
      setRenamingId(null);
      if (next && next !== displayName(node)) renameNode(node.id, next);
      onRenameFinished?.(node.id, true);
      return;
    }
    const draft = typed?.text ? typed.text : displayName(node);
    setNameDraft(draft);
    requestAnimationFrame(() => {
      const input = inputRef.current;
      if (!input) return;
      // The field can have the cursor before this frame. A name already being
      // typed is not selected over, or its first letters are lost.
      if (document.activeElement === input && input.value !== draft) return;
      input.focus();
      if (typed?.text) {
        const end = input.value.length;
        input.setSelectionRange(end, end);
      } else {
        input.select();
      }
      input.scrollIntoView({ block: "nearest" });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [renaming, nodeId, node]);

  if (!node) return null;

  const isDragging = dragId === node.id;
  const isDropHover =
    dropTarget?.type === "folder" &&
    dropTarget.id === node.id &&
    dragId != null &&
    dragId !== node.id;

  const commitRename = () => {
    if (skipBlur.current) {
      skipBlur.current = false;
      return;
    }
    const next = nameDraft.trim();
    const current = displayName(node);
    markRenameClosing();
    setRenamingId(null);
    if (!next || next === current) {
      setNameDraft(current);
    } else {
      renameNode(node.id, next);
    }
    skipBlur.current = true;
    onRenameFinished?.(node.id, true);
  };

  // The field stays in the page until the next render. Marked, nothing pulls
  // the cursor back into a name that is already set.
  const markRenameClosing = () => {
    inputRef.current?.setAttribute("data-rename-closing", "1");
  };

  const cancelRename = () => {
    markRenameClosing();
    skipBlur.current = true;
    setRenamingId(null);
    setNameDraft(displayName(node));
    onRenameFinished?.(node.id, false);
  };

  const openNote = (e?: React.MouseEvent) => {
    e?.preventDefault();
    e?.stopPropagation();
    if (renaming) return;
    // Prefer sessionRef over React dragId (state lags a frame)
    if ((window as unknown as { __nexusSuppressTreeClick?: boolean }).__nexusSuppressTreeClick) {
      return;
    }
    if (node.kind === "folder") {
      onToggleFolder(node.id);
      return;
    }
    if (e?.altKey || (e?.metaKey && e?.shiftKey)) {
      useVaultStore.getState().openNoteInPane?.("secondary", node.id);
      closeDrawersIfNarrow();
      return;
    }
    setActiveNote(node.id);
    closeDrawersIfNarrow();
  };

  return (
    <div
      id={`tree-row-${node.id}`}
      className={cn(
        "tree-item group relative flex w-full items-center gap-1.5 text-left select-none",
        isActive && "is-active",
        onActivePath && "is-active-path",
        isFocused && "is-focused",
        renaming && "is-renaming",
        isDragging && "opacity-40",
        isDropHover &&
          "ring-1 ring-[var(--accent)] bg-[rgba(0,200,255,0.1)]",
      )}
      style={
        {
          paddingLeft: treeIndentCss(depth),
          height: ROW_H,
          "--tree-guide-x": treeGuideCss(depth),
        } as React.CSSProperties
      }
      data-depth={depth}
      role="treeitem"
      aria-selected={isActive}
      aria-expanded={node.kind === "folder" ? expanded : undefined}
      tabIndex={-1}
      data-node-id={node.id}
      data-node-kind={node.kind}
      data-folder-empty={folderEmpty ? "1" : undefined}
      data-keyboard-focus={isFocused ? "row" : undefined}
      data-testid={node.kind === "note" ? "tree-note-row" : "tree-folder-row"}
      onKeyDown={(e) => {
        if (!renaming && e.key === "F2") {
          e.preventDefault();
          e.stopPropagation();
          setRenamingId(node.id);
          return;
        }
        if (e.defaultPrevented) return;
        if (!folderEmpty || renaming) return;
        if (e.key !== "Enter" || e.metaKey || e.ctrlKey || e.altKey) return;
        const target = e.target as HTMLElement | null;
        if (target?.closest("input,button,[role='button'],a")) return;
        e.preventDefault();
        e.stopPropagation();
        onEmptyEnter?.(node.id);
      }}
      onPointerDown={(e) => {
        if (renaming) return;
        if (e.button !== 0) return;
        const t = e.target as HTMLElement;
        if (t.closest("input,button,[role='button'],a")) return;
        onFocusRow?.(node.id);
        if (folderEmpty) e.currentTarget.focus();
        onPointerDragStart(node.id, e);
      }}
      onClick={(e) => {
        onFocusRow?.(node.id);
        // Primary open path is pointerup (see FileTree endDrag). Click is
        // fallback for keyboard / synthetic activation when no drag session.
        openNote(e);
      }}
      onDoubleClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        if (dragId) return;
        setRenamingId(node.id);
      }}
      onContextMenu={(e) => {
        e.preventDefault();
        e.stopPropagation();
        openCtx({
          kind: "item",
          nodeId: node.id,
          x: e.clientX,
          y: e.clientY,
        });
      }}
    >
      {node.kind === "folder" ? (
        <span
          className="nexus-tree-chevron flex h-4 w-4 shrink-0 items-center justify-center text-[var(--text-muted)]"
          data-open={expanded ? "1" : "0"}
        >
          <ChevronRight size={14} />
        </span>
      ) : (
        <span className="w-4 shrink-0" />
      )}

      {node.kind === "folder" ? (
        expanded ? (
          <FolderOpen size={15} className="shrink-0 text-[var(--accent)]" />
        ) : (
          <Folder size={15} className="shrink-0 text-[var(--text-muted)]" />
        )
      ) : (
        <FileText
          size={15}
          className={cn(
            "shrink-0",
            isActive ? "text-[var(--accent)]" : "text-[var(--text-muted)]",
          )}
        />
      )}

      {renaming ? (
        <input
          ref={inputRef}
          autoFocus
          className="nexus-rename-input min-w-0 flex-1 rounded-md px-1.5 py-0.5 text-[13px]"
          spellCheck={false}
          autoComplete="off"
          aria-label="File name. Enter keeps it. Escape puts the old name back."
          data-testid="tree-rename"
          data-rename-for={node.id}
          data-rename-original={displayName(node)}
          value={nameDraft}
          onChange={(e) => setNameDraft(e.target.value)}
          onBlur={commitRename}
          onKeyDown={(e) => {
            e.stopPropagation();
            const action = renameKeyAction(e.key);
            if (action === "ignore") return;
            e.preventDefault();
            if (action === "commit") commitRename();
            else cancelRename();
          }}
          onClick={(e) => e.stopPropagation()}
          onDoubleClick={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
        />
      ) : (
        <span className="nexus-tree-label flex min-w-0 flex-1 items-center gap-2">
          <span
            className="min-w-0 cursor-grab truncate active:cursor-grabbing"
          >
            {displayName(node)}
          </span>
          {folderEmpty && emptyKnown(node.id) ? (
            // A short tag beside the name; a deep row drops it (styles.css) so the
            // name stays. Open, the row below says the whole line; the list's hint
            // says it while the folder has the cursor.
            <span
              className="nexus-empty-tag shrink-0"
              data-testid="tree-empty-folder-tag"
              title="This folder is empty. Enter starts a note."
            >
              empty
            </span>
          ) : null}
        </span>
      )}

      {renaming ? (
        <span
          className="nexus-rename-hint ml-1 shrink-0"
          data-testid="tree-rename-hint"
          aria-hidden
        >
          <kbd>Enter</kbd>
          <kbd>Esc</kbd>
        </span>
      ) : null}
      <div
        className={cn(
          "titlebar-no-drag relative ml-auto flex shrink-0 opacity-0 transition-opacity duration-150 group-hover:opacity-100 group-focus-within:opacity-100",
          (isActive || isFocused) && "opacity-100",
          renaming && "hidden",
        )}
        onClick={(e) => e.stopPropagation()}
        onPointerDown={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          tabIndex={-1}
          className="icon-btn !h-full !w-8 rounded-md"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            const rect = (
              e.currentTarget as HTMLElement
            ).getBoundingClientRect();
            openCtx({
              kind: "item",
              nodeId: node.id,
              x: Math.min(rect.right, window.innerWidth - 12),
              y: rect.bottom + 4,
            });
          }}
          aria-label={`Actions for ${displayName(node)}`}
          title="Actions"
        >
          <MoreHorizontal size={14} />
        </button>
      </div>
    </div>
  );
});

function MenuBtn({
  icon,
  label,
  onClick,
  danger,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button role="menuitem"
      type="button"
      onClick={onClick}
      className={cn(
        "flex min-h-9 w-full items-center gap-2 rounded-lg px-2.5 text-left text-[13px] transition-colors",
        danger
          ? "text-[var(--danger)] hover:bg-[rgba(255,69,58,0.1)]"
          : "text-[var(--text-secondary)] hover:bg-[var(--fill-hover)] hover:text-[var(--text-primary)]",
      )}
    >
      {icon}
      {label}
    </button>
  );
}

export const FileTree = memo(function FileTree() {
  const rootIds = useVaultStore((s) => s.rootIds);
  const vaultId = useVaultStore((s) => s.vaultId);
  const expandedFolders = useVaultStore((s) => s.expandedFolders);
  const shellUnloaded = useVaultStore((s) => s.shellUnloaded);
  // Stable tick — never ensureVaultIndex inside a Zustand selector
  const structureTick = useTreeStructureTick();
  const createNote = useVaultStore((s) => s.createNote);
  const createFromTemplate = useVaultStore((s) => s.createFromTemplate);
  const createFolder = useVaultStore((s) => s.createFolder);
  const requestDelete = useVaultStore((s) => s.requestDelete);
  const toggleFolder = useVaultStore((s) => s.toggleFolder);
  const setActiveNote = useVaultStore((s) => s.setActiveNote);
  const openDailyNote = useVaultStore((s) => s.openDailyNote);

  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [ctx, setCtx] = useState<CtxMenu>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<DropTarget>(null);
  const [focusedIndex, setFocusedIndex] = useState(0);
  const [treeHasFocus, setTreeHasFocus] = useState(false);
  const [folderWindows, setFolderWindows] = useState<Record<string, number>>({});
  // Ghost label only in React state; position updated via rAF + DOM
  const [ghostLabel, setGhostLabel] = useState<string | null>(null);

  const sessionRef = useRef<DragSession | null>(null);
  const dropTargetRef = useRef<DropTarget>(null);
  const expandTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingRevealRef = useRef<string | null>(null);
  const pendingMoreRef = useRef<{ parentId: string; prevShown: number } | null>(
    null,
  );
  const parentRef = useRef<HTMLDivElement>(null);
  const ghostElRef = useRef<HTMLDivElement>(null);
  const ghostRafRef = useRef<number | null>(null);
  const pendingGhostPos = useRef<{ x: number; y: number } | null>(null);

  const flatRows = useMemo(() => {
    const nodes = useVaultStore.getState().nodes;
    const rows = flattenVisibleTree(
      rootIds,
      nodes,
      expandedFolders,
      TREE_FLAT_CAP,
      folderWindows,
      shellUnloaded,
    );
    setLastTreeFlatCount(rows.length);
    return rows;
    // structureTick encodes structureGen + nodeCount + rootIds
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rootIds, expandedFolders, structureTick, folderWindows, shellUnloaded]);

  // Stabilize callbacks that would otherwise churn when flatRows identity changes
  const flatRowsRef = useRef(flatRows);
  flatRowsRef.current = flatRows;

  const useVirtual = true;

  useEffect(() => {
    setFolderWindows({});
  }, [vaultId]);

  useEffect(() => {
    if (flatRows.length === 0) {
      setFocusedIndex(0);
      return;
    }
    setFocusedIndex((i) => Math.min(Math.max(0, i), flatRows.length - 1));
  }, [flatRows.length]);

  // Stable options. A fresh getItemKey closure plus useFlushSync (the
  // virtualizer default) calls flushSync during commit when the row count
  // jumps — nested inside the tree-tick store check on a hot 45k open.
  const getScrollElement = useCallback(() => parentRef.current, []);
  const estimateSize = useCallback(() => ROW_H, []);
  const getItemKey = useCallback(
    (index: number) => flatRowsRef.current[index]?.id ?? index,
    [],
  );

  const virtualizer = useVirtualizer({
    count: flatRows.length,
    getScrollElement,
    estimateSize,
    overscan: 12,
    getItemKey,
    enabled: useVirtual,
    useFlushSync: false,
  });

  const armFolderReveal = useCallback((id: string) => {
    if (!useVaultStore.getState().expandedFolders.includes(id)) {
      pendingRevealRef.current = id;
    }
  }, []);

  const toggleFolderReveal = useCallback(
    (id: string) => {
      armFolderReveal(id);
      toggleFolder(id);
    },
    [armFolderReveal, toggleFolder],
  );

  const showMore = useCallback((parentId: string) => {
    if (useVaultStore.getState().shellCatalog) {
      void useVaultStore.getState().loadShellChildren(parentId);
      return;
    }
    setFolderWindows((prev) => {
      const cur = prev[parentId] ?? TREE_FOLDER_NOTE_WINDOW;
      pendingMoreRef.current = { parentId, prevShown: cur };
      return { ...prev, [parentId]: cur + TREE_FOLDER_NOTE_WINDOW };
    });
  }, []);

  // A folder parked on the bottom edge used to flip its chevron while every
  // new child stayed below the scrollport, so expand looked empty.
  useEffect(() => {
    const id = pendingRevealRef.current;
    if (!id) return;
    if (!expandedFolders.includes(id)) return;
    pendingRevealRef.current = null;
    const idx = flatRows.findIndex((r) => r.id === id);
    if (idx < 0) return;
    const parentDepth = flatRows[idx].depth;
    let last = idx;
    const limit = Math.min(flatRows.length - 1, idx + 5);
    for (let i = idx + 1; i <= limit; i++) {
      if (flatRows[i].depth <= parentDepth) break;
      last = i;
    }
    if (last === idx) return;
    const tree = parentRef.current;
    if (!tree) return;
    const childId = flatRows[idx + 1]?.id;
    const lastId = flatRows[last]?.id;
    requestAnimationFrame(() => {
      const tr = tree.getBoundingClientRect();
      const childEl = childId ? document.getElementById(`tree-row-${childId}`) : null;
      const lastEl = lastId ? document.getElementById(`tree-row-${lastId}`) : null;
      const childRect = childEl?.getBoundingClientRect();
      const lastRect = lastEl?.getBoundingClientRect();
      const childVisible =
        !!childRect &&
        childRect.height > 8 &&
        childRect.top >= tr.top - 1 &&
        childRect.bottom <= tr.bottom - 4;
      const tailVisible =
        !!lastRect && lastRect.top >= tr.top && lastRect.bottom <= tr.bottom - 2;
      if (childVisible && tailVisible) return;
      const lastBottom = (last + 1) * ROW_H;
      const target = Math.max(0, lastBottom - tree.clientHeight + 8);
      if (target > tree.scrollTop + 1) tree.scrollTop = target;
    });
  }, [expandedFolders, flatRows]);

  // "N more" inserts the next window above the remainder row. Scroll so the
  // first newly listed child is the one on screen.
  useEffect(() => {
    const pending = pendingMoreRef.current;
    if (!pending) return;
    pendingMoreRef.current = null;
    const folderIdx = flatRows.findIndex((r) => r.id === pending.parentId);
    if (folderIdx < 0) return;
    const target = Math.min(
      flatRows.length - 1,
      folderIdx + pending.prevShown + 1,
    );
    requestAnimationFrame(() => {
      virtualizer.scrollToIndex(target, { align: "start" });
    });
  }, [flatRows, virtualizer]);

  const justCreatedRef = useRef<string | null>(null);

  useEffect(() => {
    const onRename = (e: Event) => {
      const id = (e as CustomEvent<string>).detail;
      if (!id) return;
      setRenamingId(id);
      const idx = flatRowsRef.current.findIndex((r) => r.id === id);
      if (idx >= 0) {
        setFocusedIndex(idx);
        virtualizer.scrollToIndex(idx, { align: "center" });
      }
    };
    const onCreated = (e: Event) => {
      const id = (e as CustomEvent<string>).detail;
      if (!id) return;
      justCreatedRef.current = id;
      startRenameBuffer(id);
    };
    window.addEventListener("nexus-rename-node", onRename);
    window.addEventListener("nexus-created-note", onCreated);
    return () => {
      window.removeEventListener("nexus-rename-node", onRename);
      window.removeEventListener("nexus-created-note", onCreated);
    };
  }, [virtualizer]);

  const focusedId = flatRows[focusedIndex]?.id ?? null;

  const armedEmptyRef = useRef<string | null>(null);

  const armEmptyFolder = useCallback((folderId: string | null) => {
    armedEmptyRef.current = folderId;
    const tree = parentRef.current;
    if (!tree || !folderId) return;
    tree.setAttribute("data-tree-focused", "1");
    tree.setAttribute("data-focused-empty-folder", folderId);
    tree.setAttribute("data-empty-armed", folderId);
    const idx = flatRowsRef.current.findIndex(
      (r) => r.id === folderId || r.emptyParentId === folderId,
    );
    if (idx >= 0) virtualizer.scrollToIndex(idx, { align: "auto" });
  }, [virtualizer]);

  // The arrows took the cursor off an empty folder. Enter now belongs to the
  // row the cursor is on, so the folder gives up its focus and its arm.
  const leaveEmptyFolderFor = useCallback((nextIdx: number) => {
    const tree = parentRef.current;
    const focusedFolder = emptyFolderIdFromTarget(document.activeElement);
    const held = focusedFolder ?? armedEmptyRef.current;
    if (!tree || !held) return;
    const next = flatRowsRef.current[nextIdx];
    if (next && (next.id === held || next.emptyParentId === held)) return;
    armedEmptyRef.current = null;
    tree.removeAttribute("data-empty-armed");
    tree.removeAttribute("data-focused-empty-folder");
    if (focusedFolder) tree.focus({ preventScroll: true });
  }, []);

  const onFocusRow = useCallback((id: string) => {
    const idx = flatRowsRef.current.findIndex((r) => r.id === id);
    if (idx >= 0) setFocusedIndex(idx);
    if (folderHasNothing(id)) {
      armEmptyFolder(id);
      document.getElementById(`tree-row-${id}`)?.focus({ preventScroll: true });
      return;
    }
    armedEmptyRef.current = null;
    parentRef.current?.focus({ preventScroll: true });
  }, [armEmptyFolder]);

  // Rename always ends somewhere obvious. A note that was just created and
  // named goes straight to writing; anything else returns to the list. A click
  // that already moved the cursor elsewhere wins.
  const returnTreeFocus = useCallback((id?: string, committed?: boolean) => {
    if (id) settleRename(id);
    const named = id ? useVaultStore.getState().nodes[id] : null;
    // A note with nothing under its title is new however it was made.
    const blank =
      named?.kind === "note" &&
      typeof named.content === "string" &&
      named.content.replace(/^#\s+.*$/m, "").trim() === "";
    const fresh = takeJustCreated(id) || Boolean(id && justCreatedRef.current === id) || blank;
    if (id && justCreatedRef.current === id) justCreatedRef.current = null;
    const land = () => {
      const active = document.activeElement as HTMLElement | null;
      const idle =
        !active ||
        active === document.body ||
        active === document.documentElement ||
        Boolean(active.closest?.("[data-file-tree]"));
      if (!idle) return;
      if (fresh && committed) {
        const st = useVaultStore.getState();
        const node = id ? st.nodes[id] : null;
        if (node?.kind === "note") {
          if (st.activeNoteId !== node.id) st.setActiveNote(node.id);
          requestWriteFocus(node.path);
        }
        return;
      }
      parentRef.current?.focus({ preventScroll: true });
    };
    land();
    if (fresh && committed) {
      requestAnimationFrame(land);
      window.setTimeout(land, 80);
    }
  }, []);

  const pendingFolderFocusRef = useRef<string | null>(null);
  const [folderFocusTick, setFolderFocusTick] = useState(0);

  useEffect(() => {
    const reveal = (id: string | null) => {
      if (!id) return;
      takePendingFolderReveal();
      const st = useVaultStore.getState();
      const open = new Set(st.expandedFolders);
      let cur = st.nodes[id]?.parentId ?? null;
      let guard = 0;
      while (cur && guard++ < 64) {
        open.add(cur);
        cur = st.nodes[cur]?.parentId ?? null;
      }
      if (folderHasNothing(id)) open.add(id);
      if (open.size !== st.expandedFolders.length) {
        st.setExpandedFolders(Array.from(open));
      }
      pendingFolderFocusRef.current = id;
      setFolderFocusTick((n) => n + 1);
    };
    const onReveal = (e: Event) => reveal((e as CustomEvent<string>).detail);
    // Esc from a note lands on that note's row, not wherever the cursor was.
    const onHome = () => {
      const active = useVaultStore.getState().activeNoteId;
      if (!active) return;
      const idx = flatRowsRef.current.findIndex((r) => r.id === active);
      if (idx < 0) return;
      armedEmptyRef.current = null;
      parentRef.current?.removeAttribute("data-empty-armed");
      setFocusedIndex(idx);
      virtualizer.scrollToIndex(idx, { align: "auto" });
    };
    window.addEventListener("nexus-reveal-folder", onReveal);
    window.addEventListener("nexus-list-home", onHome);
    reveal(takePendingFolderReveal());
    return () => {
      window.removeEventListener("nexus-reveal-folder", onReveal);
      window.removeEventListener("nexus-list-home", onHome);
    };
  }, [virtualizer]);

  // Set below, once the rename helper exists: make a note in an empty folder
  // and open its name. Used when Enter was held during the folder's reveal.
  const createInFolderRef = useRef<(folderId: string) => void>(() => {});
  const applyHeldEnter = (id: string) => {
    if (finishReveal(id) && folderHasNothing(id)) createInFolderRef.current(id);
  };

  useEffect(() => {
    const id = pendingFolderFocusRef.current;
    if (!id) return;
    const idx = flatRows.findIndex((r) => r.id === id);
    if (idx < 0) {
      // A large vault can keep the row out of the list for a while. The folder
      // still takes Enter: arm it and give the list the cursor.
      const fallback = window.setTimeout(() => {
        if (pendingFolderFocusRef.current !== id) return;
        pendingFolderFocusRef.current = null;
        if (!useVaultStore.getState().nodes[id]) {
          finishReveal(id);
          return;
        }
        if (folderHasNothing(id)) armEmptyFolder(id);
        parentRef.current?.focus({ preventScroll: true });
        applyHeldEnter(id);
      }, 400);
      return () => window.clearTimeout(fallback);
    }
    setFocusedIndex(idx);
    virtualizer.scrollToIndex(idx, { align: "center" });
    let frames = 0;
    let raf = 0;
    const land = () => {
      if (document.getElementById(`tree-row-${id}`) || frames++ > 30) {
        if (pendingFolderFocusRef.current !== id) return;
        pendingFolderFocusRef.current = null;
        onFocusRow(id);
        applyHeldEnter(id);
        return;
      }
      raf = requestAnimationFrame(land);
    };
    raf = requestAnimationFrame(land);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flatRows, folderFocusTick, virtualizer, onFocusRow, armEmptyFolder]);

  const openCreatedRename = useCallback((noteId: string) => {
    justCreatedRef.current = noteId;
    markJustCreated(noteId);
    startRenameBuffer(noteId);
    const safe =
      typeof CSS !== "undefined" && typeof CSS.escape === "function"
        ? CSS.escape(noteId)
        : noteId.replace(/["\\]/g, "\\$&");
    scheduleEmptyNoteRename(
      noteId,
      (id) => {
        setRenamingId(id);
        window.dispatchEvent(new CustomEvent("nexus-rename-node", { detail: id }));
      },
      () =>
        Boolean(
          document.querySelector(
            `[data-testid="tree-rename"][data-rename-for="${safe}"]`,
          ),
        ),
    );
  }, []);
  // One way to fill an empty folder, for a plain Enter and for an Enter held
  // while a searched folder was still landing.
  createInFolderRef.current = (folderId: string) => {
    armedEmptyRef.current = null;
    parentRef.current?.removeAttribute("data-empty-armed");
    createNoteWhenReady(folderId, "Untitled", openCreatedRename);
  };

  useEffect(() => {
    let fromPointer = false;
    const cssId = (id: string) => {
      if (typeof CSS !== "undefined" && typeof CSS.escape === "function") return CSS.escape(id);
      return id.replace(/["\\]/g, "\\$&");
    };
    const focusEmptyRow = (folderId: string) => {
      const tree = parentRef.current;
      if (!tree) return;
      const row =
        tree.querySelector<HTMLElement>(
          `[data-folder-empty="1"][data-empty-parent="${cssId(folderId)}"]`,
        ) ??
        tree.querySelector<HTMLElement>(
          `[data-node-id="${cssId(folderId)}"][data-folder-empty="1"]`,
        );
      row?.focus({ preventScroll: true });
    };
    const onPointerDown = (e: PointerEvent) => {
      fromPointer = true;
      const t = e.target as Element | null;
      if (t?.closest?.("[data-folder-empty='1']")) return;
      if (isProgrammaticFocusSteal(t, true, false)) {
        armedEmptyRef.current = null;
        parentRef.current?.removeAttribute("data-empty-armed");
        clearReclaim();
      }
    };
    const onPointerUp = () => {
      fromPointer = false;
    };
    const reclaimTimers: number[] = [];
    const clearReclaim = () => {
      for (const id of reclaimTimers) window.clearTimeout(id);
      reclaimTimers.length = 0;
    };
    // Trash, Rebuild, Settings, and search own the cursor while they are open.
    const dialogOpen = () =>
      Boolean(
        document.querySelector(
          "[data-nexus-confirm], [role='dialog'][aria-modal='true'], [data-nexus-ctx-menu]",
        ),
      );
    const openRename = () =>
      document.querySelector<HTMLElement>("[data-testid='tree-rename']:not([data-rename-closing])");
    const reclaimHolding = (folderId: string) => {
      if (dialogOpen()) return;
      const rename = openRename();
      if (rename) {
        if (document.activeElement !== rename) rename.focus({ preventScroll: true });
        return;
      }
      if (armedEmptyRef.current !== folderId) return;
      const active = document.activeElement as HTMLElement | null;
      if (active?.closest?.("[data-folder-empty='1']")) return;
      focusEmptyRow(folderId);
    };
    const onFocusIn = (e: FocusEvent) => {
      if (dialogOpen()) return;
      const next = e.target as Element | null;
      const rename = openRename();
      if (rename && isProgrammaticFocusSteal(next, true, fromPointer)) {
        reclaimAfterFocus(() => {
          if (rename.isConnected && !rename.hasAttribute("data-rename-closing") && document.activeElement !== rename) {
            rename.focus({ preventScroll: true });
          }
        });
        return;
      }
      const onEmpty = Boolean(next?.closest?.("[data-folder-empty='1']"));
      if (onEmpty) {
        const id = emptyFolderIdFromTarget(next);
        if (id) armEmptyFolder(id);
        return;
      }
      const holding = armedEmptyRef.current;
      if (!isProgrammaticFocusSteal(next, Boolean(holding), fromPointer)) return;
      if (!holding) return;
      // The note often still has the cursor when the folder is focused.
      // Take the row back after that focus() returns, and once more if a
      // long vault moves it again.
      const run = () => reclaimHolding(holding);
      clearReclaim();
      reclaimAfterFocus(run);
      reclaimTimers.push(window.setTimeout(run, 48));
      reclaimTimers.push(window.setTimeout(run, 160));
    };
    const onKey = (e: KeyboardEvent) => {
      if (dialogOpen()) return;
      // A name typed before its field is on screen is kept for the field.
      if (
        !e.isComposing &&
        !document.querySelector("[data-testid='tree-rename']") &&
        bufferRenameKey(e)
      ) {
        e.preventDefault();
        e.stopImmediatePropagation();
        return;
      }
      const target = e.target as HTMLElement | null;
      const tree = parentRef.current;
      const active = document.activeElement;
      const treeFolder = tree?.getAttribute("data-focused-empty-folder")?.trim() || null;
      const folderId = claimEmptyFolderEnter({
        key: e.key,
        meta: e.metaKey,
        ctrl: e.ctrlKey,
        alt: e.altKey,
        repeat: e.repeat,
        composing: e.isComposing,
        renameField: Boolean(target?.closest?.("[data-testid='tree-rename']")),
        fromTarget: emptyFolderIdFromTarget(target),
        fromActive: emptyFolderIdFromTarget(active),
        treeHasKey: Boolean(tree) && (target === tree || active === tree),
        treeFolder,
        armedFolder: armedEmptyRef.current,
        targetStole:
          isProgrammaticFocusSteal(target, true, false) ||
          isProgrammaticFocusSteal(active, true, false),
        targetIdle: isIdleEnterTarget(target) || isIdleEnterTarget(active),
      });
      if (!folderId) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      clearReclaim();
      createInFolderRef.current(folderId);
    };
    window.addEventListener("pointerdown", onPointerDown, true);
    window.addEventListener("pointerup", onPointerUp, true);
    window.addEventListener("focusin", onFocusIn, true);
    window.addEventListener("keydown", onKey, true);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown, true);
      window.removeEventListener("pointerup", onPointerUp, true);
      window.removeEventListener("focusin", onFocusIn, true);
      window.removeEventListener("keydown", onKey, true);
      clearReclaim();
    };
  }, [armEmptyFolder, openCreatedRename]);

  const handleTreeKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      const rows = flatRowsRef.current;
      if (renamingId || e.defaultPrevented) return;
      if (e.key === "F2") {
        e.preventDefault();
        const fromRow =
          treeRowIdFromTarget(e.target) ||
          treeRowIdFromTarget(
            typeof document !== "undefined" ? document.activeElement : null,
          );
        const id = fromRow || rows[focusedIndex]?.id;
        if (!id) return;
        setRenamingId(id);
        const idx = rows.findIndex((r) => r.id === id);
        if (idx >= 0) {
          setFocusedIndex(idx);
          virtualizer.scrollToIndex(idx, { align: "center" });
        }
        return;
      }
      if (
        e.key === "Enter" &&
        !e.metaKey &&
        !e.ctrlKey &&
        !e.altKey
      ) {
        const folderId =
          emptyFolderIdFromTarget(e.target) ||
          emptyFolderIdFromTarget(
            typeof document !== "undefined" ? document.activeElement : null,
          );
        if (folderId) {
          e.preventDefault();
          const id = createNote(folderId, "Untitled");
          if (id) {
            armedEmptyRef.current = null;
            parentRef.current?.removeAttribute("data-empty-armed");
            openCreatedRename(id);
          }
          return;
        }
      }
      if (rows.length === 0) {
        if (e.key === "Enter") {
          e.preventDefault();
          createNoteWhenReady(null, "Untitled", openCreatedRename);
        }
        return;
      }
      const nodes = useVaultStore.getState().nodes;
      const row = rows[focusedIndex];
      if (!row) return;
      if (e.key === "Home") {
        e.preventDefault();
        leaveEmptyFolderFor(0);
        setFocusedIndex(0);
        virtualizer.scrollToIndex(0, { align: "auto" });
        return;
      }
      if (e.key === "End") {
        e.preventDefault();
        const last = rows.length - 1;
        leaveEmptyFolderFor(last);
        setFocusedIndex(last);
        virtualizer.scrollToIndex(last, { align: "auto" });
        return;
      }

      if (e.key === "ArrowDown") {
        e.preventDefault();
        const next = Math.min(focusedIndex + 1, rows.length - 1);
        leaveEmptyFolderFor(next);
        setFocusedIndex(next);
        virtualizer.scrollToIndex(next, { align: "auto" });
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        const next = Math.max(focusedIndex - 1, 0);
        leaveEmptyFolderFor(next);
        setFocusedIndex(next);
        virtualizer.scrollToIndex(next, { align: "auto" });
        return;
      }
      if (row.kind === "more") {
        if (e.key === "Enter" && row.moreParentId) {
          e.preventDefault();
          showMore(row.moreParentId);
        }
        return;
      }
      if (row.kind === "empty") {
        if (e.key === "ArrowLeft" && row.emptyParentId) {
          e.preventDefault();
          const parentIdx = rows.findIndex((r) => r.id === row.emptyParentId);
          if (parentIdx >= 0) {
            setFocusedIndex(parentIdx);
            virtualizer.scrollToIndex(parentIdx, { align: "auto" });
          }
          return;
        }
        if (e.key === "Enter" && row.emptyParentId) {
          e.preventDefault();
          const id = createNote(row.emptyParentId, "Untitled");
          if (id) openCreatedRename(id);
        }
        return;
      }
      const node = nodes[row.id];
      if (!node) return;

      if (e.key === "ArrowRight") {
        e.preventDefault();
        if (node.kind === "folder") {
          const expanded = useVaultStore.getState().expandedFolders;
          if (!expanded.includes(node.id)) {
            toggleFolderReveal(node.id);
          } else if (focusedIndex < rows.length - 1) {
            const next = focusedIndex + 1;
            setFocusedIndex(next);
            virtualizer.scrollToIndex(next, { align: "auto" });
          }
        }
        return;
      }
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        if (node.kind === "folder") {
          const expanded = useVaultStore.getState().expandedFolders;
          if (expanded.includes(node.id)) {
            toggleFolderReveal(node.id);
            return;
          }
        }
        if (node.parentId) {
          const parentIdx = rows.findIndex((r) => r.id === node.parentId);
          if (parentIdx >= 0) {
            setFocusedIndex(parentIdx);
            virtualizer.scrollToIndex(parentIdx, { align: "auto" });
          }
        }
        return;
      }
      if (e.key === "Enter") {
        e.preventDefault();
        if (node.kind === "folder") {
          if (folderHasNothing(node.id)) {
            const id = createNote(node.id, "Untitled");
            if (id) openCreatedRename(id);
            return;
          }
          toggleFolderReveal(node.id);
        } else {
          setActiveNote(node.id);
          closeDrawersIfNarrow();
        }
        return;
      }
      if (e.key === "ContextMenu" || (e.key === "F10" && e.shiftKey)) {
        e.preventDefault();
        const el = document.getElementById(`tree-row-${node.id}`);
        const rect = el?.getBoundingClientRect();
        setCtx({
          kind: "item",
          nodeId: node.id,
          x: rect ? rect.left + 28 : 24,
          y: rect ? rect.bottom : 24,
        });
      }
    },
    [
      renamingId,
      focusedIndex,
      toggleFolderReveal,
      setActiveNote,
      showMore,
      virtualizer,
      setCtx,
      createNote,
      openCreatedRename,
      leaveEmptyFolderFor,
    ],
  );

  useEffect(() => {
    if (!ctx) return;
    const onPointerDown = (e: PointerEvent) => {
      const t = e.target as HTMLElement | null;
      if (t?.closest?.("[data-nexus-ctx-menu]")) return;
      if (t?.closest?.("[data-nexus-confirm]")) return;
      setCtx(null);
    };
    const menuItems = () =>
      Array.from(
        document.querySelectorAll<HTMLButtonElement>(
          "[data-nexus-ctx-menu] [role='menuitem']",
        ),
      );
    const focusItem = (index: number) => {
      const list = menuItems();
      if (!list.length) return;
      const next = (index + list.length) % list.length;
      list[next]?.focus();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        setCtx(null);
        return;
      }
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        e.stopPropagation();
        const list = menuItems();
        const current = list.indexOf(document.activeElement as HTMLButtonElement);
        if (e.key === "ArrowDown") focusItem(current < 0 ? 0 : current + 1);
        else focusItem(current < 0 ? list.length - 1 : current - 1);
      }
    };
    const returnId = ctx.kind === "item" ? ctx.nodeId : null;
    const timer = window.setTimeout(() => {
      focusItem(0);
      window.addEventListener("pointerdown", onPointerDown, true);
      window.addEventListener("keydown", onKey, true);
    }, 0);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("pointerdown", onPointerDown, true);
      window.removeEventListener("keydown", onKey, true);
      const active = document.activeElement as HTMLElement | null;
      const idle =
        !active ||
        active === document.body ||
        active === document.documentElement ||
        Boolean(active.closest?.("[data-nexus-ctx-menu]"));
      if (!idle) return;
      if (returnId) {
        const idx = flatRowsRef.current.findIndex((row) => row.id === returnId);
        if (idx >= 0) setFocusedIndex(idx);
      }
      parentRef.current?.focus({ preventScroll: true });
    };
  }, [ctx]);

  useEffect(() => {
    const applyGhostPos = () => {
      ghostRafRef.current = null;
      const pos = pendingGhostPos.current;
      const el = ghostElRef.current;
      if (!pos || !el) return;
      el.style.left = `${pos.x + 12}px`;
      el.style.top = `${pos.y + 12}px`;
    };

    const onMove = (e: PointerEvent) => {
      const s = sessionRef.current;
      if (!s) return;
      const dx = e.clientX - s.startX;
      const dy = e.clientY - s.startY;
      const nodes = useVaultStore.getState().nodes;
      if (!s.active) {
        if (Math.hypot(dx, dy) < DRAG_THRESHOLD_PX) return;
        s.active = true;
        setDragId(s.id);
        const n = nodes[s.id];
        pendingGhostPos.current = { x: e.clientX, y: e.clientY };
        setGhostLabel(n ? displayName(n) : "Moving…");
        document.body.style.cursor = "grabbing";
        document.body.style.userSelect = "none";
        // Position on next frame once ghost DOM exists
        if (ghostRafRef.current == null) {
          ghostRafRef.current = requestAnimationFrame(applyGhostPos);
        }
      } else {
        // rAF + direct DOM — no setState per pointermove
        pendingGhostPos.current = { x: e.clientX, y: e.clientY };
        if (ghostRafRef.current == null) {
          ghostRafRef.current = requestAnimationFrame(applyGhostPos);
        }
      }

      const target = resolveDropFromPoint(e.clientX, e.clientY, s.id, nodes);
      // Only setState when drop target identity changes
      if (!dropTargetsEqual(dropTargetRef.current, target)) {
        dropTargetRef.current = target;
        setDropTarget(target);
      } else {
        dropTargetRef.current = target;
      }

      if (target?.type === "folder") {
        const fid = target.id;
        if (!useVaultStore.getState().expandedFolders.includes(fid)) {
          if (!expandTimer.current) {
            expandTimer.current = setTimeout(() => {
              expandTimer.current = null;
              if (
                sessionRef.current?.active &&
                dropTargetRef.current?.type === "folder" &&
                dropTargetRef.current.id === fid
              ) {
                const exp = useVaultStore.getState().expandedFolders;
                if (!exp.includes(fid)) {
                  pendingRevealRef.current = fid;
                  useVaultStore.getState().toggleFolder(fid);
                }
              }
            }, 220);
          }
        }
      } else if (expandTimer.current) {
        clearTimeout(expandTimer.current);
        expandTimer.current = null;
      }
    };

    const endDrag = (e: PointerEvent) => {
      const s = sessionRef.current;
      if (!s) return;
      sessionRef.current = null;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      if (expandTimer.current) {
        clearTimeout(expandTimer.current);
        expandTimer.current = null;
      }
      if (ghostRafRef.current != null) {
        cancelAnimationFrame(ghostRafRef.current);
        ghostRafRef.current = null;
      }
      pendingGhostPos.current = null;

      const wasActive = s.active;
      const target = dropTargetRef.current;
      setDragId(null);
      setDropTarget(null);
      setGhostLabel(null);
      dropTargetRef.current = null;

      // Always suppress the synthetic click that follows pointerup so we
      // don't double-toggle folders. Open happens here for non-drags.
      (window as unknown as { __nexusSuppressTreeClick?: boolean }).__nexusSuppressTreeClick = true;
      window.setTimeout(() => {
        (window as unknown as { __nexusSuppressTreeClick?: boolean }).__nexusSuppressTreeClick = false;
      }, 100);

      if (!wasActive) {
        // Click (not drag): open note / toggle folder on pointerup —
        // more reliable than click under virtualization + micro-jitter.
        const nodes = useVaultStore.getState().nodes;
        const node = nodes[s.id];
        if (!node) return;
        if (node.kind === "folder") {
          if (!useVaultStore.getState().expandedFolders.includes(s.id)) {
            pendingRevealRef.current = s.id;
          }
          useVaultStore.getState().toggleFolder(s.id);
        } else if (node.kind === "note") {
          // Alt-click (or Cmd-Shift-click) parks the note in the second pane.
          // The row's click handler says the same thing, but pointerup owns
          // the open and used to ignore those modifiers.
          if (e.altKey || (e.metaKey && e.shiftKey)) {
            useVaultStore.getState().openNoteInPane?.("secondary", s.id);
          } else {
            useVaultStore.getState().setActiveNote(s.id);
          }
        }
        return;
      }

      e.preventDefault();

      if (!target) return;
      const nodes = useVaultStore.getState().nodes;
      if (target.type === "folder") {
        if (target.id === s.id) return;
        if (isDescendant(nodes, s.id, target.id)) return;
        useVaultStore.getState().moveNode(s.id, target.id);
      } else if (target.type === "root") {
        useVaultStore.getState().moveNode(s.id, null);
      }
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", endDrag);
    window.addEventListener("pointercancel", endDrag);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", endDrag);
      window.removeEventListener("pointercancel", endDrag);
      if (ghostRafRef.current != null) {
        cancelAnimationFrame(ghostRafRef.current);
        ghostRafRef.current = null;
      }
    };
  }, []);

  const onPointerDragStart = useCallback((id: string, e: React.PointerEvent) => {
    sessionRef.current = {
      id,
      startX: e.clientX,
      startY: e.clientY,
      active: false,
      pointerId: e.pointerId,
    };
  }, []);

  const ctxNodeId = ctx?.kind === "item" ? ctx.nodeId : null;
  const ctxNode = useVaultStore((s) =>
    ctxNodeId ? s.nodes[ctxNodeId] ?? null : null,
  );

  const startRename = (id: string) => {
    setCtx(null);
    setRenamingId(id);
  };

  const createAndRename = (
    kind: "note" | "folder",
    parentId: string | null,
  ) => {
    setCtx(null);
    if (parentId) {
      const expanded = useVaultStore.getState().expandedFolders;
      if (!expanded.includes(parentId)) toggleFolderReveal(parentId);
    }
    const id =
      kind === "note"
        ? createNote(parentId, "Untitled")
        : createFolder(parentId, "New Folder");
    requestAnimationFrame(() => setRenamingId(id));
  };

  const createFromTemplateInCtx = (templateId: NoteTemplateId) => {
    const parentId =
      ctx?.kind === "empty"
        ? ctx.parentId
        : ctxNode?.kind === "folder"
          ? ctxNode.id
          : null;
    setCtx(null);
    if (parentId) {
      const expanded = useVaultStore.getState().expandedFolders;
      if (!expanded.includes(parentId)) toggleFolderReveal(parentId);
    }
    createFromTemplate(templateId, parentId);
  };

  const rootDropActive = dropTarget?.type === "root" && dragId != null;

  const renderRow = (row: FlatRow) => {
    if (row.kind === "more") {
      const hidden = row.hiddenCount ?? 0;
      return (
        <button
          key={row.id}
          id={`tree-row-${row.id}`}
          type="button"
          className={cn(
            "tree-item flex w-full items-center text-left text-[12px] text-[var(--text-muted)] hover:text-[var(--text-secondary)]",
            treeHasFocus && focusedId === row.id && "is-focused",
          )}
          style={{ paddingLeft: treeIndentCss(row.depth), height: ROW_H }}
          role="treeitem"
          data-keyboard-focus={
            treeHasFocus && focusedId === row.id ? "row" : undefined
          }
          aria-label={`${hidden.toLocaleString()} more in this folder`}
          data-tree-more={String(hidden)}
          data-more-parent={row.moreParentId ?? ""}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            if (row.moreParentId) showMore(row.moreParentId);
          }}
        >
          {hidden.toLocaleString()} more
        </button>
      );
    }
    if (row.kind === "empty") {
      const parentId = row.emptyParentId ?? null;
      return (
        <div
          key={row.id}
          id={`tree-row-${row.id}`}
          role="treeitem"
          aria-label="This folder is empty. Enter starts a note."
          data-testid="tree-empty-folder"
          data-folder-empty="1"
          data-empty-parent={parentId ?? ""}
          tabIndex={-1}
          onPointerDown={(e) => {
            if ((e.target as HTMLElement).closest("button,a,input")) return;
            const idx = flatRowsRef.current.findIndex((r) => r.id === row.id);
            if (idx >= 0) setFocusedIndex(idx);
            if (parentId) armEmptyFolder(parentId);
            e.currentTarget.focus();
          }}
          onKeyDown={(e) => {
            if (e.defaultPrevented) return;
            if (e.key !== "Enter" || e.metaKey || e.ctrlKey || e.altKey) return;
            if (!parentId) return;
            e.preventDefault();
            e.stopPropagation();
            const id = createNote(parentId, "Untitled");
            if (id) openCreatedRename(id);
          }}
          className={cn(
            "tree-item flex w-full items-center gap-2 text-[12px] text-[var(--text-muted)]",
            treeHasFocus && focusedId === row.id && "is-focused",
          )}
          data-keyboard-focus={
            treeHasFocus && focusedId === row.id ? "row" : undefined
          }
          style={{ paddingLeft: treeIndentCss(row.depth), height: ROW_H }}
        >
          <span
            role="status"
            data-testid="tree-empty-folder-status"
            title="This folder is empty. Enter starts a note."
            className="min-w-0 flex-1 truncate text-[13px] font-semibold text-white"
          >
            Enter starts a note.
          </span>
          <button
            type="button"
            className="mr-1 flex shrink-0 items-center justify-center rounded-md text-[var(--accent)] hover:bg-[rgba(0,200,255,0.12)]"
            style={{ height: 26, width: 26 }}
            aria-label="New note in this folder"
            title="New note in this folder"
            data-testid="tree-empty-new-note"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              if (parentId) createAndRename("note", parentId);
            }}
          >
            <FilePlus size={14} />
          </button>
        </div>
      );
    }
    return (
      <TreeRow
        key={row.id}
        nodeId={row.id}
        depth={row.depth}
        renamingId={renamingId}
        setRenamingId={setRenamingId}
        openCtx={setCtx}
        dragId={dragId}
        dropTarget={dropTarget}
        onPointerDragStart={onPointerDragStart}
        isFocused={treeHasFocus && focusedId === row.id}
        onFocusRow={onFocusRow}
        onToggleFolder={toggleFolderReveal}
        onRenameFinished={returnTreeFocus}
        folderEmpty={row.kind === "folder" && folderHasNothing(row.id)}
        onEmptyEnter={(folderId) => {
          const id = createNote(folderId, "Untitled");
          if (id) openCreatedRename(id);
        }}
      />
    );
  };

  const focusedRow = flatRows[focusedIndex];
  const focusedEmptyFolder =
    focusedRow?.kind === "empty"
      ? focusedRow.emptyParentId ?? null
      : focusedRow?.kind === "folder" && folderHasNothing(focusedRow.id)
        ? focusedRow.id
        : null;
  // The banner speaks for the list's cursor, so it leaves with the focus. An
  // open folder already says it on the row below, so it is not said twice.
  const emptyBannerFolder =
    treeHasFocus &&
    focusedEmptyFolder &&
    !flatRows.some((r) => r.kind === "empty" && r.emptyParentId === focusedEmptyFolder)
      ? focusedEmptyFolder
      : null;

  return (
    <div
      ref={parentRef}
      data-file-tree
      data-tree-flat-rows={flatRows.length}
      data-tree-virtualized="1"
      data-focused-empty-folder={focusedEmptyFolder ?? undefined}
      className={cn(
        "nexus-focus-host titlebar-no-drag relative h-full min-h-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-contain px-2 pb-3",
        rootDropActive &&
          "rounded-lg ring-1 ring-inset ring-[rgba(0,200,255,0.35)]",
      )}
      role="tree"
      aria-label="Vault notes and folders"
      tabIndex={0}
      data-tree-focused={treeHasFocus ? "1" : "0"}
      aria-activedescendant={focusedId ? `tree-row-${focusedId}` : undefined}
      onFocus={(e) => {
        setTreeHasFocus(true);
        const id = treeRowIdFromTarget(e.target);
        if (!id) return;
        const idx = flatRowsRef.current.findIndex((row) => row.id === id);
        if (idx >= 0) setFocusedIndex(idx);
      }}
      onBlur={(e) => {
        const next = e.relatedTarget as Node | null;
        if (next && e.currentTarget.contains(next)) return;
        setTreeHasFocus(false);
      }}
      onKeyDown={handleTreeKeyDown}
      onContextMenu={(e) => {
        e.preventDefault();
        setCtx({
          kind: "empty",
          x: e.clientX,
          y: e.clientY,
          parentId: null,
        });
      }}
    >
      {flatRows.length === 0 ? (
        <EmptyState
          compact
          status="vault"
          className={cn(
            "mx-2 my-4",
            treeHasFocus && "ring-2 ring-[rgba(0,200,255,0.85)]",
          )}
          title="Nothing in this vault yet"
          description="Enter starts a note."
        >
          <div className="flex flex-wrap items-center justify-center gap-2">
            <button
              type="button"
              className="primary-btn min-h-8 px-3 text-[12px]"
              onClick={() => createNoteWhenReady(null, "Untitled", openCreatedRename)}
            >
              New note
            </button>
            <button
              type="button"
              className="ghost-btn min-h-8 px-3 text-[12px]"
              onClick={() => openDailyNote()}
            >
              Today
            </button>
          </div>
        </EmptyState>
      ) : useVirtual ? (
        <div
          style={{
            height: virtualizer.getTotalSize(),
            width: "100%",
            position: "relative",
          }}
        >
          {virtualizer.getVirtualItems().map((v) => {
            const row = flatRows[v.index];
            if (!row) return null;
            return (
              <div
                key={row.id}
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  width: "100%",
                  height: `${v.size}px`,
                  transform: `translateY(${v.start}px)`,
                }}
              >
                {renderRow(row)}
              </div>
            );
          })}
        </div>
      ) : (
        flatRows.map((row) => renderRow(row))
      )}

      {emptyBannerFolder ? (
        <p
          role="status"
          data-testid="tree-empty-folder-banner"
          data-empty-parent={emptyBannerFolder}
          className="sticky bottom-1 z-[1] mx-1 mt-2 rounded-md border border-[var(--border)] bg-[var(--bg-elevated)] px-2 py-1.5 text-[12px] leading-snug text-[var(--text-secondary)]"
          onPointerDown={() => {
            armEmptyFolder(emptyBannerFolder);
            const tree = parentRef.current;
            const row =
              tree?.querySelector<HTMLElement>(
                `[data-folder-empty="1"][data-empty-parent="${emptyBannerFolder}"]`,
              ) ??
              tree?.querySelector<HTMLElement>(
                `[data-node-id="${emptyBannerFolder}"][data-folder-empty="1"]`,
              );
            row?.focus({ preventScroll: true });
          }}
        >
          This folder is empty. Enter starts a note.
        </p>
      ) : null}

      {dragId ? (
        <div className="pointer-events-none sticky bottom-1 mt-3 rounded-md border border-dashed border-[rgba(0,200,255,0.28)] bg-[rgba(0,200,255,0.05)] px-2 py-1.5 text-center text-[10.5px] text-[var(--text-muted)]">
          Drop onto a folder to move it inside. Drop on empty space to leave it at the top.
        </div>
      ) : null}

      {ghostLabel ? (
        <div
          ref={ghostElRef}
          className="pointer-events-none fixed z-[100] rounded-lg border border-[rgba(0,200,255,0.4)] bg-[rgba(15,15,18,0.95)] px-2.5 py-1 text-[12px] font-medium text-[var(--text-primary)] shadow-[0_12px_40px_rgba(0,0,0,0.55)]"
          style={{
            left: (pendingGhostPos.current?.x ?? 0) + 12,
            top: (pendingGhostPos.current?.y ?? 0) + 12,
          }}
        >
          {ghostLabel}
        </div>
      ) : null}

      {ctx && typeof document !== "undefined"
        ? createPortal(
            <div
              data-nexus-ctx-menu role="menu" aria-label="File actions"
              className="glass-elevated fixed z-[120] min-w-[176px] rounded-[12px] p-1 shadow-[0_16px_48px_rgba(0,0,0,0.5)]"
              style={{
                left: Math.min(ctx.x, window.innerWidth - 200),
                top: Math.min(ctx.y, window.innerHeight - 300),
              }}
              onClick={(e) => e.stopPropagation()}
              onPointerDown={(e) => e.stopPropagation()}
              onContextMenu={(e) => e.preventDefault()}
            >
              {ctx.kind === "empty" || (ctxNode && ctxNode.kind === "folder") ? (
                <>
                  <MenuBtn
                    icon={<FilePlus size={13} />}
                    label="New note"
                    onClick={() =>
                      createAndRename(
                        "note",
                        ctx.kind === "empty"
                          ? ctx.parentId
                          : ctxNode?.kind === "folder"
                            ? ctxNode.id
                            : null,
                      )
                    }
                  />
                  <MenuBtn
                    icon={<Users size={13} />}
                    label="New meeting"
                    onClick={() => createFromTemplateInCtx("meeting")}
                  />
                  <MenuBtn
                    icon={<Lightbulb size={13} />}
                    label="New idea"
                    onClick={() => createFromTemplateInCtx("idea")}
                  />
                  <MenuBtn
                    icon={<FolderKanban size={13} />}
                    label="New project"
                    onClick={() => createFromTemplateInCtx("project")}
                  />
                  <MenuBtn
                    icon={<FolderPlus size={13} />}
                    label="New folder"
                    onClick={() =>
                      createAndRename(
                        "folder",
                        ctx.kind === "empty"
                          ? ctx.parentId
                          : ctxNode?.kind === "folder"
                            ? ctxNode.id
                            : null,
                      )
                    }
                  />
                </>
              ) : null}

              {ctx.kind === "item" && ctxNode ? (
                <>
                  {ctxNode.kind === "folder" ? (
                    <div className="my-1 h-px bg-[var(--border)]" />
                  ) : null}
                  {ctxNode.kind === "note" ? (
                    <MenuBtn
                      icon={<FileText size={13} />}
                      label="Open"
                      onClick={() => {
                        setActiveNote(ctxNode.id);
                        setCtx(null);
                      }}
                    />
                  ) : null}
                  <MenuBtn
                    icon={<Network size={13} />}
                    label="Reveal in graph"
                    onClick={() => {
                      const id = ctxNode.id;
                      setCtx(null);
                      queueMicrotask(() => {
                        useVaultStore.getState().revealInGraph?.(id);
                      });
                    }}
                  />
                  <MenuBtn
                    icon={<Pencil size={13} />}
                    label="Rename"
                    onClick={() => startRename(ctxNode.id)}
                  />
                  <MenuBtn
                    icon={<Trash2 size={13} />}
                    label="Move to Trash"
                    danger
                    onClick={() => {
                      const id = ctxNode.id;
                      setCtx(null);
                      queueMicrotask(() => requestDelete(id));
                    }}
                  />
                </>
              ) : null}

              {ctx.kind === "empty" ? (
                <p className="px-2.5 py-1 text-[10px] text-[var(--text-muted)]">
                  New items go at the top of the vault
                </p>
              ) : null}
            </div>,
            document.body,
          )
        : null}
    </div>
  );
});
