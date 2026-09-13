/**
 * First-class vault attachments — images, PDFs, and other files referenced
 * from notes or stored under assets/.
 */

import type { VaultNode } from "./types";

export type AttachmentKind = "image" | "pdf" | "file";

export type VaultAttachment = {
  path: string;
  name: string;
  kind: AttachmentKind;
  ext: string;
  size?: number;
  /** Notes that embed or link this file */
  usedBy: string[];
  demo?: boolean;
};

const IMAGE_EXT = new Set([
  "png",
  "jpg",
  "jpeg",
  "gif",
  "webp",
  "svg",
  "bmp",
  "avif",
  "ico",
]);

export function extOf(path: string): string {
  const base = path.split("/").pop() || path;
  const dot = base.lastIndexOf(".");
  return dot >= 0 ? base.slice(dot + 1).toLowerCase() : "";
}

export function attachmentKind(path: string): AttachmentKind {
  const ext = extOf(path);
  if (IMAGE_EXT.has(ext)) return "image";
  if (ext === "pdf") return "pdf";
  return "file";
}

/** Vault-relative image/PDF href (not http/data). Used to open the Files rail. */
export function isVaultAttachmentHref(href: string): boolean {
  const raw = (href || "").trim();
  if (!raw || raw.startsWith("http") || raw.startsWith("data:") || raw.startsWith("blob:")) {
    return false;
  }
  const path = raw.replace(/^\.\//, "").replace(/^\/+/, "").split(/[?#]/)[0] ?? "";
  const kind = attachmentKind(path);
  return kind === "image" || kind === "pdf";
}

const SKIP_PREFIX = /^(?:\.nexus\/|\.trash\/)/;

/** Collect vault-relative file refs from Markdown (images, links, wikilinks). */
export function extractAttachmentPaths(markdown: string): string[] {
  const out = new Set<string>();
  const md = markdown || "";
  const add = (raw: string) => {
    let p = raw.trim().replace(/\\/g, "/");
    if (!p || p.startsWith("http") || p.startsWith("data:") || p.startsWith("blob:")) {
      return;
    }
    p = p.replace(/^\.\//, "").replace(/^\/+/, "");
    if (!p || SKIP_PREFIX.test(p) || p.toLowerCase().endsWith(".md")) return;
    if (!p.includes(".") || p.includes(" ")) {
      // allow assets/foo.pdf style; skip bare wikilink note names
      if (!p.includes("/")) return;
    }
    out.add(p);
  };

  const imgRe = /!\[[^\]]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g;
  let m: RegExpExecArray | null;
  while ((m = imgRe.exec(md))) add(m[1] ?? "");

  const linkRe = /(?<!!)\[[^\]]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g;
  while ((m = linkRe.exec(md))) add(m[1] ?? "");

  const htmlRe = /(?:src|href|data-vault-src)="([^"]+)"/gi;
  while ((m = htmlRe.exec(md))) add(m[1] ?? "");

  const wikiFile = /!?\[\[([^\]|#]+\.[A-Za-z0-9]{2,8})(?:\|[^\]]+)?\]\]/g;
  while ((m = wikiFile.exec(md))) add(m[1] ?? "");

  return [...out];
}

export function collectAttachmentsFromNotes(
  nodes: Record<string, VaultNode>,
): VaultAttachment[] {
  const byPath = new Map<string, VaultAttachment>();
  const upsert = (path: string, noteId?: string, extra?: Partial<VaultAttachment>) => {
    const norm = path.replace(/\\/g, "/").replace(/^\/+/, "");
    if (!norm || SKIP_PREFIX.test(norm)) return;
    const name = norm.split("/").pop() || norm;
    const existing = byPath.get(norm);
    if (existing) {
      if (noteId && !existing.usedBy.includes(noteId)) existing.usedBy.push(noteId);
      if (extra?.size != null) existing.size = extra.size;
      if (extra?.demo) existing.demo = true;
      return;
    }
    byPath.set(norm, {
      path: norm,
      name,
      kind: attachmentKind(norm),
      ext: extOf(norm),
      usedBy: noteId ? [noteId] : [],
      ...extra,
    });
  };

  for (const n of Object.values(nodes)) {
    if (n.kind !== "note" || typeof n.content !== "string") continue;
    for (const p of extractAttachmentPaths(n.content)) upsert(p, n.id);
  }
  return [...byPath.values()].sort((a, b) => a.path.localeCompare(b.path));
}

export function mergeAttachmentLists(
  ...lists: VaultAttachment[][]
): VaultAttachment[] {
  const byPath = new Map<string, VaultAttachment>();
  for (const list of lists) {
    for (const item of list) {
      const existing = byPath.get(item.path);
      if (!existing) {
        byPath.set(item.path, { ...item, usedBy: [...item.usedBy] });
        continue;
      }
      for (const id of item.usedBy) {
        if (!existing.usedBy.includes(id)) existing.usedBy.push(id);
      }
      if (item.size != null) existing.size = item.size;
      if (item.demo) existing.demo = true;
    }
  }
  return [...byPath.values()].sort((a, b) => a.path.localeCompare(b.path));
}

/** In-memory demo files so the Attachments rail is useful without a disk vault. */
export function demoAttachmentCatalog(): VaultAttachment[] {
  return [
    {
      path: "assets/nexus-mark.svg",
      name: "nexus-mark.svg",
      kind: "image",
      ext: "svg",
      usedBy: [],
      demo: true,
    },
    {
      path: "assets/agent-brief.pdf",
      name: "agent-brief.pdf",
      kind: "pdf",
      ext: "pdf",
      usedBy: [],
      demo: true,
    },
  ];
}
