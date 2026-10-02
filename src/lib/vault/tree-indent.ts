/**
 * File list indentation. Full steps for the first levels, shorter ones below,
 * and never so deep that a row loses its name: whatever the depth, a row keeps
 * TREE_ROW_ROOM_PX for chevron, icon, a readable name and the empty-folder line.
 */

export const TREE_INDENT_BASE_PX = 8;
export const TREE_INDENT_STEP_PX = 14;
export const TREE_INDENT_DEEP_STEP_PX = 8;
export const TREE_INDENT_FULL_LEVELS = 3;
export const TREE_ROW_ROOM_PX = 172;

export function treeIndentPx(depth: number): number {
  const d = Math.max(0, Math.floor(depth));
  const full = Math.min(d, TREE_INDENT_FULL_LEVELS);
  const deep = Math.max(0, d - TREE_INDENT_FULL_LEVELS);
  return TREE_INDENT_BASE_PX + full * TREE_INDENT_STEP_PX + deep * TREE_INDENT_DEEP_STEP_PX;
}

/** Left padding for a row. `100%` is the list width, so a narrow list caps it. */
export function treeIndentCss(depth: number): string {
  const px = treeIndentPx(depth);
  if (px <= TREE_INDENT_BASE_PX) return `${TREE_INDENT_BASE_PX}px`;
  return `max(${TREE_INDENT_BASE_PX}px, min(${px}px, calc(100% - ${TREE_ROW_ROOM_PX}px)))`;
}

/** The nesting guide sits under the parent row's chevron. */
export function treeGuideCss(depth: number): string | undefined {
  if (depth <= 0) return undefined;
  return `calc(${treeIndentCss(depth - 1)} + 7px)`;
}
