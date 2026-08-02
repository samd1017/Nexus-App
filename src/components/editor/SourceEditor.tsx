import { useEffect, useRef, useState } from "react";
import { useVaultStore } from "@/lib/vault/store";
import { preferCleanWrite } from "@/lib/markdown/purity";
import { registerSourceFlush } from "@/lib/editor/flush";

interface Props {
  noteId: string;
  content: string;
}

/**
 * Source editor — controlled from store so mode switches never show stale text.
 * Flushes immediately on unmount / mode switch.
 */
export function SourceEditor({ noteId, content }: Props) {
  const updateNoteContent = useVaultStore((s) => s.updateNoteContent);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [value, setValue] = useState(content);
  const valueRef = useRef(value);
  const noteIdRef = useRef(noteId);
  const dirtyRef = useRef(false);
  valueRef.current = value;
  noteIdRef.current = noteId;

  // Sync from store when note changes or external update (Hermes)
  useEffect(() => {
    if (dirtyRef.current && noteIdRef.current === noteId) {
      // Local typing in progress — only accept external if content clearly different path
      // After flush dirty is false, so store content wins
    }
    if (!dirtyRef.current) {
      setValue(content);
      valueRef.current = content;
    } else {
      // If store advanced with our own write, clear dirty
      if (content === valueRef.current || content === preferCleanWrite(content, valueRef.current)) {
        // keep
      }
      // Accept store if it matches fingerprint of local (already saved)
      setValue(content);
      valueRef.current = content;
      dirtyRef.current = false;
    }
  }, [noteId, content]);

  function flushNow() {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    const id = noteIdRef.current;
    const val = valueRef.current;
    const prev = useVaultStore.getState().nodes[id]?.content ?? "";
    const next = preferCleanWrite(prev, val);
    dirtyRef.current = false;
    if (next !== prev) updateNoteContent(id, next);
  }

  useEffect(() => {
    registerSourceFlush(() => flushNow());
    return () => {
      flushNow();
      registerSourceFlush(null);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [noteId]);

  return (
    <div className="fade-in h-full min-h-0 overflow-y-auto px-6 py-4 md:px-10 md:py-6">
      <div className="mx-auto max-w-[720px]">
        <textarea
          className="source-editor"
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
              const prev =
                useVaultStore.getState().nodes[id]?.content ?? "";
              const next = preferCleanWrite(prev, val);
              dirtyRef.current = false;
              if (next !== prev) updateNoteContent(id, next);
            }, 220);
          }}
          aria-label="Markdown source"
        />
      </div>
    </div>
  );
}
