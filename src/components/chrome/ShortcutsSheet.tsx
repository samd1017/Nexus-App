import { useEffect, useState } from "react";
import { X, Keyboard } from "lucide-react";
import { formatShortcut, isAppleModPlatform } from "@/lib/platform";
import { cn } from "@/lib/utils";

type Row = { keys: string; action: string };

function modShift(letter: string): string {
  return formatShortcut(letter, { shift: true });
}

function historyChord(): string {
  return isAppleModPlatform() ? "⌘[ / ⌘]" : "Ctrl+[ / Ctrl+]";
}

const GROUPS: { title: string; rows: Row[] }[] = [
  {
    title: "Navigate",
    rows: [
      { keys: formatShortcut("K"), action: "Search / command palette" },
      { keys: formatShortcut("G"), action: "Toggle graph fullscreen" },
      { keys: formatShortcut("E"), action: "Toggle Visual ↔ Source" },
      { keys: historyChord(), action: "Back / forward in note history" },
    ],
  },
  {
    title: "Write",
    rows: [
      { keys: formatShortcut("S"), action: "Save now" },
      { keys: formatShortcut("N"), action: "New note" },
      { keys: modShift("D"), action: "Today’s daily note" },
      { keys: "[[", action: "Insert / suggest a wikilink" },
    ],
  },
  {
    title: "App",
    rows: [
      { keys: formatShortcut(","), action: "Settings" },
      { keys: formatShortcut("."), action: "Focus mode" },
      { keys: "?", action: "This shortcuts sheet" },
      { keys: "Esc", action: "Close overlay / exit graph" },
    ],
  },
];

function isTypingTarget(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  const tag = el.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  if (el.isContentEditable) return true;
  return Boolean(
    el.closest("[contenteditable='true'], .ProseMirror, .source-editor"),
  );
}

/** Global shortcuts cheat sheet. Toggle with `?` when not typing in an editor. */
export function ShortcutsSheet() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat || e.isComposing || e.defaultPrevented) return;
      if (e.key === "Escape" && open) {
        e.preventDefault();
        setOpen(false);
        return;
      }
      const isQuestion =
        e.key === "?" || (e.shiftKey && (e.key === "/" || e.code === "Slash"));
      if (!isQuestion || e.metaKey || e.ctrlKey || e.altKey) return;
      if (isTypingTarget(e.target)) return;
      e.preventDefault();
      setOpen((v) => !v);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  useEffect(() => {
    const onOpen = () => setOpen(true);
    window.addEventListener("nexus:open-shortcuts", onOpen);
    return () => window.removeEventListener("nexus:open-shortcuts", onOpen);
  }, []);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[110] flex items-end justify-center bg-[var(--overlay,rgba(0,0,0,0.65))] px-0 backdrop-blur-[8px] sm:items-center sm:px-4"
      onClick={() => setOpen(false)}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Keyboard shortcuts"
        className="glass-elevated max-h-[min(92dvh,640px)] w-full max-w-lg overflow-hidden rounded-t-[16px] shadow-[var(--shadow-elevated)] sm:rounded-[16px]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2.5 border-b border-[var(--border)] px-4 py-3">
          <Keyboard size={16} className="text-[var(--accent)]" />
          <h2 className="flex-1 text-[14px] font-semibold text-[var(--text-primary)]">
            Keyboard shortcuts
          </h2>
          <kbd className="hidden rounded-md border border-[var(--border)] bg-white/[0.03] px-1.5 py-0.5 font-mono text-[10px] text-[var(--text-muted)] sm:inline">
            ?
          </kbd>
          <button
            type="button"
            className="icon-btn h-8 w-8"
            aria-label="Close"
            onClick={() => setOpen(false)}
          >
            <X size={15} />
          </button>
        </div>
        <div className="overflow-y-auto p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
          <div className="grid gap-5">
            {GROUPS.map((g) => (
              <div key={g.title}>
                <div className="mb-2 text-[11px] font-medium uppercase tracking-wide text-[var(--text-muted)]">
                  {g.title}
                </div>
                <ul className="space-y-1">
                  {g.rows.map((r) => (
                    <li
                      key={r.action}
                      className="flex items-center justify-between gap-3 rounded-lg px-1 py-1.5"
                    >
                      <span className="text-[13px] text-[var(--text-secondary)]">
                        {r.action}
                      </span>
                      <kbd
                        className={cn(
                          "shrink-0 rounded-md border border-[var(--border)] bg-white/[0.03] px-2 py-0.5",
                          "font-mono text-[11px] text-[var(--text-primary)]",
                        )}
                      >
                        {r.keys}
                      </kbd>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
