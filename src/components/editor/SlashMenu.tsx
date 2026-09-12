import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";
import type { SlashItem } from "@/lib/editor/slash-commands";

type Props = {
  open: boolean;
  items: SlashItem[];
  selected: number;
  query: string;
  rect: { left: number; top: number; bottom: number };
  onSelect: (item: SlashItem) => void;
  onHover: (index: number) => void;
  onClose: () => void;
};

export function SlashMenu({
  open,
  items,
  selected,
  query,
  rect,
  onSelect,
  onHover,
  onClose,
}: Props) {
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    listRef.current
      ?.querySelector<HTMLElement>(`[data-idx="${selected}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [selected, open]);

  if (!open) return null;

  const top = Math.min(rect.bottom + 6, window.innerHeight - 140);
  const left = Math.min(Math.max(8, rect.left), window.innerWidth - 320);

  return (
    <div
      className="nexus-slash"
      style={{ left, top, maxHeight: 280 }}
      role="listbox"
      aria-label="Insert block"
      onMouseDown={(e) => e.preventDefault()}
    >
      <div className="flex items-center justify-between border-b border-[var(--border)] px-3 py-2">
        <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--accent)]">
          Insert
        </span>
        <span className="font-mono text-[10px] text-[var(--text-muted)]">/{query || "…"}</span>
      </div>
      <div ref={listRef} className="max-h-[220px] overflow-y-auto p-1">
        {items.length === 0 ? (
          <p className="px-2.5 py-3 text-[12px] text-[var(--text-muted)]">No matching commands</p>
        ) : (
          items.map((item, i) => (
            <button
              key={item.id}
              type="button"
              data-idx={i}
              role="option"
              aria-selected={i === selected}
              className={cn(
                "flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left",
                i === selected
                  ? "bg-[rgba(0,200,255,0.12)] text-[var(--text-primary)]"
                  : "text-[var(--text-secondary)] hover:bg-white/[0.04]",
              )}
              onMouseEnter={() => onHover(i)}
              onClick={() => onSelect(item)}
            >
              <span className="min-w-0 flex-1 truncate text-[12.5px] font-medium">{item.label}</span>
              <span className="shrink-0 font-mono text-[10px] text-[var(--text-muted)]">
                {item.hint}
              </span>
            </button>
          ))
        )}
      </div>
      <div className="border-t border-[var(--border)] px-3 py-1.5 text-[10px] text-[var(--text-muted)]">
        ↑↓ Enter · Esc
        <button type="button" className="float-right hover:text-[var(--text-primary)]" onClick={onClose}>
          Esc
        </button>
      </div>
    </div>
  );
}
