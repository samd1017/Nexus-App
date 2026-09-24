import { useMemo, useState } from "react";
import { History, RotateCcw } from "lucide-react";
import { useVaultStore } from "@/lib/vault/store";
import { listNoteRevisions } from "@/lib/vault/note-history";
import { EmptyState } from "@/components/ui/EmptyState";
import { formatRelativeTime } from "@/lib/utils";
import { noteTitle } from "@/lib/vault/types";

export function HistoryRail() {
  const activeNoteId = useVaultStore((s) => s.activeNoteId);
  const nodes = useVaultStore((s) => s.nodes);
  const dirty = useVaultStore((s) => s.dirtyNoteIds);
  const restoreNoteRevision = useVaultStore((s) => s.restoreNoteRevision);
  const [selected, setSelected] = useState<string | null>(null);
  const note = activeNoteId ? nodes[activeNoteId] : null;
  const revisions = useMemo(
    () => (activeNoteId ? listNoteRevisions(activeNoteId) : []),
    // dirty + mtime so the list refreshes after edits
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [activeNoteId, note?.mtime, dirty.join(",")],
  );
  const current = selected
    ? revisions.find((r) => r.id === selected)
    : revisions[0] ?? null;

  if (!note || note.kind !== "note") {
    return (
      <EmptyState
        icon={<History size={22} />}
        status="note"
        title="No note selected"
        description="Open a note. Enter starts a note in the list."
        compact
      />
    );
  }

  if (!revisions.length) {
    return (
      <EmptyState
        icon={<History size={22} />}
        status="history"
        title="No versions yet"
        description={`Edit ${noteTitle(note)} and Nexus keeps a snapshot of the previous text. Soft-deleted notes still restore from Pulse.`}
        compact
      />
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <ul className="min-h-0 flex-1 space-y-0.5 overflow-auto px-2 py-2">
        {revisions.map((r) => (
          <li key={r.id}>
            <button
              type="button"
              className={`flex w-full flex-col rounded-[10px] px-2 py-1.5 text-left hover:bg-white/[0.04] ${
                current?.id === r.id ? "bg-white/[0.05]" : ""
              }`}
              onClick={() => setSelected(r.id)}
            >
              <span className="text-[12.5px] text-[var(--text-primary)]">
                {formatRelativeTime(r.at)}
              </span>
              <span className="truncate font-mono text-[10px] text-[var(--text-muted)]">
                {r.content.split("\n")[0]?.slice(0, 72) || "(empty)"}
              </span>
            </button>
          </li>
        ))}
      </ul>
      {current ? (
        <div className="shrink-0 border-t border-[var(--border)] px-3 py-2">
          <pre className="max-h-40 overflow-auto whitespace-pre-wrap font-mono text-[11px] leading-relaxed text-[var(--text-secondary)]">
            {current.content.slice(0, 1200)}
            {current.content.length > 1200 ? "…" : ""}
          </pre>
          <button
            type="button"
            className="mt-2 inline-flex items-center gap-1.5 text-[12px] text-[var(--accent)] hover:underline"
            onClick={() => restoreNoteRevision(note.id, current.id)}
          >
            <RotateCcw size={13} />
            Restore this version
          </button>
        </div>
      ) : null}
    </div>
  );
}
