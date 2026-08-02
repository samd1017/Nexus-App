import { useEffect, useRef } from "react";
import { useVaultStore } from "@/lib/vault/store";
import { preferCleanWrite } from "@/lib/markdown/purity";

interface Props {
  noteId: string;
  content: string;
}

/** Raw Markdown source — writes only when text actually changes */
export function SourceEditor({ noteId, content }: Props) {
  const updateNoteContent = useVaultStore((s) => s.updateNoteContent);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const ref = useRef<HTMLTextAreaElement>(null);
  const lastId = useRef(noteId);

  useEffect(() => {
    if (!ref.current) return;
    const switched = lastId.current !== noteId;
    lastId.current = noteId;
    if (switched || document.activeElement !== ref.current) {
      ref.current.value = content;
    }
  }, [noteId, content]);

  return (
    <div className="fade-in h-full min-h-0 overflow-y-auto px-6 py-4 md:px-10 md:py-6">
      <div className="mx-auto max-w-[720px]">
        <textarea
          ref={ref}
          className="source-editor"
          defaultValue={content}
          spellCheck={false}
          onChange={(e) => {
            const val = e.target.value;
            if (timer.current) clearTimeout(timer.current);
            timer.current = setTimeout(() => {
              const prev =
                useVaultStore.getState().nodes[noteId]?.content ?? "";
              const next = preferCleanWrite(prev, val);
              if (next !== prev) updateNoteContent(noteId, next);
            }, 220);
          }}
          aria-label="Markdown source"
        />
      </div>
    </div>
  );
}
