import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import {
  CalendarDays,
  FilePlus2,
  FileText,
  FolderKanban,
  Lightbulb,
  Users,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useVaultStore } from "@/lib/vault/store";
import {
  NOTE_TEMPLATES,
  type NoteTemplateId,
} from "@/lib/vault/templates";

const ICONS: Record<NoteTemplateId, ReactNode> = {
  blank: <FileText size={14} />,
  daily: <CalendarDays size={14} />,
  meeting: <Users size={14} />,
  idea: <Lightbulb size={14} />,
  project: <FolderKanban size={14} />,
};

type Props = {
  /** Extra classes on the trigger button */
  className?: string;
  /** Trigger content; default is FilePlus icon */
  children?: ReactNode;
  /** Accessible / hover title */
  title?: string;
  /** Visual style of trigger */
  variant?: "icon" | "primary" | "ghost";
  /** Optional parent folder for created notes */
  parentId?: string | null;
  /** Align dropdown */
  align?: "left" | "right";
};

/**
 * Template chooser for new notes — Blank / Daily / Meeting / Idea / Project.
 * Dark SpaceX chrome popover; web + desktop parity.
 */
export function NewNoteMenu({
  className,
  children,
  title = "New note",
  variant = "icon",
  parentId = null,
  align = "left",
}: Props) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const menuId = useId();
  const createFromTemplate = useVaultStore((s) => s.createFromTemplate);
  const createNote = useVaultStore((s) => s.createNote);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const pick = (id: NoteTemplateId) => {
    setOpen(false);
    if (id === "blank") {
      createNote(parentId, "Untitled");
      return;
    }
    createFromTemplate(id, parentId);
  };

  const triggerClass =
    variant === "primary"
      ? "primary-btn"
      : variant === "ghost"
        ? "ghost-btn"
        : "icon-btn";

  return (
    <div ref={rootRef} className="relative inline-flex">
      <button
        type="button"
        className={cn(triggerClass, className)}
        title={title}
        aria-label={title}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        onClick={() => setOpen((v) => !v)}
      >
        {children ?? <FilePlus2 size={16} />}
      </button>

      {open ? (
        <div
          id={menuId}
          role="menu"
          aria-label="New note template"
          className={cn(
            "glass-elevated absolute top-[calc(100%+6px)] z-[90] min-w-[200px] rounded-[12px] border border-[var(--border)] p-1 shadow-[0_16px_48px_rgba(0,0,0,0.55)]",
            align === "right" ? "right-0" : "left-0",
          )}
        >
          <div className="px-2.5 pb-1 pt-1.5 text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--text-muted)]">
            New note
          </div>
          {NOTE_TEMPLATES.map((t) => (
            <button
              key={t.id}
              type="button"
              role="menuitem"
              onClick={() => pick(t.id)}
              className="flex w-full items-start gap-2.5 rounded-[8px] px-2.5 py-2 text-left transition-colors hover:bg-white/[0.05]"
            >
              <span className="mt-0.5 text-[var(--accent)]">{ICONS[t.id]}</span>
              <span className="min-w-0">
                <span className="block text-[12.5px] font-medium text-[var(--text-primary)]">
                  {t.label}
                </span>
                <span className="block text-[11px] leading-snug text-[var(--text-muted)]">
                  {t.description}
                </span>
              </span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
