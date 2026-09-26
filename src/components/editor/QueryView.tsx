import { NodeViewWrapper } from "@tiptap/react";
import type { NodeViewProps } from "@tiptap/react";
import { Search } from "lucide-react";
import { useMemo, useState } from "react";
import { useVaultStore } from "@/lib/vault/store";
import { searchWithOps } from "@/lib/search/query-ops";

export function QueryView({ node, updateAttributes }: NodeViewProps) {
  const query = String(node.attrs.query || "");
  const nodes = useVaultStore((s) => s.nodes);
  const setActiveNote = useVaultStore((s) => s.setActiveNote);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(query);

  const hits = useMemo(
    () => (query.trim() ? searchWithOps(nodes, query, 24) : []),
    [nodes, query],
  );

  return (
    <NodeViewWrapper className="nexus-query" data-type="query" data-query={query}>
      <div className="nexus-query-head">
        <Search size={13} className="text-[var(--accent)]" />
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
            placeholder='folder:Research #idea -draft'
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
            {query || "Click to set query"}
          </button>
        )}
        <span className="ml-auto text-[10px] text-[var(--text-muted)]">
          {hits.length} live
        </span>
      </div>
      <div className="nexus-query-body">
        {hits.length === 0 ? (
          <p className="nexus-query-empty">
            No matches. Try path:, folder:, file:, #tag, or -exclude.
          </p>
        ) : (
          <ul className="space-y-1.5">
            {hits.map((h) => (
              <li key={h.noteId}>
                <button
                  type="button"
                  className="flex w-full flex-col items-start rounded-md px-1.5 py-1 text-left hover:bg-white/[0.04]"
                  onClick={() => setActiveNote(h.noteId)}
                >
                  <span className="text-[13px] font-medium">{h.title}</span>
                  <span className="line-clamp-2 text-[11px] text-[var(--text-muted)]">
                    {h.snippet}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </NodeViewWrapper>
  );
}
