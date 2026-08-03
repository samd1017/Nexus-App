import { useEffect, useMemo, useRef, useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  FileText,
  Folder,
  FolderOpen,
  MoreHorizontal,
  Plus,
  Trash2,
  Pencil,
  FolderPlus,
  FilePlus,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useVaultStore } from "@/lib/vault/store";
import type { VaultNode } from "@/lib/vault/types";
import { noteTitle } from "@/lib/vault/types";

type CtxMenu =
  | { kind: "item"; nodeId: string; x: number; y: number }
  | { kind: "empty"; x: number; y: number; parentId: string | null }
  | null;

function displayName(node: VaultNode): string {
  return node.kind === "note" ? noteTitle(node) : node.name;
}

function TreeNode({
  node,
  depth,
  renamingId,
  setRenamingId,
  openCtx,
}: {
  node: VaultNode;
  depth: number;
  renamingId: string | null;
  setRenamingId: (id: string | null) => void;
  openCtx: (menu: CtxMenu) => void;
}) {
  const activeNoteId = useVaultStore((s) => s.activeNoteId);
  const expandedFolders = useVaultStore((s) => s.expandedFolders);
  const toggleFolder = useVaultStore((s) => s.toggleFolder);
  const setActiveNote = useVaultStore((s) => s.setActiveNote);
  const getChildren = useVaultStore((s) => s.getChildren);
  const renameNode = useVaultStore((s) => s.renameNode);
  const deleteNode = useVaultStore((s) => s.deleteNode);

  const renaming = renamingId === node.id;
  const [nameDraft, setNameDraft] = useState(displayName(node));
  const inputRef = useRef<HTMLInputElement>(null);
  const skipBlur = useRef(false);

  // Keep draft in sync when not actively renaming
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
    if (renaming) return;
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
          "tree-item group relative flex w-full items-center gap-1.5 text-left",
          isActive && "is-active",
        )}
        style={{ paddingLeft: 8 + depth * 14 }}
        role="treeitem"
        aria-selected={isActive}
        aria-expanded={node.kind === "folder" ? expanded : undefined}
        data-node-id={node.id}
        data-node-kind={node.kind}
        onClick={openNote}
        onDoubleClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
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
          />
        ) : (
          <span className="min-w-0 flex-1 truncate">{displayName(node)}</span>
        )}

        <div
          className="titlebar-no-drag relative ml-auto hidden shrink-0 group-hover:flex"
          onClick={(e) => e.stopPropagation()}
        >
          <span
            role="button"
            tabIndex={0}
            className="icon-btn flex h-6 w-6 items-center justify-center"
            onClick={(e) => {
              e.stopPropagation();
              const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
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
  // Prefer structural fields so bulk content-only writes don't thrash the tree
  const nodes = useVaultStore((s) => s.nodes);
  const createNote = useVaultStore((s) => s.createNote);
  const createFolder = useVaultStore((s) => s.createFolder);
  const deleteNode = useVaultStore((s) => s.deleteNode);
  const toggleFolder = useVaultStore((s) => s.toggleFolder);
  const setActiveNote = useVaultStore((s) => s.setActiveNote);

  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [ctx, setCtx] = useState<CtxMenu>(null);

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
    // Defer rename mode until tree paints the new node
    requestAnimationFrame(() => setRenamingId(id));
  };

  return (
    <div
      className="relative min-h-full px-2 pb-3"
      role="tree"
      aria-label="Vault files"
      onContextMenu={(e) => {
        // Empty-area context menu (not on an item — items stopPropagation)
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
        />
      ))}
      {roots.length === 0 ? (
        <p className="px-2 py-6 text-center text-[12.5px] text-[var(--text-muted)]">
          Empty vault — right-click to add a note or folder.
        </p>
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
