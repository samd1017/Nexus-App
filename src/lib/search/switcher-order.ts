/**
 * Quick-switcher results: title-index hits first, in the order the index gave
 * them ("Topic 15", "Topic 150"…), then the ranked search's other hits. The
 * ranking may order only what the titles missed.
 */
export function switcherHits<T extends { noteId: string }>(
  titles: T[],
  ranked: T[],
  limit: number,
  rank?: (extra: T[]) => T[],
): T[] {
  const seen = new Set(titles.map((hit) => hit.noteId));
  const extra = ranked.filter((hit) => !seen.has(hit.noteId));
  const ordered = rank && extra.length > 0 ? rank(extra) : extra;
  return [...titles, ...ordered].slice(0, limit);
}
