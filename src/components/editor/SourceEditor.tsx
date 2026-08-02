import { useEffect, useRef } from "react";
import { useVaultStore } from "@/lib/vault/store";
import { preferCleanWrite } from "@/lib/markdown/serialize";

interface Props {
  noteId: string;
  content: string;
}

export function SourceEditor({ noteId, content }: Props) {
  const updateNoteContent = useVaultStore((s) => s.updateNoteContent);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const ref = useRef<HTMLTextAreaElement>(null);
  const lastId = useRef(noteId);

  useEffect(() => {
    if (!ref.current) return;
    if (lastId.current !== noteId || ref.current.value !== content) {
      // only overwrite if note switched or external change
      if (lastId.current !== noteId || document.activeElement !== ref.current) {
        ref.current.value = content;
      }
    }
    lastId.current = noteId;
  }, [noteId, content]);

  return (
    <div className="h-full min-h-0 overflow-y-auto px-6 py-4 md:px-10 md:py-6">
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
              const prev = useVaultStore.getState().nodes[noteId]?.content ?? "";
              updateNoteContent(noteId, preferCleanWrite(prev, val));
            }, 250);
          }}
          aria-label="Markdown source"
        />
      </div>
    </div>
  );
}
