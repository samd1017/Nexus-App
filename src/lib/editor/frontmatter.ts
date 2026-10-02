/** Simple YAML-ish frontmatter helpers. Nested YAML is treated as raw. */

export type FrontmatterField = { key: string; value: string };

const PROPERTY_KEYS = new Set([
  "title",
  "tags",
  "status",
  "type",
  "created",
  "updated",
  "aliases",
  "cssclass",
  "cssclasses",
  "date",
  "description",
  "publish",
]);

/**
 * A leading ``` fence whose lines are all `key: value`, and at least one key
 * is a real property name, is frontmatter that a visual round-trip wrapped.
 * Leave ordinary code samples alone.
 */
function peelPropertyFence(raw: string): { yaml: string; body: string } | null {
  const m = raw.match(/^```[^\n]*\r?\n([\s\S]*?)\r?\n```[ \t]*(?:\r?\n|$)/);
  if (!m) return null;
  const yaml = m[1] ?? "";
  const lines = yaml.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (lines.length < 2) return null;
  let known = 0;
  for (const line of lines) {
    const km = /^([A-Za-z_][\w-]*)\s*:\s*\S/.exec(line);
    if (!km) return null;
    if (PROPERTY_KEYS.has(km[1].toLowerCase())) known += 1;
  }
  if (known < 1) return null;
  return { yaml, body: raw.slice(m[0].length) };
}

export function splitFrontmatter(md: string): {
  yaml: string | null;
  body: string;
} {
  const raw = (md || "").replace(/^\uFEFF/, "");
  const m = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (m) return { yaml: m[1] ?? "", body: raw.slice(m[0].length) };
  const fenced = peelPropertyFence(raw);
  if (fenced) return { yaml: fenced.yaml, body: fenced.body };
  return { yaml: null, body: raw };
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
