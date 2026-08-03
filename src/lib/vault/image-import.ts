/**
 * Import images into the vault via native file picker (Finder / Explorer / OS dialog).
 * Writes under assets/ and returns a vault-relative path for clean Markdown.
 */

import {
  getDesktopRoot,
  getFsaRoot,
  useVaultStore,
} from "@/lib/vault/store";
import { writeBinaryFile, readBinaryFile } from "@/lib/vault/fs-adapter";
import {
  pickDesktopImageFile,
  writeDesktopBinary,
  readDesktopBinary,
} from "@/lib/vault/tauri-adapter";
import { confirmDesktopShell } from "@/lib/platform";

const ASSET_DIR = "assets";
const previewCache = new Map<string, string>();

function sanitizeFileName(name: string): string {
  const base = name.replace(/\\/g, "/").split("/").pop() || "image.png";
  const cleaned = base.replace(/[^\w.\-()+ ]+/g, "_").replace(/\s+/g, "-");
  return cleaned || "image.png";
}

function uniqueAssetPath(fileName: string): string {
  const safe = sanitizeFileName(fileName);
  const dot = safe.lastIndexOf(".");
  const stem = dot > 0 ? safe.slice(0, dot) : safe;
  const ext = dot > 0 ? safe.slice(dot) : ".png";
  const stamp = Date.now().toString(36).slice(-5);
  return `${ASSET_DIR}/${stem}-${stamp}${ext}`;
}

function mimeFromName(name: string): string {
  const lower = name.toLowerCase();
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  if (lower.endsWith(".gif")) return "image/gif";
  if (lower.endsWith(".webp")) return "image/webp";
  if (lower.endsWith(".svg")) return "image/svg+xml";
  if (lower.endsWith(".bmp")) return "image/bmp";
  if (lower.endsWith(".avif")) return "image/avif";
  return "application/octet-stream";
}

function toBlobPart(data: Uint8Array): BlobPart {
  const copy = new Uint8Array(data.byteLength);
  copy.set(data);
  return copy;
}

function cachePreview(relPath: string, blob: Blob): string {
  const prev = previewCache.get(relPath);
  if (prev) URL.revokeObjectURL(prev);
  const url = URL.createObjectURL(blob);
  previewCache.set(relPath, url);
  return url;
}

export function getCachedPreviewUrl(relPath: string): string | null {
  return previewCache.get(relPath) ?? null;
}

/** Browser file picker (used when not in Tauri). */
function pickBrowserImageFile(): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.multiple = false;
    input.style.position = "fixed";
    input.style.left = "-9999px";
    document.body.appendChild(input);
    let settled = false;
    const done = (file: File | null) => {
      if (settled) return;
      settled = true;
      input.remove();
      resolve(file);
    };
    input.addEventListener("change", () => {
      done(input.files?.[0] ?? null);
    });
    window.addEventListener(
      "focus",
      () => {
        window.setTimeout(() => {
          if (!settled && !input.files?.length) done(null);
        }, 400);
      },
      { once: true },
    );
    input.click();
  });
}

export type ImportedImage = {
  /** Vault-relative path for Markdown, e.g. assets/photo-abc.png */
  vaultPath: string;
  /** Blob/data URL for immediate display in the editor */
  previewUrl: string;
  alt: string;
};

/**
 * Open OS file picker, copy image into vault assets/, return paths.
 * Demo / memory vault falls back to in-note data URL (no disk).
 */
export async function importImageFromPicker(): Promise<ImportedImage | null> {
  const desktop = await confirmDesktopShell();
  const mode = useVaultStore.getState().mode;
  const toast = (msg: string) => useVaultStore.getState().setToast(msg);

  if (desktop && getDesktopRoot()) {
    try {
      const picked = await pickDesktopImageFile();
      if (!picked) return null;
      const root = getDesktopRoot()!;
      const vaultPath = uniqueAssetPath(picked.name);
      await writeDesktopBinary(root, vaultPath, picked.data);
      const blob = new Blob([toBlobPart(picked.data)], {
        type: mimeFromName(picked.name),
      });
      const previewUrl = cachePreview(vaultPath, blob);
      toast(`Image saved to ${vaultPath}`);
      return {
        vaultPath,
        previewUrl,
        alt: sanitizeFileName(picked.name).replace(/\.[^.]+$/, ""),
      };
    } catch (err) {
      console.error("[nexus] desktop image import failed", err);
      toast("Could not import image");
      return null;
    }
  }

  const file = await pickBrowserImageFile();
  if (!file) return null;

  const fsa = getFsaRoot();
  if (mode === "fsa" && fsa) {
    try {
      const vaultPath = uniqueAssetPath(file.name);
      await writeBinaryFile(fsa, vaultPath, file);
      const previewUrl = cachePreview(vaultPath, file);
      toast(`Image saved to ${vaultPath}`);
      return {
        vaultPath,
        previewUrl,
        alt: sanitizeFileName(file.name).replace(/\.[^.]+$/, ""),
      };
    } catch (err) {
      console.error("[nexus] fsa image import failed", err);
      toast("Could not write image into vault folder");
    }
  }

  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
  if (mode === "demo" || mode === "local") {
    toast("Image embedded in note (open a folder vault to save as a file)");
  }
  return {
    vaultPath: dataUrl,
    previewUrl: dataUrl,
    alt: sanitizeFileName(file.name).replace(/\.[^.]+$/, ""),
  };
}

/** Resolve vault-relative image path → display URL for the visual editor. */
export async function resolveVaultImageUrl(
  src: string,
): Promise<string | null> {
  if (!src) return null;
  if (
    src.startsWith("http://") ||
    src.startsWith("https://") ||
    src.startsWith("data:") ||
    src.startsWith("blob:")
  ) {
    return src;
  }

  const cached = previewCache.get(src);
  if (cached) return cached;

  const desktopRoot = getDesktopRoot();
  if (desktopRoot) {
    try {
      const data = await readDesktopBinary(desktopRoot, src);
      const blob = new Blob([toBlobPart(data)], { type: mimeFromName(src) });
      return cachePreview(src, blob);
    } catch {
      return null;
    }
  }

  const fsa = getFsaRoot();
  if (fsa) {
    try {
      const blob = await readBinaryFile(fsa, src);
      return cachePreview(src, blob);
    } catch {
      return null;
    }
  }

  return null;
}
