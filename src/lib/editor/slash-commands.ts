import type { Editor } from "@tiptap/react";
import type { CalloutKind } from "@/lib/editor/callout";

export type SlashItem = {
  id: string;
  label: string;
  hint: string;
  keywords: string[];
  run: (editor: Editor, range: { from: number; to: number }) => void;
};

function clampRange(
  editor: Editor,
  range: { from: number; to: number },
): { from: number; to: number } {
  const live = detectSlashCommand(editor);
  const raw = live ?? range;
  const max = editor.state.doc.content.size;
  const from = Math.max(0, Math.min(raw.from, max));
  const to = Math.max(from, Math.min(raw.to, max));
  return { from, to };
}

function runSlash(
  editor: Editor,
  range: { from: number; to: number },
  apply: (chain: ReturnType<Editor["chain"]>) => ReturnType<Editor["chain"]>,
): void {
  const { from, to } = clampRange(editor, range);
  apply(editor.chain().focus().deleteRange({ from, to })).run();
}

export const SLASH_ITEMS: SlashItem[] = [
  {
    id: "h1",
    label: "Heading 1",
    hint: "#",
    keywords: ["h1", "title", "heading"],
    run: (ed, range) => runSlash(ed, range, (c) => c.setHeading({ level: 1 })),
  },
  {
    id: "h2",
    label: "Heading 2",
    hint: "##",
    keywords: ["h2", "heading"],
    run: (ed, range) => runSlash(ed, range, (c) => c.setHeading({ level: 2 })),
  },
  {
    id: "h3",
    label: "Heading 3",
    hint: "###",
    keywords: ["h3", "heading"],
    run: (ed, range) => runSlash(ed, range, (c) => c.setHeading({ level: 3 })),
  },
  {
    id: "bullet",
    label: "Bullet list",
    hint: "-",
    keywords: ["list", "ul", "bullet"],
    run: (ed, range) => runSlash(ed, range, (c) => c.toggleBulletList()),
  },
  {
    id: "numbered",
    label: "Numbered list",
    hint: "1.",
    keywords: ["ol", "numbered", "ordered"],
    run: (ed, range) => runSlash(ed, range, (c) => c.toggleOrderedList()),
  },
  {
    id: "task",
    label: "Task list",
    hint: "[ ]",
    keywords: ["todo", "task", "check"],
    run: (ed, range) => runSlash(ed, range, (c) => c.toggleTaskList()),
  },
  {
    id: "callout",
    label: "Callout",
    hint: "[!NOTE]",
    keywords: ["callout", "note", "info", "tip"],
    run: (ed, range) =>
      runSlash(ed, range, (c) => c.setCallout("note" as CalloutKind)),
  },
  {
    id: "table",
    label: "Table",
    hint: "grid",
    keywords: ["table", "grid"],
    run: (ed, range) =>
      runSlash(ed, range, (c) =>
        c.insertTable({ rows: 3, cols: 3, withHeaderRow: true }),
      ),
  },
  {
    id: "mermaid",
    label: "Mermaid diagram",
    hint: "```mermaid",
    keywords: ["mermaid", "diagram", "chart", "flow"],
    run: (ed, range) =>
      runSlash(ed, range, (c) =>
        c.insertContent({
          type: "mermaid",
          attrs: { source: "flowchart LR\n  A --> B" },
        }),
      ),
  },
  {
    id: "math",
    label: "Math block",
    hint: "$$",
    keywords: ["math", "latex", "katex", "formula"],
    run: (ed, range) =>
      runSlash(ed, range, (c) =>
        c.insertContent({
          type: "mathBlock",
          attrs: { tex: "E = mc^2" },
        }),
      ),
  },
  {
    id: "embed",
    label: "Embed note",
    hint: "![[note]]",
    keywords: ["embed", "transclude", "include"],
    run: (ed, range) =>
      runSlash(ed, range, (c) =>
        c.insertContent({
          type: "embed",
          attrs: { target: "Welcome" },
        }),
      ),
  },
  {
    id: "query",
    label: "Live query",
    hint: "```query",
    keywords: ["query", "search", "dataview", "list"],
    run: (ed, range) =>
      runSlash(ed, range, (c) =>
        c.insertContent({
          type: "queryBlock",
          attrs: { query: "folder:Research" },
        }),
      ),
  },
  {
    id: "code",
    label: "Code block",
    hint: "```",
    keywords: ["code", "fence"],
    run: (ed, range) => runSlash(ed, range, (c) => c.toggleCodeBlock()),
  },
  {
    id: "quote",
    label: "Quote",
    hint: ">",
    keywords: ["quote", "blockquote"],
    run: (ed, range) => runSlash(ed, range, (c) => c.toggleBlockquote()),
  },
  {
    id: "divider",
    label: "Divider",
    hint: "---",
    keywords: ["hr", "rule", "divider"],
    run: (ed, range) => runSlash(ed, range, (c) => c.setHorizontalRule()),
  },
];

export function filterSlashItems(query: string): SlashItem[] {
  const q = query.trim().toLowerCase();
  if (!q) return SLASH_ITEMS;
  return SLASH_ITEMS.filter((item) => {
    const hay = `${item.label} ${item.hint} ${item.keywords.join(" ")}`.toLowerCase();
    return hay.includes(q) || item.keywords.some((k) => k.startsWith(q));
  });
}

/** `/query` at the start of the current textblock. */
export function detectSlashCommand(
  editor: Editor,
): { query: string; from: number; to: number } | null {
  const { state } = editor;
  if (!state.selection.empty) return null;
  const $from = state.selection.$from;
  const textBefore = $from.parent.textBetween(0, $from.parentOffset, "\0", "\0");
  const m = textBefore.match(/^\/([^\n]*)$/);
  if (!m) return null;
  const query = m[1] ?? "";
  if (query.includes("\0")) return null;
  return {
    query,
    from: $from.start(),
    to: state.selection.from,
  };
}
