import type { Editor } from "@tiptap/react";
import {
  Bold,
  Italic,
  Heading1,
  Heading2,
  Heading3,
  List,
  ListOrdered,
  ListChecks,
  Code2,
  Quote,
  Minus,
  Link2,
  Image as ImageIcon,
  Table as TableIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

export function EditorToolbar({ editor }: { editor: Editor }) {
  const btn = (
    active: boolean,
    onClick: () => void,
    icon: React.ReactNode,
    title: string,
  ) => (
    <button
      type="button"
      title={title}
      onMouseDown={(e) => {
        e.preventDefault();
        onClick();
      }}
      className={cn("icon-btn h-7 w-7", active && "is-active")}
    >
      {icon}
    </button>
  );

  return (
    <div className="flex flex-wrap items-center gap-0.5 border-b border-[var(--border)] px-3 py-1.5">
      {btn(editor.isActive("bold"), () => editor.chain().focus().toggleBold().run(), <Bold size={14} />, "Bold")}
      {btn(editor.isActive("italic"), () => editor.chain().focus().toggleItalic().run(), <Italic size={14} />, "Italic")}
      <Sep />
      {btn(editor.isActive("heading", { level: 1 }), () => editor.chain().focus().toggleHeading({ level: 1 }).run(), <Heading1 size={14} />, "Heading 1")}
      {btn(editor.isActive("heading", { level: 2 }), () => editor.chain().focus().toggleHeading({ level: 2 }).run(), <Heading2 size={14} />, "Heading 2")}
      {btn(editor.isActive("heading", { level: 3 }), () => editor.chain().focus().toggleHeading({ level: 3 }).run(), <Heading3 size={14} />, "Heading 3")}
      <Sep />
      {btn(editor.isActive("bulletList"), () => editor.chain().focus().toggleBulletList().run(), <List size={14} />, "Bullet list")}
      {btn(editor.isActive("orderedList"), () => editor.chain().focus().toggleOrderedList().run(), <ListOrdered size={14} />, "Ordered list")}
      {btn(editor.isActive("taskList"), () => editor.chain().focus().toggleTaskList().run(), <ListChecks size={14} />, "Task list")}
      <Sep />
      {btn(editor.isActive("codeBlock"), () => editor.chain().focus().toggleCodeBlock().run(), <Code2 size={14} />, "Code block")}
      {btn(editor.isActive("blockquote"), () => editor.chain().focus().toggleBlockquote().run(), <Quote size={14} />, "Quote")}
      {btn(false, () => editor.chain().focus().setHorizontalRule().run(), <Minus size={14} />, "Divider")}
      <Sep />
      {btn(editor.isActive("link"), () => {
        const prev = editor.getAttributes("link").href as string | undefined;
        const url = window.prompt("URL", prev || "https://");
        if (url === null) return;
        if (url === "") {
          editor.chain().focus().extendMarkRange("link").unsetLink().run();
          return;
        }
        editor.chain().focus().extendMarkRange("link").setLink({ href: url }).run();
      }, <Link2 size={14} />, "Link")}
      {btn(false, () => {
        const src = window.prompt("Image path (relative, e.g. assets/photo.png)", "assets/");
        if (!src) return;
        editor.chain().focus().setImage({ src }).run();
      }, <ImageIcon size={14} />, "Image")}
      {btn(false, () => {
        editor
          .chain()
          .focus()
          .insertTable({ rows: 3, cols: 3, withHeaderRow: true })
          .run();
      }, <TableIcon size={14} />, "Table")}
    </div>
  );
}

function Sep() {
  return <div className="mx-1 h-4 w-px bg-[var(--border)]" />;
}
