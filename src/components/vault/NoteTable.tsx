import { useEffect, useMemo, useRef, useState } from "react";
import { X } from "lucide-react";
import { setBasesOpen } from "@/lib/vault/bases-session";
import {
  basesPropertiesReading,
  buildNoteTable,
  filterNoteRows,
  filterRowsByRelation,
  formulaColumnId,
  formulaKey,
  formulaStatusLine,
  MAX_FORMULA_COLUMNS,
  noteTableTitle,
  parseBasesSession,
  rankLinkChoices,
  sortNoteRows,
  withNoteRelation,
  type BasesFormula,
  type BasesSession,
  type BasesViewConfig,
} from "@/lib/vault/note-table";
import { BASE_EXPORT_FILE, exportBaseFile, importBaseFile } from "@/lib/vault/bases-file";
import { writeNoteFile } from "@/lib/vault/fs-adapter";
import { writeDesktopNote } from "@/lib/vault/tauri-adapter";
import { FORMULA_EXAMPLES, FORMULA_FUNCTIONS } from "@/lib/vault/note-formula";
import { loadNoteTableConfig, saveNoteTableConfig } from "@/lib/vault/note-table-file";
import { getDesktopRoot, getFsaRoot, useVaultStore } from "@/lib/vault/store";
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
  const [focusFormulaId, setFocusFormulaId] = useState<string | null>(null);
  const [baseNotice, setBaseNotice] = useState<{
    title: string;
    lines: string[];
    tone: "ok" | "error";
    undo: BasesSession | null;
  } | null>(null);
  const baseInput = useRef<HTMLInputElement>(null);
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
    () => buildNoteTable(sources, view.folder, view.formulas),
    [sources, view.folder, view.formulas],
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
                formulas: current.formulas.map((f) => ({ ...f })),
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
    ...view.formulas.map((f) => [formulaColumnId(f.id), f.name || "Formula"] as [string, string]),
  ];
  const statusById = new Map(built.formulaStatus.map((status) => [status.id, status]));
  const failureLine = formulaStatusLine(built.formulaStatus);

  const patchFormula = (id: string, partial: Partial<BasesFormula>) => {
    patchView({ formulas: view.formulas.map((f) => (f.id === id ? { ...f, ...partial } : f)) });
  };
  const addFormula = (expr = "", name = "") => {
    if (view.formulas.length >= MAX_FORMULA_COLUMNS) return;
    const label = name.trim() || (view.formulas.length ? `Formula ${view.formulas.length + 1}` : "Formula");
    const id = formulaKey(label, view.formulas.map((f) => f.id));
    patchView({ formulas: [...view.formulas, { id, name: label, expr }] });
    setFocusFormulaId(id);
  };
  const removeFormula = (id: string) => {
    patchView({
      formulas: view.formulas.filter((f) => f.id !== id),
      ...(view.column === formulaColumnId(id) ? { column: "name", dir: "asc" as const } : {}),
    });
  };
  const applyExample = (expr: string, name: string) => {
    const last = view.formulas[view.formulas.length - 1];
    if (last && !last.expr.trim()) {
      patchFormula(last.id, { expr, name: /^Formula( \d+)?$/.test(last.name) ? name : last.name });
      setFocusFormulaId(last.id);
    } else {
      addFormula(expr, name);
    }
  };

  useEffect(() => {
    if (!focusFormulaId) return;
    document.querySelector<HTMLInputElement>(`[data-testid="bases-formula"][data-formula-id="${focusFormulaId}"]`)?.focus();
    setFocusFormulaId(null);
  }, [focusFormulaId, view.formulas]);

  const importBase = async (file: File) => {
    if (file.size > 1024 * 1024) {
      setBaseNotice({ title: `${file.name} is larger than 1 MB, so it was not imported.`, lines: [], tone: "error", undo: null });
      return;
    }
    const result = importBaseFile(await file.text());
    if ("error" in result) {
      setBaseNotice({ title: result.error, lines: [], tone: "error", undo: null });
      return;
    }
    const previous = session;
    setSession(result.session);
    setBaseNotice({
      title: `Imported ${file.name} into both views.`,
      lines: result.notes.length ? result.notes : ["Every view, column, formula, filter, and sort carried over."],
      tone: "ok",
      undo: previous,
    });
  };

  const exportBase = async () => {
    const { text, notes } = exportBaseFile(session, built.keys);
    const desktop = getDesktopRoot();
    const fsa = desktop ? null : getFsaRoot();
    try {
      if (desktop) await writeDesktopNote(desktop, BASE_EXPORT_FILE, text);
      else if (fsa) await writeNoteFile(fsa, BASE_EXPORT_FILE, text);
      else {
        const url = URL.createObjectURL(new Blob([text], { type: "text/yaml" }));
        const a = document.createElement("a");
        a.href = url;
        a.download = BASE_EXPORT_FILE;
        a.click();
        window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      }
      setBaseNotice({
        title: desktop || fsa ? `Exported ${BASE_EXPORT_FILE} to the vault folder.` : `Downloaded ${BASE_EXPORT_FILE}.`,
        lines: notes,
        tone: "ok",
        undo: null,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setBaseNotice({ title: `Couldn't export ${BASE_EXPORT_FILE}: ${message}`, lines: [], tone: "error", undo: null });
    }
  };

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col bg-[var(--bg)]" data-testid="bases-table">
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-[var(--border)] px-3 py-2">
        <div className="min-w-0">
          <p className="text-[13px] font-semibold">Bases</p>
          <p className="text-[11px] text-[var(--text-muted)]" data-testid="bases-disclosure">
            Built-in table and cards with views, formula columns, and typed note links. Not Obsidian Bases — two views, no list, regex, or link functions, no group-by or summaries; .base files import and export, but the file is .nexus/note-table.json, not an Obsidian .base file.
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
        <button
          type="button"
          className="chip-btn"
          data-testid="bases-add-formula"
          disabled={view.formulas.length >= MAX_FORMULA_COLUMNS}
          title={`Up to ${MAX_FORMULA_COLUMNS} formula columns per view`}
          onClick={() => addFormula()}
        >
          + Formula
        </button>
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
          data-testid="bases-import-base"
          title="Replace both views with the views in an Obsidian .base file"
          onClick={() => baseInput.current?.click()}
        >
          Import .base
        </button>
        <input
          ref={baseInput}
          type="file"
          accept=".base,.yaml,.yml"
          className="hidden"
          data-testid="bases-import-input"
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (file) void importBase(file);
          }}
        />
        <button
          type="button"
          className="chip-btn"
          data-testid="bases-export-base"
          title={`Write both views as ${BASE_EXPORT_FILE}`}
          onClick={() => void exportBase()}
        >
          Export .base
        </button>
        <button
          type="button"
          className="chip-btn"
          data-testid="bases-close"
          onClick={() => setBasesOpen(false)}
        >
          <X size={13} /> Close
        </button>
      </div>
      {baseNotice ? (
        <div
          role="status"
          className={cn(
            "shrink-0 border-b border-[var(--border)] px-3 py-2 text-[12px]",
            baseNotice.tone === "error" ? "bg-[var(--danger-dim)] text-[var(--danger)]" : "bg-[var(--fill-subtle)]",
          )}
          data-testid="bases-base-notice"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="font-medium">{baseNotice.title}</p>
            <div className="flex items-center gap-1">
              {baseNotice.undo ? (
                <button
                  type="button"
                  className="chip-btn"
                  data-testid="bases-import-undo"
                  onClick={() => {
                    if (baseNotice.undo) setSession(baseNotice.undo);
                    setBaseNotice(null);
                  }}
                >
                  Undo import
                </button>
              ) : null}
              <button type="button" className="chip-btn" onClick={() => setBaseNotice(null)}>
                OK
              </button>
            </div>
          </div>
          {baseNotice.lines.length ? (
            <ul className="mt-1 list-disc space-y-0.5 pl-5 text-[var(--text-muted)]" data-testid="bases-base-notes">
              {baseNotice.lines.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
      {view.formulas.length ? (
        <div className="shrink-0 space-y-1 border-b border-[var(--border)] px-3 py-1.5" data-testid="bases-formulas">
          {view.formulas.map((f, index) => {
            const parseError = statusById.get(f.id)?.parseError ?? null;
            const errorId = `bases-formula-error-${f.id}`;
            return (
              <div key={f.id} data-testid="bases-formula-row" data-formula-id={f.id}>
                <div className="flex items-center gap-1.5">
                  <input
                    value={f.name}
                    onChange={(e) => patchFormula(f.id, { name: e.target.value })}
                    aria-label={`Formula column ${index + 1} name`}
                    className="nexus-field h-8 w-32 rounded-md border border-[var(--border)] bg-transparent px-2 text-[12px]"
                    data-testid="bases-formula-name"
                  />
                  <input
                    value={f.expr}
                    onChange={(e) => patchFormula(f.id, { expr: e.target.value })}
                    placeholder={index ? `e.g. formula.${view.formulas[0]?.id ?? "formula"} & " · " & file.folder` : "e.g. file.mtime.relative()"}
                    spellCheck={false}
                    aria-label={`Formula for ${f.name || `column ${index + 1}`}`}
                    aria-invalid={parseError ? true : undefined}
                    aria-describedby={parseError ? errorId : undefined}
                    title={`Columns to the right read this one as formula.${f.id}`}
                    className={cn(
                      "nexus-field h-8 min-w-[12rem] flex-1 rounded-md border bg-transparent px-2 font-mono text-[11px]",
                      parseError ? "border-[var(--danger)]" : "border-[var(--border)]",
                    )}
                    data-testid="bases-formula"
                    data-formula-id={f.id}
                  />
                  <code className="hidden shrink-0 text-[10.5px] text-[var(--text-muted)] md:inline" data-testid="bases-formula-key">
                    formula.{f.id}
                  </code>
                  <button
                    type="button"
                    className="icon-btn h-8 w-8 shrink-0"
                    aria-label={`Remove formula column ${f.name || index + 1}`}
                    data-testid="bases-formula-remove"
                    onClick={() => removeFormula(f.id)}
                  >
                    <X size={13} />
                  </button>
                </div>
                {parseError ? (
                  <p
                    id={errorId}
                    role="alert"
                    className="mt-0.5 rounded-md bg-[var(--danger-dim)] px-2 py-1 text-[12px] text-[var(--danger)]"
                    data-testid="bases-formula-parse-error"
                  >
                    Formula error in “{f.name || `column ${index + 1}`}”: {parseError}
                  </p>
                ) : null}
              </div>
            );
          })}
        </div>
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
                title="Add as a formula column"
                onClick={() => applyExample(example.formula, example.name)}
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
            formula.&lt;column&gt; reads a formula column to its left, like formula.due.relative().
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
                {view.formulas.map((f) => {
                  const cell = row.formulas[f.id];
                  if (!cell) return null;
                  return (
                    <p
                      key={f.id}
                      className="truncate text-[12px] text-[var(--text-muted)]"
                      data-testid="bases-card-formula"
                      data-formula-id={f.id}
                      data-formula-error={cell.error ?? undefined}
                      title={cell.error ?? cell.value}
                    >
                      <span className="text-[10px] uppercase tracking-wide">{f.name || "Formula"}</span>{" "}
                      {cell.error ? (
                        <span className="text-[var(--danger)]" data-testid="bases-formula-error">
                          ⚠ {cell.error}
                        </span>
                      ) : (
                        <span className="text-[var(--text)]">{cell.value || "—"}</span>
                      )}
                    </p>
                  );
                })}
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
                {view.formulas.map((f) => {
                  const cell = row.formulas[f.id];
                  return (
                    <td
                      key={f.id}
                      className="max-w-[16rem] truncate px-2 py-1.5"
                      data-formula={cell?.value ?? ""}
                      data-formula-id={f.id}
                      data-formula-error={cell?.error ?? undefined}
                      title={cell?.error ?? cell?.value}
                    >
                      {cell?.error ? (
                        <span className="text-[var(--danger)]" data-testid="bases-formula-error">
                          ⚠ {cell.error}
                        </span>
                      ) : (
                        cell?.value
                      )}
                    </td>
                  );
                })}
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
        {view.formulas.length
          ? ` · ${view.formulas.length} formula column${view.formulas.length === 1 ? "" : "s"}`
          : ""}
        {failureLine ? ` · ${failureLine}` : ""}
        {readingProperties ? " · reading note properties" : ""}
        {indexFillBusy && visibleMissingIds.length > 0 && !readingProperties
          ? " · properties wait until the index is idle"
          : ""}
        . Typed note links save as [[Title]] in the note. .nexus/note-table.json is not an Obsidian .base file.
      </p>
    </div>
  );
}
