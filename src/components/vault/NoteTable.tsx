import { useEffect, useMemo, useRef, useState } from "react";
import { X } from "lucide-react";
import { setBasesOpen } from "@/lib/vault/bases-session";
import {
  basesPropertiesReading,
  buildNoteTable,
  filterNoteRows,
  filterRowsByRelation,
  noteTableTitle,
  parseBasesSession,
  rankLinkChoices,
  sortNoteRows,
  withNoteRelation,
  type BasesSession,
  type BasesViewConfig,
} from "@/lib/vault/note-table";
import { FORMULA_EXAMPLES, FORMULA_FUNCTIONS } from "@/lib/vault/note-formula";
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
  const [formulaHelp, setFormulaHelp] = useState(false);
  const [hydratingProps, setHydratingProps] = useState(false);
  const [bodyEpoch, setBodyEpoch] = useState(0);
  const ready = useRef(false);
  const triedPropertyIds = useRef(new Set<string>());
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
      if (linking) {
        e.preventDefault();
        e.stopPropagation();
        setLinking(null);
        setLinkQuery("");
        return;
      }
      if (formulaHelp) {
        e.preventDefault();
        setFormulaHelp(false);
        return;
      }
      e.preventDefault();
      setBasesOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [linking, formulaHelp]);

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
    [nodes, bodyEpoch],
  );

  useEffect(() => {
    triedPropertyIds.current = new Set();
  }, [vaultId]);

  const built = useMemo(
    () => buildNoteTable(sources, view.folder, view.formula),
    [sources, view.folder, view.formula],
  );
  const shown = useMemo(() => {
    const relations = view.relations ?? [];
    const filtered = filterRowsByRelation(filterNoteRows(built.rows, view.query), relationQuery, relations.length ? relations : built.keys);
    return sortNoteRows(filtered, view.column, view.dir);
  }, [built.rows, built.keys, view.query, view.column, view.dir, view.relations, relationQuery]);

  const visibleMissingIds = useMemo(() => {
    const ids: string[] = [];
    for (const row of shown) {
      const node = nodes[row.id];
      if (!node || node.kind !== "note" || node.content !== undefined) continue;
      ids.push(row.id);
    }
    return ids;
  }, [shown, nodes]);
  useEffect(() => {
    const pending = visibleMissingIds.filter((id) => !triedPropertyIds.current.has(id));
    if (!pending.length) {
      setHydratingProps(false);
      return;
    }
    let cancel = false;
    const run = () => {
      if (shouldSkipBackgroundBodyHydrate({ fillBusy: useVaultStore.getState().indexFillBusy })) return;
      for (const id of pending) triedPropertyIds.current.add(id);
      setHydratingProps(true);
      void Promise.all(pending.map((id) => ensureNoteBody(id))).finally(() => {
        if (cancel) return;
        setHydratingProps(false);
        setBodyEpoch((n) => n + 1);
      });
    };
    if (shouldSkipBackgroundBodyHydrate({ fillBusy: indexFillBusy })) {
      return scheduleFillSafeHydrate(run);
    }
    run();
    return () => {
      cancel = true;
    };
  }, [visibleMissingIds, indexFillBusy, ensureNoteBody]);

  const readingProperties = basesPropertiesReading(visibleMissingIds.length, hydratingProps);

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
      const next: BasesSession = {
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
                columns,
                relations: current.relations ?? [],
                layout: current.layout === "cards" ? "cards" : "table",
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
  const layout = view.layout === "cards" ? "cards" : "table";
  const openNote = (id: string) => {
    setActiveNote(id);
    setBasesOpen(false);
  };

  const addRelationField = () => {
    const key = relationName.trim();
    if (!/^[A-Za-z_][\w-]*$/.test(key)) return;
    if (relations.includes(key)) return;
    patchView({ relations: [...relations, key], columns: [...new Set([...(view.columns.length ? view.columns : built.keys), key])] });
  };

  const linkChoices = useMemo(
    () => (linking ? rankLinkChoices(sources, linkQuery) : []),
    [linking, sources, linkQuery],
  );

  const linkNote = async (rowId: string, key: string, title: string) => {
    const node = useVaultStore.getState().nodes[rowId];
    if (!node || node.kind !== "note") return;
    const loaded = node.content !== undefined ? node.content : await ensureNoteBody(rowId);
    if (typeof loaded !== "string") return;
    const next = withNoteRelation(loaded, key, title);
    updateNoteContent(rowId, next, { source: true });
    setBodyEpoch((n) => n + 1);
    setLinking(null);
    setLinkQuery("");
  };

  const confirmTopLink = () => {
    const top = linkChoices[0];
    if (!linking || !top) return;
    void linkNote(linking.rowId, linking.key, noteTableTitle(top.name || top.path));
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
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-[var(--border)] px-3 py-2">
        <div className="min-w-0">
          <p className="text-[13px] font-semibold">Bases</p>
          <p className="text-[11px] text-[var(--text-muted)]" data-testid="bases-disclosure">
            Built-in table and cards with views, formulas, and typed note links. Not Obsidian Bases — one formula column per view, no list, regex, or link functions, and the file is .nexus/note-table.json, not an Obsidian .base file.
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
        <div className="flex items-center gap-1" role="group" aria-label="Layout">
          <button
            type="button"
            className={cn("chip-btn", layout === "table" && "is-active")}
            data-testid="bases-layout-table"
            aria-pressed={layout === "table"}
            onClick={() => patchView({ layout: "table" })}
          >
            Table
          </button>
          <button
            type="button"
            className={cn("chip-btn", layout === "cards" && "is-active")}
            data-testid="bases-layout-cards"
            aria-pressed={layout === "cards"}
            onClick={() => patchView({ layout: "cards" })}
          >
            Cards
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
          placeholder='Formula, e.g. file.mtime.relative()'
          spellCheck={false}
          aria-label="Formula"
          aria-invalid={built.formulaParseError ? true : undefined}
          aria-describedby={built.formulaParseError ? "bases-formula-parse-error" : undefined}
          className={cn(
            "nexus-field h-8 min-w-[14rem] flex-1 rounded-md border bg-transparent px-2 font-mono text-[11px]",
            built.formulaParseError ? "border-[var(--danger)]" : "border-[var(--border)]",
          )}
          data-testid="bases-formula"
        />
        <button
          type="button"
          className={cn("chip-btn", formulaHelp && "is-active")}
          aria-pressed={formulaHelp}
          aria-controls="bases-formula-help"
          data-testid="bases-formula-help-toggle"
          onClick={() => setFormulaHelp((open) => !open)}
        >
          Formula help
        </button>
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
          className="nexus-field h-9 min-w-[12rem] flex-1 rounded-md border border-[var(--border)] bg-transparent px-2 text-[13px]"
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
      {built.formulaParseError ? (
        <p
          id="bases-formula-parse-error"
          role="alert"
          className="shrink-0 border-b border-[var(--border)] bg-[var(--danger-dim)] px-3 py-1.5 text-[12px] text-[var(--danger)]"
          data-testid="bases-formula-parse-error"
        >
          Formula error: {built.formulaParseError}
        </p>
      ) : null}
      {formulaHelp ? (
        <div
          id="bases-formula-help"
          className="shrink-0 space-y-2 border-b border-[var(--border)] px-3 py-2 text-[12px]"
          data-testid="bases-formula-help"
        >
          <div className="flex flex-wrap gap-1.5">
            {FORMULA_EXAMPLES.map((example) => (
              <button
                key={example.formula}
                type="button"
                className="flex min-h-9 flex-col items-start rounded-md border border-[var(--border)] px-2 py-1 text-left hover:border-[var(--accent)]"
                data-testid="bases-formula-example"
                data-formula={example.formula}
                onClick={() => patchView({ formula: example.formula })}
              >
                <span className="font-mono text-[11px]">{example.formula}</span>
                <span className="text-[11px] text-[var(--text-muted)]">{example.label}</span>
              </button>
            ))}
          </div>
          <p className="text-[11px] text-[var(--text-muted)]">
            Values: a property name, note["key with spaces"], file.name, file.path, file.folder, file.ext, file.mtime, "text", numbers, true, false.
            Operators: + - * / % · &amp; joins text · == != &lt; &gt; &lt;= &gt;= · &amp;&amp; || !. Put spaces around - between names; due-date is one property.
            Dates: date(x) reads YYYY-MM-DD or [[YYYY-MM-DD]]; add or subtract durations like "7d", "2w", "1M", "1y"; date - date gives days; times are UTC.
            Format tokens: YYYY MM M MMM MMMM DD D ddd dddd HH mm ss.
          </p>
          <p className="text-[11px] text-[var(--text-muted)]" data-testid="bases-formula-functions">
            Functions (also as methods, like status.upper()): {FORMULA_FUNCTIONS.join(", ")}.
          </p>
        </div>
      ) : null}
      <div className="min-h-0 flex-1 overflow-auto" data-layout={layout}>
        {layout === "cards" ? (
          <div
            className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-3 p-3"
            data-testid="bases-cards"
          >
            {shown.map((row) => (
              <div
                key={row.id}
                role="button"
                tabIndex={0}
                data-testid="bases-card"
                data-note-id={row.id}
                data-path={row.path}
                className="flex cursor-pointer flex-col gap-2 rounded-lg border border-[var(--border)] bg-[var(--panel-solid)] p-3 text-left outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
                onClick={() => openNote(row.id)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && e.target === e.currentTarget) {
                    e.preventDefault();
                    openNote(row.id);
                  }
                }}
              >
                <h3 className="text-[14px] font-semibold">{row.name}</h3>
                <p className="truncate text-[11px] text-[var(--text-muted)]">{row.folder || row.path}</p>
                {shownKeys.map((key) => {
                  const links = row.links[key] || [];
                  return (
                    <div key={key} data-prop={key} className="flex flex-wrap items-center gap-1 text-[12px]">
                      <span className="text-[10px] uppercase tracking-wide text-[var(--text-muted)]">{key}</span>
                      {links.length
                        ? links.map((link) => {
                            if (!link.id) return <span key={link.title}>{link.title}</span>;
                            const noteId = link.id;
                            return (
                              <button
                                key={noteId}
                                type="button"
                                className="text-[var(--accent)] hover:underline"
                                data-testid="bases-relation"
                                data-note-id={noteId}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  openNote(noteId);
                                }}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") e.stopPropagation();
                                }}
                              >
                                {link.title}
                              </button>
                            );
                          })
                        : relations.includes(key)
                          ? null
                          : (
                            <span>{row.props[key] || "—"}</span>
                          )}
                      {relations.includes(key) ? (
                        <button
                          type="button"
                          className="inline-flex min-h-9 min-w-[4.5rem] items-center justify-center rounded-md border border-[var(--border)] px-3 text-[13px]"
                          data-testid="bases-link-note"
                          data-row-id={row.id}
                          data-relation={key}
                          onClick={(e) => {
                            e.stopPropagation();
                            setLinking({ rowId: row.id, key });
                            setLinkQuery("");
                          }}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") e.stopPropagation();
                          }}
                        >
                          Link
                        </button>
                      ) : null}
                    </div>
                  );
                })}
                {view.formula.trim() ? (
                  <p
                    className="truncate text-[12px] text-[var(--text-muted)]"
                    data-testid="bases-card-formula"
                    data-formula-error={row.formulaError ?? undefined}
                    title={row.formulaError ?? row.formula}
                  >
                    {row.formulaError ? (
                      <span className="text-[var(--danger)]" data-testid="bases-formula-error">
                        ⚠ {row.formulaError}
                      </span>
                    ) : (
                      row.formula || "—"
                    )}
                  </p>
                ) : null}
              </div>
            ))}
          </div>
        ) : (
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
                className="border-b border-[var(--border)] hover:bg-white/[0.04]"
              >
                <td className="max-w-[16rem] truncate px-2 py-1.5 font-medium">
                  <button
                    type="button"
                    className="max-w-full truncate text-left hover:text-[var(--accent)]"
                    data-testid="bases-open-note"
                    onClick={() => {
                      setActiveNote(row.id);
                      setBasesOpen(false);
                    }}
                  >
                    {row.name}
                  </button>
                </td>
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
                          className="ml-1 inline-flex min-h-9 min-w-[4.5rem] items-center justify-center rounded-md border border-[var(--border)] px-3 text-[13px] text-[var(--text)] hover:border-[var(--accent)] hover:text-[var(--accent)]"
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
                  <td
                    className="max-w-[16rem] truncate px-2 py-1.5"
                    data-formula={row.formula}
                    data-formula-error={row.formulaError ?? undefined}
                    title={row.formulaError ?? row.formula}
                  >
                    {row.formulaError ? (
                      <span className="text-[var(--danger)]" data-testid="bases-formula-error">
                        ⚠ {row.formulaError}
                      </span>
                    ) : (
                      row.formula
                    )}
                  </td>
                ) : null}
              </tr>
            ))}
          </tbody>
        </table>
        )}
        {shown.length === 0 ? (
          <p className="px-3 py-6 text-[12px] text-[var(--text-muted)]" data-testid="bases-empty">
            No notes match.
          </p>
        ) : null}
      </div>
      {linking ? (
        <div className="shrink-0 border-t border-[var(--border)] px-3 py-2" data-testid="bases-link-picker">
          <input
            autoFocus
            value={linkQuery}
            onChange={(e) => setLinkQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                e.stopPropagation();
                confirmTopLink();
              }
            }}
            placeholder="Type a note title, then Enter"
            aria-label="Choose a note to link"
            aria-controls="bases-link-list"
            aria-activedescendant={linkChoices[0] ? `bases-link-choice-${linkChoices[0].id}` : undefined}
            className="nexus-field mb-2 h-9 w-full rounded-md border border-[var(--border)] bg-transparent px-2 text-[13px]"
            data-testid="bases-link-query"
          />
          <ul id="bases-link-list" role="listbox" className="max-h-64 overflow-y-auto" data-testid="bases-link-list">
            {linkChoices.map((note, index) => {
              const title = noteTableTitle(note.name || note.path);
              const active = index === 0;
              return (
                <li key={note.id}>
                  <button
                    id={`bases-link-choice-${note.id}`}
                    type="button"
                    role="option"
                    aria-selected={active}
                    className={cn(
                      "flex min-h-11 w-full items-center rounded-md px-3 text-left text-[14px]",
                      active ? "bg-white/[0.08]" : "hover:bg-white/[0.05]",
                    )}
                    data-testid="bases-link-choice"
                    data-note-id={note.id}
                    data-active={active ? "1" : "0"}
                    onClick={() => linkNote(linking.rowId, linking.key, title)}
                  >
                    {title}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}
      <p className="shrink-0 border-t border-[var(--border)] px-3 py-1.5 text-[11px] text-[var(--text-muted)]" data-testid="bases-footer">
        {shown.length} note{shown.length === 1 ? "" : "s"}
        {built.keys.length
          ? ` · ${built.keys.join(", ")}`
          : visibleMissingIds.length === 0
            ? " · no frontmatter properties in this set"
            : ""}
        {built.truncated ? " · first 400 notes" : ""}
        {view.formula.trim() ? ` · formula ${view.formula}` : ""}
        {built.formulaError && !built.formulaParseError ? ` · ${built.formulaError}` : ""}
        {readingProperties ? " · reading note properties" : ""}
        {indexFillBusy && visibleMissingIds.length > 0 && !readingProperties
          ? " · properties wait until the index is idle"
          : ""}
        . Typed note links save as [[Title]] in the note. .nexus/note-table.json is not an Obsidian .base file.
      </p>
    </div>
  );
}
