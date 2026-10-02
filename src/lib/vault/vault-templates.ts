/**
 * Vault templates: every Markdown note inside the templates folder (any
 * depth). The folder is a setting; `Templates` until the user picks another.
 * They are ordinary notes; using one copies its text.
 */

export const TEMPLATES_FOLDER = "Templates";

/** A template with one of these names shapes new daily notes. */
export const DAILY_TEMPLATE_NAMES = ["daily", "daily note"];

export type VaultTemplate = { id: string; path: string; name: string };

type NodeLike = { id: string; kind: string; path: string };

/** A vault-relative folder path such as `Meta/Templates`. Empty falls back to `Templates`. */
export function normalizeTemplateFolder(raw: string | null | undefined): string {
  const parts = String(raw ?? "")
    .replace(/\\/g, "/")
    .split("/")
    .map((p) => p.replace(/[\p{Cc}<>:"|?*]/gu, "").trim())
    .filter((p) => p && p !== "." && p !== "..");
  const path = parts.join("/");
  return path && path.length <= 200 ? path : TEMPLATES_FOLDER;
}

function folderKey(path: string): string {
  return path.replace(/\\/g, "/").replace(/^\/+|\/+$/g, "").toLowerCase();
}

export function isTemplatesFolderPath(path: string, folder: string = TEMPLATES_FOLDER): boolean {
  return folderKey(path) === folderKey(normalizeTemplateFolder(folder));
}

export function isTemplatePath(path: string, folder: string = TEMPLATES_FOLDER): boolean {
  const prefix = `${folderKey(normalizeTemplateFolder(folder))}/`;
  const p = path.replace(/\\/g, "/").replace(/^\/+/, "");
  return p.toLowerCase().startsWith(prefix) && p.length > prefix.length && /\.md$/i.test(p);
}

export function templateName(path: string): string {
  const base = path.replace(/\\/g, "/").split("/").pop() ?? path;
  return base.replace(/\.md$/i, "");
}

export function listVaultTemplates(
  nodes: Record<string, NodeLike>,
  folder: string = TEMPLATES_FOLDER,
): VaultTemplate[] {
  const out: VaultTemplate[] = [];
  for (const n of Object.values(nodes)) {
    if (n.kind !== "note" || !isTemplatePath(n.path, folder)) continue;
    out.push({ id: n.id, path: n.path, name: templateName(n.path) });
  }
  return out.sort(
    (a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }) || a.path.localeCompare(b.path),
  );
}

export function findTemplateNamed(
  templates: readonly VaultTemplate[],
  names: readonly string[],
): VaultTemplate | null {
  const wanted = new Set(names.map((n) => n.trim().toLowerCase()));
  return templates.find((t) => wanted.has(t.name.trim().toLowerCase())) ?? null;
}

export function templatesFolderNode<T extends NodeLike>(
  nodes: Record<string, T>,
  folder: string = TEMPLATES_FOLDER,
): T | null {
  for (const n of Object.values(nodes)) {
    if (n.kind === "folder" && isTemplatesFolderPath(n.path, folder)) return n;
  }
  return null;
}
