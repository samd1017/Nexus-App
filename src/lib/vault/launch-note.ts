/** An empty vault stays empty so the first-run line can tell you what to do. */
export function shouldSkipLaunchNote(noteCount: number): boolean {
  return noteCount <= 0;
}
