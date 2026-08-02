import { useEffect, useMemo, useState } from "react";
import { Command } from "cmdk";
import {
  FileText,
  FolderOpen,
  Network,
  Code2,
  Eye,
  FilePlus,
  Radio,
  Search,
} from "lucide-react";
import { useVaultStore } from "@/lib/vault/store";
import { searchVault } from "@/lib/search/fuse-search";
import { cn } from "@/lib/utils";

export function CommandPalette() {
  const open = useVaultStore((s) => s.commandOpen);
  const setCommandOpen = useVaultStore((s) => s.setCommandOpen);
  const nodes = useVaultStore((s) => s.nodes);
  const setActiveNote = useVaultStore((s) => s.setActiveNote);
  const createNote = useVaultStore((s) => s.createNote);
  const toggleEditorMode = useVaultStore((s) => s.toggleEditorMode);
  const toggleGraphFullscreen = useVaultStore((s) => s.toggleGraphFullscreen);
  const openDemoVault = useVaultStore((s) => s.openDemoVault);
  const simulateHermesWrite = useVaultStore((s) => s.simulateHermesWrite);
  const editorMode = useVaultStore((s) => s.settings.editorMode);
  const [query, setQuery] = useState("");

  useEffect(() => {
    if (!open) setQuery("");
  }, [open]);

  const hits = useMemo(() => searchVault(nodes, query, 12), [nodes, query]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-start justify-center bg-black/55 px-4 pt-[12vh] backdrop-blur-sm"
      onClick={() => setCommandOpen(false)}
    >
      <Command
        className="glass-elevated w-full max-w-xl overflow-hidden rounded-[16px]"
        onClick={(e) => e.stopPropagation()}
        label="Global search"
        shouldFilter={false}
      >
        <div className="flex items-center gap-2 border-b border-[var(--border)] px-4">
          <Search size={16} className="text-[var(--accent)]" />
          <Command.Input
            value={query}
            onValueChange={setQuery}
            placeholder="Search notes, paths, content…"
            className="h-12 w-full bg-transparent text-[15px] text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)]"
            autoFocus
          />
          <kbd className="rounded border border-[var(--border)] px-1.5 py-0.5 font-mono text-[10px] text-[var(--text-muted)]">
            ESC
          </kbd>
        </div>

        <Command.List className="max-h-[min(420px,50vh)] overflow-y-auto p-2">
          <Command.Empty className="px-3 py-8 text-center text-[13px] text-[var(--text-muted)]">
            No matching notes.
          </Command.Empty>

          {hits.length > 0 ? (
            <Command.Group heading="Notes" className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-[10px] [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-[0.1em] [&_[cmdk-group-heading]]:text-[var(--text-muted)]">
              {hits.map((h) => (
                <Command.Item
                  key={h.noteId}
                  value={h.noteId + h.title}
                  onSelect={() => {
                    setActiveNote(h.noteId);
                    setCommandOpen(false);
                  }}
                  className={cn(
                    "cmdk-item flex cursor-pointer items-start gap-2.5 rounded-[10px] px-2.5 py-2 text-[13px] text-[var(--text-secondary)] aria-selected:text-[var(--text-primary)]",
                  )}
                >
                  <FileText size={15} className="mt-0.5 shrink-0 text-[var(--accent)]" />
                  <div className="min-w-0">
                    <div className="font-medium text-[var(--text-primary)]">{h.title}</div>
                    <div className="truncate text-[11.5px] text-[var(--text-muted)]">
                      {h.path}
                      {h.snippet ? ` · ${h.snippet}` : ""}
                    </div>
                  </div>
                </Command.Item>
              ))}
            </Command.Group>
          ) : null}

          <Command.Group
            heading="Actions"
            className="mt-1 [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-[10px] [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-[0.1em] [&_[cmdk-group-heading]]:text-[var(--text-muted)]"
          >
            <Action
              icon={<FilePlus size={15} />}
              label="New note"
              onSelect={() => {
                createNote(null);
                setCommandOpen(false);
              }}
            />
            <Action
              icon={editorMode === "visual" ? <Code2 size={15} /> : <Eye size={15} />}
              label={editorMode === "visual" ? "Switch to source mode" : "Switch to visual mode"}
              onSelect={() => {
                toggleEditorMode();
                setCommandOpen(false);
              }}
            />
            <Action
              icon={<Network size={15} />}
              label="Toggle full graph"
              onSelect={() => {
                toggleGraphFullscreen();
                setCommandOpen(false);
              }}
            />
            <Action
              icon={<FolderOpen size={15} />}
              label="Open demo vault"
              onSelect={() => {
                openDemoVault();
                setCommandOpen(false);
              }}
            />
            <Action
              icon={<Radio size={15} />}
              label="Simulate Hermes write"
              onSelect={() => {
                simulateHermesWrite();
                setCommandOpen(false);
              }}
            />
          </Command.Group>
        </Command.List>
      </Command>
    </div>
  );
}

function Action({
  icon,
  label,
  onSelect,
}: {
  icon: React.ReactNode;
  label: string;
  onSelect: () => void;
}) {
  return (
    <Command.Item
      onSelect={onSelect}
      className="cmdk-item flex cursor-pointer items-center gap-2.5 rounded-[10px] px-2.5 py-2 text-[13px] text-[var(--text-secondary)] aria-selected:text-[var(--text-primary)]"
    >
      <span className="text-[var(--text-muted)]">{icon}</span>
      {label}
    </Command.Item>
  );
}
