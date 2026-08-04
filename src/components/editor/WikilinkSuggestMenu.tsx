import { useEffect, useRef } from "react";
import { FilePlus2, FileText, Folder } from "lucide-react";
import { cn } from "@/lib/utils";
import type { WikilinkSuggestItem } from "@/lib/editor/wikilink-suggest";

type Props = {
  open: boolean;
  items: WikilinkSuggestItem[];
  selected: number;
  query: string;
  rect: { left: number; top: number; bottom: number };
  onSelect: (item: WikilinkSuggestItem) => void;
  onHover: (index: number) => void;
  onClose: () => void;
  /** Create a new note from the current query when there are no matches. */
  onCreate?: (title: string) => void;
};

/** Floating autocomplete for [[wikilinks]] — notes + folders, scrollable. */
export function WikilinkSuggestMenu({
  open,
  items,
  selected,
  query,
  rect,
  onSelect,
  onHover,
  onClose,
  onCreate,
}: Props) {
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const el = listRef.current?.querySelector<HTMLElement>(
      `[data-idx="${selected}"]`,
    );
    el?.scrollIntoView({ block: "nearest" });
  }, [selected, open]);

  if (!open) return null;

  const maxH = 280;
  const spaceBelow = window.innerHeight - rect.bottom - 12;
  const placeAbove = spaceBelow < 160 && rect.top > 200;
  const top = placeAbove
    ? Math.max(8, rect.top - maxH - 6)
    : Math.min(rect.bottom + 6, window.innerHeight - 120);
  const left = Math.min(Math.max(8, rect.left), window.innerWidth - 320);
  const createTitle = query.trim();

  return (
    <div
      className="fixed z-[95] w-[min(320px,calc(100vw-16px))] overflow-hidden rounded-xl border border-[var(--border-strong)] bg-[rgba(12,12,15,0.97)] shadow-[0_20px_60px_rgba(0,0,0,0.55)] backdrop-blur-xl"
      style={{ left, top, maxHeight: maxH }}
      role="listbox"
      aria-label="Link to note or folder"
      onMouseDown={(e) => {
        // Keep editor focus; select on mouseup/click
        e.preventDefault();
      }}
    >
      <div className="flex items-center justify-between border-b border-[var(--border)] px-3 py-2">
        <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--accent)]">
          Link to
        </span>
        <span className="truncate font-mono text-[10px] text-[var(--text-muted)]">
          [[{query || "…"}]]
        </span>
      </div>
      <div
        ref={listRef}
        className="max-h-[232px] overflow-y-auto overscroll-contain p-1"
      >
        {items.length === 0 ? (
          createTitle && onCreate ? (
            <button
              type="button"
              data-idx={0}
              role="option"
              aria-selected
              className="flex w-full items-center gap-2 rounded-lg bg-[rgba(0,200,255,0.12)] px-2.5 py-2 text-left text-[var(--text-primary)] transition-colors hover:bg-[rgba(0,200,255,0.18)]"
              onClick={() => onCreate(createTitle)}
            >
              <FilePlus2 size={14} className="shrink-0 text-[var(--accent)]" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[12.5px] font-medium">
                  Create «{createTitle}»
                </span>
                <span className="block truncate text-[10px] text-[var(--text-muted)]">
                  New note · Enter to create
                </span>
              </span>
            </button>
          ) : (
            <p className="px-2.5 py-3 text-[12.5px] text-[var(--text-muted)]">
              No matches — keep typing or create the note later.
            </p>
          )
        ) : (
          items.map((item, i) => (
            <button
              key={item.id}
              type="button"
              data-idx={i}
              role="option"
              aria-selected={i === selected}
              className={cn(
                "flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left transition-colors",
                i === selected
                  ? "bg-[rgba(0,200,255,0.12)] text-[var(--text-primary)]"
                  : "text-[var(--text-secondary)] hover:bg-white/[0.04] hover:text-[var(--text-primary)]",
              )}
              onMouseEnter={() => onHover(i)}
              onClick={() => onSelect(item)}
            >
              {item.kind === "folder" ? (
                <Folder size={14} className="shrink-0 text-[var(--accent)]" />
              ) : (
                <FileText
                  size={14}
                  className="shrink-0 text-[var(--text-muted)]"
                />
              )}
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[12.5px] font-medium">
                  {item.title}
                </span>
                <span className="block truncate font-mono text-[10px] text-[var(--text-muted)]">
                  {item.path}
                </span>
              </span>
              <span className="shrink-0 text-[9px] uppercase tracking-wide text-[var(--text-muted)]">
                {item.kind}
              </span>
            </button>
          ))
        )}
      </div>
      <div className="border-t border-[var(--border)] px-3 py-1.5 text-[10px] text-[var(--text-muted)]">
        ↑↓ navigate · Enter select · Esc close
        <button
          type="button"
          className="float-right text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
          onClick={onClose}
        >
          Esc
        </button>
      </div>
    </div>
  );
}
