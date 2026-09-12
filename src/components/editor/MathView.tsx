import { useEffect, useRef, useState } from "react";
import type { ReactNodeViewProps } from "@tiptap/react";

export function MathView({ node, updateAttributes, selected }: ReactNodeViewProps) {
  const tex = String(node.attrs.tex ?? "");
  const block = node.type.name === "mathBlock";
  const hostRef = useRef<HTMLSpanElement | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(tex);

  useEffect(() => {
    if (!editing) setDraft(tex);
  }, [tex, editing]);

  useEffect(() => {
    const el = hostRef.current;
    if (!el || editing) return;
    if (!tex.trim()) {
      el.textContent = "";
      return;
    }
    let cancelled = false;
    void Promise.all([import("katex"), import("katex/dist/katex.min.css")])
      .then(([mod]) => {
        if (cancelled || !hostRef.current) return;
        hostRef.current.innerHTML = "";
        mod.default.render(tex, hostRef.current, {
          displayMode: block,
          throwOnError: false,
          output: "html",
        });
        setErr(null);
      })
      .catch((e: unknown) => {
        if (!cancelled) {
          setErr(e instanceof Error ? e.message : "Math failed");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [tex, block, editing]);

  const commit = () => {
    setEditing(false);
    if (draft !== tex) updateAttributes({ tex: draft });
  };

  const Tag = block ? "div" : "span";
  return (
    <Tag
      className={`${block ? "nexus-math nexus-math-block" : "nexus-math nexus-math-inline"}${selected ? " is-selected" : ""}`}
      contentEditable={false}
      data-type={block ? "math-block" : "math-inline"}
      data-tex={tex}
      onDoubleClick={(e) => {
        e.preventDefault();
        setDraft(tex);
        setEditing(true);
      }}
    >
      {editing ? (
        <input
          className="nexus-math-edit"
          value={draft}
          autoFocus
          spellCheck={false}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              commit();
            }
            if (e.key === "Escape") {
              e.preventDefault();
              setDraft(tex);
              setEditing(false);
            }
            e.stopPropagation();
          }}
        />
      ) : (
        <>
          {err ? <span className="nexus-math-error">{err}</span> : null}
          <span ref={hostRef} />
          {!tex.trim() ? (
            <span className="nexus-math-empty">Empty formula</span>
          ) : null}
        </>
      )}
    </Tag>
  );
}
