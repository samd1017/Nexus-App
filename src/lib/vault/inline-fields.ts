/**
 * Dataview-style inline fields in a note body: a `Key:: value` line (also after a
 * list marker, a task box, or `>`), and `[key:: value]` or `(key:: value)` anywhere
 * in a line. Fenced code and inline code are skipped. A key written more than once
 * reads as a list, the way Dataview reads it.
 */

import { flowItem, splitFrontmatter } from "@/lib/editor/frontmatter";

const MAX_KEY = 64;
const FULL_LINE = /^\s*(?:>\s*)*(?:(?:[-*+]|\d+[.)])\s+(?:\[.\]\s+)?)?([^\s:[\]()][^:[\]()]*?)::(?:\s+|$)(.*)$/;
const BRACKET_KEY = /^\s*([^:[\]()\s][^:[\]()]*?)::/;

function cleanKey(raw: string): string | null {
  const key = raw.replace(/^[*_~\s]+|[*_~\s]+$/g, "").trim();
  if (!key || key.length > MAX_KEY || key.startsWith("#") || !/[\p{L}\p{N}]/u.test(key)) return null;
  return key;
}

function bracketed(line: string, out: [string, string][]): boolean {
  let found = false;
  for (let i = 0; i < line.length; i += 1) {
    const open = line[i];
    if (open !== "[" && open !== "(") continue;
    const head = BRACKET_KEY.exec(line.slice(i + 1));
    if (!head) continue;
    const close = open === "[" ? "]" : ")";
    let depth = 0;
    let j = i + 1 + head[0].length;
    for (; j < line.length; j += 1) {
      const c = line[j];
      if (c === "[" || c === "(") depth += 1;
      else if (c === "]" || c === ")") {
        if (depth === 0) break;
        depth -= 1;
      }
    }
    if (line[j] !== close) continue;
    const key = cleanKey(head[1] ?? "");
    if (key) {
      out.push([key, line.slice(i + 1 + head[0].length, j).trim()]);
      found = true;
    }
    i = j;
  }
  return found;
}

/** Inline fields of a note body (no frontmatter), one string per key as written. */
export function inlineFields(body: string): Record<string, string> {
  if (!body || !body.includes("::")) return {};
  const pairs: [string, string][] = [];
  let fence: string | null = null;
  for (const raw of body.split(/\r?\n/)) {
    const marker = /^\s*(`{3,}|~{3,})/.exec(raw)?.[1];
    if (fence) {
      if (marker && marker[0] === fence[0] && marker.length >= fence.length) fence = null;
      continue;
    }
    if (marker) {
      fence = marker;
      continue;
    }
    if (!raw.includes("::")) continue;
    const line = raw.replace(/`[^`]*`/g, (code) => " ".repeat(code.length));
    if (bracketed(line, pairs)) continue;
    const full = FULL_LINE.exec(line);
    const key = full ? cleanKey(full[1] ?? "") : null;
    if (key) pairs.push([key, (full?.[2] ?? "").trim()]);
  }
  const values = new Map<string, { key: string; items: string[] }>();
  for (const [key, value] of pairs) {
    if (!value) continue;
    const slot = values.get(key.toLowerCase());
    if (slot) slot.items.push(value);
    else values.set(key.toLowerCase(), { key, items: [value] });
  }
  const out: Record<string, string> = {};
  for (const { key, items } of values.values()) {
    out[key] = items.length === 1 ? items[0]! : `[${items.map(flowItem).join(", ")}]`;
  }
  return out;
}

/** Inline fields added under frontmatter keys; frontmatter wins when both set a key. */
export function withInlineFields(frontmatter: Record<string, string>, content: string): Record<string, string> {
  if (!content.includes("::")) return frontmatter;
  const inline = inlineFields(splitFrontmatter(content).body);
  const keys = Object.keys(inline);
  if (!keys.length) return frontmatter;
  const taken = new Set(Object.keys(frontmatter).map((key) => key.toLowerCase()));
  const out = { ...frontmatter };
  for (const key of keys) if (!taken.has(key.toLowerCase())) out[key] = inline[key]!;
  return out;
}
