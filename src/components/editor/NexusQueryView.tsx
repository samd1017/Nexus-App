import { NodeViewWrapper } from "@tiptap/react";
import type { NodeViewProps } from "@tiptap/react";
import { List } from "lucide-react";
import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { useVaultStore } from "@/lib/vault/store";
import { getFindFocusPane } from "@/lib/editor/find-target";
import type { VaultNode } from "@/lib/vault/types";
import { loadTagExtras } from "@/lib/vault/nexus-query-tags";
import { scheduleFillSafeHydrate, shouldSkipBackgroundBodyHydrate } from "@/lib/vault/fill-interaction";
import {
  NEXUS_QUERY_CAP,
  NEXUS_QUERY_HELP,
  frontmatterHydrateIds,
  queryColumnLabel,
  runNexusQuery,
} from "@/lib/vault/nexus-query";

const BODY_BATCH = 32;

export function NexusQueryView({ node, updateAttributes }: NodeViewProps) {
  const query = String(node.attrs.query || "");
  const nodes = useVaultStore((s) => s.nodes);
  const shellDb = useVaultStore((s) => s.shellDbPath);
  const mode = useVaultStore((s) => s.mode);
  const setActiveNote = useVaultStore((s) => s.setActiveNote);
  const ensureNoteBody = useVaultStore((s) => s.ensureNoteBody);
  const indexFillBusy = useVaultStore((s) => s.indexFillBusy);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(query);
  const [tagExtras, setTagExtras] = useState<(VaultNode[] | null)[] | null>(null);
  const [tagsLoading, setTagsLoading] = useState(false);
  const [hydrating, setHydrating] = useState(false);
  const triedBodyIds = useRef(new Set<string>());
  const queryKey = useRef(query);
  if (queryKey.current !== query) {
    queryKey.current = query;
    triedBodyIds.current = new Set();
  }

  const missingBodyIds = useMemo(() => frontmatterHydrateIds(query, nodes), [query, nodes]);

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

  const model = useMemo(
    () => runNexusQuery(query, nodes, tagExtras),
    [query, nodes, tagExtras],
  );

  const openRow = (id: string) => {
    const store = useVaultStore.getState();
    const split = Boolean(store.settings.workspaceSplit && store.secondaryNoteId);
    const pane = split ? getFindFocusPane() : "primary";
    setActiveNote(id, { pane });
  };

  return (
    <NodeViewWrapper className="nexus-note-list" data-type="nexus-query" data-query={query} data-testid="nexus-query">
      <div className="nexus-query-head">
        <List size={13} className="text-[var(--accent)]" />
        {editing ? (
          <input
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={() => {
              updateAttributes({ query: draft });
              setEditing(false);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                updateAttributes({ query: draft });
                setEditing(false);
              }
            }}
            className="nexus-field min-w-0 flex-1 rounded border border-[var(--border)] bg-transparent px-1.5 py-0.5 font-mono text-[12px]"
            placeholder={NEXUS_QUERY_HELP}
          />
        ) : (
          <button
            type="button"
            className="min-w-0 truncate font-mono text-[12px] hover:text-[var(--text-primary)]"
            onClick={() => {
              setDraft(query);
              setEditing(true);
            }}
          >
            {query.trim() || "Click to write a LIST or TABLE"}
          </button>
        )}
        <span className="ml-auto text-[10px] text-[var(--text-muted)]">nexus-query</span>
      </div>
      <div className="nexus-query-body">
        {model.help ? (
          <p className="nexus-query-empty" data-testid="nexus-query-empty">
            {model.help}. {model.footer}
          </p>
        ) : null}
        {model.error ? (
          <p className="nexus-query-empty" data-testid="nexus-query-error">
            {model.error}
          </p>
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
                : "No notes match."}
          </p>
        ) : null}
        {model.mode === "table" && model.rows.length > 0 ? (
          <table className="w-full text-left text-[13px]">
            <thead>
              <tr className="text-[10px] uppercase tracking-wide text-[var(--text-muted)]">
                <th className="px-1 py-1 font-semibold">Title</th>
                <th className="px-1 py-1 font-semibold">Path</th>
                {(model.rows[0]?.fields ?? []).map((field) => (
                  <th key={field.name} className="px-1 py-1 font-semibold">
                    {queryColumnLabel(field.name)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {model.rows.map((row, index) => (
                <Fragment key={`${row.id}:${row.link ?? ""}:${index}`}>
                {row.group != null && row.group !== model.rows[index - 1]?.group ? (
                  <tr data-testid="nexus-query-group" data-group={row.group}>
                    <td colSpan={2 + row.fields.length} className="px-1 pt-2 text-[11px] font-semibold text-[var(--text-muted)]">
                      {row.group}
                    </td>
                  </tr>
                ) : null}
                <tr>
                  <td colSpan={2 + row.fields.length} className="p-0">
                    <button
                      type="button"
                      className="grid w-full gap-2 px-1 py-1 text-left hover:bg-white/[0.04]"
                      style={{
                        gridTemplateColumns: row.fields.length
                          ? `1.2fr 1.4fr repeat(${row.fields.length}, 1fr)`
                          : "1.2fr 1.6fr",
                      }}
                      data-testid="nexus-query-row"
                      data-open-note={row.id}
                      onClick={() => openRow(row.id)}
                    >
                      <span className="truncate font-medium">{row.title}</span>
                      <span className="truncate text-[11px] text-[var(--text-muted)]">{row.path}</span>
                      {row.fields.map((field) => (
                        <span key={field.name} className="truncate text-[11px] text-[var(--text-muted)]" data-testid="nexus-query-field">
                          {field.value}
                        </span>
                      ))}
                    </button>
                  </td>
                </tr>
                </Fragment>
              ))}
            </tbody>
          </table>
        ) : null}
        {model.mode === "list" && model.rows.length > 0 ? (
          <ul className="space-y-1">
            {model.rows.map((row, index) => (
              <Fragment key={`${row.id}:${row.link ?? ""}:${index}`}>
              {row.group != null && row.group !== model.rows[index - 1]?.group ? (
                <li className="px-1 pt-2 text-[11px] font-semibold text-[var(--text-muted)]" data-testid="nexus-query-group" data-group={row.group}>
                  {row.group}
                </li>
              ) : null}
              <li>
                <button
                  type="button"
                  className="flex w-full flex-col items-start rounded-md px-1 py-1 text-left hover:bg-white/[0.04]"
                  data-testid="nexus-query-row"
                  data-open-note={row.id}
                  onClick={() => openRow(row.id)}
                >
                  <span className="text-[13px] font-medium">{row.title}</span>
                  <span className="truncate text-[11px] text-[var(--text-muted)]">{row.path}</span>
                  {row.link ? <span className="truncate text-[11px] text-[var(--text-muted)]">{row.link}</span> : null}
                </button>
              </li>
              </Fragment>
            ))}
          </ul>
        ) : null}
        {model.truncated ? (
          <p className="nexus-query-empty" data-testid="nexus-query-cap">
            Stopped at {NEXUS_QUERY_CAP}.
          </p>
        ) : null}
        {model.scanNote ? <p className="nexus-query-empty">{model.scanNote}</p> : null}
        <p className="mt-2 text-[10.5px] text-[var(--text-muted)]" data-testid="nexus-query-footer">
          {model.footer}
        </p>
      </div>
    </NodeViewWrapper>
  );
}
