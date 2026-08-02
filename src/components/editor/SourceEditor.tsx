import { useEffect, useRef, useState } from "react";
import { useVaultStore } from "@/lib/vault/store";
import { preferCleanWrite } from "@/lib/markdown/purity";
import { registerSourceFlush } from "@/lib/editor/flush";

interface Props {
  noteId: string;
  content: string;
}

/**
 * Source view of the same note. Always seeds from the latest store content so
 * Visual → Source never opens on an empty/stale buffer.
 */
export function SourceEditor({ noteId, content }: Props) {
  const updateNoteContent = useVaultStore((s) => s.updateNoteContent);

  // Prefer live store value at mount (post-flush), fall back to prop
  const seed =
    useVaultStore.getState().nodes[noteId]?.content ?? content ?? "";

  const [value, setValue] = useState(seed);
  const valueRef = useRef(seed);
  const noteIdRef = useRef(noteId);
  const dirtyRef = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  noteIdRef.current = noteId;

  // Keep in sync with store/prop when not mid-edit
  useEffect(() => {
    const live =
      useVaultStore.getState().nodes[noteId]?.content ?? content ?? "";
    if (dirtyRef.current) return;
    if (live === valueRef.current) return;
    setValue(live);
    valueRef.current = live;
  }, [noteId, content]);

  useEffect(() => {
    const flushNow = () => {
      if (timer.current) {
        clearTimeout(timer.current);
        timer.current = null;
      }
      const id = noteIdRef.current;
      const val = valueRef.current;
      dirtyRef.current = false;
      const prev = useVaultStore.getState().nodes[id]?.content ?? "";
      const next = preferCleanWrite(prev, val);
      if (next !== prev) updateNoteContent(id, next);
    };

    registerSourceFlush(flushNow);
    return () => {
      flushNow();
      registerSourceFlush(null);
      if (timer.current) {
        clearTimeout(timer.current);
        timer.current = null;
      }
    };
  }, [updateNoteContent, noteId]);

  return (
    <div
      className="fade-in flex h-full min-h-0 flex-col overflow-hidden px-6 py-4 md:px-10 md:py-6"
      data-note-id={noteId}
    >
      <div className="mx-auto flex min-h-0 w-full max-w-[720px] flex-1 flex-col">
        <textarea
          className="source-editor min-h-[50vh] w-full flex-1"
          value={value}
          spellCheck={false}
          onChange={(e) => {
            const val = e.target.value;
            dirtyRef.current = true;
            setValue(val);
            valueRef.current = val;
            if (timer.current) clearTimeout(timer.current);
            timer.current = setTimeout(() => {
              const id = noteIdRef.current;
              const prev = useVaultStore.getState().nodes[id]?.content ?? "";
              const next = preferCleanWrite(prev, val);
              dirtyRef.current = false;
              if (next !== prev) updateNoteContent(id, next);
            }, 200);
          }}
          aria-label="Markdown source"
        />
      </div>
    </div>
  );
}
