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
    hint: "built-in ```query",
    keywords: ["query", "search", "dataview", "list", "built-in", "query block"],
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

/** True when typed text in the current block is a slash command (`/` or `/query`). */
export function isSlashCommandText(textBefore: string): boolean {
  const m = textBefore.match(/^\s*\/([^\n]*)$/);
  if (!m) return false;
  return !(m[1] ?? "").includes("\0");
}

/**
 * After a table (or at EOF), users often land in a non-empty last paragraph.
 * Breaking onto a new line before `/` makes slash reliable on long Visual notes.
 */
export function shouldBreakForSlash(editor: Editor): boolean {
  const { state } = editor;
  if (!state.selection.empty) return false;
  try {
    if (editor.isActive("table")) return false;
  } catch {
    /* older TipTap without table */
  }
  const $from = state.selection.$from;
  if (!$from.parent.isTextblock) return false;
  if ($from.parentOffset !== $from.parent.content.size) return false;
  if (!$from.parent.textContent.trim()) return false;
  const index = $from.index($from.depth - 1);
  const parent = $from.node($from.depth - 1);
  const next = parent.maybeChild(index + 1);
  const prev = parent.maybeChild(index - 1);
  const last = index === parent.childCount - 1;
  if (prev?.type.name === "table") return true;
  if (last) return true;
  if (next && /^(heading|table|horizontalRule|mermaid|mathBlock|codeBlock)$/.test(next.type.name)) {
    return true;
  }
  return false;
}

/** Insert an empty paragraph after every table and at the end of the doc. */
export function ensureEditableGaps(editor: Editor): void {
  const { doc, schema } = editor.state;
  const para = schema.nodes.paragraph;
  if (!para) return;
  const inserts: number[] = [];
  doc.forEach((node, offset) => {
    if (node.type.name !== "table") return;
    const after = offset + node.nodeSize;
    const next = doc.nodeAt(after);
    const nextIsEmptyPara =
      next?.type.name === "paragraph" && next.content.size === 0;
    if (!nextIsEmptyPara) inserts.push(after);
  });
  const last = doc.lastChild;
  const lastEmptyPara =
    last?.type.name === "paragraph" && last.content.size === 0;
  if (!lastEmptyPara) inserts.push(doc.content.size);
  if (!inserts.length) return;
  let { tr } = editor.state;
  for (const pos of [...inserts].sort((a, b) => b - a)) {
    tr = tr.insert(pos, para.create());
  }
  editor.view.dispatch(tr);
}

/** `/query` at the start of the current textblock. Never opens inside a table. */
export function detectSlashCommand(
  editor: Editor,
): { query: string; from: number; to: number } | null {
  const { state } = editor;
  if (!state.selection.empty) return null;
  try {
    if (editor.isActive("table")) return null;
  } catch {
    /* older TipTap without table */
  }
  const $from = state.selection.$from;
  const textBefore = $from.parent.textBetween(0, $from.parentOffset, "\0", "\0");
  if (!isSlashCommandText(textBefore)) return null;
  const m = textBefore.match(/^\s*\/([^\n]*)$/);
  const query = m?.[1] ?? "";
  return {
    query,
    from: $from.start(),
    to: state.selection.from,
  };
}
