import { useEffect, useState } from "react";
import { fetchShellLinkCoverage, type ShellLinkCoverage } from "@/lib/vault/shell-catalog";

export { linkCoverageLine } from "@/lib/vault/link-coverage-line";

/** How often the panels ask while links are still being read. */
export const LINK_COVERAGE_POLL_MS = 2500;

/** Coverage for a paged desktop vault, asked again until every note is read. */
export function useLinkCoverage(dbPath: string | null, enabled: boolean): ShellLinkCoverage | null {
  const [coverage, setCoverage] = useState<ShellLinkCoverage | null>(null);
  useEffect(() => {
    setCoverage(null);
    if (!dbPath || !enabled) return;
    let cancelled = false;
    let timer = 0;
    const ask = () => {
      void fetchShellLinkCoverage(dbPath).then((next) => {
        if (cancelled) return;
        setCoverage(next);
        if (next && !next.complete) timer = window.setTimeout(ask, LINK_COVERAGE_POLL_MS);
      });
    };
    ask();
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [dbPath, enabled]);
  return coverage;
}
