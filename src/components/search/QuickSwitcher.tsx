import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { setSwitcherOpen, subscribeSwitcher, switcherIsOpen } from "@/lib/search/switcher-session";
import { rankSwitcherNotes, recentSwitcherNotes, type SwitcherNote } from "@/lib/search/quick-switcher";
import { useVaultStore } from "@/lib/vault/store";
import { noteTitle } from "@/lib/vault/types";
import { cn } from "@/lib/utils";

export function QuickSwitcher() {
  const open = useSyncExternalStore(subscribeSwitcher, switcherIsOpen, switcherIsOpen);
  const nodes = useVaultStore((s) => s.nodes);
  const recentIds = useVaultStore((s) => s.recentNoteVisits);
  const setActiveNote = useVaultStore((s) => s.setActiveNote);
  const [query, setQuery] = useState("");
  const [cursor, setCursor] = useState(0);

  useEffect(() => {
    if (!open) return;
    setQuery("");
    setCursor(0);
  }, [open]);

  const catalog = useMemo(() => {
    const out: SwitcherNote[] = [];
    for (const node of Object.values(nodes)) {
      if (node.kind !== "note" || !node.path) continue;
      out.push({ id: node.id, title: noteTitle(node), path: node.path });
    }
    return out;
  }, [nodes]);

  const rows = useMemo(() => {
    const q = query.trim();
    if (!q) return recentSwitcherNotes(catalog, recentIds);
    return rankSwitcherNotes(catalog, q);
  }, [catalog, recentIds, query]);

  useEffect(() => {
    setCursor(0);
  }, [query]);

  if (!open) return null;

  const openRow = (note: SwitcherNote) => {
    const tabs = useVaultStore.getState().primaryTabs ?? [];
    setActiveNote(note.id, { newTab: tabs.length > 0 });
    setSwitcherOpen(false);
  };

  return (
    <div
      className="fixed inset-0 z-[110] flex items-start justify-center bg-[var(--overlay,rgba(0,0,0,0.65))] px-4 pt-[12vh]"
      onMouseDown={() => setSwitcherOpen(false)}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Quick switcher"
        data-testid="quick-switcher"
        className="w-full max-w-xl overflow-hidden rounded-[16px] border border-[var(--border-strong)] bg-[var(--panel-solid)] shadow-[0_28px_90px_rgba(0,0,0,0.55)]"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <input
          autoFocus
          value={query}
          data-testid="quick-switcher-input"
          placeholder="Go to note…"
          className="w-full border-b border-[var(--border)] bg-transparent px-4 py-3 text-[14px] outline-none"
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              e.preventDefault();
              e.stopPropagation();
              setSwitcherOpen(false);
              return;
            }
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setCursor((i) => Math.min(rows.length - 1, i + 1));
              return;
            }
            if (e.key === "ArrowUp") {
              e.preventDefault();
              setCursor((i) => Math.max(0, i - 1));
              return;
            }
            if (e.key === "Enter") {
              e.preventDefault();
              e.stopPropagation();
              const note = rows[cursor] ?? rows[0];
              if (note) openRow(note);
            }
          }}
        />
        <p className="px-4 py-1.5 text-[10px] uppercase tracking-wide text-[var(--text-muted)]">
          {query.trim() ? "Notes" : "Recent"}
        </p>
        <ul className="max-h-80 overflow-y-auto pb-2">
          {rows.length === 0 ? (
            <li className="px-4 py-3 text-[12px] text-[var(--text-muted)]">No notes match.</li>
          ) : (
            rows.map((note, index) => (
              <li key={note.id}>
                <button
                  type="button"
                  data-testid="quick-switcher-row"
                  data-note-id={note.id}
                  data-selected={index === cursor ? "1" : "0"}
                  className={cn(
                    "flex w-full flex-col items-start px-4 py-1.5 text-left",
                    index === cursor ? "bg-[color-mix(in_srgb,var(--accent)_16%,transparent)]" : "hover:bg-white/[0.04]",
                  )}
                  onMouseEnter={() => setCursor(index)}
                  onClick={() => openRow(note)}
                >
                  <span className="truncate text-[13px] font-medium">{note.title}</span>
                  <span className="truncate text-[11px] text-[var(--text-muted)]">{note.path}</span>
                </button>
              </li>
            ))
          )}
        </ul>
      </div>
    </div>
  );
}
