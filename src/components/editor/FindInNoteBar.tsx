import { useEffect, useRef, useState } from "react";
import { ChevronDown, ChevronUp, Replace, Search, X } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  getActiveFindAdapter,
  setFindFocusPane,
  type FindMatch,
} from "@/lib/editor/find-target";
import { formatShortcut } from "@/lib/platform";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Seed when opening from selection */
  seedQuery?: string;
  /** Start with the replace field visible (⌘H). */
  replaceMode?: boolean;
  pane?: "primary" | "secondary";
};

/**
 * Obsidian-style find / replace in the current note.
 * Ctrl/⌘F find; Ctrl/⌘H replace; Enter / F3 next; Shift+Enter prev; Esc closes.
 */
export function FindInNoteBar({
  open,
  onOpenChange,
  seedQuery = "",
  replaceMode = false,
  pane = "primary",
}: Props) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const replaceRef = useRef<HTMLInputElement | null>(null);
  const [query, setQuery] = useState(seedQuery);
  const [replace, setReplace] = useState("");
  const [showReplace, setShowReplace] = useState(replaceMode);
  const [matches, setMatches] = useState<FindMatch[]>([]);
  const [index, setIndex] = useState(0);
  const queryRef = useRef(query);
  const replaceRefVal = useRef(replace);
  const matchesRef = useRef(matches);
  const indexRef = useRef(index);
  queryRef.current = query;
  replaceRefVal.current = replace;
  matchesRef.current = matches;
  indexRef.current = index;

  useEffect(() => {
    if (!open) {
      getActiveFindAdapter(pane)?.clear();
      return;
    }
    setQuery(seedQuery);
    setShowReplace(replaceMode);
    const t = window.setTimeout(() => {
      if (replaceMode) {
        replaceRef.current?.focus();
        if (!seedQuery) inputRef.current?.focus();
        else replaceRef.current?.select();
      } else {
        inputRef.current?.focus();
        inputRef.current?.select();
      }
    }, 20);
    return () => window.clearTimeout(t);
  }, [open, seedQuery, replaceMode, pane]);

  useEffect(() => {
    if (!open) {
      getActiveFindAdapter(pane)?.clear();
      return;
    }

    let cancelled = false;
    let tries = 0;

    const run = () => {
      if (cancelled) return;
      const adapter = getActiveFindAdapter(pane);
      if (!adapter) {
        setMatches([]);
        setIndex(0);
        if (tries++ < 20) {
          window.setTimeout(run, 50);
        }
        return;
      }
      const next = adapter.findAll(query);
      if (cancelled) return;
      setMatches(next);
      const nextIndex = 0;
      setIndex(nextIndex);
      if (next.length) {
        adapter.reveal(next[nextIndex]!, nextIndex, next.length);
      } else {
        adapter.clear();
      }
    };

    run();
    return () => {
      cancelled = true;
    };
  }, [open, query, pane]);

  const revealAt = (i: number) => {
    const list = matchesRef.current;
    if (!list.length) return;
    const wrapped = ((i % list.length) + list.length) % list.length;
    setIndex(wrapped);
    getActiveFindAdapter(pane)?.reveal(list[wrapped]!, wrapped, list.length);
  };

  const goNext = () => revealAt(indexRef.current + 1);
  const goPrev = () => revealAt(indexRef.current - 1);

  const rescan = (preferIndex: number) => {
    const adapter = getActiveFindAdapter(pane);
    if (!adapter) return;
    const next = adapter.findAll(queryRef.current);
    setMatches(next);
    if (!next.length) {
      setIndex(0);
      adapter.clear();
      return;
    }
    const wrapped = Math.min(Math.max(0, preferIndex), next.length - 1);
    setIndex(wrapped);
    adapter.reveal(next[wrapped]!, wrapped, next.length);
  };

  const doReplace = () => {
    const adapter = getActiveFindAdapter(pane);
    const list = matchesRef.current;
    const i = indexRef.current;
    const match = list[i];
    if (!adapter?.replace || !match) return;
    const ok = adapter.replace(match, replaceRefVal.current);
    if (ok) rescan(i);
  };

  const doReplaceAll = () => {
    const adapter = getActiveFindAdapter(pane);
    if (!adapter?.replaceAll || !queryRef.current.trim()) return;
    adapter.replaceAll(queryRef.current, replaceRefVal.current);
    rescan(0);
  };

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        onOpenChange(false);
        return;
      }
      if (e.key === "Enter") {
        const t = e.target as HTMLElement | null;
        if (t?.dataset?.findReplace === "1") {
          e.preventDefault();
          if (e.shiftKey) doReplaceAll();
          else doReplace();
          return;
        }
        e.preventDefault();
        if (e.shiftKey) goPrev();
        else goNext();
        return;
      }
      if (e.key === "F3") {
        e.preventDefault();
        if (e.shiftKey) goPrev();
        else goNext();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [open, onOpenChange]);

  if (!open) return null;

  const countLabel =
    !query.trim()
      ? ""
      : matches.length === 0
        ? "No results"
        : `${index + 1} of ${matches.length}`;

  const canReplace = Boolean(
    matches.length && getActiveFindAdapter(pane)?.replace,
  );

  return (
    <div
      className="find-in-note-bar flex shrink-0 flex-col gap-1.5 border-b border-[var(--border)] bg-[color-mix(in_srgb,var(--bg-primary)_92%,transparent)] px-3 py-1.5 backdrop-blur-md"
      role="search"
      aria-label={showReplace ? "Find and replace in note" : "Find in note"}
      data-find-open="1"
      data-find-pane={pane}
      onFocusCapture={() => setFindFocusPane(pane)}
    >
      <div className="flex items-center gap-2">
        <Search size={14} className="shrink-0 text-[var(--accent)]" aria-hidden />
        <input
          ref={inputRef}
          type="search"
          className="find-in-note-input min-w-0 flex-1 bg-transparent text-[13px] text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)]"
          placeholder={`Find in note (${formatShortcut("F")})`}
          value={query}
          spellCheck={false}
          autoComplete="off"
          onChange={(e) => setQuery(e.target.value)}
        />
        <span
          className={cn(
            "shrink-0 text-[11px] tabular-nums tracking-wide",
            matches.length === 0 && query.trim()
              ? "text-[#ff8a84]"
              : "text-[var(--text-muted)]",
          )}
          aria-live="polite"
        >
          {countLabel}
        </span>
        <button
          type="button"
          className="icon-btn"
          title="Previous match"
          aria-label="Previous match"
          disabled={!matches.length}
          onClick={goPrev}
        >
          <ChevronUp size={15} />
        </button>
        <button
          type="button"
          className="icon-btn"
          title="Next match"
          aria-label="Next match"
          disabled={!matches.length}
          onClick={goNext}
        >
          <ChevronDown size={15} />
        </button>
        <button
          type="button"
          className={cn("icon-btn", showReplace && "text-[var(--accent)]")}
          title={`Replace (${formatShortcut("H")})`}
          aria-label="Toggle replace"
          aria-pressed={showReplace}
          onClick={() => {
            setShowReplace((v) => {
              const next = !v;
              if (next) {
                window.setTimeout(() => replaceRef.current?.focus(), 20);
              }
              return next;
            });
          }}
        >
          <Replace size={15} />
        </button>
        <button
          type="button"
          className="icon-btn"
          title="Close find"
          aria-label="Close find"
          onClick={() => onOpenChange(false)}
        >
          <X size={15} />
        </button>
      </div>
      {showReplace ? (
        <div className="flex items-center gap-2 pl-[22px]">
          <input
            ref={replaceRef}
            type="text"
            data-find-replace="1"
            className="find-in-note-input min-w-0 flex-1 bg-transparent text-[13px] text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)]"
            placeholder="Replace with"
            value={replace}
            spellCheck={false}
            autoComplete="off"
            onChange={(e) => setReplace(e.target.value)}
          />
          <button
            type="button"
            className="chip-btn !h-7 px-2 text-[11px]"
            disabled={!canReplace}
            onClick={doReplace}
          >
            Replace
          </button>
          <button
            type="button"
            className="chip-btn !h-7 px-2 text-[11px]"
            disabled={!canReplace}
            onClick={doReplaceAll}
          >
            All
          </button>
        </div>
      ) : null}
    </div>
  );
}

/** Open find-in-note from anywhere (keyboard / chrome). */
export function openFindInNote(
  seed = "",
  opts?: { replace?: boolean },
): void {
  window.dispatchEvent(
    new CustomEvent("nexus:find-open", {
      detail: { seed: seed.slice(0, 120), replace: Boolean(opts?.replace) },
    }),
  );
}

export function closeFindInNote(): void {
  window.dispatchEvent(new CustomEvent("nexus:find-close"));
}
