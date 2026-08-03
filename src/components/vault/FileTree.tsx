import { useEffect, useMemo, useRef, useState } from "react";
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
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useVaultStore } from "@/lib/vault/store";
import type { VaultNode } from "@/lib/vault/types";
import { noteTitle } from "@/lib/vault/types";

/**
 * Pointer-based tree DnD — works in browser AND Tauri/WKWebView (Mac app).
 * HTML5 Drag-and-Drop is unreliable in WKWebView, so we do not depend on it.
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
  active: boolean; // passed movement threshold
  pointerId: number;
};

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
      // reject drop into self/descendant
      if (!isDescendant(nodes, dragId, id)) {
        return { type: "folder", id };
      }
    }
    // Hovering a note: treat as its parent folder if any, else root
    if (id && kind === "note") {
      const parentId = nodes[id]?.parentId ?? null;
      if (parentId && parentId !== dragId && !isDescendant(nodes, dragId, parentId)) {
        return { type: "folder", id: parentId };
      }
      return { type: "root" };
    }
  }
  // Inside the tree panel but not on a row → root
  if (el.closest("[data-file-tree]")) return { type: "root" };
  return null;
}

function TreeNode({
  node,
  depth,
  renamingId,
  setRenamingId,
  openCtx,
  dragId,
  dropTarget,
  onPointerDragStart,
}: {
  node: VaultNode;
  depth: number;
  renamingId: string | null;
  setRenamingId: (id: string | null) => void;
  openCtx: (menu: CtxMenu) => void;
  dragId: string | null;
  dropTarget: DropTarget;
  onPointerDragStart: (id: string, e: React.PointerEvent) => void;
}) {
  const activeNoteId = useVaultStore((s) => s.activeNoteId);
  const expandedFolders = useVaultStore((s) => s.expandedFolders);
  const toggleFolder = useVaultStore((s) => s.toggleFolder);
  const setActiveNote = useVaultStore((s) => s.setActiveNote);
  const getChildren = useVaultStore((s) => s.getChildren);
  const renameNode = useVaultStore((s) => s.renameNode);

  const renaming = renamingId === node.id;
  const [nameDraft, setNameDraft] = useState(displayName(node));
  const inputRef = useRef<HTMLInputElement>(null);
  const skipBlur = useRef(false);

  useEffect(() => {
    if (!renaming) setNameDraft(displayName(node));
  }, [node.id, node.name, node.content, renaming]);

  useEffect(() => {
    if (renaming) {
      setNameDraft(displayName(node));
      requestAnimationFrame(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
      });
    }
  }, [renaming, node.id]);

  const expanded = expandedFolders.includes(node.id);
  const children =
    node.kind === "folder" && expanded ? getChildren(node.id) : [];
  const isActive = node.kind === "note" && node.id === activeNoteId;
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

  const openNote = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (renaming || dragId) return;
    // Ignore the click that follows a completed drag (Mac + web)
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
    <div>
      <div
        className={cn(
          "tree-item group relative flex w-full items-center gap-1.5 text-left select-none",
          isActive && "is-active",
          isDragging && "opacity-40",
          isDropHover &&
            "ring-1 ring-[var(--accent)] bg-[rgba(0,200,255,0.1)]",
        )}
        style={{ paddingLeft: 8 + depth * 14 }}
        role="treeitem"
        aria-selected={isActive}
        aria-expanded={node.kind === "folder" ? expanded : undefined}
        data-node-id={node.id}
        data-node-kind={node.kind}
        onPointerDown={(e) => {
          if (renaming) return;
          // Left button only; ignore interactive chrome
          if (e.button !== 0) return;
          const t = e.target as HTMLElement;
          if (t.closest("input,button,[role='button'],a")) return;
          onPointerDragStart(node.id, e);
        }}
        onClick={openNote}
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
          className="titlebar-no-drag relative ml-auto hidden shrink-0 group-hover:flex"
          onClick={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
        >
          <span
            role="button"
            tabIndex={0}
            className="icon-btn flex h-6 w-6 items-center justify-center"
            onClick={(e) => {
              e.stopPropagation();
              const rect = (
                e.currentTarget as HTMLElement
              ).getBoundingClientRect();
              openCtx({
                kind: "item",
                nodeId: node.id,
                x: rect.right,
                y: rect.bottom + 4,
              });
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                openCtx({
                  kind: "item",
                  nodeId: node.id,
                  x: 120,
                  y: 120,
                });
              }
            }}
            aria-label="Item actions"
          >
            <MoreHorizontal size={14} />
          </span>
        </div>
      </div>

      {node.kind === "folder" && expanded ? (
        <div role="group">
          {children.map((child) => (
            <TreeNode
              key={child.id}
              node={child}
              depth={depth + 1}
              renamingId={renamingId}
              setRenamingId={setRenamingId}
              openCtx={openCtx}
              dragId={dragId}
              dropTarget={dropTarget}
              onPointerDragStart={onPointerDragStart}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

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
    <button
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

export function FileTree() {
  const rootIds = useVaultStore((s) => s.rootIds);
  const nodes = useVaultStore((s) => s.nodes);
  const createNote = useVaultStore((s) => s.createNote);
  const createFolder = useVaultStore((s) => s.createFolder);
  const deleteNode = useVaultStore((s) => s.deleteNode);
  const toggleFolder = useVaultStore((s) => s.toggleFolder);
  const setActiveNote = useVaultStore((s) => s.setActiveNote);
  const moveNode = useVaultStore((s) => s.moveNode);

  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [ctx, setCtx] = useState<CtxMenu>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<DropTarget>(null);
  const [ghost, setGhost] = useState<{
    x: number;
    y: number;
    label: string;
  } | null>(null);

  const sessionRef = useRef<DragSession | null>(null);
  const suppressClickRef = useRef(false);
  const dropTargetRef = useRef<DropTarget>(null);
  const expandTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const nodesRef = useRef(nodes);
  nodesRef.current = nodes;

  const roots = useMemo(() => {
    return rootIds
      .map((id) => nodes[id])
      .filter(Boolean)
      .sort((a, b) => {
        if (a.kind !== b.kind) return a.kind === "folder" ? -1 : 1;
        return a.name.localeCompare(b.name);
      });
  }, [rootIds, nodes]);

  useEffect(() => {
    if (!ctx) return;
    const close = () => setCtx(null);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("click", close);
    window.addEventListener("scroll", close, true);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("click", close);
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("keydown", onKey);
    };
  }, [ctx]);

  // Global pointer move/up for cross-webview-safe DnD
  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      const s = sessionRef.current;
      if (!s) return;
      const dx = e.clientX - s.startX;
      const dy = e.clientY - s.startY;
      if (!s.active) {
        if (Math.hypot(dx, dy) < 6) return;
        s.active = true;
        setDragId(s.id);
        const n = nodesRef.current[s.id];
        setGhost({
          x: e.clientX,
          y: e.clientY,
          label: n ? displayName(n) : "Moving…",
        });
        document.body.style.cursor = "grabbing";
        document.body.style.userSelect = "none";
      } else {
        setGhost((g) =>
          g ? { ...g, x: e.clientX, y: e.clientY } : g,
        );
      }

      const target = resolveDropFromPoint(
        e.clientX,
        e.clientY,
        s.id,
        nodesRef.current,
      );
      dropTargetRef.current = target;
      setDropTarget(target);

      // Auto-expand folders under the cursor
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

      const wasActive = s.active;
      const target = dropTargetRef.current;
      setDragId(null);
      setDropTarget(null);
      setGhost(null);
      dropTargetRef.current = null;

      if (!wasActive) return; // treat as click — click handler still fires

      // Suppress the synthetic click that follows pointerup after a drag
      (window as unknown as { __nexusSuppressTreeClick?: boolean }).__nexusSuppressTreeClick = true;
      window.setTimeout(() => {
        (window as unknown as { __nexusSuppressTreeClick?: boolean }).__nexusSuppressTreeClick = false;
      }, 80);
      e.preventDefault();

      if (!target) return;
      if (target.type === "folder") {
        if (target.id === s.id) return;
        if (isDescendant(nodesRef.current, s.id, target.id)) return;
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
    };
  }, []);

  const onPointerDragStart = (id: string, e: React.PointerEvent) => {
    // Don't capture yet — only after threshold, so clicks still work
    sessionRef.current = {
      id,
      startX: e.clientX,
      startY: e.clientY,
      active: false,
      pointerId: e.pointerId,
    };
  };

  const ctxNode = ctx?.kind === "item" ? nodes[ctx.nodeId] : null;

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

  const rootDropActive = dropTarget?.type === "root" && dragId != null;

  return (
    <div
      data-file-tree
      className={cn(
        "titlebar-no-drag relative min-h-full px-2 pb-8",
        rootDropActive &&
          "rounded-lg ring-1 ring-inset ring-[rgba(0,200,255,0.35)]",
      )}
      role="tree"
      aria-label="Vault files"
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
      {roots.map((node) => (
        <TreeNode
          key={node.id}
          node={node}
          depth={0}
          renamingId={renamingId}
          setRenamingId={setRenamingId}
          openCtx={setCtx}
          dragId={dragId}
          dropTarget={dropTarget}
          onPointerDragStart={onPointerDragStart}
        />
      ))}
      {roots.length === 0 ? (
        <p className="px-2 py-6 text-center text-[12.5px] text-[var(--text-muted)]">
          Empty vault — right-click to add a note or folder.
        </p>
      ) : null}

      {dragId ? (
        <div className="pointer-events-none sticky bottom-1 mt-3 rounded-md border border-dashed border-[rgba(0,200,255,0.28)] bg-[rgba(0,200,255,0.05)] px-2 py-1.5 text-center text-[10.5px] text-[var(--text-muted)]">
          Drop on a folder to nest · drop empty space for root
        </div>
      ) : null}

      {ghost ? (
        <div
          className="pointer-events-none fixed z-[100] rounded-lg border border-[rgba(0,200,255,0.4)] bg-[rgba(15,15,18,0.95)] px-2.5 py-1 text-[12px] font-medium text-[var(--text-primary)] shadow-[0_12px_40px_rgba(0,0,0,0.55)]"
          style={{
            left: ghost.x + 12,
            top: ghost.y + 12,
          }}
        >
          {ghost.label}
        </div>
      ) : null}

      {ctx ? (
        <div
          className="glass-elevated fixed z-[90] min-w-[168px] rounded-[12px] p-1 shadow-[0_16px_48px_rgba(0,0,0,0.5)]"
          style={{
            left: Math.min(ctx.x, window.innerWidth - 180),
            top: Math.min(ctx.y, window.innerHeight - 220),
          }}
          onClick={(e) => e.stopPropagation()}
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
                icon={<Pencil size={13} />}
                label="Rename"
                onClick={() => startRename(ctxNode.id)}
              />
              <MenuBtn
                icon={<Trash2 size={13} />}
                label="Delete"
                danger
                onClick={() => {
                  deleteNode(ctxNode.id);
                  setCtx(null);
                }}
              />
            </>
          ) : null}

          {ctx.kind === "empty" ? (
            <p className="px-2.5 py-1 text-[10px] text-[var(--text-muted)]">
              Creates at vault root
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
