import { NodeViewWrapper } from "@tiptap/react";
import type { NodeViewProps } from "@tiptap/react";
import { LayoutGrid, List, Table2 } from "lucide-react";
import { Fragment, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { useVaultStore } from "@/lib/vault/store";
import { getBodyGen, subscribeBodyGen } from "@/lib/vault/content";
import { getFindFocusPane } from "@/lib/editor/find-target";
import type { VaultNode } from "@/lib/vault/types";
import { loadTagExtras } from "@/lib/vault/nexus-query-tags";
import { scheduleFillSafeHydrate, shouldSkipBackgroundBodyHydrate } from "@/lib/vault/fill-interaction";
import {
  NEXUS_QUERY_CAP,
  frontmatterHydrateIds,
  queryColumnLabel,
  runNexusQuery,
  sizeHydrateIds,
  type NexusQueryModel,
  type NexusQueryRow,
} from "@/lib/vault/nexus-query";
import { problemExcerpt } from "@/lib/vault/query-expr";
import { queryStarters } from "@/lib/vault/query-starters";

const BODY_BATCH = 32;
const LIVE_DELAY_MS = 140;

function columnHeaders(model: NexusQueryModel): string[] {
  if (model.columns) return model.columns;
  return (model.rows[0]?.fields ?? []).map((field) => queryColumnLabel(field.name));
}

function countLine(model: NexusQueryModel, ms: number): string {
  if (model.error || model.help || !model.mode) return "";
  const total = model.total ?? model.rows.length;
  const shown = model.rows.length;
  const noun = total === 1 ? "note" : "notes";
  const head = shown < total ? `${shown} of ${total} ${noun}` : `${total} ${noun}`;
  return `${head} · ${ms < 1 ? "<1" : Math.round(ms)} ms`;
}

export function NexusQueryView({ node, updateAttributes, editor }: NodeViewProps) {
  const saved = String(node.attrs.query || "");
  const fence = String(node.attrs.lang || "nexus-query");
  const nodes = useVaultStore((s) => s.nodes);
  const shellDb = useVaultStore((s) => s.shellDbPath);
  const mode = useVaultStore((s) => s.mode);
  const setActiveNote = useVaultStore((s) => s.setActiveNote);
  const ensureNoteBody = useVaultStore((s) => s.ensureNoteBody);
  const indexFillBusy = useVaultStore((s) => s.indexFillBusy);
  const activeNoteId = useVaultStore((s) => s.activeNoteId);
  let hostId: string | null = activeNoteId;
  try {
    hostId = editor.view.dom.getAttribute("data-note-id") || activeNoteId;
  } catch {
    /* editor not mounted */
  }
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(saved);
  const [liveDraft, setLiveDraft] = useState(saved);
  const [tagExtras, setTagExtras] = useState<(VaultNode[] | null)[] | null>(null);
  const [tagsLoading, setTagsLoading] = useState(false);
  const [hydrating, setHydrating] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const caretAt = useRef<number | null>(null);
  const finished = useRef(false);
  const bodyGen = useSyncExternalStore(subscribeBodyGen, getBodyGen, getBodyGen);
  /** While editing, results follow the text being typed. */
  const query = editing ? liveDraft : saved;
  const triedBodyIds = useRef(new Set<string>());
  const queryKey = useRef(query);
  if (queryKey.current !== query) {
    queryKey.current = query;
    triedBodyIds.current = new Set();
  }

  useEffect(() => {
    if (!editing) return;
    const timer = window.setTimeout(() => setLiveDraft(draft), LIVE_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [draft, editing]);

  useEffect(() => {
    if (!editing) return;
    const el = textareaRef.current;
    if (!el) return;
    el.focus();
    const at = caretAt.current ?? el.value.length;
    el.setSelectionRange(at, at);
    caretAt.current = null;
  }, [editing]);

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 320)}px`;
  }, [draft, editing]);

  const missingBodyIds = useMemo(() => {
    const seen = new Set<string>();
    const ids: string[] = [];
    for (const id of [...frontmatterHydrateIds(query, nodes), ...sizeHydrateIds(query, nodes)]) {
      if (seen.has(id)) continue;
      seen.add(id);
      ids.push(id);
    }
    return ids;
  }, [query, nodes, bodyGen]);

  useEffect(() => {
    const pending = missingBodyIds.filter((id) => !triedBodyIds.current.has(id)).slice(0, BODY_BATCH);
    if (!pending.length) {
      setHydrating(false);
      return;
    }
    let cancel = false;
    let stop = () => {};
    const run = () => {
      if (cancel) return;
      if (shouldSkipBackgroundBodyHydrate({ fillBusy: useVaultStore.getState().indexFillBusy })) {
        stop = scheduleFillSafeHydrate(run);
        return;
      }
      for (const id of pending) triedBodyIds.current.add(id);
      setHydrating(true);
      void Promise.all(pending.map((id) => ensureNoteBody(id))).finally(() => {
        if (!cancel) setHydrating(false);
      });
    };
    if (shouldSkipBackgroundBodyHydrate({ fillBusy: indexFillBusy })) stop = scheduleFillSafeHydrate(run);
    else run();
    return () => {
      cancel = true;
      stop();
    };
  }, [missingBodyIds, indexFillBusy, ensureNoteBody]);

  useEffect(() => {
    let cancel = false;
    setTagsLoading(true);
    void (async () => {
      const extras = await loadTagExtras(query);
      if (cancel) return;
      setTagExtras(extras);
      setTagsLoading(false);
    })();
    return () => {
      cancel = true;
    };
  }, [query, shellDb, mode]);

  const timed = useMemo(() => {
    const started = performance.now();
    const result = runNexusQuery(query, nodes, tagExtras, Date.now(), hostId);
    return { model: result, ms: performance.now() - started };
  }, [query, nodes, tagExtras, bodyGen, hostId]);
  const model = timed.model;

  const starters = useMemo(() => (query.trim() ? [] : queryStarters(nodes)), [query, nodes]);

  const openRow = (id: string) => {
    const store = useVaultStore.getState();
    const split = Boolean(store.settings.workspaceSplit && store.secondaryNoteId);
    const pane = split ? getFindFocusPane() : "primary";
    setActiveNote(id, { pane });
  };

  const startEditing = (caret?: number) => {
    caretAt.current = caret ?? null;
    finished.current = false;
    setDraft(saved);
    setLiveDraft(saved);
    setEditing(true);
  };
  // Closing the editor removes the focused textarea, which can fire one more
  // blur; that blur must not save over a cancel or repeat a commit.
  const commit = (text = draft) => {
    if (finished.current) return;
    finished.current = true;
    if (text !== saved) updateAttributes({ query: text });
    setEditing(false);
  };
  const cancelEdit = () => {
    finished.current = true;
    setDraft(saved);
    setEditing(false);
  };

  const headers = columnHeaders(model);
  const showTitle = !model.withoutId;
  const showPath = model.showPath ?? true;
  const ModeIcon = model.mode === "cards" ? LayoutGrid : model.mode === "table" ? Table2 : List;
  const excerpt = model.problem ? problemExcerpt(query, model.problem) : null;
  const counts = countLine(model, timed.ms);

  const groupHeader = (row: NexusQueryRow, index: number) =>
    row.group != null && row.group !== model.rows[index - 1]?.group ? row.group : null;

  return (
    <NodeViewWrapper
      className="nexus-note-list"
      data-type="nexus-query"
      data-query={saved}
      data-lang={fence === "dataview" ? fence : undefined}
      data-testid="nexus-query"
    >
      <div className="nexus-query-head">
        <ModeIcon size={13} className="shrink-0 text-[var(--accent)]" />
        {editing ? (
          <span className="min-w-0 truncate text-[11px] text-[var(--text-muted)]">
            Results update as you type · {navigator.platform.includes("Mac") ? "⌘" : "Ctrl"}+Enter to finish · Esc to cancel
          </span>
        ) : (
          <button
            type="button"
            className="min-w-0 truncate text-left font-mono text-[12px] hover:text-[var(--text-primary)]"
            title="Edit query"
            data-testid="nexus-query-edit"
            onClick={() => startEditing()}
          >
            {saved.trim() ? saved.trim().replace(/\s*\n\s*/g, " · ") : "New query — pick a starter or write your own"}
          </button>
        )}
        <span className="ml-auto flex shrink-0 items-center gap-2 text-[10px] text-[var(--text-muted)]">
          {counts ? <span data-testid="nexus-query-count">{counts}</span> : null}
          <span>{fence}</span>
        </span>
      </div>
      {editing ? (
        <div className="nexus-query-editor">
          <textarea
            ref={textareaRef}
            value={draft}
            spellCheck={false}
            rows={2}
            data-testid="nexus-query-input"
            aria-label="Query"
            aria-invalid={model.problem ? true : undefined}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={() => commit()}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                commit();
              } else if (e.key === "Escape") {
                e.preventDefault();
                cancelEdit();
              }
            }}
            className="nexus-field w-full resize-none rounded-md border border-[var(--border)] bg-transparent px-2 py-1.5 font-mono text-[12px] leading-[1.5]"
            placeholder={'TABLE status, due FROM "Projects" WHERE status != "done" SORT due'}
          />
        </div>
      ) : null}
      <div className="nexus-query-body">
        {starters.length ? (
          <div data-testid="nexus-query-starters">
            <p className="nexus-query-empty">Start from your vault — each one is plain text you can edit:</p>
            <div className="nexus-query-starters">
              {starters.map((starter) => (
                <button
                  key={starter.label}
                  type="button"
                  className="nexus-query-starter"
                  data-testid="nexus-query-starter"
                  title={starter.query}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => {
                    if (editing) {
                      setDraft(starter.query);
                      setLiveDraft(starter.query);
                    } else updateAttributes({ query: starter.query });
                  }}
                >
                  <span className="font-medium">{starter.label}</span>
                  <span className="text-[10.5px] text-[var(--text-muted)]">{starter.hint}</span>
                </button>
              ))}
              {!editing ? (
                <button type="button" className="nexus-query-starter" onClick={() => startEditing()}>
                  <span className="font-medium">Write your own</span>
                  <span className="text-[10.5px] text-[var(--text-muted)]">LIST, TABLE, or CARDS</span>
                </button>
              ) : null}
            </div>
          </div>
        ) : null}
        {model.error ? (
          <div className="nexus-query-problem" data-testid="nexus-query-error" role="alert">
            <p>
              {model.problem ? <span className="nexus-query-clause">{model.problem.clause}</span> : null}
              {model.error}
            </p>
            {excerpt ? (
              <button
                type="button"
                className="nexus-query-excerpt"
                data-testid="nexus-query-excerpt"
                title={editing ? undefined : "Fix it"}
                onMouseDown={(e) => {
                  if (editing) e.preventDefault();
                }}
                onClick={() => {
                  const at = model.problem?.start ?? 0;
                  if (!editing) startEditing(at);
                  else textareaRef.current?.setSelectionRange(at, model.problem?.end ?? at);
                }}
              >
                {query.includes("\n") ? <span className="text-[var(--text-muted)]">line {excerpt.line} │ </span> : null}
                {excerpt.before}
                <mark>{excerpt.bad}</mark>
                {excerpt.after}
              </button>
            ) : null}
          </div>
        ) : null}
        {model.fieldNote ? (
          <p className="nexus-query-empty" data-testid="nexus-query-field-note">
            {model.fieldNote}
          </p>
        ) : null}
        {hydrating ? (
          <p className="nexus-query-empty" data-testid="nexus-query-hydrate">
            Reading notes…
          </p>
        ) : null}
        {!model.help && !model.error && model.rows.length === 0 ? (
          <p className="nexus-query-empty" data-testid="nexus-query-empty">
            {tagsLoading
              ? "Reading tags…"
              : model.tagsIncomplete
                ? model.scanNote || "Couldn't read every tag from the index."
                : "No notes match. Loosen WHERE or check the FROM folder or tag."}
          </p>
        ) : null}
        {model.mode === "table" && model.rows.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="nexus-query-table w-full text-left text-[13px]">
              <thead>
                <tr className="text-[10px] uppercase tracking-wide text-[var(--text-muted)]">
                  {showTitle ? <th className="px-1 py-1 font-semibold">{model.dialect ? "File" : "Title"}</th> : null}
                  {showPath ? <th className="px-1 py-1 font-semibold">Path</th> : null}
                  {headers.map((label) => (
                    <th key={label} className="px-1 py-1 font-semibold">
                      {label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {model.rows.map((row, index) => {
                  const span = (showTitle ? 1 : 0) + (showPath ? 1 : 0) + row.fields.length;
                  const group = groupHeader(row, index);
                  return (
                    <Fragment key={`${row.id}:${row.link ?? ""}:${index}`}>
                      {group != null ? (
                        <tr data-testid="nexus-query-group" data-group={group}>
                          <td colSpan={span} className="px-1 pt-2 text-[11px] font-semibold text-[var(--text-muted)]">
                            {group}
                          </td>
                        </tr>
                      ) : null}
                      {row.rows ? (
                        <tr>
                          <td colSpan={span} className="p-0">
                            <ul className="space-y-0.5 py-0.5 pl-3" data-testid="nexus-query-nested">
                              {row.rows.map((child, childIndex) => (
                                <li key={`${child.id}:${childIndex}`}>
                                  <button
                                    type="button"
                                    className="flex w-full items-baseline gap-2 px-1 py-0.5 text-left hover:bg-white/[0.04]"
                                    data-testid="nexus-query-row"
                                    data-open-note={child.id}
                                    onClick={() => openRow(child.id)}
                                  >
                                    <span className="truncate font-medium">{child.title}</span>
                                    <span className="truncate text-[11px] text-[var(--text-muted)]">{child.path}</span>
                                  </button>
                                </li>
                              ))}
                            </ul>
                          </td>
                        </tr>
                      ) : (
                        <tr
                          className="cursor-pointer hover:bg-white/[0.04]"
                          data-testid="nexus-query-row"
                          data-open-note={row.id}
                          title={row.path}
                          onClick={() => openRow(row.id)}
                        >
                          {showTitle ? (
                            <td className="max-w-[16rem] truncate px-1 py-1 font-medium">
                              {row.title}
                              {row.link ? <span className="ml-1 text-[11px] text-[var(--text-muted)]">→ {row.link}</span> : null}
                            </td>
                          ) : null}
                          {showPath ? <td className="max-w-[14rem] truncate px-1 py-1 text-[11px] text-[var(--text-muted)]">{row.path}</td> : null}
                          {row.fields.map((field, fieldIndex) => (
                            <td
                              key={`${field.name}:${fieldIndex}`}
                              className="max-w-[18rem] truncate px-1 py-1 text-[12px] text-[var(--text-secondary)]"
                              data-testid="nexus-query-field"
                            >
                              {field.value}
                            </td>
                          ))}
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : null}
        {model.mode === "list" && model.rows.length > 0 ? (
          <ul className="space-y-0.5">
            {model.rows.map((row, index) => {
              const group = groupHeader(row, index);
              return (
                <Fragment key={`${row.id}:${row.link ?? ""}:${index}`}>
                  {group != null ? (
                    <li className="px-1 pt-2 text-[11px] font-semibold text-[var(--text-muted)]" data-testid="nexus-query-group" data-group={group}>
                      {group}
                    </li>
                  ) : null}
                  {row.rows ? (
                    <li>
                      <ul className="space-y-0.5 pl-3" data-testid="nexus-query-nested">
                        {row.rows.map((child, childIndex) => (
                          <li key={`${child.id}:${childIndex}`}>
                            <button
                              type="button"
                              className="flex w-full flex-col items-start rounded-md px-1 py-0.5 text-left hover:bg-white/[0.04]"
                              data-testid="nexus-query-row"
                              data-open-note={child.id}
                              onClick={() => openRow(child.id)}
                            >
                              <span className="text-[13px] font-medium">{child.title}</span>
                              <span className="truncate text-[11px] text-[var(--text-muted)]">{child.path}</span>
                            </button>
                          </li>
                        ))}
                      </ul>
                    </li>
                  ) : (
                    <li>
                      <button
                        type="button"
                        className={`flex w-full rounded-md px-1 py-0.5 text-left hover:bg-white/[0.04] ${
                          model.dialect ? "items-baseline gap-2" : "flex-col items-start"
                        }`}
                        data-testid="nexus-query-row"
                        data-open-note={row.id}
                        title={row.path}
                        onClick={() => openRow(row.id)}
                      >
                        <span className="truncate text-[13px] font-medium">{row.title}</span>
                        {model.dialect ? (
                          row.fields[0] ? (
                            <span className="truncate text-[12px] text-[var(--text-muted)]" data-testid="nexus-query-field">
                              {row.fields[0].value}
                            </span>
                          ) : null
                        ) : (
                          <span className="truncate text-[11px] text-[var(--text-muted)]">{row.path}</span>
                        )}
                        {row.link ? <span className="truncate text-[11px] text-[var(--text-muted)]">{row.link}</span> : null}
                      </button>
                    </li>
                  )}
                </Fragment>
              );
            })}
          </ul>
        ) : null}
        {model.mode === "cards" && model.rows.length > 0 ? (
          <div className="nexus-query-cards" data-testid="nexus-query-cards">
            {model.rows.map((row, index) => {
              const group = groupHeader(row, index);
              return (
                <Fragment key={`${row.id}:${index}`}>
                  {group != null ? (
                    <div className="nexus-query-card-group" data-testid="nexus-query-group" data-group={group}>
                      {group}
                    </div>
                  ) : null}
                  <button
                    type="button"
                    className="nexus-query-card"
                    data-testid="nexus-query-row"
                    data-open-note={row.id}
                    title={row.path}
                    onClick={() => openRow(row.id)}
                  >
                    {showTitle ? <span className="nexus-query-card-title">{row.title}</span> : null}
                    {row.fields.map((field, fieldIndex) => (
                      <span key={`${field.name}:${fieldIndex}`} className="nexus-query-card-field" data-testid="nexus-query-field">
                        <span className="text-[var(--text-muted)]">{headers[fieldIndex] ?? field.name}</span>
                        <span className="truncate">{field.value}</span>
                      </span>
                    ))}
                  </button>
                </Fragment>
              );
            })}
          </div>
        ) : null}
        {model.truncated ? (
          <p className="nexus-query-empty" data-testid="nexus-query-cap">
            {model.dialect
              ? `Showing the first ${model.cap ?? model.rows.length} of ${model.total ?? model.rows.length}. Add LIMIT or narrow FROM.`
              : `Stopped at ${NEXUS_QUERY_CAP}.`}
          </p>
        ) : null}
        {model.scanNote && !(model.rows.length === 0 && model.tagsIncomplete) ? <p className="nexus-query-empty">{model.scanNote}</p> : null}
        <details className="nexus-query-syntax">
          <summary>How to write a query</summary>
          <p data-testid="nexus-query-footer">{model.footer}</p>
        </details>
      </div>
    </NodeViewWrapper>
  );
}
