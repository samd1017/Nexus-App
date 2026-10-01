import { NodeViewWrapper } from "@tiptap/react";
import type { NodeViewProps } from "@tiptap/react";
import { List } from "lucide-react";
import { useMemo, useState } from "react";
import { useVaultStore } from "@/lib/vault/store";
import { getFindFocusPane } from "@/lib/editor/find-target";
import {
  NEXUS_QUERY_CAP,
  NEXUS_QUERY_HELP,
  runNexusQuery,
} from "@/lib/vault/nexus-query";

export function NexusQueryView({ node, updateAttributes }: NodeViewProps) {
  const query = String(node.attrs.query || "");
  const nodes = useVaultStore((s) => s.nodes);
  const setActiveNote = useVaultStore((s) => s.setActiveNote);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(query);
  const model = useMemo(() => runNexusQuery(query, nodes), [query, nodes]);

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
        {!model.help && !model.error && model.rows.length === 0 ? (
          <p className="nexus-query-empty" data-testid="nexus-query-empty">
            No notes match.
          </p>
        ) : null}
        {model.mode === "table" && model.rows.length > 0 ? (
          <table className="w-full text-left text-[13px]">
            <thead>
              <tr className="text-[10px] uppercase tracking-wide text-[var(--text-muted)]">
                <th className="px-1 py-1 font-semibold">Title</th>
                <th className="px-1 py-1 font-semibold">Path</th>
                {model.rows.some((r) => r.tags != null) ? (
                  <th className="px-1 py-1 font-semibold">Tags</th>
                ) : null}
                {model.rows.some((r) => r.mtime != null) ? (
                  <th className="px-1 py-1 font-semibold">Modified</th>
                ) : null}
              </tr>
            </thead>
            <tbody>
              {model.rows.map((row) => (
                <tr key={row.id}>
                  <td colSpan={row.tags != null || row.mtime != null ? 3 : 2} className="p-0">
                    <button
                      type="button"
                      className="grid w-full gap-2 px-1 py-1 text-left hover:bg-white/[0.04]"
                      style={{ gridTemplateColumns: row.tags != null || row.mtime != null ? "1.2fr 1.4fr 1fr" : "1.2fr 1.6fr" }}
                      data-testid="nexus-query-row"
                      data-open-note={row.id}
                      onClick={() => openRow(row.id)}
                    >
                      <span className="truncate font-medium">{row.title}</span>
                      <span className="truncate text-[11px] text-[var(--text-muted)]">{row.path}</span>
                      {row.tags != null ? (
                        <span className="truncate text-[11px] text-[var(--text-muted)]">{row.tags}</span>
                      ) : null}
                      {row.mtime != null ? (
                        <span className="truncate text-[11px] text-[var(--text-muted)]">{row.mtime}</span>
                      ) : null}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : null}
        {model.mode === "list" && model.rows.length > 0 ? (
          <ul className="space-y-1">
            {model.rows.map((row) => (
              <li key={row.id}>
                <button
                  type="button"
                  className="flex w-full flex-col items-start rounded-md px-1 py-1 text-left hover:bg-white/[0.04]"
                  data-testid="nexus-query-row"
                  data-open-note={row.id}
                  onClick={() => openRow(row.id)}
                >
                  <span className="text-[13px] font-medium">{row.title}</span>
                  <span className="truncate text-[11px] text-[var(--text-muted)]">{row.path}</span>
                </button>
              </li>
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
