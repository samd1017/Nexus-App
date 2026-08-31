import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useVirtualizer } from "@tanstack/react-virtual";
import {
  ChevronDown,
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
import type { VaultNode } from "@/lib/vault/types";
import { noteTitle } from "@/lib/vault/types";
import type { NoteTemplateId } from "@/lib/vault/templates";
import { ensureVaultIndex } from "@/lib/vault/indexes";
import { useTreeStructureTick } from "@/lib/vault/tree-tick";
import { EmptyState } from "@/components/ui/EmptyState";


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

type FlatRow = { id: string; depth: number; kind: "folder" | "note" };

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

function flattenVisible(
  rootIds: string[],
  nodes: Record<string, VaultNode>,
  expanded: string[],
): FlatRow[] {
  const idx = ensureVaultIndex(nodes);
  const exp = new Set(expanded);
  const rows: FlatRow[] = [];
  // Index child lists are already sorted (folders first, then name) — do not copy+sort.
  const walk = (ids: string[], depth: number) => {
    for (const id of ids) {
      const n = nodes[id];
      if (!n) continue;
      rows.push({ id, depth, kind: n.kind });
      if (n.kind === "folder" && exp.has(id)) {
        walk(idx.getChildIds(id), depth + 1);
      }
    }
  };
  // Prefer index-sorted roots when in sync; fall back to store rootIds
  const indexRoots = idx.getChildIds(null);
  walk(indexRoots.length > 0 ? indexRoots : rootIds, 0);
  return rows;
}

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
}) {
  // Narrow selectors — avoid whole-nodes subscription
  const node = useVaultStore((s) => s.nodes[nodeId]);
  const isActive = useVaultStore(
    (s) => s.activeNoteId === nodeId && s.nodes[nodeId]?.kind === "note",
  );
  const expanded = useVaultStore((s) => s.expandedFolders.includes(nodeId));
  const toggleFolder = useVaultStore((s) => s.toggleFolder);
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

  useEffect(() => {
    if (!node || !renaming) return;
    setNameDraft(displayName(node));
    requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    });
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
    setRenamingId(null);
    if (!next || next === current) {
      setNameDraft(current);
      return;
    }
    renameNode(node.id, next);
  };

  const cancelRename = () => {
    skipBlur.current = true;
    setRenamingId(null);
    setNameDraft(displayName(node));
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
      toggleFolder(node.id);
      return;
    }
    setActiveNote(node.id);
  };

  return (
    <div
      id={`tree-row-${node.id}`}
      className={cn(
        "tree-item group relative flex w-full items-center gap-1.5 text-left select-none",
        isActive && "is-active",
        isFocused && !isActive && "is-focused",
        isDragging && "opacity-40",
        isDropHover &&
          "ring-1 ring-[var(--accent)] bg-[rgba(0,200,255,0.1)]",
      )}
      style={{ paddingLeft: 8 + depth * 14, height: ROW_H }}
      role="treeitem"
      aria-selected={isActive}
      aria-expanded={node.kind === "folder" ? expanded : undefined}
      tabIndex={-1}
      data-node-id={node.id}
      data-node-kind={node.kind}
      data-testid={node.kind === "note" ? "tree-note-row" : "tree-folder-row"}
      onPointerDown={(e) => {
        if (renaming) return;
        if (e.button !== 0) return;
        const t = e.target as HTMLElement;
        if (t.closest("input,button,[role='button'],a")) return;
        onFocusRow?.(node.id);
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
        <span className="flex h-4 w-4 shrink-0 items-center justify-center text-[var(--text-muted)]">
          {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
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
          className="min-w-0 flex-1 rounded bg-[var(--bg-elevated)] px-1.5 py-0.5 text-[13px] text-[var(--text-primary)] outline-none ring-1 ring-[var(--accent)]"
          value={nameDraft}
          onChange={(e) => setNameDraft(e.target.value)}
          onBlur={commitRename}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === "Enter") {
              e.preventDefault();
              commitRename();
            }
            if (e.key === "Escape") {
              e.preventDefault();
              cancelRename();
            }
          }}
          onClick={(e) => e.stopPropagation()}
          onDoubleClick={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
        />
      ) : (
        <span className="min-w-0 flex-1 cursor-grab truncate active:cursor-grabbing">
          {displayName(node)}
        </span>
      )}

      <div
        className="titlebar-no-drag relative ml-auto flex shrink-0 opacity-70 group-hover:opacity-100"
        onClick={(e) => e.stopPropagation()}
        onPointerDown={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          className="icon-btn flex h-6 w-6 items-center justify-center"
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
        "flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-[12.5px] transition-colors",
        danger
          ? "text-[var(--danger)] hover:bg-[rgba(255,69,58,0.1)]"
          : "text-[var(--text-secondary)] hover:bg-white/[0.05] hover:text-[var(--text-primary)]",
      )}
    >
      {icon}
      {label}
    </button>
  );
}

export const FileTree = memo(function FileTree() {
  const rootIds = useVaultStore((s) => s.rootIds);
  const expandedFolders = useVaultStore((s) => s.expandedFolders);
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
  // Ghost label only in React state; position updated via rAF + DOM
  const [ghostLabel, setGhostLabel] = useState<string | null>(null);

  const sessionRef = useRef<DragSession | null>(null);
  const dropTargetRef = useRef<DropTarget>(null);
  const expandTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const parentRef = useRef<HTMLDivElement>(null);
  const ghostElRef = useRef<HTMLDivElement>(null);
  const ghostRafRef = useRef<number | null>(null);
  const pendingGhostPos = useRef<{ x: number; y: number } | null>(null);

  const flatRows = useMemo(() => {
    const nodes = useVaultStore.getState().nodes;
    return flattenVisible(rootIds, nodes, expandedFolders);
    // structureTick encodes structureGen + nodeCount + rootIds
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rootIds, expandedFolders, structureTick]);

  // Stabilize callbacks that would otherwise churn when flatRows identity changes
  const flatRowsRef = useRef(flatRows);
  flatRowsRef.current = flatRows;

  const useVirtual = true;

  useEffect(() => {
    if (flatRows.length === 0) {
      setFocusedIndex(0);
      return;
    }
    setFocusedIndex((i) => Math.min(Math.max(0, i), flatRows.length - 1));
  }, [flatRows.length]);

  const virtualizer = useVirtualizer({
    count: flatRows.length,
    getScrollElement: () =>
      parentRef.current?.closest("[data-tree-scroll]") as HTMLElement | null,
    estimateSize: () => ROW_H,
    overscan: 12,
    getItemKey: (index) => flatRows[index]?.id ?? index,
    enabled: useVirtual,
  });

  const focusedId = flatRows[focusedIndex]?.id ?? null;

  const onFocusRow = useCallback((id: string) => {
    const idx = flatRowsRef.current.findIndex((r) => r.id === id);
    if (idx >= 0) setFocusedIndex(idx);
  }, []);

  const handleTreeKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      const rows = flatRowsRef.current;
      if (renamingId || rows.length === 0) return;
      const nodes = useVaultStore.getState().nodes;
      const row = rows[focusedIndex];
      if (!row) return;
      const node = nodes[row.id];
      if (!node) return;

      if (e.key === "ArrowDown") {
        e.preventDefault();
        const next = Math.min(focusedIndex + 1, rows.length - 1);
        setFocusedIndex(next);
        virtualizer.scrollToIndex(next, { align: "auto" });
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        const next = Math.max(focusedIndex - 1, 0);
        setFocusedIndex(next);
        virtualizer.scrollToIndex(next, { align: "auto" });
        return;
      }
      if (e.key === "ArrowRight") {
        e.preventDefault();
        if (node.kind === "folder") {
          const expanded = useVaultStore.getState().expandedFolders;
          if (!expanded.includes(node.id)) {
            toggleFolder(node.id);
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
            toggleFolder(node.id);
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
          toggleFolder(node.id);
        } else {
          setActiveNote(node.id);
        }
      }
    },
    [
      renamingId,
      focusedIndex,
      toggleFolder,
      setActiveNote,
      virtualizer,
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
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setCtx(null);
    };
    const timer = window.setTimeout(() => {
      window.addEventListener("pointerdown", onPointerDown, true);
      window.addEventListener("keydown", onKey);
    }, 0);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("pointerdown", onPointerDown, true);
      window.removeEventListener("keydown", onKey);
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
                  useVaultStore.getState().toggleFolder(fid);
                }
              }
            }, 420);
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
          useVaultStore.getState().toggleFolder(s.id);
        } else if (node.kind === "note") {
          useVaultStore.getState().setActiveNote(s.id);
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
      if (!expanded.includes(parentId)) toggleFolder(parentId);
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
      if (!expanded.includes(parentId)) toggleFolder(parentId);
    }
    createFromTemplate(templateId, parentId);
  };

  const rootDropActive = dropTarget?.type === "root" && dragId != null;

  const renderRow = (row: FlatRow) => (
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
      isFocused={focusedId === row.id}
      onFocusRow={onFocusRow}
    />
  );

  return (
    <div
      ref={parentRef}
      data-file-tree
      className={cn(
        "titlebar-no-drag relative h-full min-h-0 flex-1 overflow-y-auto overscroll-contain px-2 pb-3 outline-none",
        rootDropActive &&
          "rounded-lg ring-1 ring-inset ring-[rgba(0,200,255,0.35)]",
      )}
      role="tree"
      aria-label="Vault notes and folders"
      tabIndex={0}
      aria-activedescendant={focusedId ? `tree-row-${focusedId}` : undefined}
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
          className="mx-2 my-4"
          title="Empty vault"
          description="Create a note to get started, or right-click for more."
        >
          <div className="flex flex-wrap items-center justify-center gap-2">
            <button
              type="button"
              className="primary-btn min-h-8 px-3 text-[12px]"
              onClick={() => createNote(null)}
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

      {dragId ? (
        <div className="pointer-events-none sticky bottom-1 mt-3 rounded-md border border-dashed border-[rgba(0,200,255,0.28)] bg-[rgba(0,200,255,0.05)] px-2 py-1.5 text-center text-[10.5px] text-[var(--text-muted)]">
          Drop on a folder to nest · drop empty space for root
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
                    label="Delete"
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
                  Creates at vault root
                </p>
              ) : null}
            </div>,
            document.body,
          )
        : null}
    </div>
  );
});
