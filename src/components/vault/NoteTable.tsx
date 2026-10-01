import { useEffect, useMemo, useState } from "react";
import { X } from "lucide-react";
import { setBasesOpen } from "@/lib/vault/bases-session";
import {
  buildNoteTable,
  filterNoteRows,
  sortNoteRows,
} from "@/lib/vault/note-table";
import { useVaultStore } from "@/lib/vault/store";
import {
  scheduleFillSafeHydrate,
  shouldSkipBackgroundBodyHydrate,
} from "@/lib/vault/fill-interaction";
import { cn } from "@/lib/utils";

const VIEW_KEY = "nexus-bases-view";

type View = { query: string; folder: string; column: string; dir: "asc" | "desc" };

function readView(): View {
  try {
    const raw = sessionStorage.getItem(VIEW_KEY);
    if (!raw) return { query: "", folder: "", column: "name", dir: "asc" };
    const parsed = JSON.parse(raw) as Partial<View>;
    return {
      query: typeof parsed.query === "string" ? parsed.query : "",
      folder: typeof parsed.folder === "string" ? parsed.folder : "",
      column: typeof parsed.column === "string" ? parsed.column : "name",
      dir: parsed.dir === "desc" ? "desc" : "asc",
    };
  } catch {
    return { query: "", folder: "", column: "name", dir: "asc" };
  }
}

export function NoteTable() {
  const nodes = useVaultStore((s) => s.nodes);
  const setActiveNote = useVaultStore((s) => s.setActiveNote);
  const ensureNoteBody = useVaultStore((s) => s.ensureNoteBody);
  const indexFillBusy = useVaultStore((s) => s.indexFillBusy);
  const [view, setView] = useState<View>(readView);

  useEffect(() => {
    try {
      sessionStorage.setItem(VIEW_KEY, JSON.stringify(view));
    } catch {
      /* ignore */
    }
  }, [view]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (document.querySelector("[role='dialog'], [data-nexus-confirm]")) return;
      e.preventDefault();
      setBasesOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const sources = useMemo(
    () =>
      Object.values(nodes)
        .filter((n) => n.kind === "note")
        .map((n) => ({
          id: n.id,
          path: n.path,
          name: n.name,
          content: n.content,
        })),
    [nodes],
  );

  const missingKey = useMemo(() => {
    const ids: string[] = [];
    for (const note of sources) {
      if (note.content !== undefined) continue;
      if (note.path.toLowerCase().endsWith(".canvas")) continue;
      ids.push(note.id);
      if (ids.length >= 24) break;
    }
    return ids.join("\n");
  }, [sources]);

  useEffect(() => {
    if (!missingKey) return;
    const ids = missingKey.split("\n");
    const run = () => {
      if (shouldSkipBackgroundBodyHydrate({ fillBusy: useVaultStore.getState().indexFillBusy })) return;
      for (const id of ids) void ensureNoteBody(id);
    };
    if (shouldSkipBackgroundBodyHydrate({ fillBusy: indexFillBusy })) {
      return scheduleFillSafeHydrate(run);
    }
    run();
  }, [missingKey, indexFillBusy, ensureNoteBody]);

  const built = useMemo(() => buildNoteTable(sources, view.folder), [sources, view.folder]);
  const shown = useMemo(
    () => sortNoteRows(filterNoteRows(built.rows, view.query), view.column, view.dir),
    [built.rows, view.query, view.column, view.dir],
  );

  const sortBy = (column: string) => {
    setView((prev) => ({
      ...prev,
      column,
      dir: prev.column === column && prev.dir === "asc" ? "desc" : "asc",
    }));
  };

  const columns = [
    ["name", "Name"],
    ["folder", "Folder"],
    ["path", "Path"],
    ...built.keys.map((key) => [key, key] as [string, string]),
  ];

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col bg-[var(--bg)]" data-testid="bases-table">
      <div className="flex shrink-0 items-center gap-2 border-b border-[var(--border)] px-3 py-2">
        <div className="min-w-0">
          <p className="text-[13px] font-semibold">Bases</p>
          <p className="text-[11px] text-[var(--text-muted)]" data-testid="bases-disclosure">
            Built-in table. Not Obsidian Bases.
          </p>
        </div>
        <input
          value={view.query}
          onChange={(e) => setView((prev) => ({ ...prev, query: e.target.value }))}
          placeholder="Filter title or property…"
          className="nexus-field ml-2 h-8 min-w-0 flex-1 rounded-md border border-[var(--border)] bg-transparent px-2 text-[12px]"
          data-testid="bases-filter"
        />
        <input
          value={view.folder}
          onChange={(e) => setView((prev) => ({ ...prev, folder: e.target.value }))}
          placeholder="Folder"
          className="nexus-field h-8 w-36 rounded-md border border-[var(--border)] bg-transparent px-2 text-[12px]"
          data-testid="bases-folder"
        />
        <button
          type="button"
          className="chip-btn"
          data-testid="bases-close"
          onClick={() => setBasesOpen(false)}
        >
          <X size={13} /> Close
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-auto">
        <table className="w-full border-collapse text-left text-[12px]">
          <thead className="sticky top-0 bg-[var(--panel-solid)]">
            <tr>
              {columns.map(([id, label]) => (
                <th key={id} className="border-b border-[var(--border)] px-2 py-1.5 font-medium">
                  <button
                    type="button"
                    className={cn("hover:text-[var(--accent)]", view.column === id && "text-[var(--accent)]")}
                    data-testid="bases-sort"
                    data-column={id}
                    onClick={() => sortBy(id)}
                  >
                    {label}
                    {view.column === id ? (view.dir === "asc" ? " ↑" : " ↓") : ""}
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {shown.map((row) => (
              <tr
                key={row.id}
                data-testid="bases-row"
                data-note-id={row.id}
                data-path={row.path}
                className="cursor-pointer border-b border-[var(--border)] hover:bg-white/[0.04]"
                onClick={() => {
                  setActiveNote(row.id);
                  setBasesOpen(false);
                }}
              >
                <td className="max-w-[16rem] truncate px-2 py-1.5 font-medium">{row.name}</td>
                <td className="max-w-[12rem] truncate px-2 py-1.5 text-[var(--text-muted)]">{row.folder || "—"}</td>
                <td className="max-w-[18rem] truncate px-2 py-1.5 text-[var(--text-muted)]">{row.path}</td>
                {built.keys.map((key) => (
                  <td key={key} className="max-w-[14rem] truncate px-2 py-1.5" data-prop={key}>
                    {row.props[key] || ""}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        {shown.length === 0 ? (
          <p className="px-3 py-6 text-[12px] text-[var(--text-muted)]">No notes match.</p>
        ) : null}
      </div>
      <p className="shrink-0 border-t border-[var(--border)] px-3 py-1.5 text-[11px] text-[var(--text-muted)]">
        {shown.length} note{shown.length === 1 ? "" : "s"}
        {built.keys.length ? ` · ${built.keys.join(", ")}` : " · no frontmatter properties in this set"}
        {built.truncated ? " · first 400 notes" : ""}
        {missingKey && !indexFillBusy ? " · reading note properties" : ""}
        {indexFillBusy ? " · properties wait until the index is idle" : ""}
        . No formulas, relations, or extra views.
      </p>
    </div>
  );
}
