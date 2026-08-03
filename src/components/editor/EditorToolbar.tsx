import { useEffect, useReducer, useState } from "react";
import type { Editor } from "@tiptap/react";
import * as Popover from "@radix-ui/react-popover";
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
  MoreHorizontal,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  BULLET_STYLES,
  type BulletStyle,
  isBulletStyle,
} from "@/lib/markdown/bullet-styles";
import { InsertFieldDialog } from "./InsertFieldDialog";
import { importImageFromPicker } from "@/lib/vault/image-import";

type DialogKind = null | "link";

export function EditorToolbar({ editor }: { editor: Editor }) {
  const [, bump] = useReducer((n: number) => n + 1, 0);
  const [dialog, setDialog] = useState<DialogKind>(null);
  const [linkSeed, setLinkSeed] = useState("https://");
  const [importingImage, setImportingImage] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);

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

  const moreActive =
    editor.isActive({ textAlign: "left" }) ||
    editor.isActive({ textAlign: "center" }) ||
    editor.isActive({ textAlign: "right" }) ||
    editor.isActive("codeBlock") ||
    editor.isActive("blockquote");

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
    editor.chain().focus().extendMarkRange("link").setLink({ href }).run();
    setDialog(null);
  };

  const removeLink = () => {
    editor.chain().focus().extendMarkRange("link").unsetLink().run();
    setDialog(null);
  };

  const pickAndInsertImage = async () => {
    if (importingImage) return;
    setImportingImage(true);
    try {
      const imported = await importImageFromPicker();
      if (!imported) return;
      editor
        .chain()
        .focus()
        .setImage({
          src: imported.previewUrl,
          alt: imported.alt,
          // @ts-expect-error vaultSrc is a custom attr on VaultImage
          vaultSrc: imported.vaultPath.startsWith("data:")
            ? null
            : imported.vaultPath,
        })
        .run();
      // Ensure data-vault-src lands on the DOM node for serialization
      requestAnimationFrame(() => {
        const imgs = editor.view.dom.querySelectorAll("img");
        const last = imgs[imgs.length - 1] as HTMLImageElement | undefined;
        if (last && imported.vaultPath && !imported.vaultPath.startsWith("data:")) {
          last.setAttribute("data-vault-src", imported.vaultPath);
          last.setAttribute("src", imported.previewUrl);
          last.setAttribute("alt", imported.alt);
        }
      });
    } finally {
      setImportingImage(false);
    }
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

  const moreItem = (
    active: boolean,
    onClick: () => void,
    icon: React.ReactNode,
    label: string,
  ) => (
    <button
      type="button"
      onMouseDown={(e) => {
        e.preventDefault();
        onClick();
        setMoreOpen(false);
      }}
      className={cn(
        "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[12.5px] transition-colors",
        active
          ? "bg-[rgba(0,200,255,0.12)] text-[var(--accent)]"
          : "text-[var(--text-secondary)] hover:bg-white/[0.05] hover:text-[var(--text-primary)]",
      )}
    >
      <span className="flex h-5 w-5 shrink-0 items-center justify-center opacity-80">
        {icon}
      </span>
      <span className="flex-1">{label}</span>
    </button>
  );

  return (
    <>
      <div className="flex flex-col gap-0 border-b border-[var(--border)]">
        <div className="flex flex-nowrap items-center gap-0.5 overflow-x-auto px-3 py-1.5">
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
            editor.isActive("link"),
            openLinkDialog,
            <Link2 size={14} />,
            "Link",
          )}
          {btn(
            importingImage,
            () => void pickAndInsertImage(),
            <ImageIcon size={14} />,
            importingImage ? "Importing image…" : "Insert image from file",
            importingImage,
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
          <Sep />
          <Popover.Root open={moreOpen} onOpenChange={setMoreOpen}>
            <Popover.Trigger asChild>
              <button
                type="button"
                title="More formatting"
                onMouseDown={(e) => e.preventDefault()}
                className={cn(
                  "icon-btn h-7 w-7",
                  (moreOpen || moreActive) && "is-active",
                )}
                aria-label="More formatting"
              >
                <MoreHorizontal size={14} />
              </button>
            </Popover.Trigger>
            <Popover.Portal>
              <Popover.Content
                side="bottom"
                align="end"
                sideOffset={6}
                className="z-[80] w-[200px] rounded-[12px] border border-[var(--border)] bg-[rgba(18,18,22,0.97)] p-1.5 shadow-[0_16px_48px_rgba(0,0,0,0.55)] backdrop-blur-xl"
                onOpenAutoFocus={(e) => e.preventDefault()}
              >
                <div className="px-2 pb-1 pt-0.5 text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--text-muted)]">
                  Align
                </div>
                {moreItem(
                  editor.isActive({ textAlign: "left" }),
                  () => editor.chain().focus().setTextAlign("left").run(),
                  <AlignLeft size={14} />,
                  "Align left",
                )}
                {moreItem(
                  editor.isActive({ textAlign: "center" }),
                  () => editor.chain().focus().setTextAlign("center").run(),
                  <AlignCenter size={14} />,
                  "Align center",
                )}
                {moreItem(
                  editor.isActive({ textAlign: "right" }),
                  () => editor.chain().focus().setTextAlign("right").run(),
                  <AlignRight size={14} />,
                  "Align right",
                )}
                <div className="my-1 h-px bg-[var(--border)]" />
                <div className="px-2 pb-1 pt-0.5 text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--text-muted)]">
                  Blocks
                </div>
                {moreItem(
                  editor.isActive("codeBlock"),
                  () => editor.chain().focus().toggleCodeBlock().run(),
                  <Code2 size={14} />,
                  "Code block",
                )}
                {moreItem(
                  editor.isActive("blockquote"),
                  () => editor.chain().focus().toggleBlockquote().run(),
                  <Quote size={14} />,
                  "Quote",
                )}
                {moreItem(
                  false,
                  () => editor.chain().focus().setHorizontalRule().run(),
                  <Minus size={14} />,
                  "Divider",
                )}
              </Popover.Content>
            </Popover.Portal>
          </Popover.Root>
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
    </>
  );
}

function Sep() {
  return <div className="mx-1 h-4 w-px shrink-0 bg-[var(--border)]" />;
}
