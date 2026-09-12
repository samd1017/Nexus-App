/**
 * Map flat-text find ranges back into a ProseMirror document.
 */

import type { Node as PmNode } from "@tiptap/pm/model";
import type { FindMatch } from "@/lib/editor/find-target";
import { collectPlainMatches } from "@/lib/editor/find-target";

type CharMap = { flat: string; map: number[] };

function buildCharMap(doc: PmNode): CharMap {
  let flat = "";
  const map: number[] = [];
  doc.descendants((node, pos) => {
    if (node.isText && node.text) {
      for (let i = 0; i < node.text.length; i++) {
        map.push(pos + i);
        flat += node.text[i]!;
      }
    }
  });
  return { flat, map };
}

export function findMatchesInPmDoc(
  doc: PmNode,
  query: string,
): FindMatch[] {
  const { flat, map } = buildCharMap(doc);
  const plain = collectPlainMatches(flat, query);
  const out: FindMatch[] = [];
  for (const m of plain) {
    const start = map[m.from];
    const endChar = map[m.to - 1];
    if (start == null || endChar == null || start < 0 || endChar < 0) continue;
    out.push({ from: start, to: endChar + 1 });
  }
  return out;
}
