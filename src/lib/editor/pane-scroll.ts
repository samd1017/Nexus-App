/** Scroll position for an open tab, so switching notes comes back to the same place. */

const scrollTops = new Map<string, number>();

function key(pane: string, noteId: string): string {
  return `${pane}\n${noteId}`;
}

export function rememberPaneScroll(pane: string, noteId: string, top: number): void {
  if (!pane || !noteId) return;
  const y = Number.isFinite(top) ? Math.max(0, top) : 0;
  scrollTops.set(key(pane, noteId), y);
}

export function recallPaneScroll(pane: string, noteId: string): number {
  if (!pane || !noteId) return 0;
  return scrollTops.get(key(pane, noteId)) ?? 0;
}

export function clearPaneScroll(): void {
  scrollTops.clear();
}
