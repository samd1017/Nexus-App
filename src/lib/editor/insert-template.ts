/**
 * Insert a rendered template at the caret of the editor showing a note.
 * Properties in the template's frontmatter are merged into the note's.
 */

export type InsertTemplateHandler = (noteId: string, rendered: string) => boolean;

const handlers = new Set<InsertTemplateHandler>();

export function registerInsertTemplate(handler: InsertTemplateHandler): () => void {
  handlers.add(handler);
  return () => {
    handlers.delete(handler);
  };
}

/** False when no editor has that note open (reading view, closed pane). */
export function requestInsertTemplate(noteId: string, rendered: string): boolean {
  for (const h of handlers) {
    if (h(noteId, rendered)) return true;
  }
  return false;
}
