import {
  FilePlus,
  FolderPlus,
  PanelLeftClose,
  Search,
} from "lucide-react";
import { VaultSwitcher } from "@/components/vault/VaultSwitcher";
import { FileTree } from "@/components/vault/FileTree";
import { useVaultStore } from "@/lib/vault/store";

export function LeftSidebar() {
  const leftOpen = useVaultStore((s) => s.settings.leftOpen);
  const leftWidth = useVaultStore((s) => s.settings.leftWidth);
  const setLeftOpen = useVaultStore((s) => s.setLeftOpen);
  const setCommandOpen = useVaultStore((s) => s.setCommandOpen);
  const createNote = useVaultStore((s) => s.createNote);
  const createFolder = useVaultStore((s) => s.createFolder);

  if (!leftOpen) {
    return (
      <div className="flex w-11 shrink-0 flex-col items-center border-r border-[var(--border)] bg-[var(--bg-primary)] py-3 sm:w-12">
        <button
          type="button"
          className="icon-btn"
          onClick={() => setLeftOpen(true)}
          title="Show sidebar (⌘\\)"
        >
          <PanelLeftClose size={16} className="rotate-180" />
        </button>
      </div>
    );
  }

  return (
    <>
      <button
        type="button"
        className="fixed inset-0 z-20 bg-black/50 md:hidden"
        aria-label="Close sidebar"
        onClick={() => setLeftOpen(false)}
      />
      <aside
        className="panel-slide glass-panel absolute inset-y-0 left-0 z-30 flex h-full w-[min(280px,86vw)] shrink-0 flex-col border-r border-[var(--border)] bg-[rgba(15,15,18,0.94)] md:relative md:z-0 md:bg-[rgba(15,15,18,0.78)]"
        style={{ width: leftWidth }}
      >
        <VaultSwitcher />

        <div className="mt-3 flex items-center gap-1.5 px-3">
          <button
            type="button"
            onClick={() => setCommandOpen(true)}
            className="flex h-9 min-w-0 flex-1 items-center gap-2 rounded-[10px] border border-[var(--border)] bg-white/[0.03] px-2.5 text-left text-[12.5px] text-[var(--text-muted)] transition-colors hover:border-[rgba(0,200,255,0.25)] hover:text-[var(--text-secondary)]"
          >
            <Search size={14} />
            <span className="flex-1 truncate">Search</span>
            <kbd className="hidden rounded border border-[var(--border)] bg-white/[0.04] px-1.5 py-0.5 font-mono text-[10px] text-[var(--text-muted)] sm:inline">
              ⌘K
            </kbd>
          </button>
          <button
            type="button"
            className="icon-btn"
            title="New note"
            onClick={() => createNote(null, "Untitled")}
          >
            <FilePlus size={16} />
          </button>
          <button
            type="button"
            className="icon-btn"
            title="New folder"
            onClick={() => createFolder(null)}
          >
            <FolderPlus size={16} />
          </button>
        </div>

        <div className="mt-2 flex items-center justify-between px-4 pb-1">
          <span className="text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--text-muted)]">
            Files
          </span>
          <button
            type="button"
            className="icon-btn h-6 w-6"
            onClick={() => setLeftOpen(false)}
            title="Collapse sidebar"
          >
            <PanelLeftClose size={14} />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          <FileTree />
        </div>
      </aside>
    </>
  );
}
