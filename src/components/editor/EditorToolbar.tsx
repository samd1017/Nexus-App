import { useEffect, useReducer, useState } from "react";
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
  AlignLeft,
  AlignCenter,
  AlignRight,
  BetweenHorizonalStart,
  BetweenHorizonalEnd,
  BetweenVerticalStart,
  BetweenVerticalEnd,
  Trash2,
  Rows3,
  Columns3,
  Heading,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  BULLET_STYLES,
  type BulletStyle,
  isBulletStyle,
} from "@/lib/markdown/bullet-styles";
import { InsertFieldDialog } from "./InsertFieldDialog";

type DialogKind = null | "link" | "image";

export function EditorToolbar({ editor }: { editor: Editor }) {
  const [, bump] = useReducer((n: number) => n + 1, 0);
  const [dialog, setDialog] = useState<DialogKind>(null);
  const [linkSeed, setLinkSeed] = useState("https://");

  useEffect(() => {
    const onUp = () => bump();
    editor.on("selectionUpdate", onUp);
    editor.on("transaction", onUp);
    editor.on("focus", onUp);
    return () => {
      editor.off("selectionUpdate", onUp);
      editor.off("transaction", onUp);
      editor.off("focus", onUp);
    };
  }, [editor]);

  const inTable = editor.isActive("table");
  const inBullet = editor.isActive("bulletList");
  const currentBullet = (() => {
    if (!inBullet) return "disc" as BulletStyle;
    const raw = editor.getAttributes("bulletList").bulletStyle;
    return isBulletStyle(raw) ? raw : "disc";
  })();

  const openLinkDialog = () => {
    const prev = (editor.getAttributes("link").href as string | undefined) || "";
    setLinkSeed(prev || "https://");
    setDialog("link");
  };

  const applyLink = (url: string) => {
    const href = url.trim();
    if (!href) {
      setDialog(null);
      return;
    }
    editor
      .chain()
      .focus()
      .extendMarkRange("link")
      .setLink({ href })
      .run();
    setDialog(null);
  };

  const removeLink = () => {
    editor.chain().focus().extendMarkRange("link").unsetLink().run();
    setDialog(null);
  };

  const applyImage = (src: string) => {
    const path = src.trim();
    if (!path) {
      setDialog(null);
      return;
    }
    editor.chain().focus().setImage({ src: path }).run();
    setDialog(null);
  };

  const btn = (
    active: boolean,
    onClick: () => void,
    icon: React.ReactNode,
    title: string,
    disabled?: boolean,
  ) => (
    <button
      type="button"
      title={title}
      disabled={disabled}
      onMouseDown={(e) => {
        e.preventDefault();
        if (!disabled) onClick();
      }}
      className={cn(
        "icon-btn h-7 w-7",
        active && "is-active",
        disabled && "pointer-events-none opacity-35",
      )}
    >
      {icon}
    </button>
  );

  return (
    <>
      <div className="flex flex-col gap-0 border-b border-[var(--border)]">
        <div className="flex flex-wrap items-center gap-0.5 px-3 py-1.5">
          {btn(
            editor.isActive("bold"),
            () => editor.chain().focus().toggleBold().run(),
            <Bold size={14} />,
            "Bold",
          )}
          {btn(
            editor.isActive("italic"),
            () => editor.chain().focus().toggleItalic().run(),
            <Italic size={14} />,
            "Italic",
          )}
          <Sep />
          {btn(
            editor.isActive("heading", { level: 1 }),
            () => editor.chain().focus().toggleHeading({ level: 1 }).run(),
            <Heading1 size={14} />,
            "Heading 1",
          )}
          {btn(
            editor.isActive("heading", { level: 2 }),
            () => editor.chain().focus().toggleHeading({ level: 2 }).run(),
            <Heading2 size={14} />,
            "Heading 2",
          )}
          {btn(
            editor.isActive("heading", { level: 3 }),
            () => editor.chain().focus().toggleHeading({ level: 3 }).run(),
            <Heading3 size={14} />,
            "Heading 3",
          )}
          <Sep />
          {btn(
            editor.isActive({ textAlign: "left" }),
            () => editor.chain().focus().setTextAlign("left").run(),
            <AlignLeft size={14} />,
            "Align left",
          )}
          {btn(
            editor.isActive({ textAlign: "center" }),
            () => editor.chain().focus().setTextAlign("center").run(),
            <AlignCenter size={14} />,
            "Align center",
          )}
          {btn(
            editor.isActive({ textAlign: "right" }),
            () => editor.chain().focus().setTextAlign("right").run(),
            <AlignRight size={14} />,
            "Align right",
          )}
          <Sep />
          {btn(
            inBullet,
            () => editor.chain().focus().toggleBulletList().run(),
            <List size={14} />,
            "Bullet list",
          )}
          {btn(
            editor.isActive("orderedList"),
            () => editor.chain().focus().toggleOrderedList().run(),
            <ListOrdered size={14} />,
            "Ordered list",
          )}
          {btn(
            editor.isActive("taskList"),
            () => editor.chain().focus().toggleTaskList().run(),
            <ListChecks size={14} />,
            "Task list",
          )}
          <Sep />
          {btn(
            editor.isActive("codeBlock"),
            () => editor.chain().focus().toggleCodeBlock().run(),
            <Code2 size={14} />,
            "Code block",
          )}
          {btn(
            editor.isActive("blockquote"),
            () => editor.chain().focus().toggleBlockquote().run(),
            <Quote size={14} />,
            "Quote",
          )}
          {btn(
            false,
            () => editor.chain().focus().setHorizontalRule().run(),
            <Minus size={14} />,
            "Divider",
          )}
          <Sep />
          {btn(
            editor.isActive("link"),
            openLinkDialog,
            <Link2 size={14} />,
            "Link",
          )}
          {btn(
            false,
            () => setDialog("image"),
            <ImageIcon size={14} />,
            "Image",
          )}
          {btn(
            inTable,
            () => {
              if (inTable) return;
              editor
                .chain()
                .focus()
                .insertTable({ rows: 3, cols: 3, withHeaderRow: true })
                .run();
            },
            <TableIcon size={14} />,
            inTable ? "Table selected" : "Insert table",
          )}
        </div>

        {inBullet ? (
          <div className="flex flex-wrap items-center gap-1 border-t border-[var(--border)] bg-[rgba(123,97,255,0.05)] px-3 py-1.5">
            <span className="mr-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--accent-violet)]">
              Bullets
            </span>
            {BULLET_STYLES.map((b) => (
              <button
                key={b.id}
                type="button"
                title={`${b.label} bullets`}
                onMouseDown={(e) => {
                  e.preventDefault();
                  editor.chain().focus().setBulletStyle(b.id).run();
                }}
                className={cn(
                  "inline-flex h-7 min-w-7 items-center justify-center gap-1 rounded-md border px-2 text-[12px] transition-colors",
                  currentBullet === b.id
                    ? "border-[rgba(0,200,255,0.45)] bg-[rgba(0,200,255,0.12)] text-[var(--accent)]"
                    : "border-transparent bg-white/[0.03] text-[var(--text-secondary)] hover:border-[var(--border)] hover:text-[var(--text-primary)]",
                )}
              >
                <span className="text-[13px] leading-none" aria-hidden>
                  {b.sample}
                </span>
                <span className="hidden sm:inline">{b.label}</span>
              </button>
            ))}
          </div>
        ) : null}

        {inTable ? (
          <div className="flex flex-wrap items-center gap-0.5 border-t border-[var(--border)] bg-[rgba(0,200,255,0.04)] px-3 py-1.5">
            <span className="mr-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--accent)]">
              Table
            </span>
            {btn(
              false,
              () => editor.chain().focus().addColumnBefore().run(),
              <BetweenHorizonalStart size={14} />,
              "Add column before",
            )}
            {btn(
              false,
              () => editor.chain().focus().addColumnAfter().run(),
              <BetweenHorizonalEnd size={14} />,
              "Add column after",
            )}
            {btn(
              false,
              () => editor.chain().focus().deleteColumn().run(),
              <Columns3 size={14} />,
              "Delete column",
            )}
            <Sep />
            {btn(
              false,
              () => editor.chain().focus().addRowBefore().run(),
              <BetweenVerticalStart size={14} />,
              "Add row before",
            )}
            {btn(
              false,
              () => editor.chain().focus().addRowAfter().run(),
              <BetweenVerticalEnd size={14} />,
              "Add row after",
            )}
            {btn(
              false,
              () => editor.chain().focus().deleteRow().run(),
              <Rows3 size={14} />,
              "Delete row",
            )}
            <Sep />
            {btn(
              false,
              () => editor.chain().focus().toggleHeaderRow().run(),
              <Heading size={14} />,
              "Toggle header row",
            )}
            {btn(
              editor.isActive({ textAlign: "left" }),
              () => editor.chain().focus().setTextAlign("left").run(),
              <AlignLeft size={14} />,
              "Cell align left",
            )}
            {btn(
              editor.isActive({ textAlign: "center" }),
              () => editor.chain().focus().setTextAlign("center").run(),
              <AlignCenter size={14} />,
              "Cell align center",
            )}
            {btn(
              editor.isActive({ textAlign: "right" }),
              () => editor.chain().focus().setTextAlign("right").run(),
              <AlignRight size={14} />,
              "Cell align right",
            )}
            <Sep />
            {btn(
              false,
              () => editor.chain().focus().deleteTable().run(),
              <Trash2 size={14} />,
              "Delete table",
            )}
          </div>
        ) : null}
      </div>

      <InsertFieldDialog
        open={dialog === "link"}
        title="Add link"
        label="URL"
        placeholder="https://example.com"
        initialValue={linkSeed}
        confirmLabel="Apply link"
        secondaryLabel={editor.isActive("link") ? "Remove link" : undefined}
        onSecondary={editor.isActive("link") ? removeLink : undefined}
        onConfirm={applyLink}
        onClose={() => setDialog(null)}
      />
      <InsertFieldDialog
        open={dialog === "image"}
        title="Insert image"
        label="Image path or URL"
        placeholder="assets/photo.png or https://…"
        initialValue="assets/"
        confirmLabel="Insert image"
        onConfirm={applyImage}
        onClose={() => setDialog(null)}
      />
    </>
  );
}

function Sep() {
  return <div className="mx-1 h-4 w-px bg-[var(--border)]" />;
}
