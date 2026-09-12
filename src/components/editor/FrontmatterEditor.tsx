import { useEffect, useMemo, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { useVaultStore } from "@/lib/vault/store";
import {
  applyFrontmatter,
  parseFrontmatterFields,
  splitFrontmatter,
  type FrontmatterField,
} from "@/lib/editor/frontmatter";

export function FrontmatterEditor({
  noteId,
  content,
}: {
  noteId: string;
  content: string;
}) {
  const updateNoteContent = useVaultStore((s) => s.updateNoteContent);
  const { yaml } = useMemo(() => splitFrontmatter(content || ""), [content]);
  const parsed = useMemo(
    () => (yaml != null ? parseFrontmatterFields(yaml) : []),
    [yaml],
  );
  const [open, setOpen] = useState(yaml != null);
  const [rows, setRows] = useState<FrontmatterField[]>(parsed);

  useEffect(() => {
    setRows(parsed.length ? parsed : yaml != null ? [{ key: "", value: "" }] : []);
    if (yaml != null) setOpen(true);
  }, [noteId, yaml, parsed]);

  if (yaml == null && !open) {
    return (
      <div className="px-4 pt-2 sm:px-6 md:px-10">
        <button
          type="button"
          className="text-[11px] font-medium uppercase tracking-[0.08em] text-[var(--text-muted)] hover:text-[var(--accent)]"
          onClick={() => {
            setRows([{ key: "title", value: "" }]);
            setOpen(true);
          }}
        >
          + Properties
        </button>
      </div>
    );
  }

  const commit = (next: FrontmatterField[]) => {
    setRows(next);
    const current =
      useVaultStore.getState().nodes[noteId]?.content ?? content ?? "";
    updateNoteContent(noteId, applyFrontmatter(current, next));
  };

  return (
    <div
      className="mx-4 mt-2 rounded-[10px] border border-[var(--border)] bg-[var(--fill-subtle)] px-3 py-2 sm:mx-6 md:mx-10"
      data-frontmatter-bar="1"
    >
      <div className="mb-1.5 flex items-center justify-between">
        <div className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]">
          Properties
        </div>
        <button
          type="button"
          className="text-[11px] text-[var(--text-muted)] hover:text-[var(--text-secondary)]"
          onClick={() => {
            if (rows.every((r) => !r.key.trim() && !r.value.trim())) {
              setOpen(false);
              const current =
                useVaultStore.getState().nodes[noteId]?.content ?? content ?? "";
              updateNoteContent(noteId, applyFrontmatter(current, []));
            } else {
              setOpen((v) => !v);
            }
          }}
        >
          {open ? "Hide" : "Show"}
        </button>
      </div>
      {open ? (
        <div className="space-y-1.5">
          {rows.map((row, i) => (
            <div key={i} className="flex items-center gap-2">
              <input
                className="w-[7.5rem] shrink-0 rounded-md border border-[var(--border)] bg-[var(--bg-elevated)] px-2 py-1 font-mono text-[12px] text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
                value={row.key}
                placeholder="key"
                spellCheck={false}
                aria-label={`Property ${i + 1} key`}
                onChange={(e) => {
                  const next = rows.map((r, j) =>
                    j === i ? { ...r, key: e.target.value } : r,
                  );
                  commit(next);
                }}
              />
              <input
                className="min-w-0 flex-1 rounded-md border border-[var(--border)] bg-[var(--bg-elevated)] px-2 py-1 text-[12.5px] text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
                value={row.value}
                placeholder="value"
                aria-label={`Property ${i + 1} value`}
                onChange={(e) => {
                  const next = rows.map((r, j) =>
                    j === i ? { ...r, value: e.target.value } : r,
                  );
                  commit(next);
                }}
              />
              <button
                type="button"
                className="icon-btn h-7 w-7"
                aria-label="Remove property"
                onClick={() => commit(rows.filter((_, j) => j !== i))}
              >
                <Trash2 size={12} />
              </button>
            </div>
          ))}
          <button
            type="button"
            className="inline-flex items-center gap-1 text-[12px] text-[var(--accent)] hover:underline"
            onClick={() => commit([...rows, { key: "", value: "" }])}
          >
            <Plus size={12} />
            Add field
          </button>
        </div>
      ) : null}
    </div>
  );
}
