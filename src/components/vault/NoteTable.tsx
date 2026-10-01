import { useEffect, useMemo, useState } from "react";
import { X } from "lucide-react";
import { setBasesOpen } from "@/lib/vault/bases-session";
import {
  buildNoteTable,
  filterNoteRows,
  parseBasesSession,
  sortNoteRows,
  type BasesSession,
  type BasesViewConfig,
} from "@/lib/vault/note-table";
import { useVaultStore } from "@/lib/vault/store";
import {
  scheduleFillSafeHydrate,
  shouldSkipBackgroundBodyHydrate,
} from "@/lib/vault/fill-interaction";
import { cn } from "@/lib/utils";

const VIEW_KEY = "nexus-bases-view";

function readSession(): BasesSession {
  try {
    return parseBasesSession(sessionStorage.getItem(VIEW_KEY));
  } catch {
    return parseBasesSession(null);
  }
}

export function NoteTable() {
  const nodes = useVaultStore((s) => s.nodes);
  const setActiveNote = useVaultStore((s) => s.setActiveNote);
  const ensureNoteBody = useVaultStore((s) => s.ensureNoteBody);
  const indexFillBusy = useVaultStore((s) => s.indexFillBusy);
  const [session, setSession] = useState<BasesSession>(readSession);
  const view = session.views.find((item) => item.id === session.activeId) ?? session.views[0];

  const patchView = (partial: Partial<BasesViewConfig>) => {
    setSession((prev) => ({
      ...prev,
      views: prev.views.map((item) => (item.id === prev.activeId ? { ...item, ...partial } : item)),
    }));
  };

  useEffect(() => {
    try {
      sessionStorage.setItem(VIEW_KEY, JSON.stringify(session));
    } catch {
      /* ignore */
    }
  }, [session]);

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
          mtime: n.mtime,
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

  const built = useMemo(
    () => buildNoteTable(sources, view.folder, view.formula),
    [sources, view.folder, view.formula],
  );
  const shown = useMemo(
    () => sortNoteRows(filterNoteRows(built.rows, view.query), view.column, view.dir),
    [built.rows, view.query, view.column, view.dir],
  );

  const sortBy = (column: string) => {
    patchView({
      column,
      dir: view.column === column && view.dir === "asc" ? "desc" : "asc",
    });
  };

  const saveView = () => {
    setSession((prev) => {
      const current = prev.views.find((item) => item.id === prev.activeId) ?? prev.views[0];
      return {
        activeId: "saved",
        views: prev.views.map((item) =>
          item.id === "saved"
            ? {
                ...item,
                query: current.query,
                folder: current.folder,
                column: current.column,
                dir: current.dir,
                formula: current.formula,
              }
            : item,
        ),
      };
    });
  };

  const columns = [
    ["name", "Name"],
    ["folder", "Folder"],
    ["path", "Path"],
    ...built.keys.map((key) => [key, key] as [string, string]),
    ...(view.formula.trim() ? [["formula", "Formula"] as [string, string]] : []),
  ];

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col bg-[var(--bg)]" data-testid="bases-table">
      <div className="flex shrink-0 items-center gap-2 border-b border-[var(--border)] px-3 py-2">
        <div className="min-w-0">
          <p className="text-[13px] font-semibold">Bases</p>
          <p className="text-[11px] text-[var(--text-muted)]" data-testid="bases-disclosure">
            Built-in table with two views and formulas. Not Obsidian Bases — no relations, no .base files.
          </p>
        </div>
        <div className="flex items-center gap-1">
          {session.views.map((item) => (
            <button
              key={item.id}
              type="button"
              className={cn("chip-btn", session.activeId === item.id && "is-active")}
              data-testid="bases-view"
              data-view={item.id}
              aria-pressed={session.activeId === item.id}
              onClick={() => setSession((prev) => ({ ...prev, activeId: item.id }))}
            >
              {item.name}
            </button>
          ))}
          <button type="button" className="chip-btn" data-testid="bases-save-view" onClick={saveView}>
            Save view
          </button>
        </div>
        <input
          value={view.query}
          onChange={(e) => patchView({ query: e.target.value })}
          placeholder="Filter title or property…"
          className="nexus-field h-8 min-w-0 flex-1 rounded-md border border-[var(--border)] bg-transparent px-2 text-[12px]"
          data-testid="bases-filter"
        />
        <input
          value={view.folder}
          onChange={(e) => patchView({ folder: e.target.value })}
          placeholder="Folder"
          className="nexus-field h-8 w-28 rounded-md border border-[var(--border)] bg-transparent px-2 text-[12px]"
          data-testid="bases-folder"
        />
        <input
          value={view.formula}
          onChange={(e) => patchView({ formula: e.target.value })}
          placeholder='Formula, e.g. file.mtime'
          className="nexus-field h-8 w-44 rounded-md border border-[var(--border)] bg-transparent px-2 font-mono text-[11px]"
          data-testid="bases-formula"
          title="file.mtime, file.name, a property, a & b, or if(value, then, else)"
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
                {view.formula.trim() ? (
                  <td className="max-w-[16rem] truncate px-2 py-1.5" data-formula={row.formula}>
                    {row.formula}
                  </td>
                ) : null}
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
        {view.formula.trim() ? ` · formula ${view.formula}` : ""}
        {built.formulaError ? ` · ${built.formulaError}` : ""}
        {missingKey && !indexFillBusy ? " · reading note properties" : ""}
        {indexFillBusy ? " · properties wait until the index is idle" : ""}
        . Built-in formulas only. No relations. No .base files.
      </p>
    </div>
  );
}
