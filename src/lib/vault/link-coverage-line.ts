export type LinkCoverageCounts = { scanned: number; total: number; complete: boolean };

/**
 * The line backlinks and tags show while not every note has had its links
 * read, so an empty or short list is not taken for the whole vault. Null once
 * every note has been read (or there is nothing to say).
 */
export function linkCoverageLine(
  coverage: LinkCoverageCounts | null,
  what: "Links" | "Tags",
): string | null {
  if (!coverage || coverage.complete || coverage.total <= 0) return null;
  const scanned = Math.min(coverage.scanned, coverage.total);
  return `${what} read in ${scanned.toLocaleString("en-US")} of ${coverage.total.toLocaleString("en-US")} notes so far. More may appear.`;
}
