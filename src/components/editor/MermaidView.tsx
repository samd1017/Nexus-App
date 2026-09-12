import { useEffect, useId, useRef, useState } from "react";
import type { ReactNodeViewProps } from "@tiptap/react";
import { usePrefsStore, resolveTheme } from "@/lib/prefs/preferences";

export function MermaidView({ node, updateAttributes, selected }: ReactNodeViewProps) {
  const source = String(node.attrs.source ?? "");
  const hostRef = useRef<HTMLDivElement | null>(null);
  const uid = useId().replace(/:/g, "");
  const theme = usePrefsStore((s) => s.theme);
  const [err, setErr] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(source);

  useEffect(() => {
    if (!editing) setDraft(source);
  }, [source, editing]);

  useEffect(() => {
    const el = hostRef.current;
    if (!el || !source.trim() || editing) {
      if (el && !editing) el.innerHTML = "";
      return;
    }
    let cancelled = false;
    setErr(null);
    void import("mermaid")
      .then(async (mod) => {
        const mermaid = mod.default;
        const resolved = resolveTheme(theme);
        mermaid.initialize({
          startOnLoad: false,
          securityLevel: "strict",
          theme: resolved === "light" ? "default" : "dark",
          fontFamily: "inherit",
        });
        const id = `nexus-mmd-${uid}-${Math.abs(hash(source))}`;
        const { svg } = await mermaid.render(id, source);
        if (!cancelled && hostRef.current) {
          hostRef.current.innerHTML = svg;
        }
      })
      .catch((e: unknown) => {
        if (!cancelled) {
          setErr(e instanceof Error ? e.message : "Could not render diagram");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [source, theme, uid, editing]);

  const commit = () => {
    setEditing(false);
    if (draft !== source) updateAttributes({ source: draft });
  };

  return (
    <div
      className={`nexus-mermaid${selected ? " is-selected" : ""}`}
      contentEditable={false}
      data-type="mermaid"
      data-source={source}
      onDoubleClick={(e) => {
        e.preventDefault();
        setDraft(source);
        setEditing(true);
      }}
    >
      {editing ? (
        <textarea
          className="nexus-mermaid-edit"
          value={draft}
          autoFocus
          spellCheck={false}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              e.preventDefault();
              setDraft(source);
              setEditing(false);
            }
            e.stopPropagation();
          }}
        />
      ) : err ? (
        <div className="nexus-mermaid-error">{err}</div>
      ) : !source.trim() ? (
        <div className="nexus-mermaid-empty">Empty mermaid diagram — double-click to edit</div>
      ) : (
        <div ref={hostRef} className="nexus-mermaid-svg" />
      )}
    </div>
  );
}

function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return h;
}
