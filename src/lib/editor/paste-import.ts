/**
 * Visual editor paste / drop helpers.
 * Images → vault assets via importImageFile; Markdown plain text → TipTap HTML.
 */

import type { Editor } from "@tiptap/react";
import type { EditorView } from "@tiptap/pm/view";
import { markdownWithWikilinksToHtml } from "@/lib/markdown/serialize";
import {
  importImageFile,
  type ImportedImage,
} from "@/lib/vault/image-import";

const IMAGE_MIME = /^image\//i;
const ATTACH_EXT =
  /\.(png|jpe?g|gif|webp|bmp|avif|svg|pdf|txt|md|csv|json)$/i;

/** Heuristic: clipboard looks like Markdown rather than plain prose. */
export function looksLikeMarkdown(text: string): boolean {
  const t = text.trim();
  if (!t) return false;
  if (/^#{1,6}\s+\S/m.test(t)) return true;
  if (/^```/m.test(t)) return true;
  if (/^\s*[-*+]\s+\S/m.test(t)) return true;
  if (/^\s*\d+\.\s+\S/m.test(t)) return true;
  if (/^\s*[-*+]\s+\[[ xX]\]\s+/m.test(t)) return true;
  if (/\[\[[^\]]+\]\]/.test(t)) return true;
  if (/^\|.+\|/m.test(t) && /\|[-:]+/.test(t)) return true;
  if (/!\[[^\]]*\]\([^)]+\)/.test(t)) return true;
  if (/\[[^\]]+\]\([^)]+\)/.test(t)) return true;
  if (/^>\s+\S/m.test(t)) return true;
  if (/(\*\*[^*]+\*\*|__[^_]+__|`[^`]+`)/.test(t)) return true;
  return false;
}

function attachmentFilesFromList(list: DataTransferItemList | undefined): File[] {
  if (!list?.length) return [];
  const out: File[] = [];
  for (let i = 0; i < list.length; i++) {
    const item = list[i];
    if (!item || item.kind !== "file") continue;
    const file = item.getAsFile();
    if (
      file &&
      (IMAGE_MIME.test(file.type) ||
        file.type === "application/pdf" ||
        item.type === "" ||
        ATTACH_EXT.test(file.name))
    ) {
      out.push(file);
    }
  }
  return out;
}

function attachmentFilesFromFileList(list: FileList | undefined): File[] {
  if (!list?.length) return [];
  return Array.from(list).filter(
    (f) =>
      IMAGE_MIME.test(f.type) ||
      f.type === "application/pdf" ||
      ATTACH_EXT.test(f.name),
  );
}

/** Insert one imported image at the current selection (or given pos). */
export function insertImportedImage(
  editor: Editor,
  imported: ImportedImage,
  pos?: number,
): void {
  const vaultSrc = imported.vaultPath.startsWith("data:")
    ? null
    : imported.vaultPath;
  const attrs = {
    src: imported.previewUrl,
    alt: imported.alt,
    vaultSrc,
  };

  if (typeof pos === "number") {
    editor
      .chain()
      .focus()
      .insertContentAt(pos, {
        type: "image",
        attrs,
      })
      .run();
  } else {
    editor
      .chain()
      .focus()
      .setImage(attrs)
      .run();
  }

  if (!vaultSrc) return;
  requestAnimationFrame(() => {
    if (editor.isDestroyed) return;
    try {
      const imgs = editor.view.dom.querySelectorAll("img");
      const last = imgs[imgs.length - 1] as HTMLImageElement | undefined;
      if (!last) return;
      last.setAttribute("data-vault-src", vaultSrc);
      last.setAttribute("src", imported.previewUrl);
      last.setAttribute("alt", imported.alt);
    } catch {
      /* TipTap view not available */
    }
  });
}

function isImageFile(file: File): boolean {
  return IMAGE_MIME.test(file.type) || /\.(png|jpe?g|gif|webp|bmp|avif|svg)$/i.test(file.name);
}

async function importAndInsertAttachments(
  editor: Editor,
  files: File[],
  pos?: number,
): Promise<boolean> {
  if (!files.length) return false;
  let inserted = 0;
  let at = pos;
  for (const file of files) {
    const imported = await importImageFile(file);
    if (!imported || editor.isDestroyed) continue;
    if (isImageFile(file)) {
      insertImportedImage(editor, imported, at);
    } else {
      const href = imported.vaultPath.startsWith("data:")
        ? imported.previewUrl
        : imported.vaultPath;
      const label = imported.alt || file.name;
      const md = `[${label}](${href})`;
      if (typeof at === "number") {
        editor.chain().focus().insertContentAt(at, md).run();
      } else {
        editor.chain().focus().insertContent(md).run();
      }
    }
    inserted += 1;
    if (typeof at === "number") {
      try {
        at = editor.state.selection.to;
      } catch {
        at = undefined;
      }
    }
  }
  return inserted > 0;
}

/**
 * TipTap handlePaste: vault image import + Markdown plain-text paste.
 * Returns true when the event was handled.
 */
export function handleVisualPaste(
  editor: Editor,
  view: EditorView,
  event: ClipboardEvent,
): boolean {
  const dt = event.clipboardData;
  if (!dt) return false;

  const attachmentFiles = [
    ...attachmentFilesFromList(dt.items),
    ...attachmentFilesFromFileList(dt.files),
  ];
  const seen = new Set<string>();
  const uniqueFiles = attachmentFiles.filter((f) => {
    const key = `${f.name}:${f.size}:${f.lastModified}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  if (uniqueFiles.length) {
    event.preventDefault();
    void importAndInsertAttachments(editor, uniqueFiles);
    return true;
  }

  const html = dt.getData("text/html")?.trim() ?? "";
  const text = dt.getData("text/plain") ?? "";
  // Prefer TipTap's HTML path for rich sources (Word, browsers, Notion)
  if (html) return false;
  if (!looksLikeMarkdown(text)) return false;

  event.preventDefault();
  const converted = markdownWithWikilinksToHtml(text);
  if (!converted.trim()) return false;
  editor.chain().focus().insertContent(converted).run();
  return true;
}

/**
 * TipTap handleDrop: import dropped image files into vault assets.
 * Returns true when the event was handled.
 */
export function handleVisualDrop(
  editor: Editor,
  view: EditorView,
  event: DragEvent,
  _slice: unknown,
  moved: boolean,
): boolean {
  if (moved) return false;
  const dt = event.dataTransfer;
  if (!dt) return false;

  const files = attachmentFilesFromFileList(dt.files);
  if (!files.length) return false;

  event.preventDefault();
  const coords = view.posAtCoords({
    left: event.clientX,
    top: event.clientY,
  });
  const pos = coords?.pos;
  void importAndInsertAttachments(editor, files, pos);
  return true;
}
