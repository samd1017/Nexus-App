/** Simple YAML-ish frontmatter helpers. Nested YAML is treated as raw. */

export type FrontmatterField = { key: string; value: string };

export function splitFrontmatter(md: string): {
  yaml: string | null;
  body: string;
} {
  const raw = (md || "").replace(/^\uFEFF/, "");
  const m = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (!m) return { yaml: null, body: raw };
  return { yaml: m[1] ?? "", body: raw.slice(m[0].length) };
}

export function parseFrontmatterFields(yaml: string): FrontmatterField[] {
  const fields: FrontmatterField[] = [];
  for (const line of yaml.split(/\r?\n/)) {
    if (!line.trim() || line.trimStart().startsWith("#")) continue;
    if (/^\s/.test(line)) continue;
    const i = line.indexOf(":");
    if (i <= 0) continue;
    const key = line.slice(0, i).trim();
    if (!/^[A-Za-z_][\w-]*$/.test(key)) continue;
    fields.push({ key, value: line.slice(i + 1).trim() });
  }
  return fields;
}

export function serializeFrontmatter(fields: FrontmatterField[]): string {
  const lines = fields
    .filter((f) => f.key.trim())
    .map((f) => `${f.key.trim()}: ${f.value}`.replace(/\s+$/, ""));
  return `---\n${lines.join("\n")}\n---\n`;
}

export function applyFrontmatter(md: string, fields: FrontmatterField[]): string {
  const { body } = splitFrontmatter(md);
  const has = fields.some((f) => f.key.trim());
  if (!has) return body.replace(/^\n+/, "");
  return serializeFrontmatter(fields) + (body.startsWith("\n") ? body : `\n${body}`);
}
