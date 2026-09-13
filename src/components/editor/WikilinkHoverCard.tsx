import { useEffect, useState } from "react";
import { useVaultStore } from "@/lib/vault/store";
import { noteTitle } from "@/lib/vault/types";
import { resolveWikilink } from "@/lib/graph/build-graph";
import { previewSnippet } from "@/lib/markdown/serialize";
import { shouldSkipBackgroundBodyHydrate } from "@/lib/vault/fill-interaction";

type Props = {
  target: string;
  x: number;
  y: number;
};

export function WikilinkHoverCard({ target, x, y }: Props) {
  const nodes = useVaultStore((s) => s.nodes);
  const ensureNoteBody = useVaultStore((s) => s.ensureNoteBody);
  const indexFillBusy = useVaultStore((s) => s.indexFillBusy);
  const hit = resolveWikilink(target, nodes);
  const note = hit?.kind === "note" ? hit : null;
  const [body, setBody] = useState(note?.content ?? "");

  useEffect(() => {
    if (!note) {
      setBody("");
      return;
    }
    if (note.content != null) {
      setBody(note.content);
      return;
    }
    if (shouldSkipBackgroundBodyHydrate({ fillBusy: indexFillBusy })) {
      setBody("");
      return;
    }
    let cancelled = false;
    void ensureNoteBody(note.id).then((md: string | null) => {
      if (!cancelled) setBody(md ?? "");
    });
    return () => {
      cancelled = true;
    };
  }, [note, ensureNoteBody, indexFillBusy]);

  const left = Math.min(Math.max(8, x + 12), window.innerWidth - 360);
  const top = Math.min(Math.max(8, y + 16), window.innerHeight - 220);

  return (
    <div className="nexus-wikilink-hover" style={{ left, top }} role="tooltip">
      {note ? (
        <>
          <p className="mb-1 truncate text-[13px] font-semibold">{noteTitle(note)}</p>
          <p className="mb-2 truncate font-mono text-[10px] text-[var(--text-muted)]">{note.path}</p>
          <p className="line-clamp-6 text-[12px] leading-relaxed text-[var(--text-secondary)]">
            {previewSnippet(body, 320) || "Empty note"}
          </p>
        </>
      ) : (
        <p className="text-[12px] text-[var(--text-muted)]">Missing [[{target}]]</p>
      )}
    </div>
  );
}
