/**
 * Wave B/C — shared policy for when to full-rescan vs path-patch.
 * Old cliffs (40 changes / ±15 notes) caused full walks on normal agent bursts.
 *
 * PATH_PATCH_MAX matters most for notify-only path lists (incomplete discovery).
 * After a full signature walk, path-patch is preferred for all !structural
 * change sets (tree merge is O(k) even when k is moderate).
 */

/** Absolute floor before considering fractional full rescan */
export const FULL_RESCAN_MIN_CHANGES = 500;
/** Fraction of vault size that must change before full meta walk */
export const FULL_RESCAN_FRACTION = 0.12;
/** Absolute floor for note-count delta → structural */
export const COUNT_DELTA_MIN = 80;
/** Fraction of vault for note-count delta → structural */
export const COUNT_DELTA_FRACTION = 0.05;
/**
 * Native notify: above this path count, prefer signature incremental
 * over pure path-patch (but still not full body walk).
 */
export const PATH_PATCH_MAX = 400;

export function shouldFullStructuralRescan(
  changedCount: number,
  prevNoteCount: number,
  nextNoteCount: number,
): boolean {
  if (nextNoteCount === 0 && prevNoteCount > 0) return true;
  if (prevNoteCount === 0 && nextNoteCount > 0 && nextNoteCount > 2000) {
    // First watch tick with huge vault — use full meta scan once
    return true;
  }
  const size = Math.max(prevNoteCount, nextNoteCount, 1);
  const countDelta = Math.abs(nextNoteCount - prevNoteCount);
  if (countDelta > Math.max(COUNT_DELTA_MIN, Math.floor(size * COUNT_DELTA_FRACTION))) {
    return true;
  }
  if (
    changedCount >
    Math.max(FULL_RESCAN_MIN_CHANGES, Math.floor(size * FULL_RESCAN_FRACTION))
  ) {
    return true;
  }
  return false;
}

/** Prefer path-patch for small native notify batches */
export function shouldPathPatchOnly(pathCount: number): boolean {
  return pathCount > 0 && pathCount <= PATH_PATCH_MAX;
}

/**
 * Wave C: after a full signature walk (or known complete path set),
 * path-patch the tree when not structural and within PATH_PATCH_MAX.
 */
export function canPathPatchTree(
  changedCount: number,
  prevNoteCount: number,
  nextNoteCount: number,
): boolean {
  if (changedCount <= 0) return false;
  if (shouldFullStructuralRescan(changedCount, prevNoteCount, nextNoteCount)) {
    return false;
  }
  return shouldPathPatchOnly(changedCount);
}
