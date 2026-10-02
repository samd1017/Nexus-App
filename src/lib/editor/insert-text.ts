/**
 * Type plain text at the caret of the editor showing a note, replacing any
 * selection, as if the user had typed it.
 */

export type InsertTextHandler = (noteId: string, text: string) => boolean;

const handlers = new Set<InsertTextHandler>();

export function registerInsertText(handler: InsertTextHandler): () => void {
  handlers.add(handler);
  return () => {
    handlers.delete(handler);
  };
}

/** False when no editor has that note open (reading view, closed pane). */
export function requestInsertText(noteId: string, text: string): boolean {
  for (const h of handlers) {
    if (h(noteId, text)) return true;
  }
  return false;
}
