import { useEffect, useState } from "react";
import { useVaultStore, getNoteDisplayTitle } from "@/lib/vault/store";

/** Controlled title field — renames the file and keeps the leading # heading in sync. */
export function NoteTitleInput({ noteId }: { noteId: string }) {
  const note = useVaultStore((s) => s.nodes[noteId]);
  const renameNode = useVaultStore((s) => s.renameNode);
  const display = note ? getNoteDisplayTitle(note) : "";
  const [value, setValue] = useState(display);

  // Sync when switching notes or external rename
  useEffect(() => {
    setValue(display);
  }, [noteId, display]);

  if (!note || note.kind !== "note") return null;

  const commit = () => {
    const next = value.trim();
    if (!next) {
      setValue(display);
      return;
    }
    if (next !== display) {
      renameNode(noteId, next);
    }
  };

  return (
    <input
      className="w-full bg-transparent text-[15px] font-semibold tracking-tight text-[var(--text-primary)] outline-none titlebar-no-drag"
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          (e.target as HTMLInputElement).blur();
        }
        if (e.key === "Escape") {
          setValue(display);
          (e.target as HTMLInputElement).blur();
        }
      }}
      aria-label="Note title"
      placeholder="Untitled"
    />
  );
}
