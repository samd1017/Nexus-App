import { useEffect, useMemo, useRef, useState } from "react";
import { X } from "lucide-react";
import { setBasesOpen } from "@/lib/vault/bases-session";
import {
  buildNoteTable,
  filterNoteRows,
  filterRowsByRelation,
  parseBasesSession,
  sortNoteRows,
  withNoteRelation,
  type BasesSession,
  type BasesViewConfig,
} from "@/lib/vault/note-table";
import { loadNoteTableConfig, saveNoteTableConfig } from "@/lib/vault/note-table-file";
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
  const vaultId = useVaultStore((s) => s.vaultId);
  const nodes = useVaultStore((s) => s.nodes);
  const setActiveNote = useVaultStore((s) => s.setActiveNote);
  const ensureNoteBody = useVaultStore((s) => s.ensureNoteBody);
  const updateNoteContent = useVaultStore((s) => s.updateNoteContent);
  const indexFillBusy = useVaultStore((s) => s.indexFillBusy);
  const [session, setSession] = useState<BasesSession>(readSession);
  const [relationQuery, setRelationQuery] = useState("");
  const [relationName, setRelationName] = useState("related");
  const [linking, setLinking] = useState<{ rowId: string; key: string } | null>(null);
  const [linkQuery, setLinkQuery] = useState("");
  const ready = useRef(false);
  const view = session.views.find((item) => item.id === session.activeId) ?? session.views[0];

  const patchView = (partial: Partial<BasesViewConfig>) => {
    setSession((prev) => ({
      ...prev,
      views: prev.views.map((item) => (item.id === prev.activeId ? { ...item, ...partial } : item)),
    }));
  };

  useEffect(() => {
    let cancel = false;
    ready.current = false;
    void loadNoteTableConfig(vaultId).then((loaded) => {
      if (cancel) return;
      if (loaded) setSession(loaded);
      ready.current = true;
    });
    return () => {
      cancel = true;
    };
  }, [vaultId]);

  useEffect(() => {
    try {
      sessionStorage.setItem(VIEW_KEY, JSON.stringify(session));
    } catch {
      /* ignore */
    }
    if (!ready.current) return;
    const timer = window.setTimeout(() => {
      void saveNoteTableConfig(vaultId, session);
    }, 400);
    return () => window.clearTimeout(timer);
  }, [session, vaultId]);

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
  const shown = useMemo(() => {
    const relations = view.relations ?? [];
    const filtered = filterRowsByRelation(filterNoteRows(built.rows, view.query), relationQuery, relations.length ? relations : built.keys);
    return sortNoteRows(filtered, view.column, view.dir);
  }, [built.rows, built.keys, view.query, view.column, view.dir, view.relations, relationQuery]);

  const sortBy = (column: string) => {
    patchView({
      column,
      dir: view.column === column && view.dir === "asc" ? "desc" : "asc",
    });
  };

  const saveView = () => {
    const columns = built.keys;
    setSession((prev) => {
      const current = prev.views.find((item) => item.id === prev.activeId) ?? prev.views[0];
      const next = {
        activeId: "saved" as const,
        views: prev.views.map((item) =>
          item.id === "saved"
            ? {
                ...item,
                query: current.query,
                folder: current.folder,
                column: current.column,
                dir: current.dir,
                formula: current.formula,
                columns,
                relations: current.relations ?? [],
              }
            : item,
        ),
      };
      void saveNoteTableConfig(vaultId, next);
      return next;
    });
  };

  const relations = view.relations ?? [];
  const propKeys = view.columns.length
    ? view.columns.filter((key) => built.keys.includes(key) || relations.includes(key))
    : built.keys;
  const shownKeys = [...new Set([...(propKeys.length ? propKeys : built.keys), ...relations])];

  const addRelationField = () => {
    const key = relationName.trim();
    if (!/^[A-Za-z_][\w-]*$/.test(key)) return;
    if (relations.includes(key)) return;
    patchView({ relations: [...relations, key], columns: [...new Set([...(view.columns.length ? view.columns : built.keys), key])] });
  };

  const linkNote = async (rowId: string, key: string, title: string) => {
    const node = useVaultStore.getState().nodes[rowId];
    if (!node || node.kind !== "note") return;
    const loaded = node.content !== undefined ? node.content : await ensureNoteBody(rowId);
    if (typeof loaded !== "string") return;
    const next = withNoteRelation(loaded, key, title);
    updateNoteContent(rowId, next, { source: true });
    setLinking(null);
    setLinkQuery("");
  };

  const columns = [
    ["name", "Name"],
    ["folder", "Folder"],
    ["path", "Path"],
    ...shownKeys.map((key) => [key, key] as [string, string]),
    ...(view.formula.trim() ? [["formula", "Formula"] as [string, string]] : []),
  ];

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col bg-[var(--bg)]" data-testid="bases-table">
      <div className="flex shrink-0 items-center gap-2 border-b border-[var(--border)] px-3 py-2">
        <div className="min-w-0">
          <p className="text-[13px] font-semibold">Bases</p>
          <p className="text-[11px] text-[var(--text-muted)]" data-testid="bases-disclosure">
            Built-in table with views, formulas, and typed note links. Not Obsidian Bases — no cards view, no full formula language, and the file is .nexus/note-table.json, not an Obsidian .base file.
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
        <input
          value={relationName}
          onChange={(e) => setRelationName(e.target.value)}
          placeholder="Relation field"
          className="nexus-field h-8 w-28 rounded-md border border-[var(--border)] bg-transparent px-2 text-[12px]"
          data-testid="bases-relation-field"
        />
        <button type="button" className="chip-btn" data-testid="bases-add-relation" onClick={addRelationField}>
          Note link
        </button>
        <input
          value={relationQuery}
          onChange={(e) => setRelationQuery(e.target.value)}
          placeholder="Filter linked note"
          className="nexus-field h-8 w-32 rounded-md border border-[var(--border)] bg-transparent px-2 text-[12px]"
          data-testid="bases-relation-filter"
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
                {shownKeys.map((key) => {
                  const links = row.links[key] || [];
                  return (
                    <td key={key} className="max-w-[16rem] truncate px-2 py-1.5" data-prop={key}>
                      {links.length
                        ? links.map((link) =>
                            link.id ? (
                              <button
                                key={link.id}
                                type="button"
                                className="mr-1 text-[var(--accent)] hover:underline"
                                data-testid="bases-relation"
                                data-note-id={link.id}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setActiveNote(link.id);
                                  setBasesOpen(false);
                                }}
                              >
                                {link.title}
                              </button>
                            ) : (
                              <span key={link.title}>{link.title}</span>
                            ),
                          )
                        : relations.includes(key)
                          ? null
                          : row.props[key] || ""}
                      {relations.includes(key) ? (
                        <button
                          type="button"
                          className="text-[10px] text-[var(--text-muted)] hover:text-[var(--accent)]"
                          data-testid="bases-link-note"
                          data-row-id={row.id}
                          data-relation={key}
                          onClick={(e) => {
                            e.stopPropagation();
                            setLinking({ rowId: row.id, key });
                            setLinkQuery("");
                          }}
                        >
                          Link
                        </button>
                      ) : null}
                    </td>
                  );
                })}
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
        {linking ? (
          <div className="border-t border-[var(--border)] px-3 py-2" data-testid="bases-link-picker">
            <input
              autoFocus
              value={linkQuery}
              onChange={(e) => setLinkQuery(e.target.value)}
              placeholder="Link a note…"
              className="nexus-field mb-1 h-8 w-full rounded-md border border-[var(--border)] bg-transparent px-2 text-[12px]"
              data-testid="bases-link-query"
            />
            <ul className="max-h-32 overflow-y-auto">
              {sources
                .filter((note) => !note.path.toLowerCase().endsWith(".canvas"))
                .filter((note) => {
                  const q = linkQuery.trim().toLowerCase();
                  if (!q) return true;
                  return note.name.toLowerCase().includes(q) || note.path.toLowerCase().includes(q);
                })
                .slice(0, 8)
                .map((note) => (
                  <li key={note.id}>
                    <button
                      type="button"
                      className="w-full truncate px-1 py-1 text-left text-[12px] hover:bg-white/[0.05]"
                      data-testid="bases-link-choice"
                      data-note-id={note.id}
                      onClick={() => linkNote(linking.rowId, linking.key, note.name.replace(/\.md$/i, ""))}
                    >
                      {note.name.replace(/\.md$/i, "")}
                    </button>
                  </li>
                ))}
            </ul>
          </div>
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
        . Typed note links save as [[Title]] in the note. .nexus/note-table.json is not an Obsidian .base file.
      </p>
    </div>
  );
}
