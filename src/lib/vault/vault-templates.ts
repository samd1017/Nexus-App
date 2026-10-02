/**
 * Vault templates: every Markdown note inside the top-level `Templates`
 * folder (any depth). They are ordinary notes; using one copies its text.
 */

export const TEMPLATES_FOLDER = "Templates";

/** A template with one of these names shapes new daily notes. */
export const DAILY_TEMPLATE_NAMES = ["daily", "daily note"];

export type VaultTemplate = { id: string; path: string; name: string };

type NodeLike = { id: string; kind: string; path: string };

export function isTemplatesFolderPath(path: string): boolean {
  return path.replace(/\\/g, "/").replace(/^\/+|\/+$/g, "").toLowerCase() === "templates";
}

export function isTemplatePath(path: string): boolean {
  const p = path.replace(/\\/g, "/").replace(/^\/+/, "");
  const slash = p.indexOf("/");
  return slash > 0 && isTemplatesFolderPath(p.slice(0, slash)) && /\.md$/i.test(p);
}

export function templateName(path: string): string {
  const base = path.replace(/\\/g, "/").split("/").pop() ?? path;
  return base.replace(/\.md$/i, "");
}

export function listVaultTemplates(nodes: Record<string, NodeLike>): VaultTemplate[] {
  const out: VaultTemplate[] = [];
  for (const n of Object.values(nodes)) {
    if (n.kind !== "note" || !isTemplatePath(n.path)) continue;
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

export function templatesFolderNode<T extends NodeLike>(nodes: Record<string, T>): T | null {
  for (const n of Object.values(nodes)) {
    if (n.kind === "folder" && isTemplatesFolderPath(n.path)) return n;
  }
  return null;
}
