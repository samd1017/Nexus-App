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

/** One list item as it would sit inside `[a, b]`. */
export function flowItem(item: string): string {
  const raw = item.trim();
  const text =
    raw.length >= 2 && ((raw.startsWith('"') && raw.endsWith('"')) || (raw.startsWith("'") && raw.endsWith("'")))
      ? raw.slice(1, -1)
      : raw;
  return /[,[\]{}"']|:(?:\s|$)|\s#|^[#&*!|>%@`]|^\s|\s$/.test(text) ? JSON.stringify(text) : text;
}

/** `- item` lines after an empty key, as `[a, b]`; "" when there are none. */
function blockListValue(lines: string[], from: number): string {
  const items: string[] = [];
  for (let i = from; i < lines.length; i += 1) {
    const line = lines[i] ?? "";
    if (!line.trim()) continue;
    const item = /^\s*-(?:\s+(.*))?$/.exec(line);
    if (!item) break;
    if (item[1]?.trim()) items.push(flowItem(item[1]));
  }
  return items.length ? `[${items.join(", ")}]` : "";
}

/** Top-level `key: value` pairs. A block list reads as the flow list `[a, b]`. */
export function parseFrontmatterFields(yaml: string): FrontmatterField[] {
  const fields: FrontmatterField[] = [];
  const lines = yaml.split(/\r?\n/);
  lines.forEach((line, at) => {
    if (!line.trim() || line.trimStart().startsWith("#")) return;
    if (/^\s/.test(line)) return;
    const i = line.indexOf(":");
    if (i <= 0) return;
    const key = line.slice(0, i).trim();
    if (!/^[A-Za-z_][\w-]*$/.test(key)) return;
    const value = line.slice(i + 1).trim();
    fields.push({ key, value: value || blockListValue(lines, at + 1) });
  });
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
