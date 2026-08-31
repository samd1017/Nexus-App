import { useEffect, useRef, useState } from "react";
import { Check, Loader2, Save } from "lucide-react";
import { useVaultStore } from "@/lib/vault/store";
import { formatShortcut } from "@/lib/platform";

/**
 * Editor-local save affordance: dirty → click to save, Saving…, brief Saved flash.
 * Idle calm state lives in the title bar only (one chip, no duplicates).
 */
export function EditorSaveChip() {
  const mode = useVaultStore((s) => s.mode);
  const dirtyCount = useVaultStore((s) => s.dirtyNoteIds.length);
  const activeNoteId = useVaultStore((s) => s.activeNoteId);
  const isActiveDirty = useVaultStore((s) =>
    s.activeNoteId ? s.dirtyNoteIds.includes(s.activeNoteId) : false,
  );
  const flushDirty = useVaultStore((s) => s.flushDirty);
  const lastSavedAt = useVaultStore((s) => s.lastSavedAt as number | null);
  const [saving, setSaving] = useState(false);
  const [flashSaved, setFlashSaved] = useState(false);
  const prevDirty = useRef(dirtyCount);

  useEffect(() => {
    if (prevDirty.current > 0 && dirtyCount === 0) {
      setFlashSaved(true);
      const t = window.setTimeout(() => setFlashSaved(false), 1800);
      prevDirty.current = dirtyCount;
      return () => window.clearTimeout(t);
    }
    prevDirty.current = dirtyCount;
  }, [dirtyCount]);

  useEffect(() => {
    if (!lastSavedAt) return;
    setFlashSaved(true);
    const t = window.setTimeout(() => setFlashSaved(false), 1800);
    return () => window.clearTimeout(t);
  }, [lastSavedAt]);

  useEffect(() => {
    setFlashSaved(false);
  }, [activeNoteId]);

  const onSave = async () => {
    if (saving || dirtyCount === 0) return;
    setSaving(true);
    try {
      await flushDirty();
    } finally {
      setSaving(false);
    }
  };

  if (saving) {
    return (
      <span
        className="inline-flex items-center gap-1.5 rounded-full border border-[rgba(0,200,255,0.28)] bg-[rgba(0,200,255,0.08)] px-2.5 py-0.5 text-[11px] font-medium text-[var(--accent)]"
        role="status"
      >
        <Loader2 size={11} className="animate-spin" />
        Saving…
      </span>
    );
  }

  if (isActiveDirty || dirtyCount > 0) {
    return (
      <button
        type="button"
        className="inline-flex items-center gap-1.5 rounded-full border border-[rgba(255,159,10,0.4)] bg-[rgba(255,159,10,0.12)] px-2.5 py-0.5 text-[11px] font-medium text-[var(--warning)] transition-colors hover:bg-[rgba(255,159,10,0.2)]"
        title={`Save now (${formatShortcut("S")})`}
        aria-label={
          dirtyCount > 1
            ? `Save ${dirtyCount} unsaved notes`
            : "Save unsaved changes"
        }
        onClick={() => void onSave()}
      >
        <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-[var(--warning)]" />
        {dirtyCount > 1 ? `Unsaved · ${dirtyCount}` : "Unsaved"}
        <Save size={11} className="opacity-80" />
      </button>
    );
  }

  // Brief confirmation only — idle "Saved" / "In memory" is title-bar SSOT
  if (flashSaved) {
    return (
      <span
        className="inline-flex items-center gap-1 rounded-full border border-[rgba(48,209,88,0.35)] bg-[rgba(48,209,88,0.1)] px-2.5 py-0.5 text-[11px] text-[var(--success)]"
        title={
          mode === "demo"
            ? "Demo changes stay in this browser session"
            : `Saved · ${formatShortcut("S")}`
        }
        role="status"
      >
        <Check size={11} />
        {mode === "demo" ? "Saved in session" : "Saved"}
      </span>
    );
  }

  return null;
}
