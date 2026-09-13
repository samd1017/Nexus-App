import { useEffect, useMemo, useState } from "react";
import { File, FileText, Image as ImageIcon, Paperclip } from "lucide-react";
import { useVaultStore, getDesktopRoot, getFsaRoot } from "@/lib/vault/store";
import {
  collectAttachmentsFromNotes,
  demoAttachmentCatalog,
  mergeAttachmentLists,
  type VaultAttachment,
} from "@/lib/vault/attachments";
import { resolveVaultImageUrl } from "@/lib/vault/image-import";
import { EmptyState } from "@/components/ui/EmptyState";
import { cn } from "@/lib/utils";

function KindIcon({ kind }: { kind: VaultAttachment["kind"] }) {
  if (kind === "image") return <ImageIcon size={14} />;
  if (kind === "pdf") return <FileText size={14} />;
  return <File size={14} />;
}

export function AttachmentsRail() {
  const nodes = useVaultStore((s) => s.nodes);
  const mode = useVaultStore((s) => s.mode);
  const setActiveNote = useVaultStore((s) => s.setActiveNote);
  const setToast = useVaultStore((s) => s.setToast);
  const [disk, setDisk] = useState<VaultAttachment[]>([]);
  const [preview, setPreview] = useState<VaultAttachment | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const fromNotes = useMemo(() => collectAttachmentsFromNotes(nodes), [nodes]);

  useEffect(() => {
    let cancelled = false;
    void listDiskAttachments(mode).then((rows) => {
      if (!cancelled) setDisk(rows);
    });
    return () => {
      cancelled = true;
    };
  }, [mode, nodes]);

  const items = useMemo(() => {
    const seeded = mode === "demo" ? demoAttachmentCatalog() : [];
    return mergeAttachmentLists(fromNotes, disk, seeded);
  }, [fromNotes, disk, mode]);

  useEffect(() => {
    if (!preview || (preview.kind !== "image" && preview.kind !== "pdf")) {
      setPreviewUrl(null);
      return;
    }
    let revoked: string | null = null;
    void resolveVaultImageUrl(preview.path).then((url) => {
        if (url) {
        revoked = url.startsWith("blob:") ? url : null;
        setPreviewUrl(url);
      } else if (preview.demo && preview.path.endsWith(".svg")) {
        setPreviewUrl("/favicon.svg");
      } else if (preview.demo && preview.path.endsWith(".pdf")) {
        setPreviewUrl("/demo/agent-brief.pdf");
      }
    });
    return () => {
      if (revoked) URL.revokeObjectURL(revoked);
    };
  }, [preview]);

  if (!items.length) {
    return (
      <EmptyState
        icon={<Paperclip size={22} />}
        title="No attachments yet"
        description="Paste or drop images and PDFs into a note. They land in assets/ and open here."
        compact
      />
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <ul className="min-h-0 flex-1 space-y-0.5 overflow-auto px-2 py-2">
        {items.map((a) => (
          <li key={a.path}>
            <button
              type="button"
              className={cn(
                "flex w-full items-start gap-2 rounded-[10px] px-2 py-1.5 text-left hover:bg-white/[0.04]",
                preview?.path === a.path && "bg-white/[0.05]",
              )}
              onClick={() => setPreview(a)}
            >
              <span className="mt-0.5 text-[var(--accent)]">
                <KindIcon kind={a.kind} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[12.5px] text-[var(--text-primary)]">
                  {a.name}
                </span>
                <span className="block truncate font-mono text-[10px] text-[var(--text-muted)]">
                  {a.path}
                  {a.demo ? " · demo" : ""}
                </span>
              </span>
            </button>
          </li>
        ))}
      </ul>
      {preview ? (
        <div className="shrink-0 border-t border-[var(--border)] px-3 py-2">
          <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]">
            Preview
          </div>
          <div className="mt-1 text-[12px] text-[var(--text-secondary)]">{preview.name}</div>
          {preview.kind === "image" && previewUrl ? (
            <img
              src={previewUrl}
              alt={preview.name}
              className="mt-2 max-h-40 w-full rounded-md object-contain"
            />
          ) : preview.kind === "pdf" && previewUrl ? (
            <iframe
              title={preview.name}
              src={previewUrl}
              className="mt-2 h-48 w-full rounded-md border border-[var(--border)] bg-[var(--bg-deepest)]"
            />
          ) : preview.kind === "pdf" ? (
            <p className="mt-2 text-[12px] text-[var(--text-muted)]">
              PDF in the vault folder. Drop one into a note to preview it here, or open the referencing note.
            </p>
          ) : (
            <p className="mt-2 text-[12px] text-[var(--text-muted)]">
              Binary file stored next to your Markdown.
            </p>
          )}
          {preview.usedBy[0] ? (
            <button
              type="button"
              className="mt-2 text-[12px] text-[var(--accent)] hover:underline"
              onClick={() => setActiveNote(preview.usedBy[0])}
            >
              Open referencing note
            </button>
          ) : preview.demo ? (
            <button
              type="button"
              className="mt-2 text-[12px] text-[var(--accent)] hover:underline"
              onClick={() => {
                setToast("Demo file — import a real folder to browse disk attachments");
              }}
            >
              Demo sample
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

async function listDiskAttachments(
  mode: string,
): Promise<VaultAttachment[]> {
  const out: VaultAttachment[] = [];
  try {
    if (mode === "desktop") {
      const root = getDesktopRoot();
      if (!root) return out;
      const { readDir } = await import("@tauri-apps/plugin-fs");
      const assets = `${root.replace(/\\/g, "/")}/assets`;
      const entries = await readDir(assets).catch(() => []);
      for (const e of entries) {
        if (!e.name || e.isDirectory) continue;
        const path = `assets/${e.name}`;
        out.push({
          path,
          name: e.name,
          kind: path.toLowerCase().endsWith(".pdf")
            ? "pdf"
            : /\.(png|jpe?g|gif|webp|svg|bmp|avif)$/i.test(e.name)
              ? "image"
              : "file",
          ext: (e.name.split(".").pop() || "").toLowerCase(),
          usedBy: [],
        });
      }
    } else if (mode === "fsa") {
      const root = getFsaRoot() as FileSystemDirectoryHandle | null;
      if (!root) return out;
      let assets: FileSystemDirectoryHandle;
      try {
        assets = await root.getDirectoryHandle("assets");
      } catch {
        return out;
      }
      for await (const [name, handle] of assets.entries()) {
        if (handle.kind !== "file") continue;
        const file = await (handle as FileSystemFileHandle).getFile();
        out.push({
          path: `assets/${name}`,
          name,
          kind: name.toLowerCase().endsWith(".pdf")
            ? "pdf"
            : /\.(png|jpe?g|gif|webp|svg|bmp|avif)$/i.test(name)
              ? "image"
              : "file",
          ext: (name.split(".").pop() || "").toLowerCase(),
          size: file.size,
          usedBy: [],
        });
      }
    }
  } catch {
    /* listing is best-effort */
  }
  return out;
}
