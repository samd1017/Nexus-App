/**
 * Heading / block-id slices for [[Note#Heading]] navigation and ![[Note#…]] embeds.
 * Block ids follow Obsidian: a paragraph ending with `^block-id`.
 */

export function headingSlug(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\p{L}\p{N}\s-]/gu, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
}

export function headingsMatch(a: string, b: string): boolean {
  const x = a.trim().toLowerCase();
  const y = b.trim().toLowerCase();
  if (!x || !y) return false;
  if (x === y || x.startsWith(y) || y.startsWith(x)) return true;
  const sx = headingSlug(a);
  const sy = headingSlug(b);
  return Boolean(sx && sy && (sx === sy || sx.startsWith(sy) || sy.startsWith(sx)));
}

export function extractOutlinePositions(
  md: string,
): { level: number; text: string; pos: number }[] {
  const lines = (md || "").split("\n");
  const out: { level: number; text: string; pos: number }[] = [];
  let pos = 0;
  let inFence = false;
  for (const line of lines) {
    if (line.trimStart().startsWith("```")) inFence = !inFence;
    if (!inFence) {
      const m = /^(#{1,6})\s+(.+)$/.exec(line);
      if (m) out.push({ level: m[1].length, text: m[2].trim(), pos });
    }
    pos += line.length + 1;
  }
  return out;
}

export function sliceMarkdownByHeading(
  md: string,
  heading: string,
): string | null {
  const needle = heading.trim();
  if (!needle) return null;
  const outline = extractOutlinePositions(md);
  const hit = outline.find((h) => headingsMatch(h.text, needle));
  if (!hit) return null;
  const next = outline.find((h) => h.pos > hit.pos && h.level <= hit.level);
  const end = next ? next.pos : md.length;
  return md.slice(hit.pos, end).replace(/\s+$/, "") + "\n";
}

export function normalizeBlockId(id: string): string {
  return id.trim().replace(/^\^/, "");
}

export function sliceMarkdownByBlockId(
  md: string,
  blockId: string,
): string | null {
  const id = normalizeBlockId(blockId);
  if (!id) return null;
  const lines = (md || "").split("\n");
  const idx = lines.findIndex((line) => {
    const m = /\s*\^([A-Za-z0-9_-]+)\s*$/.exec(line);
    return Boolean(m && m[1] === id);
  });
  if (idx < 0) return null;
  const line = lines[idx];
  const listMatch = /^(\s*)(?:[-*+]|\d+\.)\s+/.exec(line);
  if (listMatch) {
    const indent = listMatch[1].length;
    let end = idx;
    while (end + 1 < lines.length) {
      const next = lines[end + 1];
      if (!next.trim()) break;
      const nextList = /^(\s*)(?:[-*+]|\d+\.)\s+/.exec(next);
      const nextIndent = nextList
        ? nextList[1].length
        : (/^(\s+)/.exec(next)?.[1].length ?? 0);
      if (nextIndent <= indent) break;
      end += 1;
    }
    return lines.slice(idx, end + 1).join("\n") + "\n";
  }
  let start = idx;
  while (start > 0 && lines[start - 1].trim() !== "") start -= 1;
  let end = idx;
  while (end + 1 < lines.length && lines[end + 1].trim() !== "") end += 1;
  return lines.slice(start, end + 1).join("\n") + "\n";
}

/** Slice a note body for an embed; falls back to the full note. */
export function sliceEmbedBody(
  md: string,
  heading: string | null,
  blockId: string | null,
): { body: string; sliced: boolean } {
  if (blockId) {
    const hit = sliceMarkdownByBlockId(md, blockId);
    if (hit) return { body: hit, sliced: true };
  }
  if (heading) {
    const hit = sliceMarkdownByHeading(md, heading);
    if (hit) return { body: hit, sliced: true };
  }
  return { body: md, sliced: false };
}
