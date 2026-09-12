import type { Editor } from "@tiptap/react";
import type { CalloutKind } from "@/lib/editor/callout";

export type SlashItem = {
  id: string;
  label: string;
  hint: string;
  keywords: string[];
  run: (editor: Editor, range: { from: number; to: number }) => void;
};

function replaceThen(editor: Editor, range: { from: number; to: number }, fn: () => void) {
  editor.chain().focus().deleteRange(range).run();
  fn();
}

export const SLASH_ITEMS: SlashItem[] = [
  {
    id: "h1",
    label: "Heading 1",
    hint: "#",
    keywords: ["h1", "title", "heading"],
    run: (ed, range) =>
      replaceThen(ed, range, () => ed.chain().focus().toggleHeading({ level: 1 }).run()),
  },
  {
    id: "h2",
    label: "Heading 2",
    hint: "##",
    keywords: ["h2", "heading"],
    run: (ed, range) =>
      replaceThen(ed, range, () => ed.chain().focus().toggleHeading({ level: 2 }).run()),
  },
  {
    id: "h3",
    label: "Heading 3",
    hint: "###",
    keywords: ["h3", "heading"],
    run: (ed, range) =>
      replaceThen(ed, range, () => ed.chain().focus().toggleHeading({ level: 3 }).run()),
  },
  {
    id: "bullet",
    label: "Bullet list",
    hint: "-",
    keywords: ["list", "ul", "bullet"],
    run: (ed, range) =>
      replaceThen(ed, range, () => ed.chain().focus().toggleBulletList().run()),
  },
  {
    id: "numbered",
    label: "Numbered list",
    hint: "1.",
    keywords: ["ol", "numbered", "ordered"],
    run: (ed, range) =>
      replaceThen(ed, range, () => ed.chain().focus().toggleOrderedList().run()),
  },
  {
    id: "task",
    label: "Task list",
    hint: "[ ]",
    keywords: ["todo", "task", "check"],
    run: (ed, range) =>
      replaceThen(ed, range, () => ed.chain().focus().toggleTaskList().run()),
  },
  {
    id: "callout",
    label: "Callout",
    hint: "[!NOTE]",
    keywords: ["callout", "note", "info", "tip"],
    run: (ed, range) =>
      replaceThen(ed, range, () =>
        ed.chain().focus().setCallout("note" as CalloutKind).run(),
      ),
  },
  {
    id: "table",
    label: "Table",
    hint: "grid",
    keywords: ["table", "grid"],
    run: (ed, range) =>
      replaceThen(ed, range, () =>
        ed.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run(),
      ),
  },
  {
    id: "mermaid",
    label: "Mermaid diagram",
    hint: "```mermaid",
    keywords: ["mermaid", "diagram", "chart", "flow"],
    run: (ed, range) =>
      replaceThen(ed, range, () =>
        ed.chain().focus().insertContent({
          type: "mermaid",
          attrs: { source: "flowchart LR\n  A --> B" },
        }).run(),
      ),
  },
  {
    id: "math",
    label: "Math block",
    hint: "$$",
    keywords: ["math", "latex", "katex", "formula"],
    run: (ed, range) =>
      replaceThen(ed, range, () =>
        ed.chain().focus().insertContent({
          type: "mathBlock",
          attrs: { tex: "E = mc^2" },
        }).run(),
      ),
  },
  {
    id: "embed",
    label: "Embed note",
    hint: "![[note]]",
    keywords: ["embed", "transclude", "include"],
    run: (ed, range) =>
      replaceThen(ed, range, () =>
        ed.chain().focus().insertContent({
          type: "embed",
          attrs: { target: "Welcome" },
        }).run(),
      ),
  },
  {
    id: "query",
    label: "Live query",
    hint: "```query",
    keywords: ["query", "search", "dataview", "list"],
    run: (ed, range) =>
      replaceThen(ed, range, () =>
        ed.chain().focus().insertContent({
          type: "queryBlock",
          attrs: { query: "folder:Research" },
        }).run(),
      ),
  },
  {
    id: "code",
    label: "Code block",
    hint: "```",
    keywords: ["code", "fence"],
    run: (ed, range) =>
      replaceThen(ed, range, () => ed.chain().focus().toggleCodeBlock().run()),
  },
  {
    id: "quote",
    label: "Quote",
    hint: ">",
    keywords: ["quote", "blockquote"],
    run: (ed, range) =>
      replaceThen(ed, range, () => ed.chain().focus().toggleBlockquote().run()),
  },
  {
    id: "divider",
    label: "Divider",
    hint: "---",
    keywords: ["hr", "rule", "divider"],
    run: (ed, range) =>
      replaceThen(ed, range, () => ed.chain().focus().setHorizontalRule().run()),
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
