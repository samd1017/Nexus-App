/**
 * Insert `[[` into the focused note editor so the wikilink suggest menu opens.
 * Chord is Cmd/Ctrl+Shift+L so the browser can keep Cmd+L for the URL bar.
 */

export type InsertWikilinkHandler = (focusedOnly: boolean) => boolean;

const handlers = new Set<InsertWikilinkHandler>();

export function registerInsertWikilink(
  handler: InsertWikilinkHandler,
): () => void {
  handlers.add(handler);
  return () => {
    handlers.delete(handler);
  };
}

export function requestInsertWikilink(): boolean {
  for (const h of handlers) {
    if (h(true)) return true;
  }
  for (const h of handlers) {
    if (h(false)) return true;
  }
  return false;
}
