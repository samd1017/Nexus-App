import { useMemo, useState } from "react";
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
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useVaultStore } from "@/lib/vault/store";
import type { VaultNode } from "@/lib/vault/types";
import { noteTitle } from "@/lib/vault/types";

function TreeNode({
  node,
  depth,
}: {
  node: VaultNode;
  depth: number;
}) {
  const activeNoteId = useVaultStore((s) => s.activeNoteId);
  const expandedFolders = useVaultStore((s) => s.expandedFolders);
  const toggleFolder = useVaultStore((s) => s.toggleFolder);
  const setActiveNote = useVaultStore((s) => s.setActiveNote);
  const getChildren = useVaultStore((s) => s.getChildren);
  const renameNode = useVaultStore((s) => s.renameNode);
  const deleteNode = useVaultStore((s) => s.deleteNode);
  const createNote = useVaultStore((s) => s.createNote);
  const createFolder = useVaultStore((s) => s.createFolder);

  const [menuOpen, setMenuOpen] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [nameDraft, setNameDraft] = useState(node.name);

  const expanded = expandedFolders.includes(node.id);
  const children = node.kind === "folder" && expanded ? getChildren(node.id) : [];
  const isActive = node.kind === "note" && node.id === activeNoteId;

  const commitRename = () => {
    setRenaming(false);
    if (nameDraft.trim() && nameDraft !== node.name) {
      renameNode(node.id, nameDraft.trim());
    } else {
      setNameDraft(node.name);
    }
  };

  const openNote = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (node.kind === "folder") {
      toggleFolder(node.id);
      return;
    }
    // Explicit selection — store flushes previous editor then switches
    setActiveNote(node.id);
  };

  return (
    <div>
      <button
        type="button"
        className={cn(
          "tree-item group relative flex w-full items-center gap-1.5 text-left",
          isActive && "is-active",
        )}
        style={{ paddingLeft: 8 + depth * 14 }}
        onClick={openNote}
        onDoubleClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setRenaming(true);
          setNameDraft(node.kind === "note" ? noteTitle(node) : node.name);
        }}
        role="treeitem"
        aria-selected={isActive}
        aria-expanded={node.kind === "folder" ? expanded : undefined}
        data-node-id={node.id}
        data-node-kind={node.kind}
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
            autoFocus
            className="min-w-0 flex-1 rounded bg-[var(--bg-elevated)] px-1.5 py-0.5 text-[13px] text-[var(--text-primary)] outline-none ring-1 ring-[var(--accent)]"
            value={nameDraft}
            onChange={(e) => setNameDraft(e.target.value)}
            onBlur={commitRename}
            onKeyDown={(e) => {
              if (e.key === "Enter") commitRename();
              if (e.key === "Escape") {
                setRenaming(false);
                setNameDraft(node.name);
              }
            }}
            onClick={(e) => e.stopPropagation()}
          />
        ) : (
          <span className="min-w-0 flex-1 truncate">
            {node.kind === "note" ? noteTitle(node) : node.name}
          </span>
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
              setMenuOpen((v) => !v);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                setMenuOpen((v) => !v);
              }
            }}
            aria-label="Item actions"
          >
            <MoreHorizontal size={14} />
          </span>
          {menuOpen ? (
            <div
              className="glass-elevated absolute right-0 top-7 z-50 min-w-[150px] rounded-[12px] p-1"
              onClick={(e) => e.stopPropagation()}
            >
              {node.kind === "folder" ? (
                <>
                  <MenuBtn
                    icon={<Plus size={13} />}
                    label="New note"
                    onClick={() => {
                      createNote(node.id);
                      setMenuOpen(false);
                    }}
                  />
                  <MenuBtn
                    icon={<Folder size={13} />}
                    label="New folder"
                    onClick={() => {
                      createFolder(node.id);
                      setMenuOpen(false);
                    }}
                  />
                </>
              ) : null}
              <MenuBtn
                icon={<Pencil size={13} />}
                label="Rename"
                onClick={() => {
                  setRenaming(true);
                  setNameDraft(node.kind === "note" ? noteTitle(node) : node.name);
                  setMenuOpen(false);
                }}
              />
              <MenuBtn
                icon={<Trash2 size={13} />}
                label="Delete"
                danger
                onClick={() => {
                  deleteNode(node.id);
                  setMenuOpen(false);
                }}
              />
            </div>
          ) : null}
        </div>
      </button>

      {node.kind === "folder" && expanded ? (
        <div role="group">
          {children.map((child) => (
            <TreeNode key={child.id} node={child} depth={depth + 1} />
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

  const roots = useMemo(() => {
    return rootIds
      .map((id) => nodes[id])
      .filter(Boolean)
      .sort((a, b) => {
        if (a.kind !== b.kind) return a.kind === "folder" ? -1 : 1;
        return a.name.localeCompare(b.name);
      });
  }, [rootIds, nodes]);

  return (
    <div className="px-2 pb-3" role="tree" aria-label="Vault files">
      {roots.map((node) => (
        <TreeNode key={node.id} node={node} depth={0} />
      ))}
      {roots.length === 0 ? (
        <p className="px-2 py-6 text-center text-[12.5px] text-[var(--text-muted)]">
          Empty vault — create a note to begin.
        </p>
      ) : null}
    </div>
  );
}
